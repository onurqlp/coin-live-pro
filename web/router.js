'use strict';
/* COIN.LIVE PRO v2.1 — accessible six-workspace router.
 * All data processing remains in existing read-only modules; route selection
 * never changes, backfills or synthesizes market data or paper outcomes.
 */
(()=>{
 const routes={
   radar:{label:'⚡ Radar',title:'Radar'},
   grafikler:{label:'📈 Grafikler',title:'Grafikler'},
   portfoy:{label:'🧪 Sanal Portföy',title:'Sanal Portföy'},
   gecmis:{label:'🧭 Geçmiş',title:'Kıvılcım Geçmişi'},
   rapor:{label:'📊 7/14 Gün',title:'7/14 Günlük Rapor'},
   sistem:{label:'🩺 Sistem Sağlığı',title:'Sistem Sağlığı'}
 };
 let last='';
 function selectRoute(){
   const key=decodeURIComponent(location.hash.slice(1)).toLocaleLowerCase('tr-TR');
   return Object.prototype.hasOwnProperty.call(routes,key)?key:'radar';
 }
 function renderRoute(){
   const key=selectRoute(),r=routes[key],changed=key!==last;
   for(const el of document.querySelectorAll('.workspaceView')){
     const selected=el.dataset.view===key;
     el.hidden=!selected;
     el.setAttribute('aria-hidden',selected?'false':'true');
   }
   for(const link of document.querySelectorAll('[data-nav]')){
     const active=link.dataset.nav===key;
     if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
     link.classList.toggle('active',active);
   }
   const current=document.getElementById('routeCurrent');
   if(current)current.textContent=r.label;
   document.title=r.title+' · COIN.LIVE PRO 2.1';
   document.body.dataset.route=key;
   if(changed){
     last=key;
     window.scrollTo({top:0,behavior:'instant'});
     // Existing canvas chart repaints when it becomes visible.
     if(key==='grafikler')requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
   }
 }
 async function sourceStatus(){
   const el=document.getElementById('cronIndicator');if(!el)return;
   try{
     const timeout=new AbortController();
     const h=setTimeout(()=>timeout.abort(),7000);
     let r;
     try{r=await fetch('./data/health.json?age='+Date.now(),{cache:'no-store',signal:timeout.signal});}
     finally{clearTimeout(h);}
     if(!r.ok)throw Error('HTTP '+r.status);
     const d=await r.json(),age=(Date.now()-Date.parse(d.updated_at))/60000;
     const fresh=Number.isFinite(age)&&age>=-2&&age<=25;
     el.classList.toggle('verified',Boolean(d.schedule_proven)&&fresh);
     el.classList.toggle('degraded',!fresh);
     el.textContent=!fresh?'● Veri '+(Number.isFinite(age)?Math.round(age)+' dk eski':'doğrulanamadı')+' · Sağlığı aç ↗':
       d.schedule_proven?'● Gerçek cron çalışması doğrulandı ↗':
       '● Cron doğrulaması bekleniyor ↗';
   }catch(e){
     el.classList.add('degraded');el.textContent='● Sunucu sağlığı okunamadı ↗';
   }
 }
 window.addEventListener('hashchange',renderRoute);
 document.addEventListener('DOMContentLoaded',renderRoute);
 renderRoute();
 sourceStatus();
 setInterval(sourceStatus,90000);
})();