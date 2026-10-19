'use strict';
/* Mobile application-like navigation. Never stores credentials or market data. */
(() => {
 const menu=document.getElementById('mobile-menu-toggle');
 const dock=[...document.querySelectorAll('.dock-item[data-dock]')];
 function active(tab){
   dock.forEach(b=>{const on=b.dataset.dock===tab;
     b.classList.toggle('active',on);
     if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
   if(menu){menu.classList.toggle('active',!dock.some(b=>b.dataset.dock===tab));}
   close();
 }
 function close(){
   document.body.classList.remove('mobile-menu-open');
   if(menu)menu.setAttribute('aria-expanded','false');
 }
 menu?.addEventListener('click',()=>{
   const opening=!document.body.classList.contains('mobile-menu-open');
   document.body.classList.toggle('mobile-menu-open',opening);
   menu.setAttribute('aria-expanded',opening?'true':'false');
 });
 document.querySelectorAll('#desktop-tabs .tab').forEach(b=>b.addEventListener('click',close));
 document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
 window.addEventListener('uzayx:tab',e=>active(e.detail?.tab||'overview'));
 if(['overview','radar','chart','funds','learn','turan','research','system'].includes(location.hash.slice(1)))active(location.hash.slice(1));
 if('serviceWorker' in navigator && location.protocol==='https:'){
   window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js',{scope:'./'}).catch(()=>{}),{once:true});
 }
})();
