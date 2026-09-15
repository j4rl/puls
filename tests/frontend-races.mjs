import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

// Set PULS_PLAYWRIGHT_PATH to an existing Playwright installation if it is not local.
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PULS_PLAYWRIGHT_PATH||'playwright');
const base=(process.env.PULS_TEST_URL||'http://localhost/puls/').replace(/\/?$/,'/');
const browser=await chromium.launch({headless:true,...(process.env.PULS_BROWSER_EXECUTABLE?{executablePath:process.env.PULS_BROWSER_EXECUTABLE}:{})});
const question={code:'123456',title:'Vad tycker du?',kind:'number',options:[],min:0,max:10,view:'thermo',open:true};
const json=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)});

async function testParticipant(order){
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 let questionRequests=0,answerRequests=0,pendingQuestion,pendingAnswer,answered=false;
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api.php?*',async route=>{
  const action=new URL(route.request().url()).searchParams.get('action');
  if(action==='bootstrap')return route.fulfill(json({csrf:'test-token',baseUrl:base,maxAnswers:5000,user:null}));
  if(action==='question'){
   questionRequests++;
   if(questionRequests===2)return new Promise(resolve=>{pendingQuestion=async value=>{await route.fulfill(json({question,answered:value}));resolve();};});
   return route.fulfill(json({question,answered}));
  }
  if(action==='answer'){
   answerRequests++;
   return new Promise(resolve=>{pendingAnswer=async fail=>{answered=true;await route.fulfill(fail?{status:503,contentType:'application/json',body:JSON.stringify({error:'Tillfälligt anslutningsfel.'})}:json({ok:true}));resolve();};});
  }
  throw Error(`Unexpected API action: ${action}`);
 });
 try{
  await page.goto(`${base}?join=123456`);
  await page.locator('#answer-form').waitFor();
  // Programmatic submission must not silently convert a blank number into zero.
  await page.locator('#answer-form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(answerRequests,0);
  await page.waitForFunction(()=>document.querySelector('#answer-form')!==null);
  await assertEventually(()=>pendingQuestion,'The participant state poll did not start.');
  await page.locator('[name=answer]').fill('5');
  await page.locator('#send-answer').click();
  await assertEventually(()=>pendingAnswer,'The answer POST did not start.');
  if(order==='post-first'){
   await pendingAnswer(false);
   await page.getByRole('heading',{name:'Tack, din röst är med!'}).waitFor();
   await pendingQuestion(false);
  }else{
   await pendingQuestion(true);
   assert.equal(await page.locator('#answer-form').count(),1,'Keep the form while its submission is still in flight.');
   await pendingAnswer(true);
   await page.getByRole('heading',{name:'Tack, din röst är med!'}).waitFor();
  }
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(answerRequests,1);
  assert.deepEqual(errors,[],`Browser errors after ${order}: ${errors.join(', ')}`);
 }finally{await context.close();}
}

async function assertEventually(predicate,message){
 const deadline=Date.now()+10000;
 while(!predicate()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
 assert.ok(predicate(),message);
}

try{
 await testParticipant('post-first');
 await testParticipant('poll-first');
 console.log('PASS: blank numeric answers, stale participant polling after submission, and saved-answer recovery after a failed response.');
}finally{await browser.close();}
