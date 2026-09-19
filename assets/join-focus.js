export function initJoinFocus(app){
 const aside=app.querySelector('.joinaside');
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
