<?php
declare(strict_types=1);

function find_set_membership(string $code): ?array {
    return query('SELECT m.set_id,root.code AS root_code FROM questions q JOIN set_questions m ON m.question_id=q.id JOIN questions root ON root.id=m.set_id WHERE q.code=?','s',[$code])->get_result()->fetch_assoc() ?: null;
}

function create_question_set(): void {
    global $config;
    $data=require_write(5242880);
    $user=require_user('Logga in för att skapa ett frågeset.');
    $design=isset($data['design'])?validate_set_design($data['design']):null;
    $data=validate_question_set($data);
    rate_limit('create-ip',request_ip(),max(1,(int)($config['max_questions_per_ip_per_hour']??120)),3600);
    $db=database();$db->begin_transaction();
    try {
        // Serialize creation for this owner before checking the per-question quota.
        query('SELECT id FROM users WHERE id=? FOR UPDATE','i',[(int)$user['id']]);
        $count=query('SELECT COUNT(*) AS n FROM questions WHERE owner_hash=? AND created_at>DATE_SUB(NOW(),INTERVAL 1 HOUR)','s',[$user['owner_hash']])->get_result()->fetch_assoc();
        if ((int)$count['n']+count($data['questions'])>(int)($config['max_questions_per_hour']??30)) {
            $db->rollback();respond(['error'=>'För många nya frågor denna timme. Välj färre frågor eller försök senare.'],429);
        }
        $setId=0;$rootCode='';
        foreach ($data['questions'] as $position=>$p) {
            $id=0;
            for ($attempt=0;$attempt<8;$attempt++) {
                $newCode=(string)random_int(100000,999999);
                try {
                    query('INSERT INTO questions (code,owner_hash,title,kind,options_json,min_value,max_value,result_view) VALUES (?,?,?,?,?,?,?,?)','sssssdds',[$newCode,$user['owner_hash'],$p['title'],$p['kind'],json_encode($p['options'],JSON_UNESCAPED_UNICODE),$p['min'],$p['max'],$p['view']]);
                    $id=(int)$db->insert_id;break;
                } catch (mysqli_sql_exception $e) {if ($e->getCode()!==1062) throw $e;}
            }
            if (!$id) throw new RuntimeException('Kunde inte tilldela en frågekod.');
            if ($position===0) {
                $setId=$id;$rootCode=$newCode;
                query('INSERT INTO question_sets (id,title,progression) VALUES (?,?,?)','iss',[$setId,$data['title'],$data['progression']]);
            }
            query('INSERT INTO set_questions (set_id,question_id,position) VALUES (?,?,?)','iii',[$setId,$id,$position]);
        }
        if ($design!==null)save_set_design($setId,$design);
        $db->commit();respond(['code'=>$rootCode],201);
    } catch (Throwable $e) {$db->rollback();throw $e;}
}

function set_questions(int $id): array {
    return query('SELECT q.*,m.position FROM set_questions m JOIN questions q ON q.id=m.question_id WHERE m.set_id=? ORDER BY m.position','i',[$id])->get_result()->fetch_all(MYSQLI_ASSOC);
}

function public_set(array $set,array $questions,string $code): array {
    return ['code'=>$code,'title'=>$set['title'],'progression'=>$set['progression'],'current'=>(int)$set['current_position'],'total'=>count($questions),'open'=>(bool)$set['is_open'],'finished'=>(bool)$set['finished'],'currentQuestionId'=>(int)$questions[(int)$set['current_position']]['id'],'design'=>public_set_design((int)$set['id'],$code)];
}

function set_question_public(array $q,array $set,string $code): array {
    $result=public_question($q);
    $result['code']=$code;$result['id']=(int)$q['id'];$result['position']=(int)$q['position'];
    $result['open']=(bool)$set['is_open'] && !(bool)$set['finished'];
    return $result;
}

function set_answered_ids(int $id): array {
    $rows=query('SELECT a.question_id FROM answers a JOIN set_questions m ON m.question_id=a.question_id WHERE m.set_id=? AND a.voter_hash=?','is',[$id,voter_hash()])->get_result()->fetch_all(MYSQLI_ASSOC);
    return array_map('intval',array_column($rows,'question_id'));
}

function set_participant_question(array $set,array $questions,array $answered): ?array {
    if ((bool)$set['finished']) return null;
    if ($set['progression']==='host') return $questions[(int)$set['current_position']];
    foreach ($questions as $q) if (!in_array((int)$q['id'],$answered,true)) return $q;
    return null;
}

