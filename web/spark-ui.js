'use strict';
/* Read-only comparisons of signed published data. One action, no server side-effects. */
(()=>{
 const $=id=>document.getElementById(id);
 const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const num=x=>typeof x==='number'&&Number.isFinite(x)?x.toLocaleString('tr-TR',{maximumFractionDigits:4}):'—';
 const metric=(label,value)=>'<div class="sparkMetric"><small>'+safe(label)+'</small><strong>'+safe(value)+'</strong></div>';
 function renderAccount(store){
  const a=store.sparkPaper,root=$('sparkPaperPanel');if(!a||!root)return;
  const q=a.summary||{},c=q.counts||{};
  const labels={WAITING_FUTURE_BAR:'Mum bekleniyor',OPEN:'Açık',CLOSED:'Kapandı',DATA_GAP:'Veri boşluğu',
    INVALID_LEVEL:'Seviye yok',CAPACITY_BLOCKED:'Kasa dolu'};
  root.innerHTML='<h3>Kıvılcım Sanal Deney Kasası</h3>'+
  '<p class="sparkDisclaimer">Her yeni işaret için 10 USDT yalnızca sanal deneme. V4 ana kasa ayrıdır. Gerçek emir yok.</p>'+
  '<div class="sparkPaperStats">'+metric('Kayıt',a.all_events_count)+metric('Açık',c.OPEN||0)+
  metric('Kapanan',c.CLOSED||0)+metric('Deney özkaynağı',num(q.virtual_equity_usdt)+' USDT')+
  metric('Net sonuç',num((q.realized_net_usdt||0)+(q.unrealized_net_usdt||0))+' USDT')+
  metric('Veri boşluğu',c.DATA_GAP||0)+'</div>'+
  '<div class="sparkPaperList">'+(a.recent_tickets||[]).slice(0,70).map(t=>
    '<div class="sparkTicket"><strong>'+safe(t.symbol)+' '+safe(t.side)+
    ' · '+safe(labels[t.status]||t.status)+'</strong><span>Giriş '+
    (t.fill_price?num(t.fill_price):'bekleniyor')+
    ' · net '+num((t.realized_net_usdt||0)+(t.unrealized_net_usdt||0))+
    ' USDT · aşama '+safe(t.stage_at_birth)+'</span></div>').join('')+'</div>'+
  '<p class="sparkDisclaimer">İlk 70 güncel deneme görünür; tüm kayıtlar arşivde kalır. Giriş ve sonuçlar ileride kapanan 5 dakikalık mumlardan tahmin edilir. Fonlama modellenmedi.</p>';
 }
 function compare(store){
  const root=$('sparkCompareReport'),stats=store.sparkReview,paper=store.sparkPaper;
  if(!root)return;root.hidden=false;
  if(!stats||!paper){root.textContent='Karşılaştırma kaynağı doğrulanamadı.';return;}
  const base=stats.cohorts?.TÜMÜ||{},q=paper.summary||{};
  const groups=[['3 · Geldi','AŞAMA_3'],['2 · Gelmekte','AŞAMA_2'],
    ['1 · İzlenen','AŞAMA_1'],['LONG','LONG'],['SHORT','SHORT'],
    ['RSI 30–50','RSI_4H_30_50'],['MACD destek','MACD_4H_DESTEK'],['BB sıkışma','BB_4H_SIKIŞMA']];
  root.innerHTML='<h3>Sanal sonuçların otomatik karşılaştırması</h3>'+
    '<div class="sparkPaperStats">'+metric('Tüm denemeler',stats.total_ever_tickets)+
    metric('Sonuçlanan',base.closed||0)+
    metric('Toplam net',num((q.realized_net_usdt||0)+(q.unrealized_net_usdt||0))+' USDT')+'</div>'+
    '<div class="sparkCompareTable"><div class="sparkCompareRow head"><span>Grup</span><span>Sonuç</span><span>Artı/Eksi</span><span>Net</span></div>'+
    groups.map(([label,key])=>{const d=stats.cohorts?.[key]||{};return '<div class="sparkCompareRow"><span>'+safe(label)+'</span><span>'+safe(d.closed||0)+'</span>'+
      '<span>'+safe(d.positive||0)+' / '+safe(d.negative||0)+'</span><span>'+num(d.realized_total_usdt||0)+'</span></div>'}).join('')+
    '</div><p class="sparkDisclaimer">'+safe((stats.conclusions||[])[0]||'İleriye dönük mumlar bekleniyor.')+
    ' Bunlar gelecekteki kazanma ihtimalini belirlemez. Yeni kurallar ayrı dönemde test edilmeden otomatik uygulanmaz.</p>';
 }
 $('sparkCompare')?.addEventListener('click',()=>{
   const root=$('sparkCompareReport');
   if(!root)return;
   if(!root.hidden){root.hidden=true;return;}
   compare(window.CoinV4||{});
   root.scrollIntoView({behavior:'smooth',block:'nearest'});
 });
 window.CoinSparkUI={renderAccount,compare};
})();
