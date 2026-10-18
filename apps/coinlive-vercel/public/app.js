const $=id=>document.getElementById(id);
let state=null, stage='ALL', side='ALL', search='', expanded=false, days=7, selected=null, chartFrame='1H', lastChart=null, chartTicket=0, historyTicket=0, historyData=null, historyFilter='ALL', historyVisible=15;
const num=x=>typeof x==='number'&&Number.isFinite(x)?x.toLocaleString('tr-TR',{maximumFractionDigits:3}):'Bilinmiyor';
const el=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=String(txt);return x;};
const clear=x=>x.replaceChildren();
function section(name){
 document.querySelectorAll('.pane').forEach(p=>p.hidden=p.id!==name);
 document.querySelectorAll('.tab').forEach(b=>{
   const active=b.dataset.tab===name;b.classList.toggle('active',active);
   if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
 });
 const current=document.querySelector('.pane:not([hidden])');
 if(current && (name==='chart'||name==='history'))window.scrollTo({top:0,behavior:'instant'});
 if(name==='chart'&&state)loadPriceChart();
 if(name==='history'&&state)loadHistory();
}
function metric(title,value){const v=el('div','stat');v.append(el('small','muted',title),el('strong','',value));return v;}
const stages={WATCH:'◉ İZLE',MOTION:'↗ HAREKET',SPOTLIGHT:'👁 GÖZ ÖNÜNDE',RECHECK_PENDING:'KONTROL BEKLİYOR'};
function shortTime(raw){const t=Date.parse(raw||'');return Number.isFinite(t)?new Date(t).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}):'Saat bilinmiyor';}
function candidateCard(x){
 const v=el('button','card clickable'),top=el('div','cardtop');v.type='button';v.setAttribute('aria-label',`${x.symbol} ${x.side} ${stages[x.stage]||x.stage} grafiğini aç`);
 top.append(el('strong','',x.symbol||'—'),el('span',x.side==='LONG'?'long':x.side==='SHORT'?'short':'',x.side==='LONG'?'▲ LONG':x.side==='SHORT'?'▼ SHORT':'—'));
 const label=el('div','stage-label '+(x.stage==='SPOTLIGHT'?'highlight':''),stages[x.stage]||x.stage||'Takipte');
 const price=el('div','card-price',x.price==null?'Fiyat bekleniyor':num(x.price)+' USDT');
 const reason=x.confirmation==='CONFIRMED'?'Teyit durumu: doğrulandı. İşlem emri değil.':'Teyit bekleniyor · Henüz giriş sinyali değil';
 const foot=el('div','card-foot');foot.append(el('span','',shortTime(x.observedAtUtc)),el('span','','Grafiği gör →'));
 v.append(top,label,price,el('div','card-reason',reason),el('div','score',`Güç puanı ${num(x.score)} · Risk ${num(x.riskScore)}`),foot);
 v.addEventListener('click',()=>openCandidate(x));
 return v;
}
function openCandidate(x){
 selected=x;$('chartSymbol').value=x.symbol;
 const panel=$('chartInfo');clear(panel);
 panel.append(el('strong','',`${x.symbol} · ${x.side} · ${stages[x.stage]||x.stage||'ERKEN'}`),
   el('p','scenario-sub',`Strateji: ${x.strategy||'Araştırma'} · ${x.confirmation==='CONFIRMED'?'Teyit kaydı var':'Teyit bekleniyor · sanal giriş değil'}`));
 const levels=el('div','levels');
 for(const [label,value,cl] of [['İzlenen fiyat',x.price,''],['Koşullu stop',x.stop,'stop'],...((x.targets||[]).slice(0,3).map((a,i)=>['Hedef '+(i+1),a,'tp']))]){
 const item=el('div','level '+cl);item.append(el('small','',label),el('b','',value==null?'Bilinmiyor':num(value)));levels.append(item);
 }
 panel.append(levels,el('p','muted',(x.reasons||[]).join(' · ')||'Ayrıntılı gerekçe kaynakta mevcut değil.'));
 section('chart');
}
function renderRadar(){
 const v=$('cards');clear(v);const e=$('early');clear(e);
 if(!state||state.source.status!=='VERIFIED'){
 v.append(el('div','empty','Şu anda güncel ve doğrulanmış fırsat bulunmuyor. Eski veriyle işlem yapılmaz.'));
 $('count').textContent='0 güncel aday';$('radarTotal').textContent='0';
 $('radarSummary').textContent='Kaynak doğrulanana kadar adaylar gizlenir.';$('showAll').hidden=true;
 return;
 }
 const all=state.radar.candidates||[];
 const a=all.filter(x=>(stage==='ALL'||x.stage===stage)&&(side==='ALL'||x.side===side)&&(!search||(x.symbol||'').toUpperCase().includes(search)));
 $('count').textContent=`${a.length} güncel araştırma kaydı · ${state.radar.pendingCount||0} yeniden kontrol bekliyor`;
 $('radarTotal').textContent=num(all.length);
 $('radarSummary').textContent=all.length?'Adaylar yalnız izleme amaçlı. Önce grafiği kontrol et.':'Bu taramada güncel aday bulunmadı.';
 if(!a.length)v.append(el('div','empty','Bu filtrede aday yok. İstersen Hepsi seçeneğine dön.'));
 for(const x of (expanded?a:a.slice(0,3)))v.append(candidateCard(x));
 $('showAll').hidden=a.length<=3;
 $('showAll').textContent=expanded?'Daha az göster ↑':`Diğer ${a.length-3} coin'i göster ↓`;
 for(const x of state.radar.early||[]){
   const c=el('button','card clickable');c.type='button';
   c.append(el('strong','',`${x.symbol} · ${x.side}`),el('div','meta',`Erken izleme · ${num(x.rank)} puan`),el('small','muted','Henüz teyit değil · grafik için dokun'));
   c.addEventListener('click',()=>openCandidate({...x,stage:x.tier,confirmation:'RESEARCH_ONLY',strategy:'EARLY_RESEARCH'}));e.append(c);
 }
 if(!(state.radar.early||[]).length)e.append(el('div','empty','Yeni kıvılcım kaydı yok.'));
}
// The chart endpoint independently validates the exact immutable Git blob and
// V4 history SHA-256. The browser never substitutes a live unclosed bar.
function renderCandles(data){
 for(const id of ['marketChart','quickChart']){
 const canvas=$(id);if(!canvas)continue;
 const box=canvas.getBoundingClientRect();if(box.width<100)continue;
 const w=Math.max(250,Math.round(box.width)),h=Math.round(box.height||280),dpr=Math.min(window.devicePixelRatio||1,2);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 const ctx=canvas.getContext('2d');if(!ctx)continue;
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const candles=data.candles||[];if(!candles.length)continue;
 const L=12,R=64,T=18,B=28,iw=w-L-R,ih=h-T-B;
 const low=Math.min(...candles.map(c=>c.low)),high=Math.max(...candles.map(c=>c.high));
 const pad=(high-low)*0.07||Math.max(high*.01,.00000001),min=low-pad,max=high+pad;
 const y=p=>T+(max-p)/(max-min)*ih;
 const label=p=>Number(p).toLocaleString('tr-TR',{maximumFractionDigits:p>=100?2:p>=1?4:8});
 ctx.font='10px system-ui';ctx.textAlign='left';ctx.lineWidth=1;
 for(let i=0;i<=4;i++){const v=min+(max-min)*i/4,py=y(v);ctx.strokeStyle='#294452';ctx.beginPath();ctx.moveTo(L,py);ctx.lineTo(w-R,py);ctx.stroke();ctx.fillStyle='#acc7d3';ctx.fillText(label(v),w-R+6,py+3);}
 const dx=iw/candles.length,cw=Math.max(1,Math.min(9,dx*.62));
 candles.forEach((c,i)=>{const xx=L+dx*(i+.5),up=c.close>=c.open,col=up?'#51d8b3':'#ee8592';ctx.strokeStyle=col;ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(xx,y(c.high));ctx.lineTo(xx,y(c.low));ctx.stroke();const top=Math.min(y(c.open),y(c.close)),height=Math.max(1,Math.abs(y(c.open)-y(c.close)));ctx.fillRect(xx-cw/2,top,cw,height);});
 const scenario=selected?.symbol===data.symbol?selected:null;
 for(const [price,col,title] of [[scenario?.stop,'#f19ba4','STOP'],...((scenario?.targets||[]).slice(0,3).map((p,i)=>[p,'#57dfc5','TP'+(i+1)]))]){
  if(typeof price!=='number'||price<=min||price>=max)continue;const py=y(price);ctx.setLineDash([4,4]);ctx.strokeStyle=col;ctx.beginPath();ctx.moveTo(L,py);ctx.lineTo(w-R,py);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=col;ctx.fillText(title,L+4,py-3);
 }
 const first=candles[0].t,last=candles.at(-1).t,span=(data.timeframe==='1H'?3600000:data.timeframe==='4H'?14400000:86400000);
 (data.markers||[]).forEach(m=>{const at=Date.parse(m.atUtc);if(!Number.isFinite(at)||at<first||at>=last+span)return;const ix=Math.min(candles.length-1,Math.floor((at-first)/span));const c=candles[ix];const xx=L+dx*(ix+.5);ctx.fillStyle='#9fa9ff';ctx.beginPath();ctx.arc(xx,Math.max(10,y(c.high)-8),3.2,0,2*Math.PI);ctx.fill();});
 ctx.fillStyle='#abc5d2';ctx.textAlign='left';ctx.fillText(new Date(first).toISOString().slice(5,16).replace('T',' '),L,h-6);ctx.textAlign='right';ctx.fillText(new Date(last).toISOString().slice(5,16).replace('T',' '),w-R,h-6);
 }
}

