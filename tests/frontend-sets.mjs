import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PULS_PLAYWRIGHT_PATH||'playwright');
const base=(process.env.PULS_TEST_URL||'http://localhost/puls/').replace(/\/?$/,'/');
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'This test only runs against the local installation.');
const root=fileURLToPath(new URL('../',import.meta.url));
const php=process.env.PULS_PHP_PATH||(process.platform==='win32'?'C:/xampp/php/php.exe':'php');
const email=`puls-browser-set-${randomBytes(12).toString('hex')}@example.test`,password=randomBytes(24).toString('hex');
// Only a generated test account and its own records are inserted/deleted.
const fixture=String.raw`
$p=json_decode(stream_get_contents(STDIN),true,32,JSON_THROW_ON_ERROR);
if(!preg_match('/^puls-browser-set-[a-f0-9]{24}@example\.test$/D',$p['email']))throw new RuntimeException('Invalid fixture email');
$c=require 'config.php';mysqli_report(MYSQLI_REPORT_ERROR|MYSQLI_REPORT_STRICT);
$db=new mysqli($c['db_host'],$c['db_user'],$c['db_password'],$c['db_name'],(int)$c['db_port']);$db->set_charset('utf8mb4');
if($p['mode']==='seed'){
 $hash=password_hash($p['password'],PASSWORD_BCRYPT);$owner=bin2hex(random_bytes(32));$name='Webbläsartest frågeset';
 $s=$db->prepare('INSERT INTO users (name,email,password_hash,owner_hash) VALUES (?,?,?,?)');$s->bind_param('ssss',$name,$p['email'],$hash,$owner);$s->execute();
}else{
 $s=$db->prepare('SELECT owner_hash FROM users WHERE email=?');$s->bind_param('s',$p['email']);$s->execute();$user=$s->get_result()->fetch_assoc();
 if($user){$s=$db->prepare('DELETE FROM questions WHERE owner_hash=?');$s->bind_param('s',$user['owner_hash']);$s->execute();$s=$db->prepare('DELETE FROM users WHERE email=?');$s->bind_param('s',$p['email']);$s->execute();}
 $key=hash('sha256',"login-email\0".$p['email']);$s=$db->prepare('DELETE FROM auth_rate_limits WHERE rate_key=?');$s->bind_param('s',$key);$s->execute();
}`;
const manage=mode=>execFileSync(php,['-r',fixture],{cwd:root,input:JSON.stringify({mode,email,password}),encoding:'utf8'});
let browser;
const errors=[];
async function context(viewport={width:1400,height:1000}){
 const result=await browser.newContext({viewport});
 await result.route('https://ld.j4rl.se/**',route=>route.abort());
 const page=await result.newPage();page.on('pageerror',error=>errors.push(error.message));
 return {context:result,page};
}
async function waitText(page,selector,text){await page.waitForFunction(({selector,text})=>document.querySelector(selector)?.textContent.includes(text),{selector,text});}
async function createSet(page,progression){
 await page.goto(base);await page.locator('#use-set').check();
 await page.locator('#set-title').fill(progression==='host'?'Gemensam avstämning':'Dagens reflektion');
 await page.locator('#set-progression').selectOption(progression);
 await page.locator('#question-title').fill('Hur känns det idag?');
 await page.locator('[name=kind][value=number]').check();
 await page.locator('#set-add').click();
 await page.locator('#question-title').fill('Vad tar du med dig?');
 await page.locator('[name=kind][value=sentence]').check();
 await page.locator('#set-up').click();
 assert.equal(await page.locator('#set-question-list li').first().textContent(),'1. Vad tar du med dig?');
 await page.locator('#set-down').click();
 await page.locator('#set-add').click();await page.locator('#set-remove').click();
 assert.equal(await page.locator('#set-question-list li').count(),2);
 await page.locator('[data-index="0"]').click();
 assert.equal(await page.locator('#question-title').inputValue(),'Hur känns det idag?');
 assert.equal(await page.locator('[name=kind][value=number]').isChecked(),true);
 if(progression==='automatic'){
  await page.locator('.set-design-editor summary').click();
  await page.locator('[data-preset]').selectOption('Skog');
  const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=240;canvas.height=80;const c=canvas.getContext('2d');c.fillStyle='#276847';c.fillRect(0,0,240,80);c.fillStyle='#ffffff';c.font='bold 25px Arial';c.fillText('PULS TEST',35,50);return canvas.toDataURL('image/png').split(',')[1];});
  for(const slot of ['background','foreground','logo']){
   await page.locator(`[data-image="${slot}"]`).setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
   await page.locator(`[data-thumbnail="${slot}"] img`).waitFor();
  }
  await page.screenshot({path:'test-results/set-builder.png',fullPage:true});
 }
 await page.locator('#publish').click();await page.waitForURL(/\?live=\d{6}$/);
 await page.locator('#set-result-question').waitFor();
 return new URL(page.url()).searchParams.get('live');
}
try{
 manage('seed');await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
 browser=await chromium.launch({headless:true,...(process.env.PULS_BROWSER_EXECUTABLE?{executablePath:process.env.PULS_BROWSER_EXECUTABLE}:{})});
 const owner=await context();
 const bootstrap=await (await owner.context.request.get(`${base}api.php?action=bootstrap`)).json();
 const login=await owner.context.request.post(`${base}api.php?action=login`,{headers:{'X-CSRF-Token':bootstrap.csrf},data:{email,password}});
 assert.equal(login.status(),200,await login.text());
 const autoCode=await createSet(owner.page,'automatic');
 assert.equal(await owner.page.locator('#set-next').isVisible(),false);
 const fast=await context({width:390,height:844}),slow=await context({width:390,height:844});
 await fast.page.goto(`${base}?join=${autoCode}`);await slow.page.goto(`${base}?join=${autoCode}`);
 await slow.page.locator('.joincard .set-logo').waitFor();
 assert.equal(await slow.page.locator('.set-foreground').count(),1);
 assert.equal(await slow.page.locator('#set-backdrop').count(),1);
 assert.equal(await slow.page.locator('#app').evaluate(el=>getComputedStyle(el).getPropertyValue('--primary').trim()),'#276847');
 const asset=await slow.context.request.get(new URL(await slow.page.locator('.set-logo').getAttribute('src'),base).href);
 assert.equal(asset.status(),200);assert.equal(asset.headers()['content-type'],'image/png');
 await slow.page.locator('[name=answer]').fill('3');
 await owner.page.locator('#set-design-button').click();
 await owner.page.locator('#set-design-dialog [data-preset]').selectOption('Hav');
 await owner.page.locator('#set-design-dialog [data-remove=foreground]').click();
 await owner.page.locator('#set-design-dialog [data-save]').click();
 await owner.page.locator('#set-design-dialog').waitFor({state:'detached'});
 await slow.page.waitForFunction(()=>getComputedStyle(document.querySelector('#app')).getPropertyValue('--primary').trim()==='#126a99');
 assert.equal(await slow.page.locator('[name=answer]').inputValue(),'3','Live design updates preserve the participant draft.');
 assert.equal(await slow.page.locator('.set-foreground').count(),0);
 assert.equal(await slow.page.locator('.set-logo').count(),1,'Unchanged logo is retained on design edits.');
 await slow.page.screenshot({path:'test-results/set-designed-participant.png',fullPage:true});
 await owner.page.screenshot({path:'test-results/set-designed-results.png',fullPage:true});
 await owner.page.locator('#set-design-button').click();
 await owner.page.locator('#set-design-dialog [data-preset]').selectOption('Natt');
 await owner.page.locator('#set-design-dialog [data-cancel]').click();
 assert.equal(await owner.page.locator('#app').evaluate(el=>getComputedStyle(el).getPropertyValue('--primary').trim()),'#126a99','Cancel preserves the saved appearance.');
 await fast.page.locator('[name=answer]').fill('7');await fast.page.locator('#send-answer').click();
 await fast.page.getByRole('heading',{name:'Vad tar du med dig?'}).waitFor();
 assert.equal(new URL(fast.page.url()).searchParams.get('join'),autoCode);
 assert.equal(await slow.page.locator('h1').textContent(),'Hur känns det idag?');
 await fast.page.reload();await fast.page.getByRole('heading',{name:'Vad tar du med dig?'}).waitFor();
 await fast.page.locator('[name=answer]').fill('Flera perspektiv, åäö & <b>nya tankar</b>.');
 await fast.page.waitForResponse(response=>response.url().includes('action=question'));
 assert.equal(await fast.page.locator('[name=answer]').inputValue(),'Flera perspektiv, åäö & <b>nya tankar</b>.','Polling must preserve drafts.');
 await fast.page.locator('#send-answer').click();await fast.page.getByRole('heading',{name:'Tack för dina svar!'}).waitFor();
 const autoOptions=await owner.page.locator('#set-result-question option').evaluateAll(options=>options.map(option=>option.value));
 await owner.page.locator('#set-result-question').selectOption(autoOptions[1]);
 await waitText(owner.page,'#live-chart','Flera perspektiv');
 assert.equal(await owner.page.locator('#live-chart b').count(),0,'Answer HTML is text.');
 const pdf=await owner.page.pdf({format:'A4'});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
 await owner.page.locator('#set-result-question').selectOption(autoOptions[0]);
 await waitText(owner.page,'#live-chart','Medelvärde');await waitText(owner.page,'#response-count','1 svar');
 await owner.page.locator('#set-design-button').click();
 await owner.page.locator('#set-design-dialog [data-reset-design]').click();
 await owner.page.locator('#set-design-dialog [data-save]').click();
 await owner.page.locator('#set-design-dialog').waitFor({state:'detached'});
 await slow.page.waitForFunction(()=>!document.querySelector('#set-backdrop')&&!document.querySelector('.set-logo'));
 assert.equal(await slow.page.locator('#app').evaluate(el=>el.style.getPropertyValue('--primary')),'','Reset restores the default or account colors.');

 const hostCode=await createSet(owner.page,'host');
 const first=await context({width:390,height:844}),late=await context({width:390,height:844});
 await first.page.goto(`${base}?join=${hostCode}`);await late.page.goto(`${base}?join=${hostCode}`);
 await first.page.locator('[name=answer]').fill('8');await first.page.locator('#send-answer').click();
 await first.page.locator('#set-waiting').waitFor();
 await first.page.reload();await first.page.locator('#set-waiting').waitFor();
 const hostOptions=await owner.page.locator('#set-result-question option').evaluateAll(options=>options.map(option=>option.value));
 await owner.page.locator('#set-result-question').selectOption(hostOptions[1]);
 await waitText(owner.page,'#stage h1','Vad tar du med dig?');
 await first.page.waitForResponse(response=>response.url().includes('action=question'));
 assert.equal(await first.page.locator('#set-waiting').isVisible(),true,'Reviewing another question must not advance participants.');
 await owner.page.locator('#set-next').click();
 await first.page.getByRole('heading',{name:'Vad tar du med dig?'}).waitFor();
 await late.page.getByRole('heading',{name:'Vad tar du med dig?'}).waitFor();
 await first.page.locator('[name=answer]').fill('Tid att reflektera');
 await owner.page.locator('#pause').click();
 await first.page.waitForFunction(()=>document.querySelector('#send-answer').disabled);
 assert.equal(await first.page.locator('[name=answer]').inputValue(),'Tid att reflektera');
 await owner.page.locator('#pause').click();
 await first.page.waitForFunction(()=>!document.querySelector('#send-answer').disabled);
 await first.page.locator('#send-answer').click();await first.page.getByRole('heading',{name:'Tack för dina svar!'}).waitFor();
 await owner.page.locator('#set-next').click();
 await late.page.getByRole('heading',{name:'Tack för dina svar!'}).waitFor();
 await waitText(owner.page,'#set-live-status','avslutat');
 await owner.page.screenshot({path:'test-results/set-results.png',fullPage:true});
 await owner.page.setViewportSize({width:390,height:844});
 assert.equal(await owner.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Set controls fit a mobile screen.');
 await owner.page.goto(base);await owner.page.locator('#question-list .questionrow').first().waitFor();
 assert.equal(await owner.page.locator('#question-list .questionrow').count(),2,'Each set has only one list entry.');
 await owner.page.locator(`.question-delete[data-code="${hostCode}"]`).click();
 await owner.page.getByRole('heading',{name:'Ta bort frågesetet?'}).waitFor();
 assert.match(await owner.page.locator('#delete-question-warning').textContent(),/Alla 2 frågor/);
 await owner.page.locator('#confirm-delete-question').click();
 await owner.page.locator('#delete-question-dialog').waitFor({state:'detached'});
 assert.equal(await owner.page.locator('#question-list .questionrow').count(),1);
 assert.deepEqual(errors,[]);
 console.log('PASS: real browser set creation, per-set colors and uploads, live design editing/removal/reset without losing answers, cancellation, participant progression, pause, PDF, mobile layout and deletion.');
}finally{
 if(browser)await browser.close();manage('cleanup');
}
