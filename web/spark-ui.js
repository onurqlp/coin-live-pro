'use strict';
/* Read-only comparisons of signed published data. One action, no server side-effects. */
(()=>{
 const $=id=>document.getElementById(id);
 const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const num=x=>typeof x==='number'&&Number.isFinite(x)?x.toLocaleString('tr-TR',{maximumFractionDigits:4}):'—';
 const metric=(label,value)=>'<div class="sparkMetric"><small>'+safe(label)+'</small><strong>'+safe(value)+'</strong></div>';
 function renderAccount(store){
  const a=store.sparkPaper,root=$('sparkPaperPanel'),strip=$('sparkDailyStrip');
  if(!a)return;
  const q=a.summary||{},c=q.counts||{},daily=a.daily||{},today=daily.today||{};
  const todayNet=(today.realized_net_usdt||0)+(today.unrealized_all_usdt||0);
  if(strip){
    const liveGeldi=(a.recent_tickets||[]).filter(t=>t.entry_class==='GELDI'&&t.status==='OPEN').length;
    strip.innerHTML=metric('Bugün GELDİ',today.geldi||0)+
      metric('GELDİ sanal açık',liveGeldi)+
      metric('Bugün toplam kapanan',today.closed||0)+
      metric('Bugün net, fonlama hariç',num(todayNet)+' USDT');
    strip.title='UTC. Net: bugün kapanan işlemlerin tahmini PnL’si ve açık pozisyonların son kapanmış mumdaki PnL’si. Önceki günden taşınan açık PnL bugüne dahil olabilir.';
  }
  if(!root)return;
  const labels={WAITING_FUTURE_BAR:'Giriş bekliyor',OPEN:'Sanal açık',CLOSED:'Kapandı',
    DATA_GAP:'Veri boşluğu',INVALID_LEVEL:'Seviye yok',CAPACITY_BLOCKED:'Kapasite'};
  const latest=(a.recent_tickets||[]),priority=latest.filter(t=>t.entry_class==='GELDI');
  const dailyRows=(daily.days||[]).slice(0,14);
  root.innerHTML='<h3>GELDİ · Otomatik Sanal Kasa</h3>'+
    '<p class="sparkDisclaimer">GELDİ olduğunda emir talebi anında kaydedilir. Gerçek işlem değil; giriş fiyatı ancak sonraki kapanmış 5 dakikalık mumdan tahmin edilir. Tüm erken araştırma denemeleri ayrıca korunur.</p>'+
    '<div class="sparkPaperStats">'+metric('Toplam GELDİ',a.geldi_intent_total||0)+
      metric('Tüm denemeler',a.all_events_count)+metric('Açık sanal',c.OPEN||0)+
      metric('Kapanmış',c.CLOSED||0)+metric('Deney özkaynağı',num(q.virtual_equity_usdt)+' USDT')+
      metric('Tüm zaman net',num((q.realized_net_usdt||0)+(q.unrealized_net_usdt||0))+' USDT')+
      metric('Veri boşluğu',c.DATA_GAP||0)+'</div>'+
    '<h4>GELDİ işlem kayıtları</h4>'+
    '<div class="sparkPaperList">'+(priority.length?priority.slice(0,36).map(t=>
      '<div class="sparkTicket"><strong>'+safe(t.symbol)+' '+safe(t.side)+
      ' · '+safe(labels[t.status]||t.status)+'</strong>'+
      '<span>Emir UTC '+safe(t.paper_intent_created_at_utc||t.signal_at_utc)+
      ' · Giriş '+(t.fill_price?num(t.fill_price):'5m bekleniyor')+
      ' · STOP '+num(t.stop)+' · TP1 '+num(t.tp1)+'</span>'+
      '<span>Net '+num((t.realized_net_usdt||0)+(t.status==='OPEN'?(t.unrealized_net_usdt||0):0))+
      ' USDT'+(t.valuation_status==='STALE_MARK_NO_BACKFILL'?' · fiyat güncel değil':'')+
      '</span></div>').join(''):
      '<div class="v4Empty">Henüz 4.03 GELDİ sanal işlem talebi oluşmadı.</div>')+'</div>'+
    '<h4>Gün gün performans · UTC</h4>'+
    '<div class="sparkCompareTable"><div class="sparkCompareRow head"><span>Gün</span><span>GELDİ / giriş</span>'+
      '<span>Kapanan</span><span>Net, USDT</span></div>'+
      dailyRows.map(d=>'<div class="sparkCompareRow"><span>'+safe(d.date_utc)+'</span>'+
       '<span>'+safe(d.geldi||0)+' / '+safe(d.new_geldi_opened||0)+'</span>'+
       '<span>'+safe(d.closed||0)+'</span><span>'+num(d.realized_net_usdt||0)+'</span></div>').join('')+
    '</div>'+
    '<details class="sparkResearchHistory"><summary>Diğer erken araştırma denemeleri</summary>'+
       '<div class="sparkPaperList">'+latest.filter(t=>t.entry_class!=='GELDI').slice(0,50).map(t=>
       '<div class="sparkTicket"><strong>'+safe(t.symbol)+' '+safe(t.side)+' · '+safe(labels[t.status]||t.status)+'</strong>'+
       '<span>Giriş '+(t.fill_price?num(t.fill_price):'bekliyor')+
       ' · net '+num((t.realized_net_usdt||0)+(t.status==='OPEN'?(t.unrealized_net_usdt||0):0))+
       ' USDT · '+safe(t.stage_at_birth)+'</span></div>').join('')+'</div></details>'+
    '<p class="sparkDisclaimer">GELDİ sayısı, benzersiz kaydedilmiş sanal emir talebidir; tüm sinyallerin gerçek piyasada doldurulduğu anlamına gelmez. Başlangıç 10.000 USDT ve deney başına 10 USDT nominal; 3x/10x kaldıraç kullanılmaz. İşlem ücretleri ve kayma varsayımsaldır, funding/likidasyon modeli yoktur. Gerçek emir yoktur.</p>';
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
