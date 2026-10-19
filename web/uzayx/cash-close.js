/* Owner-authorized shared paper close. Browser never edits cash or holds a token. */
(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.UzayXCashClose=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const WORKFLOW_URL='https://github.com/onurqlp/coin-live-pro/actions/workflows/uzayx-close-all.yml';
 const KEY='uzayx.pendingPaperClose.v1';
 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 const money=v=>finite(v)?v.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' USDT':'—';
 const stamp=v=>new Date(v).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
 function completed(report,doc,pending){
   const at=Date.parse(report?.closed_at_utc||'');
   return Boolean(pending&&finite(pending.at)&&Number.isFinite(at)&&at>=pending.at-120000&&at<=Date.now()+120000&&
     /^uzayx-manual-\d+$/.test(report?.request_id||'')&&report.request_id!==pending.before&&
     report.request_id===doc?.close_request_id&&report.all_active_positions_closed===true&&
     report.real_orders===false&&Array.isArray(report.positions)&&Array.isArray(report.cancelled)&&finite(report.spark_equity_after_usdt));
 }
 function summary(report){
   return report.positions.length+' sanal pozisyon kapatıldı; '+report.cancelled.length+
     ' bekleyen giriş iptal edildi. Spark bakiyesi: '+money(report.spark_equity_after_usdt)+
     ' · '+stamp(report.closed_at_utc)+' TSİ. Kâr/zarar ve geçmiş korundu.';
 }
 let pending=null,source=null,readCommit=null,sequence=0,timer=null;
 const $=id=>root.document?.getElementById(id);
 function persist(){try{if(pending)root.sessionStorage?.setItem(KEY,JSON.stringify(pending));else root.sessionStorage?.removeItem(KEY);}catch{}}
 function message(text){const item=$('cash-close-message');if(item)item.textContent=text;}
 function waiting(){
   if(!pending)return;
   message(Date.now()-pending.at>20*60000?
     'Henüz yeni kapanış kaydı gelmedi. GitHub ekranında çalıştırma ve sonuç durumunu kontrol et.':
     'Açılan GitHub ekranında “Run workflow” ile onayla. Kapanış kaydı gelince sonuç burada görünecek.');
 }
 async function check(){
   const commit=source?.sourceCommit;
   if(!pending||!/^[a-f0-9]{40}$/.test(commit||'')||readCommit===commit)return;
   const current=++sequence;readCommit=commit;
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
   try{
     const response=await root.fetch('https://raw.githubusercontent.com/onurqlp/coin-live-pro/'+commit+'/web/data/uzayx-cash-close.json',
       {cache:'no-store',credentials:'omit',signal:controller.signal});
     if(!response.ok)throw Error('close-record-unavailable');
     const report=await response.json();
     if(current!==sequence)return;
     if(completed(report,source?.db?.spark,pending)){
       message(summary(report));pending=null;persist();if(timer)clearTimeout(timer);
     }else waiting();
   }catch{
     if(current===sequence){readCommit=null;message('Kapanış sonucu henüz doğrulanamadı. Kaynak yenilendiğinde yeniden kontrol edilecek.');}
   }finally{clearTimeout(timeout);}
 }
 if(root.document){
   try{
     const saved=JSON.parse(root.sessionStorage?.getItem(KEY)||'null');
     if(saved&&finite(saved.at)&&Date.now()-saved.at>=0&&Date.now()-saved.at<60*60000)pending=saved;
   }catch{}
   root.addEventListener('uzayx:loaded',event=>{source=event.detail;check();});
   root.addEventListener('uzayx:source-check',()=>{if(pending)check();});
   root.document.addEventListener('DOMContentLoaded',()=>{
     const button=$('cash-close-all');
     if(!button)return;
     button.href=WORKFLOW_URL;
     if(pending)waiting();
     button.addEventListener('click',()=>{
       pending={at:Date.now(),before:source?.db?.spark?.close_request_id||null};
       readCommit=null;persist();waiting();
       if(timer)clearTimeout(timer);timer=setTimeout(waiting,20*60000);
       // Native link opens GitHub's authenticated confirmation, not a local fill.
     });
   });
 }
 return {WORKFLOW_URL,completed,summary};
});
