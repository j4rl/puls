<?php
declare(strict_types=1);
require __DIR__.'/includes/bootstrap.php';
require __DIR__.'/includes/question-sets.php';
require __DIR__.'/includes/set-design.php';
require __DIR__.'/includes/saved-items.php';
$action = $_GET['action'] ?? 'bootstrap';
$code = $_GET['code'] ?? '';
if (!is_string($action) || !is_string($code)) respond(['error'=>'Ogiltig åtgärd eller frågekod.'],400);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method,['GET','POST'],true)) respond(['error'=>'Metoden stöds inte.'],405);
if (in_array($action,['bootstrap','list','question','results','set-image','question-image','saved-list','saved-get'],true) && $method !== 'GET') respond(['error'=>'Använd GET.'],405);
try {
    if ($action === 'create-set') create_question_set();
    if (in_array($action,['question','results','update','delete','answer','set-advance','set-design','set-image'],true)) {
        $membership=find_set_membership($code);
        if ($membership) {
            if ($membership['root_code'] !== $code) respond(['error'=>'Använd frågesetets gemensamma deltagarkod.'],404);
            if ($action==='set-image')serve_set_image($code,(int)$membership['set_id']);
            handle_question_set($action,$code,(int)$membership['set_id']);
        }
    }
    if ($action === 'bootstrap') {
        database();
        owner_hash(); voter_hash();
        respond(['csrf'=>$csrf,'baseUrl'=>$baseUrl,'maxAnswers'=>max(1,min(5000,(int)($config['max_answers']??5000))),'user'=>public_user(current_user())]);
    }
    if ($action === 'saved-list') { saved_items(); }
    if ($action === 'saved-get') { respond(saved_item_payload(saved_item_id())); }
    if ($action === 'save') { save_item(require_write(5242880)); }
    if ($action === 'save-edit') { save_item(require_write(5242880),saved_item_id()); }
    if ($action === 'activate') { require_write();activate_item(saved_item_id()); }
    if ($action === 'saved-from-run') { require_write();save_item_from_run($code); }
    if ($action === 'register') register_user(require_write());
    if ($action === 'login') login_user(require_write());
    if ($action === 'logout') {
        require_write();
        authenticate_user(null);
        auth_response(null);
    }
    if ($action === 'preferences') {
        $p = require_write();
        $user = require_user('Logga in för att spara ett eget tema.');
        if (!array_key_exists('theme',$p)) throw new InvalidArgumentException('Ange ett tema eller återställ till standard.');
        $theme = validate_theme($p['theme']);
        $json = $theme === null ? null : json_encode($theme,JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        query('UPDATE puls_users SET theme_json=? WHERE id=?','si',[$json,(int)$user['id']]);
        $user['theme_json'] = $json;
        auth_response($user);
    }
    if ($action === 'list') {
        $user = require_user('Logga in för att se dina frågor.');
        respond(['questions'=>question_run_summaries($user['owner_hash'])]);
    }
    if ($action === 'create') {
        create_live_item('question',require_write(5242880));
    }
    if ($action === 'question') {
        $q=find_question($code);
        $row=query('SELECT id FROM puls_answers WHERE question_id=? AND voter_hash=?','is',[(int)$q['id'],voter_hash()])->get_result()->fetch_assoc();
        respond(['question'=>array_merge(public_question($q),['design'=>public_question_design((int)$q['id'],$code)]),'answered'=>(bool)$row]);
    }
    if ($action === 'results') {
        $q=find_question($code);require_owner($q);
        $since=filter_var($_GET['since']??0,FILTER_VALIDATE_INT,['options'=>['min_range'=>0]]);
        if ($since === false) respond(['error'=>'Ogiltigt svars-ID.'],400);
        $rows=query('SELECT id,value_json FROM puls_answers WHERE question_id=? AND id>? ORDER BY id ASC LIMIT 5000','ii',[(int)$q['id'],$since])->get_result()->fetch_all(MYSQLI_ASSOC);
        $items=array_map(static function($r){return ['id'=>(int)$r['id'],'value'=>json_decode($r['value_json'],true)];},$rows);
        respond(['question'=>array_merge(public_question($q),['design'=>public_question_design((int)$q['id'],$code)]),'answers'=>$items]);
    }
    if ($action === 'question-design') {
        $p=require_write();$q=find_question($code);require_owner($q);save_question_design((int)$q['id'],validate_set_design($p,true));
        respond(['ok'=>true,'design'=>public_question_design((int)$q['id'],$code)]);
    }
    if ($action === 'question-image') {
        $q=find_question($code);serve_question_image($code,(int)$q['id']);
    }
    if ($action === 'update') {
        $p=require_write();$q=find_question($code);require_owner($q);
        if (isset($p['open']) && is_bool($p['open'])) query('UPDATE puls_questions SET is_open=? WHERE id=?','ii',[$p['open']?1:0,(int)$q['id']]);
        elseif (isset($p['view']) && is_string($p['view']) && in_array($p['view'],allowed_views()[$q['kind']],true)) query('UPDATE puls_questions SET result_view=? WHERE id=?','si',[$p['view'],(int)$q['id']]);
        else respond(['error'=>'Ogiltig ändring.'],400);
        respond(['ok'=>true]);
    }
    if ($action === 'delete') {
        require_write();
        $user=require_user('Logga in för att ta bort en fråga.');
        $q=find_question($code);
        if (!hash_equals($q['owner_hash'],$user['owner_hash'])) respond(['error'=>'Du kan bara ta bort dina egna frågor.'],403);
        $deleted=query('DELETE FROM puls_questions WHERE id=? AND owner_hash=?','is',[(int)$q['id'],$user['owner_hash']]);
        if ($deleted->affected_rows !== 1) respond(['error'=>'Frågan finns inte längre.'],404);
        respond(['ok'=>true]);
    }
    if ($action === 'answer') {
        $p=require_write();
        $db=database();$db->begin_transaction();
        try {
            $q=find_question($code,true);
            $existing=query('SELECT id FROM puls_answers WHERE question_id=? AND voter_hash=?','is',[(int)$q['id'],voter_hash()])->get_result()->fetch_assoc();
            if ($existing) {$db->commit();respond(['ok'=>true,'already'=>true]);}
            if (!(bool)$q['is_open']) {$db->rollback();respond(['error'=>'Frågan är pausad. Vänta tills den öppnas igen.'],409);}
            $value=validate_answer($q,$p['value']??null);
            $n=query('SELECT COUNT(*) AS n FROM puls_answers WHERE question_id=?','i',[(int)$q['id']])->get_result()->fetch_assoc();
            if ((int)$n['n']>=max(1,min(5000,(int)($config['max_answers']??5000)))) {$db->rollback();respond(['error'=>'Frågan har nått sin svarsgräns.'],409);}
            query('INSERT INTO puls_answers (question_id,voter_hash,value_json) VALUES (?,?,?)','iss',[(int)$q['id'],voter_hash(),json_encode($value,JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
            $db->commit();respond(['ok'=>true],201);
        } catch(Throwable $e) {$db->rollback();throw $e;}
    }
    respond(['error'=>'Åtgärden finns inte.'],404);
} catch (InvalidArgumentException $e) {respond(['error'=>$e->getMessage()],400);}