function handle_question_set(string $action,string $code,int $id): void {
    global $config;
    $write=in_array($action,['update','delete','answer','set-advance','set-design'],true);
    $data=$write?require_write($action==='set-design'?5242880:16384):[];
    $db=database();
    // Every set operation locks the root first, including reads, for a coherent state.
    $db->begin_transaction();
    try {
        $root=find_question($code,true);
        $set=query('SELECT * FROM question_sets WHERE id=?','i',[$id])->get_result()->fetch_assoc();
        if (!$set) {$db->rollback();respond(['error'=>'Frågesetet finns inte längre.'],404);}
        $questions=set_questions($id);
        $result=[];$status=200;
        if (in_array($action,['results','update','delete','set-advance','set-design'],true)) require_owner($root);
        if ($action==='set-design') {
            save_set_design($id,validate_set_design($data,true));
            $result=['ok'=>true,'design'=>public_set_design($id,$code)];
        } elseif ($action==='question') {
            $answered=set_answered_ids($id);
            $q=set_participant_question($set,$questions,$answered);
            $hasAnswer=$q && in_array((int)$q['id'],$answered,true);
            $complete=$q===null || ($hasAnswer && (int)$q['position']===count($questions)-1);
            $result=['set'=>public_set($set,$questions,$code),'question'=>$q?set_question_public($q,$set,$code):null,'answered'=>(bool)$hasAnswer,'waiting'=>$hasAnswer&&!$complete,'complete'=>$complete];
        } elseif ($action==='results') {
            $questionId=filter_var($_GET['questionId']??$questions[(int)$set['current_position']]['id'],FILTER_VALIDATE_INT);
            $selected=null;
            foreach ($questions as $q) if ((int)$q['id']===$questionId) $selected=$q;
            if (!$selected) throw new InvalidArgumentException('Frågan ingår inte i frågesetet.');
            $since=filter_var($_GET['since']??0,FILTER_VALIDATE_INT,['options'=>['min_range'=>0]]);
            if ($since===false) throw new InvalidArgumentException('Ogiltigt svars-ID.');
            $rows=query('SELECT id,value_json FROM answers WHERE question_id=? AND id>? ORDER BY id LIMIT 5000','ii',[$questionId,$since])->get_result()->fetch_all(MYSQLI_ASSOC);
            $counts=query('SELECT m.question_id,COUNT(a.id) AS n FROM set_questions m LEFT JOIN answers a ON a.question_id=m.question_id WHERE m.set_id=? GROUP BY m.question_id','i',[$id])->get_result()->fetch_all(MYSQLI_ASSOC);
            $counts=array_column($counts,'n','question_id');
            $result=['set'=>public_set($set,$questions,$code),'question'=>set_question_public($selected,$set,$code),'questions'=>array_map(static function($q) use ($counts){return ['id'=>(int)$q['id'],'title'=>$q['title'],'position'=>(int)$q['position'],'answerCount'=>(int)$counts[$q['id']]];},$questions),'answers'=>array_map(static function($r){return ['id'=>(int)$r['id'],'value'=>json_decode($r['value_json'],true)];},$rows)];
        } elseif ($action==='answer') {
            // Require the identity displayed in the form; never apply a stale answer to the next question.
            $questionId=$data['questionId']??null;$selected=null;
            foreach ($questions as $q) if ((int)$q['id']===$questionId) $selected=$q;
            if (!$selected) throw new InvalidArgumentException('Ange frågan som svaret hör till.');
            $answered=set_answered_ids($id);
            if (in_array($questionId,$answered,true)) $result=['ok'=>true,'already'=>true];
            else {
                $current=set_participant_question($set,$questions,$answered);
                if (!$current || (int)$current['id']!==$questionId) {$db->rollback();respond(['error'=>'Frågan är inte aktiv längre eller har inte öppnats ännu.'],409);}
                if (!(bool)$set['is_open']) {$db->rollback();respond(['error'=>'Frågesetet är pausat. Vänta tills det öppnas igen.'],409);}
                $value=validate_answer($selected,$data['value']??null);
                $count=query('SELECT COUNT(*) AS n FROM answers WHERE question_id=?','i',[$questionId])->get_result()->fetch_assoc();
                if ((int)$count['n']>=max(1,min(5000,(int)($config['max_answers']??5000)))) {$db->rollback();respond(['error'=>'Frågan har nått sin svarsgräns.'],409);}
                query('INSERT INTO answers (question_id,voter_hash,value_json) VALUES (?,?,?)','iss',[$questionId,voter_hash(),json_encode($value,JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
                $result=['ok'=>true];$status=201;
            }
        } elseif ($action==='update') {
            if (isset($data['open']) && is_bool($data['open']) && !(bool)$set['finished']) query('UPDATE question_sets SET is_open=? WHERE id=?','ii',[$data['open']?1:0,$id]);
            else {
                $selected=null;
                foreach ($questions as $q) if ((int)$q['id']===($data['questionId']??null)) $selected=$q;
                if (!$selected || !in_array($data['view']??null,allowed_views()[$selected['kind']],true)) throw new InvalidArgumentException('Ogiltig ändring.');
                query('UPDATE questions SET result_view=? WHERE id=?','si',[$data['view'],(int)$selected['id']]);
            }
            $result=['ok'=>true];
        } elseif ($action==='set-advance') {
            if ($set['progression']!=='host' || (bool)$set['finished'] || ($data['position']??null)!==(int)$set['current_position']) {$db->rollback();respond(['error'=>'Frågesetet har redan ändrats. Uppdatera vyn och försök igen.'],409);}
            if ((int)$set['current_position']+1<count($questions)) {
                $set['current_position']=(int)$set['current_position']+1;
                query('UPDATE question_sets SET current_position=? WHERE id=?','ii',[$set['current_position'],$id]);
            } else {
                $set['finished']=1;$set['is_open']=0;
                query('UPDATE question_sets SET finished=1,is_open=0 WHERE id=?','i',[$id]);
            }
            $result=['ok'=>true,'set'=>public_set($set,$questions,$code)];
        } elseif ($action==='delete') {
            $user=require_user('Logga in för att ta bort frågesetet.');
            if (!hash_equals($root['owner_hash'],$user['owner_hash'])) {$db->rollback();respond(['error'=>'Du kan bara ta bort dina egna frågeset.'],403);}
            $ids=array_map('intval',array_column($questions,'id'));
            query('DELETE FROM questions WHERE id IN ('.implode(',',array_fill(0,count($ids),'?')).')',str_repeat('i',count($ids)),$ids);
            $result=['ok'=>true];
        }
        $db->commit();respond($result,$status);
    } catch (Throwable $e) {$db->rollback();throw $e;}
}
