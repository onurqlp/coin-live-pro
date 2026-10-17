'use strict';
/* COIN.LIVE PRO V4 — read-only view, never authors trade or lifecycle events. */
(()=>{
 const $=id=>document.getElementById(id);
 const safe=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const date=x=>{const t=Date.parse(x||'');return Number.isFinite(t)?new Date(t).toLocaleString('tr-TR',{timeZone:'UTC',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+' UTC':'—'};
 const fmt=x=>typeof x==='number'&&Number.isFinite(x)?x.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
 const ago=x=>{const m=(Date.now()-Date.parse(x||''))/60000;return Number.isFinite(m)&&m>=0?Math.floor(m)+' dk':'—'};
 const names={TREND_BREAKOUT:'Trend / 4H kırılım',VOLUME_EXPANSION:'Hacim genişlemesi',
 BREAKOUT_RETEST:'Kırılım + retest',REVERSAL_SETUP:'Dönüş hazırlığı',
 VOLATILITY_SQUEEZE:'Yanardağ / sıkışma',OI_FUNDING_PRESSURE:'OI / fonlama baskısı',
 SHORT_BREAKDOWN:'SHORT / destek kırılımı'};
 const why={HTF_ALIGNED:'1D+4H yön uyumu',LOCAL_CLOSED_LEVEL:'Yerel kapanışla seviye aşıldı',
 LOCAL_LEVEL_WAIT:'Yerel kırılım bekleniyor',WAIT_4H_CLOSE:'Kapanmış 4H kırılımı bekleniyor',
 '4H_CLOSED_BREAKOUT':'4H kırılımı kapandı','4H_VOLUME_EXPANSION':'4H hacmi arttı',
 CLOSED_LOCAL_BREAK:'Kapanmış yerel kırılım',BREAKOUT_SEEN:'İlk kırılım görüldü',
 RETEST_SEQUENCE_UNVERIFIED:'Retest mum dizisi kanıtlanmadı',
 RSI_EXTREME:'RSI uç bölgede',MACD_HIST_TURN:'MACD histogramı dönüyor',
 COUNTERTREND_RESEARCH:'Ters yön henüz araştırma',BB_COMPRESSION:'Bollinger sıkışması',
 CLOSED_VOLUME_EXPANSION:'Kapanmış hacim genişlemesi',WATCH_VOLUME:'Hacim teyidi bekleniyor',
 TIMESTAMPED_OI_DELTA:'Zaman damgalı açık pozisyon değişimi',
 FUNDING_CROWDING:'Fonlama kalabalıklaşması',NOT_LIQUIDATION_PROOF:'Tasfiye kanıtı değil',
 BEARISH_DAILY_4H:'1D ve 4H aşağı yön',SUPPORT_CLOSED_BREAK:'Destek kapanışta kırıldı',
 SUPPORT_WATCH:'Destek kırılımı bekleniyor'};
 const store={radar:null,paper:null,shadow:null,lab:null,history:null,early:null,mtf:null,sparkPaper:null,sparkReview:null,manifest:null,position:null,lastFetch:0,loading:false,initialChartSelected:false};
 window.CoinV4=store;
 function explanation(v){return (v?.reasons||[]).slice(0,3).map(s=>why[s]||s).join(' · ')||'Yeni kapanmış mum kanıtı bekleniyor';}
 const factorLabels={trend:'TREND',structure:'YAPI',volume:'HACİM',momentum:'MACD',liquidity:'LİKİDİTE'};
 function factorLamps(x){
   const groups=x.factor_groups||{};
   const names=Object.keys(factorLabels);
   const lamps=names.map(k=>{
     const v=groups[k],known=typeof v==='number'&&Number.isFinite(v);
     const state=!known?'unknown':v>0?'positive':'neutral';
     const label=factorLabels[k];
     return '<span class="v4FactorLamp '+state+'" title="'+safe(label+': '+(!known?'veri yok':v>0?'destekli':'teyit yok'))+'">'+
       '<i aria-hidden="true"></i>'+safe(label)+'</span>';
   });
   // Source metrics are genuine closed-candle readings, not invented indicators.
   const m=x.metrics||{};
   for(const [key,label,test] of [
     ['4h_rsi','RSI',v=>x.side==='LONG'?v>=48&&v<=70:v>=30&&v<=52],
     ['4h_adx','ADX',v=>v>=20],
     ['4h_relative_volume','RVOL',v=>v>=1.2],
     ['4h_macd_signed','MACD',v=>v>0],
     ['bb_compression_percentile','BB',v=>v<=30]
   ]){
     const v=Number(m[key]),known=m[key]!==null&&m[key]!==undefined&&Number.isFinite(v);
     const state=!known?'unknown':test(v)?'positive':'neutral';
     lamps.push('<span class="v4FactorLamp '+state+'" title="'+safe(label+': '+(known?v.toFixed(2):'veri yok'))+'">'+
       '<i aria-hidden="true"></i>'+label+'</span>');
   }
   // Side-specific anomaly context from independently closed global market candles.
   // Do not treat this index as proven manipulation, probability, or V4 score.
   const source=store.radar?.anomaly_research?.pairs?.[x.symbol+'|'+x.side];
   const live=Date.now()-Date.parse(store.manifest?.finished_at_utc||'')<=25*60000;
   const verified=live&&source?.state==='OBSERVED_HEURISTIC'&&typeof source.index==='number';
   const idx=verified?Math.max(0,Math.min(100,source.index)):null;
   const caution=verified&&idx>=30;
   const tip=verified?
     'UTC kapanmış 5m/15m/1H/4H, fitil, RVOL, ATR, OI ve spread kaynaklı anomali endeksi; manipülasyon kanıtı veya giriş sinyali değildir':
     'Güncel bağımsız mikro-mum kanıtı yok. Spoofing / tasfiye geçmişi doğrulanmamıştır';
   lamps.unshift('<span class="v4FactorLamp '+(verified?(caution?'neutral':'unknown'):'unknown')+'" title="'+safe(tip)+'"><i aria-hidden="true"></i>'+
      (verified?'ANOMALİ '+idx+'/100':'ANOMALİ ?')+'</span>');
   lamps.push('<span class="v4FactorLamp unknown" title="Doğrulanmış haber/sosyal kaynak henüz bu sinyal kaydına bağlı değil"><i aria-hidden="true"></i>HABER ?</span>');
   return '<div class="v4FactorLamps" aria-label="Gösterge kontrol ışıkları">'+lamps.join('')+'</div>';
 }
 function timeframeLadder(x){
   const frames=x.metrics?.timeframe_levels||{};
   const tfs=['1m','5m','15m','1H','4H','12H','1D','1W'];
   const result=tfs.map(tf=>{
     const v=frames[tf]||{},confirmed=v.quality==='CLOSED_CONFIRMED';
     const trend=confirmed?v.trend:'UNKNOWN';
     const same=(x.side==='LONG'&&trend==='UP')||(x.side==='SHORT'&&trend==='DOWN');
     const opposing=(x.side==='LONG'&&trend==='DOWN')||(x.side==='SHORT'&&trend==='UP');
     const state=!confirmed?'unknown':same?'positive':opposing?'negative':'neutral';
     const name=trend==='UP'?'↑':trend==='DOWN'?'↓':trend==='SIDEWAYS'?'↔':'?';
     const title=tf+' kapanmış mum yönü: '+trend+(tf==='4H'||tf==='1D'?' · ana yön':tf==='1W'?' · büyük resim':' · giriş zamanlaması');
     return '<span class="v4Tf '+state+(tf==='4H'||tf==='1D'?' primary':'')+'" title="'+safe(title)+'">'+tf+' '+name+'</span>';
   });
   return '<div class="v4TfWrap" aria-label="Küçükten büyüğe teyit edilen mum yönleri">'+result.join('')+'</div>'+
     '<div class="v4TfNote">4H + 1D ana karar · 1W büyük yön · 1H/15m zamanlama · 1m erken gözlem. Hepsinin aynı renk olması gerekmez.</div>';
 }
 function mainFrameSummary(x){
   const frames=x.metrics?.timeframe_levels||{};
   return '<div class="v4TrendMini" aria-label="Ana zaman dilimleri">'+
     ['4H','1D','1W'].map(tf=>{
       const v=frames[tf]||{},trend=v.quality==='CLOSED_CONFIRMED'?v.trend:'UNKNOWN';
       const aligned=(x.side==='LONG'&&trend==='UP')||(x.side==='SHORT'&&trend==='DOWN');
       const opposed=(x.side==='LONG'&&trend==='DOWN')||(x.side==='SHORT'&&trend==='UP');
       const cls=trend==='UNKNOWN'?'unknown':aligned?'aligned':opposed?'opposed':'neutral';
       const dir=trend==='UP'?'↑':trend==='DOWN'?'↓':trend==='SIDEWAYS'?'↔':'?';
       return '<span class="'+cls+'" title="'+safe(tf+' kapanmış yön: '+trend)+'">'+tf+' <strong>'+dir+'</strong></span>';
     }).join('')+'</div>';
 }
 function applyRadarFilter(){
   const term=($('v4RadarSearch')?.value||'').trim().toLocaleUpperCase('tr-TR');
   const side=$('v4RadarSide')?.value||'ALL';
   let total=0,shown=0;
   for(const id of ['v4Early','v4Spotlight','v4Motion','v4Watch']){
     const panel=$(id);if(!panel)continue;
     const cards=[...panel.querySelectorAll('.v4Opportunity[data-v4-pair]')];
     let visible=0;
     for(const card of cards){
       const match=(side==='ALL'||card.dataset.v4Direction===side) &&
         (!term||((card.dataset.v4Pair||'')+' '+(card.dataset.v4Strategy||''))
           .toLocaleUpperCase('tr-TR').includes(term));
       card.hidden=!match;
       if(match){visible++;shown++;}
       total++;
     }
     let placeholder=panel.querySelector('.v4FilterEmpty');
     if(cards.length){
       if(!placeholder){
         placeholder=document.createElement('div');
         placeholder.className='v4FilterEmpty';
         placeholder.textContent='Bu bölümde filtreyle eşleşen aday yok.';
         panel.append(placeholder);
       }
       placeholder.hidden=visible>0;
     }else if(placeholder)placeholder.remove();
   }
   const status=$('v4RadarFilterStatus');
   if(status)status.textContent=total?shown+' / '+total+
     ' aday gösteriliyor · Üstteki sayılar filtresizdir':
     'Merkezi sinyaller yükleniyor; filtreler sadece ekrandaki adayları etkiler.';
 }
 function card(x){
   const st=x.lifecycle_stage,stage=st==='SPOTLIGHT'?'GÖZ ÖNÜNDE':st==='MOTION'?'HAREKET':'İZLE';
   const state=x.review_state==='FRESH'?'Güncel':'Kontrol bekliyor';
   const motion=x.confirmation_state==='CONFIRMED'?' · strateji teyidi var':' · giriş teyidi yok';
   return '<article class="v4Opportunity" data-v4-pair="'+safe(x.symbol)+
     '" data-v4-direction="'+safe(x.side)+'" data-v4-strategy="'+safe(names[x.strategy_id]||x.strategy_id)+'"><div class="v4CardTop"><b>'+safe(x.symbol)+
     ' <span class="chip '+(x.side==='LONG'?'long':'short')+'">'+safe(x.side)+'</span></b>'+
     '<span class="v4Small">'+safe(stage)+' · '+safe(state)+'</span></div>'+
     '<div class="v4Sub">'+safe(names[x.strategy_id]||x.strategy_id)+'</div>'+
     '<div class="v4CardScore"><span>Güç <strong>'+safe(x.score)+'/100</strong></span>'+
     '<span class="riskNote">Risk '+safe(x.risk_score)+'/100</span></div>'+
     '<div class="v4Reason">'+safe(explanation(x))+'</div>'+mainFrameSummary(x)+
     '<details class="v4Evidence"><summary>Detay</summary>'+
     timeframeLadder(x)+factorLamps(x)+'<div class="v4Meta">İlk kayıt: '+safe(date(x.first_seen_at))+'</div></details>'+
     '<div class="v4Meta">Son kontrol: '+safe(date(x.last_evaluated_at))+
     safe(motion)+'</div>'+
     '<button type="button" class="v4GoChart" data-v4-symbol="'+safe(x.symbol)+
     '" data-v4-side="'+safe(x.side)+'">Grafik ↗</button></article>';
 }
 function observationProgress(){
   const started=Date.parse(store.paper?.pilot_started_at||'');
   const status=$('v4ObservationStatus'), dates=$('v4ObservationDates'),bar=$('v4ObservationFill');
   if(!status||!dates||!bar)return;
   if(!Number.isFinite(started)){status.textContent='90 günlük gözlem · başlangıç verisi bekleniyor';return;}
   const ends=started+90*86400000;
   const elapsed=Math.max(0,Math.min(90,Math.floor((Date.now()-started)/86400000)));
   const remaining=Math.max(0,Math.ceil((ends-Date.now())/86400000));
   const formatDay=ms=>new Date(ms).toLocaleDateString('tr-TR',{
     timeZone:'UTC',day:'2-digit',month:'long',year:'numeric'});
   status.textContent=remaining>0?'90 günlük gözlem · '+elapsed+'. gün · '+remaining+' gün kaldı':
     '90 günlük gözlem süresi tamamlandı · sonuçlar arşivde';
   dates.textContent=formatDay(started)+' — '+formatDay(ends)+' (UTC) · piyasa verileri otomatik kaydedilir';
   bar.style.width=(Math.min(100,Math.max(0,(Date.now()-started)/(90*86400000)*100))).toFixed(1)+'%';
 }
 function renderGlobalResearch(r,manifest){
   const area=r?.anomaly_research;
   const c=area?.clock;
   const clk=$('v4GlobalUtcClock'),sessions=$('v4GlobalSession'),hours=$('v4AnomalyHourly');
   if(!clk||!sessions||!hours)return;
   const age=(Date.now()-Date.parse(manifest?.finished_at_utc||''))/60000;
   if(!c||!Number.isFinite(age)||age>25){
     clk.textContent='🌍 UTC döngüsü · kaynak gecikmiş veya bilinmiyor';
     sessions.textContent='Piyasa 24/7 açık · zaman penceresi kanıtı bekleniyor';
     hours.textContent='Geçmiş istatistiği ile güncel sinyal farklıdır';return;
   }
   const moment=Date.parse(c.utc_at);
   const formatted=Number.isFinite(moment)?
      new Date(moment).toLocaleString('tr-TR',{timeZone:'UTC',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+' UTC':'— UTC';
   clk.textContent='🌍 '+formatted+' · 4H blok '+String(c.utc_4h_block).padStart(2,'0')+':00 UTC';
   sessions.textContent='Yaklaşık bölgesel saatler: '+
      ((c.regional_activity_windows||[]).join(' + ')||'Pencereler dışında')+' · kripto 24/7';
   const stats=area.hourly;
   const winners=stats?.top_utc_hours||[];
   hours.textContent=winners.length?'Örneklemde yükselen anomali saatleri: '+
      winners.map(x=>String(x.utc_hour).padStart(2,'0')+':00 UTC (%'+x.elevated_pct+
      ', n='+x.sample_n+', '+x.days+' gün)').join(' · ')+
      ' · kesin manipülasyon göstergesi değil':
      'UTC saat analizi: en az 3 ayrı gün ve saat başına 40 tekil kapanmış 5m gözlemi bekleniyor';
 }
 async function loadRelease(){
   try{
     const r=await fetch('./release.json?check='+Date.now(),{cache:'no-store'});
     if(!r.ok)throw Error('Yayın kaydı okunamadı');
     const meta=await r.json();
     if(!/^[0-9]+[.][0-9]+(?:[.][0-9]+)?$/.test(meta.product_version)||
        !Number.isFinite(Date.parse(meta.updated_at_utc)))throw Error('Yayın kaydı geçersiz');
     const published=new Date(meta.updated_at_utc).toLocaleString('tr-TR',{
       timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
     $('releaseVersion').textContent='Sürüm '+meta.product_version;
     $('releaseUpdated').textContent='Kod güncellemesi '+published+' UTC · Kayıt '+meta.release_id;
     $('releaseFooter').textContent='Sürüm '+meta.product_version+' · Son kod güncellemesi '+published+' UTC · Kayıt '+meta.release_id;
     const history=$('releaseHistoryList');
     if(history){
       history.replaceChildren();
       const entries=Array.isArray(meta.change_log)?meta.change_log:[];
       for(const entry of entries.slice(0,8)){
         if(!entry||typeof entry.summary!=='string'||!Number.isFinite(Date.parse(entry.updated_at_utc||'')))continue;
         const li=document.createElement('li'),stamp=document.createElement('strong'),summary=document.createElement('span');
         stamp.textContent=new Date(entry.updated_at_utc).toLocaleString('tr-TR',{
           timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})+' UTC · '+(entry.release_id||'Kayıt');
         summary.textContent=entry.summary;li.append(stamp,summary);history.append(li);
       }
       if(!history.childElementCount)history.textContent='Doğrulanmış yayın kaydı bulunamadı.';
     }
   }catch(e){
     $('releaseUpdated').textContent='Son kod güncelleme kaydı şu anda doğrulanamıyor';
     $('releaseFooter').textContent=$('releaseVersion').textContent+' · Yayın kaydı geçici olarak okunamıyor';
   }
 }
 function showMarketSummary(r,manifest,stale){
   const rows=[...(r.spotlight||[]),...(r.motion||[]),...(r.watch||[])];
   // One parite may appear under several independent strategies. Count it
   // once per direction, not once per hypothesis; also retain WATCH_PENDING.
   const perSide=side=>new Set(rows.filter(x=>x.side===side).map(x=>x.symbol)).size;
   const counters=manifest.candidate_counts||{};
   const pairs=Number(counters.market_pairs);
   $('v4MarketTotal').textContent=Number.isFinite(pairs)&&pairs>0?String(pairs):'—';
   const verified=Number(counters.verified),attempted=Number(counters.attempted);
   $('v4MarketDetail').textContent=Number.isFinite(verified)&&Number.isFinite(attempted)
      ?'Derin analiz: '+verified+'/'+attempted+' aday':'OKX USDT pariteleri';
   $('v4LongTotal').textContent=String(perSide('LONG'));
   $('v4ShortTotal').textContent=String(perSide('SHORT'));
   const stamp=Date.parse(manifest.started_at_utc||'');
   $('v4LastAnalysis').textContent=Number.isFinite(stamp)?
     new Date(stamp).toLocaleTimeString('tr-TR',{timeZone:'UTC',hour:'2-digit',minute:'2-digit'})+' UTC':'—';
   $('v4LastAnalysisAge').textContent=stale?
       'Veri gecikmiş · yeni teyit gösterilmez':
       'Son kapanmış mum analizi · '+ago(manifest.started_at_utc)+' önce';
 }

 function renderEarly(manifest,stale){
   const data=store.early;
   const container=$('v4Early'),info=$('v4EarlyStatus'),count=$('v4EarlyCount'),tag=$('v4EarlyLabel'),history=$('v4EarlyHistoryHint');
   if(!container||!info||!count||!tag)return;
   if(!data){count.textContent='—';info.textContent='Erken işaret araştırma kaynağı henüz yayımlanmadı.';return;}
   if(stale){
     count.textContent='—';
     tag.textContent='GECİKMİŞ';
     info.textContent='Merkezi veri 25 dakikadan eski. Güncel erken sinyal gösterilmiyor; eski kayıtlar arşivde.';
     container.innerHTML='<div class="v4Empty">Yeni sinyal için doğrulanmış merkezi tarama bekleniyor.</div>';
     return;
   }
   const items=(data.candidates||[]).filter(x=>x.source_quality==='VERIFIED_CLOSED_OHLC'
      &&x.paper_eligible===false&&x.real_order_eligible===false);
   count.textContent=String(items.length);
   tag.textContent=items.length?'◌ '+items.length+' ERKEN İŞARET':'KAPANMIŞ MUM BEKLENİYOR';
   info.textContent=items.length+' ayrı coin/yön araştırması · son kaynak '+date(data.source_mtf_at)+
     ' · yeni liste yaklaşık 5 dakikalık best-effort taramayla değişir · başarı olasılığı değildir.';
   const type={KIVILCIM:'KIVILCIM',ERKEN_SINYAL:'ERKEN SİNYAL',ISIK_GUCLENIYOR:'IŞIK GÜÇLENİYOR'};
   const reason={
      '1D_4H_ALIGNED':'1D + 4H aynı yönde',
      '4H_TREND':'4H yönü destekliyor','1D_TREND':'Günlük yön destekliyor',
      '1H_SUPPORT':'1 saatlik yön aynı','15M_SUPPORT':'15 dakikalık destek',
      '4H_VOLUME_0_8PLUS':'4H hacmi artıyor','1H_VOLUME_1PLUS':'1H hacmi hareketli',
      '4H_MACD_DIRECTION':'4H MACD yön destekliyor',
      'WEEKLY_OPPOSITION_CAUTION':'Haftalık yön ters',
      'WEAK_RELATIVE_VOLUME':'Hacim henüz zayıf'};
   const cardHtml=items.map(x=>{
      const caution=(x.reasons||[]).some(v=>v==='WEEKLY_OPPOSITION_CAUTION'||v==='WEAK_RELATIVE_VOLUME');
      const close=(x.hourly_level_state==='CLOSED_1H_LEVEL_BREACHED');
      const condition=close?'1H seviye kapanışla aşılmış · takip teyidi gerekir':
        x.hourly_level?'1H kapanışında '+(x.side==='LONG'?'üzerinde':'altında')+
           ' beklenen seviye '+Number(x.hourly_level).toLocaleString('en-US',{maximumFractionDigits:8}):
           'Henüz net 1H seviye yok · 4H yönünü takip et';
      const indicators=[
        ['4H',x.trend_4h],['1D',x.trend_1d],['1W',x.trend_1w]];
      return '<article class="v4Opportunity v4EarlyCard" data-v4-pair="'+safe(x.symbol)+
       '" data-v4-direction="'+safe(x.side)+'" data-v4-strategy="'+safe((x.reasons||[]).join(' '))+'">'+
       '<div class="v4CardTop"><b>'+safe(x.symbol)+' <span class="chip '+(x.side==='LONG'?'long':'short')+'">'+safe(x.side)+'</span></b>'+
       '<span class="v4EarlyTier">'+safe(type[x.research_tier]||'İZLE')+'</span></div>'+
       '<div class="v4CardScore">Güç <strong>'+safe(x.research_rank)+'/100</strong></div>'+
       '<div class="v4TrendMini">'+indicators.map(([tf,v])=>
          '<span class="'+((x.side==='LONG'&&v==='UP')||(x.side==='SHORT'&&v==='DOWN')?'aligned':
             v==='SIDEWAYS'?'neutral':v==='UP'||v==='DOWN'?'opposed':'unknown')+'">'+tf+' <strong>'+
             (v==='UP'?'↑':v==='DOWN'?'↓':v==='SIDEWAYS'?'↔':'?')+'</strong></span>').join('')+'</div>'+
       '<p class="v4EarlyReason">'+safe((x.reasons||[]).slice(0,2).map(z=>reason[z]||z).join(' · '))+'</p>'+
       '<p class="v4EarlyNext">'+safe(condition)+'</p>'+
       (caution?'<small class="v4EarlyCaution">DİKKAT: '+safe((x.reasons||[]).filter(z=>reason[z]&&(z==='WEAK_RELATIVE_VOLUME'||z==='WEEKLY_OPPOSITION_CAUTION')).map(z=>reason[z]).join(' · '))+'</small>':'')+
       '<div class="v4Meta">İlk kayıt: '+safe(date(x.first_seen_at_utc))+
       ' · kaynak: '+safe(date(x.source_observed_at_utc))+'</div>'+
       '<button type="button" class="v4GoChart" data-v4-symbol="'+safe(x.symbol)+
       '" data-v4-side="'+safe(x.side)+'">Grafik ↗</button>'+
       '</article>';
   });
   const byStage={1:[],2:[],3:[]};
   items.forEach((x,i)=>{
     const stage=x.paper_stage_number||({KIVILCIM:1,ERKEN_SINYAL:2,ISIK_GUCLENIYOR:3}[x.research_tier]||1);
     byStage[stage].push(cardHtml[i]);
   });
   container.innerHTML=[3,2,1].map(stage=>'<section class="sparkLane tier'+stage+'">'+
     '<h4>'+stage+' · '+({3:'GELDİ',2:'GELMEKTE OLAN',1:'İZLENEN'}[stage])+
     ' <small>'+byStage[stage].length+'</small></h4>'+
     '<div class="sparkLaneCards">'+(byStage[stage].join('')||
     '<div class="v4Empty">Bu aşamada henüz aday yok</div>')+'</div></section>').join('');
   if(history){
      const h=data.prior_watch_directional_observations||{},a=h['1H']||{},b=h['4H']||{};
      history.textContent='Önceki İZLE kayıtları: 1H '+(a.observed||0)+' ölçümde '+(a.positive_direction||0)+
       ' yönsel artı / '+(a.negative_direction||0)+' yönsel eksi · 4H '+(b.observed||0)+' ölçümde '+
       (b.positive_direction||0)+' artı / '+(b.negative_direction||0)+' eksi. Bunlar kâr veya kazanma oranı değildir.';
   }
 }

 function drawBoard(){
   const r=store.radar,manifest=store.manifest;
   if(!r)return;
   observationProgress();
   const minutes=(Date.now()-Date.parse(manifest.finished_at_utc))/60000;
   const stale=!Number.isFinite(minutes)||minutes>25;
   showMarketSummary(r,manifest,stale);
   renderGlobalResearch(r,manifest);
   renderEarly(manifest,stale);
   const status=$('v4Status');status.textContent=stale?'V4 KAYNAK GECİKMİŞ · GÜNCEL TEYİT YOK':
     'Son analiz '+ago(r.updated_at)+' önce · sanal takip';
   status.className='v4Status '+(stale?'v4Stale':'');
   const groups=[
     ['v4Spotlight',stale?[]:r.spotlight,'Şu an yeni verilerle bu kaliteyi sağlayan fırsat yok.'],
     ['v4Motion',stale?[]:r.motion,'Yeni kapanmış mumlarla başlamış hareket kanıtı henüz yok.'],
     ['v4Watch',r.watch,'Henüz izlemeye alınabilecek yeni fırsat yok.']
   ];
   for(const [id,items,empty] of groups)$(id).innerHTML=items.length?items.map(card).join(''):
     '<div class="v4Empty">'+safe(stale?'Merkezi veri eski; yeni aşama/işlem uygunluğu gösterilmez.':empty)+'</div>';
   const priorityShown=!stale&&Boolean((r.spotlight||[]).length||(r.motion||[]).length);
   if($('v4PriorityArea'))$('v4PriorityArea').hidden=!priorityShown; // stage counters retain empty stages without boxes
   if($('v4PriorityEmpty'))$('v4PriorityEmpty').hidden=priorityShown;
   const tiers=store.early?.stage_counts||{};
   $('v4WatchCount').textContent=stale?'—':tiers['1']??'—';
   $('v4MotionCount').textContent=stale?'—':tiers['2']??'—';
   $('v4SpotCount').textContent=stale?'—':tiers['3']??'—';
   $('v4RecheckCount').textContent=r.counts?.recheck_pending??'—';
   $('v4ArchivedCount').textContent=r.counts?.archived_total??'—';
   document.querySelectorAll('[data-v4-symbol]').forEach(b=>b.onclick=()=>{
     const select=window.CoinLiveSelectSpark;
     if(typeof select!=='function')return;
     const symbol=b.dataset.v4Symbol;
     select(symbol,'4H',false,false,b.dataset.v4Side);
     document.querySelectorAll('[data-v4-symbol]').forEach(item=>
       item.classList.toggle('v4Selected',item.dataset.v4Symbol===symbol));
     const pane=$('chartHostRadar');
     if(!pane)return;
     const rect=pane.getBoundingClientRect();
     // Keep the route. Only scroll when the in-page chart is below/above view.
     if(rect.top>window.innerHeight*.67||rect.bottom<30)
       pane.scrollIntoView({behavior:'smooth',block:'start'});
   });
   // Whole card opens the same chart; small Grafik link is keyboard-accessible.
   document.querySelectorAll('.v4Opportunity[data-v4-pair]').forEach(tile=>{
     const link=tile.querySelector('[data-v4-symbol]');
     if(link)tile.addEventListener('click',ev=>{
       if(ev.target.closest('button,a,summary,details,input,select'))return;
       link.click();
     });
   });
   applyRadarFilter();
   if(!store.initialChartSelected){
     const legacy=[...(r.spotlight||[]),...(r.motion||[]),...(r.watch||[])]
       .find(x=>x.review_state==='FRESH');
     const candidate=legacy||(!stale?store.early?.candidates?.[0]:null);
     if(candidate&&typeof window.CoinLiveSelectSpark==='function'){
       store.initialChartSelected=true;
       window.CoinLiveSelectSpark(candidate.symbol,'4H',false,true,candidate.side);
     }
   }
 }
 function kpi(label,value){return '<div class="v4Kpi"><small>'+safe(label)+'</small><strong>'+safe(value)+'</strong></div>';}
 function renderDesk(){
   const p=store.paper;if(!p)return;
   const stale=Date.now()-Date.parse(p.updated_at)>25*60000;
   $('v4PaperStatus').textContent=stale?'KASA VERİSİ ESKİ · YENİ GİRİŞ YOK':
    'PAPER ONLY · başlangıç '+date(p.pilot_started_at)+' · gerçek emir YOK';
   $('v4PaperKpis').innerHTML=[
     ['Başlangıç kasa','10.000,00 USDT'],['Tahmini özkaynak',fmt(p.equity_usdt)+' USDT'],
     ['Serbest marjin',fmt(p.available_margin_usdt)+' USDT'],['Kullanılan marjin',fmt(p.used_margin_usdt)+' USDT'],
     ['Gerçekleşen PnL (fonlama hariç)',fmt(p.realized_pnl_usdt)+' USDT'],
     ['Açık PnL (kapalı 5m)',fmt(p.unrealized_pnl_usdt)+' USDT'],
     ['Örnek komisyonlar',fmt(p.fees_paid_usdt)+' USDT'],
     ['Fonlama','BİLİNMİYOR'],['Drawdown',fmt(p.max_drawdown_pct)+'%']
   ].map(([l,v])=>kpi(l,v)).join('');
   const positions=p.open_positions||[];
   const current=store.position;
   if(current){
     const match=positions.find(x=>x.paper_order_id===current.paper_order_id);
     if(match)store.position=match;
     else store.position=null;
   }
   $('v4Positions').innerHTML=positions.length?positions.map(x=>
     '<button class="v4Position" data-v4-position="'+safe(x.paper_order_id)+'"><b>'+safe(x.symbol)+
     ' · '+safe(x.side)+'</b><small>Giriş '+fmt(x.fill_price)+' · stop '+fmt(x.stop)+
     '</small><span>İzlenen PnL '+fmt(x.unrealized_pnl_usdt)+' USDT · '+safe(x.status)+
     '</span><small>Grafikte göster ↗</small></button>').join(''):
     '<div class="v4Empty">10.000 USDT kasa başladı; henüz yeni V4 koşullarından dolmuş sanal pozisyon yok. Eski 100 USDT işlemleri buraya aktarılmaz.</div>';
   document.querySelectorAll('[data-v4-position]').forEach(b=>b.onclick=()=>{
     const x=positions.find(z=>z.paper_order_id===b.dataset.v4Position);
     if(!x)return;store.position=x;
     if(typeof window.CoinLiveSelectSpark==='function')window.CoinLiveSelectSpark(x.symbol,'4H',false);
     requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
     $('chartHostPortfolio')?.scrollIntoView({behavior:'smooth',block:'nearest'});
   });
   const orders=(p.recent_orders||[]).slice().reverse().slice(0,20);
   $('v4Orders').innerHTML=orders.length?orders.map(x=>'<div class="v4AuditItem"><b>'+
     safe(x.symbol)+' '+safe(x.side)+'</b> · '+safe(x.status)+
     (x.no_fill_reason?' · '+safe(x.no_fill_reason):'')+
     ' · '+safe(date(x.created_at))+'</div>').join(''):
     '<div class="v4Empty">Yeni V4 uygun giriş olayı bekleniyor.</div>';
   const events=(p.recent_events||[]).slice(-20).reverse();
   $('v4Timeline').innerHTML=events.map(x=>'<div class="v4AuditItem">'+
      safe(date(x.time_utc))+' · '+safe(x.type)+'</div>').join('');
   drawEquity(p.equity_curve||[]);
 }
 function drawEquity(series){
   const canvas=$('v4EquityCanvas');if(!canvas)return;
   const ctx=canvas.getContext('2d'),width=Math.max(280,canvas.clientWidth||440),height=170;
   const dpr=Math.min(2,window.devicePixelRatio||1);
   canvas.width=Math.round(width*dpr);canvas.height=height*dpr;
   ctx.setTransform(dpr,0,0,dpr,0,0);
   ctx.fillStyle='#0c1727';ctx.fillRect(0,0,width,height);
   const pts=series.filter(x=>typeof x.equity_usdt==='number'&&Number.isFinite(x.equity_usdt));
   ctx.font='12px system-ui';ctx.fillStyle='#acc2db';
   if(pts.length<2){ctx.fillText('Gerçek ileri kasa grafiği için en az iki gözlem gerekli.',12,25);return;}
   const values=pts.map(x=>x.equity_usdt),lo=Math.min(...values),hi=Math.max(...values),pad=Math.max(1,(hi-lo)*.1);
   const bottom=height-20,top=18,left=10,right=width-18;
   const yy=n=>bottom-(n-(lo-pad))/(hi-lo+2*pad)*(bottom-top);
   ctx.strokeStyle='#6ebddd';ctx.lineWidth=2;ctx.beginPath();
   pts.forEach((p,i)=>{const x=left+(right-left)*i/(pts.length-1),y=yy(p.equity_usdt);
     if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();
   ctx.fillText(fmt(values[values.length-1])+' USDT (sanal)',12,16);
 }
 function renderHistory(){
    if(!store.history)return;
    const data=store.history;
    // WATCH_STARTED duplicates the associated DISCOVERED event.
    const events=(data.events||[]).filter(x=>x.type!=='WATCH_STARTED')
      .slice().sort((a,b)=>Date.parse(b.event_time_utc)-Date.parse(a.event_time_utc))
      .slice(0,90);
    const statusNames={
      DISCOVERED:'YENİ KIVILCIM',MOTION_STARTED:'HAREKET BAŞLADI',
      SPOTLIGHT_PROMOTED:'GÖZ ÖNÜNDE',DOWNGRADED:'TEYİT ZAYIFLADI',
      INVALIDATED:'GEÇERSİZ',ARCHIVED:'ARŞİVE ALINDI',
      ENTRY_ELIGIBLE:'SANAL GİRİŞ ŞARTLARI OLUŞTU'};
    const count=$('v4HistoryCount');
    if(count)count.textContent=events.length+' son olay · arşiv '+(data.archived_total||0);
    const list=$('v4HistoryRows');
    if(!list)return;
    list.innerHTML=events.length?events.map(x=>{
      const label=statusNames[x.type]||x.type;
      const code=x.reason_codes?.[0]||'—';
      return '<article class="v4HistoryItem"><div class="v4HistoryTop"><b>'+safe(x.symbol)+
        ' · '+safe(x.side)+'</b><strong>'+safe(label)+'</strong></div>'+
        '<div class="v4Sub">'+safe(date(x.event_time_utc))+' · '+
        safe(names[x.strategy_id]||x.strategy_id)+' · '+safe(code)+'</div>'+
        '<div class="v4Meta">Gözlenen seviye: '+safe(fmt(x.price_at_transition))+
        ' USDT · Canlı emir değildir.</div></article>';
    }).join(''):'<div class="v4Empty">V4 gözleminde henüz yeni kayıt yok. Başka sürümden geçmiş aktarılmadı.</div>';
 }
 function renderLab(){
   if(!store.lab)return;
   const p=store.lab.periods?.[Number($('v4LabWindow').value)||0];
   if(!p)return;
   $('v4LabBody').innerHTML=Object.entries(p.strategies||{}).map(([id,r])=>{
     const h=r.forward_horizons?.['24H'];
     const forward=h?.observed ? ' · 24s örnek '+h.observed+
       ' · medyan MFE '+fmt(h.median_mfe_pct)+'% · MAE '+fmt(h.median_mae_pct)+'%' :
       ' · 24s gözlem henüz yok';
     return '<div class="v4LabRow"><b>'+safe(names[id]||id)+'</b><span>İZLE '+r.discovered+
       ' · HAREKET '+r.motion+' · GÖZ ÖNÜNDE '+r.spotlight+
       ' · ELENDİ '+(r.invalidated+r.expired_or_stale)+
       safe(forward)+' · başarı: örneklem yetersiz</span></div>';
   }).join('');
   $('v4LabFooter').textContent='Shadow: '+p.shadow.attempts+' deneme, '+p.shadow.resolved+
     ' sonuç · belirsiz '+p.shadow.ambiguous+' · boşluk '+p.shadow.data_gap+
     ' · kasa emri '+p.paper.created+' · fonlama bilinmiyor. Kazanma ihtimali değildir.';
 }
 function renderSparkAccount(){window.CoinSparkUI?.renderAccount(store);}
 function showSparkComparison(){window.CoinSparkUI?.compare(store);}
 async function readJson(name,manifest){
   const r=await fetch('./data/'+name+'.json?version='+Date.now(),{cache:'no-store'});
   if(!r.ok)throw Error(name+' HTTP '+r.status);
   const raw=await r.text(),bytes=new TextEncoder().encode(raw);
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
   if(hash!==manifest.sources?.[name]?.sha256)throw Error(name+' checksum uyuşmuyor');
   return JSON.parse(raw);
 }
 async function load(){
   if(store.loading)return;store.loading=true;
   try{
     const response=await fetch('./data/v4-manifest.json?t='+Date.now(),{cache:'no-store'});
     if(!response.ok)throw Error('V4 henüz sunucuya yayınlanmadı');
     const m=await response.json();
     if(!m.publication_valid||m.model_version!=='4.0.0-manifest-a1')throw Error('V4 manifest geçersiz');
     const [r,p,sh,lab,history,early,mtf,sparkPaper,sparkReview]=await Promise.all(
       ['v4-radar','v4-paper','v4-shadow','v4-lab','v4-history-index','v4-early','mtf','v4-spark-paper','v4-spark-review'].map(k=>readJson(k,m)));
     if([r,p,sh,lab,history,early,sparkPaper,sparkReview].some(x=>x.scan_id!==m.scan_id)||mtf.fetched_at!==m.started_at_utc)
       throw Error('V4 farklı tarama verileri karışmış');
     store.manifest=m;store.radar=r;store.paper=p;store.shadow=sh;store.lab=lab;store.history=history;store.early=early;store.mtf=mtf;store.sparkPaper=sparkPaper;store.sparkReview=sparkReview;
     store.lastFetch=Date.now();drawBoard();renderDesk();renderLab();renderHistory();renderSparkAccount();if(!$('sparkCompareReport')?.hidden)showSparkComparison();
     window.CoinLivePro?.refreshChartGuide?.();
   }catch(error){
     $('v4Status').textContent='V4 veri kontrolü: '+error.message;
     $('v4PaperStatus').textContent='V4 sunucu verisi doğrulanamadı; yeni sanal sonuç yok';
   }finally{store.loading=false;}
 }
 $('v4LabWindow')?.addEventListener('change',renderLab);
 $('v4RadarSearch')?.addEventListener('input',applyRadarFilter);
 $('v4RadarSide')?.addEventListener('change',applyRadarFilter);
 $('refresh')?.addEventListener('click',()=>setTimeout(load,1000));
 window.addEventListener('resize',()=>{if(store.paper)drawEquity(store.paper.equity_curve||[])});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
 loadRelease();load();setInterval(()=>{if(!document.hidden)load()},60000);
})();
