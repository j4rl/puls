import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// Uses a real local server and database, with records scoped to one disposable account.
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PULS_PLAYWRIGHT_PATH||'playwright');
const base=(process.env.PULS_TEST_URL||'http://localhost/puls/').replace(/\/?$/,'/');
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Only run this test against the local installation.');
const root=fileURLToPath(new URL('../',import.meta.url));
const php=process.env.PULS_PHP_PATH||(process.platform==='win32'?'C:/xampp/php/php.exe':'php');
const email=`puls-browser-saved-${randomBytes(12).toString('hex')}@example.test`,password=randomBytes(24).toString('hex');
const fixture=String.raw`
$p=json_decode(stream_get_contents(STDIN),true,32,JSON_THROW_ON_ERROR);
if(!preg_match('/^puls-browser-saved-[a-f0-9]{24}@example\.test$/D',$p['email']))throw new RuntimeException('Invalid fixture email');
$c=require 'config.php';mysqli_report(MYSQLI_REPORT_ERROR|MYSQLI_REPORT_STRICT);
$db=new mysqli($c['db_host'],$c['db_user'],$c['db_password'],$c['db_name'],(int)$c['db_port']);$db->set_charset('utf8mb4');
if($p['mode']==='seed'){
 $hash=password_hash($p['password'],PASSWORD_BCRYPT);$owner=bin2hex(random_bytes(32));$name='Webbläsartest sparade frågor';
 $s=$db->prepare('INSERT INTO puls_users (name,email,password_hash,owner_hash) VALUES (?,?,?,?)');$s->bind_param('ssss',$name,$p['email'],$hash,$owner);$s->execute();
}else{
 $s=$db->prepare('SELECT owner_hash FROM puls_users WHERE email=?');$s->bind_param('s',$p['email']);$s->execute();$user=$s->get_result()->fetch_assoc();
 if($user){
  foreach(['puls_questions','puls_saved_items'] as $table){$s=$db->prepare('DELETE FROM '.$table.' WHERE owner_hash=?');$s->bind_param('s',$user['owner_hash']);$s->execute();}
  $s=$db->prepare('DELETE FROM puls_users WHERE email=?');$s->bind_param('s',$p['email']);$s->execute();
 }
 $key=hash('sha256',"login-email\0".$p['email']);$s=$db->prepare('DELETE FROM puls_auth_rate_limits WHERE rate_key=?');$s->bind_param('s',$key);$s->execute();
}`;
const manage=mode=>execFileSync(php,['-r',fixture],{cwd:root,input:JSON.stringify({mode,email,password}),encoding:'utf8'});
let browser,owner,participant;
const errors=[],activations=[];
async function session(viewport={width:1400,height:1000}){
 const context=await browser.newContext({viewport});
 await context.route('https://ld.j4rl.se/**',route=>route.abort());
 const page=await context.newPage();page.setDefaultTimeout(12000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(new URL(request.url()).searchParams.get('action')==='activate')activations.push({method:request.method(),csrf:request.headers()['x-csrf-token'],body:request.postData()});});
 return {context,page};
}
async function get(action,query={}){
 const response=await owner.context.request.get(`${base}api.php?${new URLSearchParams({action,...query})}`);
 assert.equal(response.status(),200,await response.text());return response.json();
}
async function waitText(page,selector,text){await page.waitForFunction(({selector,text})=>document.querySelector(selector)?.textContent.includes(text),{selector,text});}
async function closeQuestion(page){await page.locator('[data-editor-save]').click();await page.locator('#question-editor-dialog').waitFor({state:'hidden'});}
async function selectKind(page,kind){await page.locator(`[name=kind][value=${kind}]`).check();await page.locator('#question-editor-dialog').waitFor({state:'visible'});}
async function save(page,expectedId){
 await page.locator('#publish').click();
 await page.waitForURL(url=>url.searchParams.has('edit')&&url.searchParams.has('saved'));
 await page.locator('#activate-saved:not([disabled])').waitFor();
 const id=new URL(page.url()).searchParams.get('edit');
 if(expectedId)assert.equal(id,expectedId,'Editing updates the same saved item.');
 return id;
}
async function activate(page,selector='#activate-saved'){
 await page.locator(selector).click();await page.waitForURL(/\?live=\d{6}$/);
 await page.locator('#response-count').waitFor({state:'attached'});return new URL(page.url()).searchParams.get('live');
}
async function edit(page,id){await page.goto(`${base}?edit=${id}`);await page.locator('#activate-saved:not([disabled])').waitFor();}
async function design(page,preset,{upload=false,remove=false}={}){
 await page.locator('.appearance-open').click();
 await page.locator('#builder-design-dialog').waitFor({state:'visible'});
 await page.locator('#builder-design-dialog [data-preset]').selectOption(preset);
 if(upload){
  const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=160;canvas.height=60;const context=canvas.getContext('2d');context.fillStyle='#276847';context.fillRect(0,0,160,60);context.fillStyle='white';context.font='bold 20px Arial';context.fillText('Puls test',30,37);return canvas.toDataURL('image/png').split(',')[1];});
  await page.locator('#builder-design-dialog [data-image=logo]').setInputFiles({name:'saved-item.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.locator('#builder-design-dialog [data-thumbnail=logo] img').waitFor();
 }
 if(remove)await page.locator('#builder-design-dialog [data-remove=logo]').click();
 await page.locator('#builder-design-dialog [data-design-close]').last().click();
}
async function checkDesign(page,primary,logo=true){
 await page.locator('.appearance-open').click();
 assert.equal(await page.locator('#builder-design-dialog [data-color=primary]').inputValue(),primary);
 assert.equal(await page.locator('#builder-design-dialog [data-thumbnail=logo] img').count(),logo?1:0);
 await page.locator('#builder-design-dialog [data-design-close]').last().click();
}
async function answer(page,value){await page.locator('[name=answer]').fill(value);await page.locator('#send-answer').click();}
async function history(page,id,codes){
 await edit(page,id);
 await page.waitForFunction(count=>document.querySelectorAll('#saved-history .questionrow').length===count,codes.length);
 for(const code of codes)assert.equal(await page.locator(`#saved-history a[href="?live=${code}"]`).count(),1);
 const saved=await get('saved-get',{id});
 assert.deepEqual(saved.runs.map(run=>run.code).sort(),[...codes].sort());
 return saved;
}

