import {escapeHTML as e} from './charts.js';
import {createSetDesignEditor} from './set-design.js';

export function initSetBuilder({form,draft,loadDraft,openEditor}){
 const panel=document.createElement('section');panel.className='set-builder';
 panel.innerHTML='<label class="set-toggle"><input type="checkbox" id="use-set"><span>Samla frågor i ett frågeset</span></label><div id="set-settings" hidden><label class="field"><span>Namn på frågesetet</span><input id="set-title" maxlength="240" placeholder="Till exempel: Dagens reflektion" disabled></label><label class="field"><span>När visas nästa fråga?</span><select id="set-progression" disabled><option value="automatic">Automatiskt efter deltagarens svar</option><option value="host">Jag bestämmer när nästa fråga öppnas</option></select></label><p class="small muted">Alla frågor delar samma deltagarkod. Ordningen nedan används när deltagarna svarar.</p><ol id="set-question-list" aria-label="Frågor i setet"></ol><div class="row set-edit-actions"><button class="btn" type="button" id="set-add">＋ Lägg till fråga</button><button class="btn" type="button" id="set-up">Flytta upp</button><button class="btn" type="button" id="set-down">Flytta ned</button><button class="btn" type="button" id="set-remove">Ta bort ur setet</button></div><p class="small muted" id="set-editor-status" role="status"></p></div>';
 form.prepend(panel);
 const toggle=panel.querySelector('#use-set'),settings=panel.querySelector('#set-settings'),title=panel.querySelector('#set-title'),progression=panel.querySelector('#set-progression');
 const appearanceSection=document.createElement('section');appearanceSection.className='builder-section appearance-section';appearanceSection.hidden=true;appearanceSection.innerHTML='<div class="stephead"><span class="stepnum">03</span><div><h2>Utseende</h2><p class="small muted">Ändra färger och bilder separat från frågorna.</p></div></div>';const designEditor=createSetDesignEditor();appearanceSection.append(designEditor.element);form.append(appearanceSection);
 let questions=[draft()],index=0;
 const capture=()=>{questions[index]=draft();};
 function draw(){
  panel.querySelector('#set-question-list').innerHTML=questions.map((q,i)=>`<li><button type="button" class="btn" data-index="${i}" aria-current="${i===index?'step':'false'}">${i+1}. ${e(q.title||'Ny fråga')}</button></li>`).join('');
  panel.querySelectorAll('[data-index]').forEach(button=>button.addEventListener('click',()=>{capture();index=Number(button.dataset.index);loadDraft(questions[index]);draw();openEditor?.();}));
  panel.querySelector('#set-up').disabled=index===0;
  panel.querySelector('#set-down').disabled=index===questions.length-1;
  panel.querySelector('#set-remove').disabled=questions.length===1;
  panel.querySelector('#set-add').disabled=questions.length>=20;
  panel.querySelector('#set-editor-status').textContent=`Redigerar fråga ${index+1} av ${questions.length}. Högst 20 frågor per set.`;
 }
 toggle.addEventListener('change',()=>{
  settings.hidden=!toggle.checked;title.disabled=progression.disabled=!toggle.checked;title.required=toggle.checked;
    appearanceSection.hidden=!toggle.checked;
  capture();draw();form.querySelector('#publish').textContent=toggle.checked?'Publicera frågeset ↗':'Publicera fråga ↗';
 });
 form.querySelector('#question-title').addEventListener('input',()=>{if(toggle.checked){capture();draw();}});
 panel.querySelector('#set-add').addEventListener('click',()=>{
  if(questions.length>=20)return;capture();questions.push({kind:'choice',title:'',options:['',''],min:0,max:10,view:'bars'});index=questions.length-1;loadDraft(questions[index]);draw();openEditor?.();form.querySelector('#question-title').focus();
 });
 for(const [id,delta] of [['set-up',-1],['set-down',1]])panel.querySelector('#'+id).addEventListener('click',()=>{
  const next=index+delta;if(next<0||next>=questions.length)return;capture();[questions[index],questions[next]]=[questions[next],questions[index]];index=next;draw();openEditor?.();
 });
 panel.querySelector('#set-remove').addEventListener('click',()=>{
  if(questions.length===1)return;questions.splice(index,1);index=Math.min(index,questions.length-1);loadDraft(questions[index]);draw();openEditor?.();form.querySelector('#question-title').focus();
 });
 return {
  get enabled(){return toggle.checked;},
  payload(){
   if(!toggle.checked)return draft();
   capture();
   for(let i=0;i<questions.length;i++){
    const q=questions[i];
    const labels=q.kind==='matrix'?q.options.rows:q.options;
    const invalid=!q.title||(['choice','check','ranking'].includes(q.kind)&&(labels.length<2||labels.some(o=>!o)||new Set(labels.map(o=>o.toLocaleLowerCase('sv'))).size!==labels.length))||(q.kind==='matrix'&&(labels.length<2||labels.some(o=>!o)||q.options.columns.length<2))||(q.kind==='scale'&&(!Number.isInteger(q.min)||!Number.isInteger(q.max)||q.min>=q.max||q.max-q.min>10))||(['number'].includes(q.kind)&&(!Number.isFinite(q.min)||!Number.isFinite(q.max)||q.min>=q.max||Math.abs(q.min)>1000000||Math.abs(q.max)>1000000));
    if(invalid){index=i;loadDraft(q);draw();form.querySelector('#question-title').focus();throw Error(`Kontrollera fråga ${i+1}: skriv en fråga och giltiga, unika svarsalternativ eller ett giltigt intervall.`);}
   }
   return {title:title.value.trim(),progression:progression.value,questions,design:designEditor.value()};
  }
 };
}
