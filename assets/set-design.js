import {escapeHTML as e} from './charts.js';

const defaults={background:'#f4f5f9',surface:'#ffffff',text:'#20213a',primary:'#4941ce'};
const slots={background:'Bakgrundsbild',foreground:'Förgrundsbild',logo:'Logotyp'};
const presets={Puls:defaults,Skog:{background:'#e8f0e9',surface:'#ffffff',text:'#173d2a',primary:'#276847'},Hav:{background:'#e9f4fa',surface:'#ffffff',text:'#133c53',primary:'#126a99'},Natt:{background:'#141422',surface:'#252444',text:'#f5f3ff',primary:'#b6adff'}};
const contrast=hex=>{const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#111111':'#ffffff';};
const tokens=colors=>colors?{'--bg':colors.background,'--surface':colors.surface,'--surface-muted':colors.surface,'--text':colors.text,'--muted':colors.text,'--primary':colors.primary,'--primary-hover':colors.primary,'--primary-contrast':contrast(colors.primary),'--border':`color-mix(in srgb, ${colors.text} 25%, ${colors.surface})`,'--stage-background':colors.surface,'--stage-foreground':colors.text,'--stage-muted':colors.text,'--chart-1':colors.primary}:{};

export function createSetDesignEditor(initial=null){
 const element=document.createElement('details');element.className='set-design-editor';
 element.innerHTML=`<summary>Färgtema och bilder för setet</summary><p class="small muted">Bakgrunden ligger bakom innehållet. Förgrundsbild och logotyp visas ovanför frågan.</p><label class="set-toggle"><input type="checkbox" data-custom-colors><span>Använd eget färgtema</span></label><label class="field"><span>Utgå från ett färgtema</span><select data-preset>${Object.keys(presets).map(name=>`<option>${name}</option>`).join('')}</select></label><div class="set-color-fields">${Object.entries({background:'Bakgrund',surface:'Frågeruta',text:'Text',primary:'Knappar och accent'}).map(([key,label])=>`<label><span>${label}</span><input type="color" data-color="${key}" aria-label="${label}"></label>`).join('')}</div><div class="set-image-fields">${Object.entries(slots).map(([key,label])=>`<div><label class="field"><span>${label} (valfri)</span><input type="file" data-image="${key}" accept="image/png,image/jpeg,image/webp"></label><div class="set-image-preview" data-thumbnail="${key}"></div><button type="button" class="textbutton" data-remove="${key}">Ta bort ${label.toLocaleLowerCase('sv')}</button></div>`).join('')}</div><p class="small muted">PNG, JPEG eller WebP. Högst 1 MB och 4096 × 4096 pixlar per bild. Transparenta bilder fungerar som förgrund och logotyp.</p><div data-design-error class="error" role="alert" hidden></div><div class="set-design-preview" aria-label="Förhandsvisning av setets utseende"><div class="set-design-preview-card"><div data-preview-branding></div><h3>Så här visas din fråga</h3><p>Frågor och svar får setets eget utseende.</p><span class="btn primary">Skicka svar →</span></div></div><button type="button" class="textbutton" data-reset-design>Återställ färgtema och ta bort bilder</button>`;
 let colors={...defaults,...initial?.colors},custom=Boolean(initial?.colors),images={...initial?.images},pending=new Set(),problems={},versions={};
 const find=selector=>element.querySelector(selector);
 function preview(){
  find('[data-custom-colors]').checked=custom;
  element.querySelectorAll('[data-color]').forEach(input=>{input.value=colors[input.dataset.color];input.disabled=!custom;});
  for(const key of Object.keys(slots)){
   const box=find(`[data-thumbnail="${key}"]`);box.replaceChildren();
   if(images[key]){const image=new Image();image.src=images[key];image.alt=slots[key];box.append(image);}
   find(`[data-remove="${key}"]`).disabled=!images[key]&&!pending.has(key)&&!problems[key];
  }
  const box=find('.set-design-preview');box.removeAttribute('style');
  for(const [key,value] of Object.entries(tokens(custom?colors:defaults)))box.style.setProperty(key,value);
  box.style.backgroundImage=images.background?`url("${images.background}")`:'none';
  find('[data-preview-branding]').innerHTML=branding({images},'Förhandsvisning');
  const message=Object.values(problems).join(' ');find('[data-design-error]').textContent=message;find('[data-design-error]').hidden=!message;
 }
 find('[data-custom-colors]').addEventListener('change',event=>{custom=event.target.checked;preview();});
 find('[data-preset]').addEventListener('change',event=>{colors={...presets[event.target.value]};custom=true;preview();});
 element.querySelectorAll('[data-color]').forEach(input=>input.addEventListener('input',()=>{colors[input.dataset.color]=input.value;preview();}));
 element.querySelectorAll('[data-image]').forEach(input=>input.addEventListener('change',async()=>{
  const key=input.dataset.image,file=input.files[0];if(!file)return;
  const version=versions[key]=(versions[key]||0)+1;pending.add(key);delete problems[key];preview();
  try{
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>1048576)throw Error(`${slots[key]}: välj PNG, JPEG eller WebP, högst 1 MB.`);
   const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Bilden kunde inte läsas.'));reader.readAsDataURL(file);});
   const image=new Image();image.src=data;await image.decode();
   if(image.naturalWidth>4096||image.naturalHeight>4096)throw Error('Bilden får vara högst 4096 × 4096 pixlar.');
   if(versions[key]===version)images[key]=data;
  }catch(err){if(versions[key]===version)problems[key]=err.message||'Bilden kunde inte läsas.';}
  finally{if(versions[key]===version){pending.delete(key);preview();}}
 }));
 element.querySelectorAll('[data-remove]').forEach(button=>button.addEventListener('click',()=>{
  const key=button.dataset.remove;versions[key]=(versions[key]||0)+1;pending.delete(key);delete problems[key];images[key]=null;find(`[data-image="${key}"]`).value='';preview();
 }));
 find('[data-reset-design]').addEventListener('click',()=>{
  for(const key of Object.keys(slots)){versions[key]=(versions[key]||0)+1;find(`[data-image="${key}"]`).value='';}
  images={};pending.clear();problems={};colors={...defaults};custom=false;preview();
 });
 preview();
 return {element,refresh:preview,value(){
  if(pending.size)throw Error('Vänta tills bilderna har lästs in.');
  if(Object.keys(problems).length)throw Error(Object.values(problems).join(' '));
  return {colors:custom?{...colors}:null,images:Object.fromEntries(Object.keys(slots).map(key=>[key,images[key]?(images[key].startsWith('data:')?images[key]:'keep'):null]))};
 }};
}