async function loadPriceChart(){
 if(!state)return;
 const symbol=$('chartSymbol').value.trim().toUpperCase();$('chartSymbol').value=symbol;
 if(!/^[A-Z0-9]{2,18}USDT$/.test(symbol)){$('chartStatus').textContent='Coin adını kontrol et. Örnek: BTCUSDT';return;}
 if(state.source.status!=='VERIFIED'){
   $('chartStatus').textContent='Kaynak eski veya doğrulanamadı; grafik kapatıldı.';
   $('quickStatus').textContent='Güncel grafik mevcut değil';lastChart=null;
   for(const id of ['marketChart','quickChart']){$(id)?.getContext('2d')?.clearRect(0,0,$(id).width,$(id).height);}return;
 }
 if(lastChart?.symbol===symbol&&lastChart?.timeframe===chartFrame&&lastChart?.commit===state.source.commit){
   $('quickHeading').textContent=`${symbol} · ${chartFrame==='1H'?'1 saat':chartFrame==='4H'?'4 saat':'1 gün'}`;
   renderCandles(lastChart);return;
 }
 const mine=++chartTicket;$('chartStatus').textContent=`${symbol} ${chartFrame} · Kapanmış mumlar doğrulanıyor…`;
 $('quickStatus').textContent='Grafik doğrulanıyor…';
 try{
  const url=`/api/chart?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(chartFrame)}&commit=${encodeURIComponent(state.source.commit)}`;
  const response=await fetch(url,{cache:'no-store'});const x=await response.json();if(mine!==chartTicket)return;
  if(!response.ok||x.candleState!=='CLOSED_ONLY'||x.commit!==state.source.commit)throw new Error(x.error||'CHART_UNVERIFIED');
  lastChart=x;renderCandles(x);
  $('quickHeading').textContent=`${symbol} · ${chartFrame==='1H'?'1 saat':chartFrame==='4H'?'4 saat':'1 gün'}`;
  $('chartStatus').textContent=`OKX kapanmış mum · ${x.candles.length} bar · ${x.excludedUnclosedCount} açık mum dışlandı · Git blob doğrulandı · ${x.markers.length} arşiv olayı`;
  $('quickStatus').textContent=`${x.candles.length} kapanmış mum · OKX doğrulandı`;
 }catch(error){if(mine!==chartTicket)return;lastChart=null;
  for(const id of ['marketChart','quickChart']){$(id)?.getContext('2d')?.clearRect(0,0,$(id).width,$(id).height);}
  $('chartStatus').textContent=`Grafik güvenli biçimde kapatıldı: ${error.message}`;
  $('quickStatus').textContent='Doğrulanmış grafik yüklenemedi';
 }
}

