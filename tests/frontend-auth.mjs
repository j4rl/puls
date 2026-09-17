import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

// Set PULS_PLAYWRIGHT_PATH to an existing Playwright installation if it is not local.
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PULS_PLAYWRIGHT_PATH||'playwright');
const base=(process.env.PULS_TEST_URL||'http://localhost/puls/').replace(/\/?$/,'/');
const browser=await chromium.launch({headless:true,...(process.env.PULS_BROWSER_EXECUTABLE?{executablePath:process.env.PULS_BROWSER_EXECUTABLE}:{})});
const json=(body,status=200)=>({status,contentType:'application/json',body:JSON.stringify(body)});
const user={id:1,name:'Testanvändare',email:'auth-test@example.test',theme:null};
const question={code:'123456',title:'Vill du vara med?',kind:'yesno',options:['Ja','Nej'],view:'pie',open:true};

async function session(viewport={width:1440,height:1000}){
 const context=await browser.newContext({viewport}),page=await context.newPage();
 const state={user:null,failLogin:false,answered:false,published:null,requests:[],errors:[]};
 page.on('pageerror',error=>state.errors.push(error.message));
 await page.route('https://ld.j4rl.se/**',route=>route.abort());
 await page.route('**/api.php?*',async route=>{
  const request=route.request(),action=new URL(request.url()).searchParams.get('action');
  const data=request.method()==='POST'?request.postDataJSON():null;
  state.requests.push({action,data});
  if(action==='bootstrap')return route.fulfill(json({csrf:'test-token',baseUrl:base,maxAnswers:5000,user:state.user}));
  if(action==='list'){
   assert.ok(state.user,'Guest landing must never fetch the creator question list.');
   return route.fulfill(json({questions:[]}));
  }
  if(action==='login'&&state.failLogin){state.failLogin=false;return route.fulfill(json({error:'Fel e-postadress eller lösenord.'},401));}
  if(action==='login'||action==='register'){
   state.user=user;
   return route.fulfill(json({user,csrf:'signed-in-token'},action==='register'?201:200));
  }
  if(action==='logout'){state.user=null;return route.fulfill(json({ok:true}));}
  if(action==='create'){
   assert.ok(state.user,'Publishing requires an authenticated account.');
   state.published={...data,code:'654321',open:true};
   return route.fulfill(json({code:state.published.code},201));
  }
  if(action==='results')return route.fulfill(json({question:state.published,answers:[]}));
  if(action==='question')return route.fulfill(json({question,answered:state.answered}));
  if(action==='answer'){state.answered=true;return route.fulfill(json({ok:true}));}
  state.errors.push(`Unexpected API action: ${action}`);
  return route.fulfill(json({error:'Unexpected test request'},500));
 });
 return {context,page,state};
}

async function assertGuest(page){
 await page.locator('.landing-hero').waitFor();
 assert.equal(await page.locator('.landing-steps').isVisible(),true);
 assert.equal(await page.locator('#create-start,#create-form,.workspace,#preview-chart,.questions').count(),0,'Creator and preview must be absent from the guest page.');
 assert.equal(await page.locator('#account-controls #register').count(),0,'Registration belongs inside the login dialog.');
}

async function assertCreator(page){
 await page.locator('#create-form').waitFor();
 await page.locator('#question-list .emptylist').waitFor();
 assert.equal(await page.locator('.landing-hero,.landing-steps,#account-dialog').count(),0);
 await page.locator('.kind').first().click();
 await page.locator('#question-editor-dialog').waitFor({state:'visible'});
 await page.locator('#question-title').fill('En inloggad användares fråga');
 await page.locator('[data-editor-save]').click();
 await page.locator('.preview-open').click();
 assert.equal(await page.locator('#preview-title').textContent(),'Så kan svaren se ut');
 assert.equal(await page.locator('#preview-chart').isVisible(),true);
}

async function fillCredentials(page){
 await page.locator('#account-form [name=email]').fill(user.email);
 await page.locator('#account-form [name=password]').fill('Testlösenord123!');
}

