import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

// Set PULS_PLAYWRIGHT_PATH to an existing Playwright installation if it is not local.
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PULS_PLAYWRIGHT_PATH||'playwright');
const base=(process.env.PULS_TEST_URL||'http://localhost/puls/').replace(/\/?$/,'/');
const browser=await chromium.launch({headless:true,...(process.env.PULS_BROWSER_EXECUTABLE?{executablePath:process.env.PULS_BROWSER_EXECUTABLE}:{})});
const json=(body,status=200)=>({status,contentType:'application/json',body:JSON.stringify(body)});
const user={id:1,name:'Testanvändare',email:'print-test@example.test',theme:null};
const question={code:'123456',title:'Vad vill du dela?',kind:'sentence',options:[],view:'cards',open:true};

function assertPrintText(color){
 const channels=color.match(/^rgb\((\d+), (\d+), (\d+)\)$/)?.slice(1).map(Number);
 assert.ok(channels&&channels.every(value=>value===channels[0]&&value<=32),`Print text should be near-black even when the screen theme is dark; got ${color}.`);
}

async function session(q,values,{forbidden=false}={}){
 const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark'}),page=await context.newPage();
 const state={question:{...q},answers:values.map((value,i)=>({id:i+1,value})),errors:[]};
 page.on('pageerror',error=>state.errors.push(error.message));
 await page.route('https://ld.j4rl.se/**',route=>route.abort());
 await page.route('**/api.php?*',async route=>{
  const url=new URL(route.request().url()),action=url.searchParams.get('action');
  if(action==='bootstrap')return route.fulfill(json({csrf:'test-token',baseUrl:base,maxAnswers:5000,user}));
  if(action==='results'){
   if(forbidden)return route.fulfill(json({error:'Du har inte tillgång till resultatet.'},403));
   const since=Number(url.searchParams.get('since')||0);
   return route.fulfill(json({question:state.question,answers:state.answers.filter(answer=>answer.id>since)}));
  }
  state.errors.push(`Unexpected API action: ${action}`);
  return route.fulfill(json({error:'Unexpected test request'},500));
 });
 return {context,page,state};
}

async function finishPrint(page,originalTitle){
 await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
 assert.equal(await page.title(),originalTitle,'Printing must restore the browser tab title.');
 assert.equal(await page.locator('body.printing-results').count(),0);
 assert.equal(await page.locator('#print-results').textContent(),'','The completed report must be cleared.');
 await page.emulateMedia({media:'screen'});
 assert.equal(await page.locator('#print-results').isVisible(),false);
 assert.equal(await page.locator('#app').isVisible(),true);
}