function renderPaper(){const x=$('paperCards'),e=$('experiment');clear(x);clear(e);if(!state){x.append(el('p','empty','Kaynak bulunamadı'));return;}
 const p=state.paper,t=state.experimental;x.append(metric('Ana başlangıç',num(p.startingBalanceUsdt)+' USDT'),metric('Ana özkaynak',num(p.equityUsdt)+' USDT'),metric('Ana gerçekleşen',num(p.realizedUsdt)+' USDT'),metric('Ana açık işlem',num(p.openCount)));
 e.append(metric('Deneysel sanal özkaynak',num(t.estimatedEquityUsdt)+' USDT'),metric('Deney muhasebe net',num(t.accountingRealizedUsdt)+' USDT'),metric('Kapanan deney bileti',num(t.reviewAll?.closed)),metric('Kohort toplamı (ayrı metrik)',num(t.reviewAll?.realized_total_usdt)+' USDT'),el('p','muted',`${t.note} · Funding: ${t.fundingState}`));
}
function renderForward(){
 const v=$('forwardInfo');clear(v);
 if(!state){v.append(el('div','empty','Veri yok'));return;}
 const p=state.forward.periods.find(x=>x.days===days);
 if(!p){v.append(el('div','empty','Bu döneme ait veri yok'));return;}
 const sufficient=p.quality==='SUFFICIENT_SAMPLE';
 v.append(el('div','health-summary',sufficient?'Ölçüm için örneklem mevcut':'Henüz yeterli sonuç yok · INSUFFICIENT_SAMPLE'));
 v.append(el('p','muted',`Örneklem durumu: ${p.quality}. Gözlenen olay: ${num(state.forward.observations)}. Kazanma yüzdesi tahmin edilmez.`));
 for(const[id,x]of Object.entries(p.strategies||{})){
  const line=el('div','keyvalue');
  line.append(el('strong','',id),el('span','muted',` Keşif ${num(x.discovered)} · Giriş uygun ${num(x.entryEligible)} · 1H n=${num(x.horizons?.['1H']?.observed)} · 4H n=${num(x.horizons?.['4H']?.observed)} · 24H n=${num(x.horizons?.['24H']?.observed)} · 3D n=${num(x.horizons?.['3D']?.observed)} · 7D n=${num(x.horizons?.['7D']?.observed)}`));v.append(line);
 }
}

