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
   banner('mtfStatus',stale?'redtag':'oktag',stale?'ANALİZ ESKİ':'DOĞRULANMIŞ · '+minutes+' DK');
   const regimes=['BTCUSDT','ETHUSDT'].map(sym=>{
     const x=d.regime?.[sym],daily=x?.frames?.['1D'],weekly=x?.frames?.['1W'],h12=x?.frames?.['12H'];
     return '<div class="regimeItem"><strong>'+sym.replace('USDT','')+'</strong>'+
       '<span>1W '+esc(weekly?.quality==='CLOSED_CONFIRMED'?labels[weekly.trend]:'NO_HISTORY')+'</span>'+
       '<span>1D '+esc(daily?.quality==='CLOSED_CONFIRMED'?labels[daily.trend]:'NO_HISTORY')+'</span>'+
       '<span>12H '+esc(h12?.quality==='CLOSED_CONFIRMED'?labels[h12.trend]:'NO_HISTORY')+'</span></div>';
   });
   $('macroRegime').innerHTML=regimes.join('');
   const list=d.candidates||[];
   $('mtfCandidates').innerHTML=list.length?list.map(x=>{
     const side=x.side==='LONG'?'positive':'negative';
     const summary=frames.map(tf=>{
        const v=x.frames?.[tf]||{};
        const value=v.quality==='CLOSED_CONFIRMED'?labels[v.trend]:'NO_HISTORY';
        return '<div class="frameCell"><small>'+tf+'</small><b class="'+(v.trend==='UP'?'positive':v.trend==='DOWN'?'negative':'')+'">'+esc(value)+'</b></div>';
     }).join('');
     return '<article class="v2card"><div class="v2row"><strong>'+esc(x.symbol.replace('USDT',''))+
      '<span class="chip '+(x.side==='LONG'?'long':'short')+'">'+esc(x.side)+'</span></strong>'+
      '<span class="v2score">'+esc(x.score)+'/100</span></div>'+
      '<div class="v2why">'+esc(typeNames[x.setup_type]||x.setup_type)+' · '+esc(x.expected_holding)+
      ' · '+esc(x.quality)+' · '+esc((x.reason_codes||[]).join(' / '))+'</div>'+
      '<div class="v2weights"><span>MAKRO <b>'+esc(x.macro_score??'—')+'</b></span>'+
      '<span>MOMENTUM <b>'+esc(x.momentum_score??'—')+'</b></span>'+
      '<span>GİRİŞ <b>'+esc(x.entry_quality_score??'—')+'</b></span></div>'+
      '<div class="tfGrid">'+summary+'</div>'+
      '<div class="v2disclaimer">'+(stale?'ESKİ — yeni işlem senaryosu kurulmaz. ':
      'Araştırma adayı; otomatik işlem sinyali değildir. ')+
      'Kaynak OKX kapanmış UTC mumları · '+esc(trTime(x.observed_at_utc))+'</div></article>';
   }).join(''):'<div class="empty">7 zaman dilimli doğrulanmış aday henüz yok.</div>';
 }
 function renderPaper(d){
   const mins=age(d.updated_at),stale=mins>25;
   const orders=d.recent_orders||[];
   const since=trTime(d.pilot_started_at);
   banner('paperStatus',stale?'redtag':'oktag',stale?'PORTFÖY VERİSİ ESKİ':'PİLOT AKTİF · GERÇEK EMİR YOK');
   $('paperKpis').innerHTML=[
       ['Pilot başlangıcı',since],
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
       '<td>'+esc(o.status)+'</td><td>'+fmt(o.fill_price??o.signal_price)+' / '+fmt(o.stop)+' / '+fmt(o.tp1)+'</td>'+
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
