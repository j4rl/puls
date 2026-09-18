import {escapeHTML as e,renderChart,number} from './charts.js';
import {initResultPrinting} from './results-print.js';
import {applySetDesign,editSetDesign} from './set-design.js';

const views={bars:'Staplar',pie:'Cirkeldiagram',cloud:'Ordmoln',cards:'Textrutor',thermo:'Termometer',matrix:'Matris'};
const allowed={choice:['bars','pie'],yesno:['pie','bars'],number:['thermo','bars'],scale:['bars','thermo'],check:['bars'],ranking:['bars'],matrix:['matrix'],sentence:['cards'],word:['cloud','cards']};
const showError=(target,message)=>{if(target)target.innerHTML=message?`<div class="error" role="alert">${e(message)}</div>`:'';};

function answerInputs(q){
 if(['choice','yesno','check'].includes(q.kind))return `<fieldset><legend class="sr-only">Ditt svar</legend>${q.options.map((option,i)=>`<label class="answerchoice"><input type="${q.kind==='check'?'checkbox':'radio'}" name="answer" value="${i}"${q.kind==='check'?'':' required'}><span>${e(option)}</span></label>`).join('')}</fieldset>`;
 if(q.kind==='scale')return `<fieldset><legend>Välj ett steg</legend>${Array.from({length:q.max-q.min+1},(_,i)=>q.min+i).map(value=>`<label class="answerchoice"><input type="radio" name="answer" value="${value}" required><span>${number(value)}</span></label>`).join('')}</fieldset>`;
 if(q.kind==='number')return `<label class="field"><span>Ditt värde (${number(q.min)}–${number(q.max)})</span><input type="number" name="answer" min="${e(q.min)}" max="${e(q.max)}" step="any" inputmode="decimal" required placeholder="Ange ett tal"></label>`;
 if(q.kind==='ranking')return `<fieldset><legend>Ordna från viktigast till minst viktigt</legend><ol class="ranking-input">${q.options.map((option,i)=>`<li data-rank-value="${e(option)}"><span>${e(option)}</span><button type="button" class="rank-up" aria-label="Flytta ${e(option)} uppåt"${i?'':' disabled'}>↑</button><button type="button" class="rank-down" aria-label="Flytta ${e(option)} nedåt"${i===q.options.length-1?' disabled':''}>↓</button></li>`).join('')}</ol></fieldset>`;
 if(q.kind==='matrix')return `<fieldset class="matrix-input"><legend>Välj ett svar per påstående</legend>${q.options.rows.map((row,i)=>`<div class="matrix-row"><strong>${e(row)}</strong><div>${q.options.columns.map((column,j)=>`<label><input type="radio" name="matrix-${i}" value="${j}" required><span>${e(column)}</span></label>`).join('')}</div></div>`).join('')}</fieldset>`;
 return `<label class="field"><span>${q.kind==='word'?'Ditt ord':'Din mening'}</span>${q.kind==='word'?'<input name="answer" maxlength="40" required placeholder="Skriv ett ord" autocomplete="off">':'<textarea name="answer" rows="4" maxlength="500" required placeholder="Vad tänker du?"></textarea>'}</label>`;
}

