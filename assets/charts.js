export const palette=['#dfff86','#a49bff','#69d9df','#ffb88f','#f092c9','#b8cef7','#ffe29b','#91dcbe','#d9b0f5','#edb6b6'].map((fallback,i)=>`var(--chart-${i+1},${fallback})`);
export const escapeHTML=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const number=(n)=>new Intl.NumberFormat('sv-SE',{maximumSignificantDigits:17}).format(n);
export function grouped(question,answers){
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
 if(['choice','yesno','check'].includes(question.kind))return question.options.map(label=>({label,count:answers.filter(v=>Array.isArray(v)?v.includes(label):v===label).length}));
 const counts=new Map();answers.forEach(v=>{const key=String(v).trim().normalize('NFC').toLocaleLowerCase('sv');counts.set(key,(counts.get(key)||0)+1)});
 return [...counts].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'sv'));
}
export function renderChart(q,answers){
 if(!answers.length)return '<div class="liveempty">Inga svar ännu.<br><small>Dela koden och låt de första tankarna komma in.</small></div>';
 const e=escapeHTML,data=grouped(q,answers),max=Math.max(1,...data.map(d=>d.count));
 const percent=v=>Math.round(v/answers.length*100);
 const accessible=`<details class="datadetails"><summary>Visa siffrorna</summary><ul>${data.map(d=>`<li>${e(d.label)}: ${d.count}${['choice','yesno','check','number'].includes(q.kind)?` (${percent(d.count)} %)`:''}</li>`).join('')}</ul>${q.kind==='number'?'<small>Intervall inkluderar undre gränsen. Det sista inkluderar även max.</small>':''}</details>`;
 if(q.view==='cards')return `<div class="viz cards">${answers.slice(-200).reverse().map(v=>`<div class="quote">${e(v)}</div>`).join('')}</div>${answers.length>200?'<p class="small">De 200 senaste svaren visas.</p>':''}`;
 if(q.view==='cloud')return `<div class="viz cloud">${data.slice(0,80).map((d,i)=>`<span style="font-size:${Math.round(20+40*d.count/max)}px;color:${palette[i%palette.length]}" title="${e(d.label)}: ${d.count} svar">${e(d.label)}</span>`).join('')}</div>${data.length>80?'<p class="small">De 80 vanligaste orden visas.</p>':''}${accessible}`;
 if(q.view==='thermo'){
  const mean=answers.reduce((a,b)=>a+b,0)/answers.length;
  const formattedMean=new Intl.NumberFormat('sv-SE',{maximumSignificantDigits:6}).format(mean);
  return `<div class="viz thermo"><div class="thermotube" aria-hidden="true"><div class="thermofill" style="height:${Math.max(0,Math.min(100,(mean-q.min)/(q.max-q.min)*100))}%"></div></div><div><div class="eyebrow">Medelvärde</div><div class="thermovalue">${formattedMean}</div><p class="small">På skalan ${number(q.min)}–${number(q.max)}</p></div></div><p class="small">Lägsta: ${number(Math.min(...answers))} · Högsta: ${number(Math.max(...answers))}</p>${accessible}`;
 }
 if(q.view==='pie'){
  let cumulative=0;const gradient=data.filter(d=>d.count).map(d=>{const i=data.indexOf(d),start=cumulative;cumulative+=d.count/answers.length*100;return `${palette[i%palette.length]} ${start}% ${cumulative}%`}).join(',');
  return `<div class="viz chartcircle"><div class="donut" style="background:conic-gradient(${gradient})" aria-hidden="true"><b>${answers.length}</b></div><div class="legend">${data.map((d,i)=>`<div><i style="background:${palette[i%palette.length]}"></i>${e(d.label)} <b>${percent(d.count)} %</b></div>`).join('')}</div></div>${accessible}`;
 }
 return `<div class="viz">${data.map((d,i)=>`<div class="baritem"><div class="barlabel"><span>${e(d.label)}</span><b>${d.count} <span class="barpercent">(${percent(d.count)} %)</span></b></div><div class="bartrack" aria-hidden="true"><div class="barfill" style="background:${palette[i%palette.length]};width:${percent(d.count)}%"></div></div></div>`).join('')}</div>${q.kind==='check'?'<p class="small">Andel deltagare per alternativ. Summan kan överstiga 100 %.</p>':''}${q.kind==='number'?'<p class="small">Intervall inkluderar undre gränsen. Det sista inkluderar även max.</p>':''}`;
}
