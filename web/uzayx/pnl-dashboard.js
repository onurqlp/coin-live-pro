/* TURAN 200 · source-reconciled paper PNL, evidence progression and counterfactual lab.
   The entire UI is read-only; scenario arithmetic is NOT a backtest or executed PNL. */
(function(root){
 'use strict';
 const LIMIT=200;
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 function valid(x,manifest){
  return Boolean(x&&x.schema==='uzayx.pnl.ledger.v1'&&x.no_real_orders===true&&x.reconciled===true&&
   x.not_realized_exchange_pnl===true&&x.scan_id===manifest?.scan_id&&manifest?.publication_valid===true&&
   Array.isArray(x.strategies)&&x.strategies.length===LIMIT&&new Set(x.strategies.map(s=>s.id)).size===LIMIT&&
   finite(x.total_pnl_usdt)&&finite(x.realized_usdt)&&finite(x.unrealized_usdt)&&finite(x.equity_usdt)&&
   Math.abs(x.starting_usdt+x.total_pnl_usdt-x.equity_usdt)<.04&&
   Math.abs(x.realized_usdt+x.unrealized_usdt-x.total_pnl_usdt)<.04);
 }
 function sourcesMatch(x,manifest,bank,spark){
  return valid(x,manifest)&&bank?.policy==='TURAN200_ONLY'&&bank?.registry_count===LIMIT&&
   Array.isArray(bank.registry)&&bank.registry.length===LIMIT&&bank.no_real_orders===true&&
   spark?.scan_id===manifest?.scan_id&&bank.source_mtf_at===spark?.source_mtf_at;
 }
 function progress(entry,bank){
  const b=bank?.strategy_contest?.board?.[entry?.id]||{};
  const days=Math.max(0,Number(b.independent_days)||0);
  const closed=Math.max(0,Number(b.independent_primary_closed)||0);
  const holdout=Math.max(0,Number(b.holdout_primary_closed)||0);
  const requiredDays=Math.max(1,Number(bank?.strategy_contest?.selection_requires_days)||7);
  const requiredClosed=Math.max(1,Number(bank?.strategy_contest?.selection_requires_primary_closed)||60);
  return {days,closed,holdout,requiredDays,requiredClosed,
   dayPct:Math.min(100,100*days/requiredDays),closePct:Math.min(100,100*closed/requiredClosed),
   ready:days>=requiredDays&&closed>=requiredClosed&&holdout>0&&b.provisional_forward_winner===true,
   proposedWinner:b.provisional_forward_winner===true,
   sourceBlocked:entry?.state==='RESEARCH_SOURCE_BLOCKED',
   shared:Number(b.shared_supporting_closed)||0,
   observedHours:Number(b.independent_market_hours)||0,
   holdoutBound:finite(b.stressed_holdout_lower_heuristic_pct)?b.stressed_holdout_lower_heuristic_pct:null,
   meanPrimary:finite(b.mean_primary_net_notional_pct)?b.mean_primary_net_notional_pct:null};
 }
 function scenario(movePct=0,notional=300,costPct=.20){
  if(![movePct,notional,costPct].every(finite)||Math.abs(movePct)>10||notional<=0||costPct<0||costPct>10)return null;
  const change=notional*movePct/100,cost=notional*costPct/100;
  return {long:change-cost,short:-change-cost,wait:0,cost,notional,movePct,costPct};
 }
 if(typeof module==='object'&&module.exports)module.exports={valid,sourcesMatch,progress,scenario};
 if(!root.document)return;
 const doc=root.document;
 const el=(tag,cls,txt)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=String(txt);return n;};
 const fmt=(n,d=2)=>finite(n)?n.toLocaleString('tr-TR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
 const usd=n=>finite(n)?(n>0?'+':'')+fmt(n)+' USDT':'—';
 const timestamp=s=>{const d=new Date(s||'');return finite(+d)?d.toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',hour:'2-digit'}):'—'};
 const classification=n=>n<0?'pnl-loss':n>0?'pnl-profit':'';
 const add=(parent,...children)=>{parent.append(...children);return parent};
 const field=(name,value)=>add(el('div','pnl-fact'),el('small','',name),el('strong','',value));
 const tag=(name,value)=>add(el('div','pnl-stat'),el('small','',name),el('strong',classification(value),usd(value)));
 const label=x=>x.state==='PAPER_ACTIVE'?'PAPER İZLEME':x.state==='CONTROL_ACTIVE'?'RİSK / KONTROL':'KAYNAK BEKLİYOR';
 const sourceNote=(report)=>{
  const delta=Date.now()-Date.parse(report.source_at_utc||'');
  return 'Kaynak: '+timestamp(report.source_at_utc)+' · '+(!finite(delta)||delta>25*60000?'GECİKMİŞ KAYIT · ':'')+
   'OKX tabanlı sanal muhasebe. Funding ve kesin likidasyon dahil değil; borsada gerçekleşmiş kâr değildir.';
 };
 let report=null,bank=null,spark=null,manifest=null,commit='',loading=false;
 let searchText='',filter='ALL',sort='EVIDENCE',limit=30,expanded=new Set(),previousScan=null,previousClosed=null;
 function section(parent,id,title){
  if(!parent)return null;
  let p=doc.getElementById(id);
  if(!p){p=el('section','panel pnl-panel');p.id=id;p.append(el('h3','',title));parent.prepend(p);}
  return p;
 }
 function ensure(){
  return {home:section(doc.getElementById('overview'),'pnl-home','Kasa · Kısa Özet'),
   turan:section(doc.getElementById('turan'),'pnl-strategies','200 strateji · Performans ve Öğrenme')};
 }
 function clearPanel(p){if(p)while(p.children.length>1)p.lastElementChild.remove()}
 function warning(message){for(const p of Object.values(ensure()))if(p){clearPanel(p);p.append(el('p','pnl-warning',message));}}
 function renderHome(){
  const host=ensure().home;if(!host||!report)return;
  clearPanel(host);
  const k=el('div','pnl-kpis pnl-home-kpis');
  const initial=field('Sanal kasa',fmt(report.equity_usdt)+' USDT');
  const net=tag('Toplam sanal net',report.total_pnl_usdt);
  const week=tag('Son 7 gün gerçekleşen',report.daily_realized_usdt?.['7']);
  k.append(initial,net,week);
  const link=el('button','pnl-jump','TURAN: 200 stratejiyi incele ↗');link.type='button';
  link.addEventListener('click',()=>doc.querySelector('[data-tab="turan"]')?.click());
  host.append(k,add(el('div','pnl-home-foot'),el('small','','Sanal sonuçlar · '+timestamp(report.source_at_utc)),link));
 }
 function learningStats(){
  const cards=report.strategies.map(r=>({r,p:progress(r,bank)}));
  const independent=cards.reduce((v,x)=>v+x.p.closed,0);
  const holdout=cards.reduce((v,x)=>v+x.p.holdout,0);
  const withEvidence=cards.filter(x=>x.p.closed>0).length;
  const threshold=cards.filter(x=>x.p.ready).length;
  return {independent,holdout,withEvidence,threshold};
 }
 function renderOverview(p){
  const h=el('div','pnl-turan-hero');
  const primary=el('div','pnl-hero-main');
  const now=Date.parse(report.source_at_utc||'');
  primary.append(el('small','','TURAN 200 · OTOMATİK KANIT TARAMASI'),
   el('strong',classification(report.total_pnl_usdt),usd(report.total_pnl_usdt)),
   el('small','','Toplam sanal net · başlangıç '+fmt(report.starting_usdt)+' USDT → '+fmt(report.equity_usdt)+' USDT'));
  const actions=el('div','pnl-hero-actions');
  const refresh=el('button','pnl-refresh','↻ Verileri / PNL’yi yenile');refresh.type='button';
  refresh.disabled=loading;
  refresh.addEventListener('click',()=>doc.getElementById('reload')?.click());
  const funds=el('button','pnl-go','Kasa ve pozisyonlar ↗');funds.type='button';
  funds.addEventListener('click',()=>doc.querySelector('[data-tab="funds"]')?.click());
  actions.append(refresh,funds);h.append(primary,actions);p.append(h);
  const progressSummary=learningStats();
  const metrics=el('div','pnl-turan-metrics');
  const cards=[
   ['Açık sanal pozisyon',String(report.open_count)],
   ['Açılan toplam niyet',String(report.ledger_count)],
   ['Kapanan pozisyon',String(report.closed_count)],
   ['PAPER strateji',String(report.strategy_activation.paper_active)+' / 200'],
   ['Bağımsız kapanış kanıtı',String(progressSummary.independent)],
   ['OOS / ayrılmış kanıt',String(progressSummary.holdout)],
  ];
  for(const [k,v] of cards)metrics.append(field(k,v));
  p.append(metrics);
  const learn=el('div','pnl-learn-banner');
  const title=el('strong','','Öğrenme ve doğrulama durumu');
  const summary=el('p','','200 stratejiden '+progressSummary.withEvidence+
   ' tanesinde bağımsız kapanış kanıtı var. '+progressSummary.threshold+
   ' strateji eşikleri ve ayrılmış testi birlikte geçti. '+report.strategy_activation.blocked_source+
   ' stratejide zorunlu veri eksik.');
  const trace=el('p','','Her piyasa taramasında strateji koşulları ve PAPER muhasebesi yeniden değerlendirilir. Bu, otomatik model eğitimi veya garantili kâr değildir. Kaynak yoksa işlem yok.');
  learn.append(title,summary,trace);
  if(previousClosed!==null&&previousScan!==report.scan_id){
   learn.append(el('small','pnl-delta','Bu sekmenin önceki kaydına göre toplam kapanış: '+
    (report.closed_count-previousClosed>=0?'+':'')+(report.closed_count-previousClosed)));
  }
  p.append(learn,el('p','pnl-source',sourceNote(report)));
 }
 function sourceDetails(x,p){
  const registry=(bank?.registry||[]).find(s=>s.id===x.id);
  const contest=progress(x,bank);
  const detail=el('div','pnl-detail-body');
  const about=el('div','pnl-detail-intro');
  about.append(el('h4','','Strateji nasıl çalışıyor?'),
   el('p','',registry?.mechanism||'Tanımlanmış model açıklaması mevcut değil.'),
   el('small','','Aile: '+(registry?.category||'—')+' · Sürüm: '+(registry?.strategy_version||'—')));
  detail.append(about);
  const info=el('div','pnl-detail-grid');
  for(const [k,v] of [['Toplam sanal net',usd(x.realized+x.unrealized)],
   ['Gerçekleşen net',usd(x.realized)],['Açık tahmini',usd(x.unrealized)],
   ['Komisyon tahmini',fmt(x.fees)+' USDT'],['Kapanmış işlemler',String(x.closed)],
   ['Açık pozisyonlar',String(x.open)],['Kazanç / kayıp',x.won+' / '+x.lost],
   ['Ana stratejili toplam niyet',String(x.primary_ticket_count)],
   ['Diğer sinyallerde destek',String(x.supporting_matches)],
   ['Son niyet',timestamp(x.last_ticket_utc)],
   ['Değerlendirilen aday',String(registry?.evaluated_candidates??'—')],
   ['Eksik kaynak adayları',String(registry?.source_blocked_candidates??'—')]]){
   info.append(field(k,v));
  }
  detail.append(info);
  const model=el('div','pnl-learning');
  model.append(el('h4','','Öğrenme kanıtı / ilerleme'));
  function meter(name,val,total,percentage){
   const row=el('div','pnl-progress-row');
   row.append(add(el('div','pnl-progress-label'),el('span','',name),el('b','',val+' / '+total)));
   const track=el('div','pnl-progress-track'),fill=el('div','pnl-progress-fill');
   fill.style.width=Math.max(0,Math.min(100,percentage))+'%';
   track.append(fill);row.append(track);return row;
  }
  model.append(meter('Bağımsız test günü',contest.days,contest.requiredDays,contest.dayPct),
   meter('Bağımsız kapanış',contest.closed,contest.requiredClosed,contest.closePct));
  model.append(el('p','pnl-note','Ayrı test kapanışı: '+contest.holdout+
   ' · Paylaşılan destek: '+contest.shared+' · Farklı piyasa saati: '+contest.observedHours+'. Ortak sinyaller bağımsız kazanç sayılmaz.'));
  if(contest.meanPrimary!==null)model.append(el('p','pnl-note','Önceden kayıtlı bağımsız nominal getiri gözlemi: '+
   fmt(contest.meanPrimary,3)+'% · ileri test kâr garantisi değildir.'));
  model.append(el('p','pnl-note',contest.sourceBlocked?
   'Bu kural için gerekli veri tamamlanmadı. Gözlem/işlem kanıtı yoksa yeni sonuç üretilmez.':
   contest.ready?'Eşiklerin tamamı sağlanmış görünüyor; yine de yeni dönemde bağımsız doğrulama gerekiyor.':
   'Kanıt birikimi sürüyor. Yetersiz örneklem nedeniyle kârlı strateji onayı verilmez.'));
  detail.append(model);
  const conditions=el('details','pnl-conditions');
  conditions.append(el('summary','','Koşullar, kaynaklar ve model kimliği'));
  conditions.append(el('p','','Koşullar: '+(registry?.conditions||[]).map(c=>Array.isArray(c)?c.join(' '):String(c)).join(' · ')),
   el('p','','Gerekli kaynak: '+(registry?.required_source||x.required_source||'BELİRSİZ')),
   el('p','','Konfigürasyon: '+(registry?.strategy_config_hash||'—')));
  detail.append(conditions);
  const recent=(spark?.recent_tickets||[]).filter(t=>t?.turan_strategy_id===x.id&&
   t?.strategy_id===x.id&&t?.attribution_kind==='EXACT_TURAN_RULE_AT_BIRTH');
  if(recent.length){
   const events=el('details','pnl-conditions');
   events.append(el('summary','','Son işlem kayıtları · '+recent.length+' görünür örnek'));
   for(const t of recent.slice(0,8)){
    const net=(finite(t.realized_net_usdt)?t.realized_net_usdt:0)+
     (t.status==='OPEN'&&finite(t.unrealized_net_usdt)?t.unrealized_net_usdt:0);
    events.append(add(el('div','pnl-recent-row'),el('span','',t.symbol+' · '+t.side+' · '+t.status+
     ' · '+timestamp(t.closed_at_utc||t.filled_at_utc||t.signal_at_utc)),
     el('strong',classification(net),usd(net))));
   }
   events.append(el('p','pnl-note','Son bilet listesi bir örnek penceresidir; tam kasa PNL hesabı arşivdeki tüm biletlere dayanır.'));
   detail.append(events);
  }
  const signals=(bank?.signals||[]).filter(s=>Array.isArray(s.strategy_ids)&&s.strategy_ids.includes(x.id)||
   s.strategy_id===x.id).slice(0,6);
  const events=el('div','pnl-signal-list');
  events.append(el('h4','','Son taramada strateji eşleşmeleri'));
  if(!signals.length)events.append(el('p','pnl-note','Son taramada koşul oluşmadı. Bu, stratejinin silindiği veya kâr ürettiği anlamına gelmez.'));
  for(const s of signals){
   const row=el('div','pnl-signal-row');
   row.append(el('span','',s.symbol+' · '+s.side+' · '+(s.paper_stage_name||'GÖZLEM')+
    ' · '+(s.strategy_id===x.id?'ana kural':'destekleyen kural')));
   const go=el('button','pnl-open-chart','Grafik ↗');go.type='button';
   go.addEventListener('click',()=>{doc.querySelector('[data-tab="chart"]')?.click();
    doc.dispatchEvent(new CustomEvent('uzayx:open-chart',{detail:{symbol:s.symbol}}));});
   row.append(go);events.append(row);
  }
  detail.append(events);
  const lab=el('div','pnl-inverse');
  lab.append(el('h4','','Ters psikoloji · senaryo laboratuvarı'),
   el('p','pnl-note','Düşen stratejiler için ters yönü sınayabilirsin. Seçtiğin fiyat hareketi varsayımsaldır; geçmişte gerçekleşen ters işlem, emir dolumu veya backtest PNL’si değildir.'));
  const controls=el('div','pnl-inverse-controls');
  const moveLabel=el('label','','Varsayılan fiyat hareketi (%)');
  const move=el('input','');move.type='range';move.min='-5';move.max='5';move.step='.25';move.value='-1';
  const moveText=el('output','pnl-move-value','−1,00%');
  moveLabel.append(move,moveText);controls.append(moveLabel);
  const reference=signals.find(s=>finite(s.modeled_roundtrip_cost_pct))||null;
  const c=finite(reference?.modeled_roundtrip_cost_pct)?reference.modeled_roundtrip_cost_pct:.2;
  const nominal=Number(bank?.strategy_contest?.simulation_notional_usdt)||300;
  const outputs=el('div','pnl-inverse-results');
  function recalc(){
   const result=scenario(Number(move.value),nominal,c);
   moveText.textContent=(Number(move.value)>0?'+':'')+fmt(Number(move.value),2)+'%';
   outputs.replaceChildren();
   if(result)for(const [name,value] of [['LONG varsayımı',result.long],['SHORT / ters varsayım',result.short],['BEKLE / işlem yok',result.wait]])
    outputs.append(tag(name,value));
  }
  move.addEventListener('input',recalc);recalc();
  lab.append(controls,outputs,el('p','pnl-note','Hesap: '+fmt(nominal)+' USDT nominal × seçilen fiyat hareketi − yaklaşık '+
   fmt(c,3)+'% çift yön işlem maliyeti. Funding, kayma değişkenliği, tasfiye ve gerçek dolum dahil değildir. Bu tutarlar kasaya yazılmaz.'));
  detail.append(lab);
  return detail;
 }
 function makeCard(x){
  const box=el('details','pnl-strategy-card');box.dataset.strategy=x.id;
  box.open=expanded.has(x.id);
  const head=el('summary','pnl-strategy-summary');
  const id=el('div','pnl-strategy-title');
  id.append(el('strong','',x.id+' · '+x.name),el('span','pnl-state',label(x)));
  const stats=el('div','pnl-strategy-numbers'),net=x.realized+x.unrealized;
  stats.append(el('strong',classification(net),x.primary_ticket_count>0?usd(net):'PNL kaydı yok'),
   el('small','',x.closed+' kapanmış · '+x.open+' açık · '+progress(x,bank).days+' bağımsız gün'));
  head.append(id,stats);box.append(head,sourceDetails(x));box.addEventListener('toggle',()=>{
   if(box.open)expanded.add(x.id);else expanded.delete(x.id);
  });return box;
 }
 function renderList(){
  const host=doc.getElementById('pnl-strategy-list');if(!host||!report||!bank)return;
  const text=searchText.toLocaleLowerCase('tr-TR').trim();
  const rows=report.strategies.filter(x=>{
   const r=(bank.registry||[]).find(s=>s.id===x.id);
   return (filter==='ALL'||filter==='HAS_PNL'&&x.closed>0||
     filter==='OPEN'&&x.open>0||filter==='NEGATIVE'&&x.closed>0&&x.realized+x.unrealized<0||
     filter==='PAPER_ACTIVE'&&x.state==='PAPER_ACTIVE'||
     filter==='RESEARCH_SOURCE_BLOCKED'&&x.state==='RESEARCH_SOURCE_BLOCKED'||
     filter==='CONTROL_ACTIVE'&&x.state==='CONTROL_ACTIVE')&&
    (!text||[x.id,x.name,r?.mechanism,r?.category].join(' ').toLocaleLowerCase('tr-TR').includes(text));
  });
  rows.sort((a,b)=>{
   if(sort==='ID')return a.id.localeCompare(b.id);
   if(sort==='NET')return (b.realized+b.unrealized)-(a.realized+a.unrealized)||a.id.localeCompare(b.id);
   if(sort==='RISK')return (a.realized+a.unrealized)-(b.realized+b.unrealized)||a.id.localeCompare(b.id);
   if(sort==='CLOSED')return b.closed-a.closed||a.id.localeCompare(b.id);
   const ap=progress(a,bank),bp=progress(b,bank);
   return bp.closed-ap.closed||bp.days-ap.days||b.closed-a.closed||a.id.localeCompare(b.id);
  });
  host.replaceChildren(el('p','pnl-result-count',rows.length+' / 200 strateji · '+Math.min(limit,rows.length)+' gösteriliyor'));
  for(const x of rows.slice(0,limit))host.append(makeCard(x));
  const more=doc.getElementById('pnl-more');
  if(more){more.hidden=rows.length<=limit;more.textContent='Daha fazla strateji göster ('+(rows.length-limit)+')';}
 }
 function renderTuran(){
  const host=ensure().turan;if(!host||!report)return;clearPanel(host);
  if(!sourcesMatch(report,manifest,bank,spark)){host.append(el('p','pnl-warning','TURAN_SOURCE_MISMATCH · Strateji, kasa veya tarama kaynağı uyumsuz. Başarı verisi gösterilmiyor.'));return;}
  renderOverview(host);
  const search=el('input','pnl-search');search.type='search';search.placeholder='Strateji, kural, kategori veya T033 ara';
  search.setAttribute('aria-label','200 stratejide ara');search.value=searchText;
  search.addEventListener('input',()=>{searchText=search.value;limit=30;renderList()});
  const choice=el('select','pnl-select');choice.setAttribute('aria-label','Strateji durumu');
  for(const [code,text] of [['ALL','200 stratejinin tamamı'],['HAS_PNL','Kapanış kaydı olanlar'],
    ['OPEN','Açık pozisyonu olan'],['NEGATIVE','Zararda · ters yön araştır'],
    ['PAPER_ACTIVE','PAPER izleme'],['RESEARCH_SOURCE_BLOCKED','Veri bekleyen'],
    ['CONTROL_ACTIVE','Risk / kontrol']]){
   const opt=el('option','',text);opt.value=code;choice.append(opt);
  }
  choice.value=filter;choice.addEventListener('change',()=>{filter=choice.value;limit=30;renderList()});
  const sortBy=el('select','pnl-select');sortBy.setAttribute('aria-label','Stratejileri sırala');
  for(const [value,name] of [['EVIDENCE','Kanıtı en çok olan'],['NET','Yüksek net PNL'],['RISK','En çok kaybeden'],['CLOSED','En çok kapanan'],['ID','Strateji koduna göre']]){
   const opt=el('option','',name);opt.value=value;sortBy.append(opt);
  }
  sortBy.value=sort;sortBy.addEventListener('change',()=>{sort=sortBy.value;renderList()});
  const controls=el('div','pnl-controls');controls.append(search,choice,sortBy);
  const help=el('details','pnl-help');help.append(el('summary','','Bu sayfayı nasıl kullanırım?'));
  help.append(el('p','','Stratejiye dokun: kuralını, geçmiş PAPER PNL’sini, bağımsız örneklerini ve son coin eşleşmelerini aç. Grafik düğmesi fiyat ekranına gider. Negatif stratejiyi seçip ters yönü ayrı senaryo olarak incele. Yenile, GitHub’daki son doğrulanmış taramayı tekrar okur; yeni piyasa taraması doğrudan çalıştırılmaz.'));
  const list=el('div','pnl-card-list');list.id='pnl-strategy-list';
  const more=el('button','pnl-more','Daha fazla göster');more.id='pnl-more';more.type='button';more.addEventListener('click',()=>{limit+=30;renderList()});
  host.append(controls,help,list,more);
  renderList();
 }
 function render(){if(!report)return;if(!sourcesMatch(report,manifest,bank,spark)){warning('Kaynak uyumu doğrulanamadı. Eski PNL güncelmiş gibi gösterilmiyor.');return;}renderHome();renderTuran();}
 async function receive(event){
  const info=event.detail||{},sha=info.sourceCommit,m=info.db?.manifest,b=info.db?.strategyBank,s=info.db?.spark;
  manifest=m;bank=b;spark=s;
  if(!/^[a-f0-9]{40}$/.test(sha||'')||!m?.publication_valid||!b||!s){warning('Kaynak kontrol edilemiyor. Yeni tarama bekleniyor.');return;}
  if(commit===sha&&report){render();return;}
  if(loading)return;loading=true;
  try{
   const response=await fetch('https://raw.githubusercontent.com/onurqlp/coin-live-pro/'+sha+'/web/data/uzayx-pnl-report.json',{cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const payload=await response.json();
   if(!sourcesMatch(payload,m,b,s))throw Error('SOURCE_SCAN_MISMATCH');
   if(report){previousScan=report.scan_id;previousClosed=report.closed_count;}
   report=payload;commit=sha;render();
  }catch(err){report=null;commit='';warning('PNL_DATA_UNAVAILABLE · '+String(err.message||err)+' · Geçersiz para sonucu gösterilmiyor.');}
  finally{loading=false;}
 }
 root.addEventListener('uzayx:loaded',receive);root.addEventListener('uzayx:source-check',receive);
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',ensure,{once:true});else ensure();
})(typeof globalThis!=='undefined'?globalThis:this);
