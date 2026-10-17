const $=id=>document.getElementById(id);
let state=null, stage='ALL', days=7, selected=null, chartFrame='1H', lastChart=null, chartTicket=0;
const num=x=>typeof x==='number'&&Number.isFinite(x)?x.toLocaleString('tr-TR',{maximumFractionDigits:3}):'Bilinmiyor';
const el=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=String(txt);return x;};
const clear=x=>x.replaceChildren();
function section(name){document.querySelectorAll('.pane').forEach(p=>p.hidden=p.id!==name);document.querySelectorAll('.tab').forEach(b=>{b.classList.toggle('active',b.dataset.tab===name);if(b.dataset.tab===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});if(name==='chart'&&state)loadPriceChart();}
function metric(title,value){const v=el('div','stat');v.append(el('small','muted',title),el('strong','',value));return v;}
function candidateCard(x){const v=el('button','card clickable'),top=el('div','cardtop');v.type='button';top.append(el('strong','',x.symbol||'—'),el('span',x.side==='LONG'?'long':x.side==='SHORT'?'short':'',x.side||'—'));v.append(top,el('small','muted',`${x.stage} · ${x.strategy||'Araştırma'}`),el('div','score',`Puan ${num(x.score)} / Risk ${num(x.riskScore)}`),el('div','meta',`${x.confirmation||'Teyitsiz'} · ${x.reviewState}`),el('small','muted',x.observedAtUtc||'Tarih bilinmiyor'));
 v.addEventListener('click',()=>{selected=x;$('chartInfo').replaceChildren(el('strong','',`${x.symbol} · ${x.side} · ${x.stage}`),el('p','',`Kaynak: ${x.strategy||'—'} · teyit: ${x.confirmation||'—'}`),el('p','',`Gözlem: ${x.observedAtUtc||'—'} · fiyat: ${num(x.price)} · stop: ${num(x.stop)} · hedef: ${(x.targets||[]).map(num).join(' / ')||'doğrulanmadı'}`),el('p','muted',(x.reasons||[]).join(', ')||'Gerekçe kaynakta mevcut değil'));$('chartSymbol').value=x.symbol;section('chart');});return v;}
function renderRadar(){const v=$('cards');clear(v);const e=$('early');clear(e);
 if(!state||state.source.status!=='VERIFIED'){v.append(el('div','empty','Güncel doğrulanmış veri yok: hiçbir aktif sinyal gösterilmiyor.'));$('count').textContent='0 güncel aday';return;}
 const a=(state.radar.candidates||[]).filter(x=>stage==='ALL'||x.stage===stage);$('count').textContent=`${a.length} güncel araştırma kaydı · ${state.radar.pendingCount} yeniden kontrol bekliyor`;
 if(!a.length)v.append(el('div','empty','Bu aşamada güncel kanıtlı aday yok. RECHECK_PENDING saklandı.'));
 for(const x of a)v.append(candidateCard(x));for(const x of state.radar.early||[]){const c=el('button','card clickable');c.type='button';c.append(el('strong','',`${x.symbol} · ${x.side}`),el('div','meta',`${x.tier} / ${num(x.rank)} puan`),el('small','muted','Giriş emri değildir'));c.addEventListener('click',()=>{selected={...x,stage:x.tier,confirmation:'RESEARCH_ONLY',strategy:'EARLY_RESEARCH'};$('chartSymbol').value=x.symbol;section('chart');});e.append(c);}
}
// The chart endpoint independently validates the exact immutable Git blob and
// V4 history SHA-256. The browser never substitutes a live unclosed bar.
function renderCandles(data){
 const canvas=$('marketChart'), box=canvas.getBoundingClientRect();
 const w=Math.max(250,Math.round(box.width||340)),h=Math.round(box.height||280),dpr=Math.min(window.devicePixelRatio||1,2);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 const ctx=canvas.getContext('2d');if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const candles=data.candles||[];if(!candles.length)return;
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
 for(const [price,col,title]of [[scenario?.stop,'#f19ba4','STOP'],...(scenario?.targets||[]).slice(0,3).map((p,i)=>[p,'#57dfc5','TP'+(i+1)])]){
  if(typeof price!=='number'||price<=min||price>=max)continue;const py=y(price);ctx.setLineDash([4,4]);ctx.strokeStyle=col;ctx.beginPath();ctx.moveTo(L,py);ctx.lineTo(w-R,py);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=col;ctx.fillText(title,L+4,py-3);
 }
 const first=candles[0].t,last=candles.at(-1).t,span=(data.timeframe==='1H'?3600000:data.timeframe==='4H'?14400000:86400000);
 (data.markers||[]).forEach(m=>{const at=Date.parse(m.atUtc);if(!Number.isFinite(at)||at<first||at>=last+span)return;const ix=Math.min(candles.length-1,Math.floor((at-first)/span));const c=candles[ix];const xx=L+dx*(ix+.5);ctx.fillStyle='#9fa9ff';ctx.beginPath();ctx.arc(xx,Math.max(10,y(c.high)-8),3.2,0,2*Math.PI);ctx.fill();});
 ctx.fillStyle='#abc5d2';ctx.textAlign='left';ctx.fillText(new Date(first).toISOString().slice(5,16).replace('T',' '),L,h-6);ctx.textAlign='right';ctx.fillText(new Date(last).toISOString().slice(5,16).replace('T',' '),w-R,h-6);
}
async function loadPriceChart(){
 if(!state)return;
 const symbol=$('chartSymbol').value.trim().toUpperCase();$('chartSymbol').value=symbol;
 if(!/^[A-Z0-9]{2,18}USDT$/.test(symbol)){$('chartStatus').textContent='USDT sözleşme sembolünü kontrol edin.';return;}
 if(state.source.status!=='VERIFIED'){$('chartStatus').textContent='Kaynak eski veya doğrulanamadı; grafik kapatıldı.';lastChart=null;const c=$('marketChart').getContext('2d');c?.clearRect(0,0,$('marketChart').width,$('marketChart').height);return;}
 const mine=++chartTicket;$('chartStatus').textContent=`${symbol} ${chartFrame} · Git kaynak hash doğrulanıyor…`;
 try{
  const url=`/api/chart?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(chartFrame)}&commit=${encodeURIComponent(state.source.commit)}`;
  const response=await fetch(url,{cache:'no-store'});const x=await response.json();if(mine!==chartTicket)return;
  if(!response.ok||x.candleState!=='CLOSED_ONLY'||x.commit!==state.source.commit)throw new Error(x.error||'CHART_UNVERIFIED');
  lastChart=x;renderCandles(x);
  $('chartStatus').textContent=`OKX kapanmış mum · ${x.candles.length} bar · ${x.excludedUnclosedCount} açık mum dışlandı · Git blob doğrulandı · ${x.markers.length} arşiv olayı`;
 }catch(error){if(mine!==chartTicket)return;lastChart=null;const c=$('marketChart').getContext('2d');c?.clearRect(0,0,$('marketChart').width,$('marketChart').height);$('chartStatus').textContent=`Grafik güvenli biçimde kapatıldı: ${error.message}`;}
}
function renderPaper(){const x=$('paperCards'),e=$('experiment');clear(x);clear(e);if(!state){x.append(el('p','empty','Kaynak bulunamadı'));return;}
 const p=state.paper,t=state.experimental;x.append(metric('Ana başlangıç',num(p.startingBalanceUsdt)+' USDT'),metric('Ana özkaynak',num(p.equityUsdt)+' USDT'),metric('Ana gerçekleşen',num(p.realizedUsdt)+' USDT'),metric('Ana açık işlem',num(p.openCount)));
 e.append(metric('Deneysel sanal özkaynak',num(t.estimatedEquityUsdt)+' USDT'),metric('Deney muhasebe net',num(t.accountingRealizedUsdt)+' USDT'),metric('Kapanan deney bileti',num(t.reviewAll?.closed)),metric('Kohort toplamı (ayrı metrik)',num(t.reviewAll?.realized_total_usdt)+' USDT'),el('p','muted',`${t.note} · Funding: ${t.fundingState}`));
}
function renderForward(){const v=$('forwardInfo');clear(v);if(!state){v.append(el('div','empty','Veri yok'));return;}const p=state.forward.periods.find(x=>x.days===days);if(!p){v.append(el('div','empty','Bu pencereye ait veri yok'));return;}
 v.append(el('p','muted',`Örneklem: ${p.quality}. Gözetim: ${num(state.forward.observations)} olay.`));
 for(const[id,x]of Object.entries(p.strategies)){const line=el('div','keyvalue');line.append(el('strong','',id),el('span','muted',` Keşif ${num(x.discovered)} · giriş uygun ${num(x.entryEligible)} · 1H n=${num(x.horizons?.['1H']?.observed)} · 4H n=${num(x.horizons?.['4H']?.observed)} · 24H n=${num(x.horizons?.['24H']?.observed)} · 3D n=${num(x.horizons?.['3D']?.observed)} · 7D n=${num(x.horizons?.['7D']?.observed)}`));v.append(line);}
}
function renderSystem(){const v=$('systemInfo');clear(v);if(!state){v.append(el('p','', 'Kaynak doğrulanamadı'));return;}const s=state.source;
 for(const [k,w]of [['App sürümü',state.appVersion],['Mevcut ürün sürümü',state.sourceProductVersion],['Commit',s.commit],['Scan ID',s.scanId],['Gözlem UTC',s.observedAtUtc],['Veri yaşı (dk)',num(s.ageMinutes)],['Tetikleyici',s.trigger],['Kaynak',s.provider],['Kaynak sağlığı',s.healthStatus],['Başarılı piyasa taraması',num(s.testedPairs)+' / '+num(s.attemptedPairs)],['Gözlenen schedule sayısı',num(s.scheduledRunsObserved)],['Manifest + SHA-256',s.manifestVerified&&s.payloadShaVerified?'DOĞRULANDI':'HATA'],['3.0 sağlık scan ID (ayrı alan)',s.healthLegacyScanId||'—'],['scan_id olmayan kaynak',s.unscopedSources.join(', ')||'Yok'],['Gerçek emir','YOK']])v.append(el('div','keyvalue',`${k}: ${w}`));
}
function render(){if(!state)return;const s=state.source;$('health').textContent=s.status==='VERIFIED'?'✓ Doğrulanmış':'⚠ ESKİ';$('health').className='chip '+(s.status==='VERIFIED'?'good':'warn');$('time').textContent=`${s.observedAtUtc} · ${num(s.ageMinutes)} dk`;$('source').textContent=`${s.provider} · ${s.trigger}`;renderRadar();renderPaper();renderForward();renderSystem();}
async function reload(){const b=$('reload');b.disabled=true;$('health').textContent='Kontrol ediliyor';try{const response=await fetch('/api/snapshot',{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error((data.error||response.status)+': '+(data.detail||'Doğrulanamadı'));state=data;render();}catch(error){state=null;$('health').textContent='⚠ Veri doğrulanamadı';$('health').className='chip warn';$('time').textContent=error.message;$('source').textContent='Yeni sinyal yok';renderRadar();for(const id of ['paperCards','experiment','forwardInfo','systemInfo'])clear($(id));}finally{b.disabled=false;}}
for(const b of document.querySelectorAll('.tab'))b.addEventListener('click',()=>section(b.dataset.tab));
for(const b of document.querySelectorAll('.filter'))b.addEventListener('click',()=>{stage=b.dataset.stage;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('selected',x===b));renderRadar();});
for(const b of document.querySelectorAll('.frame'))b.addEventListener('click',()=>{chartFrame=b.dataset.tf;document.querySelectorAll('.frame').forEach(x=>x.classList.toggle('selected',x===b));loadPriceChart();});
$('chartLoad').addEventListener('click',()=>{selected=null;$('chartInfo').textContent='Bağımsız grafik araştırması · işlem giriş sinyali değildir.';loadPriceChart();});
$('chartSymbol').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('chartLoad').click();}});
window.addEventListener('resize',()=>{if(lastChart&&!$('chart').hidden)renderCandles(lastChart);});
for(const b of document.querySelectorAll('.window'))b.addEventListener('click',()=>{days=Number(b.dataset.days);document.querySelectorAll('.window').forEach(x=>x.classList.toggle('selected',x===b));renderForward();});
$('reload').addEventListener('click',reload);if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
fetch('/api/overlay',{cache:'no-store'}).then(r=>r.json()).then(x=>{$('overlayInfo').textContent=x.state==='NOT_CONNECTED'?'Henüz bağlı değil · Ana veri ve kasa etkilenmez.':'Bağlantı durumu: '+x.state;}).catch(()=>{$('overlayInfo').textContent='MAKİNE erişilemedi · Ana veri etkilenmez.';});reload();
