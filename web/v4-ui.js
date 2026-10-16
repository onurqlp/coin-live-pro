'use strict';
/* COIN.LIVE PRO V4 — read-only view, never authors trade or lifecycle events. */
(()=>{
 const $=id=>document.getElementById(id);
 const safe=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const date=x=>{const t=Date.parse(x||'');return Number.isFinite(t)?new Date(t).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—'};
 const fmt=x=>typeof x==='number'&&Number.isFinite(x)?x.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
 const ago=x=>{const m=(Date.now()-Date.parse(x||''))/60000;return Number.isFinite(m)&&m>=0?Math.floor(m)+' dk':'—'};
 const names={TREND_BREAKOUT:'Trend / 4H kırılım',VOLUME_EXPANSION:'Hacim genişlemesi',
 BREAKOUT_RETEST:'Kırılım + retest',REVERSAL_SETUP:'Dönüş hazırlığı',
 VOLATILITY_SQUEEZE:'Yanardağ / sıkışma',OI_FUNDING_PRESSURE:'OI / fonlama baskısı',
 SHORT_BREAKDOWN:'SHORT / destek kırılımı'};
 const why={HTF_ALIGNED:'1D+4H yön uyumu',LOCAL_CLOSED_LEVEL:'Yerel kapanışla seviye aşıldı',
 LOCAL_LEVEL_WAIT:'Yerel kırılım bekleniyor',WAIT_4H_CLOSE:'Kapanmış 4H kırılımı bekleniyor',
 '4H_CLOSED_BREAKOUT':'4H kırılımı kapandı',4H_VOLUME_EXPANSION:'4H hacmi arttı',
 CLOSED_LOCAL_BREAK:'Kapanmış yerel kırılım',BREAKOUT_SEEN:'İlk kırılım görüldü',
 RETEST_SEQUENCE_UNVERIFIED:'Retest mum dizisi kanıtlanmadı',
 RSI_EXTREME:'RSI uç bölgede',MACD_HIST_TURN:'MACD histogramı dönüyor',
 COUNTERTREND_RESEARCH:'Ters yön henüz araştırma',BB_COMPRESSION:'Bollinger sıkışması',
 CLOSED_VOLUME_EXPANSION:'Kapanmış hacim genişlemesi',WATCH_VOLUME:'Hacim teyidi bekleniyor',
 TIMESTAMPED_OI_DELTA:'Zaman damgalı açık pozisyon değişimi',
 FUNDING_CROWDING:'Fonlama kalabalıklaşması',NOT_LIQUIDATION_PROOF:'Tasfiye kanıtı değil',
 BEARISH_DAILY_4H:'1D ve 4H aşağı yön',SUPPORT_CLOSED_BREAK:'Destek kapanışta kırıldı',
 SUPPORT_WATCH:'Destek kırılımı bekleniyor'};
 const store={radar:null,paper:null,shadow:null,lab:null,manifest:null,position:null,lastFetch:0,loading:false};
 window.CoinV4=store;
 function explanation(v){return (v?.reasons||[]).slice(0,3).map(s=>why[s]||s).join(' · ')||'Yeni kapanmış mum kanıtı bekleniyor';}
 function card(x){
   const st=x.lifecycle_stage,stage=st==='SPOTLIGHT'?'GÖZ ÖNÜNDE':st==='MOTION'?'HAREKET':'İZLE';
   const state=x.review_state==='FRESH'?'Yeniden değerlendirildi':'Yeniden kontrol bekliyor';
   const motion=x.confirmation_state==='CONFIRMED'?' · strateji teyidi var':' · giriş teyidi yok';
   return '<article class="v4Opportunity"><div class="v4CardTop"><b>'+safe(x.symbol)+
     ' <span class="chip '+(x.side==='LONG'?'long':'short')+'">'+safe(x.side)+'</span></b>'+
     '<span class="v4Small">'+safe(stage)+' · '+safe(state)+'</span></div>'+
     '<div class="v4Sub">'+safe(names[x.strategy_id]||x.strategy_id)+' · puan '+safe(x.score)+
     '/100 · yapı riski '+safe(x.risk_score)+'/100</div>'+
     '<div class="v4Reason">'+safe(explanation(x))+'</div>'+
     '<div class="v4Meta">İlk: '+safe(date(x.first_seen_at))+
     ' · Son gerçek kontrol: '+safe(date(x.last_evaluated_at))+safe(motion)+'</div>'+
     '<button type="button" class="v4GoChart" data-v4-symbol="'+safe(x.symbol)+
     '" data-v4-side="'+safe(x.side)+'">Grafiği incele ↗</button></article>';
 }
 function drawBoard(){
   const r=store.radar,manifest=store.manifest;
   if(!r)return;
   const minutes=(Date.now()-Date.parse(manifest.finished_at_utc))/60000;
   const stale=!Number.isFinite(minutes)||minutes>25;
   const status=$('v4Status');status.textContent=stale?'V4 KAYNAK GECİKMİŞ · GÜNCEL TEYİT YOK':
     'V4 · '+ago(r.updated_at)+' önce merkezi değerlendirme · otomatik emir YOK';
   status.className='v4Status '+(stale?'v4Stale':'');
   const groups=[
     ['v4Spotlight',stale?[]:r.spotlight,'Şu an yeni verilerle bu kaliteyi sağlayan fırsat yok.'],
     ['v4Motion',stale?[]:r.motion,'Yeni kapanmış mumlarla başlamış hareket kanıtı henüz yok.'],
     ['v4Watch',r.watch,'Henüz izlemeye alınabilecek yeni fırsat yok.']
   ];
   for(const [id,items,empty] of groups)$(id).innerHTML=items.length?items.map(card).join(''):
     '<div class="v4Empty">'+safe(stale?'Merkezi veri eski; yeni aşama/işlem uygunluğu gösterilmez.':empty)+'</div>';
   $('v4WatchCount').textContent=r.counts?.watch??'—';
   $('v4MotionCount').textContent=stale?'—':r.counts?.motion??'—';
   $('v4SpotCount').textContent=stale?'—':r.counts?.spotlight??'—';
   $('v4RecheckCount').textContent=r.counts?.recheck_pending??'—';
   $('v4ArchivedCount').textContent=r.counts?.archived_total??'—';
   document.querySelectorAll('[data-v4-symbol]').forEach(b=>b.onclick=()=>{
     if(typeof selectSpark==='function')selectSpark(b.dataset.v4Symbol,'4H',false);
   });
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
     if(typeof selectSpark==='function')selectSpark(x.symbol,'4H',false);
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
 function renderLab(){
   if(!store.lab)return;
   const p=store.lab.periods?.[Number($('v4LabWindow').value)||0];
   if(!p)return;
   $('v4LabBody').innerHTML=Object.entries(p.strategies||{}).map(([id,r])=>
     '<div class="v4LabRow"><b>'+safe(names[id]||id)+'</b><span>İZLE '+r.discovered+
     ' · HAREKET '+r.motion+' · GÖZ ÖNÜNDE '+r.spotlight+
     ' · ELENDİ '+(r.invalidated+r.expired_or_stale)+
     ' · başarı: örneklem yetersiz</span></div>').join('');
   $('v4LabFooter').textContent='Shadow: '+p.shadow.attempts+' deneme, '+p.shadow.resolved+
     ' sonuç · belirsiz '+p.shadow.ambiguous+' · boşluk '+p.shadow.data_gap+
     ' · kasa emri '+p.paper.created+' · fonlama bilinmiyor. Kazanma ihtimali değildir.';
 }
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
     const [r,p,sh,lab]=await Promise.all(['v4-radar','v4-paper','v4-shadow','v4-lab'].map(k=>readJson(k,m)));
     if([r,p,sh,lab].some(x=>x.scan_id!==m.scan_id))throw Error('V4 farklı tarama verileri karışmış');
     store.manifest=m;store.radar=r;store.paper=p;store.shadow=sh;store.lab=lab;
     store.lastFetch=Date.now();drawBoard();renderDesk();renderLab();
   }catch(error){
     $('v4Status').textContent='V4 veri kontrolü: '+error.message;
     $('v4PaperStatus').textContent='V4 sunucu verisi doğrulanamadı; yeni sanal sonuç yok';
   }finally{store.loading=false;}
 }
 $('v4LabWindow')?.addEventListener('change',renderLab);
 $('refresh')?.addEventListener('click',()=>setTimeout(load,1000));
 window.addEventListener('resize',()=>{if(store.paper)drawEquity(store.paper.equity_curve||[])});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
 load();setInterval(()=>{if(!document.hidden)load()},60000);
})();
