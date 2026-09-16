import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

// All API calls are intercepted: these tests never delete stored questions.
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PULS_PLAYWRIGHT_PATH||'playwright');
const base=(process.env.PULS_TEST_URL||'http://localhost/puls/').replace(/\/?$/,'/');
const browser=await chromium.launch({headless:true,...(process.env.PULS_BROWSER_EXECUTABLE?{executablePath:process.env.PULS_BROWSER_EXECUTABLE}:{})});
const json=(body,status=200)=>({status,contentType:'application/json',body:JSON.stringify(body)});
const user={id:1,name:'Testanvändare',email:'delete-test@example.test',theme:null};
const questions=[
 {code:'123456',title:'Vad tycker du om "Puls" & <img src=x onerror="window.injected=true">?',kind:'word',is_open:1,answer_count:3},
 {code:'654321',title:'En fråga som ska finnas kvar',kind:'yesno',is_open:0,answer_count:0}
];

async function session({width=1440,height=1000,theme='light',signedIn=true}={}){
 const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();
 const state={questions:structuredClone(questions),requests:[],errors:[],failDelete:false,holdDelete:false,pending:null};
 await context.addInitScript(mode=>localStorage.setItem('ld-theme',mode),theme);
 page.on('pageerror',error=>state.errors.push(error.message));
 await page.route('https://ld.j4rl.se/**',route=>route.abort());
 await page.route('**/api.php?*',async route=>{
  const request=route.request(),url=new URL(request.url()),action=url.searchParams.get('action');
  state.requests.push({action,code:url.searchParams.get('code'),method:request.method(),data:request.method()==='POST'?request.postDataJSON():null,csrf:request.headers()['x-csrf-token']});
  if(action==='bootstrap')return route.fulfill(json({csrf:'test-token',baseUrl:base,maxAnswers:5000,user:signedIn?user:null}));
  if(action==='list')return route.fulfill(json({questions:state.questions}));
  if(action==='delete'){
   assert.equal(signedIn,true,'Only signed-in users may request deletion.');
   if(state.failDelete){state.failDelete=false;return route.fulfill(json({error:'Frågan kunde inte tas bort. Försök igen.'},503));}
   const fulfill=async()=>{state.questions=state.questions.filter(question=>question.code!==url.searchParams.get('code'));await route.fulfill(json({ok:true}));};
   if(state.holdDelete)return new Promise(resolve=>{state.pending=async()=>{await fulfill();state.pending=null;resolve();};});
   return fulfill();
  }
  state.errors.push(`Unexpected API action: ${action}`);
  return route.fulfill(json({error:'Unexpected test request'},500));
 });
 return {context,page,state};
}