async function completeTextResults(){
 const unsafe='<img src=x onerror="window.printInjected=true"> & en tanke';
 const values=Array.from({length:205},(_,i)=>i===0?unsafe:`Svar ${String(i+1).padStart(3,'0')}: Alla röster ska få plats på papperet.`);
 const q={...question,title:'Våra tankar <script>window.printInjected=true</script> & idéer'};
 const {context,page,state}=await session(q,values);
 try{
  await page.goto(`${base}?live=${q.code}`);
    await page.getByRole('button',{name:'Visa Live view',exact:true}).click();
  const button=page.getByRole('button',{name:'Skriv ut / spara PDF',exact:true});
  await button.waitFor();
  assert.equal(await button.getAttribute('id'),'print-results-button');
  assert.equal(await page.locator('body > article#print-results').count(),1);
  assert.equal(await page.locator('#print-results').isVisible(),false);
  assert.equal(await page.locator('#live-chart .quote').count(),200,'The screen keeps its existing 200-answer limit.');
  const originalTitle=await page.title();
  await page.locator('#hide-results').click();
  await page.evaluate(()=>{window.printCalls=0;window.print=()=>{window.printCalls++;window.dispatchEvent(new Event('beforeprint'));};});
  await button.click();
  assert.equal(await page.evaluate(()=>window.printCalls),1,'The button must invoke the browser print dialog.');
  assert.equal(await page.locator('#print-results h1').textContent(),q.title);
  assert.ok((await page.title()).includes(q.title),'The PDF filename title should identify the question.');
  assert.match(await page.locator('#print-results header').textContent(),/205 svar/);
  assert.equal(await page.locator('#print-results .quote').count(),205,'Printing must include every text answer.');
  assert.equal(await page.locator('#print-results .quote').last().textContent(),unsafe);
  assert.equal(await page.locator('#print-results script,#print-results img').count(),0,'Question and answer HTML must remain escaped text.');
  assert.equal(await page.evaluate(()=>window.printInjected),undefined);
  assert.ok(await page.locator('#print-results time').getAttribute('datetime'));
  await page.emulateMedia({media:'print'});
  assert.equal(await page.locator('#print-results').isVisible(),true);
  assert.equal(await page.locator('.topbar').isVisible(),false,'Navigation must not appear in the printout.');
  assert.equal(await page.locator('.joinaside').isVisible(),false,'The invitation sidebar must not appear in the printout.');
  assert.equal(await button.isVisible(),false,'Live controls must not appear in the printout.');
  const styles=await page.locator('#print-results').evaluate(report=>{
   const cards=report.querySelector('.cards'),quote=report.querySelector('.quote');
   return {color:getComputedStyle(report).color,background:getComputedStyle(document.body).backgroundColor,maxHeight:getComputedStyle(cards).maxHeight,overflow:getComputedStyle(cards).overflow,quoteColor:getComputedStyle(quote).color};
  });
  assertPrintText(styles.color);
  assert.equal(styles.background,'rgb(255, 255, 255)');
  assertPrintText(styles.quoteColor);
  assert.equal(styles.maxHeight,'none','Long answer lists must flow over multiple pages.');
  assert.equal(styles.overflow,'visible','Long answer lists must not be clipped.');

  state.answers.push({id:206,value:'Ett nytillkommet svar'});
  await page.waitForFunction(()=>document.querySelector('#response-count').textContent==='206 svar');
  assert.equal(await page.locator('#print-results .quote').count(),205,'Incoming answers must not change a report while it is being printed.');
  await finishPrint(page,originalTitle);
  assert.equal(await page.locator('#hide-results').getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('#live-chart').textContent(),/Resultatet är dolt/,'Printing must preserve the hidden screen state.');
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  assert.equal(await page.locator('#print-results .quote').count(),206,'Browser-menu printing must capture the latest answers.');
  assert.equal(await page.locator('#print-results .quote').first().textContent(),'Ett nytillkommet svar');
  await finishPrint(page,originalTitle);

  // Chromium's native PDF route dispatches the actual print lifecycle events.
  await page.evaluate(()=>{
   window.nativePrintEvents=[];
   window.addEventListener('beforeprint',()=>window.nativePrintEvents.push({type:'before',answers:document.querySelectorAll('#print-results .quote').length}));
   window.addEventListener('afterprint',()=>window.nativePrintEvents.push({type:'after',remaining:document.querySelector('#print-results').textContent}));
  });
  const pdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:false});
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert.ok(pdf.length>4000,'PDF generation should produce a populated document.');
  assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length>1,'All 206 answers must paginate into a multi-page PDF.');
  assert.deepEqual(await page.evaluate(()=>window.nativePrintEvents),[{type:'before',answers:206},{type:'after',remaining:''}]);
  assert.equal(await page.title(),originalTitle);
  assert.equal(await page.locator('body.printing-results').count(),0);

  await page.locator('#fullscreen').click();
  await page.waitForFunction(()=>document.fullscreenElement?.id==='stage');
  const fullscreenPdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:false});
  assert.ok((fullscreenPdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length>1,'Browser-menu printing from fullscreen must still include the entire report.');
  assert.equal(await page.title(),originalTitle);
  await page.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();});
  assert.deepEqual(state.errors,[]);
 }finally{await context.close();}
}

async function completeWordCounts(){
 const q={...question,title:'Beskriv dagen med ett ord',kind:'word',view:'cloud'};
 const values=Array.from({length:85},(_,i)=>`ord${String(i+1).padStart(3,'0')}`);
 values.push('ord001','ord001');
 const {context,page,state}=await session(q,values);
 try{
  await page.goto(`${base}?live=${q.code}`);
  await page.locator('#print-results-button').waitFor();
  const originalTitle=await page.title();
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  assert.equal(await page.locator('#print-results .cloud > span').count(),80);
  assert.equal(await page.locator('#print-results .datadetails li').count(),85,'The printed data list must include words omitted from the cloud.');
  assert.equal(await page.locator('#print-results .datadetails li').first().textContent(),'ord001: 3');
  assert.match(await page.locator('#print-results .datadetails').textContent(),/ord085: 1/);
  assert.equal(await page.locator('#print-results details').count(),0,'Printed counts must not depend on expanding a disclosure.');
  await page.emulateMedia({media:'print'});
  assert.equal(await page.locator('#print-results .datadetails').isVisible(),true);
  assertPrintText(await page.locator('#print-results .cloud > span').first().evaluate(word=>getComputedStyle(word).color));
  await finishPrint(page,originalTitle);
  assert.deepEqual(state.errors,[]);
 }finally{await context.close();}
}

async function forbiddenResults(){
 const {context,page,state}=await session(question,['Privat svar'],{forbidden:true});
 try{
  await page.goto(`${base}?live=${question.code}`);
  await page.getByRole('heading',{name:'Kunde inte öppna resultatet'}).waitFor();
  const originalTitle=await page.title();
  assert.equal(await page.locator('#print-results-button,#print-results').count(),0,'A forbidden results page must not expose printing controls or a report.');
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  assert.equal(await page.locator('body.printing-results').count(),0);
  assert.equal(await page.title(),originalTitle);
  assert.deepEqual(state.errors,[]);
 }finally{await context.close();}
}

try{
 await completeTextResults();
 await completeWordCounts();
 await forbiddenResults();
 console.log('PASS: printing/PDF, all text answers and word counts, escaping, frozen snapshots and refreshed answers, print layout, restored screen state, and forbidden results.');
}finally{await browser.close();}
