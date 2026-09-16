import {escapeHTML as e,renderChart,number} from './charts.js';

export function initResultPrinting(button,getResults,showError,loadResults=null){
 const report=document.createElement('article');
 report.id='print-results';
 document.body.append(report);
 let originalTitle=null;
 let loadedResults=null;

 function prepare(){
  if(originalTitle!==null)return;
  const results=loadedResults||getResults();
  if(!results)return;
  const {question,answers,design}=results,now=new Date();
  const timestamp=new Intl.DateTimeFormat('sv-SE',{dateStyle:'long',timeStyle:'short'}).format(now);
  const questions=results.questions||[{question,answers}];
  const firstQuestion=questions[0].question;
  const firstAnswers=questions[0].answers;
  report.innerHTML=`<header class="print-heading"><p>Puls · Resultat${results.setTitle?` · ${e(results.setTitle)}`:''}</p><p>Kod ${e(firstQuestion.code)} · ${number(firstAnswers.length)} svar · ${firstQuestion.open?'Öppen för svar':'Pausad'}</p><p>Utskrift skapad <time datetime="${now.toISOString()}">${e(timestamp)}</time></p></header>${questions.map(({question:item,answers:values},index)=>`<section class="print-question${index?' print-question-next':''}"><h1>${e(item.title)}</h1><p>Kod ${e(item.code)} · ${number(values.length)} svar · ${item.open?'Öppen för svar':'Pausad'}</p>${renderChart(item,values,{forPrint:true})}</section>`).join('')}`;
    if(design?.images?.logo){
     const image=new Image();image.src=design.images.logo;image.alt='Logotyp';image.className='set-logo';report.querySelector('header').prepend(image);
    }
  originalTitle=document.title;
  document.title=`Puls – ${question.title}`;
  document.body.classList.add('printing-results');
 }

 function finish(){
  if(originalTitle!==null)document.title=originalTitle;
  originalTitle=null;
  loadedResults=null;
  document.body.classList.remove('printing-results');
  report.replaceChildren();
 }

 window.addEventListener('beforeprint',prepare);
 window.addEventListener('afterprint',finish);
 button.addEventListener('click',()=>{
  const load=loadResults?loadResults():null;
  Promise.resolve(load).then(results=>{
   loadedResults=results||getResults();
   if(!loadedResults)return;
   try{window.print();}
   catch{
    finish();
    showError('Utskriften kunde inte öppnas. Försök med webbläsarens meny för att skriva ut.');
   }
  }).catch(err=>showError(err.message||'Resultaten kunde inte hämtas för utskrift.'));
 });
}
