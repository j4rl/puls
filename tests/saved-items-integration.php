<?php
declare(strict_types=1);
// Included by integration.php, using its HTTP helpers and a separate disposable account.
if (!isset($db,$prefix)) {fwrite(STDERR,"Kör tests/integration.php.\n");exit(1);}
$savedEmail=$prefix.'-saved@example.test';
$savedOwnerHash=bin2hex(random_bytes(32));
$savedPassword=bin2hex(random_bytes(24));
$savedPasswordHash=password_hash($savedPassword,PASSWORD_BCRYPT);
$savedName='Sparade frågor test';
$stmt=$db->prepare('INSERT INTO puls_users (name,email,password_hash,owner_hash) VALUES (?,?,?,?)');
$stmt->bind_param('ssss',$savedName,$savedEmail,$savedPasswordHash,$savedOwnerHash);$stmt->execute();
try {
    $savedOwner=client();request($savedOwner,'bootstrap');
    request($savedOwner,'login',['email'=>$savedEmail,'password'=>$savedPassword]);
    $savedVoter=client();request($savedVoter,'bootstrap');
    $png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j/pkAAAAASUVORK5CYII=';
    $design=['colors'=>['background'=>'#e8f0e9','surface'=>'#ffffff','text'=>'#173d2a','primary'=>'#276847'],'images'=>['logo'=>$png]];
    $question=['title'=>$prefix.' sparad fråga','kind'=>'choice','options'=>['Första','Andra'],'view'=>'bars','design'=>$design];
    $body=['type'=>'question','payload'=>$question];
    request($savedVoter,'save',$body,[],401);
    request($savedOwner,'save',$body,[],403,'invalid');
    request($savedOwner,'save',null,[],405);
    request($savedOwner,'saved-list',[],[],405);
    $id=request($savedOwner,'save',$body,[],201)['id'];
    check(request($savedOwner,'list')['questions']===[],'Saving a question creates no participant code or running instance');
    $saved=request($savedOwner,'saved-get',null,['id'=>$id]);
    check($saved['runs']===[] && $saved['payload']['design']['images']['logo']===$png,'Saved question keeps its design and starts with empty history');
    request($savedOwner,'saved-get',[],['id'=>$id],405);
    request($savedOwner,'saved-get',null,['id'=>'bad'],400);
    request($savedOwner,'saved-get',null,['id'=>[$id]],400);
    request($savedVoter,'saved-get',null,['id'=>$id],401);
    request($nonOwner,'saved-get',null,['id'=>$id],404);
    request($nonOwner,'save-edit',$body,['id'=>$id],404);
    request($savedOwner,'save-edit',$body,['id'=>$id],403,'invalid');
    request($savedOwner,'save-edit',['type'=>'question','payload'=>['title'=>'']],['id'=>$id],400);
    check(request($savedOwner,'saved-get',null,['id'=>$id])['payload']===$saved['payload'],'Invalid edits retain the saved question and its image');
    request($savedOwner,'activate',null,['id'=>$id],405);
    request($savedOwner,'activate',[],['id'=>$id],403,'invalid');
    request($savedVoter,'activate',[],['id'=>$id],401);
    request($nonOwner,'activate',[],['id'=>$id],404);
    check(request($savedOwner,'list')['questions']===[],'Rejected activation requests create no instance');
    $first=request($savedOwner,'activate',[],['id'=>$id],201)['code'];
    request($savedVoter,'answer',['value'=>'Första'],['code'=>$first],201);
    $question['title']=$prefix.' redigerad fråga';$question['options']=['Nytt','Annat'];
    $question['design']['colors']['primary']='#126a99';
    request($savedOwner,'save-edit',['type'=>'question','payload'=>$question],['id'=>$id]);
    $old=request($savedOwner,'results',null,['code'=>$first]);
    check($old['question']['title']===$body['payload']['title'] && $old['question']['options']===['Första','Andra'] && $old['answers'][0]['value']==='Första' && $old['question']['design']['colors']['primary']==='#276847','Editing saved content preserves the earlier question, design and answers');
    $second=request($savedOwner,'activate',[],['id'=>$id],201)['code'];
    check($first!==$second && !request($savedVoter,'question',null,['code'=>$second])['answered'],'Each activation gets a distinct code and lets the same browser answer again');
    request($savedVoter,'answer',['value'=>'Nytt'],['code'=>$second],201);
    $fresh=request($savedOwner,'results',null,['code'=>$second]);
    check($fresh['question']['title']===$question['title'] && $fresh['question']['options']===['Nytt','Annat'] && $fresh['answers'][0]['value']==='Nytt' && $fresh['question']['design']['colors']['primary']==='#126a99','New activation snapshots the edited content with separate answers');
    $history=request($savedOwner,'saved-get',null,['id'=>$id])['runs'];
    check(count($history)===2 && array_sum(array_column($history,'answer_count'))===2 && count(array_unique(array_column($history,'code')))===2,'History links both runs and their independent answer counts');
    $items=request($savedOwner,'saved-list')['items'];
    check(count($items)===1 && (int)$items[0]['runCount']===2,'One saved question groups multiple runs');
    check(count(array_filter(request($savedOwner,'list')['questions'],static fn($run)=>(int)$run['saved_item_id']===$id))===2,'Run list exposes the saved item relationship');

    $set=['title'=>$prefix.' sparat set','progression'=>'host','questions'=>[
        ['title'=>$prefix.' skala','kind'=>'scale','min'=>1,'max'=>5,'view'=>'bars'],
        ['title'=>$prefix.' matris','kind'=>'matrix','options'=>['rows'=>['A','B'],'columns'=>['Ja','Nej']],'view'=>'matrix']
    ],'design'=>$design];
    $setId=request($savedOwner,'save',['type'=>'set','payload'=>$set],[],201)['id'];
    check(count(request($savedOwner,'list')['questions'])===2,'Saving a set creates no live questions');
    $setFirst=request($savedOwner,'activate',[],['id'=>$setId],201)['code'];
    $setState=request($savedOwner,'results',null,['code'=>$setFirst]);
    request($savedVoter,'answer',['questionId'=>$setState['question']['id'],'value'=>4],['code'=>$setFirst],201);
    request($savedOwner,'set-advance',['position'=>0],['code'=>$setFirst]);
    $set['title']=$prefix.' ändrat set';$set['progression']='automatic';
    $set['questions']=array_reverse($set['questions']);
    request($savedOwner,'save-edit',['type'=>'set','payload'=>$set],['id'=>$setId]);
    $reloaded=request($savedOwner,'saved-get',null,['id'=>$setId])['payload'];
    check($reloaded['title']===$set['title'] && $reloaded['progression']==='automatic' && $reloaded['questions'][0]['kind']==='matrix' && $reloaded['design']['images']['logo']===$png,'Set edits preserve title, progression, question order, matrix options and images');
    $setSecond=request($savedOwner,'activate',[],['id'=>$setId],201)['code'];
    $setOld=request($savedOwner,'results',null,['code'=>$setFirst,'questionId'=>$setState['question']['id']]);
    $setNew=request($savedOwner,'results',null,['code'=>$setSecond]);
    check($setOld['set']['progression']==='host' && $setOld['set']['current']===1 && $setOld['question']['kind']==='scale' && $setOld['answers'][0]['value']===4,'Earlier set retains its order, progress and answers after editing');
    check($setNew['set']['progression']==='automatic' && $setNew['set']['current']===0 && $setNew['question']['kind']==='matrix' && $setNew['answers']===[] && $setNew['set']['design']['images']!==[],'Reactivating a set starts the edited snapshot with fresh progress and design');
    request($savedVoter,'answer',['questionId'=>$setNew['question']['id'],'value'=>['A'=>'Ja','B'=>'Nej']],['code'=>$setSecond],201);
    check(request($savedVoter,'question',null,['code'=>$setSecond])['question']['kind']==='scale','New set progresses independently from the earlier run');

    $legacy=request($savedOwner,'create',['title'=>$prefix.' äldre fråga','kind'=>'yesno','view'=>'pie','design'=>$design],[],201)['code'];
    request($savedVoter,'answer',['value'=>'Ja'],['code'=>$legacy],201);
    request($savedOwner,'saved-from-run',null,['code'=>$legacy],405);
    request($savedOwner,'saved-from-run',[],['code'=>$legacy],403,'invalid');
    request($nonOwner,'saved-from-run',[],['code'=>$legacy],403);
    $legacyId=request($savedOwner,'saved-from-run',[],['code'=>$legacy],201)['id'];
    check(request($savedOwner,'saved-from-run',[],['code'=>$legacy])['id']===$legacyId,'Importing an earlier run is idempotent');
    $legacySaved=request($savedOwner,'saved-get',null,['id'=>$legacyId]);
    check(count($legacySaved['runs'])===1 && (int)$legacySaved['runs'][0]['answer_count']===1 && $legacySaved['payload']['design']['images']['logo']===$png,'Earlier question becomes editable while retaining its original answers and image');
    $legacySet=request($savedOwner,'create-set',['title'=>$prefix.' äldre set','progression'=>'host','questions'=>$set['questions'],'design'=>$design],[],201)['code'];
    $legacySetId=request($savedOwner,'saved-from-run',[],['code'=>$legacySet],201)['id'];
    $legacySetSaved=request($savedOwner,'saved-get',null,['id'=>$legacySetId]);
    check($legacySetSaved['type']==='set' && count($legacySetSaved['payload']['questions'])===2 && $legacySetSaved['payload']['design']['images']['logo']===$png && count($legacySetSaved['runs'])===1,'Earlier set becomes an editable saved set with its original run');

    request($savedOwner,'delete',[],['code'=>$setFirst]);
    check(count(request($savedOwner,'saved-get',null,['id'=>$setId])['runs'])===1 && count(request($savedOwner,'results',null,['code'=>$setSecond])['questions'])===2,'Deleting one set run preserves its saved definition and other runs');
    request($savedOwner,'delete',[],['code'=>$first]);
    check(count(request($savedOwner,'saved-get',null,['id'=>$id])['runs'])===1 && count(request($savedOwner,'results',null,['code'=>$second])['answers'])===1,'Deleting one question run preserves the other run and its answers');

    // Fill this disposable owner's quota, leaving room for one question but not a two-question set.
    $stmt=$db->prepare('SELECT COUNT(*) AS n FROM puls_questions WHERE owner_hash=? AND created_at>DATE_SUB(NOW(),INTERVAL 1 HOUR)');
    $stmt->bind_param('s',$savedOwnerHash);$stmt->execute();$count=(int)$stmt->get_result()->fetch_assoc()['n'];
    $limit=(int)($config['max_questions_per_hour']??30);
    for($i=$count;$i<$limit-1;$i++) {
        $quotaTitle=$prefix.' quota';$quotaOptions='[]';
        for($attempt=0;$attempt<8;$attempt++) {
            $quotaCode=(string)random_int(100000,999999);
            try {$stmt=$db->prepare("INSERT INTO puls_questions (code,owner_hash,title,kind,options_json,result_view) VALUES (?,?,?,'word',?,'cloud')");$stmt->bind_param('ssss',$quotaCode,$savedOwnerHash,$quotaTitle,$quotaOptions);$stmt->execute();break;}
            catch(mysqli_sql_exception $e){if($e->getCode()!==1062)throw $e;}
        }
    }
    $before=request($savedOwner,'saved-get',null,['id'=>$setId])['runs'];
    request($savedOwner,'activate',[],['id'=>$setId],429);
    check(request($savedOwner,'saved-get',null,['id'=>$setId])['runs']===$before,'Set activation respects the per-question quota without creating a partial run');
    request($savedOwner,'save-edit',['type'=>'question','payload'=>$question],['id'=>$id]);
    check(true,'Saved content can still be edited when activation is rate-limited');
} finally {
    foreach(['puls_questions','puls_saved_items'] as $table) {$stmt=$db->prepare('DELETE FROM '.$table.' WHERE owner_hash=?');$stmt->bind_param('s',$savedOwnerHash);$stmt->execute();}
    $stmt=$db->prepare('DELETE FROM puls_users WHERE email=?');$stmt->bind_param('s',$savedEmail);$stmt->execute();
    $savedRateKey=hash('sha256',"login-email\0".$savedEmail);$stmt=$db->prepare('DELETE FROM puls_auth_rate_limits WHERE rate_key=?');$stmt->bind_param('s',$savedRateKey);$stmt->execute();
}