function renderSystem(){
 const v=$('systemInfo');clear(v);
 if(!state){v.append(el('p','', 'Kaynak doğrulanamadı'));$('healthSummary').textContent='Veri doğrulaması başarısız';return;}
 const s=state.source;
 $('healthSummary').textContent=s.status==='VERIFIED'?
  `✓ Kaynak doğrulandı · Son tarama ${shortTime(s.observedAtUtc)} · ${num(s.testedPairs)}/${num(s.attemptedPairs)} coin`:'⚠ Kaynak eski veya doğrulanamadı';
 for(const[k,w]of [['App sürümü',state.appVersion],['Mevcut ürün sürümü',state.sourceProductVersion],['Commit',s.commit],['Scan ID',s.scanId],['Gözlem UTC',s.observedAtUtc],['Veri yaşı (dk)',num(s.ageMinutes)],['Tetikleyici',s.trigger],['Kaynak',s.provider],['Kaynak sağlığı',s.healthStatus],['Başarılı piyasa taraması',num(s.testedPairs)+' / '+num(s.attemptedPairs)],['Gözlenen schedule sayısı',num(s.scheduledRunsObserved)],['Manifest + SHA-256',s.manifestVerified&&s.payloadShaVerified?'DOĞRULANDI':'HATA'],['Eski sağlık scan ID',s.healthLegacyScanId||'—'],['scan_id olmayan kaynak',(s.unscopedSources||[]).join(', ')||'Yok'],['Gerçek emir','YOK']]){
 const row=el('div','keyvalue');row.append(el('strong','',k),el('span','',w));v.append(row);
 }
}

