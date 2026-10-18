'use strict';
/* UzayX V4.1 Atlas Research. Source-only historical cases: no inferred trades or backfilled OHLCV. */
(() => {
  const $ = id => document.getElementById(id);
  const box = (tag,cl,content) => {
    const n=document.createElement(tag);if(cl)n.className=cl;
    if(content!==undefined)n.textContent=String(content);return n;
  };
  let atlas=null,filter='ALL',query='',yr='ALL',loadedSha='';
  const EVENT_LABELS={
    SQUEEZE_THEN_CRASH:'Sıkışma → düşüş',FUTURES_SHORT_SQUEEZE:'Vadeli sıkışma',
    SECOND_WAVE_7D:'İkinci dalga',SECOND_LISTING_PUSH:'Listeleme sonrası dalga',
    LAUNCH_CONTINUATION:'Lansman devamı',TREND_CONTINUATION:'Trend devamı',
    7D_SECTOR_ROTATION:'Sektör dönüşü',SECTOR_ROTATION:'Sektör dönüşü',
    PEG_FAILURE:'Sabit fiyat kopması',CEX_FAILURE:'Borsa krizi',
    FLASH_COLLAPSE:'Ani çöküş',LIQUIDITY_REMOVAL:'Likidite çekilmesi',
    SPOT_LISTING:'Spot listeleme',RUG_LIQUIDITY_REMOVAL:'Likidite riski',
    POST_LISTING_RETRACE:'Listeleme sonrası düzeltme',POST_PEAK_RETRACE:'Zirve sonrası düzeltme'
  };
  const moduleContext=[
    ['A1','Hisse çiftleri','KO–PEP günlük fiyat karşılaştırması. Kripto için doğrudan sinyal değil.','REJİM HİPOTEZİ'],
    ['A2','ETF ayrışması','IVV–VOO yıllık/günlük araştırma girdisi; NAV arbitrajı değil.','REJİM HİPOTEZİ'],
    ['A3','Sektör & sepet','BTC/ETH/SOL kapalı mumlarıyla domino ve ikinci dalga araştırması.','KRİPTO BAĞLAMI'],
    ['B1','Funding & kaldıraç','Fonlama verisi; squeeze için OI ve fiyat teyidi ayrıca gerekir.','KRİPTO BAĞLAMI'],
    ['B2','İki borsa derinliği','OKX–Kraken USDC/USDT brüt karşılaştırması. Net arbitraj değil.','LİKİDİTE BAĞLAMI'],
    ['T0','Makro faiz rejimi','ABD Hazine referansları; saniyelik fırsat sinyali veya repo fiyatı değil.','MAKRO BAĞLAMI']
  ];
  const strategic=[
    ['X1','Sessiz Birikim','A3+B1+B2','WATCH','Volatilite sıkışması, pozisyon baskısı ve likidite eşleşmesi'],
    ['X2','İkinci Roket','A3+B1+B2','WATCH_LONG','İlk ralli, düzeltme, onaylı ikinci ivme; otomatik SHORT yok'],
    ['X3','Sıkışma','B1+B2+A3','NO_TRADE varsayılan','Kalabalık pozisyon ve olası iki yönlü tasfiye'],
    ['X4','Domino Gecikmesi','A3+A2/T0','WATCH','Sektör lideri sonrası geciken varlık, sahte korelasyon riski'],
    ['X5','Sahte Kırılım','A3+B1+B2','WATCH','Likidite süpürme, başarısız kapanış, yeniden teyit'],
    ['X6','Rejim Değişimi','A1+A2+T0 (+A3)','BACKGROUND','Küresel risk algısı; hızlı kripto sinyali değildir']
  ];
  const safeUrl=s=>/^https:\/\/[\w.-]+\//.test(s||'')?s:null;
  const fmt=(x,d=2)=>Number.isFinite(x)?x.toLocaleString('tr-TR',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
  function renderEvents(){
    const el=$('atlas-events');if(!el||!atlas)return;
    el.replaceChildren();
    const found=atlas.events.filter(e=>(filter==='ALL'||e.direction===filter)&&
       (!query||(e.symbol+' '+e.headline+' '+e.classification).toLocaleUpperCase('tr-TR').includes(query)));
    $('atlas-match-count').textContent=found.length+' olay / '+atlas.events.length+' arşiv kaydı';
    if(!found.length)el.append(box('p','atlas-muted','Bu ölçütlerde kaynak olayı yok.'));
    found.slice(0,31).forEach(e=>{
      const card=box('article','atlas-event');
      const top=box('div','atlas-event-top');
      top.append(box('b','',e.symbol));
      top.append(box('span','atlas-flag '+(e.direction==='UP'?'up':e.direction==='DOWN'?'down':'mixed'),
        e.direction==='UP'?'YÜKSELİŞ':e.direction==='DOWN'?'DÜŞÜŞ':'KARMA'));
      top.append(box('small','',e.start+' → '+e.end));card.append(top);
      card.append(box('strong','atlas-event-head',e.headline));
      card.append(box('p','atlas-muted',EVENT_LABELS[e.classification]||e.classification.replaceAll('_',' ')+' · makale olay penceresi'));
      const detail=box('div','atlas-event-meta');
      detail.append(box('span','',e.data_status==='ARTICLE_CONFIRMED'?'Kaynakta olay anlatımı var':'Fiyat verisi ayrıca doğrulanmalı'));
      const url=safeUrl(e.source_url);
      if(url){const a=box('a','atlas-source','Kaynak ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';detail.append(a);}
      card.append(detail);el.append(card);
    });
  }
  function renderCandidates(){
    const el=$('atlas-candidates');if(!el||!atlas)return;el.replaceChildren();
    const records=atlas.candidates.filter(x=>yr==='ALL'||String(x.year)===yr)
      .filter(x=>!query||x.symbol.toLocaleUpperCase('tr-TR').includes(query))
      .slice(0,50);
    records.forEach(x=>{
      const row=box('div','atlas-gainer');
      row.append(box('b','',x.symbol),box('small','',String(x.year)+' · #'+x.rank),
        box('strong','','+'+fmt(x.reported_annual_return_pct,2)+'%'));
      el.append(row);
    });
    $('atlas-candidate-note').textContent=records.length+' yıllık sıralama adayı gösteriliyor · yıllık performans 1–10 günlük sinyal değildir; geçmişte futures erişimi bilinmiyor.';
  }
  function renderResearch(){
    const target=$('atlas-v4-engines');if(!target)return;target.replaceChildren();
    strategic.forEach(([id,name,modules,mode,description])=>{
      const card=box('article','atlas-engine');
      const title=box('div','atlas-engine-name');
      title.append(box('b','',id+' · '+name),box('span','',mode));card.append(title);
      card.append(box('p','',description),box('small','','Modül katkısı: '+modules+' · AR-GE hipotezi'));
      target.append(card);
    });
    const mods=$('atlas-module-map');if(!mods)return;mods.replaceChildren();
    moduleContext.forEach(([id,title,body,scope])=>{
      const card=box('article','atlas-module');
      card.append(box('strong','',id+' · '+title),box('p','',body),box('small','',scope));
      mods.append(card);
    });
  }
  function calc(){
    const stake=Math.max(1,Math.min(100000,Number($('atlas-margin')?.value)||100));
    const lever=Math.max(1,Math.min(20,Number($('atlas-leverage')?.value)||10));
    const move=Math.max(0,Math.min(50,Number($('atlas-move')?.value)||0));
    const mode=$('atlas-fee-mode')?.value||'TT';
    const entryPct=mode==='MM'?.02:mode==='MT'?.02:.05;
    const exitPct=mode==='MM'?.02:.05;
    const frictionPct=Math.max(0,Math.min(5,Number($('atlas-friction')?.value)||0));
    const notional=stake*lever;
    const fee=notional*(entryPct+exitPct)/100;
    const friction=notional*frictionPct/100;
    const partialNet=notional*move/100-fee-friction;
    const breakeven=entryPct+exitPct+frictionPct;
    $('atlas-calc-result').replaceChildren();
    const items=[['Pozisyon',fmt(notional)+' USDT'],['Giriş + çıkış ücretleri',fmt(fee,3)+' USDT'],
       ['Spread/kayma varsayımı',fmt(friction,3)+' USDT'],
       ['Funding hariç net senaryo',fmt(partialNet,2)+' USDT'],
       ['Funding hariç başa baş fiyat hareketi','%'+fmt(breakeven,3)],
       ['%1 ters fiyat hareketinde yaklaşık zarar',fmt(-notional*.01-fee-friction,2)+' USDT']];
    items.forEach(([label,val])=>{
      const row=box('div','atlas-calc-row');row.append(box('span','',label),box('b','',val));
      $('atlas-calc-result').append(row);
    });
    $('atlas-calc-breakdown').textContent='5 / 10 / 25 / 50 USDT net hedefi için gereken fiyat hareketi (funding hariç): '+
      [5,10,25,50].map(target=>'+'+fmt((target+fee+friction)/notional*100,3)+'%').join(' · ')+
      '. Gerçek funding ve gerçekleşen emir fiyatları bilinmiyor; tam net PnL değildir.';
  }
  function show(data){
    if(data?.schema!=='uzayx.atlas.v4.web.v1'||!Array.isArray(data.events)||
        data.events.length!==31||!Array.isArray(data.candidates)||data.candidates.length!==50){
      $('atlas-status').textContent='Arşiv yapısı doğrulanamadı';return;
    }
    if(data.ohlcv_verified!==false||data.signal_backtested!==false||data.live_orders_allowed!==false){
      $('atlas-status').textContent='Veri sınıflaması uyuşmuyor';return;
    }
    atlas=data;
    $('atlas-status').textContent='Kaynak kaydı · '+data.asof_date;
    $('atlas-kpis').replaceChildren();
    [['Olay evresi',31],['Yıllık aday',50],['Desen',12],['Kaynak',36]].forEach(([t,n])=>{
      const box1=box('div','atlas-kpi');box1.append(box('strong','',n),box('span','',t));$('atlas-kpis').append(box1);
    });
    renderEvents();renderCandidates();renderResearch();calc();
  }
  async function load(sha=''){
    if(atlas&&sha===loadedSha)return;
    loadedSha=sha;
    const url=sha&&/^[a-f0-9]{40}$/.test(sha)
       ?'https://raw.githubusercontent.com/onurqlp/coin-live-pro/'+sha+'/web/data/uzayx-atlas-v4.json'
       :'../data/uzayx-atlas-v4.json';
    try{
      const r=await fetch(url,{cache:'no-store'});
      if(!r.ok)throw Error('HTTP '+r.status);
      show(await r.json());
    }catch(e){$('atlas-status').textContent='Arşive erişilemedi: '+String(e.message||e).slice(0,55);}
  }
  $('atlas-search')?.addEventListener('input',e=>{query=e.target.value.trim().toLocaleUpperCase('tr-TR');renderEvents();renderCandidates();});
  $('atlas-filter')?.addEventListener('change',e=>{filter=e.target.value;renderEvents();});
  $('atlas-year')?.addEventListener('change',e=>{yr=e.target.value;renderCandidates();});
  ['atlas-margin','atlas-leverage','atlas-move','atlas-friction','atlas-fee-mode'].forEach(id=>
    $(id)?.addEventListener('input',calc));
  window.addEventListener('uzayx:loaded',e=>load(e.detail?.sourceCommit||''));
  // Browser-only fallback when market scan is unreachable: public, bundled atlas remains usable.
  load();
})();
