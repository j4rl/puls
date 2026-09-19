import {escapeHTML as e,renderChart,number} from './charts.js';
import {initAppearance} from './appearance.js';
import {initResultPrinting} from './results-print.js';
import {initSetBuilder} from './set-builder.js';
import {joinQuestionSet,liveQuestionSet} from './question-sets.js';
import {applySetDesign,editSetDesign} from './set-design.js';
import {initJoinFocus} from './join-focus.js';
const app=document.querySelector('#app');
const kinds=[['choice','Flerval','Välj ett alternativ','◉'],['yesno','Ja / nej','Ta ställning','±'],['number','Värde','Ange ett tal','#'],['scale','Skala','Välj ett steg','↔'],['check','Kryssrutor','Välj flera alternativ','☑'],['ranking','Rangordning','Ordna alternativen','≡'],['matrix','Matris','Bedöm flera påståenden','⊞'],['sentence','Mening','Svara med fri text','≡'],['word','Ord','Ett ord per person','Aa']];
const views={bars:'Staplar',pie:'Cirkeldiagram',cloud:'Ordmoln',cards:'Textrutor',thermo:'Termometer',matrix:'Matris'};
const allowed={choice:['bars','pie'],yesno:['pie','bars'],number:['thermo','bars'],scale:['bars','thermo'],check:['bars'],ranking:['bars'],matrix:['matrix'],sentence:['cards'],word:['cloud','cards']};
let settings={csrf:'',baseUrl:'',maxAnswers:5000,user:null},bootError='',stopped=false;
const params=new URLSearchParams(location.search);
const code=params.get('live')||params.get('join')||'';
const mode=params.has('live')?'live':params.has('join')?'join':'create';
const editId=Number(params.get('edit')||0);
const urlFor=(key,value)=>`?${key}=${encodeURIComponent(value)}`;
async function api(action,{code='',data,query={}}={}){
 const url=new URL('api.php',location.href);url.search=new URLSearchParams({action,...(code?{code}:{}),...query});
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{
  let response;
  try{response=await fetch(url,{method:data===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:data===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':settings.csrf},body:data===undefined?undefined:JSON.stringify(data),signal:controller.signal});}catch{throw Error('Ingen kontakt med servern. Kontrollera anslutningen och försök igen.');}
  let body;try{body=await response.json();}catch{throw Error('Servern svarade inte med giltiga data. Kontrollera PHP-installationen.');}
  if(!response.ok){const failure=Error(body.error||'Något gick fel. Försök igen.');failure.status=response.status;throw failure;}
  return body;
 }finally{clearTimeout(timeout);}
}
function error(target,message){if(target)target.innerHTML=message?`<div class="error" role="alert">${e(message)}</div>`:'';}
const accountEventKey='puls:account-event';
function accountChanged(){
 stopped=true;
 try{localStorage.setItem(accountEventKey,`${Date.now()}:${Math.random()}`);}catch{}
 location.reload();
}
window.addEventListener('storage',event=>{if(event.key===accountEventKey){stopped=true;location.reload();}});
function accountControls(){
 const target=document.querySelector('#account-controls');if(!target)return;
 if(settings.user){
  target.innerHTML=`<span class="account-user" title="${e(settings.user.email)}">${e(settings.user.name)}</span><button class="btn" id="logout" type="button">Logga ut</button><div id="account-error"></div>`;
  target.querySelector('#logout').addEventListener('click',async event=>{
   const button=event.currentTarget;button.disabled=true;button.textContent='Loggar ut…';error(target.querySelector('#account-error'),'');
   try{await api('logout',{data:{}});accountChanged();}catch(err){error(target.querySelector('#account-error'),err.message);button.disabled=false;button.textContent='Logga ut';}
  });
 }else{
  target.innerHTML='<button class="btn" id="login" type="button">Logga in</button>';
  target.querySelector('#login').addEventListener('click',()=>openAccount('login'));
 }
}
function openAccount(initialMode='login'){
 if(document.querySelector('#account-dialog'))return;
 const dialog=document.createElement('dialog');dialog.id='account-dialog';dialog.className='account-dialog';dialog.setAttribute('aria-labelledby','account-title');
 dialog.innerHTML=`<div class="row" style="justify-content:space-between"><h2 id="account-title"></h2><button class="btn" id="account-close" type="button" aria-label="Stäng kontorutan">×</button></div><div class="account-tabs" role="group" aria-label="Välj kontoåtgärd"><button type="button" class="btn" data-account-mode="login">Logga in</button><button type="button" class="btn" data-account-mode="register">Skapa konto</button></div><p class="small muted" id="account-description"></p><form id="account-form"><label class="field" id="account-name-field"><span>Namn</span><input name="name" autocomplete="name" maxlength="80"></label><label class="field"><span>E-postadress</span><input name="email" type="email" autocomplete="username" maxlength="254" required></label><label class="field"><span>Lösenord</span><input name="password" type="password" maxlength="72" required aria-describedby="password-help"></label><p class="small muted" id="password-help"></p><label class="account-claim" id="account-claim-field"><input type="checkbox" name="claimGuest"><span>Lägg till den här webbläsarens gästfrågor på mitt konto.</span></label><div id="account-form-error"></div><div class="account-actions"><button type="submit" class="btn primary" id="account-submit"></button></div></form>`;
 document.body.append(dialog);
 const form=dialog.querySelector('form');let selectedMode=initialMode,busy=false;
 function selectMode(nextMode){
  if(busy)return;selectedMode=nextMode;const registering=nextMode==='register';
  dialog.querySelector('#account-title').textContent=registering?'Skapa ditt Puls-konto':'Logga in på Puls';
  dialog.querySelector('#account-description').textContent=registering?'Spara dina frågor på ett konto och använd egna teman från theme.j4rl.se. Dina gästfrågor i den här webbläsaren följer med.':'Kom åt dina frågor och teman från dina andra enheter.';
  dialog.querySelector('#account-name-field').hidden=!registering;form.elements.name.required=registering;form.elements.name.disabled=!registering;
  dialog.querySelector('#account-claim-field').hidden=registering;form.elements.claimGuest.disabled=registering;
  form.elements.password.autocomplete=registering?'new-password':'current-password';form.elements.password.minLength=registering?10:1;
  dialog.querySelector('#password-help').textContent=registering?'Minst 10 tecken, högst 72 byte. Å, ä, ö och emoji använder flera byte.':'';
  dialog.querySelector('#account-submit').textContent=registering?'Skapa konto':'Logga in';
  dialog.querySelectorAll('[data-account-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.accountMode===nextMode)));
  error(dialog.querySelector('#account-form-error'),'');
 }
 dialog.querySelectorAll('[data-account-mode]').forEach(button=>button.addEventListener('click',()=>selectMode(button.dataset.accountMode)));
 dialog.querySelector('#account-close').addEventListener('click',()=>{if(!busy)dialog.close();});
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;const box=dialog.querySelector('#account-form-error');error(box,'');
  const password=form.elements.password.value;
  if(new TextEncoder().encode(password).length>72){error(box,'Lösenordet får vara högst 72 byte. Välj ett kortare lösenord.');form.elements.password.focus();return;}
  const data={email:form.elements.email.value.trim(),password};
  if(selectedMode==='register')data.name=form.elements.name.value.trim();else data.claimGuest=form.elements.claimGuest.checked;
  busy=true;dialog.querySelectorAll('button,input').forEach(el=>el.disabled=true);dialog.querySelector('#account-submit').textContent=selectedMode==='register'?'Skapar konto…':'Loggar in…';
  try{if(!settings.csrf)throw Error(bootError||'Ladda om sidan och försök igen.');await api(selectedMode,{data});accountChanged();}
  catch(err){busy=false;dialog.querySelectorAll('button,input').forEach(el=>el.disabled=false);selectMode(selectedMode);error(box,err.message);}
 });
 selectMode(initialMode);dialog.showModal();(initialMode==='register'?form.elements.name:form.elements.email).focus();
}
function viewOptions(kind,value){return allowed[kind].map(v=>`<option value="${v}"${v===value?' selected':''}>${views[v]}</option>`).join('');}
function sample(q){
 if(q.kind==='number')return [q.min+(q.max-q.min)*.5,q.min+(q.max-q.min)*.8,q.min+(q.max-q.min)*.7,q.min+(q.max-q.min)*.9];
 if(q.kind==='scale')return [q.min,q.min+1,q.max-1,q.max];
 if(q.kind==='matrix')return q.options.rows.map((row,i)=>Object.fromEntries([[row,q.options.columns[i%q.options.columns.length]]]));
 if(q.kind==='ranking')return [q.options,q.options.slice().reverse()];
 if(q.kind==='word')return ['Nyfiken','Inspirerad','Nyfiken','Peppad','Förväntansfull','Inspirerad','Lugn','Nyfiken','Redo','Peppad'];
 if(q.kind==='sentence')return ['Att få höra hur andra tänker.','Mer tid för att testa själv.','Diskussionerna i smågrupper.'];
 if(!q.options.length)return [];
 const a=q.options[0],b=q.options[1]||a,c=q.options[2]||a;
 return q.kind==='check'?[[a,b],[a],[b],[a,c],[a]]:[a,a,b,a,c,b,a];
}
function landingPage(){
 app.innerHTML=`<section class="landing-hero"><div class="hero-copy"><span class="eyebrow">PULS LIVE</span><h1>Ge alla i rummet<br><em>en röst.</em></h1><p>Dela en kod med gruppen så att alla kan svara direkt.</p><div class="hero-actions"><a class="btn primary big hero-join" href="?join">Svara på fråga <span aria-hidden="true">↗</span></a></div></div><div class="hero-art"><img src="assets/puls-orbit.svg" alt="Abstrakt illustration av röster som samlas i en gemensam puls"><span class="art-note art-note-one">alla röster</span><span class="art-note art-note-two">live</span></div></section><section class="landing-steps" aria-label="Så fungerar Puls"><article><span>01</span><h2>Svara</h2><p>Öppna frågan med en kod eller QR-kod.</p></article><article><span>02</span><h2>Lyssna</h2><p>Se gruppens perspektiv växa fram tillsammans.</p></article><article><span>03</span><h2>Följ upp</h2><p>Använd Live view för att prata vidare om svaren.</p></article></section><div id="global-error"></div>`;
 if(bootError)error(document.querySelector('#global-error'),bootError);
 if(['#create-start','#create-form'].includes(location.hash))openAccount('login');
}
async function createPage(){
 if(!settings.user){landingPage();return;}
 let saved=null;
 if(params.has('edit')){
  app.innerHTML='<section class="panel"><p role="status">Hämtar sparad fråga…</p></section>';
  try{
   if(!Number.isSafeInteger(editId)||editId<1)throw Error('Den sparade frågan kunde inte hittas.');
   saved=await api('saved-get',{query:{id:String(editId)}});
   if(stopped)return;
  }catch(err){
   if(stopped)return;
   app.innerHTML='<section class="panel"><h1>Kunde inte öppna frågan</h1><div id="edit-load-error"></div><a class="btn" href="./">Till mina frågor</a> <button class="btn" id="retry-edit" type="button">Försök igen</button></section>';
   error(app.querySelector('#edit-load-error'),err.message);app.querySelector('#retry-edit').addEventListener('click',()=>location.reload());return;
  }
 }
 app.innerHTML=`<div class="pagehead" id="create-start"><div><span class="eyebrow">Bygg en ny puls</span><h1>Vad vill du fråga?</h1><p class="muted">Spara en fråga eller ett frågeset som mall och aktivera det när du vill använda det.</p></div><span class="pill">Spara → Aktivera → Lyssna</span></div><div id="global-error"></div><div class="workspace"><form class="panel" id="create-form"><div class="stephead"><span class="stepnum">01</span><h2>Välj frågetyp</h2></div><fieldset class="kindgrid"><legend class="sr-only">Frågetyp</legend>${kinds.map(([id,name,hint,symbol],i)=>`<label class="kind${i===0?' selected':''}"><input type="radio" name="kind" value="${id}"${i===0?' checked':''}><span class="symbol" aria-hidden="true">${symbol}</span><strong>${name}</strong><small>${hint}</small></label>`).join('')}</fieldset><div class="stephead"><span class="stepnum">02</span><h2>Formulera din fråga</h2></div><label class="field"><span>Din fråga</span><textarea id="question-title" name="title" rows="2" maxlength="240" required placeholder="Vad vill du att vi fokuserar på idag?"></textarea></label><div id="options-wrap"><label class="field"><span>Svarsalternativ</span></label><div id="options"></div><button class="textbutton" id="add-option" type="button">＋ Lägg till alternativ</button></div><div id="range-wrap" class="rangefields" hidden><label class="field"><span>Minsta värde</span><input id="min" type="number" min="-1000000" max="1000000" step="any" value="0" disabled></label><label class="field"><span>Största värde</span><input id="max" type="number" min="-1000000" max="1000000" step="any" value="10" disabled></label></div><p id="answer-help" class="small muted" style="margin-top:14px"></p><div class="divider"></div><div class="stephead"><span class="stepnum">03</span><h2>Välj hur svaren visas</h2></div><label class="field"><span>Resultatvy</span><select id="view">${viewOptions('choice','bars')}</select></label><div id="create-error"></div><div class="publishrow"><small>Frågan sparas som mall. Aktivera den senare för att få en ny deltagarkod.</small><button class="btn primary big" id="publish" type="submit">Spara fråga <span aria-hidden="true">↗</span></button></div></form><aside><div class="previewhead"><h3>Förhandsvisning</h3><span class="muted small">Resultat på storbild</span></div><div class="previewbox"><div class="row" style="justify-content:space-between"><span class="eyebrow">Så kan svaren se ut</span><span class="sampletag">EXEMPELSVAR</span></div><h2 id="preview-title"></h2><div id="preview-chart"></div><div class="previewfooter"><span>puls / tillsammans blir bilden större</span><span id="sample-count"></span></div></div><p class="previewtip"><span aria-hidden="true">✧</span>Du kan byta resultatvy under tiden och dölja svaren tills alla har tänkt klart.</p></aside></div><section class="questions"><h2>Sparade mallar och körningar</h2><p class="small muted" style="margin-bottom:14px">Redigera mallar eller aktivera dem för att starta en ny omgång med egna svar.</p><div id="question-list"><p class="muted">Hämtar…</p></div><p id="question-list-status" class="small muted" role="status" aria-live="polite" tabindex="-1"></p></section>`;
 const form=document.querySelector('#create-form'),optionBox=document.querySelector('#options');let activeKind='choice',loadingDraft=false,dirty=false,saving=false;
 form.noValidate=true;
 if(saved){
  form.dataset.savedId=String(saved.id);
  document.querySelector('.pagehead .eyebrow').textContent=saved.type==='set'?'Sparat frågeset':'Sparad fråga';
  const heading=document.querySelector('.pagehead h1');heading.id='saved-detail-title';heading.textContent=saved.payload.title;
  document.querySelector('.pagehead p').textContent='Ändringar sparas för nästa aktivering. Varje körning behåller sina frågor och svar.';
  document.querySelector('.pagehead .pill').remove();
  const actions=document.createElement('div');actions.className='saved-detail-actions';actions.innerHTML='<a class="btn" href="./#question-list">Till mina frågor</a><button type="button" class="btn primary" id="activate-saved">Aktivera</button><p id="saved-edit-status" class="small muted" role="status"></p>';
  document.querySelector('.pagehead').append(actions);
  document.querySelector('#saved-edit-status').textContent=params.has('saved')?'Sparat. Aktivera för att starta en ny körning med en egen deltagarkod.':'Aktivering startar en ny körning med en egen deltagarkod.';
  document.querySelector('#activate-saved').addEventListener('click',event=>activateSaved(saved.id,event.currentTarget,document.querySelector('#global-error')));
 }
 const saveError=document.createElement('div');saveError.id='save-error';form.querySelector('.publishrow').before(saveError);
 const matrixField=document.createElement('label');matrixField.className='field';matrixField.id='matrix-columns-wrap';matrixField.hidden=true;
 matrixField.innerHTML='<span>Kolumner (en per rad)</span><textarea id="matrix-columns" rows="3" maxlength="1100" required disabled>Instämmer inte\nDelvis\nInstämmer helt</textarea>';
 form.querySelector('#options-wrap').after(matrixField);
 const editorDialog=document.createElement('dialog');editorDialog.id='question-editor-dialog';editorDialog.className='question-editor-dialog';editorDialog.setAttribute('aria-labelledby','question-editor-title');
 const editorTitle=document.createElement('h2');editorTitle.id='question-editor-title';editorTitle.textContent='Formulera frågan';editorDialog.append(editorTitle);
 const editorIntro=document.createElement('p');editorIntro.className='small muted';editorIntro.textContent='Fyll i frågan och spara när den är klar.';editorDialog.append(editorIntro);
 const titleField=form.querySelector('#question-title').parentElement,optionsWrap=form.querySelector('#options-wrap'),rangeWrap=form.querySelector('#range-wrap'),answerHelp=form.querySelector('#answer-help'),divider=answerHelp.nextElementSibling,viewStep=divider.nextElementSibling,viewField=form.querySelector('#view').parentElement,createError=form.querySelector('#create-error');
 editorDialog.append(titleField,optionsWrap,matrixField,rangeWrap,answerHelp,divider,viewStep,viewField,createError);
 const editorActions=document.createElement('div');editorActions.className='dialog-actions';editorActions.innerHTML='<button type="button" class="btn" data-editor-cancel>Stäng</button><button type="button" class="btn primary" data-editor-save>Färdig</button>';editorDialog.append(editorActions);form.append(editorDialog);
 editorActions.querySelector('[data-editor-cancel]').addEventListener('click',()=>editorDialog.close());
 editorActions.querySelector('[data-editor-save]').addEventListener('click',()=>{const invalid=[...editorDialog.querySelectorAll('input,textarea,select')].find(input=>!input.checkValidity());if(invalid){invalid.reportValidity();return;}editorDialog.close();});
 const previewAside=document.querySelector('.workspace > aside'),previewBox=previewAside.querySelector('.previewbox'),previewDialog=document.createElement('dialog');previewDialog.id='question-preview-dialog';previewDialog.className='question-preview-dialog';previewDialog.setAttribute('aria-labelledby','question-preview-title');
 previewDialog.innerHTML='<div class="dialog-heading"><div><span class="eyebrow">Förhandsvisning</span><h2 id="question-preview-title">Så kan svaren se ut</h2></div><button type="button" class="btn" data-preview-close aria-label="Stäng förhandsvisning">×</button></div>';
 previewDialog.append(previewBox);const previewActions=document.createElement('div');previewActions.className='dialog-actions';previewActions.innerHTML='<button type="button" class="btn primary" data-preview-close>Stäng</button>';previewDialog.append(previewActions);previewAside.replaceChildren(Object.assign(document.createElement('button'),{className:'btn preview-open',type:'button',textContent:'Visa förhandsvisning'}));form.append(previewDialog);
 previewAside.querySelector('.preview-open').addEventListener('click',()=>{preview();previewDialog.showModal();});previewDialog.querySelectorAll('[data-preview-close]').forEach(button=>button.addEventListener('click',()=>previewDialog.close()));
 const openEditor=()=>{editorTitle.textContent=`Formulera ${kinds.find(kind=>kind[0]===activeKind)?.[1].toLocaleLowerCase('sv')||'frågan'}`;if(!editorDialog.open)editorDialog.showModal();form.elements.title.focus();};
 const editQuestion=document.createElement('button');editQuestion.type='button';editQuestion.id='question-edit';editQuestion.className='btn question-edit';editQuestion.textContent='Formulera frågan';form.querySelectorAll('.stephead')[1].after(editQuestion);editQuestion.addEventListener('click',openEditor);
 form.querySelectorAll('.kind').forEach(kind=>kind.addEventListener('click',()=>setTimeout(openEditor,0)));
 const addOption=(value='')=>{const row=document.createElement('div');row.className='options';row.innerHTML=`<span class="optionletter"></span><input class="option-input" maxlength="100" required value="${e(value)}"><button class="delete" type="button" aria-label="Ta bort alternativ">×</button>`;row.querySelector('button').addEventListener('click',()=>{row.remove();renumber();preview();markDirty();});optionBox.append(row);renumber();};
 function renumber(){[...optionBox.children].forEach((row,i)=>{row.querySelector('.optionletter').textContent=String.fromCharCode(65+i);row.querySelector('input').setAttribute('aria-label',`Alternativ ${i+1}`);row.querySelector('button').disabled=optionBox.children.length<=2;});document.querySelector('#add-option').disabled=optionBox.children.length>=10;}
 addOption('Praktiska övningar');addOption('Diskussioner');addOption('Genomgångar');
 function draft(){const labels=[...optionBox.querySelectorAll('input')].map(el=>el.value.trim());return {kind:activeKind,title:form.elements.title.value.trim(),options:activeKind==='yesno'?['Ja','Nej']:['choice','check','ranking'].includes(activeKind)?labels:activeKind==='matrix'?{rows:labels,columns:form.querySelector('#matrix-columns').value.split('\n').map(value=>value.trim()).filter(Boolean)}:[],min:document.querySelector('#min').valueAsNumber,max:document.querySelector('#max').valueAsNumber,view:document.querySelector('#view').value};}
 function preview(){
  const q=draft();document.querySelector('#max').setCustomValidity(['number','scale'].includes(activeKind)&&q.max<=q.min?'Största värdet måste vara större än det minsta.':'');
  if(q.max<=q.min||!Number.isFinite(q.max)||!Number.isFinite(q.min)){q.min=0;q.max=10;}
  if(Array.isArray(q.options))q.options=q.options.map((s,i)=>s||`Alternativ ${i+1}`);
  else{q.options.rows=q.options.rows.map((s,i)=>s||`Påstående ${i+1}`);if(!q.options.columns.length)q.options.columns=['Kolumn 1','Kolumn 2'];}
  document.querySelector('#preview-title').textContent=q.title||'Vad vill du att vi fokuserar på idag?';
  editQuestion.textContent=q.title?`Redigera: ${q.title}`:'Formulera frågan';
  const a=sample(q);document.querySelector('#preview-chart').innerHTML=renderChart(q,a);document.querySelector('#sample-count').textContent=`${a.length} exempelsvar`;
 }
 form.addEventListener('change',event=>{
  if(event.target.name==='kind'){
   activeKind=event.target.value;form.querySelectorAll('.kind').forEach(el=>el.classList.toggle('selected',el.querySelector('input').checked));
   const optionsVisible=['choice','check','ranking','matrix'].includes(activeKind);optionsWrap.hidden=!optionsVisible;optionBox.querySelectorAll('input').forEach(el=>el.disabled=!optionsVisible);
   matrixField.hidden=activeKind!=='matrix';matrixField.querySelector('textarea').disabled=activeKind!=='matrix';
   rangeWrap.hidden=!['number','scale'].includes(activeKind);rangeWrap.querySelectorAll('input').forEach(el=>{el.disabled=!['number','scale'].includes(activeKind);el.required=['number','scale'].includes(activeKind);el.step=activeKind==='scale'?'1':'any';});
   document.querySelector('#view').innerHTML=viewOptions(activeKind,allowed[activeKind][0]);
   answerHelp.textContent={word:'Ett ord per deltagare, högst 40 tecken.',sentence:'Ett textsvar med fri text, högst 500 tecken.',number:'Deltagaren anger ett tal inom intervallet. Decimaler är tillåtna.',scale:'Välj ett helt steg, till exempel 1–5.',yesno:'Deltagaren väljer Ja eller Nej.',check:'Deltagaren kan välja flera alternativ.',ranking:'Deltagaren ordnar alla alternativ från viktigast till minst viktigt.',matrix:'Deltagaren väljer en kolumn för varje påstående.',choice:''}[activeKind];
   if(event.isTrusted)openEditor();
  }
  preview();
 });
 form.addEventListener('input',preview);
 document.querySelector('#add-option').addEventListener('click',()=>{if(optionBox.children.length<10){addOption();optionBox.lastElementChild.querySelector('input').focus();preview();markDirty();}});
 function loadDraft(q){
  loadingDraft=true;
  try{
   const radio=form.querySelector(`[name="kind"][value="${q.kind}"]`);radio.checked=true;radio.dispatchEvent(new Event('change',{bubbles:true}));
   form.elements.title.value=q.title;optionBox.replaceChildren();const labels=q.kind==='matrix'?q.options.rows:q.options;(labels?.length?labels:['','']).forEach(addOption);
   optionBox.querySelectorAll('input').forEach(el=>el.disabled=!['choice','check','ranking','matrix'].includes(q.kind));
   if(q.kind==='matrix')matrixField.querySelector('textarea').value=q.options.columns.join('\n');
   document.querySelector('#min').value=q.min??0;document.querySelector('#max').value=q.max??10;document.querySelector('#view').value=q.view;preview();
  }finally{loadingDraft=false;}
 }
 const setBuilder=initSetBuilder({form,draft,loadDraft,openEditor});
 function markDirty(){
  if(loadingDraft||!saved)return;dirty=true;
  form.dataset.dirty='true';
  updateActivationControls();
  document.querySelector('#saved-edit-status').textContent='Du har osparade ändringar. Spara dem innan du aktiverar en ny körning.';
 }
 form.addEventListener('input',markDirty);form.addEventListener('change',markDirty);
 form.addEventListener('click',event=>{if(event.target.closest('[data-remove],[data-reset-design]'))markDirty();});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(saving||activatingSaved||stopped)return;
  const button=document.querySelector('#publish');error(saveError,'');preview();
  const invalid=[...form.elements].find(input=>input.willValidate&&!input.checkValidity());
  if(invalid){if(editorDialog.contains(invalid))openEditor();invalid.reportValidity();return;}
  try{
   if(!settings.csrf)throw Error(bootError||'Ladda om sidan först.');
   const data={type:setBuilder.enabled?'set':'question',payload:setBuilder.payload()};
   saving=true;form.dataset.saving='true';form.inert=true;button.disabled=true;button.textContent='Sparar…';updateActivationControls();
   const result=await api(saved?'save-edit':'save',{data,query:saved?{id:String(saved.id)}:{}});
   if(stopped||!form.isConnected)return;
   location.href=`${urlFor('edit',saved?.id||result.id)}&saved=1`;
  }catch(err){
   if(stopped||!form.isConnected)return;
   saving=false;delete form.dataset.saving;form.inert=false;error(saveError,err.message);button.disabled=false;button.textContent=saved?'Spara ändringar':setBuilder.enabled?'Spara frågeset':'Spara fråga';updateActivationControls();
  }
 });
 if(saved){
  setBuilder.load(saved.payload,saved.type);
  const history=document.createElement('section');history.className='questions saved-history';history.innerHTML='<h2>Körningar och svar</h2><p class="small muted">Varje aktivering sparas här. Öppna en körning för att se just dess svar och resultat.</p><div id="saved-history"></div><p id="saved-history-status" class="small muted" role="status" tabindex="-1"></p>';
  document.querySelector('.workspace').after(history);renderHistory(saved.runs||[]);
 }
 preview();if(bootError)error(document.querySelector('#global-error'),bootError);
 loadList();
 // These targets do not exist until the asynchronous bootstrap has finished.
 if(['#create-start','#create-form','#question-list'].includes(location.hash))document.getElementById(location.hash.slice(1)).scrollIntoView();
}
const emptyQuestionList='<div class="emptylist">Du har inga sparade frågor eller körningar. Spara en fråga för att komma igång.</div>';
const emptyRunList='<div class="emptylist">Inga körningar ännu. Aktivera den sparade frågan eller frågesetet när du vill samla in svar.</div>';
let listRevision=0,historyRevision=0,activatingSaved=false;
function updateActivationControls(){
 const form=document.querySelector('#create-form'),busy=activatingSaved||Boolean(form?.dataset.saving),dirty=Boolean(form?.dataset.dirty);
 app.querySelectorAll('.saved-activate,#activate-saved').forEach(button=>{button.disabled=busy||dirty&&(button.id==='activate-saved'||Number(button.dataset.id)===editId);});
}
function runDate(value){
 const date=new Date(String(value).replace(' ','T'));
 return Number.isNaN(date.getTime())?String(value||''):date.toLocaleString('sv-SE',{dateStyle:'medium',timeStyle:'short'});
}
function runRow(q,legacy=false){
 return `<div class="questionrow"><a class="question-link" href="${urlFor('live',q.code)}"><div><strong>${e(q.title)}</strong><small>${q.kind==='set'?`Frågeset · ${Number(q.question_count)} frågor`:e(kinds.find(k=>k[0]===q.kind)?.[1]||q.kind)} · Kod ${e(q.code)} · ${Number(q.finished)?'Avslutat':Number(q.is_open)?'Öppen':'Pausad'}${q.created_at?` · ${e(runDate(q.created_at))}`:''}</small></div><span class="small">${Number(q.answer_count)} svar ↗</span></a><div class="run-actions">${legacy?`<button type="button" class="btn saved-from-run" data-code="${e(q.code)}">Redigera och återanvänd</button>`:''}<button class="btn danger question-delete" type="button" data-code="${e(q.code)}" aria-label="Ta bort körningen ${e(q.title)}">Ta bort</button></div></div>`;
}
async function activateSaved(id,button,status){
 const form=document.querySelector('#create-form');
 if(stopped||activatingSaved||form?.dataset.saving||button.disabled)return;
 activatingSaved=true;error(status,'');
 const wasInert=form?.inert;let navigating=false;
 if(form)form.inert=true;updateActivationControls();const label=button.textContent;button.textContent='Aktiverar…';
 try{
  const result=await api('activate',{query:{id:String(id)},data:{}});
  if(stopped||!button.isConnected)return;
  navigating=true;location.href=urlFor('live',result.code);
 }catch(err){
  if(stopped||!button.isConnected)return;
  error(status,err.message);
 }finally{
  if(!navigating){activatingSaved=false;if(form?.isConnected)form.inert=wasInert;updateActivationControls();button.textContent=label;}
 }
}
function bindRunDeletion(target,runs){
 target.querySelectorAll('.question-delete').forEach(button=>{
  const question=runs.find(item=>item.code===button.dataset.code);
  button.addEventListener('click',()=>deleteQuestion(question,button.closest('.questionrow')));
 });
}
function renderHistory(runs){
 const target=document.querySelector('#saved-history');if(!target||stopped)return;
 target.innerHTML=runs.map(q=>runRow(q)).join('')||emptyRunList;bindRunDeletion(target,runs);
}
async function refreshHistory(){
 const target=document.querySelector('#saved-history');if(!target)return;
 const revision=++historyRevision;
 try{const saved=await api('saved-get',{query:{id:String(editId)}});if(stopped||!target.isConnected||revision!==historyRevision)return;renderHistory(saved.runs||[]);}
 catch(err){if(!stopped&&target.isConnected&&revision===historyRevision)error(document.querySelector('#saved-history-status'),err.message);}
}
async function loadList(){
 const target=document.querySelector('#question-list');if(!target||stopped)return;
 const revision=++listRevision;
 try{
  const [{items},runs]=await Promise.all([api('saved-list'),api('list')]);
  if(stopped||!target.isConnected||revision!==listRevision)return;
  const saved=items.map(item=>`<div class="questionrow saved-row" data-saved-id="${Number(item.id)}"><a class="question-link" href="${urlFor('edit',item.id)}"><div><strong>${e(item.title)}</strong><small>${item.type==='set'?'Sparat frågeset':'Sparad fråga'} · ${Number(item.questionCount)} ${Number(item.questionCount)===1?'fråga':'frågor'} · ${Number(item.runCount)} ${Number(item.runCount)===1?'körning':'körningar'}</small></div></a><div class="run-actions"><a class="btn saved-edit" data-id="${Number(item.id)}" href="${urlFor('edit',item.id)}">Redigera och visa svar</a><button class="btn primary saved-activate" type="button" data-id="${Number(item.id)}"${Number(item.id)===editId&&document.querySelector('#create-form')?.dataset.dirty?' disabled':''}>Aktivera</button></div></div>`).join('');
  const legacy=runs.questions.filter(q=>!Number(q.saved_item_id));
  const active=legacy.length?`<h3 class="legacy-heading">Tidigare körningar</h3>${legacy.map(q=>runRow(q,true)).join('')}`:'';
  target.innerHTML=saved+active||emptyQuestionList;
  updateActivationControls();
  target.querySelectorAll('.saved-activate').forEach(button=>button.addEventListener('click',()=>activateSaved(button.dataset.id,button,document.querySelector('#question-list-status'))));
  target.querySelectorAll('.saved-from-run').forEach(button=>button.addEventListener('click',async()=>{
   if(button.disabled||stopped)return;button.disabled=true;button.textContent='Öppnar för redigering…';
   try{const result=await api('saved-from-run',{code:button.dataset.code,data:{}});if(!stopped&&button.isConnected)location.href=urlFor('edit',result.id);}
   catch(err){if(stopped||!button.isConnected)return;button.disabled=false;button.textContent='Redigera och återanvänd';error(document.querySelector('#question-list-status'),err.message);}
  }));
  bindRunDeletion(target,legacy);
 }catch(err){if(!stopped&&target.isConnected&&revision===listRevision)error(target,err.message);}
}
function deleteQuestion(question,row){
 if(!settings.user||document.querySelector('#delete-question-dialog'))return;
 const isHistory=Boolean(row.closest('#saved-history'));
 const dialog=document.createElement('dialog');
 dialog.id='delete-question-dialog';dialog.className='confirm-dialog';
 dialog.setAttribute('aria-labelledby','delete-question-title');
 dialog.setAttribute('aria-describedby','delete-question-description delete-question-warning');
 dialog.innerHTML=`<h2 id="delete-question-title">Ta bort frågan?</h2><p id="delete-question-description">Du tar bort frågan <strong>${e(question.title)}</strong> (kod ${e(question.code)}).</p><p id="delete-question-warning" class="delete-warning"><strong>Alla insamlade svar och resultat raderas också permanent.</strong> Det går inte att ångra.</p><div id="delete-question-error"></div><div class="dialog-actions"><button class="btn" id="cancel-delete-question" type="button" autofocus>Avbryt</button><button class="btn danger" id="confirm-delete-question" type="button">Ta bort fråga och svar</button></div>`;
 document.body.append(dialog);
 if(question.kind==='set'){
  dialog.querySelector('#delete-question-title').textContent='Ta bort frågesetet?';
  dialog.querySelector('#delete-question-description').textContent=`Du tar bort frågesetet ”${question.title}” (kod ${question.code}).`;
  dialog.querySelector('#delete-question-warning').textContent=`Alla ${Number(question.question_count)} frågor i setet och alla deras svar raderas permanent. Det går inte att ångra.`;
  dialog.querySelector('#confirm-delete-question').textContent='Ta bort frågeset och svar';
 }
 if(isHistory){
  dialog.querySelector('#delete-question-title').textContent='Ta bort körningen?';
  dialog.querySelector('#delete-question-description').textContent=`Du tar bort körningen ”${question.title}” (kod ${question.code}). Den sparade frågan eller frågesetet finns kvar.`;
  dialog.querySelector('#confirm-delete-question').textContent='Ta bort körning och svar';
 }
 const cancel=dialog.querySelector('#cancel-delete-question'),confirm=dialog.querySelector('#confirm-delete-question');
 let busy=false;
 cancel.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 confirm.addEventListener('click',async()=>{
  if(busy)return;
  busy=true;cancel.disabled=true;confirm.disabled=true;confirm.textContent='Tar bort…';
  error(dialog.querySelector('#delete-question-error'),'');
  try{
   await api('delete',{code:question.code,data:{}});
   if(stopped)return;
   const status=document.querySelector(isHistory?'#saved-history-status':'#question-list-status');
   const nextCode=(row.nextElementSibling?.querySelector('.question-delete')||row.previousElementSibling?.querySelector('.question-delete'))?.dataset.code;
   const list=row.parentElement;
   dialog.close();row.remove();
   if(!list.querySelector('.questionrow'))list.innerHTML=isHistory?emptyRunList:emptyQuestionList;
   status.textContent=`${isHistory?'Körningen':question.kind==='set'?'Frågesetet':'Frågan'} ”${question.title}” och dess svar har tagits bort.`;
   await Promise.allSettled([loadList(),refreshHistory()]);
   if(stopped)return;
   (nextCode?list.querySelector(`.question-delete[data-code="${nextCode}"]`)||status:status).focus();
  }catch(err){
   error(dialog.querySelector('#delete-question-error'),err.message);
   busy=false;cancel.disabled=false;confirm.disabled=false;confirm.textContent=isHistory?'Ta bort körning och svar':question.kind==='set'?'Ta bort frågeset och svar':'Ta bort fråga och svar';
  }
 });
 dialog.showModal();
}
function joinStart(){app.innerHTML=`<section class="panel joincard"><span class="eyebrow">Din röst räknas</span><h1>Vilken fråga vill du svara på?</h1><p class="muted">Skriv den sexsiffriga koden som visas på skärmen.</p><form id="join-form"><label class="field"><span>Deltagarkod</span><input class="code-input" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="123456" autocomplete="off" required autofocus></label><button class="btn primary big">Öppna frågan →</button></form></section>`;document.querySelector('#join-form').addEventListener('submit',ev=>{ev.preventDefault();location.href=urlFor('join',ev.target.elements.code.value);});}
function answeredPage(){app.innerHTML=`<section class="panel joincard" style="text-align:center"><div class="statusicon" aria-hidden="true">✓</div><h1>Tack, din röst är med!</h1><p class="muted">Ditt svar har sparats. Följ resultatet på den gemensamma skärmen.</p><a class="btn" href="?join">Svara på en annan fråga</a></section>`;}
async function joinQuestion(){
 try{
  if(bootError)throw Error(bootError);
  const initial=await api('question',{code});if(initial.set){joinQuestionSet({app,api,code,initial,isStopped:()=>stopped});return;}const {question:q,answered}=initial;if(answered){answeredPage();return;}
  let inputs='';
  if(['choice','yesno','check'].includes(q.kind)) inputs=`<fieldset><legend class="sr-only">Ditt svar</legend>${q.options.map((opt,i)=>`<label class="answerchoice"><input type="${q.kind==='check'?'checkbox':'radio'}" name="answer" value="${i}"${q.kind==='check'?'':' required'}><span>${e(opt)}</span></label>`).join('')}</fieldset>`;
  else if(['number','scale'].includes(q.kind))inputs=q.kind==='scale'?`<fieldset><legend>Välj ett steg</legend>${Array.from({length:q.max-q.min+1},(_,i)=>q.min+i).map(value=>`<label class="answerchoice"><input type="radio" name="answer" value="${value}" required><span>${number(value)}</span></label>`).join('')}</fieldset>`:`<label class="field"><span>Ditt värde (${number(q.min)}–${number(q.max)})</span><input type="number" name="answer" min="${e(q.min)}" max="${e(q.max)}" step="any" inputmode="decimal" required placeholder="Ange ett tal"></label>`;
  else if(q.kind==='ranking')inputs=`<fieldset><legend>Ordna från viktigast till minst viktigt</legend><ol class="ranking-input">${q.options.map((opt,i)=>`<li data-rank-value="${e(opt)}"><span>${e(opt)}</span><button type="button" class="rank-up" aria-label="Flytta ${e(opt)} uppåt"${i?'':' disabled'}>↑</button><button type="button" class="rank-down" aria-label="Flytta ${e(opt)} nedåt"${i===q.options.length-1?'':' '}>↓</button></li>`).join('')}</ol></fieldset>`;
  else if(q.kind==='matrix')inputs=`<fieldset class="matrix-input"><legend>Välj ett svar per påstående</legend>${q.options.rows.map((row,i)=>`<div class="matrix-row"><strong>${e(row)}</strong><div>${q.options.columns.map((column,j)=>`<label><input type="radio" name="matrix-${i}" value="${j}" required><span>${e(column)}</span></label>`).join('')}</div></div>`).join('')}</fieldset>`;
  else inputs=`<label class="field"><span>${q.kind==='word'?'Ditt ord':'Din mening'}</span>${q.kind==='word'?'<input name="answer" maxlength="40" required placeholder="Skriv ett ord" autocomplete="off">':'<textarea name="answer" rows="4" maxlength="500" required placeholder="Vad tänker du?"></textarea>'}</label>`;
  app.innerHTML=`<section class="panel joincard"><span class="eyebrow">Fråga ${e(code)}</span><h1>${e(q.title)}</h1><p class="muted">${e(kinds.find(k=>k[0]===q.kind)?.[2])}. Ett svar per webbläsare.</p><p id="paused-note" class="error" role="status"${q.open?' hidden':''}>Frågan är pausad. Vi väntar på att den öppnas.</p><form id="answer-form">${inputs}<div id="answer-error"></div><button id="send-answer" class="btn primary big"${q.open?'':' disabled'}>Skicka svar →</button></form><p id="connection-note" class="small muted" role="status" hidden></p><p class="small muted" style="margin-top:20px">Ditt namn efterfrågas inte. Skriv inte känsliga personuppgifter i fritext.</p></section>`;
  applySetDesign(app,{title:q.title,design:q.design});
  app.querySelectorAll('.rank-up,.rank-down').forEach(button=>button.addEventListener('click',()=>{const item=button.closest('li'),other=button.classList.contains('rank-up')?item.previousElementSibling:item.nextElementSibling;if(!other)return;item.parentElement.insertBefore(button.classList.contains('rank-up')?item:other,button.classList.contains('rank-up')?other:item);item.parentElement.querySelectorAll('li').forEach((li,i)=>{li.querySelector('.rank-up').disabled=!i;li.querySelector('.rank-down').disabled=i===item.parentElement.children.length-1;});}));
  let sending=false,done=false;
  document.querySelector('#answer-form').addEventListener('submit',async ev=>{ev.preventDefault();const form=ev.target,button=document.querySelector('#send-answer');if(sending||done||!q.open||!form.reportValidity())return;error(document.querySelector('#answer-error'),'');let value;
   if(q.kind==='check')value=[...form.querySelectorAll('input:checked')].map(el=>q.options[Number(el.value)]);
   else if(['choice','yesno'].includes(q.kind))value=q.options[Number(new FormData(form).get('answer'))];
  else if(['number','scale'].includes(q.kind))value=form.elements.answer.valueAsNumber;
  else if(q.kind==='ranking')value=[...form.querySelectorAll('[data-rank-value]')].map(item=>item.dataset.rankValue);
  else if(q.kind==='matrix')value=Object.fromEntries(q.options.rows.map((row,i)=>[row,q.options.columns[Number(form.elements[`matrix-${i}`].value)]]));
   else value=form.elements.answer.value.trim();
   if(Array.isArray(value)&&!value.length){error(document.querySelector('#answer-error'),'Välj minst ett alternativ.');return;}
  if(['number','scale'].includes(q.kind)&&!Number.isFinite(value)){error(document.querySelector('#answer-error'),'Ange ett tal inom frågans intervall.');return;}
   sending=true;button.disabled=true;button.textContent='Skickar…';try{await api('answer',{code,data:{value}});if(stopped)return;done=true;answeredPage();}catch(err){if(!done&&!stopped){error(document.querySelector('#answer-error'),err.message);button.disabled=!q.open;button.textContent='Skicka svar →';}}finally{sending=false;}
  });
  async function checkState(){
   if(done||stopped)return;
   try{
    const state=await api('question',{code});if(done||stopped)return;
    // A successful POST owns the thank-you transition while it is in flight.
    if(state.answered&&!sending){done=true;answeredPage();return;}
    q.open=state.question.open;q.design=state.question.design;applySetDesign(app,{title:q.title,design:q.design});document.querySelector('#paused-note').hidden=q.open;document.querySelector('#send-answer').disabled=!q.open||sending;
    document.querySelector('#connection-note').hidden=true;
   }catch(err){if(!done&&!stopped){const note=document.querySelector('#connection-note');note.textContent=err.message;note.hidden=false;}}
   if(!done&&!stopped)setTimeout(checkState,3000);
  }
  setTimeout(checkState,3000);
 }catch(err){app.innerHTML=`<section class="panel joincard"><h1>Kunde inte öppna frågan</h1><div class="error" role="alert">${e(err.message)}</div><a class="btn" href="${urlFor('join',code)}">Försök igen</a><a class="btn" href="?join">Ange en annan kod</a></section>`;}
}
async function livePage(){
 let q,answers=[],lastId=0,hidden=false,pending=false,revision=0;
 try{if(bootError)throw Error(bootError);const first=await api('results',{code});if(first.set){await liveQuestionSet({app,api,code,initial:first,settings,isStopped:()=>stopped});return;}q=first.question;answers=first.answers.map(a=>a.value);lastId=first.answers.at(-1)?.id||0;}catch(err){app.innerHTML=`<section class="panel joincard"><h1>Kunde inte öppna resultatet</h1><div class="error" role="alert">${e(err.message)}</div><a class="btn" href="${urlFor('live',code)}">Försök igen</a><a class="btn" href="./">Till startsidan</a></section>`;return;}
 const base=new URL(settings.baseUrl||'./',location.href);base.search='';base.hash='';const joinUrl=new URL(base);joinUrl.search=new URLSearchParams({join:code});
 app.innerHTML=`<div class="pagehead"><div><a class="textbutton" href="./">← Dina frågor</a><h1 style="margin-top:12px">Lyssna på rummet</h1></div><span class="pill" id="live-status">Tar emot svar</span></div><div id="live-error"></div><div class="livegrid"><div><section class="stage" id="stage"><div class="row" style="justify-content:space-between"><span class="eyebrow" id="stage-status">LIVE</span><span id="response-count" role="status" aria-live="polite"></span></div><h1>${e(q.title)}</h1><div id="live-chart"></div><div class="previewfooter"><span>Svara på <b>${e(base.host+base.pathname)}</b></span><span>Kod <strong>${e(code)}</strong></span></div><button class="btn exit-fullscreen" type="button" hidden>Avsluta helskärm</button></section><div class="livetools"><label class="sr-only" for="live-view">Resultatvy</label><select id="live-view">${viewOptions(q.kind,q.view)}</select><button class="btn" id="hide-results" type="button" aria-pressed="false">Dölj resultat</button><button class="btn" id="pause" type="button"></button><button class="btn" id="fullscreen" type="button">⛶ Helskärm</button></div><p class="small muted" style="margin-top:12px">Nya svar hämtas varannan sekund. Upp till ${settings.maxAnswers} svar per fråga.</p></div><aside class="panel joinaside"><span class="eyebrow">Bjud in alla</span><h2 style="margin-top:12px">Skanna & svara</h2><canvas id="qr" aria-label="QR-kod till deltagarfrågan" role="img"></canvas><p>Eller ange koden</p><div class="bigcode">${e(code.slice(0,3))} ${e(code.slice(3))}</div><p>${e(base.host+base.pathname)}</p><button class="btn primary" id="copy-link" type="button">Kopiera deltagarlänk</button><a class="btn" href="${e(joinUrl.href)}" target="_blank" rel="noopener">Öppna deltagarvyn ↗</a><div id="copy-feedback" class="small muted" role="status"></div><p class="small" style="margin-top:22px">Resultatet kan bara öppnas i din skaparwebbläsare.</p></aside></div>`;
 const designButton=document.createElement('button');designButton.type='button';designButton.className='btn';designButton.id='question-design-button';designButton.textContent='Utseende för frågan';document.querySelector('.livetools').append(designButton);
 const liveGrid=document.querySelector('.livegrid'),lobby=document.createElement('section');lobby.className='live-lobby panel';lobby.innerHTML=`<div class="live-lobby-copy"><span class="eyebrow">Frågan är redo</span><h1>${e(q.title)}</h1><p class="muted">Visa QR-koden eller låt deltagarna gå till länken och ange koden.</p><div class="live-lobby-code"><span>Deltagarkod</span><strong>${e(code.slice(0,3))} ${e(code.slice(3))}</strong></div><div class="live-lobby-url"><span>Deltagarlänk</span><strong>${e(joinUrl.href)}</strong></div><p class="live-lobby-count" role="status" aria-live="polite"><strong id="lobby-response-count">${answers.length}</strong> deltagare har svarat</p><button class="btn primary big" id="show-live-view" type="button">Visa Live view</button></div><div class="live-lobby-qr"><canvas id="lobby-qr" aria-label="QR-kod till deltagarfrågan" role="img"></canvas><span>Skanna för att svara</span></div>`;app.insertBefore(lobby,liveGrid);liveGrid.hidden=true;
 document.querySelector('#show-live-view').addEventListener('click',()=>{liveGrid.hidden=false;lobby.hidden=true;});
 const openJoinFocus=initJoinFocus(app),lobbyFocusButton=document.createElement('button');
 lobbyFocusButton.type='button';lobbyFocusButton.className='btn';lobbyFocusButton.textContent='Visa bara QR-kod';lobbyFocusButton.setAttribute('aria-haspopup','dialog');lobbyFocusButton.setAttribute('aria-controls','join-focus-dialog');
 const lobbyActions=document.createElement('div');lobbyActions.className='row live-lobby-actions';document.querySelector('#show-live-view').before(lobbyActions);lobbyActions.append(document.querySelector('#show-live-view'),lobbyFocusButton);
 lobbyFocusButton.addEventListener('click',openJoinFocus);
 designButton.addEventListener('click',()=>editSetDesign({set:{title:q.title,design:q.design},api,code,action:'question-design',heading:'Utseende för frågan',onSaved:design=>{q.design=design;draw();}}));
 try{await window.PulsQR.toCanvas(document.querySelector('#qr'),joinUrl.href,{width:200,margin:3,errorCorrectionLevel:'M',color:{dark:'#252444',light:'#ffffff'}});await window.PulsQR.toCanvas(document.querySelector('#lobby-qr'),joinUrl.href,{width:280,margin:3,errorCorrectionLevel:'M',color:{dark:'#252444',light:'#ffffff'}});}catch{document.querySelector('#lobby-qr').replaceWith(Object.assign(document.createElement('p'),{textContent:'QR-koden kunde inte visas. Använd deltagarkoden eller länken.'}));}
 document.querySelector('.joinaside>p:last-child').textContent=settings.user?'Resultatet kan öppnas på alla enheter där du är inloggad på ditt konto.':'Resultatet hör till den här webbläsaren. Skapa ett konto för att spara frågan och öppna den på andra enheter.';
 if(/^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(base.hostname)){
  const note=document.createElement('p');note.className='small';note.style.marginTop='16px';
  note.textContent='Mobilen kan inte nå localhost. Öppna Puls via datorns lokala nätverksadress på samma nätverk. '+(settings.user?'Logga sedan in för att dela den här frågan.':'Skapa frågan där, eller spara den här frågan på ett konto först.');
  document.querySelector('.joinaside').append(note);
 }
 function draw(){document.querySelector('#live-chart').innerHTML=hidden?'<div class="liveempty">Resultatet är dolt.<br><small>Alla kan fortsätta svara i lugn och ro.</small></div>':renderChart(q,answers);const count=document.querySelector('#response-count');if(count.textContent!==`${answers.length} svar`)count.textContent=`${answers.length} svar`;document.querySelector('#lobby-response-count').textContent=answers.length;document.querySelector('#pause').textContent=q.open?'Pausa svar':'Öppna för svar';document.querySelector('#live-status').textContent=q.open?'Tar emot svar':'Frågan är pausad';document.querySelector('#stage-status').textContent=q.open?'LIVE':'PAUSAD';document.querySelector('#live-view').value=q.view;applySetDesign(app,{title:q.title,design:q.design});}
 draw();
 const printButton=document.createElement('button');printButton.id='print-results-button';printButton.className='btn';printButton.type='button';printButton.textContent='Skriv ut / spara PDF';printButton.setAttribute('aria-describedby','print-results-help');
 document.querySelector('.livetools').append(printButton);
 const printHelp=document.createElement('p');printHelp.id='print-results-help';printHelp.className='small muted';printHelp.style.marginTop='8px';printHelp.textContent='Skriv ut resultatet eller välj Spara som PDF i utskriftsdialogen. Alla insamlade svar tas med, även när resultatet är dolt på skärmen.';
 document.querySelector('.livetools').after(printHelp);
 initResultPrinting(printButton,()=>stopped?null:{question:q,answers},message=>error(document.querySelector('#live-error'),message));
 function lostAccess(err){if(![401,403].includes(err.status))return false;stopped=true;answers=[];app.replaceChildren();location.reload();return true;}
 async function update(data){if(pending||stopped)return;revision++;pending=true;document.querySelector('#pause').disabled=true;document.querySelector('#live-view').disabled=true;try{await api('update',{code,data});if(stopped)return;Object.assign(q,data);draw();error(document.querySelector('#live-error'),'');}catch(err){if(!lostAccess(err))error(document.querySelector('#live-error'),err.message);}finally{pending=false;if(!stopped){document.querySelector('#pause').disabled=false;document.querySelector('#live-view').disabled=false;draw();}}}
 document.querySelector('#live-view').addEventListener('change',ev=>update({view:ev.target.value}));document.querySelector('#pause').addEventListener('click',()=>update({open:!q.open}));
 document.querySelector('#hide-results').addEventListener('click',ev=>{hidden=!hidden;ev.target.textContent=hidden?'Visa resultat':'Dölj resultat';ev.target.setAttribute('aria-pressed',String(hidden));draw();});
 const stage=document.querySelector('#stage');document.querySelector('#fullscreen').addEventListener('click',async()=>{try{if(!stage.requestFullscreen)throw Error('Din webbläsare stöder inte helskärm här.');await stage.requestFullscreen();}catch(err){error(document.querySelector('#live-error'),err.message);}});
 stage.querySelector('.exit-fullscreen').addEventListener('click',async()=>{try{await document.exitFullscreen();}catch{error(document.querySelector('#live-error'),'Kunde inte avsluta helskärm. Tryck på Esc.');}});document.addEventListener('fullscreenchange',()=>{stage.querySelector('.exit-fullscreen').hidden=!document.fullscreenElement;});
 document.querySelector('#copy-link').addEventListener('click',async()=>{const target=document.querySelector('#copy-feedback');try{await navigator.clipboard.writeText(joinUrl.href);target.textContent='Länken är kopierad.';}catch{target.innerHTML=`<label>Kopiera länken manuellt<input readonly value="${e(joinUrl.href)}"></label>`;target.querySelector('input').select();}});
 async function poll(){if(stopped)return;if(!pending&&!document.hidden){try{const requestRevision=revision;const response=await api('results',{code,query:{since:String(lastId)}});if(stopped)return;const fresh=response.answers.filter(a=>a.id>lastId);const changed=fresh.length||response.question.open!==q.open||response.question.view!==q.view;answers.push(...fresh.map(a=>a.value));lastId=fresh.at(-1)?.id||lastId;if(requestRevision===revision&&!pending)q=response.question;if(changed)draw();document.querySelector('#stage-status').textContent=q.open?'LIVE':'PAUSAD';error(document.querySelector('#live-error'),'');}catch(err){if(stopped||lostAccess(err))return;error(document.querySelector('#live-error'),err.message);document.querySelector('#stage-status').textContent='ANSLUTNING BRUTEN';}}if(!stopped)setTimeout(poll,2000);}
 setTimeout(poll,2000);
}
window.addEventListener('pagehide',()=>{stopped=true;});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
try{settings={...settings,...await api('bootstrap')};}catch(err){bootError=err.message;}
initAppearance({user:settings.user,api});
accountControls();
if(mode==='create')createPage();else if(mode==='join'&&!code)joinStart();else if(mode==='join')joinQuestion();else livePage();
