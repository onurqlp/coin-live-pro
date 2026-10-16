'use strict';
(()=>{
const $=id=>document.getElementById(id);
const S={market:[],radar:[],events:[],swingEvents:[],reports:[],provider:'',stamps:{},window:7,selected:null,live:false,loading:false,notified:new Set(),seen:new Set(),lastRefresh:0,initialized:false,chartCache:new Map(),chartLoading:null,chartTf:'4H',localRadar:[],localScanTime:0,localCoverage:0,localScanStatus:'Başlatılıyor',browserEvents:[]};
const safe=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const number=x=>x===null||x===undefined||x===''?NaN:Number(x);
const fmt=x=>!Number.isFinite(Number(x))?'—':Number(x)>=1000?Number(x).toLocaleString('en-US',{maximumFractionDigits:2}):Number(x)>=1?Number(x).toFixed(3):Number(x)>=.01?Number(x).toFixed(5):Number(x).toFixed(8);
const pct=x=>Number.isFinite(x)?(x>=0?'+':'')+x.toFixed(2)+'%':'—';
const age=ms=>Math.max(0,Math.floor((Date.now()-ms)/60000));
const clock=ms=>Number.isFinite(ms)?new Date(ms).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const usd=x=>x>=1e9?'$'+(x/1e9).toFixed(2)+'B':x>=1e6?'$'+(x/1e6).toFixed(1)+'M':x>=1000?'$'+(x/1000).toFixed(1)+'K':'$'+Number(x||0).toFixed(2);
async function get(path){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8500);try{const r=await fetch(path+(path.includes('?')?'&':'?')+'_='+Date.now(),{cache:'no-store',signal:ctl.signal});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}finally{clearTimeout(timer);}}
async function directQuote(){const data=await get('https://www.okx.com/api/v5/market/tickers?instType=SWAP');if(data.code!=='0'||!Array.isArray(data.data))throw Error('OKX feed');const rows=[];for(const x of data.data){if(!x.instId?.endsWith('-USDT-SWAP'))continue;const p=+x.last,o=+x.open24h,q=+x.volCcyQuote24h||(+x.volCcy24h*p);if(p>0&&q>0)rows.push({symbol:x.instId.slice(0,-10)+'USDT',price:p,change:o>0?(p/o-1)*100:null,volume:q});}return rows.sort((a,b)=>b.volume-a.volume).slice(0,100);}
function notify(item){return; /* 7-day pilot intentionally disables external/browser alerts */
 if(!('Notification' in window)||Notification.permission!=='granted'||S.notified.has(item.id))return;S.notified.add(item.id);try{new Notification('COIN.LIVE PRO · '+item.side+' '+item.stage,{body:item.symbol+' · '+fmt(item.price)+' · radar '+item.score+'/100 · gözlem, garanti değil'});}catch(e){}}
function currentRadar(){
 // Official cross-device radar is ONLY the central server snapshot.
 // Independent browser comparison never affects shared history or paper PnL.
 const ok=S.sparkModel==='2.3.0-htf-sparks'&&Number.isFinite(S.stamps.radar)&&Date.now()-S.stamps.radar<=25*60000;
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
   'Kıvılcım yalnız günlük + 4H trend uyumuyla oluşur. 1H/15m/5m/1m sadece teyit; gerçek emir yok.':
   'Sunucu '+(Number.isFinite(radarAge)?radarAge+' dk':'—')+' önce analiz yaptı. Eski kıvılcımlar yalnız geçmişte tutulur; yeni sanal giriş bekler.';
 $('healthTime').textContent='Sunucu '+(Number.isFinite(radarAge)?radarAge+' dk':'—')+' · Fiyat yedeği '+(Number.isFinite(marketAge)?marketAge+' dk':'—');
 $('source').textContent=live?'● OKX CANLI':'● '+(S.provider||'OKX')+' / SUNUCU';
 $('lastScan').textContent=Number.isFinite(S.stamps.radar)?
   new Date(S.stamps.radar).toLocaleTimeString('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'}):'—';
 const state=$('scanStatus');
 if(state){
   const until=S.stamps.radar?Math.max(0,Math.ceil((15*60000-(Date.now()-S.stamps.radar))/60000)):0;
   state.textContent='MERKEZİ 1D / 4H KIVILCIM · '+(trusted?'AKTİF':'GECİKMİŞ')+
     ' · son '+(Number.isFinite(radarAge)?radarAge+' dk önce':'henüz yok')+
     ' · sonraki tahmini ~'+until+' dk (GitHub gecikebilir) · tarayıcı kaydı yalnız karşılaştırmadır';
 }
}

