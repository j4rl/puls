export function initJoinFocus(app){
 const aside=app.querySelector('.joinaside');
 const stage=app.querySelector('.stage');
 const invitation=document.createElement('details');
 invitation.className='fullscreen-invitation';
 invitation.innerHTML='<summary>QR-kod och deltagarkod</summary><div class="fullscreen-invitation-content"><canvas role="img" aria-label="QR-kod för att svara"></canvas><div><p>Skanna & svara</p><div class="bigcode"></div><p class="fullscreen-invitation-address"></p></div></div>';
 invitation.querySelector('.bigcode').textContent=aside.querySelector('.bigcode').textContent;
 const joinUrl=new URL(aside.querySelector('a[target="_blank"]').href);
 invitation.querySelector('.fullscreen-invitation-address').textContent=joinUrl.host+joinUrl.pathname;
 stage.prepend(invitation);
 let qrReady=false;
 invitation.addEventListener('toggle',async()=>{
  if(!invitation.open||qrReady)return;
  try{
   await window.PulsQR.toCanvas(invitation.querySelector('canvas'),joinUrl.href,{width:240,margin:3,errorCorrectionLevel:'M',color:{dark:'#252444',light:'#ffffff'}});
   qrReady=true;
  }catch{
   invitation.querySelector('canvas').hidden=true;
  }
 });
 const placeholder=document.createComment('Invitation card position');
 aside.before(placeholder);
 const button=document.createElement('button');
 button.id='focus-join';button.type='button';button.className='btn';button.textContent='Visa bara QR-kod';
 button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','join-focus-dialog');
 aside.querySelector('#copy-link').before(button);
 const dialog=document.createElement('dialog');
 dialog.id='join-focus-dialog';dialog.className='join-focus-dialog';dialog.setAttribute('aria-label','QR-kod och deltagarkod');
 dialog.innerHTML='<div class="join-focus-toolbar"><button type="button" class="btn" autofocus>← Tillbaka</button></div><div class="join-focus-content"></div>';
 app.append(dialog);
 let trigger;
 function open(event){
  if(dialog.open)return;
  trigger=event.currentTarget;button.hidden=true;
  dialog.querySelector('.join-focus-content').append(aside);
  dialog.showModal();
 }
 button.addEventListener('click',open);
 dialog.querySelector('button').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{
  if(!placeholder.isConnected)return;
  placeholder.after(aside);button.hidden=false;
  if(trigger?.isConnected)trigger.focus({preventScroll:true});
 });
 return open;
}
