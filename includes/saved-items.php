<?php
declare(strict_types=1);

function saved_item_id(): int {
    $raw=$_GET['id']??null;
    if (!is_string($raw) || !preg_match('/^[1-9][0-9]*$/D',$raw)) throw new InvalidArgumentException('Ogiltigt ID för den sparade frågan.');
    $id=filter_var($raw,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
    if ($id===false) throw new InvalidArgumentException('Ogiltigt ID för den sparade frågan.');
    return $id;
}

// Saved payloads contain portable image data, never URLs tied to a previous run.
function saved_design_payload(array $design): array {
    $images=[];
    foreach ($design['images'] as $slot=>$image) $images[$slot]=$image===null?null:'data:'.$image['mime'].';base64,'.base64_encode($image['content']);
    return ['colors'=>$design['colors'],'images'=>$images];
}

function validate_saved_payload(string $type,array $raw): array {
    if (!in_array($type,['question','set'],true)) throw new InvalidArgumentException('Välj en fråga eller ett frågeset.');
    $payload=$type==='question'?validate_question($raw):validate_question_set($raw);
    if (isset($raw['design'])) $payload['design']=saved_design_payload(validate_set_design($raw['design']));
    if ($type==='set') {
        foreach ($raw['questions'] as $position=>$question) {
            if (isset($question['design'])) $payload['questions'][$position]['design']=saved_design_payload(validate_set_design($question['design']));
        }
    }
    return $payload;
}

function saved_payload_json(array $payload): string {
    $json=json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
    if (strlen($json)>5242880) throw new InvalidArgumentException('Den sparade frågan eller frågesetet är för stort.');
    return $json;
}

function save_item(array $data,?int $id=null): void {
    $user=require_user('Logga in för att spara en fråga eller ett frågeset.');
    $type=$data['type']??null;
    if (!is_string($type) || !in_array($type,['question','set'],true)) throw new InvalidArgumentException('Välj en fråga eller ett frågeset.');
    if (!is_array($data['payload']??null)) throw new InvalidArgumentException('Den sparade frågan saknar innehåll.');
    $payload=validate_saved_payload($type,$data['payload']);
    $json=saved_payload_json($payload);
    if ($id!==null) {
        $row=query('SELECT id FROM puls_saved_items WHERE id=? AND owner_hash=?','is',[$id,$user['owner_hash']])->get_result()->fetch_assoc();
        if (!$row) respond(['error'=>'Den sparade frågan eller frågesetet finns inte.'],404);
        query('UPDATE puls_saved_items SET item_type=?,title=?,data_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_hash=?','sssis',[$type,$payload['title'],$json,$id,$user['owner_hash']]);
        respond(['id'=>$id,'ok'=>true]);
    }
    query('INSERT INTO puls_saved_items (owner_hash,item_type,title,data_json) VALUES (?,?,?,?)','ssss',[$user['owner_hash'],$type,$payload['title'],$json]);
    respond(['id'=>(int)database()->insert_id],201);
}

function saved_items(): void {
    $user=require_user('Logga in för att se sparade frågor.');
    $rows=query("SELECT i.id,i.item_type,i.title,i.created_at,i.updated_at,IF(i.item_type='set',JSON_LENGTH(i.data_json,'$.questions'),1) AS question_count,(SELECT COUNT(*) FROM puls_saved_item_runs r WHERE r.saved_item_id=i.id) AS run_count FROM puls_saved_items i WHERE i.owner_hash=? ORDER BY i.updated_at DESC,i.id DESC",'s',[$user['owner_hash']])->get_result()->fetch_all(MYSQLI_ASSOC);
    respond(['items'=>array_map(static function($row){
        return ['id'=>(int)$row['id'],'type'=>$row['item_type'],'title'=>$row['title'],'created'=>$row['created_at'],'updated'=>$row['updated_at'],'questionCount'=>(int)$row['question_count'],'runCount'=>(int)$row['run_count']];
    },$rows)]);
}

// Shared by the legacy list and a saved item's history; only set roots are listed.
function question_run_summaries(string $owner,?int $savedId=null): array {
    $sql="SELECT q.code,COALESCE(s.title,q.title) AS title,IF(s.id IS NULL,q.kind,'set') AS kind,COALESCE(s.is_open,q.is_open) AS is_open,q.created_at,s.progression,COALESCE(s.finished,0) AS finished,IF(s.id IS NULL,1,(SELECT COUNT(*) FROM puls_set_questions m WHERE m.set_id=s.id)) AS question_count,IF(s.id IS NULL,(SELECT COUNT(*) FROM puls_answers a WHERE a.question_id=q.id),(SELECT COUNT(*) FROM puls_answers a JOIN puls_set_questions m ON m.question_id=a.question_id WHERE m.set_id=s.id)) AS answer_count,r.saved_item_id FROM puls_questions q LEFT JOIN puls_question_sets s ON s.id=q.id LEFT JOIN puls_set_questions member ON member.question_id=q.id LEFT JOIN puls_saved_item_runs r ON r.question_id=q.id WHERE q.owner_hash=? AND (member.set_id IS NULL OR member.set_id=q.id)";
    $types='s';$parameters=[$owner];
    if ($savedId!==null) {$sql.=' AND r.saved_item_id=?';$types.='i';$parameters[]=$savedId;}
    $sql.=' ORDER BY q.id DESC';
    $rows=query($sql,$types,$parameters)->get_result()->fetch_all(MYSQLI_ASSOC);
    foreach ($rows as &$row) {
        foreach (['is_open','finished','question_count','answer_count'] as $field) $row[$field]=(int)$row[$field];
        $row['saved_item_id']=$row['saved_item_id']===null?null:(int)$row['saved_item_id'];
    }
    unset($row);
    return $rows;
}

function saved_item_payload(int $id): array {
    $user=require_user('Logga in för att visa en sparad fråga.');
    $row=query('SELECT item_type,data_json FROM puls_saved_items WHERE id=? AND owner_hash=?','is',[$id,$user['owner_hash']])->get_result()->fetch_assoc();
    if (!$row) respond(['error'=>'Den sparade frågan eller frågesetet finns inte.'],404);
    return ['id'=>$id,'type'=>$row['item_type'],'payload'=>json_decode($row['data_json'],true,32,JSON_THROW_ON_ERROR),'runs'=>question_run_summaries($user['owner_hash'],$id)];
}

// Called inside the creation transaction, so quota reservations and the run commit together.
function reserve_question_creation(array $user,int $questionCount): void {
    global $config;
    query('SELECT id FROM puls_users WHERE id=? FOR UPDATE','i',[(int)$user['id']]);
    $count=query('SELECT COUNT(*) AS n FROM puls_questions WHERE owner_hash=? AND created_at>DATE_SUB(NOW(),INTERVAL 1 HOUR)','s',[$user['owner_hash']])->get_result()->fetch_assoc();
    if ((int)$count['n']+$questionCount>max(1,(int)($config['max_questions_per_hour']??30))) {
        database()->rollback();respond(['error'=>'För många nya frågor denna timme. Välj färre frågor eller försök senare.'],429);
    }
    $key=hash('sha256','create-ip'."\0".request_ip());
    query('INSERT INTO puls_auth_rate_limits (rate_key,attempts,reset_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 3600 SECOND)) ON DUPLICATE KEY UPDATE attempts=IF(reset_at<=UTC_TIMESTAMP(),VALUES(attempts),attempts+VALUES(attempts)),reset_at=IF(reset_at<=UTC_TIMESTAMP(),VALUES(reset_at),reset_at)','si',[$key,$questionCount]);
    $row=query('SELECT attempts,GREATEST(1,TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),reset_at)) AS retry_after FROM puls_auth_rate_limits WHERE rate_key=?','s',[$key])->get_result()->fetch_assoc();
    if ((int)$row['attempts']>max(1,(int)($config['max_questions_per_ip_per_hour']??120))) {
        database()->rollback();header('Retry-After: '.(int)$row['retry_after']);respond(['error'=>'För många nya frågor från samma nätverk. Försök igen om en stund.'],429);
    }
}

function insert_run_question(array $q,string $owner): array {
    for ($attempt=0;$attempt<8;$attempt++) {
        $code=(string)random_int(100000,999999);
        try {
            query('INSERT INTO puls_questions (code,owner_hash,title,kind,options_json,min_value,max_value,result_view) VALUES (?,?,?,?,?,?,?,?)','sssssdds',[$code,$owner,$q['title'],$q['kind'],json_encode($q['options'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$q['min'],$q['max'],$q['view']]);
        } catch (mysqli_sql_exception $e) {
            if ($e->getCode()!==1062) throw $e;
            continue;
        }
        $id=(int)database()->insert_id;
        if (isset($q['design'])) save_question_design($id,validate_set_design($q['design']));
        return ['id'=>$id,'code'=>$code];
    }
    throw new RuntimeException('Kunde inte skapa en ledig frågekod. Försök igen.');
}

function insert_question_run(string $type,array $data,string $owner): array {
    if ($type==='question') return insert_run_question($data,$owner);
    $root=null;
    foreach ($data['questions'] as $position=>$q) {
        $question=insert_run_question($q,$owner);
        if ($position===0) {
            $root=$question;
            query('INSERT INTO puls_question_sets (id,title,progression) VALUES (?,?,?)','iss',[$root['id'],$data['title'],$data['progression']]);
        }
        query('INSERT INTO puls_set_questions (set_id,question_id,position) VALUES (?,?,?)','iii',[$root['id'],$question['id'],$position]);
    }
    if ($root===null) throw new RuntimeException('Frågesetet saknar frågor.');
    if (isset($data['design'])) save_set_design($root['id'],validate_set_design($data['design']));
    return $root;
}

function create_live_item(string $type,array $raw): void {
    $user=require_user('Logga in för att skapa en fråga eller ett frågeset.');
    $data=validate_saved_payload($type,$raw);
    $db=database();$db->begin_transaction();
    try {
        reserve_question_creation($user,$type==='set'?count($data['questions']):1);
        $run=insert_question_run($type,$data,$user['owner_hash']);
        $db->commit();respond(['code'=>$run['code']],201);
    } catch (Throwable $e) {$db->rollback();throw $e;}
}

function activate_item(int $id): void {
    $user=require_user('Logga in för att aktivera en sparad fråga.');
    $db=database();$db->begin_transaction();
    try {
        query('SELECT id FROM puls_users WHERE id=? FOR UPDATE','i',[(int)$user['id']]);
        $row=query('SELECT item_type,data_json FROM puls_saved_items WHERE id=? AND owner_hash=? FOR UPDATE','is',[$id,$user['owner_hash']])->get_result()->fetch_assoc();
        if (!$row) {$db->rollback();respond(['error'=>'Den sparade frågan eller frågesetet finns inte.'],404);}
        $data=validate_saved_payload($row['item_type'],json_decode($row['data_json'],true,32,JSON_THROW_ON_ERROR));
        reserve_question_creation($user,$row['item_type']==='set'?count($data['questions']):1);
        $run=insert_question_run($row['item_type'],$data,$user['owner_hash']);
        query('INSERT INTO puls_saved_item_runs (saved_item_id,question_id) VALUES (?,?)','ii',[$id,$run['id']]);
        $db->commit();respond(['code'=>$run['code']],201);
    } catch (Throwable $e) {$db->rollback();throw $e;}
}

function run_design_payload(int $id,bool $isSet): ?array {
    $table=$isSet?'puls_set_designs':'puls_question_designs';
    $assetTable=$isSet?'puls_set_design_assets':'puls_question_design_assets';
    $idColumn=$isSet?'set_id':'question_id';
    $row=query('SELECT design_json FROM '.$table.' WHERE '.$idColumn.'=?','i',[$id])->get_result()->fetch_assoc();
    if (!$row) return null;
    $design=json_decode($row['design_json'],true,32,JSON_THROW_ON_ERROR);
    $design['images']=array_fill_keys(['background','foreground','logo'],null);
    $assets=query('SELECT slot,mime,content FROM '.$assetTable.' WHERE '.$idColumn.'=?','i',[$id])->get_result()->fetch_all(MYSQLI_ASSOC);
    foreach ($assets as $asset) $design['images'][$asset['slot']]='data:'.$asset['mime'].';base64,'.base64_encode($asset['content']);
    return $design;
}

function run_question_payload(array $q): array {
    $payload=validate_question(public_question($q));
    $design=run_design_payload((int)$q['id'],false);
    if ($design!==null) $payload['design']=$design;
    return $payload;
}

function save_item_from_run(string $code): void {
    $user=require_user('Logga in för att spara frågan eller frågesetet.');
    $db=database();$db->begin_transaction();
    try {
        query('SELECT id FROM puls_users WHERE id=? FOR UPDATE','i',[(int)$user['id']]);
        $root=find_question($code,true);
        if (!hash_equals($user['owner_hash'],$root['owner_hash'])) {$db->rollback();respond(['error'=>'Du kan bara spara dina egna frågor.'],403);}
        $membership=find_set_membership($code);
        if ($membership && $membership['root_code']!==$code) {$db->rollback();respond(['error'=>'Använd frågesetets gemensamma deltagarkod.'],400);}
        $linked=query('SELECT saved_item_id FROM puls_saved_item_runs WHERE question_id=?','i',[(int)$root['id']])->get_result()->fetch_assoc();
        if ($linked) {$db->commit();respond(['id'=>(int)$linked['saved_item_id'],'ok'=>true]);}
        $set=query('SELECT title,progression FROM puls_question_sets WHERE id=?','i',[(int)$root['id']])->get_result()->fetch_assoc();
        $type=$set?'set':'question';
        if ($set) {
            $payload=['title'=>$set['title'],'progression'=>$set['progression'],'questions'=>array_map('run_question_payload',set_questions((int)$root['id']))];
            $design=run_design_payload((int)$root['id'],true);
            if ($design!==null) $payload['design']=$design;
        } else $payload=run_question_payload($root);
        $json=saved_payload_json(validate_saved_payload($type,$payload));
        query('INSERT INTO puls_saved_items (owner_hash,item_type,title,data_json) VALUES (?,?,?,?)','ssss',[$user['owner_hash'],$type,$payload['title'],$json]);
        $id=(int)$db->insert_id;
        query('INSERT INTO puls_saved_item_runs (saved_item_id,question_id) VALUES (?,?)','ii',[$id,(int)$root['id']]);
        $db->commit();respond(['id'=>$id,'ok'=>true],201);
    } catch (Throwable $e) {$db->rollback();throw $e;}
}
