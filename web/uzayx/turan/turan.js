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
  let data=null,limit=30;
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
  async function download(){
    let url='https://raw.githubusercontent.com/onurqlp/coin-live-pro/main/web/data/turan-core.json?ts='+Date.now();
    try{
      const r=await fetch('https://api.github.com/repos/onurqlp/coin-live-pro/commits/main',{cache:'no-store'});
      if(r.ok){const j=await r.json();if(/^[a-f0-9]{40}$/.test(j.sha||''))url='https://raw.githubusercontent.com/onurqlp/coin-live-pro/'+j.sha+'/web/data/turan-core.json';}
    }catch(e){ /* Fall back to uncached main source. */ }
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok)throw Error('TURAN raporu erişilemiyor (HTTP '+r.status+')');
    const d=await r.json();
    if(d.schema!=='turan.core.v1'||d.no_real_orders!==true||d.research_only!==true||!Array.isArray(d.strategies)||d.strategies.length!==230||!d.source_alignment||Object.values(d.source_alignment).some(x=>x!==true))throw Error('TURAN kaynak bütünlüğü doğrulanamadı');
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
      return '<article class="strategy-card"><header><div><span class="strategy-id">'+esc(x.id)+'</span><h3>'+esc(x.name)+'</h3></div><span class="strategy-tag">'+esc(stateLabel(x.state))+'</span></header><p>'+esc(x.family)+'</p><div class="strategy-stats"><div><small>1H gözlem</small><strong>'+number(x.observed_1h)+'</strong></div><div><small>Sanal kapanış</small><strong>'+number(x.paper_closed)+'</strong></div><div><small>Sanal net*</small><strong>'+esc(money)+'</strong></div></div><details><summary>Kanıt ve kaynak detayları</summary><p>Son çevrim: '+esc(cycleStatus)+' · aday '+number(cycle.candidate_count)+' · sinyal '+number(cycle.signal_count)+' · '+esc(cycle.evaluation_id?cycle.evaluation_id.slice(0,17)+'…':'EVAL kaydı yok')+'</p><p>Kaynak: '+esc(x.required_source||'Mevcut kayıtta yok')+'</p><p>Eşleşen araştırma olayı: '+number(x.research_events)+' · Pozitif/negatif 1H yön gözlemi: '+number(x.positive_1h)+' / '+number(x.negative_1h)+'</p><p>1H ortalama yön hareketi: '+esc(signed(x.mean_direction_1h_pct,'%'))+' · Açık sanal pozisyon: '+number(x.paper_open)+'</p><p>'+esc(x.independent_profit_verified?'Bağımsız doğrulama kaydı mevcut.':'Pozitif beklenti bağımsız olarak doğrulanmadı.')+' *Sanal net tutar geçmişe ait atfedilmiş kayıttır; getiri garantisi değildir.</p></details></article>';
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
  function learningStage(strategy){
    const cycle=strategy.last_cycle_evaluation||{},state=strategy.state||'';
    if(cycle.status==='BLOCKED_SOURCE'||state==='BLOCKED_REQUIRED_EVIDENCE')return 'Kaynak bekliyor';
    if(state==='IMPLEMENTED_CONTROL'||strategy.role==='CONTROL_OR_RESEARCH')return 'Kontrol / araştırma';
    if(strategy.paper_closed>0)return 'Sonuç birikiyor';
    if(cycle.status==='SIGNAL'||cycle.status==='NO_SIGNAL')return 'Döngüde değerlendirildi';
    if(state==='IMPLEMENTED_FORWARD_PAPER')return 'İleri gözlem';
    return 'Kontrol / araştırma';
  }
  function showProgress(){
    const p=learningProgressSummary(data),l=data.learning||{},c=data.contest||{},items=data.strategies||[];
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
      valueRow('Şampiyon adayı',p.shadowChampion?'Aday kaydı var':'Henüz doğrulanmadı'),
      valueRow('Güncel öğrenme modeli',l.model_id?l.model_id.slice(0,16)+'…':'Model kimliği yok')
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
      return '<article class="progress-card"><header><div><span class="strategy-id">'+esc(x.id)+'</span><h3>'+esc(x.name)+'</h3></div><span class="progress-stage">'+esc(stage)+'</span></header><p>'+esc(x.family)+' · '+esc(stateLabel(x.state))+'</p><div class="progress-evidence">'+esc(evidence)+'</div><div class="progress-stats"><span>'+esc(metric)+'</span><span>'+esc(direction)+'</span><span>Gerekli kaynak: '+esc(x.required_source||'Belirtilmemiş')+'</span></div><p class="progress-foot">'+esc(x.independent_profit_verified?'Bağımsız sonuç doğrulanmış.':'Bağımsız kârlılık doğrulanmadı.')+'</p></article>';
    }).join(''):'<div class="empty">Bu aşama veya aramayla eşleşen strateji yok.</div>';
  }
  function showSources(){
    $('sources').innerHTML=(data.sources||[]).map(s=>'<div class="source-card"><span class="id">'+esc(s.id)+'</span><b>'+esc(s.name)+'</b><span class="'+sourceColor(s)+'">'+esc(sourceStatus(s))+'</span><p>Son kaydedilen zaman: '+esc(clock(s.observed_at))+' · '+esc(ago(s.observed_at))+'</p></div>').join('');
  }
  function render(){
    if(!data)return;
    const timestamp=Date.parse(data.generated_at_utc||'');
    const age=(Date.now()-timestamp)/60000;
    status(!Number.isFinite(age)?'fail':age>25?'stale':'ok',!Number.isFinite(age)?'Veri zamanı eksik':age>25?'Gecikmiş araştırma · '+ago(data.generated_at_utc):'Doğrulanmış rapor · '+ago(data.generated_at_utc));
    showCommand();showArena();showCases();showLearning();showProgress();showSources();
  }
  let busy=false;
  async function refresh(){
    if(busy)return;busy=true;
    $('refresh').disabled=true;status('','Kaynak kontrol ediliyor');
    try{data=await download();render();}
    catch(e){data=null;status('fail',e.message||'Kaynak okunamadı');['kpis','learn-kpis','learning-progress-kpis','learning-progress-summary','learning-progress-next','learning-progress-strategies','strategies','live-events','sources'].forEach(id=>{if($(id))$(id).innerHTML='<div class="empty">Veri doğrulanamadı. Daha sonra yeniden deneyin; eski rapor canlı gibi gösterilmez.</div>';});}
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