export function joinQuestionSet({app,api,code,initial,isStopped}){
 let state=initial,screenKey='',sending=false,revision=0,ended=false;
 const inactive=()=>ended||isStopped();
 function render(){
  if(inactive())return;
  const q=state.question,set=state.set,key=state.complete?'complete':state.waiting?'waiting:'+q.id:'question:'+q.id;
  if(key!==screenKey){
   const hadScreen=Boolean(screenKey);screenKey=key;
   const progress=q?`Fråga ${q.position+1} av ${set.total}`:`${set.total} frågor`;
   const content=state.complete?'<div class="statusicon" aria-hidden="true">✓</div><h1 tabindex="-1">Tack för dina svar!</h1><p>Frågesetet är klart. Dina inskickade svar är sparade.</p><a class="btn" href="?join">Svara på en annan fråga</a>':state.waiting?'<div class="statusicon" aria-hidden="true">✓</div><h1 tabindex="-1">Ditt svar är sparat</h1><p id="set-waiting" role="status">Vänta här. Nästa fråga visas när skaparen öppnar den.</p>':`<h1 tabindex="-1">${e(q.title)}</h1><form id="answer-form">${answerInputs(q)}<div id="answer-error"></div><button id="send-answer" class="btn primary big">Skicka svar →</button></form>`;
   app.innerHTML=`<section class="panel joincard"><span class="eyebrow">${e(set.title)}</span><p class="small muted">${progress} · Kod ${e(code)}</p>${content}<p id="paused-note" class="error" role="status" hidden>Frågesetet är pausat. Vi väntar på att det öppnas.</p><p id="set-connection" class="small muted" role="status"></p></section>`;
  app.querySelectorAll('.rank-up,.rank-down').forEach(button=>button.addEventListener('click',()=>{const item=button.closest('li'),other=button.classList.contains('rank-up')?item.previousElementSibling:item.nextElementSibling;if(!other)return;item.parentElement.insertBefore(button.classList.contains('rank-up')?item:other,button.classList.contains('rank-up')?other:item);item.parentElement.querySelectorAll('li').forEach((li,i)=>{li.querySelector('.rank-up').disabled=!i;li.querySelector('.rank-down').disabled=i===item.parentElement.children.length-1;});}));
   app.querySelector('#answer-form')?.addEventListener('submit',submit);
   if(hadScreen)app.querySelector('h1').focus();
  }
  app.querySelector('#paused-note').hidden=state.set.open||state.complete;
  const button=app.querySelector('#send-answer');if(button)button.disabled=!state.set.open||sending;
  applySetDesign(app,state.set);
 }
 async function refresh(){
  if(inactive())return;
  const version=revision;
  try{
   const next=await api('question',{code});if(inactive()||version!==revision)return;
   state=next;render();app.querySelector('#set-connection').textContent='';
  }catch(err){
   if(inactive()||version!==revision)return;
   app.querySelector('#set-connection').textContent=err.message;
   if([403,404].includes(err.status)){ended=true;app.querySelector('#send-answer')?.setAttribute('disabled','');}
  }
 }
 async function submit(event){
  event.preventDefault();const form=event.currentTarget,q=state.question;
  if(inactive()||sending||!state.set.open||!form.reportValidity())return;
  let value;
    if(q.kind==='check')value=[...form.querySelectorAll('input:checked')].map(input=>q.options[Number(input.value)]);
  else if(['choice','yesno'].includes(q.kind))value=q.options[Number(new FormData(form).get('answer'))];
    else if(['number','scale'].includes(q.kind))value=form.elements.answer.valueAsNumber;
    else if(q.kind==='ranking')value=[...form.querySelectorAll('[data-rank-value]')].map(item=>item.dataset.rankValue);
    else if(q.kind==='matrix')value=Object.fromEntries(q.options.rows.map((row,i)=>[row,q.options.columns[Number(form.elements[`matrix-${i}`].value)]]));
  else value=form.elements.answer.value.trim();
  if(Array.isArray(value)&&!value.length){showError(app.querySelector('#answer-error'),'Välj minst ett alternativ.');return;}
    if(['number','scale'].includes(q.kind)&&!Number.isFinite(value)){showError(app.querySelector('#answer-error'),'Ange ett tal inom frågans intervall.');return;}
  revision++;sending=true;const button=app.querySelector('#send-answer');button.disabled=true;button.textContent='Skickar…';
  showError(app.querySelector('#answer-error'),'');
  try{
   await api('answer',{code,data:{questionId:q.id,value}});
   if(inactive())return;
   // Invalidate a poll started before the submission, then fetch this participant's next question.
   revision++;await refresh();
  }catch(err){
   if(inactive())return;
   showError(app.querySelector('#answer-error'),err.message);
   revision++;await refresh();
  }finally{
   sending=false;if(!inactive()){render();const current=app.querySelector('#send-answer');if(current)current.textContent='Skicka svar →';}
  }
 }
 async function poll(){
  if(inactive()||state.complete)return;
  if(!sending&&!document.hidden)await refresh();
  if(!inactive()&&!state.complete)setTimeout(poll,2000);
 }
 render();setTimeout(poll,2000);
}