function branding(design,title){
 const images=design?.images||{};
 return `${images.logo?`<img class="set-logo" src="${e(images.logo)}" alt="${e(title)} – logotyp">`:''}${images.foreground?`<img class="set-foreground" src="${e(images.foreground)}" alt="">`:''}`;
}

export function applySetDesign(app,set){
 const design=set?.design;
 const signature=JSON.stringify(design);
 if(app.dataset.designVersion!==signature){
  for(const key of Object.keys(tokens(defaults)))app.style.removeProperty(key);
  for(const [key,value] of Object.entries(tokens(design?.colors)))app.style.setProperty(key,value);
  app.classList.toggle('set-themed',Boolean(design?.colors||Object.keys(design?.images||{}).length));app.dataset.designVersion=signature;
  document.querySelector('#set-backdrop')?.remove();
  if(design?.colors||design?.images?.background){
   const backdrop=document.createElement('div');backdrop.id='set-backdrop';backdrop.setAttribute('aria-hidden','true');
   backdrop.style.backgroundColor=design.colors?.background||'var(--bg)';
   if(design.images?.background)backdrop.style.backgroundImage=`url("${design.images.background}")`;
   document.body.prepend(backdrop);
  }
 }
 const target=app.querySelector('.stage,.joincard');if(!target)return;
 const html=branding(design,set.title);
 let brand=target.querySelector(':scope > .set-branding');
 if(!html){brand?.remove();return;}
 if(!brand){brand=document.createElement('div');brand.className='set-branding';target.prepend(brand);}
 if(brand.dataset.version!==signature){brand.innerHTML=html;brand.dataset.version=signature;}
}

export function editSetDesign({set,api,code,onSaved,action='set-design',heading='Utseende för frågesetet'}){
 if(document.querySelector('#set-design-dialog'))return;
 const dialog=document.createElement('dialog');dialog.id='set-design-dialog';dialog.className='appearance-dialog';dialog.setAttribute('aria-labelledby','set-design-title');
 dialog.innerHTML=`<h2 id="set-design-title">${e(heading)}</h2><div data-editor></div><div data-save-error role="alert"></div><div class="dialog-actions"><button type="button" class="btn primary" data-save>Spara utseende</button><button type="button" class="btn" data-cancel>Avbryt</button></div>`;
 const editor=createSetDesignEditor(set.design);editor.element.open=true;dialog.querySelector('[data-editor]').append(editor.element);
 let busy=false;
 dialog.querySelector('[data-cancel]').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 dialog.querySelector('[data-save]').addEventListener('click',async()=>{
  if(busy)return;
  try{
   const value=editor.value();busy=true;
   dialog.querySelectorAll('button,input,select').forEach(input=>input.disabled=true);
    const response=await api(action,{code,data:value});onSaved(response.design);dialog.close();
  }catch(err){dialog.querySelector('[data-save-error]').textContent=err.message;}
  finally{busy=false;if(dialog.isConnected){dialog.querySelectorAll('button,input,select').forEach(input=>input.disabled=false);editor.refresh();}}
 });
 document.body.append(dialog);dialog.showModal();
}
