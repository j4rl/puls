export const palette=['#dfff86','#a49bff','#69d9df','#ffb88f','#f092c9','#b8cef7','#ffe29b','#91dcbe','#d9b0f5','#edb6b6'].map((fallback,i)=>`var(--chart-${i+1},${fallback})`);
export const escapeHTML=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const number=(n)=>new Intl.NumberFormat('sv-SE',{maximumSignificantDigits:17}).format(n);
const stopwords=new Set('och att det är en ett som för med till av på jag vi de den det inte om så i'.split(' '));
function livePulse(count){const intensity=Math.min(1,.2+count/80);return `<div class="livepulse" aria-label="Svarspuls"><span class="livepulse-dot" style="--pulse-intensity:${intensity}"></span><span class="livepulse-bars"><i></i><i></i><i></i></span><strong>Svarspuls</strong><small>${number(count)} svar samlade</small></div>`;}
function convergence(question,answers){
 if(!answers.length)return '';
 let score;
 if(['number','scale'].includes(question.kind)){
  const values=answers.filter(value=>typeof value==='number'&&Number.isFinite(value)),range=Number(question.max)-Number(question.min);
  if(!values.length||range<=0)return '';
  const mean=values.reduce((sum,value)=>sum+value,0)/values.length,spread=Math.sqrt(values.reduce((sum,value)=>sum+(value-mean)**2,0)/values.length);
  score=Math.round(Math.max(0,Math.min(1,1-spread/(range/2)))*100);
 }else if(['choice','yesno'].includes(question.kind))score=Math.round(Math.max(...grouped(question,answers).map(item=>item.count))/answers.length*100);
 else return '';
 const label=score>=75?'Gruppen samlas':score>=45?'Blandade perspektiv':'Stor spridning';
 return `<div class="convergence"><div class="convergence-head"><span>Konvergens</span><strong>${score} %</strong></div><div class="convergence-track"><span style="width:${score}%"></span></div><small>${label}</small></div>`;
}
function textClusters(question,answers){
 const texts=answers.filter(value=>typeof value==='string'&&value.trim());if(texts.length<3)return '';
 const tokens=new Map();texts.forEach(text=>{new Set(text.toLocaleLowerCase('sv').normalize('NFC').match(/[\p{L}\p{N}]{3,}/gu)||[]).forEach(token=>{if(!stopwords.has(token))tokens.set(token,(tokens.get(token)||0)+1);});});
 const keywords=[...tokens].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'sv')).slice(0,4).map(([token])=>token);if(!keywords.length)return '';
 const groups=keywords.map(keyword=>({keyword,items:texts.filter(text=>(text.toLocaleLowerCase('sv').match(/[\p{L}\p{N}]{3,}/gu)||[]).includes(keyword))})).filter(group=>group.items.length);
 const assigned=new Set(groups.flatMap(group=>group.items));const other=texts.filter(text=>!assigned.has(text));if(other.length)groups.push({keyword:'Övriga',items:other});
 return `<section class="text-clusters"><div class="cluster-heading"><span>Återkommande teman</span><small>${groups.length} kluster</small></div><div class="cluster-grid">${groups.map(group=>`<article class="cluster"><strong>${escapeHTML(group.keyword)}</strong><b>${group.items.length}</b><p>${escapeHTML(group.items[0])}</p></article>`).join('')}</div></section>`;
}
export function grouped(question,answers){
 if(question.kind==='matrix')return [];
 if(question.kind==='number'){
  const min=Number(question.min),max=Number(question.max);
  if(!Number.isFinite(min)||!Number.isFinite(max)||max<=min)return [];
  // A very narrow range may have fewer than ten representable numeric intervals.
  const rawBoundaries=[...new Set(Array.from({length:11},(_,i)=>i===10?max:min+(max-min)*i/10))];
  // Remove arithmetic noise (0.1 + 0.2) so the displayed boundary also defines the bin.
  const roundedBoundaries=rawBoundaries.map((value,i)=>i===0||i===rawBoundaries.length-1?value:Number(value.toPrecision(15)));
  const boundaries=roundedBoundaries.every((value,i)=>i===0||value>roundedBoundaries[i-1])?roundedBoundaries:rawBoundaries;
  const labels=boundaries.map(number);
  const bins=boundaries.slice(1).map((upper,i)=>({label:`${labels[i]}–${labels[i+1]}`,count:0}));
  answers.forEach(value=>{
   if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)return;
   const index=boundaries.findIndex((upper,i)=>i>0&&value<upper);
   bins[index===-1?bins.length-1:index-1].count++;
  });return bins;
 }
 if(question.kind==='scale')return Array.from({length:question.max-question.min+1},(_,i)=>question.min+i).map(value=>({label:number(value),count:answers.filter(answer=>answer===value).length}));
 if(question.kind==='ranking')return question.options.map(label=>{const positions=answers.map(order=>Array.isArray(order)?order.indexOf(label)+1:0).filter(position=>position>0);return {label,count:positions.length?positions.reduce((sum,position)=>sum+position,0)/positions.length:0};});
 if(['choice','yesno','check'].includes(question.kind))return question.options.map(label=>({label,count:answers.filter(v=>Array.isArray(v)?v.includes(label):v===label).length}));
 const counts=new Map();answers.forEach(v=>{const key=String(v).trim().normalize('NFC').toLocaleLowerCase('sv');counts.set(key,(counts.get(key)||0)+1)});
 return [...counts].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'sv'));
}
export function renderChart(q,answers,{forPrint=false}={}){
 if(!answers.length)return '<div class="liveempty">Inga svar ännu.<br><small>Dela koden och låt de första tankarna komma in.</small></div>';
 const e=escapeHTML,data=grouped(q,answers),max=Math.max(1,...data.map(d=>d.count));
 const percent=v=>Math.round(v/answers.length*100);
 const accessible=`${forPrint?'<section class="datadetails"><h2>Siffrorna bakom diagrammet</h2>':'<details class="datadetails"><summary>Visa siffrorna</summary>'}<ul>${data.map(d=>`<li>${e(d.label)}: ${d.count}${['choice','yesno','check','number'].includes(q.kind)?` (${percent(d.count)} %)`:''}</li>`).join('')}</ul>${q.kind==='number'?'<small>Intervall inkluderar undre gränsen. Det sista inkluderar även max.</small>':''}${forPrint?'</section>':'</details>'}`;
    const pulse=livePulse(answers.length);
 if(q.kind==='matrix'){
  const rows=q.options.rows,columns=q.options.columns;
  const cells=rows.map(row=>columns.map(column=>answers.filter(answer=>answer&&answer[row]===column).length));
  const highest=Math.max(1,...cells.flat());
    return `${pulse}<div class="matrix-chart" role="table"><div class="matrix-chart-row matrix-chart-head"><span></span>${columns.map(column=>`<strong>${e(column)}</strong>`).join('')}</div>${rows.map((row,i)=>`<div class="matrix-chart-row"><strong>${e(row)}</strong>${columns.map((column,j)=>`<span title="${e(column)}: ${cells[i][j]} svar" style="background:color-mix(in srgb,var(--chart-${(j%6)+1}) ${Math.round(cells[i][j]/highest*80)+10}%,transparent)">${cells[i][j]}</span>`).join('')}</div>`).join('')}</div>${forPrint?`<section class="datadetails"><h2>Siffrorna bakom matrisen</h2><p>${answers.length} svar</p></section>`:''}`;
 }
 if(q.kind==='ranking'){
  const maxRank=Math.max(1,q.options.length);
    return `${pulse}<div class="viz ranking-race">${data.map((item,i)=>{const percentValue=Math.round((maxRank-item.count+1)/maxRank*100);return `<div class="baritem"><div class="barlabel"><span>${e(item.label)}</span><b>${number(item.count||0)} plats</b></div><div class="bartrack" aria-hidden="true"><div class="barfill" style="background:${palette[i%palette.length]};width:${percentValue}%"></div></div></div>`}).join('')}</div><p class="small">Genomsnittlig placering. Lägre placering är bättre.</p>${forPrint?accessible:''}`;
 }
 if(q.view==='cards')return `${pulse}<div class="viz cards">${answers.slice(forPrint?0:-200).reverse().map(v=>`<div class="quote">${e(v)}</div>`).join('')}</div>${textClusters(q,answers)}${!forPrint&&answers.length>200?'<p class="small">De 200 senaste svaren visas.</p>':''}`;
 if(q.view==='cloud')return `${pulse}<div class="viz cloud">${data.slice(0,80).map((d,i)=>`<span style="font-size:${Math.round(20+40*d.count/max)}px;color:${palette[i%palette.length]}" title="${e(d.label)}: ${d.count} svar">${e(d.label)}</span>`).join('')}</div>${textClusters(q,answers)}${data.length>80?'<p class="small">De 80 vanligaste orden visas.</p>':''}${accessible}`;
 if(q.view==='thermo'){
  const mean=answers.reduce((a,b)=>a+b,0)/answers.length;
  const formattedMean=new Intl.NumberFormat('sv-SE',{maximumSignificantDigits:6}).format(mean);
    return `${pulse}<div class="viz thermo"><div class="thermotube" aria-hidden="true"><div class="thermofill" style="height:${Math.max(0,Math.min(100,(mean-q.min)/(q.max-q.min)*100))}%"></div></div><div><div class="eyebrow">Medelvärde</div><div class="thermovalue">${formattedMean}</div><p class="small">På skalan ${number(q.min)}–${number(q.max)}</p></div></div><p class="small">Lägsta: ${number(Math.min(...answers))} · Högsta: ${number(Math.max(...answers))}</p>${convergence(q,answers)}${accessible}`;
 }
 if(q.view==='pie'){
  let cumulative=0;const gradient=data.filter(d=>d.count).map(d=>{const i=data.indexOf(d),start=cumulative;cumulative+=d.count/answers.length*100;return `${palette[i%palette.length]} ${start}% ${cumulative}%`}).join(',');
   return `${pulse}<div class="viz chartcircle"><div class="donut" style="background:conic-gradient(${gradient})" aria-hidden="true"><b>${answers.length}</b></div><div class="legend">${data.map((d,i)=>`<div><i style="background:${palette[i%palette.length]}"></i>${e(d.label)} <b>${percent(d.count)} %</b></div>`).join('')}</div></div>${convergence(q,answers)}${accessible}`;
 }
 return `${pulse}<div class="viz">${data.map((d,i)=>`<div class="baritem"><div class="barlabel"><span>${e(d.label)}</span><b>${number(d.count)} <span class="barpercent">(${percent(d.count)} %)</span></b></div><div class="bartrack" aria-hidden="true"><div class="barfill" style="background:${palette[i%palette.length]};width:${percent(d.count)}%"></div></div></div>`).join('')}</div>${q.kind==='check'?'<p class="small">Andel deltagare per alternativ. Summan kan överstiga 100 %.</p>':''}${['number','scale'].includes(q.kind)?`${convergence(q,answers)}<p class="small">Fördelning av svar inom frågans intervall.</p>`:''}${['choice','yesno'].includes(q.kind)?convergence(q,answers):''}`;
}
