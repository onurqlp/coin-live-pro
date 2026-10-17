'use strict';
/* Read-only graphical scenarios based on VERIFIED server-bound candle evidence.
   No signals, trades, recommendations, future profits or calibrated probabilities.
   Projections are hypothetical 1H ATR distance steps, never a target prediction.
*/
(function(global){
 const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
 const number=v=>v===null||v===undefined||v===''||typeof v==='boolean'?null:
    Number.isFinite(+v)?+v:null;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const format=v=>{
   if(!finite(v))return '—';
   const decimals=v<.00001?12:v<.001?9:v<.1?7:v<10?5: v<1000?3:2;
   return v.toLocaleString('en-US',{maximumFractionDigits:decimals});
 };
 const time=s=>{const t=Date.parse(s||'');return Number.isFinite(t)?new Date(t).toLocaleString('tr-TR',{timeZone:'UTC',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+' UTC':'—'};
 const aligned=(trend,side)=>(side==='LONG'&&trend==='UP')||(side==='SHORT'&&trend==='DOWN');
 const closed=f=>Boolean(f&&f.quality==='CLOSED_CONFIRMED'&&Date.parse(f.last_candle_utc||'')>0);
 function build({symbol,side,model,legacy,nowMs=Date.now()}={}){
   if(!/^[A-Z0-9]{2,32}USDT$/.test(symbol||''))return null;
   const radar=model?.radar||{};
   const all=[...(radar.spotlight||[]),...(radar.motion||[]),...(radar.watch||[])];
   const early=model?.early?.candidates||[];
   const v4=all.find(x=>x.symbol===symbol&&x.side===side)||
     all.find(x=>x.symbol===symbol);
   const e=early.find(x=>x.symbol===symbol&&x.side===side)||
     early.find(x=>x.symbol===symbol);
   const m=(model?.mtf?.candidates||[]).find(x=>x.symbol===symbol&&x.side===side)||
     (model?.mtf?.candidates||[]).find(x=>x.symbol===symbol);
   const l=(legacy||[]).find(x=>x.symbol===symbol&&x.side===side)||
     (legacy||[]).find(x=>x.symbol===symbol);
   const pickedSide=side==='LONG'||side==='SHORT'?side:
     v4?.side||e?.side||m?.side||l?.side||null;
   const snap=Date.parse(model?.manifest?.finished_at_utc||'');
   const age=Number.isFinite(snap)?(nowMs-snap)/60000:null;
   const fresh=age!==null&&age>=-2&&age<=25;
   // Never mix a candidate whose source direction is opposite the selected side.
   const vc=v4?.side===pickedSide?v4:null;
   const ec=e?.side===pickedSide?e:null;
   const mc=m?.side===pickedSide?m:null;
   const lc=l?.side===pickedSide?l:null;
   const f=mc?.frames||{};
   const hour=closed(f['1H'])?f['1H']:null;
   const h4=closed(f['4H'])?f['4H']:null;
   const day=closed(f['1D'])?f['1D']:null;
   const week=closed(f['1W'])?f['1W']:null;
   const rawHour=number(hour?.[pickedSide==='LONG'?'breakout_high_prev8':'breakout_low_prev8']);
   const raw4h=number(h4?.[pickedSide==='LONG'?'breakout_high_prev8':'breakout_low_prev8']);
   const rawDay=number(day?.[pickedSide==='LONG'?'breakout_high_prev8':'breakout_low_prev8']);
   const hourLevel=finite(rawHour)?rawHour:
     (ec&&finite(number(ec.hourly_level))?ec.hourly_level:null);
   const p=finite(number(vc?.price))?vc.price:
     finite(number(ec?.price_at_scan))?ec.price_at_scan:
     finite(number(mc?.price_reference))?mc.price_reference:null;
   let levels=[];
   function add(label,value,kind,provenance){
     if(finite(value)&&!levels.some(x=>x.label===label))levels.push({label,value,kind,provenance});
   }
   if(finite(hourLevel))add('1H EŞİK',hourLevel,'threshold','Son doğrulanmış 1H seviyesinin önceki 8 mum kırılımı');
   if(finite(raw4h))add('4H EŞİK',raw4h,'threshold','Son doğrulanmış 4H mumun önceki 8 mum kırılımı');
   if(finite(rawDay))add('1D EŞİK',rawDay,'threshold','Son doğrulanmış günlük mumun önceki 8 mum kırılımı');
   const explicitStop=number(vc?.stop),explicitTargets=vc?.targets||[];
   const trueV4=Boolean(vc&&finite(number(vc.price))&&finite(explicitStop)&&explicitTargets.length>=3&&
      explicitTargets.slice(0,3).every(finite)&&
      (pickedSide==='LONG'?explicitStop<vc.price:explicitStop>vc.price)&&
      explicitTargets.slice(0,3).every(z=>pickedSide==='LONG'?z>vc.price:z<vc.price));
   let mode='NO_LEVEL',entry=null,stop=null,targets=[],riskDistance=null;
   const atr=number(hour?.atr_pct);
   if(trueV4){
      mode='SOURCE_RESEARCH_LEVELS';
      entry=vc.price;stop=explicitStop;targets=explicitTargets.slice(0,3);
      add('V4 GİRİŞ',entry,'entry','V4 yayınlanmış araştırma referansı (gerçekleşmiş emir değil)');
      add('V4 STOP',stop,'stop','V4 yayınlanmış seviye');
      targets.forEach((v,i)=>add('TP'+(i+1),v,'target','V4 yayınlanmış araştırma hedefi'));
   }else if(pickedSide&&(finite(hourLevel)||finite(raw4h))&&finite(atr)&&atr>0&&atr<35){
      // ATR is a verified, *historical 1H candle percentage*. No arbitrary RR/TP
      // values can be represented as market predictions.
      entry=finite(hourLevel)?hourLevel:raw4h;
      const sign=pickedSide==='LONG'?1:-1;
      riskDistance=entry*atr/100;
      if(riskDistance>0){
       mode='ATR_RESEARCH_PROJECTION';
       stop=entry-sign*riskDistance;
       targets=[1,2,3].map(n=>entry+sign*riskDistance*n);
       if(finite(stop)&&targets.every(finite)){
        add('KOŞULLU GİRİŞ',entry,'entry','Kapanmış mum eşik seviyesi, teyit değil');
        add('SENARYO STOP',stop,'stop','1H ATR kadar varsayımsal ters hareket');
        targets.forEach((v,i)=>add('TP'+(i+1),v,'target',(i+1)+' × 1H ATR uzaklığı; koşullu matematiksel seviye'));
       }else{
        mode='NO_LEVEL';stop=null;targets=[];entry=null;
       }
      }
   }
   const desc=[h4,day,week].filter(Boolean);
   const supports=desc.filter(x=>aligned(x.trend,pickedSide)).length;
   const opposes=desc.filter(x=>aligned(x.trend,pickedSide==='LONG'?'SHORT':'LONG')).length;
   const stage=vc?.lifecycle_stage||ec?.research_tier||lc?.stage||'SERBEST İNCELEME';
   const reasons=vc?.reasons||ec?.reasons||mc?.reason_codes||[];
   const weak=ec?.reasons?.includes('WEAK_RELATIVE_VOLUME')||
     (number(h4?.volume_ratio_20)!==null&&number(h4?.volume_ratio_20)<.8);
   let outlook;
   if(!pickedSide)outlook='Bu coin için aynı turda doğrulanmış LONG/SHORT yön hipotezi bulunamadı.';
   else outlook=(pickedSide==='LONG'?'Modelin izlediği yön: yükseliş. ':'Modelin izlediği yön: düşüş. ')+
     (h4&&day?(aligned(h4.trend,pickedSide)&&aligned(day.trend,pickedSide)?
       '4H ve günlük yön birlikte destekliyor. ':
       '4H ve günlük yön arasında eksik/ters teyit var. '):
       '4H/günlük kaynak teyidi eksik. ')+
     (week?(aligned(week.trend,pickedSide)?'Haftalık yön uyumlu. ':
       'Haftalık yön desteklemiyor veya yatay. '):'Haftalık kanıt yok. ')+
     (weak?'Hacim desteği zayıf. ':'')+
     (mode==='ATR_RESEARCH_PROJECTION'?'TP1/2/3 yalnız koşullu ATR mesafeleridir. ': '');
   const next=(pickedSide&&finite(hourLevel)?
     'Yeni bir kapanmış 1H mumunun '+format(hourLevel)+' USDT '+(pickedSide==='LONG'?'üzerinde':'altında')+
       ' teyit vermesi izlenir; tek başına işlem tetiklemez.':
     'Şimdilik doğrulanmış 1H kırılım eşiği yok; yeni kapanmış mum beklenir.');
   if(!levels.length)mode='NO_LEVEL';
   return {symbol,side:pickedSide,mode,stage,score:vc?.score??ec?.research_rank??mc?.score??null,
      entry,stop,targets,riskDistance,sourceAt:vc?.last_evaluated_at||ec?.source_observed_at_utc||
      mc?.observed_at_utc||null,referencePrice:p,fresh,ageMinutes:age,
      levels,why:outlook,next,sourceTier:vc?'V4':ec?'ERKEN':mc?'MTF':lc?'V3':'NONE',
      note:mode==='SOURCE_RESEARCH_LEVELS'?
        'V4 arşivli araştırma seviyeleri; emir, gelecekte kesin hedef veya kâr garantisi değildir.':
        mode==='ATR_RESEARCH_PROJECTION'?
        'TP/stop otomatik 1H ATR (%'+atr.toFixed(3)+') mesafesinden türetilen HİPOTETİK seviyelerdir. Gerçek piyasa tahmini, teyit veya emir değildir.':
        'Doğrulanmış güncel eşik ve 1H ATR birlikte bulunamadı; stop/TP hesaplanmadı.',
      sourceCandles:{'1H':hour?.last_candle_utc,'4H':h4?.last_candle_utc,'1D':day?.last_candle_utc},
      supportCount:supports,oppositionCount:opposes,
      reasons};
 }
 function render(plan){
   if(!plan)return '<div class="chartScenarioPending">Coin seçildiğinde modelin seviyeleri görünecek.</div>';
   const headline=plan.side?plan.side+' · '+String(plan.stage||'İZLE').replace(/_/g,' '):
     'YÖN TESPİT EDİLEMEDİ';
   const freshness=plan.fresh?'Merkezi kaynak son taramada doğrulandı':
      'ESKİ / DOĞRULANMAMIŞ TARİHSEL KAYNAK — güncel sinyal değildir';
   const levelCell=plan.levels.map(x=>'<div class="chartScenarioLevel '+x.kind+
      '"><small>'+esc(x.label)+'</small><strong>'+esc(format(x.value))+'</strong></div>').join('');
   return '<div class="chartScenarioTop"><div><b>'+esc(plan.symbol)+' · '+esc(headline)+
    '</b><small>'+esc(plan.sourceTier)+' · '+esc(freshness)+'</small></div>'+
    '<span class="chartScenarioUncertain">'+(plan.mode==='SOURCE_RESEARCH_LEVELS'?
      'KAYNAK SEVİYELERİ':plan.mode==='ATR_RESEARCH_PROJECTION'?'KOŞULLU TP SENARYOSU':'EŞİK BEKLENİYOR')+
    '</span></div>'+
    '<p class="chartScenarioThesis"><strong>Model ne düşünüyor?</strong> '+esc(plan.why)+'</p>'+
    '<div class="chartScenarioLevels">'+(levelCell||'<span class="chartScenarioMissing">Şu an çizilebilir doğrulanmış eşik/TP yok. Kaynak gelmeden fiyat uydurulmaz.</span>')+'</div>'+
    '<p class="chartScenarioNext"><strong>Ne olursa önemli?</strong> '+esc(plan.next)+'</p>'+
    '<small class="chartScenarioFoot">'+esc(plan.note)+' · '+esc(time(plan.sourceAt))+
    ' · Puan varsa yalnız sıralama, başarı olasılığı değildir.</small>';
 }
 global.CoinLiveChartGuidance={build,render,format};
})(globalThis);
