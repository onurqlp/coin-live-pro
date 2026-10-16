/* Read-only verified V4 WATCH history and public news overlay.
   A browser refresh never writes GitHub/archive or produces fake fills. */
(()=>{
'use strict';
const el=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const utc=t=>{const d=new Date(t);return Number.isFinite(d.getTime())?d.toLocaleString('tr-TR',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+' UTC':'—'};
const fmt=n=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:8}):'—';
const meanings={OBSERVED:'ÖLÇÜLDÜ',TRACKING:'TAKİPTE',DATA_GAP:'VERİ EKSİK',SOURCE_UNAVAILABLE:'KAYNAK YOK',UNKNOWN:'BİLİNMİYOR'};
let archive=null,context=null,visible=50,loading=false;
async function readVerified(name,manifest){
 const r=await fetch('./data/'+name+'.json?t='+Date.now(),{cache:'no-store'});
 if(!r.ok)throw Error(name+' HTTP '+r.status);
 const raw=await r.text();
 const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
 const sha=[...new Uint8Array(b)].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(sha!==manifest.sources?.[name]?.sha256)throw Error(name+' bütünlük doğrulaması başarısız');
 return JSON.parse(raw);
}
function renderArchive(){
 const host=el('watchArchiveRows'),info=el('watchArchiveStatus'),more=el('watchArchiveMore');
 if(!host||!info||!more)return;
 if(!archive){info.textContent='Kalıcı arşiv henüz doğrulanmış kaynak bekliyor.';return;}
 const term=(el('watchArchiveSearch')?.value||'').trim().toUpperCase();
 const side=el('watchArchiveSide')?.value||'ALL',period=el('watchArchivePeriod')?.value||'1W';
 const all=Array.isArray(archive.records)?archive.records:[];
 const found=all.filter(x=>(side==='ALL'||x.side===side)&&
  (!term||String(x.symbol||'').includes(term)||String(x.strategy_id||'').includes(term)));
 info.textContent=all.length+' kalıcı gözlem · '+found.length+' eşleşme · son merkezi arşiv '+utc(archive.updated_at)+
  ' · 1M ilk tamamen kapanmış mum, kesin 60 saniyelik işlem sonucu değil';
 host.innerHTML=found.slice(0,visible).map(x=>{
  const c=x.checkpoints?.[period]||{},state=c.state||'TRACKING';
  const pct=state==='OBSERVED'&&Number.isFinite(c.close_direction_pct)
     ?' · '+(c.close_direction_pct>=0?'+':'')+c.close_direction_pct.toFixed(2)+'% yönsel fiyat farkı':'';
  return '<article class="v4ArchiveItem"><div class="v4ArchiveItemHead"><b>'+esc(x.symbol)+
   ' <span class="chip '+(x.side==='LONG'?'long':'short')+'">'+esc(x.side)+'</span></b>'+
   '<span>'+esc(x.strategy_id)+'</span></div>'+
   '<div class="v4Sub">İlk İZLE: '+esc(utc(x.first_seen_at))+
   ' · fiyat '+esc(fmt(x.first_seen_price))+' USDT · son durum '+esc(x.last_stage||'WATCH')+'</div>'+
   '<div class="v4ArchiveResult">'+esc(period)+' · '+esc(meanings[state]||state)+esc(pct)+
   (c.measurement_end_utc?' · '+esc(utc(c.measurement_end_utc)):'')+'</div>'+
   '<button type="button" data-archive-chart="'+esc(x.symbol)+'">Grafikte incele ↗</button></article>';
 }).join('')||'<div class="v4Empty">Bu filtrede kayıt bulunamadı.</div>';
 more.hidden=found.length<=visible;
 more.textContent='Daha fazla göster ('+(found.length-visible)+' kaldı)';
}
function renderNews(){
 const host=el('v4NewsItems'),info=el('v4NewsStatus');
 if(!host||!info)return;
 if(!context){info.textContent='Haber araştırma verisi henüz yayımlanmadı.';return;}
 const sources=context.source_status||{},ok=Object.values(sources).filter(s=>s==='OK').length;
 info.textContent=(ok?ok+' haber/sosyal kaynak yanıt verdi':'Kaynakların hiçbiri doğrulanamadı')+
  ' · '+utc(context.updated_at)+' · işlem puanına eklenmez';
 const rows=(context.latest_items||[]).slice(0,20);
 host.innerHTML=rows.map(x=>{
   const u=typeof x.url==='string'&&/^https:\/\/[a-z0-9.-]+\//i.test(x.url)?x.url:null;
   return '<article class="v4NewsItem"><small>'+esc((x.symbols||[]).join(', '))+
   ' · '+esc(x.source)+' · '+esc(utc(x.published_at_utc))+'</small>'+
   (u?'<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">'+esc(x.title)+' ↗</a>':
       '<span>'+esc(x.title)+'</span>')+
   '<small>'+esc(x.uncertain_language?'İddia veya belirsiz ifade':'Kaynak başlığı, doğrulama gerekebilir')+
   ' · ilk gözlem '+esc(utc(x.first_seen_at_utc))+'</small></article>';
 }).join('')||'<div class="v4Empty">Erişilebilir kaynaklarda eşleşen güncel başlık yok; olumlu/olumsuz sinyal anlamına gelmez.</div>';
}
async function reload(){
 if(loading)return;loading=true;
 if(el('watchArchiveStatus'))el('watchArchiveStatus').textContent='Doğrulanmış sunucu arşivi güncelleniyor…';
 try{
  const response=await fetch('./data/v4-manifest.json?t='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw Error('Sunucu manifest HTTP '+response.status);
  const m=await response.json();
  if(!m.publication_valid||m.model_version!=='4.0.0-manifest-a1')throw Error('Yayın manifesti geçersiz');
  const [a,c]=await Promise.all(['v4-watch-archive','v4-context'].map(n=>readVerified(n,m)));
  if(a.scan_id!==m.scan_id||!a.archive_is_persistent||a.no_real_orders!==true)
    throw Error('Arşiv aynı taramaya ait veya güvenilir değil');
  if(c.score_not_used_for_paper_or_v4_stage!==true)throw Error('Haber kaynağı işleme etki ediyor');
  archive=a;context=c;renderArchive();renderNews();
 }catch(e){if(el('watchArchiveStatus'))el('watchArchiveStatus').textContent='Arşiv yenilenemedi: '+e.message+
  ' · daha önce doğrulanan kayıtlar korunuyor';
 }finally{loading=false;}
}
for(const id of ['watchArchiveSearch','watchArchiveSide','watchArchivePeriod']){
 el(id)?.addEventListener(id==='watchArchiveSearch'?'input':'change',()=>{visible=50;renderArchive()});
}
el('watchArchiveRefresh')?.addEventListener('click',reload);
el('watchArchiveMore')?.addEventListener('click',()=>{visible+=50;renderArchive()});
el('watchArchiveRows')?.addEventListener('click',e=>{
 const b=e.target.closest('[data-archive-chart]');if(!b)return;
 const symbol=b.dataset.archiveChart;
 const period=el('watchArchivePeriod')?.value||'1W';
 const tf={'1M':'1m','5M':'5m','15M':'15m','1H':'1H','4H':'4H','24H':'1D','3D':'1D','1W':'1W'}[period]||'4H';
 if(typeof window.CoinLiveSelectSpark==='function'){
   window.location.hash='radar';
   window.CoinLiveSelectSpark(symbol,tf,false);
 }
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload()});
reload();setInterval(()=>{if(!document.hidden)reload()},60000);
})();