const deletions=state=>state.requests.filter(request=>request.action==='delete');
async function assertEventually(predicate,message){
 const deadline=Date.now()+10000;
 while(!predicate()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
 assert.ok(predicate(),message);
}

async function deleteQuestions(options){
 const {context,page,state}=await session(options);
 try{
  await page.goto(base);
  const first=page.locator(`.question-delete[data-code="${questions[0].code}"]`);
  await first.waitFor();
  assert.equal(await page.locator('#question-list .questionrow').count(),2);
  assert.equal(await page.locator('#question-list img').count(),0,'Question titles must be escaped when the list is rendered.');
  assert.equal(await page.evaluate(()=>window.injected),undefined);
  assert.equal(await page.locator('.question-link').first().evaluate(link=>link.href),`${base}?live=${questions[0].code}`);
  const initialUrl=page.url();
  await first.click();
  const dialog=page.locator('#delete-question-dialog');
  await dialog.waitFor();
  assert.ok((await dialog.textContent()).includes(questions[0].title),'The confirmation must identify the selected question as plain text.');
  assert.match(await dialog.locator('#delete-question-warning').textContent(),/Alla insamlade svar och resultat raderas också permanent\. Det går inte att ångra\./,'The warning must explain that all answers and results are permanently removed.');
  assert.equal(await dialog.locator('img').count(),0);
  assert.equal(page.url(),initialUrl,'Opening deletion must not follow the result link.');
  assert.equal(deletions(state).length,0,'Opening the dialog must not delete the question.');
  assert.ok(await dialog.evaluate(element=>{const rect=element.getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight;}),'The confirmation must fit the viewport.');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Question controls must not create horizontal overflow.');
  assert.equal(await page.locator('body').getAttribute('data-theme'),options.theme);

  await page.locator('#cancel-delete-question').click();
  await dialog.waitFor({state:'hidden'});
  assert.equal(deletions(state).length,0);
  assert.equal(await first.evaluate(element=>element===document.activeElement),true,'Cancel should restore focus to the delete button.');
  await first.click();
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  assert.equal(deletions(state).length,0,'Escape must cancel without an API call.');

  await first.click();
  state.failDelete=true;
  await page.locator('#confirm-delete-question').click();
  await page.locator('#delete-question-error [role=alert]').waitFor();
  assert.match(await page.locator('#delete-question-error').textContent(),/Frågan kunde inte tas bort/);
  assert.equal(await dialog.isVisible(),true,'A failed deletion must keep its confirmation open.');
  assert.equal(await page.locator('#question-list .questionrow').count(),2,'Failed deletion must retain the question.');
  assert.equal(await page.locator('#confirm-delete-question').isEnabled(),true,'Failed deletion must allow a retry.');

  state.holdDelete=true;
  await page.locator('#confirm-delete-question').click();
  await assertEventually(()=>state.pending,'The retry did not issue its delete request.');
  assert.equal(await page.locator('#confirm-delete-question').isDisabled(),true);
  assert.equal(await page.locator('#cancel-delete-question').isDisabled(),true);
  await page.locator('#confirm-delete-question').evaluate(button=>button.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.keyboard.press('Escape');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(deletions(state).length,2,'A pending deletion must not allow duplicate requests.');
  assert.equal(await dialog.isVisible(),true,'The dialog must remain visible while deletion is pending.');
  assert.equal(await page.locator('#question-list .questionrow').count(),2,'Remove a question only after the server confirms.');
  await state.pending();
  await dialog.waitFor({state:'hidden'});
  await first.waitFor({state:'detached'});
  assert.equal(await page.locator('#question-list .questionrow').count(),1);
  assert.equal(await page.locator('.question-link strong').textContent(),questions[1].title,'Deleting one question must preserve the other.');
  assert.ok((await page.locator('#question-list-status').textContent()).trim(),'Successful deletion must announce its result.');
  assert.equal(page.url(),initialUrl);

  state.holdDelete=false;
  await page.locator(`.question-delete[data-code="${questions[1].code}"]`).click();
  assert.ok((await dialog.textContent()).includes(questions[1].title),'The next confirmation must use the newly selected question.');
  await page.locator('#confirm-delete-question').click();
  await page.locator('#question-list .emptylist').waitFor();
  assert.equal(await page.locator('#question-list .questionrow').count(),0);
  assert.equal(await dialog.isVisible(),false);
  assert.equal(page.url(),initialUrl);
  assert.deepEqual(deletions(state).map(({code,method,data,csrf})=>({code,method,data,csrf})),[
   {code:questions[0].code,method:'POST',data:{},csrf:'test-token'},
   {code:questions[0].code,method:'POST',data:{},csrf:'test-token'},
   {code:questions[1].code,method:'POST',data:{},csrf:'test-token'}
  ],'Delete requests must target the chosen code and include CSRF protection.');
  assert.deepEqual(state.errors,[]);
 }finally{
  if(state.pending)await state.pending();
  await context.close();
 }
}

async function guestHasNoDeleteControls(){
 const {context,page,state}=await session({signedIn:false});
 try{
  await page.goto(base);
  await page.locator('.landing-hero').waitFor();
  assert.equal(await page.locator('#question-list,.question-delete,#delete-question-dialog').count(),0);
  assert.equal(state.requests.filter(request=>request.action==='list'||request.action==='delete').length,0);
  assert.deepEqual(state.errors,[]);
 }finally{await context.close();}
}

try{
 await deleteQuestions({width:1440,height:1000,theme:'light'});
 await deleteQuestions({width:390,height:844,theme:'dark'});
 await guestHasNoDeleteControls();
 console.log('PASS: desktop/mobile deletion, escaped titles, cancellation, failure/retry, duplicate prevention, CSRF payload, empty state, and guest visibility.');
}finally{await browser.close();}