try{
 manage('seed');await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
 browser=await chromium.launch({headless:true,...(process.env.PULS_BROWSER_EXECUTABLE?{executablePath:process.env.PULS_BROWSER_EXECUTABLE}:{})});
 owner=await session();participant=await session({width:390,height:844});
 const bootstrap=await get('bootstrap');
 const login=await owner.context.request.post(`${base}api.php?action=login`,{headers:{'X-CSRF-Token':bootstrap.csrf},data:{email,password}});
 assert.equal(login.status(),200,await login.text());
 const page=owner.page;

 await page.goto(base);await selectKind(page,'number');
 await page.locator('#question-title').fill('Vilken nivå har du idag?');
 await page.locator('#min').fill('-5');await page.locator('#max').fill('20');await page.locator('#view').selectOption('bars');
 await closeQuestion(page);await design(page,'Skog',{upload:true});
 const questionId=await save(page);
 assert.equal((await get('list')).questions.length,0,'Saving a question does not start a run.');
 assert.equal((await get('saved-get',{id:questionId})).runs.length,0);
 await page.reload();await page.locator('#activate-saved:not([disabled])').waitFor();
 assert.equal(await page.locator('#question-title').inputValue(),'Vilken nivå har du idag?');
 assert.equal(await page.locator('[name=kind][value=number]').isChecked(),true);
 assert.equal(await page.locator('#min').inputValue(),'-5');assert.equal(await page.locator('#max').inputValue(),'20');
 assert.equal(await page.locator('#view').inputValue(),'bars');await checkDesign(page,'#276847');
 await page.goto(base);await page.locator(`.saved-edit[data-id="${questionId}"]`).click();
 await page.locator('#activate-saved:not([disabled])').waitFor();
 assert.equal(new URL(page.url()).searchParams.get('edit'),questionId);
 await page.goto(base);
 const firstQuestion=await activate(page,`.saved-activate[data-id="${questionId}"]`);
 await participant.page.goto(`${base}?join=${firstQuestion}`);await participant.page.locator('.set-logo').waitFor();
 await answer(participant.page,'7');await waitText(page,'#response-count','1 svar');
 const firstQuestionResult=await get('results',{code:firstQuestion});
 assert.deepEqual(firstQuestionResult.answers.map(answer=>answer.value),[7]);

 await edit(page,questionId);await page.locator('#question-edit').click();
 await page.locator('#question-title').fill('Vilken nivå har du nästa gång?');await page.locator('#max').fill('30');
 await closeQuestion(page);assert.equal(await page.locator('#activate-saved').isDisabled(),true,'Unsaved edits cannot silently activate an older draft.');
 await design(page,'Hav',{remove:true});await save(page,questionId);
 const oldQuestion=await get('results',{code:firstQuestion});
 assert.deepEqual(oldQuestion.question,firstQuestionResult.question,'Editing the saved question leaves the existing run unchanged.');
 assert.deepEqual(oldQuestion.answers,firstQuestionResult.answers);
 const secondQuestion=await activate(page);assert.notEqual(secondQuestion,firstQuestion);
 assert.deepEqual((await get('results',{code:secondQuestion})).answers,[],'New runs start with no answers.');
 await participant.page.goto(`${base}?join=${secondQuestion}`);
 await participant.page.getByRole('heading',{name:'Vilken nivå har du nästa gång?'}).waitFor();
 assert.equal(await participant.page.locator('.set-logo').count(),0);
 await answer(participant.page,'15');await waitText(page,'#response-count','1 svar');
 assert.deepEqual((await get('results',{code:secondQuestion})).answers.map(answer=>answer.value),[15]);
 const questionHistory=await history(page,questionId,[firstQuestion,secondQuestion]);
 assert.deepEqual(questionHistory.runs.map(run=>Number(run.answer_count)),[1,1]);
 await selectKind(page,'choice');
 await page.locator('.option-input').nth(0).fill('Pröva själv');await page.locator('.option-input').nth(1).fill('Samtala tillsammans');
 await page.locator('#add-option').click();await page.locator('.option-input').nth(2).fill('Läsa vidare');
 await page.locator('#view').selectOption('pie');await closeQuestion(page);await save(page,questionId);
 await page.reload();await page.locator('#activate-saved:not([disabled])').waitFor();
 assert.equal(await page.locator('[name=kind][value=choice]').isChecked(),true);
 assert.deepEqual(await page.locator('.option-input').evaluateAll(inputs=>inputs.map(input=>input.value)),['Pröva själv','Samtala tillsammans','Läsa vidare']);
 assert.equal(await page.locator('#view').inputValue(),'pie');
 assert.equal((await get('results',{code:secondQuestion})).question.kind,'number','Changing the saved question type preserves old run types.');

 await page.goto(base);await page.locator('#use-set').check();
 await page.locator('#set-title').fill('Veckans avstämning');await page.locator('#set-progression').selectOption('host');
 await selectKind(page,'number');await page.locator('#question-title').fill('Hur många idéer har du?');
 await page.locator('#min').fill('0');await page.locator('#max').fill('10');await closeQuestion(page);
 await page.locator('#set-add').click();await page.locator('[data-editor-cancel]').click();await selectKind(page,'sentence');
 await page.locator('#question-title').fill('Vad vill du testa?');await closeQuestion(page);
 await page.locator('#set-up').click();
 assert.deepEqual(await page.locator('#set-question-list li').allTextContents(),['1. Vad vill du testa?','2. Hur många idéer har du?']);
 await design(page,'Natt',{upload:true});
 const setId=await save(page);
 assert.equal((await get('list')).questions.length,2,'Saving a set creates no run or child questions.');
 await page.reload();await page.locator('#activate-saved:not([disabled])').waitFor();
 assert.equal(await page.locator('#use-set').isChecked(),true);
 assert.equal(await page.locator('#set-title').inputValue(),'Veckans avstämning');
 assert.equal(await page.locator('#set-progression').inputValue(),'host');
 assert.deepEqual(await page.locator('#set-question-list li').allTextContents(),['1. Vad vill du testa?','2. Hur många idéer har du?']);
 await checkDesign(page,'#b6adff');
 await page.locator('#set-question-list [data-index="1"]').click();
 assert.equal(await page.locator('#question-title').inputValue(),'Hur många idéer har du?');
 assert.equal(await page.locator('[name=kind][value=number]').isChecked(),true);await closeQuestion(page);
 // Merely selecting a different question does not change the saved content.
 assert.equal(await page.locator('#activate-saved').isDisabled(),false);
 const firstSet=await activate(page);
 const firstSetInitial=await get('results',{code:firstSet});
 assert.equal(firstSetInitial.set.progression,'host');assert.equal(firstSetInitial.set.title,'Veckans avstämning');
 await participant.page.goto(`${base}?join=${firstSet}`);
 await participant.page.getByRole('heading',{name:'Vad vill du testa?'}).waitFor();await participant.page.locator('.set-logo').waitFor();
 await answer(participant.page,'Första omgångens idé');await participant.page.locator('#set-waiting').waitFor();
 await page.locator('#set-next').click();
 await participant.page.getByRole('heading',{name:'Hur många idéer har du?'}).waitFor();
 await answer(participant.page,'4');await participant.page.getByRole('heading',{name:'Tack för dina svar!'}).waitFor();

 await edit(page,setId);await page.locator('#set-title').fill('Nästa veckas avstämning');
 await page.locator('#set-progression').selectOption('automatic');
 await page.locator('#question-edit').click();await page.locator('#question-title').fill('Vad vill du testa nästa vecka?');await closeQuestion(page);
 await design(page,'Hav',{remove:true});await save(page,setId);
 const oldSet=await get('results',{code:firstSet});
 assert.equal(oldSet.set.title,'Veckans avstämning');assert.equal(oldSet.set.progression,'host');
 assert.deepEqual(oldSet.set.design,firstSetInitial.set.design,'Editing saved set design does not change past runs.');
 assert.deepEqual(oldSet.questions.map(question=>question.title),['Vad vill du testa?','Hur många idéer har du?']);
 assert.deepEqual(oldSet.questions.map(question=>question.answerCount),[1,1]);
 const secondSet=await activate(page);assert.notEqual(secondSet,firstSet);
 const secondSetInitial=await get('results',{code:secondSet});
 assert.equal(secondSetInitial.set.progression,'automatic');
 assert.deepEqual(secondSetInitial.questions.map(question=>question.answerCount),[0,0]);
 assert.equal(await page.locator('#set-next').isVisible(),false);
 await participant.page.goto(`${base}?join=${secondSet}`);
 await participant.page.getByRole('heading',{name:'Vad vill du testa nästa vecka?'}).waitFor();
 assert.equal(await participant.page.locator('.set-logo').count(),0);
 await answer(participant.page,'Andra omgångens idé');await participant.page.getByRole('heading',{name:'Hur många idéer har du?'}).waitFor();
 await answer(participant.page,'6');await participant.page.getByRole('heading',{name:'Tack för dina svar!'}).waitFor();
 const setHistory=await history(page,setId,[firstSet,secondSet]);
 assert.deepEqual(setHistory.runs.map(run=>Number(run.answer_count)),[2,2]);
 for(const [code,expected] of [[firstSet,'Första omgångens idé'],[secondSet,'Andra omgångens idé']]){
  await page.locator(`#saved-history a[href="?live=${code}"]`).click();
  await page.locator('#set-result-question').waitFor();
  const firstOption=await page.locator('#set-result-question option').first().getAttribute('value');
  await page.locator('#set-result-question').selectOption(firstOption);await waitText(page,'#live-chart',expected);
  await edit(page,setId);
 }
 await page.setViewportSize({width:390,height:844});
 await page.reload();await page.locator('#activate-saved:not([disabled])').waitFor();
 assert.equal(await page.locator('#saved-history .questionrow').count(),2);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Saved item editing and history fit a mobile screen.');
 await page.screenshot({path:'test-results/saved-item-mobile.png',fullPage:true});
 await page.goto(base);await page.locator('#question-list .saved-row').first().waitFor();
 assert.equal(await page.locator('#question-list .saved-row').count(),2);
 assert.equal(await page.locator('#question-list .questionrow').count(),2,'Runs are grouped under their saved question/set.');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Saved item list fits a mobile screen.');
 const listed=await get('saved-list');assert.deepEqual(listed.items.map(item=>item.runCount),[2,2]);
 assert.equal(activations.length,4);
 for(const request of activations){assert.equal(request.method,'POST');assert.ok(request.csrf);assert.deepEqual(JSON.parse(request.body),{});}
 assert.deepEqual(errors,[]);
 console.log('PASS: real browser save without activation; edit/reload question and set fields, order and design; four POST activations; separate codes, answers and snapshots; grouped run history; mobile layouts.');
}finally{
 if(browser)await browser.close();manage('cleanup');
}
