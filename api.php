<?php
declare(strict_types=1);
require __DIR__.'/includes/bootstrap.php';
$action = $_GET['action'] ?? 'bootstrap';
$code = $_GET['code'] ?? '';
if (!is_string($action) || !is_string($code)) respond(['error'=>'Ogiltig åtgärd eller frågekod.'],400);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method,['GET','POST'],true)) respond(['error'=>'Metoden stöds inte.'],405);
if (in_array($action,['bootstrap','list','question','results'],true) && $method !== 'GET') respond(['error'=>'Använd GET.'],405);
try {
    if ($action === 'bootstrap') {
        database();
        owner_hash(); voter_hash();
        respond(['csrf'=>$csrf,'baseUrl'=>$baseUrl,'maxAnswers'=>max(1,min(5000,(int)($config['max_answers']??5000))),'user'=>public_user(current_user())]);
    }
    if ($action === 'register') register_user(require_write());
    if ($action === 'login') login_user(require_write());
    if ($action === 'logout') {
        require_write();
        authenticate_user(null);
        auth_response(null);
    }
    if ($action === 'preferences') {
        $p = require_write();
        $user = require_user();
        if (!array_key_exists('theme',$p)) throw new InvalidArgumentException('Ange ett tema eller återställ till standard.');
        $theme = validate_theme($p['theme']);
        $json = $theme === null ? null : json_encode($theme,JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        query('UPDATE users SET theme_json=? WHERE id=?','si',[$json,(int)$user['id']]);
        $user['theme_json'] = $json;
        auth_response($user);
    }
    if ($action === 'list') {
        $rows = query('SELECT q.code,q.title,q.kind,q.is_open,q.created_at,(SELECT COUNT(*) FROM answers a WHERE a.question_id=q.id) AS answer_count FROM questions q WHERE q.owner_hash=? ORDER BY q.id DESC LIMIT 50','s',[owner_hash()])->get_result()->fetch_all(MYSQLI_ASSOC);
        respond(['questions'=>$rows]);
    }
    if ($action === 'create') {
        $p = validate_question(require_write());
        rate_limit('create-ip',request_ip(),max(1,(int)($config['max_questions_per_ip_per_hour']??120)),3600);
        $owner = owner_hash();
        $count=query('SELECT COUNT(*) AS n FROM questions WHERE owner_hash=? AND created_at>DATE_SUB(NOW(),INTERVAL 1 HOUR)','s',[$owner])->get_result()->fetch_assoc();
        if ((int)$count['n'] >= (int)($config['max_questions_per_hour']??30)) respond(['error'=>'Du har skapat många frågor. Försök igen om en stund.'],429);
        for($attempt=0;$attempt<8;$attempt++) {
            $newCode=(string)random_int(100000,999999);
            try {
                query('INSERT INTO questions (code,owner_hash,title,kind,options_json,min_value,max_value,result_view) VALUES (?,?,?,?,?,?,?,?)','sssssdds',[$newCode,$owner,$p['title'],$p['kind'],json_encode($p['options'],JSON_UNESCAPED_UNICODE),$p['min'],$p['max'],$p['view']]);
                respond(['code'=>$newCode],201);
            } catch(mysqli_sql_exception $e) { if ($e->getCode() !== 1062) throw $e; }
        }
        respond(['error'=>'Kunde inte skapa en ledig kod. Försök igen.'],503);
    }
    if ($action === 'question') {
        $q=find_question($code);
        $row=query('SELECT id FROM answers WHERE question_id=? AND voter_hash=?','is',[(int)$q['id'],voter_hash()])->get_result()->fetch_assoc();
        respond(['question'=>public_question($q),'answered'=>(bool)$row]);
    }
    if ($action === 'results') {
        $q=find_question($code);require_owner($q);
        $since=filter_var($_GET['since']??0,FILTER_VALIDATE_INT,['options'=>['min_range'=>0]]);
        if ($since === false) respond(['error'=>'Ogiltigt svars-ID.'],400);
        $rows=query('SELECT id,value_json FROM answers WHERE question_id=? AND id>? ORDER BY id ASC LIMIT 5000','ii',[(int)$q['id'],$since])->get_result()->fetch_all(MYSQLI_ASSOC);
        $items=array_map(static function($r){return ['id'=>(int)$r['id'],'value'=>json_decode($r['value_json'],true)];},$rows);
        respond(['question'=>public_question($q),'answers'=>$items]);
    }
    if ($action === 'update') {
        $p=require_write();$q=find_question($code);require_owner($q);
        if (isset($p['open']) && is_bool($p['open'])) query('UPDATE questions SET is_open=? WHERE id=?','ii',[$p['open']?1:0,(int)$q['id']]);
        elseif (isset($p['view']) && is_string($p['view']) && in_array($p['view'],allowed_views()[$q['kind']],true)) query('UPDATE questions SET result_view=? WHERE id=?','si',[$p['view'],(int)$q['id']]);
        else respond(['error'=>'Ogiltig ändring.'],400);
        respond(['ok'=>true]);
    }
    if ($action === 'answer') {
        $p=require_write();
        $db=database();$db->begin_transaction();
        try {
            $q=find_question($code,true);
            $existing=query('SELECT id FROM answers WHERE question_id=? AND voter_hash=?','is',[(int)$q['id'],voter_hash()])->get_result()->fetch_assoc();
            if ($existing) {$db->commit();respond(['ok'=>true,'already'=>true]);}
            if (!(bool)$q['is_open']) {$db->rollback();respond(['error'=>'Frågan är pausad. Vänta tills den öppnas igen.'],409);}
            $value=validate_answer($q,$p['value']??null);
            $n=query('SELECT COUNT(*) AS n FROM answers WHERE question_id=?','i',[(int)$q['id']])->get_result()->fetch_assoc();
            if ((int)$n['n']>=max(1,min(5000,(int)($config['max_answers']??5000)))) {$db->rollback();respond(['error'=>'Frågan har nått sin svarsgräns.'],409);}
            query('INSERT INTO answers (question_id,voter_hash,value_json) VALUES (?,?,?)','iss',[(int)$q['id'],voter_hash(),json_encode($value,JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
            $db->commit();respond(['ok'=>true],201);
        } catch(Throwable $e) {$db->rollback();throw $e;}
    }
    respond(['error'=>'Åtgärden finns inte.'],404);
} catch (InvalidArgumentException $e) {respond(['error'=>$e->getMessage()],400);}
