import {escapeHTML as e} from './charts.js';

const types=[['sentence','Fritext'],['yesno','Ja / nej'],['number','Värde']];
const newField=(kind='sentence')=>({kind,title:'',options:kind==='yesno'?['Ja','Nej']:[],min:0,max:10,view:kind==='sentence'?'cards':kind==='yesno'?'pie':'thermo'});

export function initCardBuilder(){
 const element=document.createElement('fieldset');element.className='card-builder';element.hidden=true;element.disabled=true;
 element.innerHTML='<legend>Delfrågor på kortet</legend><p class="small muted">Alla delfrågor besvaras tillsammans. Varje deltagares svar visas på ett eget kort. Lägg till 2–10 delfrågor.</p><div class="card-fields"></div><button type="button" class="textbutton" data-card-add>＋ Lägg till delfråga</button>';
 const list=element.querySelector('.card-fields');
 const changed=()=>element.dispatchEvent(new Event('input',{bubbles:true}));
 function append(field){
  const row=document.createElement('section');row.className='card-field';
  row.innerHTML=`<div class="card-field-heading"><strong class="card-field-position"></strong><button type="button" class="textbutton" data-card-remove>Ta bort</button></div><label class="field"><span>Frågetyp</span><select data-card-kind>${types.map(([kind,label])=>`<option value="${kind}">${label}</option>`).join('')}</select></label><label class="field"><span>Delfråga</span><input data-card-title required maxlength="240" placeholder="Vad vill du fråga?"></label><div class="rangefields" data-card-range><label class="field"><span>Minsta värde</span><input type="number" data-card-min min="-1000000" max="1000000" step="any" required></label><label class="field"><span>Största värde</span><input type="number" data-card-max min="-1000000" max="1000000" step="any" required></label></div>`;
  row.querySelector('[data-card-kind]').value=field.kind;
  row.querySelector('[data-card-title]').value=field.title;
  row.querySelector('[data-card-min]').value=field.min??0;
  row.querySelector('[data-card-max]').value=field.max??10;
  const update=()=>{
   const numeric=row.querySelector('[data-card-kind]').value==='number';
   row.querySelector('[data-card-range]').hidden=!numeric;
   row.querySelectorAll('[data-card-range] input').forEach(input=>input.disabled=!numeric);
   const min=row.querySelector('[data-card-min]'),max=row.querySelector('[data-card-max]');
   max.setCustomValidity(numeric&&max.valueAsNumber<=min.valueAsNumber?'Största värdet måste vara större än det minsta.':'');
  };
  row.addEventListener('input',update);
  row.querySelector('[data-card-kind]').addEventListener('change',()=>{update();changed();});
  row.querySelector('[data-card-remove]').addEventListener('click',()=>{
   if(list.children.length<=2)return;
   const next=row.nextElementSibling||row.previousElementSibling;row.remove();renumber();next.querySelector('[data-card-kind]').focus();changed();
  });
  list.append(row);update();renumber();
 }
 function renumber(){
  [...list.children].forEach((row,i)=>{row.querySelector('.card-field-position').textContent=`Delfråga ${i+1}`;const remove=row.querySelector('[data-card-remove]');remove.disabled=list.children.length<=2;remove.setAttribute('aria-label',`Ta bort delfråga ${i+1}`);});
  element.querySelector('[data-card-add]').disabled=list.children.length>=10;
 }
 element.querySelector('[data-card-add]').addEventListener('click',()=>{if(list.children.length>=10)return;append(newField());list.lastElementChild.querySelector('[data-card-title]').focus();changed();});
 function load(fields=[newField('sentence'),newField('yesno'),newField('number')]){list.replaceChildren();fields.forEach(append);}
 load();
 return {element,load,setActive(active){element.hidden=!active;element.disabled=!active;},value(){return [...list.children].map(row=>{
  const field=newField(row.querySelector('[data-card-kind]').value);field.title=row.querySelector('[data-card-title]').value.trim();
  if(field.kind==='number'){field.min=row.querySelector('[data-card-min]').valueAsNumber;field.max=row.querySelector('[data-card-max]').valueAsNumber;}
  return field;
 });}};
}

export function cardAnswerInputs(q){
 return `<div class="card-answer-fields">${q.options.map((field,i)=>field.kind==='yesno'?`<fieldset class="card-answer-field"><legend>${e(field.title)}</legend>${['Ja','Nej'].map(value=>`<label class="answerchoice"><input type="radio" name="card-${i}" value="${value}" required><span>${value}</span></label>`).join('')}</fieldset>`:`<label class="field card-answer-field"><span>${e(field.title)}${field.kind==='number'?` (${e(field.min)}–${e(field.max)})`:''}</span>${field.kind==='number'?`<input type="number" name="card-${i}" min="${e(field.min)}" max="${e(field.max)}" step="any" required>`:`<textarea name="card-${i}" rows="3" maxlength="500" required></textarea>`}</label>`).join('')}</div>`;
}

export function readCardAnswer(q,form){
 return q.options.map((field,i)=>field.kind==='number'?form.elements[`card-${i}`].valueAsNumber:form.elements[`card-${i}`].value.trim());
}

export function invalidCard(q){
 return q.options.length<2||q.options.length>10||q.options.some(field=>!field.title||!types.some(([kind])=>kind===field.kind)||(field.kind==='number'&&(!Number.isFinite(field.min)||!Number.isFinite(field.max)||field.min>=field.max||Math.abs(field.min)>1000000||Math.abs(field.max)>1000000)));
}
