'use strict';
/* COIN.LIVE PRO 2.0 — all content below is read from the central server.
 * No localStorage/browser-produced alerts can enter this performance report.
 */
(()=>{
 const $=id=>document.getElementById(id);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=x=>!Number.isFinite(Number(x))?'—':Number(x).toLocaleString('tr-TR',{maximumFractionDigits:3});
 const trTime=x=>{try{return new Date(x).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}catch(e){return '—';}};
 const age=x=>{const t=Date.parse(x||'');return Number.isFinite(t)?Math.max(0,Math.floor((Date.now()-t)/60000)):Infinity;};
 const choose=(x,a,b)=>x==null?a:b(x);
 const frames=['1W','1D','12H','4H','1H','15m','5m'];
 const labels={UP:'YÜKSELİŞ',DOWN:'DÜŞÜŞ',SIDEWAYS:'YATAY',UNKNOWN:'VERİ YOK'};
 const typeNames={SWING_7D:'7G SWING',TREND_CONTINUATION:'TREND DEVAMI',BREAKOUT_EARLY:'ERKEN KIRILIM',REVERSAL_CANDIDATE:'TERS YÖN ADAYI',INTRADAY:'GÜN İÇİ'};
 function banner(id,kind,caption){const el=$(id);if(el){el.textContent=caption;el.className='tag '+kind;}}
 const item=(label,value)=>'<div class="pilotKpi"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>';
 async function read(name){
   const c=new AbortController(),timer=setTimeout(()=>c.abort(),12500);
   try{const r=await fetch('./data/'+name+'.json?t='+Date.now(),{cache:'no-store',signal:c.signal});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
   finally{clearTimeout(timer);}
 }
 function renderMtf(d){
   const minutes=age(d.fetched_at),stale=minutes>25;
   banner('mtfStatus',stale?'redtag':'oktag',stale?'ANALİZ ESKİ · İŞLEM YOK':'4H + GÜNLÜK SWING · '+minutes+' DK');
   const regimes=['BTCUSDT','ETHUSDT'].map(sym=>{
     const x=d.regime?.[sym],daily=x?.frames?.['1D'],weekly=x?.frames?.['1W'],h4=x?.frames?.['4H'];
     return '<div class="regimeItem"><strong>'+sym.replace('USDT','')+'</strong>'+
       '<span>1W '+esc(weekly?.quality==='CLOSED_CONFIRMED'?labels[weekly.trend]:'NO_HISTORY')+'</span>'+
       '<span>1D '+esc(daily?.quality==='CLOSED_CONFIRMED'?labels[daily.trend]:'NO_HISTORY')+'</span>'+
       '<span>4H '+esc(h4?.quality==='CLOSED_CONFIRMED'?labels[h4.trend]:'NO_HISTORY')+'</span></div>';
   });
   $('macroRegime').innerHTML=regimes.join('');
   const statuses={SWING_CANDIDATE:'1–7 GÜN ADAYI',SWING_WATCH:'RİSKLİ ADAY · İZLE',
     WAIT_4H_1D:'4H/GÜNLÜK UYUMSUZ · BEKLE',AVOID_RISK:'SIRADIŞI RİSK · KAÇIN',
     NO_HISTORY:'YETERSİZ KAPANMIŞ MUM'};
   const critical=code=>({
     '4H_REPEATED_LONG_WICKS':'4H uzun fitil tekrarı',
     '1D_REPEATED_LONG_WICKS':'Günlük uzun fitil tekrarı',
     '4H_UNUSUAL_CLOSED_BAR_VOLUME':'4H hacim sıçraması',
     '1D_UNUSUAL_CLOSED_BAR_VOLUME':'Günlük hacim sıçraması',
     '4H_HIGH_TRUE_RANGE':'4H yüksek oynaklık',
     '1D_HIGH_TRUE_RANGE':'Günlük yüksek oynaklık',
     'EXTREME_24H_PRICE_MOVE':'24s olağandışı fiyat hareketi',
     'EXTREME_FUNDING_RATE':'Aşırı fonlama oranı',
     'ELEVATED_FUNDING_RATE':'Yüksek fonlama oranı',
     'LOW_QUOTE_TURNOVER':'Düşük likidite',
     'WIDE_SPREAD_35BPS':'Çok geniş alış/satış farkı',
     'OI_CHANGE_NOT_VERIFIED':'OI değişimi doğrulanmadı',
     'OI_SNAPSHOT_ONLY_NO_DELTA':'Yalnız anlık OI var; değişim yok',
     'FUNDING_NOT_VERIFIED':'Fonlama verisi yok'
   }[code]||code);
   const list=d.candidates||[];
   $('mtfCandidates').innerHTML=list.length?list.map(x=>{
     const summary=frames.map(tf=>{
       const v=x.frames?.[tf]||{};
       const value=v.quality==='CLOSED_CONFIRMED'?labels[v.trend]:'NO_HISTORY';
       return '<div class="frameCell '+(tf==='1D'||tf==='4H'?'primaryTf':'')+'"><small>'+tf+(tf==='1D'||tf==='4H'?' ★':'')+'</small><b class="'+(v.trend==='UP'?'positive':v.trend==='DOWN'?'negative':'')+'">'+esc(value)+'</b></div>';
     }).join('');
     const status=x.swing_status||'HENÜZ YENİ MODEL YOK';
     const accepted=status==='SWING_CANDIDATE'&&!stale;
     const risk=Number(x.structure_risk_score);
     const funding=Number(x.funding_rate);
     const oi=Number(x.open_interest_usd);
     const details=(x.structure_flags||[]).filter(code=>!['OI_CHANGE_NOT_VERIFIED','OI_SNAPSHOT_ONLY_NO_DELTA','FUNDING_NOT_VERIFIED'].includes(code)).slice(0,5);
     const fundingText=x.funding_rate==null?'Fonlama: doğrulanmadı':'Fonlama: '+(funding*100).toFixed(3)+'% / OKX bildirdiği periyot';
     const oiText=x.open_interest_usd==null?'Açık pozisyon: doğrulanmadı':'Açık pozisyon: $'+Number(oi).toLocaleString('tr-TR',{maximumFractionDigits:0})+' (yalnız anlık)';
     const stage='<div class="swingStatus '+(accepted?'ready':status==='AVOID_RISK'?'blocked':'waiting')+'">'+
       '<strong>'+esc(statuses[status]||status)+'</strong><span>'+esc(x.expected_holding||'Belirsiz')+
       ' · 1D + 4H '+(x.direction_aligned_4h_1d?'uyumlu':'uyumsuz / doğrulanmadı')+'</span></div>';
     const flags='<div class="riskDetails"><strong>Yapısal risk: '+esc(x.structure_risk_label||'—')+
       ' · '+(Number.isFinite(risk)?risk:'—')+'/100</strong><div>'+esc(details.length?details.map(critical).join(' · '):
       'Belirgin anormal yapı işareti bulunmadı; bu güvenlik garantisi değildir.')+'</div>'+
       '<small>'+esc(fundingText)+' · '+esc(oiText)+
       ' · Açık pozisyon DEĞİŞİMİ bilinmiyorsa tahmin edilmez.</small></div>';
     return '<article class="v2card"><div class="v2row"><strong>'+esc(x.symbol.replace('USDT',''))+
       '<span class="chip '+(x.side==='LONG'?'long':'short')+'">'+esc(x.side)+'</span></strong>'+
       '<span class="v2score">'+esc(x.score)+'/100</span></div>'+
       stage+flags+
       '<div class="v2weights"><span>GÜNLÜK / HAFTALIK <b>'+esc(x.macro_score??'—')+'</b></span>'+
       '<span>4H + 1H <b>'+esc(x.momentum_score??'—')+'</b></span>'+
       '<span>GİRİŞ 15M / 5M <b>'+esc(x.entry_quality_score??'—')+'</b></span></div>'+
       '<div class="tfGrid">'+summary+'</div>'+
       '<div class="v2why">'+esc(typeNames[x.setup_type]||x.setup_type)+' · Spread '+
       esc(x.spread_bps==null?'bilinmiyor':Number(x.spread_bps).toFixed(2)+' bps')+
       ' · '+esc((x.reason_codes||[]).filter(x=>!['CLOSED_UTC_CANDLES','1D_4H_PRIMARY_74PCT'].includes(x)).slice(0,7).join(' / '))+'</div>'+
       '<div class="v2disclaimer">'+(stale?'VERİ ESKİ — yeni işlem senaryosu kurulmaz. ':
         'İZLE/BEKLE araştırma statüsüdür, al/sat emri değildir. ')+
       '1D/4H toplam ağırlık %74; 15m yalnız tetik · OKX kapanmış UTC mumları · '+
       esc(trTime(x.observed_at_utc))+'</div></article>';
   }).join(''):'<div class="empty">1D ve 4H uyumlu doğrulanmış swing adayı henüz yok.</div>';
 }
 function renderPaper(d){
   const mins=age(d.updated_at),stale=mins>25;
   const orders=d.recent_orders||[];
   const since=trTime(d.pilot_started_at);
   banner('paperStatus',stale?'redtag':'oktag',stale?'PORTFÖY VERİSİ ESKİ':'PİLOT AKTİF · GERÇEK EMİR YOK');
   $('paperKpis').innerHTML=[
       ['Pilot başlangıcı',since],
       ['4H/1D swing geçişi',d.swing_cutover_at?trTime(d.swing_cutover_at):'Ölçülüyor'],
       ['Yeni sanal giriş şartı','1D + 4H uyumlu · anormal risk filtresi'],
       ['Eski 15m modelinden korunan',String(d.legacy_micro_positions_preserved??0)+' kayıt'],
       ['Sanal başlangıç','100 USDT'],
       ['Tahmini bakiye',fmt(d.estimated_equity_usdt)+' USDT'],
       ['Açık sanal işlem',String(d.open_paper_positions??0)+'/2'],
       ['Sonuçlanan',String(d.closed_paper_orders??0)],
       ['Belirsiz / no fill',String((d.ambiguous||0)+(d.no_fill||0))],
       ['Tahmini Max DD',fmt(d.max_drawdown_pct_est)+'%'],
       ['Model',esc(d.model_version)]
   ].map(([a,b])=>item(a,b)).join('');
   $('paperRows').innerHTML=orders.length?orders.slice(0,25).map(o=>{
     const details=o.status==='FILLED'||['TP1','STOP','TIME_EXIT'].includes(o.status)?
      fmt(o.margin_10x)+' / '+fmt(o.margin_15x)+' USDT':'—';
     const pnl=o.pnl_usdt==null?'—':(o.pnl_usdt>=0?'+':'')+fmt(o.pnl_usdt)+' USDT*';
     return '<tr><td>'+esc(trTime(o.signal_at))+'</td><td><b>'+esc(o.symbol)+'</b></td>'+
       '<td><span class="chip '+(o.side==='LONG'?'long':'short')+'">'+esc(o.side)+'</span></td>'+
       '<td>'+esc(o.status)+'<small class="strategyTag">'+(o.source==='CENTRAL_FORWARD_4H_1D_SWING'?'4H+1D SWING':'ESKİ 15M PİLOT')+'</small></td><td>'+fmt(o.fill_price??o.signal_price)+' / '+fmt(o.stop)+' / '+fmt(o.tp1)+'</td>'+
       '<td>'+details+'</td><td class="'+(o.pnl_usdt>=0?'positive':'negative')+'">'+pnl+'</td></tr>';
   }).join(''):'<tr><td colspan="7">Pilot '+esc(since)+' tarihinde başladı. Eski kıvılcımlar sanal işlem olarak GERİYE DÖNÜK eklenmez. İlk yeni teyit bekleniyor.</td></tr>';
 }
 function renderHealth(d){
    const minutes=age(d.updated_at);
    const proven=d.schedule_proven===true;
    banner('systemStatus',!proven||minutes>25?'redtag':'oktag',
      minutes>25?'VERİ ESKİ':!proven?'ZAMANLAYICI HENÜZ KANITLANMADI':'CRON KANITLANDI');
    $('systemKpis').innerHTML=[
      ['Son doğrulama',trTime(d.updated_at)],
      ['Taranan / doğru 3TF',String(d.attempted)+' / '+String(d.successful_3tf)],
      ['7TF başarılı',String(d.mtf_verified)+' / '+String(d.mtf_attempted)],
      ['Schedule ile çalışma',String(d.observed_real_scheduled_runs??0)],
      ['Son tetikleyici',String(d.last_trigger||'—')],
      ['Atlanan zaman aralığı',d.missed_slots_latest==null?'Ölçülüyor':String(d.missed_slots_latest)],
      ['Veri yaşı',minutes===Infinity?'—':minutes+' dk'],
      ['Pilot durumu',String(d.status)]
    ].map(([a,b])=>item(a,b)).join('');
    $('systemDetail').innerHTML='<div class="line"><span>İş zamanları (UTC)</span><b>'+
      esc((d.cron_utc_minutes||[]).map(n=>String(n).padStart(2,'0')).join(', '))+'</b></div>'+
      '<div class="line"><span>Zamanlama kanıtı</span><b>'+esc(proven?'En az 2 gerçek schedule çalışması var':
      'Başarılı push çalışmaları 24/7 cron kanıtı DEĞİLDİR')+'</b></div>'+
      '<div class="line"><span>Kesintide davranış</span><b>25 dk eski analizde yeni sanal giriş kapalı</b></div>'+
      '<div class="line"><span>Pilot sınırı</span><b>Gerçek emir, Telegram/WhatsApp/e-posta alarmı KAPALI</b></div>';
 }
 let running=false;
 async function refresh(){
   if(running)return;running=true;
   try{
      const names=['mtf','paper','health'];
      const values=await Promise.allSettled(names.map(read));
      for(let i=0;i<names.length;i++){
         const e=values[i];
         if(e.status!=='fulfilled'){
           const element=$(i===0?'mtfCandidates':i===1?'paperRows':'systemDetail');
           if(element)element.innerHTML='<div class="empty">Merkezi '+names[i]+' kaynağı okunamadı. Sonuç üretilmiyor.</div>';
         }else{
           if(i===0)renderMtf(e.value);
           else if(i===1)renderPaper(e.value);
           else renderHealth(e.value);
         }
      }
   }finally{running=false;}
 }
 setTimeout(refresh,600);
 setInterval(refresh,60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 const manual=$('refresh');if(manual)manual.addEventListener('click',()=>{refresh();});
})();
