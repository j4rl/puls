import {initAppearance} from './appearance.js';

async function api(action){
 const response=await fetch(`api.php?action=${encodeURIComponent(action)}`,{credentials:'same-origin',cache:'no-store'});
 const body=await response.json();
 if(!response.ok)throw Error(body.error||'Kunde inte läsa Puls-inställningarna.');
 return body;
}

try{
 const settings=await api('bootstrap');
 initAppearance({user:settings.user,api:(action,{data}={})=>fetch(`api.php?action=${encodeURIComponent(action)}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':settings.csrf},body:JSON.stringify(data)}).then(async response=>{const body=await response.json();if(!response.ok)throw Object.assign(Error(body.error||'Något gick fel.'),{status:response.status});return body;})});
}catch{
 initAppearance({user:null,api});
}