async function refresh(){if(S.loading)return;S.loading=true;$('refresh').disabled=true;$('refresh').textContent='↻ Kontrol ediliyor…';let errors=[];const names=['market','swing-radar','history','reports','swing-history'],data=await Promise.allSettled(names.map(k=>get('./data/'+k+'.json')));data.forEach((r,i)=>{if(r.status!=='fulfilled'){errors.push(names[i]+': '+r.reason.message);return;}let x=r.value;if(i===0){S.market=x.rows||[];S.provider=x.provider||'OKX';S.stamps.market=Date.parse(x.fetched_at);}if(i===1){
 const ok=x.model_version==='2.3.0-htf-sparks' &&
 Array.isArray(x.timeframes_primary)&&x.timeframes_primary.includes('1D')&&x.timeframes_primary.includes('4H');
 S.sparkModel=ok?x.model_version:'INVALID_SOURCE';
 S.radar=ok?(x.items||[]).filter(y=>['1D','4H'].includes(y.primary_tf)&&y.quality==='VERIFIED_CLOSED_1D_4H'):[];
 S.stamps.radar=ok?Date.parse(x.fetched_at):0;
}if(i===2){S.events=x.events||[];S.stamps.history=Date.parse(x.updated_at);}if(i===3){S.reports=x.reports||[];S.stamps.reports=Date.parse(x.updated_at);}if(i===4){S.swingEvents=x.model_version==='2.3.0-htf-sparks'?(x.events||[]):[];}});
try{const direct=await directQuote();if(direct.length>=20){const mp=new Map(direct.map(x=>[x.symbol,x]));for(const old of S.market){if(mp.has(old.symbol))Object.assign(old,mp.get(old.symbol));}if(!S.market.length)S.market=direct;S.live=true;S.lastRefresh=Date.now();}}catch(e){S.live=false;errors.push('doğrudan fiyat: '+e.message);}
const first=!S.initialized;for(const ev of S.events){if(first)S.seen.add(ev.id);else if(!S.seen.has(ev.id)){S.seen.add(ev.id);if((ev.stage==='CONFIRMED'||ev.stage==='WATCH')&&Number.isFinite(Date.parse(ev.time))&&Date.now()-Date.parse(ev.time)<10*60000)notify(ev);}}
if(!S.initialized&&S.radar.length){
 S.selected=S.radar[0].symbol;
 S.chartTf=S.radar[0].primary_tf;
 $('chartTf').value=S.chartTf;
}
S.initialized=true;render();if(errors.length&&(!S.market.length||!S.events.length))$('healthExplain').textContent+=' · Kaynak sorunu: '+errors.join(' | ');
S.loading=false;$('refresh').disabled=false;$('refresh').textContent='↻ Güncelliği Kontrol Et';}
function render(){refreshState();$('marketCount').textContent=S.market.length||'—';$('longCount').textContent=currentRadar().items.filter(x=>x.side==='LONG').length;$('shortCount').textContent=currentRadar().items.filter(x=>x.side==='SHORT').length;renderRadar();renderChartSelector();renderHistory();renderLocalHistory();renderReports();renderQuality();renderMarket();}
function selectSpark(symbol,tf,openAdvanced=false){
 const accepted=['1m','5m','15m','1H','4H','12H','1D','1W'];
 const spark=currentRadar().items.find(x=>x.symbol===symbol);
 if(!S.market.some(x=>x.symbol===symbol)&&!spark)return;
 const target=accepted.includes(tf)?tf:(spark?.primary_tf||'4H');
 S.selected=symbol;S.chartTf=target;
 $('chartTf').value=target;
 renderChartSelector();
 highlightSpark();
 if(openAdvanced){
   location.hash='#grafikler';
 }else if(document.body.dataset.route==='radar'&&window.matchMedia('(max-width:980px)').matches){
   $('chartPanel').scrollIntoView({behavior:'smooth',block:'start'});
 }
 ensureChart(true);
}
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
   const confirmed=x.stage==='CONFIRMED',tf=x.primary_tf==='1D'?'GÜNLÜK':'4 SAAT';
   const c=x.confirmation||{};
   const timing=['1H','15m','5m','1m'].map(frame=>'<span class="timing '+
     (c[frame]?'hit':'miss')+'">'+frame+(c[frame]?' ✓':' ·')+'</span>').join('');
   const flags=(x.market_structure_flags||[]).filter(v=>!String(v).endsWith('_NOT_VERIFIED')).length;
   return '<button type="button" class="radarLine" data-symbol="'+safe(x.symbol)+
     '" data-tf="'+safe(x.primary_tf)+'" aria-pressed="false" aria-label="'+
     safe(x.symbol)+' '+safe(x.side)+' · '+tf+' mum grafiğini aç"><span class="rank">'+(i+1)+
     '</span><span class="sparkMain"><span class="coin">'+safe(x.symbol.replace('USDT',''))+
     ' <span class="chip '+(x.side==='LONG'?'long':'short')+'">'+safe(x.side)+'</span>'+
     ' <span class="chip '+(confirmed?'confirmed':'watch')+'">'+(confirmed?'TEYİT':'İZLE')+'</span></span>'+
     '<span class="reason"><strong>'+tf+'</strong> · '+safe(x.expected_holding)+
     ' · haftalık '+(c['1W']?'uyumlu':'ayrışıyor')+' · risk '+safe(x.risk_score)+'/100'+
     (flags?' · '+flags+' uyarı':'')+'</span><span class="timingRow">'+timing+'</span></span>'+
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