async function loginAndLogout(){
 const {context,page,state}=await session();
 try{
  await page.goto(base);
  await assertGuest(page);
  assert.equal(state.requests.filter(r=>r.action==='list').length,0);
  await page.locator('#login').click();
  await page.locator('#account-dialog').waitFor();
  assert.equal(await page.locator('#account-name-field').isVisible(),false);
  assert.equal(await page.locator('[data-account-mode=register]').isVisible(),true);
  await fillCredentials(page);
  state.failLogin=true;
  await page.locator('#account-submit').click();
  await page.locator('#account-form-error [role=alert]').waitFor();
  assert.equal(await page.locator('#create-form').count(),0,'Failed login must not reveal the creator.');
  await page.locator('#account-submit').click();
  await assertCreator(page);
  assert.equal(state.requests.filter(r=>r.action==='bootstrap').length,2,'Login must restore authenticated state on reload.');
  assert.equal(state.requests.filter(r=>r.action==='list').length,1);
  await page.locator('#logout').click();
  await assertGuest(page);
  assert.equal(state.requests.filter(r=>r.action==='list').length,1,'Logout must stop loading the private question list.');
  assert.deepEqual(state.errors,[]);
 }finally{await context.close();}
}

async function mobileRegistration(){
 const {context,page,state}=await session({width:390,height:844});
 try{
  await page.goto(base);
  await assertGuest(page);
  await page.locator('#start-create').click();
  await page.locator('#account-dialog').waitFor();
  await page.locator('[data-account-mode=register]').click();
  await page.locator('#account-form [name=name]').fill(user.name);
  await fillCredentials(page);
  assert.ok(await page.locator('#account-dialog').evaluate(dialog=>dialog.getBoundingClientRect().width<=innerWidth),'Account dialog must fit a mobile viewport.');
  await page.locator('#account-submit').click();
  await assertCreator(page);
  const registration=state.requests.find(r=>r.action==='register');
  assert.equal(registration?.data.name,user.name);
  assert.equal(registration?.data.email,user.email);
  assert.equal(state.requests.filter(r=>r.action==='list').length,1);
  await page.locator('#publish').click();
  await page.locator('#stage').waitFor();
  assert.equal(await page.locator('#stage h1').textContent(),'En inloggad användares fråga');
  assert.equal(state.requests.filter(r=>r.action==='create').length,1);
  assert.equal(new URL(page.url()).searchParams.get('live'),'654321');
  assert.deepEqual(state.errors,[]);
 }finally{await context.close();}
}

async function creatorLinks(){
 const {context,page,state}=await session();
 try{
  for(const hash of ['#create-start','#create-form']){
   await page.goto('about:blank');
   await page.goto(base+hash);
   await page.locator('#account-dialog').waitFor();
   await assertGuest(page);
  }
  await page.goto(base+'om.html');
  await page.getByRole('link',{name:'Skapa en fråga'}).click();
  await page.locator('#account-dialog').waitFor();
  await assertGuest(page);
  assert.equal(state.requests.filter(r=>r.action==='list').length,0);
  state.user=user;
  await page.goto('about:blank');
  await page.goto(base+'#create-form');
  await assertCreator(page);
  assert.ok(await page.locator('#create-form').evaluate(form=>{const rect=form.getBoundingClientRect();return rect.top<innerHeight&&rect.bottom>0;}),'Authenticated creator links must scroll to the form.');
  assert.deepEqual(state.errors,[]);
 }finally{await context.close();}
}

async function anonymousParticipant(){
 const {context,page,state}=await session({width:390,height:844});
 try{
  await page.goto(base+'?join');
  await page.locator('#join-form [name=code]').fill(question.code);
  await page.locator('#join-form button').click();
  await page.locator('#answer-form').waitFor();
  assert.equal(await page.locator('#account-dialog,#create-form').count(),0);
  await page.locator('#answer-form [name=answer]').first().check();
  await page.locator('#send-answer').click();
  await page.getByRole('heading',{name:'Tack, din röst är med!'}).waitFor();
  assert.equal(state.requests.filter(r=>r.action==='list').length,0);
  assert.deepEqual(state.errors,[]);
 }finally{await context.close();}
}

try{
 await loginAndLogout();
 await mobileRegistration();
 await creatorLinks();
 await anonymousParticipant();
 console.log('PASS: guest landing, login recovery/logout, mobile registration/publishing, creator deep links, and anonymous participation.');
}finally{await browser.close();}
