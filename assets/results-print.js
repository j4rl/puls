import {escapeHTML as e,renderChart,number} from './charts.js';

export function initResultPrinting(button,getResults,showError){
 const report=document.createElement('article');
 report.id='print-results';
 document.body.append(report);
 let originalTitle=null;

 function prepare(){
  if(originalTitle!==null)return;
  const results=getResults();
  if(!results)return;
  const {question,answers,design}=results,now=new Date();
  const timestamp=new Intl.DateTimeFormat('sv-SE',{dateStyle:'long',timeStyle:'short'}).format(now);
  report.innerHTML=`<header class="print-heading"><p>Puls · Resultat</p><h1>${e(question.title)}</h1><p>Kod ${e(question.code)} · ${number(answers.length)} svar · ${question.open?'Öppen för svar':'Pausad'}</p><p>Utskrift skapad <time datetime="${now.toISOString()}">${e(timestamp)}</time></p></header>${renderChart(question,answers,{forPrint:true})}`;
  for(const slot of ['foreground','logo'])if(design?.images?.[slot]){
   const image=new Image();image.src=design.images[slot];image.alt=slot==='logo'?'Logotyp':'';image.className=slot==='logo'?'set-logo':'set-foreground';report.querySelector('header').prepend(image);
  }
  originalTitle=document.title;
  document.title=`Puls – ${question.title}`;
  document.body.classList.add('printing-results');
 }

 function finish(){
  if(originalTitle!==null)document.title=originalTitle;
  originalTitle=null;
  document.body.classList.remove('printing-results');
  report.replaceChildren();
 }

 window.addEventListener('beforeprint',prepare);
 window.addEventListener('afterprint',finish);
 button.addEventListener('click',()=>{
  if(!getResults())return;
  try{window.print();}
  catch{
   finish();
   showError('Utskriften kunde inte öppnas. Försök med webbläsarens meny för att skriva ut.');
  }
 });
}