async function ensureChart(force=false){
 if(!S.selected)return;
 const symbol=S.selected,tf=S.chartTf;
 const key=symbol+'|'+tf;
 const current=S.chartCache.get(key);
 if(!force&&current&&Date.now()-current.at<60000)return;
 if(S.chartLoading===key)return;
 S.chartLoading=key;
 try{
  const inst=symbol.replace(/USDT$/,'-USDT-SWAP');
  if(!/^[A-Z0-9]+-USDT-SWAP$/.test(inst))throw Error('Geçersiz coin');
  const bars={'1m':'1m','5m':'5m','15m':'15m','1H':'1H','4H':'4H','12H':'12Hutc','1D':'1Dutc','1W':'1Wutc'};
  const duration={'1m':60000,'5m':300000,'15m':900000,'1H':3600000,'4H':14400000,'12H':43200000,'1D':86400000,'1W':604800000};
  const json=await get('https://www.okx.com/api/v5/market/candles?instId='+encodeURIComponent(inst)+'&bar='+bars[tf]+'&limit=90');
  if(json.code!=='0'||!Array.isArray(json.data))throw Error('OKX mum yanıtı yok');
  const now=Date.now();
  const lines=json.data.map(x=>[+x[0],+x[1],+x[2],+x[3],+x[4],+x[5]])
    .filter(x=>x.every(Number.isFinite)&&x[0]+duration[tf]<now-1000)
    .sort((a,b)=>a[0]-b[0]);
  if(lines.length<Math.min(14,90))throw Error('Bu zaman diliminde yeterince geçmiş mum yok');
  S.chartCache.set(key,{at:Date.now(),data:lines});
 }catch(e){console.warn('COIN.LIVE chart source:',symbol,e.message);}
 finally{S.chartLoading=null;if(S.selected===symbol&&S.chartTf===tf)drawChart();}
}
function renderChartSelector(){const prior=S.selected;const options=[...new Set([...currentRadar().items.map(x=>x.symbol),...S.events.slice(0,25).map(x=>x.symbol),...S.market.map(x=>x.symbol)])];if(!options.length)options.push('BTCUSDT','ETHUSDT');if(!options.includes(S.selected))S.selected=options[0];const existing=[...$('chartCoin').options].map(x=>x.value).join('|');if(existing!==options.join('|'))$('chartCoin').innerHTML=options.map(x=>`<option value="${safe(x)}">${safe(x.replace('USDT',''))} / USDT</option>`).join('');$('chartCoin').value=S.selected;const link='https://www.tradingview.com/chart/?symbol='+encodeURIComponent('OKX:'+S.selected.replace('USDT','')+'USDT.P');$('tvLink').href=link;drawChart();ensureChart();}
function drawChart(){const c=$('candleChart'),ctx=c.getContext('2d'),r=c.getBoundingClientRect();const w=Math.max(340,r.width||500),h=340,ratio=Math.min(2,window.devicePixelRatio||1);c.width=Math.floor(w*ratio);c.height=Math.floor(h*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle='#0b1421';ctx.fillRect(0,0,w,h);const signal=currentRadar().items.find(x=>x.symbol===S.selected)||null;const cache=S.chartCache.get(S.selected+'|'+S.chartTf);const raw=(cache&&Date.now()-cache.at<120000?cache.data:null)||(S.chartTf==='15m'?signal?.ohlc15:[])||[];const candles=raw.slice(-52).map(x=>({t:x[0],o:x[1],h:x[2],l:x[3],c:x[4]}));if(candles.length<10){ctx.fillStyle='#adc1dc';ctx.font='13px system-ui';ctx.fillText('Bu coin için kapanmış mum grafiği henüz alınmadı.',17,36);$('chartCaption').textContent='Doğrudan OKX 15m mumlarına bağlanılıyor. Kaynak erişimi yoksa son arşiv grafiği gösterilir.';return;}const left=12,right=96,top=16,bottom=29;let lo=Math.min(...candles.map(x=>x.l)),hi=Math.max(...candles.map(x=>x.h));const lineLevels=[];if(signal){lineLevels.push({label:'EŞİK',v:signal.threshold,color:'#f7cc7d'});if(signal.stage==='CONFIRMED'){lineLevels.push({label:'STOP',v:signal.stop,color:'#ff8296'});signal.targets.forEach((t,i)=>lineLevels.push({label:'TP'+(i+1),v:t,color:'#4ce2b4'}));}}for(const l of lineLevels){lo=Math.min(lo,l.v);hi=Math.max(hi,l.v);}const pad=(hi-lo)*.12||hi*.003;lo-=pad;hi+=pad;const yy=v=>top+(hi-v)/(hi-lo)*(h-top-bottom),xx=i=>left+(i+.5)*(w-left-right)/candles.length;ctx.font='10px system-ui';for(let i=0;i<=5;i++){const y=top+(h-top-bottom)*i/5;ctx.strokeStyle='#27374e';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();ctx.fillStyle='#819dbb';ctx.fillText(fmt(hi-(hi-lo)*i/5),w-right+6,y+3);}for(let i=0;i<candles.length;i++){const b=candles[i],x=xx(i),col=b.c>=b.o?'#48d7b0':'#fc8098';ctx.strokeStyle=col;ctx.beginPath();ctx.moveTo(x,yy(b.h));ctx.lineTo(x,yy(b.l));ctx.stroke();ctx.fillStyle=col;ctx.fillRect(x-3,Math.min(yy(b.o),yy(b.c)),6,Math.max(1.5,Math.abs(yy(b.c)-yy(b.o))));}for(const l of lineLevels){ctx.setLineDash([4,4]);ctx.strokeStyle=l.color;const y=yy(l.v);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=l.color;ctx.font='bold 10px system-ui';ctx.fillText(l.label+' '+fmt(l.v),w-right+5,y-5);}for(let i=0;i<4;i++){const idx=Math.round(i*(candles.length-1)/3);ctx.fillStyle='#8aa6c0';ctx.font='10px system-ui';ctx.fillText(new Date(candles[idx].t).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}),xx(idx)-15,h-8);}$('chartCaption').textContent=S.selected+' · OKX Perpetual · '+S.chartTf+' kapanmış mumlar (1D/1W UTC) · '+(signal?signal.side+' '+(signal.stage==='CONFIRMED'?'TEYİT':'İZLE')+' · radar '+signal.score+'/100':'GÜNCEL FİYAT GRAFİĞİ')+' · '+(cache?'tarayıcıdan gelen mumlar':'arşiv mumları')+' · teyitsiz seviye işlem emri değildir.';}
const stateLabel={WATCHING:'İZLENİYOR',OPEN:'AÇIK (TEMSiLİ)',TP1:'TP1 GÖRÜLDÜ',STOP:'STOP GÖRÜLDÜ',AMBIGUOUS:'BELİRSİZ',DATA_GAP:'VERİ BOŞLUĞU',EXPIRED:'SÜRESİ DOLDU'};
function renderHistory(){const cutoff=Date.now()-S.window*86400000,list=S.events.filter(x=>+x.at_ms>=cutoff).slice(0,150);const report=S.reports.find(x=>x.days===S.window);$('reportStats').innerHTML=[['Kıvılcım',report?.total??list.length],['LONG',report?.longs??'—'],['SHORT',report?.shorts??'—'],['TP1 / STOP',(report?.wins??0)+' / '+(report?.losses??0)],['Net R*',report?.sum_net_R==null?'Henüz yok':report.sum_net_R]].map(([a,b])=>`<div class="stat"><small>${safe(a)}</small><strong>${safe(b)}</strong></div>`).join('');$('historyRows').innerHTML=list.length?list.map(x=>`<tr><td>${safe(x.time?.replace('T',' ').slice(0,16))}</td><td>${safe(x.symbol)}</td><td><span class="chip ${x.side==='LONG'?'long':'short'}">${x.side}</span></td><td><span class="chip ${x.stage==='CONFIRMED'?'confirmed':'watch'}">${x.stage==='CONFIRMED'?'TEYİT':'İZLE'}</span></td><td>${fmt(x.price)}</td><td>${safe(stateLabel[x.state]||x.state)}</td><td class="positive">${pct(number(x.mfe_pct))}</td><td class="negative">${pct(number(x.mae_pct))}</td><td>${x.net_R==null?'—':Number(x.net_R).toFixed(2)+'R'}</td></tr>`).join(''):'<tr><td colspan="9">Bu dönemde kayıtlı kıvılcım yok. Yeni proje yayına alındıktan sonra gerçek zamanlı birikir.</td></tr>';}
function renderLocalHistory(){
 const area=$('browserHistory');if(!area)return;
 const cutoff=Date.now()-14*86400000;
 const list=S.browserEvents.filter(e=>e.at_ms>=cutoff).slice(0,20);
 area.innerHTML=list.length?list.map(e=>'<div class="localEvent"><span>'+
 safe(new Date(e.at_ms).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}))+
 '</span><strong class="'+(e.side==='LONG'?'positive':'negative')+'">'+safe(e.symbol.replace('USDT',''))+' '+safe(e.side)+'</strong>'+
 '<span>'+safe(e.stage==='CONFIRMED'?'TEYİT':'İZLE')+'</span><small>'+fmt(e.price)+' · '+e.score+'/100</small></div>').join(''):
 '<div class="empty">Bu cihazda henüz bağımsız kıvılcım kaydı yok. İlk canlı taramadan sonra burada görünür.</div>';
}
function renderReports(){$('weekCards').innerHTML=[7,14].map(days=>{const r=S.reports.find(x=>x.days===days)||{};return `<div class="reportCard"><h3>${days} GÜN</h3>${[['Kıvılcım',r.total??0],['LONG / SHORT',(r.longs??0)+' / '+(r.shorts??0)],['Teyitli',r.confirmed??0],['Sonuçlanan',r.closed??0],['TP1 / STOP',(r.wins??0)+' / '+(r.losses??0)],['Belirsiz / veri boşluğu',r.ambiguous??0],['İzlenen başarı',r.win_rate==null?'Henüz ölçülemedi':r.win_rate+'%'],['Toplam temsili net R',r.sum_net_R==null?'—':r.sum_net_R+'R'],['100 USDT varsayımında ±$',r.illustrative_100_usdt_delta==null?'Örnek yok':(r.illustrative_100_usdt_delta>=0?'+':'')+r.illustrative_100_usdt_delta+' USDT'],['İZLE kıvılcımında +%1 yön hareketi',r.watch_1pct_observed_rate==null?'Henüz ölçülemedi':r.watch_1pct_observed_rate+'%']].map(([k,v])=>`<div class="line"><span>${safe(k)}</span><b>${safe(v)}</b></div>`).join('')}<p class="method">${r.sample_ok?'30+ kapanmış örnek var; gene de kesin öngörü değildir.':'İstatistiksel çıkarım için en az 30 sonuçlanan teyitli olay hedeflenir.'}</p></div>`;}).join('');}
function renderQuality(){const rows=[['Fiyat kaynağı',S.provider||'Bekleniyor'],['Sunucu fiyat yaşı',S.stamps.market?age(S.stamps.market)+' dk':'—'],['Sunucu radar yaşı',S.stamps.radar?age(S.stamps.radar)+' dk':'—'],['Tarayıcıdan fiyat bağlantısı',S.live?'OKX başarılı':'Ulaşılamadı / denenmedi'],['Sinyal değerlendirmesi','15m OHLC · geriye dönük uydurma yok'],['İşlem girişleri','WATCH ≠ işlem; CONFIRMED ≠ gerçek emir'],['Sonuç boşlukları','Belirsiz / veri boşluğu ayrı sınıf'],['Risk hesabı','10x varsayım · örnek 1R · maliyet %0,15'],['Yeni analiz','GitHub yaklaşık 15 dk aralıkla kapanmış 1D/4H kontrol eder; mikro mumlar yalnız teyit']];$('quality').innerHTML=rows.map(([k,v])=>`<div class="line"><span>${safe(k)}</span><b>${safe(v)}</b></div>`).join('');}
function renderMarket(){$('marketRows').innerHTML=S.market.slice(0,100).map((m,i)=>{const x=currentRadar().items.find(a=>a.symbol===m.symbol);return `<tr class="marketCoinRow" data-symbol="${safe(m.symbol)}" title="Bu coinin grafiğini aç"><td>${i+1}</td><td><b>${safe(m.symbol.replace('USDT',''))}</b> / USDT</td><td>${fmt(m.price)}</td><td class="${m.change>=0?'positive':'negative'}">${pct(number(m.change))}</td><td>${usd(m.volume)}</td><td>${x?`<span class="chip ${x.side==='LONG'?'long':'short'}">${x.side}</span> <span class="chip ${x.stage==='WATCH'?'watch':'confirmed'}">${x.stage==='WATCH'?'İZLE':'TEYİT'}</span>`:'—'}</td></tr>`;}).join('');
 for(const el of document.querySelectorAll('.marketCoinRow'))el.onclick=()=>{
   S.selected=el.dataset.symbol;
   $('chartCoin').value=S.selected;
   location.hash='#grafikler';
   ensureChart(true);
 };
}
$('chartCoin').onchange=e=>{S.selected=e.target.value;renderChartSelector();ensureChart(true);};
$('chartTf').onchange=e=>{S.chartTf=e.target.value;drawChart();ensureChart(true);};document.querySelectorAll('[data-window]').forEach(b=>b.onclick=()=>{S.window=+b.dataset.window;document.querySelectorAll('[data-window]').forEach(x=>x.classList.toggle('active',x===b));renderHistory();});$('refresh').onclick=async()=>{await refresh();await ensureChart(true);};
$('compareBrowser').onclick=async()=>{
  const b=$('compareBrowser');b.disabled=true;b.textContent='Yerel OHLC karşılaştırılıyor…';
  try{await window.CoinLiveProClient?.scan(true);}
  finally{b.disabled=false;b.textContent='↻ Sadece bu cihazda karşılaştır';}
};
function calculator(){
 const b=Number($('balanceInput').value),x=currentRadar().items.find(z=>z.symbol===S.selected&&z.stage==='CONFIRMED');
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
$('alerts').disabled=true;$('alerts').textContent='🔕 Pilot: bildirim kapalı';
window.CoinLivePro={state:S,render,currentRadar,get,fmt,age,notify,refreshState};
window.addEventListener('resize',()=>{if(S.selected)drawChart();});
refresh();
setInterval(refresh,60000);
setInterval(refreshState,12000);
})();