function render(){
 if(!state)return;const s=state.source;
 $('health').textContent=s.status==='VERIFIED'?'✓ Doğrulanmış':'⚠ ESKİ';
 $('health').className='chip '+(s.status==='VERIFIED'?'good':'warn');
 $('time').textContent=`${shortTime(s.observedAtUtc)} · ${num(s.ageMinutes)} dk`;
 $('source').textContent=`${s.provider} · ${s.trigger}`;
 renderRadar();renderPaper();renderForward();renderSystem();
}
async function reload(){
 const b=$('reload');b.disabled=true;$('health').textContent='Kontrol ediliyor';
 try{
 const response=await fetch('/api/snapshot',{cache:'no-store'}),data=await response.json();
 if(!response.ok)throw new Error((data.error||response.status)+': '+(data.detail||'Doğrulanamadı'));
 const previous=state?.source?.commit;state=data;
 if(previous!==state.source.commit){lastChart=null;historyData=null;chartTicket++;}
 render();
 if(!$('radar').hidden&&state.source.status==='VERIFIED')loadPriceChart();
 }catch(error){
 state=null;historyData=null;lastChart=null;chartTicket++;
 $('health').textContent='⚠ Veri doğrulanamadı';$('health').className='chip warn';
 $('time').textContent=error.message;$('source').textContent='Yeni sinyal yok';
 $('healthSummary').textContent='Kaynak doğrulanamadı · Eski sinyaller gizlendi';
 $('quickStatus').textContent='Doğrulanmış grafik yok';
 for(const id of ['marketChart','quickChart']){$(id)?.getContext('2d')?.clearRect(0,0,$(id).width,$(id).height);}
 renderRadar();for(const id of ['paperCards','experiment','forwardInfo','systemInfo'])clear($(id));
 clear($('historyCards'));$('historyCount').textContent='Kaynak doğrulanamadı';
 }finally{b.disabled=false;}
}
const historyLabels={WATCH_STARTED:'İzlemeye alındı',MOTION_CONFIRMED:'Hareket başladı',SPOTLIGHT_REACHED:'Göz önünde',INVALIDATED:'Geçersiz oldu',RECHECK_PENDING:'Kontrol bekliyor',ARCHIVED:'Arşivlendi'};
function renderHistory(){
 const container=$('historyCards');clear(container);
 if(!state){container.append(el('div','empty','Kaynak doğrulanamadı'));return;}
 if(!historyData){container.append(el('div','empty','Geçmiş olaylar doğrulanıyor…'));return;}
 const events=historyData.events.filter(x=>historyFilter==='ALL'||
   (historyFilter==='INVALIDATED'?x.type==='INVALIDATED':
    /MOTION|SPOTLIGHT|CONFIRMED|GELDI/.test(x.type)));
 $('historyCount').textContent=`${events.length} doğrulanmış olay · ${historyData.sourceStatus==='STALE_HISTORY'?'Eski kayıt':'Kaynak doğrulandı'}`;
 $('historyMore').hidden=events.length<=historyVisible;
 $('historyMore').textContent=`Diğer ${Math.min(15,events.length-historyVisible)} olayı göster ↓`;
 if(!events.length){container.append(el('div','empty','Bu filtreye uygun kayıt yok'));return;}
 for(const x of events.slice(0,historyVisible)){
  const card=el('div','history-event'),top=el('div','history-headline');
  top.append(el('strong','',x.symbol+' · '+(x.side||'—')),el('span','history-type '+(x.type==='INVALIDATED'?'invalid':/MOTION|SPOTLIGHT/.test(x.type)?'progress':''),historyLabels[x.type]||x.type.replaceAll('_',' ')));
  card.append(top,el('p','',`Aşama: ${stages[x.prev]||x.prev||'—'} → ${stages[x.next]||x.next||'—'}`),
    el('small','',`${shortTime(x.timeUtc)} · ${x.strategy||'Araştırma'} · ${x.price==null?'Fiyat yok':num(x.price)+' USDT'}`));
  container.append(card);
 }
}
async function loadHistory(){
 if(!state){renderHistory();return;}
 if(historyData?.commit===state.source.commit){renderHistory();return;}
 const mine=++historyTicket;
 $('historyCount').textContent='Geçmiş doğrulanıyor…';
 clear($('historyCards'));$('historyCards').append(el('div','empty','Kaynak geçmişi kontrol ediliyor…'));
 try{
  const response=await fetch('/api/history?commit='+encodeURIComponent(state.source.commit),{cache:'no-store'});
  const data=await response.json();if(mine!==historyTicket)return;
  if(!response.ok||!data.sourceVerified||data.commit!==state.source.commit)throw new Error(data.error||'HISTORY_UNVERIFIED');
  historyData=data;renderHistory();
 }catch(error){
  if(mine!==historyTicket)return;historyData=null;
  $('historyCount').textContent='Geçmiş güvenli biçimde kapatıldı';clear($('historyCards'));
  $('historyCards').append(el('div','empty','Doğrulanmış geçmiş okunamadı. Yenile ile tekrar dene: '+error.message));
 }
}

