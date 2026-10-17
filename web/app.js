'use strict';
(()=>{
const $=id=>document.getElementById(id);
const S={market:[],radar:[],swingEvents:[],provider:'',stamps:{},window:7,selected:null,selectedSide:null,live:false,loading:false,lastRefresh:0,initialized:false,chartCache:new Map(),chartLoading:null,chartTf:'4H',forward:{reports:[],events:[]},quoteLoading:false,quoteRowsCache:new Map(),quoteLastError:'',quoteUpdates:0,chartPack:null,chartPackLoading:null,chartError:''};
const safe=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const number=x=>x===null||x===undefined||x===''?NaN:Number(x);
const fmt=x=>!Number.isFinite(Number(x))?'—':Number(x)>=1000?Number(x).toLocaleString('en-US',{maximumFractionDigits:2}):Number(x)>=1?Number(x).toFixed(3):Number(x)>=.01?Number(x).toFixed(5):Number(x).toFixed(8);
const pct=x=>Number.isFinite(x)?(x>=0?'+':'')+x.toFixed(2)+'%':'—';
const age=ms=>Math.max(0,Math.floor((Date.now()-ms)/60000));
const clock=ms=>Number.isFinite(ms)?new Date(ms).toLocaleString('tr-TR',{timeZone:'UTC',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+' UTC':'—';
const usd=x=>x>=1e9?'$'+(x/1e9).toFixed(2)+'B':x>=1e6?'$'+(x/1e6).toFixed(1)+'M':x>=1000?'$'+(x/1000).toFixed(1)+'K':'$'+Number(x||0).toFixed(2);
async function get(path){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8500);try{const r=await fetch(path+(path.includes('?')?'&':'?')+'_='+Date.now(),{cache:'no-store',signal:ctl.signal});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}finally{clearTimeout(timer);}}
async function directQuote(){const data=await get('https://www.okx.com/api/v5/market/tickers?instType=SWAP');if(data.code!=='0'||!Array.isArray(data.data))throw Error('OKX feed');const rows=[];for(const x of data.data){if(!x.instId?.endsWith('-USDT-SWAP'))continue;const p=+x.last,o=+x.open24h,q=+x.volCcyQuote24h||(+x.volCcy24h*p);if(p>0&&q>0)rows.push({symbol:x.instId.slice(0,-10)+'USDT',price:p,change:o>0?(p/o-1)*100:null,volume:q});}return rows.sort((a,b)=>b.volume-a.volume).slice(0,100);}
function notify(){return; /* No browser alerts or automatic orders. */}
function currentRadar(){
 // Official cross-device radar is ONLY the central server snapshot.
 // Independent browser comparison never affects shared history or paper PnL.
 const ok=S.sparkModel==='3.0.0-htf-sparks'&&Number.isFinite(S.stamps.radar)&&Date.now()-S.stamps.radar<=25*60000;
 return ok?{items:S.radar,mode:'SERVER',stamp:S.stamps.radar}:{items:[],mode:'STALE',stamp:0};
}
function refreshState(){
 const marketAge=Number.isFinite(S.stamps.market)?age(S.stamps.market):Infinity;
 const radarAge=Number.isFinite(S.stamps.radar)?age(S.stamps.radar):Infinity;
 const active=currentRadar(),live=S.live&&Date.now()-S.lastRefresh<60000;
 const trusted=active.mode==='SERVER';
 $('health').className='banner '+(trusted&&live?'live':trusted?'warn':'stale');
 $('healthTitle').textContent=trusted&&live?'CANLI FİYAT + MERKEZİ RADAR':trusted?
   'MERKEZİ ANALİZ GÜNCEL • FİYAT BAĞLANTISI YOK':'ANALİZ ESKİ • YENİ GİRİŞ YOK';
 $('healthExplain').textContent=trusted?
   'Kıvılcım yalnız günlük + 4H trend uyumuyla oluşur. 1H/15m teyit, 5m/1m ek kontrol; gerçek emir yok.':
   'Sunucu '+(Number.isFinite(radarAge)?radarAge+' dk':'—')+' önce analiz yaptı. Yeni kıvılcım kapalı. Üstteki yenile yalnız veriyi tekrar kontrol eder, yeni sunucu taraması başlatmaz.';
 const quoteSeconds=Math.max(0,Math.floor((Date.now()-S.lastRefresh)/1000));
 $('healthTime').textContent='Analiz '+(Number.isFinite(radarAge)?radarAge+' dk':'—')+
   (live?' · OKX canlı fiyat '+quoteSeconds+' sn önce':' · Yedek fiyat '+(Number.isFinite(marketAge)?marketAge+' dk':'—')+
     ' · '+(S.quoteLastError?'OKX erişim sorunu':'Canlı bağlantı bekleniyor'));
 const clock=$('quoteClock');
 if(clock){clock.className='quoteClock '+(live?'active':'inactive');
   clock.textContent=live?'↻ OKX fiyat '+quoteSeconds+' sn önce · otomatik 20 sn':
     '↻ Canlı fiyat bekleniyor · sunucu yedeği '+(Number.isFinite(marketAge)?marketAge+' dk':'—');
 }
 const restart=$('serverRestart');if(restart)restart.hidden=trusted;
 $('source').textContent=live?'● OKX CANLI FİYAT':'● '+(S.provider||'OKX')+' / YEDEK FİYAT';
 $('lastScan').textContent=Number.isFinite(S.stamps.radar)?
   new Date(S.stamps.radar).toLocaleTimeString('tr-TR',{timeZone:'UTC',hour:'2-digit',minute:'2-digit'})+' UTC':'—';
 const state=$('scanStatus');
 if(state){
   const until=S.stamps.radar?Math.max(0,Math.ceil((5*60000-(Date.now()-S.stamps.radar))/60000)):0;
   state.textContent='MERKEZİ 1D / 4H KIVILCIM · '+(trusted?'AKTİF':'GECİKMİŞ')+
     ' · son '+(Number.isFinite(radarAge)?radarAge+' dk önce':'henüz yok')+
     (trusted?' · sıradaki planlanan ~'+until+' dk (GitHub gecikebilir)':' · ZAMANLAYICI GECİKİYOR · Güncelliği Kontrol Et tarama başlatmaz')+
     ' · yalnız merkezi 3.0 verileri';
 }
}

async function refreshLivePrices(){
 // Independent, visible-tab-only ticker channel. No 1D/4H signal calculation.
 if(S.quoteLoading)return;
 S.quoteLoading=true;
 try{
  const rows=await directQuote();
  if(rows.length<20)throw Error('OKX ticker kapsamı yetersiz');
  const map=new Map(rows.map(x=>[x.symbol,x]));
  const updated=S.market.length?S.market.map(x=>map.has(x.symbol)?{...x,...map.get(x.symbol)}:x):rows;
  S.market=updated;
  S.quoteRowsCache=map;
  S.live=true;S.lastRefresh=Date.now();S.quoteLastError='';S.quoteUpdates++;
  // Update only prices and telemetry; keep selected coin, chart and central
  // spark snapshot untouched, even when quotes change between 4H candles.
  renderMarket();refreshState();renderQuality();
  // Show live ticker as a separate marker; never fabricate an open candle.
  if(S.selected){
    const cache=S.chartCache.get(S.selected+'|'+S.chartTf);
    const pollMs=S.chartTf==='1m'?65000:S.chartTf==='5m'?110000:300000;
    if(!cache||Date.now()-cache.at>pollMs)ensureChart(true);
    else drawChart();
  }
  if(S.quoteUpdates===1&&!S.selected)renderChartSelector();
 }catch(e){
  S.live=false;S.quoteLastError=String(e?.message||'OKX unavailable').slice(0,100);
  refreshState();
 }finally{S.quoteLoading=false;}
}
async function refresh(){
 if(S.loading)return;S.loading=true;
 $('refresh').disabled=true;$('refresh').textContent='↻ Kontrol ediliyor…';
 const names=['market','swing-radar','swing-history','swing-outcomes'];
 const responses=await Promise.allSettled(names.map(k=>get('./data/'+k+'.json'))),errors=[];
 responses.forEach((r,i)=>{
  if(r.status!=='fulfilled'){
   errors.push(names[i]+': '+r.reason.message);
   if(i===1){S.radar=[];S.sparkModel='SOURCE_ERROR';S.stamps.radar=0;}
   if(i===2)S.swingEvents=[];
   if(i===3)S.forward={reports:[],events:[]};
   return;
  }
  const x=r.value;
  if(i===0){
    S.market=x.rows||[];S.provider=x.provider||'OKX';S.stamps.market=Date.parse(x.fetched_at);
    // A 15-minute JSON snapshot must never overwrite newer direct OKX quotes.
    if(Date.now()-S.lastRefresh<60000){
      for(const old of S.market){const updated=S.quoteRowsCache.get(old.symbol);if(updated)Object.assign(old,updated);}
    }
   }
  if(i===1){
   const ok=x.model_version==='3.0.0-htf-sparks'&&Array.isArray(x.timeframes_primary)&&x.timeframes_primary.includes('1D')&&x.timeframes_primary.includes('4H');
   S.sparkModel=ok?x.model_version:'INVALID_SOURCE';
   S.radar=ok?(x.items||[]).filter(y=>['1D','4H'].includes(y.primary_tf)&&y.quality==='VERIFIED_CLOSED_1D_4H'&&y.model_version==='3.0.0-htf-sparks'):[];
   S.stamps.radar=ok?Date.parse(x.fetched_at):0;
  }
  if(i===2)S.swingEvents=x.model_version==='3.0.0-htf-sparks'?(x.events||[]).filter(e=>e.model_version==='3.0.0-htf-sparks'):[];
  if(i===3)S.forward=x.model_version==='3.0.0-forward-observation'?x:{reports:[],events:[]};
 });
 await refreshLivePrices();
 if(!S.initialized&&!S.selected&&S.radar.length){S.selected=S.radar[0].symbol;S.chartTf=S.radar[0].primary_tf;$('chartTf').value=S.chartTf;}
 S.initialized=true;render();
 if(errors.length)$('healthExplain').textContent+=' · Kaynak: '+errors.join(' | ');
 S.loading=false;$('refresh').disabled=false;$('refresh').textContent='↻ Güncelliği Kontrol Et';
}
function render(){
 refreshState();$('marketCount').textContent=S.market.length||'—';
 $('longCount').textContent=currentRadar().items.filter(x=>x.side==='LONG').length;
 $('shortCount').textContent=currentRadar().items.filter(x=>x.side==='SHORT').length;
 renderRadar();renderChartSelector();renderSwingHistory();renderForward();renderQuality();renderMarket();
}
function selectSpark(symbol,tf,openAdvanced=false,silent=false,requestedSide=null){
 const accepted=['1m','5m','15m','1H','4H','12H','1D','1W'];
 const spark=currentRadar().items.find(x=>x.symbol===symbol);
 const v4=window.CoinV4?.radar;
 const isV4=[...(v4?.watch||[]),...(v4?.motion||[]),...(v4?.spotlight||[]),...(window.CoinV4?.early?.candidates||[])]
    .some(x=>x.symbol===symbol);
 if(!/^[A-Z0-9]{2,32}USDT$/.test(symbol)||(!isV4&&!S.market.some(x=>x.symbol===symbol)&&!spark&&!S.swingEvents.some(x=>x.symbol===symbol)&&!(window.CoinV4?.paper?.open_positions||[]).some(x=>x.symbol===symbol)))return;
 const target=accepted.includes(tf)?tf:(spark?.primary_tf||'4H');
 S.selected=symbol;S.chartTf=target;S.selectedSide=['LONG','SHORT'].includes(requestedSide)?requestedSide:null;
 $('chartTf').value=target;
 renderChartSelector();
 highlightSpark();
 if(openAdvanced){
   location.hash='#grafikler';
 }else if(!silent&&document.body.dataset.route==='radar'&&window.matchMedia('(max-width:980px)').matches){
   $('chartPanel').scrollIntoView({behavior:'smooth',block:'start'});
 }
 ensureChart(true);
}
window.CoinLiveSelectSpark=selectSpark;
function highlightSpark(){
 document.querySelectorAll('.radarLine').forEach(el=>{
   const selected=el.dataset.symbol===S.selected;
   el.classList.toggle('selected',selected);
   el.setAttribute('aria-pressed',selected?'true':'false');
 });
}
function renderRadar(){
 const active=currentRadar(),fresh=active.mode==='SERVER';
 const available=active.items.slice(0,16);
 $('radarRows').innerHTML=available.length?available.map((x,i)=>{
   const review=x.review_state||'FRESH';
   const confirmed=x.stage==='CONFIRMED'&&review==='FRESH';
   const tf=x.primary_tf==='1D'?'GÜNLÜK':'4 SAAT';
   const lifecycle=review==='INVALIDATED'?'GEÇERSİZ':
     review==='RECHECK_PENDING'?'YENİDEN KONTROL':
     x.confirmation_lost?'TEYİT GERİ ÇEKİLDİ':
     confirmed?'TEYİT':x.pressure_watch?'BİRİKİM İZLE':'İZLE';
   const tech=x.technicals||{};
   const quant=[['RSI4H',tech.rsi_4h],['ADX4H',tech.adx_4h],
                ['MACD',tech.macd_hist_4h_pct],['RVOL4H',tech.volume_ratio_4h],
                ['OIΔ%',tech.open_interest_change_pct],['BOOK5',tech.book_bid_ask_top5_ratio]]
        .filter(([,n])=>n!==null&&n!==undefined&&Number.isFinite(Number(n)))
        .map(([label,n])=>label+' '+Number(n).toFixed(2)).join(' · ');
   const first=Date.parse(x.first_seen_at||x.observed_at_utc);
   const last=Date.parse(x.last_evaluated_at||x.observed_at_utc);
   const reviewText=review==='INVALIDATED'?'Eski sinyal geçersiz kılındı; yeni giriş değil':
     review==='RECHECK_PENDING'?'Önceki sinyal saklı; bu tur yeniden ölçülmedi; yeni giriş değil':
     x.confirmation_lost?'Önceki teyit artık geçerli değil':'En son merkezi taramada doğrulandı';
   const c=x.confirmation||{},states=x.confirmation_state||{};
   const timing=['1H','15m','1m','5m'].map(frame=>{
     const st=states[frame]||(frame==='1m'&&!c['1m_available']?'NO_HISTORY':c[frame]?'ALIGNED':'NOT_ALIGNED');
     return '<span class="timing '+(st==='NO_HISTORY'?'unknown':c[frame]?'hit':'miss')+'" title="'+(st==='NO_HISTORY'?'Kapanmış mum verisi yok':c[frame]?'Ana yönü destekliyor':'Henüz ana yönle uyumlu değil')+'">'+frame+(st==='NO_HISTORY'?' ?':c[frame]?' ✓':' ·')+'</span>';
   }).join('');
   const flags=(x.market_structure_flags||[]).filter(v=>!String(v).endsWith('_NOT_VERIFIED')).length;
   return '<button type="button" class="radarLine" data-symbol="'+safe(x.symbol)+
     '" data-tf="'+safe(x.primary_tf)+'" aria-pressed="false" aria-label="'+
     safe(x.symbol)+' '+safe(x.side)+' · '+tf+' mum grafiğini aç"><span class="rank">'+(i+1)+
     '</span><span class="sparkMain"><span class="coin">'+safe(x.symbol.replace('USDT',''))+
     ' <span class="chip '+(x.side==='LONG'?'long':'short')+'">'+safe(x.side)+'</span>'+
     ' <span class="chip '+(confirmed?'confirmed':'watch')+'">'+safe(lifecycle)+'</span></span>'+
     '<span class="reason"><strong>'+tf+'</strong> · '+safe(x.expected_holding)+
     ' · haftalık '+(c['1W']?'uyumlu':states['1W']==='NO_HISTORY'?'veri eksik':'uyum yok')+' · risk '+safe(x.risk_score)+'/100'+
     (x.stage==='WATCH'&&x.strict_gate_reasons?.length?' · beklenen: '+safe(({
       WEEKLY_NOT_ALIGNED:'haftalık trend uyumu',
       BREAKOUT_NOT_CROSSED:'4H kırılımı',
       '4H_CLOSED_BREAKOUT_MISSING':'4H mum kapanışı henüz teyit vermedi',
       BREAKOUT_OVEREXTENDED:'fiyat sakinleşmesi',
       LIQUIDITY_OR_SPREAD_UNVERIFIED:'likidite / spread teyidi',
       TIMING_NOT_CONFIRMED:'1H/15m/5m mum teyidi',
       STRUCTURE_RISK_ELEVATED:'daha düşük risk',
       SCORE_BELOW_STRICT_GATE:'puan eşiği'
     })[x.strict_gate_reasons[0]]||'ek koşullar'):'')+
     (flags?' · '+flags+' yapı uyarısı':'')+
     (x.anomaly_flags?.length?' · şüpheli hareket göstergesi '+safe(x.anomaly_flags.length):'')+
     '</span><span class="timingRow">'+timing+'</span>'+
     '<small class="reason">🔬 '+safe(quant||'RSI/MACD/ADX ölçümleri bekleniyor')+
     (x.pressure_watch?' · sıkışma/hacim: erken izleme, kırılım değil':'')+
     '</small><small class="reason">'+safe(reviewText)+' · İlk: '+safe(clock(first))+
     ' · Son kontrol: '+safe(clock(last))+'</small></span>'+
     '<span class="rval"><b>'+fmt(x.price)+'</b><small>Puan '+safe(x.score)+'/100</small>'+
     '<small class="viewChart">Grafiğe bak ↗</small></span></button>';
 }).join(''):'<div class="empty">'+(fresh?
   'Günlük + 4H trendi aynı yönde olan ve güvenlik filtresini geçen yeni kıvılcım yok. Mikro mumlar kendi başına aday oluşturmaz.':
   'Merkezi günlük / 4H kıvılcım analizi eski veya okunamıyor. Eski kayıtlar yalnız Geçmiş bölümünde.')+'</div>';
 document.querySelectorAll('.radarLine').forEach(el=>{
   el.onclick=()=>selectSpark(el.dataset.symbol,el.dataset.tf);
 });
 highlightSpark();
}

// Chart access is browser-independent whenever the current GitHub scan has
// exported a verified chart-only snapshot. Neither source changes any signal.
const chartDurations={'1m':60000,'5m':300000,'15m':900000,'1H':3600000,'4H':14400000,
 '12H':43200000,'1D':86400000,'1W':604800000};
function verifiedChartBars(rows,tf){
 const duration=chartDurations[tf],now=Date.now();
 if(!duration||!Array.isArray(rows))return [];
 const unique=new Map();
 for(const x of rows){
   if(!Array.isArray(x)||x.length<6)continue;
   const data=x.slice(0,6).map(Number);
   const [t,o,h,l,close,v]=data;
   if(data.every(Number.isFinite)&&t>0&&t+duration<now-1000&&
      o>0&&h>0&&l>0&&close>0&&h>=Math.max(o,close,l)&&l<=Math.min(o,close,h)&&v>=0)unique.set(t,data);
 }
 return [...unique.values()].sort((x,y)=>x[0]-y[0]);
}
async function directCandles(symbol,tf){
 const inst=symbol.replace(/USDT$/,'-USDT-SWAP');
 if(!/^[A-Z0-9]+-USDT-SWAP$/.test(inst))throw Error('Geçersiz parite');
 const bars={'1m':'1m','5m':'5m','15m':'15m','1H':'1H','4H':'4H','12H':'12Hutc','1D':'1Dutc','1W':'1Wutc'};
 const json=await get('https://www.okx.com/api/v5/market/candles?instId='+
   encodeURIComponent(inst)+'&bar='+bars[tf]+'&limit=90');
 if(json.code!=='0'||!Array.isArray(json.data))throw Error('OKX mum API erişimi yok');
 const verified=json.data.filter(x=>Array.isArray(x)&&x.length>=9&&String(x[8])==='1')
   .map(x=>x.slice(0,6));
 const data=verifiedChartBars(verified,tf);
 if(data.length<14)throw Error('Yeterli kapanmış mum yok');
 return {data,source:'DIRECT_OKX',sourceAt:new Date().toISOString()};
}
async function publishedCandles(symbol,tf){
 if(tf==='1m')throw Error('1m merkezi yedekte yok');
 if(!S.chartPack||Date.now()-S.chartPack.checkedAt>180000){
   if(!S.chartPackLoading)S.chartPackLoading=get('./data/chart-pack.json')
     .then(doc=>{
       if(doc.schema_version!==1||doc.source!=='OKX_CLOSED_CANDLES'||
          doc.source_mtf_at!==doc.fetched_at||doc.chart_only!==true)
         throw Error('Merkezi grafik kaynağı doğrulanamadı');
       S.chartPack={doc,checkedAt:Date.now()};
       return doc;
     }).finally(()=>{S.chartPackLoading=null;});
   await S.chartPackLoading;
 }
 const doc=S.chartPack.doc;
 const data=verifiedChartBars(doc.candles_by_symbol?.[symbol]?.[tf],tf);
 if(data.length<10)throw Error('Bu parite/periyot merkezi yedekte yok');
 return {data,source:'SERVER_OKX',sourceAt:doc.fetched_at};
}
async function ensureChart(force=false){
 if(!S.selected)return;
 const symbol=S.selected,tf=S.chartTf,key=symbol+'|'+tf;
 const current=S.chartCache.get(key);
 if(!force&&current&&Date.now()-current.at<60000)return;
 if(S.chartLoading===key)return;
 S.chartLoading=key;S.chartError='';
 const state=$('chartDataStatus');
 if(state){state.textContent='Grafik verisi yükleniyor';state.dataset.state='loading';}
 let result=null;
 try{
   // Parallel mobile sources avoid waiting for a blocked OKX endpoint timeout.
   const mobile=window.matchMedia('(max-width:930px)').matches;
   result=mobile?await Promise.any([directCandles(symbol,tf),publishedCandles(symbol,tf)]):
     await directCandles(symbol,tf).catch(()=>publishedCandles(symbol,tf));
   S.chartCache.set(key,{at:Date.now(),...result});
 }catch(e){
   S.chartError='OKX ve merkezi grafik kaynağına ulaşılamadı. TradingView bağlantısını kullanabilirsin.';
   console.warn('COIN.LIVE chart unavailable:',symbol,tf,String(e?.message||e));
 }finally{
   if(S.chartLoading===key)S.chartLoading=null;
   if(S.selected===symbol&&S.chartTf===tf){
     drawChart();
     if(state){
       const cache=S.chartCache.get(key);
       const cached=cache?.source==='SERVER_OKX';
       state.dataset.state=cache?(cached?'snapshot':'ready'):'unavailable';
       state.textContent=cache?(cached?'Kapanmış mum · sunucu yedeği':'Kapanmış mum · OKX'):'Grafik verisi alınamadı';
     }
     if(S.chartError&&!S.chartCache.has(key))$('chartCaption').textContent=S.chartError;
   }
 }
}
function renderQuickTf(){const g=$('chartQuickFrames');if(!g)return;const spark=currentRadar().items.find(x=>x.symbol===S.selected);const primary=spark?.primary_tf||'4H';for(const b of g.querySelectorAll('[data-quick-tf]')){const tf=b.dataset.quickTf,active=tf==='AUTO'?S.chartTf===primary:S.chartTf===tf&&S.chartTf!==primary;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false');if(tf==='AUTO')b.textContent='🎯 Ana ('+primary+')';}}
function renderChartSelector(){const prior=S.selected;const options=[...new Set([...currentRadar().items.map(x=>x.symbol),...S.swingEvents.slice(-80).map(x=>x.symbol),...S.market.map(x=>x.symbol),...(window.CoinV4?.radar?.watch||[]).map(x=>x.symbol),...(window.CoinV4?.radar?.motion||[]).map(x=>x.symbol),...(window.CoinV4?.radar?.spotlight||[]).map(x=>x.symbol),...(window.CoinV4?.early?.candidates||[]).map(x=>x.symbol),...(window.CoinV4?.paper?.open_positions||[]).map(x=>x.symbol)])];if(!options.length)options.push('BTCUSDT','ETHUSDT');if(!options.includes(S.selected))S.selected=options[0];const existing=[...$('chartCoin').options].map(x=>x.value).join('|');if(existing!==options.join('|'))$('chartCoin').innerHTML=options.map(x=>`<option value="${safe(x)}">${safe(x.replace('USDT',''))} / USDT</option>`).join('');$('chartCoin').value=S.selected;const link='https://www.tradingview.com/chart/?symbol='+encodeURIComponent('OKX:'+S.selected.replace('USDT','')+'USDT.P');$('tvLink').href=link;drawChart();renderQuickTf();ensureChart();}
function drawChart(){
const guide=window.CoinLiveChartGuidance?.build({
  symbol:S.selected,side:S.selectedSide,model:window.CoinV4,
  legacy:currentRadar().items,nowMs:Date.now()})||null;
const details=$('chartScenario');
if(details)details.innerHTML=window.CoinLiveChartGuidance?.render(guide)||
  '<div class="chartScenarioPending">Veri doğrulandığında modelin senaryosu açılacak.</div>';
const c=$('candleChart'),ctx=c.getContext('2d'),r=c.getBoundingClientRect();const w=Math.max(240,Math.floor(r.width||c.parentElement?.clientWidth||320)),h=window.matchMedia('(max-width:640px)').matches?282:340,ratio=Math.min(2,window.devicePixelRatio||1);c.style.height=h+'px';c.width=Math.floor(w*ratio);c.height=Math.floor(h*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle='#0b1421';ctx.fillRect(0,0,w,h);const signal=currentRadar().items.find(x=>x.symbol===S.selected)||null;const cache=S.chartCache.get(S.selected+'|'+S.chartTf);
const visibleIndicators=$('chartIndicatorsToggle')?.checked===true;
const pane=$('chartIndicatorsCanvas'),foot=$('chartIndicatorsFoot');
if(pane)pane.hidden=!visibleIndicators;
if(foot)foot.hidden=!visibleIndicators;const raw=(cache&&Date.now()-cache.at<900000?cache.data:null)||[];const candles=raw.slice(-(w<380?32:w<540?42:52)).map(x=>({t:x[0],o:x[1],h:x[2],l:x[3],c:x[4]}));
if(visibleIndicators&&window.CoinLiveIndicators?.render)window.CoinLiveIndicators.render(pane,raw);
if(candles.length<10){ctx.fillStyle='#adc1dc';ctx.font='13px system-ui';ctx.fillText('Bu coin için kapanmış mum grafiği henüz alınmadı.',17,36);$('chartCaption').textContent='OKX '+S.chartTf+' kapanmış mumları bekleniyor. Kaynak erişimi yoksa uydurma seviye çizilmez.';return;}const left=12,right=w<390?74:96,top=16,bottom=29;let lo=Math.min(...candles.map(x=>x.l)),hi=Math.max(...candles.map(x=>x.h));const lineLevels=(guide?.levels||[]).filter(x=>Number.isFinite(x.value)&&x.value>0).map(x=>({label:x.label,v:x.value,color:x.kind==='stop'?'#ff8296':x.kind==='target'?'#4ce2b4':x.kind==='entry'?'#93cced':'#f7cc7d'}));
const paperPos=window.CoinV4?.position;
if(document.body.dataset.route==='portfoy'&&paperPos?.status==='FILLED'&&paperPos.symbol===S.selected){
 lineLevels.push({label:'PAPER ENTRY',v:paperPos.fill_price,color:'#93cced'});
 lineLevels.push({label:'STOP',v:paperPos.stop,color:'#ff8296'});
 [paperPos.tp1,paperPos.tp2,paperPos.tp3].forEach((v,i)=>{
  if(Number.isFinite(v)&&v>0)lineLevels.push({label:'TP'+(i+1),v,color:'#4ce2b4'});
 });
}
const tickQuote=S.market.find(x=>x.symbol===S.selected);
const spot=S.live&&Date.now()-S.lastRefresh<60000&&Number.isFinite(tickQuote?.price)&&tickQuote.price>0?tickQuote.price:null;
if(!lineLevels.length&&signal&&signal.primary_tf===S.chartTf){
 lineLevels.push({label:'4H EŞİK',v:signal.threshold,color:'#f7cc7d'});
 if(signal.stage==='CONFIRMED'&&signal.review_state==='FRESH'){
  lineLevels.push({label:'RİSK',v:signal.stop,color:'#ff8296'});
  (signal.targets||[]).forEach((t,i)=>lineLevels.push({label:(i+1)+'R',v:t,color:'#4ce2b4'}));
 }
}for(const l of lineLevels){if(Number.isFinite(l.v)&&l.v>0){lo=Math.min(lo,l.v);hi=Math.max(hi,l.v);}}if(spot!==null){lo=Math.min(lo,spot);hi=Math.max(hi,spot);}const pad=(hi-lo)*.12||hi*.003;lo-=pad;hi+=pad;const yy=v=>top+(hi-v)/(hi-lo)*(h-top-bottom),xx=i=>left+(i+.5)*(w-left-right)/candles.length;ctx.font='10px system-ui';for(let i=0;i<=5;i++){const y=top+(h-top-bottom)*i/5;ctx.strokeStyle='#27374e';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();ctx.fillStyle='#819dbb';ctx.fillText(window.CoinLiveChartGuidance?.format(hi-(hi-lo)*i/5)||fmt(hi-(hi-lo)*i/5),w-right+6,y+3,94);}for(let i=0;i<candles.length;i++){const b=candles[i],x=xx(i),col=b.c>=b.o?'#48d7b0':'#fc8098';ctx.strokeStyle=col;ctx.beginPath();ctx.moveTo(x,yy(b.h));ctx.lineTo(x,yy(b.l));ctx.stroke();ctx.fillStyle=col;ctx.fillRect(x-Math.max(2,Math.min(6,(w-left-right)/candles.length*.65))/2,Math.min(yy(b.o),yy(b.c)),Math.max(2,Math.min(6,(w-left-right)/candles.length*.65)),Math.max(1.5,Math.abs(yy(b.c)-yy(b.o))));}for(const l of lineLevels){ctx.setLineDash([4,4]);ctx.strokeStyle=l.color;const y=yy(l.v);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=l.color;ctx.font='bold 10px system-ui';ctx.fillText(l.label+' '+(window.CoinLiveChartGuidance?.format(l.v)||fmt(l.v)),w-right+5,y-5,94);}
// The aqua line is the current ticker, NOT a confirmed candle or an entry.
if(spot!==null){const spotY=yy(spot);ctx.save();ctx.setLineDash([2,3]);ctx.strokeStyle='#8ddcff';
ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(left,spotY);ctx.lineTo(w-right,spotY);ctx.stroke();
ctx.setLineDash([]);ctx.fillStyle='#8ddcff';ctx.font='bold 10px system-ui';
ctx.fillText('CANLI '+fmt(spot),w-right+5,Math.max(11,spotY-6));ctx.restore();}
const ticks=w<390?2:4;for(let i=0;i<ticks;i++){const idx=Math.round(i*(candles.length-1)/(ticks-1));ctx.fillStyle='#8aa6c0';ctx.font='10px system-ui';ctx.fillText(new Date(candles[idx].t).toLocaleString('tr-TR',S.chartTf==='1D'||S.chartTf==='1W'?{timeZone:'UTC',day:'2-digit',month:'2-digit'}:{timeZone:'UTC',day:'2-digit',hour:'2-digit',minute:'2-digit'}),xx(idx)-15,h-8);}$('chartCaption').textContent=(guide?.mode==='ATR_RESEARCH_PROJECTION'?'KOŞULLU 1H ATR SENARYOSU · ':guide?.mode==='SOURCE_RESEARCH_LEVELS'?'V4 KAYNAK PLAN SEVİYELERİ · ':'EŞİK / TP VERİSİ BEKLENİYOR · ')+(guide&&!guide.fresh?'KAYNAK ESKİ, GÜNCEL TEYİT YOK · ':'')+S.selected+' · OKX kapanmış '+S.chartTf+' mumları (UTC) · '+(signal?signal.side+' '+(signal.stage==='CONFIRMED'&&signal.review_state==='FRESH'?'TEYİT':signal.review_state==='INVALIDATED'?'GEÇERSİZ':signal.review_state==='RECHECK_PENDING'?'TEKRAR KONTROL':'İZLE')+' · ana periyot '+signal.primary_tf+' · '+signal.expected_holding:'Serbest fiyat incelemesi')+' · '+(cache?.source==='SERVER_OKX'?'Merkezi kapanmış OKX mumları, '+clock(Date.parse(cache.sourceAt)):cache?'Doğrudan OKX mumları':'kaynak bekleniyor')+(spot!==null?' · CANLI '+fmt(spot)+' (yalnız gösterim)':'')+(paperPos&&document.body.dataset.route==='portfoy'?' · PAPER giriş/stop/hedef: tahmini, gerçek emir yok':'')+' · referans seviyeler emir değildir.';}
function renderSwingHistory(){
 const target=$('swingHistoryRows');if(!target)return;
 const list=S.swingEvents.filter(x=>x.model_version==='3.0.0-htf-sparks'&&Date.now()-Number(x.at_ms)<=14*86400000)
   .slice().sort((a,b)=>b.at_ms-a.at_ms).slice(0,45);
 target.innerHTML=list.length?list.map(e=>
   '<div class="swingEvent"><div><b>'+safe(e.symbol.replace('USDT',''))+
   ' <span class="chip '+(e.side==='LONG'?'long':'short')+'">'+safe(e.side)+'</span>'+
   ' <span class="chip '+(e.stage==='CONFIRMED'?'confirmed':'watch')+'">'+(e.stage==='CONFIRMED'?'TEYİT':'İZLE')+'</span></b>'+
   '<div><small>'+safe(clock(Number(e.at_ms)))+' · ana grafik '+safe(e.primary_tf)+
   ' · '+safe(e.expected_holding||'1–7 gün')+' · ilk gözlem '+fmt(e.price)+'</small></div>'+
   '<div><small>Gerçek emir: YOK · 3.0 sonrası sonuçlar Rapor bölümünde ayrı takip edilir</small></div></div>'+
   '<button type="button" data-swing="'+safe(e.symbol)+'" data-tf="'+safe(e.primary_tf)+'">Grafik ↗</button></div>'
 ).join(''):'<div class="empty">Henüz günlük ve 4H filtresinden geçen ileriye dönük kayıt birikmedi. Eski 15m pilotundan sonuç aktarılmıyor.</div>';
 target.querySelectorAll('[data-swing]').forEach(button=>
   button.onclick=()=>selectSpark(button.dataset.swing,button.dataset.tf,true));
}
function renderForward(){
 const meta=$('forwardMeta'),kpi=$('forwardSummary'),list=$('forwardRows');
 if(!meta||!kpi||!list)return;
 const doc=S.forward||{},r=(doc.reports||[]).find(x=>x.days===S.window)||{};
 meta.textContent=doc.model_version==='3.0.0-forward-observation'?
   'SON KONTROL '+clock(Date.parse(doc.updated_at))+' · yalnız 3.0 sonrası kapanmış 4H mumları · veri boşlukları kazanım sayılmaz':
   '3.0 ölçüm verisi henüz sunucudan gelmedi. Önceki sonuçlar yeni modele aktarılmaz.';
 const values=[
  ['İleri gözlem',r.observations??0],
  ['Yön lehine +1R',r.favorable_1r??0],
  ['Yön aleyhine −1R',r.adverse_1r??0],
  ['Belirsiz / veri boşluğu',(r.ambiguous??0)+' / '+(r.data_gap??0)],
  ['Süresi bitti / izleniyor',(r.expired??0)+' / '+(r.tracking??0)],
  ['Yön gözlem oranı',r.observed_direction_rate_pct==null?'En az 30 sonuç gerekli':r.observed_direction_rate_pct+'% (gözlemsel)']
 ];
 kpi.innerHTML=values.map(([title,value])=>'<div class="fwdMetric"><span>'+safe(title)+'</span><b>'+safe(value)+'</b></div>').join('');
 const labels={FAVORABLE_1R:'+1R lehe hareket',ADVERSE_1R:'−1R aleyhe hareket',
 AMBIGUOUS:'Aynı 4H mumunda çakışma',EXPIRED:'Süresi doldu',
 TRACKING:'İzleniyor',DATA_GAP:'Eksik mum / belirsiz'};
 const cutoff=Date.now()-S.window*86400000;
 const rows=(doc.events||[]).filter(x=>x.at_ms>=cutoff).slice().sort((a,b)=>b.at_ms-a.at_ms).slice(0,30);
 list.innerHTML=rows.length?rows.map(x=>
 '<button type="button" class="fwdRow" data-forward="'+safe(x.symbol)+'" data-tf="'+safe(x.primary_tf)+'">'+
 '<span><b>'+safe(x.symbol.replace('USDT',''))+' <small class="'+(x.side==='LONG'?'positive':'negative')+'">'+safe(x.side)+'</small></b><small>'+
 safe(clock(Number(x.at_ms)))+' · '+safe(x.stage==='CONFIRMED'?'TEYİT':'İZLE')+' · '+safe(x.primary_tf)+'</small></span>'+
 '<span class="fwdResult">'+safe(labels[x.status]||'Ölçülüyor')+
 '<small>MFE '+(x.mfe_pct==null?'—':pct(number(x.mfe_pct)))+' · MAE '+(x.mae_pct==null?'—':pct(number(x.mae_pct)))+'</small></span>'+
 '<span class="fwdOpen">Grafik ↗</span></button>').join(''):
 '<div class="empty">3.0 sonrası yeni kıvılcım henüz kaydedilmedi. Eski sinyaller bu ölçüme eklenmez.</div>';
 list.querySelectorAll('[data-forward]').forEach(b=>b.onclick=()=>selectSpark(b.dataset.forward,b.dataset.tf,true));
}
function renderQuality(){const rows=[['Fiyat kaynağı',S.provider||'Bekleniyor'],['Sunucu fiyat yaşı',S.stamps.market?age(S.stamps.market)+' dk':'—'],['Sunucu radar yaşı',S.stamps.radar?age(S.stamps.radar)+' dk':'—'],['Canlı fiyat',S.live&&Date.now()-S.lastRefresh<60000?'OKX · '+Math.floor((Date.now()-S.lastRefresh)/1000)+' saniye önce':'OKX canlı bağlantı yok; yedek fiyat'],['Sinyal değerlendirmesi','1D + 4H ana yön; 1W teyit; RSI14 / MACD / ADX / hacim / fitil / spread / funding / OI risk; 5m kapanış'],['İşlem girişleri','WATCH ≠ işlem; CONFIRMED ≠ gerçek emir'],['Sonuç boşlukları','Belirsiz / veri boşluğu ayrı sınıf'],['Risk hesabı','10x varsayım · örnek 1R · maliyet %0,15'],['Yeni analiz','5 dk GitHub hedefi (garantisiz) · 3.0 sıkı teyit · canlı fiyat 20 sn']];$('quality').innerHTML=rows.map(([k,v])=>`<div class="line"><span>${safe(k)}</span><b>${safe(v)}</b></div>`).join('');}
function renderMarket(){$('marketRows').innerHTML=S.market.slice(0,100).map((m,i)=>{const x=currentRadar().items.find(a=>a.symbol===m.symbol);return `<tr class="marketCoinRow" data-symbol="${safe(m.symbol)}" title="Bu coinin grafiğini aç"><td>${i+1}</td><td><b>${safe(m.symbol.replace('USDT',''))}</b> / USDT</td><td>${fmt(m.price)}</td><td class="${m.change>=0?'positive':'negative'}">${pct(number(m.change))}</td><td>${usd(m.volume)}</td><td>${x?`<span class="chip ${x.side==='LONG'?'long':'short'}">${x.side}</span> <span class="chip ${x.stage==='CONFIRMED'&&x.review_state==='FRESH'?'confirmed':'watch'}">${x.review_state==='INVALIDATED'?'GEÇERSİZ':x.review_state==='RECHECK_PENDING'?'TEKRAR KONTROL':x.stage==='CONFIRMED'?'TEYİT':'İZLE'}</span>`:'—'}</td></tr>`;}).join('');
 for(const el of document.querySelectorAll('.marketCoinRow'))el.onclick=()=>{
   const spark=currentRadar().items.find(x=>x.symbol===el.dataset.symbol);
   selectSpark(el.dataset.symbol,spark?.primary_tf||'4H',true);
 };
}
$('chartCoin').onchange=e=>{S.selected=e.target.value;S.selectedSide=null;const spark=currentRadar().items.find(x=>x.symbol===S.selected);if(spark){S.chartTf=spark.primary_tf;$('chartTf').value=S.chartTf;}highlightSpark();renderChartSelector();ensureChart(true);};
$('chartTf').onchange=e=>{S.chartTf=e.target.value;renderQuickTf();drawChart();ensureChart(true);};
$('chartQuickFrames').onclick=e=>{const b=e.target.closest('[data-quick-tf]');if(!b||!S.selected)return;const spark=currentRadar().items.find(x=>x.symbol===S.selected);selectSpark(S.selected,b.dataset.quickTf==='AUTO'?(spark?.primary_tf||'4H'):b.dataset.quickTf);};document.querySelectorAll('[data-window]').forEach(b=>b.onclick=()=>{S.window=+b.dataset.window;document.querySelectorAll('[data-window]').forEach(x=>x.classList.toggle('active',x===b));renderForward();});$('refresh').onclick=async()=>{await refresh();await ensureChart(true);};
function calculator(){
 const b=Number($('balanceInput').value),x=currentRadar().items.find(z=>z.symbol===S.selected&&z.stage==='CONFIRMED'&&z.review_state==='FRESH');
 if(!Number.isFinite(b)||b<10||b>1000000){$('calcResult').innerHTML='<div class="line">Bakiye 10–1.000.000 USDT olmalı</div>';return;}
 if(!x){$('calcResult').innerHTML='<div class="line"><span>Seçilen coin</span><b>TEYİT yok · pozisyon önerilmiyor</b></div>';return;}
 if(currentRadar().mode==='STALE'||!S.live||Date.now()-S.lastRefresh>60000){
   $('calcResult').innerHTML='<div class="line"><span>Veri güvenliği</span><b>Güncel teyitli piyasa verisi yok; pozisyon hesaplanmıyor</b></div>';return;
 }
 const current=S.market.find(m=>m.symbol===x.symbol);
 if(!current||Math.abs(current.price-x.price)/x.price>.01){
   $('calcResult').innerHTML='<div class="line"><span>Giriş mesafesi</span><b>Fiyat teyit girişinden %1’den fazla uzaklaştı; yeni analiz gerekir</b></div>';return;
 }
 const stopGap=Math.abs(x.price-x.stop)/x.price,fee=.0015,risk=b*.01;
 const notional=Math.min(risk/(stopGap+fee),b*10*.20),margin=notional/10;
 const potentialLoss=notional*(stopGap+fee),take1=notional*(Math.abs(x.targets[0]-x.price)/x.price-fee);
 $('calcResult').innerHTML=[['Coin / yön',x.symbol+' '+x.side],['Bakiye',b.toFixed(2)+' USDT'],['Giriş / Stop',fmt(x.price)+' / '+fmt(x.stop)],['Hedeflenen hesap riski','%1 / '+risk.toFixed(2)+' USDT'],['10x izole teminat',margin.toFixed(2)+' USDT'],['Pozisyon nominali',notional.toFixed(2)+' USDT'],['Stop senaryosu (tahmini)',potentialLoss.toFixed(2)+' USDT'],['TP1 senaryosu (tahmini)',take1.toFixed(2)+' USDT'],['Tahmini ücret+kayma','%0,15 nominal'],['Uyarı','Stop kayması/tasfiye ile kayıp artabilir']].map(([a,b])=>'<div class="line"><span>'+safe(a)+'</span><b>'+safe(b)+'</b></div>').join('');
}
$('calculator').onclick=()=>{$('calcModal').classList.add('open');calculator();};
$('calcClose').onclick=()=>{$('calcModal').classList.remove('open');};
$('calcModal').onclick=e=>{if(e.target===$('calcModal'))$('calcModal').classList.remove('open');};
$('balanceInput').oninput=calculator;

$('chartIndicatorsToggle')?.addEventListener('change',()=>drawChart());
window.CoinLivePro={state:S,render,currentRadar,get,fmt,age,notify,refreshState,selectSpark,refreshChartGuide:renderChartSelector};
window.addEventListener('resize',()=>{if(S.selected)drawChart();});
refresh();
// Price updates do not depend on GitHub Pages deployment or 15m Actions jobs.
setInterval(()=>{if(!document.hidden)refreshLivePrices();},20000);
// Central research JSON is independent and must remain fail-closed if stale.
setInterval(()=>{if(!document.hidden)refresh();},90000);
setInterval(refreshState,10000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){
  refreshLivePrices();
  if(!S.stamps.radar||Date.now()-S.stamps.radar>12*60000)refresh();
}});
window.addEventListener('focus',()=>{if(!document.hidden&&Date.now()-S.lastRefresh>20000)refreshLivePrices();});
})();