export async function liveQuestionSet({app,api,code,initial,settings,isStopped}){
 let state=initial,selectedId=initial.question.id,answers=initial.answers.map(a=>a.value),lastId=initial.answers.at(-1)?.id||0;
 let hidden=false,busy=false,ended=false,revision=0,loading=false;
 const inactive=()=>ended||isStopped();
 const base=new URL(settings.baseUrl||'./',location.href);base.search='';base.hash='';
 const joinUrl=new URL(base);joinUrl.search=new URLSearchParams({join:code});
 app.innerHTML=`<div class="pagehead"><div><a class="textbutton" href="./">← Dina frågor</a><h1>${e(state.set.title)}</h1><p class="muted">${state.set.total} frågor · ${state.set.progression==='host'?'Du öppnar nästa fråga för alla deltagare':'Deltagarna går vidare automatiskt efter varje svar'}</p></div></div><div id="live-error"></div><section class="panel set-host-controls"><p id="set-live-status" role="status"></p><div class="row"><button type="button" class="btn" id="pause"></button><button type="button" class="btn primary" id="set-next"${state.set.progression==='automatic'?' hidden':''}>Öppna nästa fråga →</button></div></section><div class="livegrid"><div><label class="field"><span>Visa resultat för fråga</span><select id="set-result-question"></select></label><p class="small muted">Valet ändrar bara resultatvyn, inte frågan som deltagarna ser.</p><section class="stage" id="stage"><div class="row" style="justify-content:space-between"><span id="set-result-position" class="eyebrow"></span><span id="response-count" role="status" aria-live="polite"></span></div><h1></h1><div id="live-chart"></div><div class="stage-navigation" aria-label="Navigera mellan frågor"><button class="btn" id="stage-prev-question" type="button">← Föregående</button><button class="btn" id="stage-next-question" type="button">Nästa →</button><button class="btn primary" id="stage-advance-question" type="button" hidden>Öppna nästa fråga →</button></div><div class="previewfooter"><span>${e(state.set.title)}</span><span>Kod <strong>${e(code)}</strong></span></div><button class="btn exit-fullscreen" type="button" hidden>Avsluta helskärm</button></section><div class="livetools"><label class="sr-only" for="live-view">Resultatvy</label><select id="live-view"></select><button class="btn" id="hide-results" type="button" aria-pressed="false">Dölj resultat</button><button class="btn" id="fullscreen" type="button">⛶ Helskärm</button><button class="btn" id="print-results-button" type="button" aria-describedby="print-results-help">Skriv ut / spara PDF</button></div><p class="small muted" id="print-results-help">Skriver ut den valda frågans resultat, även om det är dolt. Välj Spara som PDF i utskriftsdialogen.</p></div><aside class="panel joinaside"><span class="eyebrow">Samma kod för hela setet</span><h2>Skanna & svara</h2><canvas id="qr" aria-label="QR-kod till frågesetet" role="img"></canvas><p>Deltagarkod</p><div class="bigcode">${e(code.slice(0,3))} ${e(code.slice(3))}</div><p>${e(base.host+base.pathname)}</p><button class="btn primary" id="copy-link" type="button">Kopiera deltagarlänk</button><a class="btn" href="${e(joinUrl.href)}" target="_blank" rel="noopener">Öppna deltagarvyn ↗</a><p id="copy-feedback" class="small muted" role="status"></p><p>Deltagarna behåller samma länk genom hela frågesetet.</p></aside></div>`;
 const find=selector=>app.querySelector(selector),stage=find('#stage');
 const designButton=document.createElement('button');designButton.id='set-design-button';designButton.type='button';designButton.className='btn';designButton.textContent='Utseende för setet';
 find('.set-host-controls .row').append(designButton);
 designButton.addEventListener('click',()=>editSetDesign({set:state.set,api,code,onSaved:design=>{revision++;state.set.design=design;draw();}}));
 function draw(){
  if(inactive())return;
  const {set,question:q}=state;
  find('#set-live-status').textContent=set.finished?'Frågesetet är avslutat.':`${set.open?'Öppet för svar':'Pausat'} · ${set.progression==='host'?`Deltagarna ser fråga ${set.current+1} av ${set.total}`:'Varje deltagare följer sin egen frågeordning'}`;
  find('#pause').textContent=set.open?'Pausa svar':'Öppna för svar';find('#pause').disabled=busy||set.finished;
  find('#set-next').textContent=set.current+1===set.total?'Avsluta frågeset':'Öppna nästa fråga →';find('#set-next').disabled=busy||set.finished;
  find('#set-result-question').innerHTML=state.questions.map(q=>`<option value="${q.id}">${q.position+1}. ${e(q.title)} (${q.answerCount} svar)</option>`).join('');
  find('#set-result-question').value=String(selectedId);find('#set-result-question').disabled=busy;
  find('#set-result-position').textContent=`Fråga ${q.position+1} av ${set.total}`;
  stage.querySelector('h1').textContent=q.title;
  find('#response-count').textContent=`${answers.length} svar`;
  find('#live-chart').innerHTML=loading?'<div class="liveempty">Hämtar resultat…</div>':hidden?'<div class="liveempty">Resultatet är dolt.</div>':renderChart(q,answers);
  find('#live-view').innerHTML=allowed[q.kind].map(view=>`<option value="${view}">${views[view]}</option>`).join('');
  find('#live-view').value=q.view;find('#live-view').disabled=busy||loading;
  find('#print-results-button').disabled=loading;
  const selectedPosition=state.questions.findIndex(item=>item.id===selectedId);
  find('#stage-prev-question').disabled=busy||loading||selectedPosition<=0;
  find('#stage-next-question').disabled=busy||loading||selectedPosition<0||selectedPosition>=state.questions.length-1;
  find('#stage-advance-question').hidden=set.progression!=='host';
  find('#stage-advance-question').textContent=set.current+1===set.total?'Avsluta frågeset':'Öppna nästa fråga →';
  find('#stage-advance-question').disabled=busy||set.finished;
  applySetDesign(app,set);
 }
 function failure(err){
  if(inactive())return;
  if([401,403,404].includes(err.status)){
   ended=true;answers=[];window.dispatchEvent(new Event('afterprint'));
   app.innerHTML=`<section class="panel joincard"><h1>Kunde inte öppna resultatet</h1><div class="error" role="alert">${e(err.message)}</div><a class="btn" href="./">Till startsidan</a></section>`;return;
  }
  showError(find('#live-error'),err.message);
 }
 async function refresh(reset=false){
  if(inactive())return;
  const version=++revision,id=selectedId;
  try{
   const next=await api('results',{code,query:{questionId:String(id),since:String(reset?0:lastId)}});
   if(inactive()||version!==revision)return;
   if(reset)answers=[];
   const fresh=next.answers.filter(a=>reset||a.id>lastId);answers.push(...fresh.map(a=>a.value));
   lastId=fresh.at(-1)?.id||(reset?0:lastId);state=next;loading=false;draw();showError(find('#live-error'),'');
  }catch(err){if(version===revision)failure(err);}
 }
 async function change(action,data){
  if(busy||inactive())return;
  busy=true;revision++;draw();
  try{
   const response=await api(action,{code,data});if(inactive())return;
   if(response.set){selectedId=response.set.currentQuestionId;loading=true;lastId=0;await refresh(true);}else await refresh();
  }catch(err){failure(err);if(!inactive())await refresh(loading);}
  finally{busy=false;if(!inactive())draw();}
 }
 async function selectResultQuestion(id){selectedId=Number(id);loading=true;lastId=0;answers=[];draw();await refresh(true);}
 find('#set-result-question').addEventListener('change',event=>selectResultQuestion(event.target.value));
 find('#stage-prev-question').addEventListener('click',()=>{const position=state.questions.findIndex(item=>item.id===selectedId);if(position>0)selectResultQuestion(state.questions[position-1].id);});
 find('#stage-next-question').addEventListener('click',()=>{const position=state.questions.findIndex(item=>item.id===selectedId);if(position>=0&&position<state.questions.length-1)selectResultQuestion(state.questions[position+1].id);});
 find('#set-next').addEventListener('click',()=>change('set-advance',{position:state.set.current}));
 find('#stage-advance-question').addEventListener('click',()=>change('set-advance',{position:state.set.current}));
 find('#pause').addEventListener('click',()=>change('update',{open:!state.set.open}));
 find('#live-view').addEventListener('change',event=>change('update',{questionId:selectedId,view:event.target.value}));
 find('#hide-results').addEventListener('click',event=>{hidden=!hidden;event.target.textContent=hidden?'Visa resultat':'Dölj resultat';event.target.setAttribute('aria-pressed',String(hidden));draw();});
 find('#fullscreen').addEventListener('click',async()=>{try{if(!stage.requestFullscreen)throw Error('Din webbläsare stöder inte helskärm här.');await stage.requestFullscreen();}catch(err){failure(err);}});
 stage.querySelector('.exit-fullscreen').addEventListener('click',async()=>{try{await document.exitFullscreen();}catch(err){failure(err);}});
 document.addEventListener('fullscreenchange',()=>{stage.querySelector('.exit-fullscreen').hidden=!document.fullscreenElement;});
 find('#copy-link').addEventListener('click',async()=>{
  const target=find('#copy-feedback');try{await navigator.clipboard.writeText(joinUrl.href);target.textContent='Länken är kopierad.';}catch{target.innerHTML=`<label>Kopiera länken manuellt<input readonly value="${e(joinUrl.href)}"></label>`;target.querySelector('input').select();}
 });
 const loadPrintResults=async()=>{
  const questions=await Promise.all(state.questions.map(async summary=>{
   const response=await api('results',{code,query:{questionId:String(summary.id),since:'0'}});
   return {question:response.question,answers:response.answers.map(answer=>answer.value)};
  }));
  return {question:questions[0].question,answers:questions[0].answers,questions,setTitle:state.set.title,design:state.set.design};
 };
 initResultPrinting(find('#print-results-button'),()=>inactive()||loading?null:{question:state.question,answers,design:state.set.design},message=>showError(find('#live-error'),message),loadPrintResults);
 draw();
 try{await window.PulsQR.toCanvas(find('#qr'),joinUrl.href,{width:200,margin:3,errorCorrectionLevel:'M',color:{dark:'#252444',light:'#ffffff'}});}catch{find('#qr').replaceWith(Object.assign(document.createElement('p'),{textContent:'Använd deltagarkoden eller länken för att svara.'}));}
 async function poll(){if(inactive())return;if(!busy&&!document.hidden)await refresh(loading);if(!inactive())setTimeout(poll,2000);}
 setTimeout(poll,2000);
}