for(const b of document.querySelectorAll('.tab'))b.addEventListener('click',()=>section(b.dataset.tab));
for(const b of document.querySelectorAll('.filter'))b.addEventListener('click',()=>{stage=b.dataset.stage;expanded=false;document.querySelectorAll('.filter').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});renderRadar();});
for(const b of document.querySelectorAll('.dir'))b.addEventListener('click',()=>{side=b.dataset.side;expanded=false;document.querySelectorAll('.dir').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});renderRadar();});
$('coinSearch').addEventListener('input',e=>{search=e.target.value.trim().toUpperCase();expanded=false;renderRadar();});
$('showAll').addEventListener('click',()=>{expanded=!expanded;renderRadar();});
for(const b of document.querySelectorAll('.frame'))b.addEventListener('click',()=>{chartFrame=b.dataset.tf;document.querySelectorAll('.frame').forEach(x=>x.classList.toggle('selected',x===b));loadPriceChart();});
$('chartLoad').addEventListener('click',()=>{selected=null;clear($('chartInfo'));$('chartInfo').append(el('strong','','Bağımsız grafik araştırması'),el('p','muted','Gerçek giriş sinyali değildir.'));loadPriceChart();});
$('chartSymbol').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('chartLoad').click();}});
$('quickOpen').addEventListener('click',()=>section('chart'));
for(const b of document.querySelectorAll('.back-radar'))b.addEventListener('click',()=>section('radar'));
window.addEventListener('resize',()=>{if(lastChart)renderCandles(lastChart);});
for(const b of document.querySelectorAll('.window'))b.addEventListener('click',()=>{days=Number(b.dataset.days);document.querySelectorAll('.window').forEach(x=>x.classList.toggle('selected',x===b));renderForward();});
for(const b of document.querySelectorAll('.hist-filter'))b.addEventListener('click',()=>{historyFilter=b.dataset.history;historyVisible=15;document.querySelectorAll('.hist-filter').forEach(x=>x.classList.toggle('selected',x===b));renderHistory();});
$('historyReload').addEventListener('click',()=>{historyData=null;historyVisible=15;loadHistory();});
$('historyMore').addEventListener('click',()=>{historyVisible+=15;renderHistory();});
$('reload').addEventListener('click',reload);
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
fetch('/api/overlay',{cache:'no-store'}).then(r=>r.json()).then(x=>{const box=$('overlayInfo');if(x.state==='STALE'){box.textContent='MAKİNE · ESKİ ARAŞTIRMA ('+num(x.evidence?.ageMinutes)+' dk) · Son güncelleme '+(x.evidence?.generatedAtUtc||'—')+' · Yeni sinyale uygulanmaz.';}else if(x.state==='READ_ONLY_RESEARCH'){box.textContent='MAKİNE · Salt-okunur araştırma · '+num(x.evidence?.ageMinutes)+' dk · Ana kasa ve stratejilere müdahale yok.';}else{box.textContent='MAKİNE erişilemedi ('+(x.error||'KAYNAK_YOK')+') · Ana veri etkilenmez.';}if(state&&x.evidence?.basedOnCoinliveScanId!==state.source.scanId){box.textContent+=' · Kaynak scan_id farklı; çapraz teyit olarak kullanılmaz.';}}).catch(()=>{$('overlayInfo').textContent='MAKİNE erişilemedi · Ana veri etkilenmez.';});
reload();
