'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = (v, d=0) => typeof v==='number' && Number.isFinite(v) ? v.toLocaleString('tr-TR',{minimumFractionDigits:d,maximumFractionDigits:d}) : '—';
  const signed = (v, units='') => typeof v==='number' && Number.isFinite(v) ? (v>0?'+':'') + number(v,2) + units : '—';
  const clock = v => {const x=new Date(v||'');return Number.isFinite(+x)?x.toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Istanbul'}):'—';};
  const ago = v => {const t=Date.parse(v||'');if(!Number.isFinite(t))return 'Tarih doğrulanamadı';const m=Math.round((Date.now()-t)/60000);return m<0?'Saat uyumsuzluğu':m<1?'Az önce':m<60?m+' dk önce':m<1440?Math.floor(m/60)+' sa önce':Math.floor(m/1440)+' gün önce';};
  const valueRow = (label,value) => '<div class="learnline"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>';
  const stateLabel = x => ({IMPLEMENTED_FORWARD_PAPER:'İleri sanal deney',BLOCKED_REQUIRED_EVIDENCE:'Kaynak bekleniyor',IMPLEMENTED_CONTROL:'Kontrol / araştırma',RESEARCH_ONLY:'Önceki araştırma'}[x]||x||'Araştırma');
  const evaluationLabel = x => ({SIGNAL:'Araştırma sinyali eşleşti',NO_SIGNAL:'Sinyal yok',BLOCKED_SOURCE:'Kaynak/veri engeli',CONTROL_RESEARCH_ONLY:'Kontrol / bağımsız giriş değil',MISSING_REGISTRY_RECORD:'Katalog kaydı eksik'}[x]||'Bu döngüde kayıt yok');
  const displayView = {command:'Komuta merkezi',arena:'Strateji arenası',cases:'Olay hafızası',progress:'Öğrenim ilerlemesi',learning:'Öğrenme laboratuvarı',sources:'Veri ve sistem'};
  let data=null,journeySources=null,limit=30;
  function go(view){
    if(!displayView[view])return;
    Object.keys(displayView).forEach(id=>{
      $('view-'+id)?.classList.toggle('active',id===view);
      document.querySelectorAll('[data-view="'+id+'"]').forEach(b=>{b.classList.toggle('selected',id===view);if(id===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    });
    $('crumb-view').textContent=displayView[view];
    history.replaceState(null,'','#'+view);
    window.scrollTo({top:0,behavior:'instant'});
  }
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.view)));
  document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.open)));
  const lastHash=location.hash.slice(1);if(displayView[lastHash])go(lastHash);
  const status=(kind,text)=>{
    const el=$('live-state');el.className='status-pill '+kind;
    el.innerHTML='<span class="status-dot"></span> '+esc(text);
  };
  function preferVerifiedReplay(core,candidate){
    const prior=core.replay||null;
    if(!candidate||candidate.schema!=='turan.replay.v1'||candidate.no_real_orders!==true||
       candidate.complete_net_usdt!==null||candidate.strategy_version!==core.rule_version||
       candidate.source!=='BINANCE_VERIFIED_MONTHLY_1H')return prior;
    const newer=Date.parse(candidate.generated_at_utc||'');
    const older=Date.parse(prior?.generated_at_utc||'');
    return Number.isFinite(newer)&&(!Number.isFinite(older)||newer>=older)?candidate:prior;
  }
  async function download(){
    let url='https://raw.githubusercontent.com/onurqlp/coin-live-pro/main/web/data/turan-core.json?ts='+Date.now();
    let pinned=null;
    try{
      const r=await fetch('https://api.github.com/repos/onurqlp/coin-live-pro/commits/main',{cache:'no-store'});
      if(r.ok){const j=await r.json();if(/^[a-f0-9]{40}$/.test(j.sha||'')){pinned=j.sha;url='https://raw.githubusercontent.com/onurqlp/coin-live-pro/'+pinned+'/web/data/turan-core.json';}}
    }catch(e){ /* Fall back to uncached main source. */ }
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok)throw Error('TURAN raporu erişilemiyor (HTTP '+r.status+')');
    const d=await r.json();
    if(d.schema!=='turan.core.v1'||d.no_real_orders!==true||d.research_only!==true||!Array.isArray(d.strategies)||d.strategies.length!==230||!d.source_alignment||Object.values(d.source_alignment).some(x=>x!==true))throw Error('TURAN kaynak bütünlüğü doğrulanamadı');
    journeySources=null;
    {
      const root='https://raw.githubusercontent.com/onurqlp/coin-live-pro/'+(pinned||'main')+'/web/data/';
      const results=await Promise.allSettled(['ops-report.json','turan-experiments.json','v4-spark-paper.json','turan-replay.json'].map(async name=>{
        const response=await fetch(root+name+(pinned?'':'?ts='+Date.now()),{cache:'no-store'});
        if(!response.ok)throw Error(name+' HTTP '+response.status);
        return response.json();
      }));
      if(results.slice(0,3).every(x=>x.status==='fulfilled')){
        const [ops,experiments,spark]=results.slice(0,3).map(x=>x.value);
        if(ops.source_scan_id===d.source_scan_id&&experiments.scan_id===d.source_scan_id&&spark.scan_id===d.source_scan_id&&
           ops.real_orders===false&&ops.experimental_spark?.is_real_money===false&&experiments.no_real_orders===true&&
           experiments.separate_from_shared_cash===true&&spark.no_real_orders===true&&spark.daily?.per_event_deduplicated===true){
          journeySources={ops,experiments,spark};
        }
      }
      if(results[3].status==='fulfilled')d.replay=preferVerifiedReplay(d,results[3].value);
    }
    return d;
  }
  function kpi(label,num,sub,suffix=''){
    return '<article class="kpi"><span class="k-label">'+esc(label)+'</span><div><span class="value">'+esc(num)+'</span><span class="suffix">'+esc(suffix)+'</span></div><small>'+esc(sub)+'</small></article>';
  }
  function showCommand(){
    const t=data.totals||{};
    $('kpis').innerHTML=[
      kpi('Strateji kimliği',number(t.registered),'200 banka + 30 önceki'),
      kpi('Arşivdeki olay',number(t.research_events),'Kayıtlı araştırma penceresi'),
      kpi('İleri tahmin',number(t.prospective_predictions),number(t.settled_predictions)+' sonuçlanan'),
      kpi('Kanıtlanmış kârlı',number(t.verified_profitable),'Bağımsız doğrulama şartı'),
    ].join('');
    $('last-update').textContent='Son araştırma: '+clock(data.generated_at_utc)+' · '+ago(data.generated_at_utc);
    const roles=[['İleri sanal deney',t.roles?.ENTRY_HYPOTHESIS||0,''],['Veri isteyen hipotez',t.roles?.SOURCE_DEPENDENT_HYPOTHESIS||0,'gold'],['Kontrol / araştırma',t.roles?.CONTROL_OR_RESEARCH||0,'gray']];
    $('roles-chart').innerHTML=roles.map(([label,n,color])=>'<div><div class="role-row"><div class="left"><i class="role-pip '+color+'"></i>'+esc(label)+'</div><strong>'+number(n)+'</strong></div><div class="bar '+color+'"><span style="width:'+Math.min(100,Math.max(0,n/200*100))+'%"></span></div></div>').join('');
    const rec=data.recent_cases||[];
    $('live-events').innerHTML=rec.length?rec.slice(0,5).map(c=>'<div class="event-row"><span class="event-direction '+(c.side==='SHORT'?'short':'')+'">'+esc(c.side)+'</span><div><b>'+esc(c.symbol)+'</b><small>'+esc(c.strategy_id)+' · '+clock(c.observed_at_utc)+'</small></div><span class="score '+(typeof c.direction_1h_pct==='number'?(c.direction_1h_pct>=0?'up':'down'):'dim')+'">'+(c.horizon_1h_state==='OBSERVED'?signed(c.direction_1h_pct,'%'):'İZLE')+'</span></div>').join(''):'<div class="empty">Henüz olay kaydı bulunmuyor.</div>';
    const learn=data.learning||{};
    $('learning-summary').innerHTML=[
      valueRow('İleri tahmin',number(t.prospective_predictions)),
      valueRow('Sonuçlanan tahmin',number(t.settled_predictions)),
      valueRow('Ortalama mutlak hata',signed(learn.prospective_mae_pct,'%').replace(/^\+/,'') ),
      valueRow('Bağımsız ölçüm süresi',typeof learn.validation_span_days==='number'?number(learn.validation_span_days,1)+' gün':'Henüz yok'),
      valueRow('Gölge şampiyon',learn.shadow_champion?'Aday mevcut':'Henüz doğrulanmadı'),
      valueRow('Son çevrim kapsamı',data.cycle_evaluation?number(data.cycle_evaluation.checked_count)+' / '+number(data.cycle_evaluation.expected_count)+' · '+number(data.cycle_evaluation.missing_count)+' eksik':'Henüz ölçülmedi'),
      valueRow('Kural kapsamı / veri hazır',data.cycle_evaluation?number(data.cycle_evaluation.rule_evaluated_count)+' / 53 · '+number(data.cycle_evaluation.data_ready_count)+' hazır':'Henüz ölçülmedi'),
      valueRow('Sinyal / sinyal yok',data.cycle_evaluation?number(data.cycle_evaluation.status_counts?.SIGNAL||0)+' / '+number(data.cycle_evaluation.status_counts?.NO_SIGNAL||0):'Henüz ölçülmedi'),
      valueRow('Kaynak engeli / kontrol',data.cycle_evaluation?number(data.cycle_evaluation.status_counts?.BLOCKED_SOURCE||0)+' / '+number(data.cycle_evaluation.status_counts?.CONTROL_RESEARCH_ONLY||0):'Henüz ölçülmedi')
    ].join('');
    $('source-summary').innerHTML=(data.sources||[]).map(s=>'<div class="source-row"><span>'+esc(s.name)+'</span><b class="'+sourceColor(s)+'">'+esc(sourceStatus(s))+'</b></div>').join('');
  }
  function sourceColor(s){return s.status==='SCANNED'&&s.age_minutes!==null&&s.age_minutes<25?'good':s.status==='NOT_COLLECTED'||String(s.status).includes('UNAVAILABLE')?'bad':'warn';}
  function sourceStatus(s){const age=typeof s.age_minutes==='number'?' · '+number(s.age_minutes,1)+' dk':'';return String(s.status||'UNAVAILABLE').replace(/_/g,' ')+age;}
  function showArena(){
    let s=data.strategies||[];
    const q=($('strategy-search').value||'').trim().toLocaleLowerCase('tr-TR'), f=$('strategy-filter').value, order=$('strategy-order').value;
    s=s.filter(x=>(f==='ALL'||x.state===f)&&(!q||[x.id,x.name,x.family,x.required_source].some(y=>String(y||'').toLocaleLowerCase('tr-TR').includes(q))));
    if(order==='PAPER')s.sort((a,b)=>(b.paper_closed||0)-(a.paper_closed||0));
    else if(order==='OBSERVED')s.sort((a,b)=>(b.observed_1h||0)-(a.observed_1h||0));
    else s.sort((a,b)=>a.id.localeCompare(b.id,'tr'));
    $('arena-count').textContent=s.length+' / '+data.strategies.length+' strateji';
    $('strategies').innerHTML=s.length?s.slice(0,limit).map(x=>{
      const money=x.paper_closed>0?signed(x.paper_realized_usdt,' USDT'):'—';
      const cycle=x.last_cycle_evaluation||{};
      const cycleStatus=evaluationLabel(cycle.status);
      return '<article class="strategy-card"><header><div><span class="strategy-id">'+esc(x.id)+'</span><h3>'+esc(x.name)+'</h3></div><span class="strategy-tag">'+esc(stateLabel(x.state))+'</span></header><p>'+esc(x.family)+'</p><div class="strategy-stats"><div><small>1H gözlem</small><strong>'+number(x.observed_1h)+'</strong></div><div><small>Sanal kapanış</small><strong>'+number(x.paper_closed)+'</strong></div><div><small>Sanal net*</small><strong>'+esc(money)+'</strong></div></div><details><summary>Kanıt ve kaynak detayları</summary><p>Kural sürümü: '+esc(x.strategy_version||'Önceki araştırma')+' · kural özeti: '+esc(x.rules_hash?x.rules_hash.slice(0,16)+'…':'Yok')+'</p><p>Son çevrim: '+esc(cycleStatus)+' · aday '+number(cycle.candidate_count)+' · sinyal '+number(cycle.signal_count)+' · '+esc(cycle.evaluation_id?cycle.evaluation_id.slice(0,17)+'…':'EVAL kaydı yok')+' · '+esc(clock(cycle.evaluated_at_utc))+'</p><p>İşlem açmama nedeni: '+esc(cycle.block_reason|| (cycle.status==='NO_SIGNAL'?'Kural tetiklenmedi':cycle.status==='CONTROL_RESEARCH_ONLY'?'Bağımsız giriş kuralı değil':'Risk ve veri kapıları ayrıca uygulanır'))+'</p><p>Kaynak: '+esc(x.required_source||'Mevcut kayıtta yok')+'</p><p>Eşleşen araştırma olayı: '+number(x.research_events)+' · Pozitif/negatif 1H yön gözlemi: '+number(x.positive_1h)+' / '+number(x.negative_1h)+'</p><p>1H ortalama yön hareketi: '+esc(signed(x.mean_direction_1h_pct,'%'))+' · Açık sanal pozisyon: '+number(x.paper_open)+'</p><p>'+esc(x.independent_profit_verified?'Bağımsız sonuç doğrulanmış.':'Bağımsız kârlılık doğrulanmadı.')+' *Sanal net yalnız aynı kural sürümüyle eşleşen kayıtları içerir; gerçek işlem değildir.</p></details></article>';
    }).join(''):'<div class="empty">Bu filtreyle eşleşen strateji yok.</div>';
    $('show-more').hidden=s.length<=limit;
  }
  function showCases(){
    const q=($('case-search').value||'').trim().toLocaleLowerCase('tr-TR'),f=$('case-filter').value;
    const filtered=(data.recent_cases||[]).filter(x=>(f==='ALL'||x.horizon_1h_state===f||(f==='TRACKING'&&x.horizon_1h_state!=='OBSERVED'))&&(!q||[x.symbol,x.strategy_id].some(y=>String(y||'').toLocaleLowerCase('tr-TR').includes(q))));
    $('cases-body').innerHTML=filtered.length?filtered.map(x=>'<tr><td><b>'+esc(x.symbol)+'</b> <span class="event-direction '+(x.side==='SHORT'?'short':'')+'">'+esc(x.side)+'</span></td><td>'+esc(x.strategy_id)+'</td><td>'+clock(x.observed_at_utc)+'</td><td>'+esc(x.horizon_1h_state==='OBSERVED'?signed(x.direction_1h_pct,'%'):'—')+'</td><td><span class="badge '+(x.horizon_1h_state==='OBSERVED'?'':'pending')+'">'+esc(x.horizon_1h_state==='OBSERVED'?'Ölçüldü':'İzleniyor / eksik')+'</span></td></tr>').join(''):'<tr><td colspan="5">Bu filtrede olay bulunamadı.</td></tr>';
  }
  function showLearning(){
    const t=data.totals||{}, l=data.learning||{},j=data.journal||{},c=data.contest||{};
    $('learn-kpis').innerHTML=[
      kpi('Üretilen ileri tahmin',number(t.prospective_predictions),'Kaydedilen tahminler'),
      kpi('Sonuçlanan tahmin',number(t.settled_predictions),'İleriye dönük etiketler'),
      kpi('Bağımsız bölüm',number(t.independent_episodes),'Coin/olay epizotları'),
      kpi('Doğrulanan şampiyon',number(t.verified_profitable),'Kazanç varsayılmaz'),
    ].join('');
    $('model-card').innerHTML='<div class="learner">'+
       valueRow('Son model eğitimi',clock(l.trained_at_utc))+
       valueRow('Model kimliği',l.model_id?l.model_id.slice(0,16)+'…':'—')+
       valueRow('İleri hata ölçümü',typeof l.prospective_mae_pct==='number'?number(l.prospective_mae_pct,3)+'%':'Yetersiz')+
       valueRow('Model politikası','Sanal / salt okunur')+'</div>';
    $('validation-card').innerHTML='<div class="learner">'+
       valueRow('Gerekli gözlem günü',c.selection_requires_days===null?'—':number(c.selection_requires_days))+
       valueRow('Gerekli ana kapanış',c.selection_requires_primary_closed===null?'—':number(c.selection_requires_primary_closed))+
       valueRow('Gözlenen süre',typeof l.validation_span_days==='number'?number(l.validation_span_days,2)+' gün':'—')+
       valueRow('Engeller',(l.validation_blocks||[]).join(', ')||'Raporlanmadı')+
       valueRow('Otomatik ana strateji değişimi','Kapalı')+'</div>';
    $('journal-summary').innerHTML=[
      '<div class="journal-entry"><strong class="journal-number">'+number(j.recorded_scans)+'</strong><div><b>Kayıtlı araştırma taraması</b><small>İlk TURAN günlüğü: '+clock(j.first_recorded_at_utc)+'</small></div></div>',
      '<div class="journal-entry"><strong class="journal-number">'+number(j.new_source_events_since_last_scan)+'</strong><div><b>Önceki taramadan beri yeni olay</b><small>Kaynak olayları: '+number(t.research_events)+' toplam</small></div></div>',
      '<div class="journal-entry"><strong class="journal-number">'+(j.source_event_regression?'!':'✓')+'</strong><div><b>Kaynak bütünlüğü</b><small>'+(j.source_event_regression?'Olay adedinde azalma görüldü; kontrol gerekli.':'Mevcut kaynak sayısı önceki kayıtla uyumlu.')+'</small></div></div>'
    ].join('');
  }
  function learningProgressSummary(snapshot){
    const totals=snapshot.totals||{},learn=snapshot.learning||{},contest=snapshot.contest||{},cycle=snapshot.cycle_evaluation||null;
    const expected=cycle?.expected_count??totals.bank??200;
    const evaluated=cycle?.checked_count??(snapshot.strategies||[]).filter(x=>x.last_cycle_evaluation?.evaluation_id).length;
    const missing=cycle?.missing_count??Math.max(0,expected-evaluated);
    const predictions=totals.prospective_predictions||0,settled=totals.settled_predictions||0;
    const requiredDays=contest.selection_requires_days??7;
    const observedDays=learn.validation_span_days;
    return {expected,evaluated,missing,ruleEvaluated:cycle?.rule_evaluated_count??null,dataReady:cycle?.data_ready_count??null,blocked:cycle?.status_counts?.BLOCKED_SOURCE??null,signal:cycle?.status_counts?.SIGNAL??null,noSignal:cycle?.status_counts?.NO_SIGNAL??null,predictions,settled,maturedPct:predictions>0?Math.min(100,settled/predictions*100):null,requiredDays,observedDays,daysRemaining:typeof observedDays==='number'?Math.max(0,requiredDays-observedDays):null,shadowChampion:learn.shadow_champion||null,independentlyVerified:totals.verified_profitable||0,cyclePublished:Boolean(cycle)};
  }
  function paperEvidenceSummary(snapshot){
    const p=snapshot.paper_evidence||{};
    if(p.scan_id!==snapshot.source_scan_id||p.source!=='OKX_MODELLED_PAPER_LEDGER'||p.reconciled!==true||p.no_real_orders!==true)return null;
    const numeric=k=>typeof p[k]==='number'&&Number.isFinite(p[k])?p[k]:null;
    const totalPnl=numeric('total_pnl_usdt'),equity=numeric('equity_usdt'),starting=numeric('starting_usdt');
    const closed=numeric('closed_count'),open=numeric('open_count');
    if(totalPnl===null||equity===null||starting===null||closed===null||open===null)return null;
    return {totalPnl,equity,starting,fees:numeric('fees_estimated_usdt'),closed,open,funding:p.funding||'UNKNOWN',liquidation:p.liquidation||'UNKNOWN'};
  }
  function learningStage(strategy){
    const cycle=strategy.last_cycle_evaluation||{},state=strategy.state||'';
    if(cycle.status==='BLOCKED_SOURCE'||state==='BLOCKED_REQUIRED_EVIDENCE')return 'Kaynak bekliyor';
    if(state==='IMPLEMENTED_CONTROL'||strategy.role==='CONTROL_OR_RESEARCH')return 'Kontrol / araştırma';
    if(strategy.paper_closed>0)return 'Sonuç birikiyor';
    if(cycle.status==='SIGNAL'||cycle.status==='NO_SIGNAL')return 'Döngüde değerlendirildi';
    if(state==='IMPLEMENTED_FORWARD_PAPER')return 'İleri gözlem';
    return 'Kontrol / araştırma';
  }
  function strategyEvidenceSummary(snapshot){
    const a=snapshot.attribution||null,e=snapshot.experiments||{};
    const valid=e.scan_id===snapshot.source_scan_id&&e.no_real_orders===true&&e.separate_from_shared_cash===true;
    return {attribution:a,experiments:valid?e:null};
  }
  function journeySummary(snapshot,sources){
    const methods=snapshot.totals?.bank;
    if(!sources)return {methods,available:false};
    const {ops,experiments,spark}=sources, cohort=ops.cohorts?.['TÜMÜ']||{},days=ops.daily||[];
    const closed=cohort.closed,positive=cohort.positive,negative=cohort.negative;
    const countValid=Number.isInteger(closed)&&Number.isInteger(positive)&&Number.isInteger(negative)&&positive+negative<=closed;
    const cash=paperEvidenceSummary(snapshot),matched=countValid&&cash&&cash.closed===closed&&
      ops.experimental_spark?.closed_cohort_count===closed&&ops.experimental_spark?.positive_closed===positive&&
      ops.experimental_spark?.negative_closed===negative&&ops.experimental_spark?.realized_reconciliation_verified===true;
    const dailyValid=Array.isArray(days)&&days.length>0&&days.every(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date_utc||'')&&
      Number.isInteger(x.closed)&&x.closed>=0&&Number.isInteger(x.positive_closures)&&x.positive_closures>=0&&
      Number.isInteger(x.negative_closures)&&x.negative_closures>=0&&
      x.positive_closures+x.negative_closures<=x.closed&&Number.isFinite(x.realized_net_usdt));
    const uniqueDays=dailyValid?[...days].sort((a,b)=>a.date_utc.localeCompare(b.date_utc)):[];
    const dayCount=uniqueDays.length;
    const dailyClosed=uniqueDays.reduce((n,x)=>n+x.closed,0);
    const dailyPositive=uniqueDays.reduce((n,x)=>n+x.positive_closures,0);
    const consecutive=rows=>rows.length===7&&rows.every((x,i)=>i===0||
      Date.parse(x.date_utc+'T00:00:00Z')-Date.parse(rows[i-1].date_utc+'T00:00:00Z')===86400000);
    const recent=uniqueDays.slice(-7),prior=uniqueDays.slice(-14,-7);
    const sevenNet=consecutive(recent)?recent.reduce((n,x)=>n+x.realized_net_usdt,0):null;
    const priorNet=consecutive(prior)?prior.reduce((n,x)=>n+x.realized_net_usdt,0):null;
    const hopeful=(experiments.strategies||[]).filter(x=>x.arms?.ORIGINAL?.closed>=10&&x.episode_count>=3&&x.arms.ORIGINAL.modeled_net_usdt>0).length;
    const reliable=(snapshot.totals?.verified_profitable||0);
    const dataOk=Boolean(matched)&&dailyValid&&new Set(uniqueDays.map(x=>x.date_utc)).size===dayCount&&
      dailyClosed<=closed&&dailyPositive<=positive&&Number.isInteger(methods)&&experiments.experiment_count>=0;
    return {available:dataOk,methods,hopeful,reliable,closed,positive,negative,open:cash?.open,
      modeledRealized:ops.experimental_spark?.fully_closed_ticket_realized_net_usdt,
      allRealized:cash?.totalPnl,sevenNet,
      sevenChange:sevenNet!==null&&priorNet!==null?sevenNet-priorNet:null,
      dayCount,first:spark.started_at||null,last:uniqueDays.at(-1)?.date_utc,
      days:uniqueDays.slice(-7),experiments:experiments.experiment_count,
      experimentFirst:experiments.started_at_utc,sourceGaps:ops.source_publication_valid!==true,
      completeNetKnown:Number.isFinite(experiments.complete_net_usdt)&&cash?.funding==='MODELED'&&cash?.liquidation==='VERIFIED'};
  }
  function showJourney(){
    const j=journeySummary(data,journeySources),el=$('journey-panel');
    if(!j.available){el.innerHTML='<div class="empty">Günlük kayıtlar ve toplamlar şu an aynı kaynakta doğrulanamadı. Sayılar yerine son güncelleme bekleniyor.</div>';return;}
    const date=x=>{const t=Date.parse(x||'');return Number.isFinite(t)?new Date(t).toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}):'—';};
    const dailyMax=Math.max(1,...j.days.map(x=>Math.abs(x.realized_net_usdt)));
    const rows=j.days.slice().reverse().map(x=>{
      const net=x.realized_net_usdt,kind=net>0?'up':net<0?'down':'flat';
      const width=Math.round(Math.abs(net)/dailyMax*100);
      return '<tr><td>'+esc(date(x.date_utc))+'</td><td>'+number(x.closed)+'</td><td>'+number(x.positive_closures)+' / '+number(x.negative_closures)+'</td><td><div class="journey-result '+kind+'"><span class="journey-spark" aria-hidden="true"><i style="width:'+width+'%"></i></span><b>'+esc(signed(net,' USDT'))+'</b></div></td></tr>';
    }).join('');
    const prior=j.sevenChange===null?'Önceki tam 7 gün bulunmuyor':'Önceki 7 güne göre '+signed(j.sevenChange,' USDT');
    const latest=j.days.at(-1),previous=j.days.at(-2);
    const dayComparison=latest&&previous?'Son gün '+number(latest.closed)+' kapanış; önceki gün '+number(previous.closed)+' kapanış.':'Günlük karşılaştırma için iki kayıt bekleniyor.';
    const state=j.sevenNet===null?'Günlük kayıtlar birikiyor':j.sevenNet>=0?'Son 7 gün sanal net artıda':'Son 7 gün sanal net ekside';
    el.innerHTML='<div class="journey-top"><div><span class="journey-eyebrow">ŞU AN</span><p class="journey-state">'+esc(state)+'</p><p>Günlük sonuçları ve geçmişteki değişimi birlikte izle. Bunlar sanal işlem ve yöntem deneyi kayıtlarıdır.</p></div><span class="journey-live">● Kaynaktan güncellenir</span></div>'+
      '<div class="journey-mini"><div><b>'+number(j.methods)+'</b><span>İncelenen yöntem</span></div><div><b>'+number(j.experiments)+'</b><span>Yöntem deneyi</span></div><div><b>'+number(j.closed)+'</b><span>Kapanan sanal işlem</span></div><div><b>'+number(j.dayCount)+'</b><span>Görünen günlük kayıt</span></div></div>'+
      '<div class="journey-overview"><div><small>BAŞTAN BUGÜNE · SANAL KASA</small><strong class="'+(j.modeledRealized>=0?'up':'down')+'">'+esc(signed(j.modeledRealized,' USDT'))+'</strong><span>'+number(j.positive)+' artı · '+number(j.negative)+' eksi · '+number(j.open)+' açık</span></div><div><small>SON 7 TAM KAYITLI GÜN</small><strong class="'+(j.sevenNet===null?'flat':j.sevenNet>=0?'up':'down')+'">'+(j.sevenNet===null?'Henüz yok':esc(signed(j.sevenNet,' USDT')))+'</strong><span>'+esc(prior)+'</span></div></div>'+
      '<div class="journey-methods"><div><b>'+number(j.methods)+'</b><span>İnceleniyor</span></div><div><b>'+number(j.hopeful)+'</b><span>Tekrar denenecek</span></div><div><b>'+number(j.reliable)+'</b><span>Bağımsız doğrulandı</span></div></div>'+
      '<div class="journey-table-head"><div><b>Gün gün geçmiş</b><span>En yeni gün üstte · '+esc(date(j.first))+' tarihinden beri sanal kasa</span></div></div>'+
      '<div class="journey-table-wrap"><table class="journey-table"><thead><tr><th>Gün (UTC)</th><th>Kapanış</th><th>Artı / eksi</th><th>Sanal net hareket</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
      '<div class="journey-foot-grid"><div><b>Nerede ilerliyoruz?</b><p>'+esc(dayComparison)+'</p><p>'+esc(j.hopeful)+' yöntem ilk incelemede olumlu görünüyor. Bu, sonraki günlerde de aynı sonucu vereceği anlamına gelmez.</p></div><div><b>Henüz neyi bilmiyoruz?</b><p>Uzun dönem tutarlılık, fonlama ve tasfiye maliyeti. Bu yüzden başarı puanı veya tarih tahmini göstermiyoruz.</p><p>Bağımsız doğrulanmış aday: '+number(j.reliable)+' · Gerçek işlem: yok.</p></div></div>'+
      '<p class="journey-meta">Tekrar denenecek: asıl yöntemde en az 10 kapanış, 3 olay kümesi ve pozitif tahmini sonuç; sonraki dönemde doğrulanmış sonuç değil. Son güncelleme '+esc(clock(data.generated_at_utc))+' · Günlük tablo: son '+number(j.dayCount)+' kayıt; toplamlar '+esc(date(j.first))+' başlangıçlı ayrı sanal kasadan. Yöntem deneyleri '+esc(date(j.experimentFirst))+' tarihinden itibaren ayrı sayılır. Günlük net hareket açık işlemlerin kısmi kapanışını içerebilir; toplam sanal kasa sonucu yalnızca tamamen kapanan işlemlerdir. Tahmini ücretler dahil, fonlama ve tasfiye eksik. 30/90 günlük tam karşılaştırma için yeterli gün yok.</p>';
  }
  function showProgress(){
    showJourney();
    const p=learningProgressSummary(data),l=data.learning||{},c=data.contest||{},items=data.strategies||[],cash=paperEvidenceSummary(data);
    const proof=strategyEvidenceSummary(data),a=proof.attribution,e=proof.experiments;
    $('learning-progress-kpis').innerHTML=[
      kpi('TURAN kimliği',number(data.totals?.registered),'Banka '+number(data.totals?.bank)+' / önceki '+number(Math.max(0,(data.totals?.registered||0)-(data.totals?.bank||0)))),
      kpi('Son çevrimde değerlendirilen',p.cyclePublished?number(p.evaluated)+' / '+number(p.expected):'Yayımlanmadı',p.cyclePublished?number(p.missing)+' eksik kimlik':'En yeni strateji döngüsü bekleniyor'),
      kpi('Sonuçlanan ileri tahmin',number(p.settled)+' / '+number(p.predictions),'Kapanış oranı '+(p.maturedPct===null?'—':number(p.maturedPct,1)+'%')),
      kpi('Bağımsız doğrulama',number(p.independentlyVerified),'Doğrulanmış kârlı strateji')
    ].join('');
    const coverage=p.cyclePublished?number(p.ruleEvaluated)+' / '+number(53)+' kural · '+number(p.dataReady)+' veri hazır':'Son 200 kimlik çevrimi veri paketinde yok';
    const proximity=typeof p.observedDays==='number'?number(p.observedDays,2)+' / '+number(p.requiredDays)+' gün'+(p.daysRemaining>0?' · en az '+number(p.daysRemaining,2)+' gün daha':' · süre eşiği sağlandı'):'Gözlem süresi raporlanmadı';
    $('learning-progress-summary').innerHTML=[
      valueRow('Strateji çevrimi',p.cyclePublished?number(p.evaluated)+' / '+number(p.expected)+' kimlik · '+number(p.missing)+' eksik':'Henüz yayımlanmadı'),
      valueRow('Kural ve kaynak hazırlığı',coverage),
      valueRow('İleri doğrulama süresi',proximity),
      valueRow('Tahmin sonuçlanma oranı',p.maturedPct===null?'Hesaplanamıyor':number(p.settled)+' / '+number(p.predictions)+' · '+number(p.maturedPct,1)+'%'),
      valueRow('İleri tahmin hatası (MAE)',typeof l.prospective_mae_pct==='number'?number(l.prospective_mae_pct,3)+'%':'Henüz ölçülemiyor'),
      valueRow('Sanal model P&L (gerçek değil)',cash?signed(cash.totalPnl,' USDT')+' · öz kaynak '+number(cash.equity,2)+' / '+number(cash.starting,2)+' USDT':'Aynı çevrimde doğrulanmış kayıt yok'),
      valueRow('Sanal sonuç kapsamı',cash?number(cash.closed)+' kapalı · '+number(cash.open)+' açık · tahmini ücret '+number(cash.fees,2)+' USDT · fonlama '+cash.funding+' · tasfiye '+cash.liquidation:'Kasa özeti doğrulanmadı'),
      valueRow('Şampiyon adayı',p.shadowChampion?'Aday kaydı var':'Henüz doğrulanmadı'),
      valueRow('Güncel öğrenme modeli',l.model_id?l.model_id.slice(0,16)+'…':'Model kimliği yok')
    ].join('');
    $('learning-progress-summary').innerHTML+=[
      valueRow('Strateji → bilet atfı',a?'EXACT '+number(a.counts?.EXACT)+' · RECONSTRUCTED '+number(a.counts?.RECONSTRUCTED)+' · CANDIDATE '+number(a.counts?.CANDIDATE)+' · UNATTRIBUTED '+number(a.counts?.UNATTRIBUTED):'Atıf denetimi bekleniyor'),
      valueRow('Atfedilen maliyet modelli P&L',a?signed(a.attributed_modeled_pnl_usdt,' USDT')+' · dolum atıf oranı '+number(a.attribution_rate_pct,1)+'%':'Henüz ölçülmedi'),
      valueRow('Ayrı strateji deney defteri',e?number(e.experiment_count)+' deney · '+number(e.new_experiments)+' yeni · '+number(e.settled_arms)+' yeni sonuç':'Aynı çevrim deney raporu bekleniyor'),
      valueRow('Gerçek yeni kanıt / değişmeyen',e?number(e.new_evidence_count)+' / '+number(e.no_new_evidence_count)+' strateji':'Henüz ölçülmedi'),
      valueRow('Son yeni öğrenme',e?clock(e.last_learning_at_utc):'Yeni kanıt bekleniyor'),
      valueRow('Tam net P&L',e?'Bilinmiyor · fonlama / tasfiye '+e.funding+' / '+e.liquidation:'Bilinmiyor')
    ].join('');
    const remaining=p.daysRemaining===null?'Gözlem süresini ve model hatasını güncel rapora yaz.':p.daysRemaining>0?'En az '+number(p.daysRemaining,2)+' gün daha ileri veri biriktir; ardından bağımsız doğrulamayı tekrar ölç.':'Gözlem günü eşiği tamam; kapanmış örnek koşulunu ve hata ölçüsünü denetle.';
    const sourceStep=p.cyclePublished&&p.blocked!==null?number(p.blocked)+' strateji kaydında kaynak engeli var; gerekli veri arşivlerini tamamla.':'Son çevrim ve kaynak hazırlığı yayımlandığında engelli stratejiler otomatik görünür.';
    $('learning-progress-next').innerHTML=[
      valueRow('1 · İleri örnek',remaining),
      valueRow('2 · Veri erişimi',sourceStep),
      valueRow('3 · Şampiyon seçimi',c.selection_requires_primary_closed===null||c.selection_requires_primary_closed===undefined?'Ana kapanış eşiği raporlanmadı':number(c.selection_requires_primary_closed)+' ana kapanış gerekir; mevcut sayı raporda ayrı değil'),
      valueRow('4 · Karar kapısı',p.independentlyVerified>0?'Doğrulama kayıtlarını ve şampiyon şartlarını incele.':'Bağımsız kanıt oluşana kadar şampiyon veya kârlılık ilan edilmez.')
    ].join('');
    const q=($('progress-search').value||'').trim().toLocaleLowerCase('tr-TR'),f=$('progress-filter').value;
    const filtered=items.filter(x=>(f==='ALL'||learningStage(x)===f)&&(!q||[x.id,x.name,x.family,x.required_source].some(v=>String(v||'').toLocaleLowerCase('tr-TR').includes(q))));
    $('learning-progress-count').textContent=filtered.length+' / '+items.length+' strateji';
    $('learning-progress-strategies').innerHTML=filtered.length?filtered.map(x=>{
      const stage=learningStage(x),cycle=x.last_cycle_evaluation||{};
      const evidence=cycle.evaluation_id?evaluationLabel(cycle.status)+' · '+esc(cycle.evaluation_id.slice(0,14))+'…':'Son 200-ID çevrim kaydı yok';
      const metric=x.paper_closed>0?number(x.paper_closed)+' kapanmış sanal kayıt':number(x.evaluated_candidates)+' aday · '+number(x.research_events)+' araştırma olayı';
      const direction=number(x.positive_1h)+' pozitif / '+number(x.negative_1h)+' negatif 1H yön gözlemi';
      const experiment=e?x.experiment:null;
      const arms=experiment?Object.entries(experiment.arms||{}).map(([key,v])=>({ORIGINAL:'Asıl',INVERSE:'Ters',WAIT:'Teyit bekle',NO_TRADE:'İşlem yapma'}[key]||key)+': '+number(v.closed)+' kapalı · '+signed(v.modeled_net_usdt,' USDT')).join(' | '):'';
      const detail=experiment?'<details><summary>'+number(experiment.experiment_count)+' ayrı deney · '+number(experiment.episode_count)+' coin/yön/gün kümesi</summary><p>'+esc(arms)+'</p><p>Ufuk gözlemleri: '+esc(Object.entries(experiment.horizon_counts||{}).map(([k,v])=>k+' '+number(v)).join(' · '))+'</p><p>'+esc(experiment.challenger_version)+' · '+esc(experiment.evidence_state)+' · risk engeli '+number(experiment.risk_blocked_count)+' · kaynak boşluğu '+number(experiment.source_gap_count)+' · deney tutarları ortak kasaya eklenmez. Tam net P&L bilinmiyor.</p></details>':'';
      return '<article class="progress-card" id="strategy-'+esc(x.id)+'"><header><div><a class="strategy-id" href="#strategy-'+esc(x.id)+'">'+esc(x.id)+'</a><h3>'+esc(x.name)+'</h3></div><span class="progress-stage">'+esc(stage)+'</span></header><p>'+esc(x.family)+' · '+esc(stateLabel(x.state))+'</p><div class="progress-evidence">'+esc(evidence)+'</div><div class="progress-stats"><span>'+esc(metric)+'</span><span>'+esc(direction)+'</span><span>Gerekli kaynak: '+esc(x.required_source||'Belirtilmemiş')+'</span></div>'+detail+'<p class="progress-foot">'+esc(x.independent_profit_verified?'Bağımsız sonuç doğrulanmış.':'Bağımsız kârlılık doğrulanmadı.')+'</p></article>';
    }).join(''):'<div class="empty">Bu aşama veya aramayla eşleşen strateji yok.</div>';
  }
  function researchComparison(report,version){
    return (report?.cohorts||[]).filter(x=>!version||x.strategy_version===version).map(x=>{
      const pair=x.original_inverse||{},wait=x.original_wait||{};
      return {id:x.strategy_id,version:x.strategy_version,pairs:pair.paired_count||0,excluded:pair.excluded_count||0,
        original:pair.original_modeled_usdt??null,inverse:pair.inverse_modeled_usdt??null,
        wait:wait.wait_modeled_usdt??null,waitOriginal:wait.original_modeled_usdt??null,waitPairs:wait.paired_count||0,
        clusters:pair.episode_clusters??x.episode_clusters??null};
    });
  }
  function researchTable(rows){
    if(!rows.length)return '<div class="empty">Bu kural sürümünde sonuçlanan eşleştirilmiş deney bekleniyor.</div>';
    const sorted=rows.filter(r=>r.pairs||r.waitPairs).sort((a,b)=>Math.max(b.original??-Infinity,b.inverse??-Infinity)-Math.max(a.original??-Infinity,a.inverse??-Infinity));
    if(!sorted.length)return '<div class="empty">Henüz kapanmış ortak karşılaştırma yok.</div>';
    return '<div class="research-scroll"><table class="research-results"><thead><tr><th>Yöntem / sürüm</th><th>Asıl</th><th>Ters</th><th>Ortak deney</th><th>Eksik</th><th>Teyit bekle / eş asıl</th></tr></thead><tbody>'+sorted.slice(0,40).map(r=>'<tr><td><b>'+esc(r.id)+'</b><small>'+esc(r.version)+'</small></td><td class="'+(r.original>=0?'up':'down')+'">'+esc(signed(r.original))+'</td><td class="'+(r.inverse>=0?'up':'down')+'">'+esc(signed(r.inverse))+'</td><td>'+number(r.pairs)+'<small>'+number(r.clusters)+' olay kümesi</small></td><td>'+number(r.excluded)+'</td><td>'+esc(signed(r.wait))+' / '+esc(signed(r.waitOriginal))+'<small>'+number(r.waitPairs)+' ayrı ortak deney</small></td></tr>').join('')+'</tbody></table></div>';
  }
  function forecastQualityLabel(quality){
    if(!quality||!quality.paired_count)return 'Karşılaştırılabilir kapanmış tahmin bekleniyor';
    return quality.beats_zero_baseline?'Bu kesitte daha düşük hata':'Bu kesitte referansı geçemedi';
  }
  function showResearchResults(){
    const host=$('research-results');if(!host)return;
    const quality=data.learning_quality,experiments=data.experiments||{},replay=data.replay;
    const current=data.rule_version||null,paired=researchComparison(experiments.paired_results,current);
    const older=researchComparison(experiments.paired_results,null).filter(r=>r.version!==current);
    const baseline=quality?valueRow('Ölçüm kapsamı','Tüm kayıtlı model ve kural sürümlerinin geçmiş tahminleri')+valueRow('Tahmin / sıfır referans hatası',number(quality.model_mae_pct,3)+'% / '+number(quality.zero_baseline_mae_pct,3)+'%')+valueRow('Aynı sonuçlar üzerinde katkı',number(quality.mae_skill_pct,2)+'% · '+forecastQualityLabel(quality))+valueRow('Karşılaştırılabilen tahmin',number(quality.paired_count)+' · dışarıda / bekleyen '+number(quality.excluded_count)):'<div class="empty">Aynı örneklerde referans karşılaştırması bekleniyor.</div>';
    const recovery=experiments.source_recovery;
    const historical=replay&&replay.no_real_orders===true?'<h4>Geçmişte ayrılan son dönem</h4><p>'+number(replay.symbols_replayed)+' / '+number(replay.available_archive_symbols)+' arşiv sembolü · '+number(replay.bars_loaded)+' gerçek saatlik mum · '+number(replay.experiments)+' geçmiş deney · '+esc(clock(replay.generated_at_utc))+'</p>'+researchTable(researchComparison(replay.split_results?.HOLDOUT,current))+'<p class="research-note">Binance 1H maliyet senaryosu; ileri deneyin 5m modeliyle farklıdır. Geçmişte ayrılmış dönem, yeni ileri doğrulama değildir. Saatlik stop/hedef çakışmasında stop önce kabul edilir; spread varsayımdır. Deney toplamı portföy getirisi değildir.</p>':'<div class="empty">Doğrulanmış geçmiş test raporu bekleniyor.</div>';
    host.innerHTML='<div class="card-head"><div><div class="kicker">STRATEJİDEN SONUCA</div><h3>Asıl, ters ve bekle karşılaştırması</h3></div><span class="mini-chip">'+esc(current||'Sürüm bekleniyor')+'</span></div><div class="learner">'+baseline+'</div><p>Değerler USDT cinsinden maliyet modelli deney sonuçlarıdır. İşlem yapma referansı 0 USDT. Asıl–ters aynı deneylerde karşılaştırılır; bekleme kolunun eş aslı kendi sütununda gösterilir. Tam net sonuç fonlama/tasfiye nedeniyle bilinmiyor.</p><h4>Yeni kuralın ileri deneyleri</h4>'+researchTable(paired)+(recovery?'<p class="research-note">Kalıcı veri takibi: '+number(recovery.cache_symbols)+' coin · bu çevrim '+number(recovery.requests)+' geçmiş veri isteği · '+number(recovery.unresolved_requested_bars)+' eksik mum bekleniyor'+(recovery.retrying_sources?' · '+number(recovery.retrying_sources)+' kaynak için tekrar denenecek':'')+'.</p>':'')+(older.length?'<details><summary>Önceki kural sürümlerinin ayrı sonuçları</summary>'+researchTable(older)+'</details>':'')+historical;
  }
  function showSources(){
    $('sources').innerHTML=(data.sources||[]).map(s=>'<div class="source-card"><span class="id">'+esc(s.id)+'</span><b>'+esc(s.name)+'</b><span class="'+sourceColor(s)+'">'+esc(sourceStatus(s))+'</span><p>Son kaydedilen zaman: '+esc(clock(s.observed_at))+' · '+esc(ago(s.observed_at))+'</p></div>').join('');
  }
  function render(){
    if(!data)return;
    const timestamp=Date.parse(data.generated_at_utc||'');
    const age=(Date.now()-timestamp)/60000;
    status(!Number.isFinite(age)?'fail':age>25?'stale':'ok',!Number.isFinite(age)?'Veri zamanı eksik':age>25?'Gecikmiş araştırma · '+ago(data.generated_at_utc):'Doğrulanmış rapor · '+ago(data.generated_at_utc));
    showCommand();showArena();showCases();showLearning();showProgress();showResearchResults();showSources();
  }
  let busy=false;
  async function refresh(){
    if(busy)return;busy=true;
    $('refresh').disabled=true;status('','Kaynak kontrol ediliyor');
    try{data=await download();render();}
    catch(e){data=null;journeySources=null;status('fail',e.message||'Kaynak okunamadı');['research-results','journey-panel','kpis','learn-kpis','learning-progress-kpis','learning-progress-summary','learning-progress-next','learning-progress-strategies','strategies','live-events','sources'].forEach(id=>{if($(id))$(id).innerHTML='<div class="empty">Veri doğrulanamadı. Daha sonra yeniden deneyin; eski rapor canlı gibi gösterilmez.</div>';});}
    finally{busy=false;$('refresh').disabled=false;}
  }
  $('refresh').addEventListener('click',refresh);
  $('source-refresh').addEventListener('click',refresh);
  ['strategy-search','strategy-filter','strategy-order'].forEach(id=>$(id).addEventListener(id==='strategy-search'?'input':'change',()=>{limit=30;showArena();}));
  $('show-more').addEventListener('click',()=>{limit+=30;showArena();});
  ['case-search','case-filter'].forEach(id=>$(id).addEventListener(id==='case-search'?'input':'change',showCases));
  ['progress-search','progress-filter'].forEach(id=>$(id).addEventListener(id==='progress-search'?'input':'change',showProgress));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  refresh();
  setInterval(()=>{if(!document.hidden)refresh();},120000);
})();
