'use strict';
/* UzayX Read-Only Terminal v1: no exchange order methods, no generated prices. */
(() => {
  const $ = id => document.getElementById(id);
  // Pin data to one immutable GitHub commit; Pages content may be stale when data commits use [skip ci].
  const OWNER_REPO='onurqlp/coin-live-pro';
  let sourceCommit=null,sourceError=null;
  async function currentHead() {
    const r=await fetch('https://api.github.com/repos/'+OWNER_REPO+'/commits/main',{cache:'no-store'});
    if(!r.ok)throw Error('HEAD_HTTP_'+r.status);
    const payload=await r.json();if(!/^[a-f0-9]{40}$/.test(payload?.sha||''))throw Error('INVALID_HEAD_SHA');
    return payload.sha;
  }
  function dataUrl(filename) {
    const root=sourceCommit
      ? 'https://raw.githubusercontent.com/'+OWNER_REPO+'/'+sourceCommit+'/web/data/'
      : 'https://raw.githubusercontent.com/'+OWNER_REPO+'/main/web/data/';
    return root+filename+(sourceCommit?'':'?ts='+Date.now());
  }
  const FILES = {
    manifest: 'v4-manifest.json', health: 'health.json', radar: 'v4-radar.json',
    paper: 'v4-paper.json', spark: 'v4-spark-paper.json',
    review: 'v4-spark-review.json', ops: 'ops-report.json', diary: 'uzayx-lessons-history.json'
  };
  const MAKINE = 'https://raw.githubusercontent.com/onurqlp/makine-core/main/site/data/support.json';
  let db = {}, faults = [], mode = 'ALL', stage = 'ALL', search = '';
  const num = (v, digits=2) => Number.isFinite(Number(v)) && v!==null && v!=='' ? Number(v).toLocaleString('tr-TR',{minimumFractionDigits:digits,maximumFractionDigits:digits}) : '—';
  const usd = (v,d=2) => v===null||v===undefined||!Number.isFinite(Number(v)) ? '—' : num(v,d)+' USDT';
  const str = v => v===null||v===undefined?'—':String(v);
  const el = (tag,cl,content) => {const n=document.createElement(tag);if(cl)n.className=cl;if(content!==undefined)n.textContent=String(content);return n;};
  const clear = node => {node.replaceChildren();return node;};
  const set = (id,v) => {const n=$(id);if(n)n.textContent=v;};
  const time = s => {const d=new Date(s||'');return Number.isFinite(+d)?d.toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';};
  const age = s => {const t=Date.parse(s||'');return Number.isFinite(t)?Math.round((Date.now()-t)/60000):null;};
  const ageLabel=s=>{const n=age(s);return n===null?'Bilinmiyor':n<0?'Saat farkı':n<2?'Şimdi':n<60?n+' dk':Math.floor(n/60)+' sa';};
  function go(tab) {
    document.querySelectorAll('.tab').forEach(b=>{const on=b.dataset.tab===tab;b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    document.querySelectorAll('.workspace').forEach(p=>p.classList.toggle('active',p.id===tab));
    if(location.hash!=='#'+tab)history.replaceState(null,'','#'+tab);
    window.scrollTo({top:document.querySelector('.tabs').getBoundingClientRect().top+scrollY-8,behavior:'auto'});
  }
  function row(title,value){const n=el('div','system-row');n.append(el('span','',title),el('b','',value));return n;}
  function readableStage(code) {
    return ({WATCH:'İzle',MOTION:'Hareket gözlemi',SPOTLIGHT:'Öne çıkan',ARCHIVED:'Geçmiş'})[code] || 'İzleniyor';
  }
  const strategyLabels={TREND_BREAKOUT:'Trend kırılması',VOLUME_EXPANSION:'Hacim artışı',BREAKOUT_RETEST:'Kırılım sonrası test',REVERSAL_SETUP:'Yön değişimi',VOLATILITY_SQUEEZE:'Sıkışma',OI_FUNDING_PRESSURE:'Vadeli piyasa baskısı',SHORT_BREAKDOWN:'Düşüş kırılması'};
  function candidateCard(p) {
    const n=el('article','coin-card'), head=el('div','coin-title');
    const isEligible=p.paper_entry_state==='ELIGIBLE'||p.paper_entry_state==='ENTRY_ELIGIBLE';
    const badge=el('span','readiness '+(isEligible?'readiness-ready':'readiness-wait'),isEligible?'Araştırma koşulları oluştu':'Giriş teyidi yok');
    head.append(el('strong','',str(p.symbol)),el('span','side '+(p.side==='SHORT'?'short':''),str(p.side)),badge);
    n.append(head);
    const status=el('p','coin-reason',readableStage(p.lifecycle_stage)+' · '+str(strategyLabels[p.strategy_id]||'Fiyat hareketi')+' · '+(p.confirmation_state==='WAIT_4H_CLOSE'?'4 saatlik kapanış bekleniyor':'Teyit bekleniyor'));
    n.append(status);
    const meta=el('div','coin-main');
    [['Piyasa fiyatı (OKX)',num(p.price,6)],['Stop seviyesi (senaryo)',num(p.stop,6)]].forEach(([a,b])=>{
      let cell=el('div');cell.append(el('small','',a),el('b','',b));meta.append(cell);
    });
    n.append(meta);
    const details=el('details','coin-more');const summary=el('summary','','Hedefler ve ayrıntılar');
    details.append(summary);
    const targets=Array.isArray(p.targets)?p.targets.slice(0,3).map((v,i)=>'Hedef '+(i+1)+': '+num(v,6)).join(' · '):'Hedef belirtilmemiş';
    details.append(el('p','',targets));
    details.append(el('p','', 'Araştırma puanı: '+num(p.score,0)+' · Bu bir kazanma olasılığı değildir.'));
    n.append(details);
    const actions=el('div','coin-actions');
    const symbol=String(p.symbol||'').toUpperCase();
    if(/^[A-Z0-9]{3,24}$/.test(symbol)){
      const copy=el('button','secondary tiny-action','Pariteyi kopyala');
      copy.type='button';
      copy.addEventListener('click',async()=>{
        try{
          if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
          await navigator.clipboard.writeText(symbol);
          copy.textContent='Kopyalandı ✓';
        }catch{copy.textContent='Parite: '+symbol;}
      });
      actions.append(copy);
    }
    const binance=el('a','binance-link','Binance Futures ↗');
    binance.href='https://www.binance.com/en/futures/home';binance.target='_blank';binance.rel='noopener noreferrer';
    binance.title='Binance Futures üzerinde pariteyi ve fiyatı ayrıca kontrol edin; otomatik emir verilmez';
    actions.append(binance);
    n.append(actions);
    return n;
  }
  const candidates=()=>[].concat(db.radar?.spotlight||[],db.radar?.motion||[],db.radar?.watch||[]);
  function renderTop() {
    const a=clear($('top-candidates')),radar=db.radar||{},manifest=db.manifest||{},review=db.review||{};
    const c=candidates().sort((x,y)=>(Number(y.score)||0)-(Number(x.score)||0));
    if(!c.length)a.append(el('div','empty','Şu an listelenecek parite yok.'));
    else c.slice(0,4).forEach(x=>a.append(candidateCard(x)));
    set('m-pairs',num(manifest.candidate_counts?.market_pairs,0));
    set('m-watch',num(radar.counts?.watch,0));
    const ready=c.filter(p=>p.paper_entry_state==='ELIGIBLE'||p.paper_entry_state==='ENTRY_ELIGIBLE').length;
    set('m-ready',num(ready,0));
    set('m-age',ageLabel(manifest.finished_at_utc));
    set('snapshot-time','Son tarama: '+time(manifest.finished_at_utc));
    set('radar-age','Veri: '+ageLabel(manifest.finished_at_utc));
    const area=clear($('stage-grid'));
    [['Gözlem',radar.counts?.spotlight],['Hareket',radar.counts?.motion],['Takip',radar.counts?.watch]].forEach(([name,qty])=>{
      const x=el('div');x.append(el('small','',name),el('b','',num(qty,0)));area.append(x);
    });
    const fresh=age(manifest.finished_at_utc);
    const valid=manifest.publication_valid===true&&!faults.includes('SCAN_ID_MISMATCH')&&sourceCommit!==null;
    const dataGood=valid&&fresh!==null&&fresh>=0&&fresh<=25&&!!db.radar;
    const healthOk=db.health?.status==='OK';
    set('overall-status',!dataGood?'VERİ UYARISI':healthOk?'GÜNCEL':'TARAMA UYARISI');
    $('overall-status').className='chip '+(dataGood&&healthOk?'':'amber');
    set('decision',!dataGood?'Önce veriyi kontrol et':ready?'Koşulları kontrol edilecek parite var':'Şu an giriş teyidi yok');
    set('decision-detail',!dataGood
      ?'Veri eksik, zaman aşımına uğramış veya farklı taramalardan geliyor. Bu ekrana bakarak işlem açmayın.'
      :ready?'Bu bir işlem emri değildir. Binance sözleşmesini, anlık fiyatı ve riski kendiniz doğrulayın.'
      :healthOk?'Takip listesi mevcut ama giriş koşullarını sağlayan parite yok. Şimdilik izlemeye devam edin.'
      :'Takip listesi mevcut; ancak otomatik tarama takviminde aksama algılandı. Emir öncesinde yeni tarama teyidi bekleyin.');
    const c0=review.cohorts?.['TÜMÜ'];
    if(c0){
      set('today-learn',usd(c0.realized_total_usdt));
      set('learn-desc',num(c0.closed,0)+' kapanan sanal denemenin toplam kohort sonucu. Ana kasa bakiyesi değildir.');
    }else{
      set('today-learn','—');
      set('learn-desc','Kapanan işlem raporu henüz doğrulanmadı.');
    }
  }
  function renderRadar() {
    const list=clear($('radar-list'));let all=candidates();
    const wanted=all.filter(p=>(mode==='ALL'||p.side===mode) &&
      (stage==='ALL'||p.lifecycle_stage===stage) &&
      (!search||String(p.symbol||'').toUpperCase().includes(search)||String(p.strategy_id||'').toUpperCase().includes(search)));
    wanted.sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0)).slice(0,40).forEach(p=>list.append(candidateCard(p)));
    if(!wanted.length)list.append(el('div','empty','Bu filtrede onaylı gözlem yok. Filtreleri değiştirebilirsin.'));
    set('radar-count',wanted.length+' aday listelendi · ilk 40 kayıt gösteriliyor · gerçek emir yok');
  }
  function renderLearn(){
    const r=db.review||{},c=r.cohorts||{},all=c['TÜMÜ'];
    set('learn-net',all?usd(all.realized_total_usdt):'—');
    set('learn-rate',all?.closed?num(all.positive/all.closed*100,1)+'%':'—');
    const records=db.diary?.records;
    set('learn-trend',Array.isArray(records)&&records.length
      ? 'Günlük arşiv: '+records.length+' ayrı UTC günü · son kayıt: '+str(records.at(-1)?.day_utc)+' · yöntemler arka planda karşılaştırılıyor.'
      : 'Günlük kayıt arşivi hazır; yeni rapor bekleniyor.');
    const lessonBox=clear($('lessons'));
    const lessons=window.UzayXLessonEngine?.analyze(db.review,db.spark);
    if(!lessons?.hypotheses?.length)lessonBox.append(el('div','','Yeterli incelenebilir geçmiş yok. Yeni kapanışlar bekleniyor.'));
    else lessons.hypotheses.slice(0,5).forEach(h=>{
      const item=el('div');
      item.append(el('b','',h.id.replaceAll('_',' ')+' · '+num(h.closed,0)+' kapanış · '+usd(h.mean,4)+' / işlem'));
      item.append(el('small','',h.originalState==='NEGATIVE_OBSERVED'
        ? 'Özgün kuralda negatif gözlem. Ters strateji ve işlem yapmama alternatifleri bağımsız test gerektiriyor.'
        : 'Özgün kuralda kârlılık kanıtı yok; yeni dönem verisinde yeniden karşılaştırılacak.'));
      lessonBox.append(item);
    });
    const keys=['TÜMÜ','GELDI_OTOMATIK_GIRIS','LONG','SHORT','AŞAMA_1','AŞAMA_2','AŞAMA_3','RSI_4H_50_70','RSI_4H_30_50','BB_4H_SIKIŞMA'];
    const grid=clear($('cohort-table'));
    if(!all){grid.append(el('p','muted','Kohort raporu okunamadı. Öğrenme sonucu gösterilmiyor.'));return;}
    const header=el('div','cohort');
    header.append(el('b','','Grup'),el('b','','Kapanan'),el('b','','Pozitif pay'),el('b','value','Net PnL'));
    grid.append(header);
    keys.forEach(k=>{const x=c[k];if(!x)return;const n=el('div','cohort');
      const title=el('div','name',k.replaceAll('_',' '));title.append(el('small','','Ek inceleme sürüyor'));
      const amount=el('span','value',num(x.closed,0));
      const rate=el('div','rate');const r=x.closed?100*(x.positive||0)/x.closed:0;
      rate.append(el('span','',x.closed?num(r,1)+'%':'—'));
      const meter=el('div','meter');const fill=el('span');fill.style.width=Math.max(0,Math.min(100,r))+'%';meter.append(fill);rate.append(meter);
      n.append(title,amount,rate,el('span','value '+(Number(x.realized_total_usdt)<0?'negative':'positive'),usd(x.realized_total_usdt)));
      grid.append(n);
    });
  }
  function renderFunds() {
    const p=db.paper||{},s=db.spark||{},c=s.summary||{};
    set('strict-balance',usd(p.equity_usdt));
    set('strict-info','Başlangıç '+usd(p.starting_balance_usdt)+' · Gerçekleşen '+usd(p.realized_pnl_usdt)+' · Açık işlem '+num(p.open_positions?.length,0)+' · Fonlama '+str(p.funding_state));
    set('spark-balance',usd(c.virtual_equity_usdt));
    set('spark-info',num(c.counts?.CLOSED,0)+' kapanan · '+num(c.counts?.OPEN,0)+' açık · Realize '+usd(c.realized_net_usdt)+' · Henüz tahmini fiyatlama');
  }
  function renderLeverage() {
    const lev=Number($('leverage').value),capital=100,notional=capital*lev,roundTrip=2*(0.0006+0.0003)*notional;
    set('levlabel',lev+'x');set('lev-win','+'+usd(notional*0.01-roundTrip));
    set('lev-loss',usd(-notional*0.01-roundTrip));
  }
  function renderResearch() {
    const modules=db.support?.modules||[];
    set('research-time','Kaynak: '+time(db.support?.generated_at_utc));
    const grid=clear($('module-grid'));
    if(!modules.length){grid.append(el('div','empty','MAKİNE destek verisi ulaşılamıyor; modüller doğrulanmadan değerlendirme yapılmaz.'));return;}
    modules.forEach(m=>{
      const card=el('article','module');card.append(el('span','id',str(m.id)),el('h3','',str(m.name||m.title)));
      const state=str(m.state||m.strategy_state);
      card.append(el('span','chip '+(state==='OBSERVING'?'':'amber'),state),el('p','',str(m.blocker||m.purpose||'Kaynak denetleniyor')));
      grid.append(card);
    });
    set('module-source','Kaynak: makine-core / site/data/support.json · '+str(db.support?.state)+' · yeni emir yok');
  }
  function renderSystem(){
    const n=clear($('system-rows'));const m=db.manifest||{},h=db.health||{},p=db.paper||{};
    [['Ürün kimliği','UzayX · Piyasa Terminali'],
     ['Kaynak taraması',str(m.scan_id)],
     ['Kaynak commit',sourceCommit||'Doğrulanamadı; en güncel RAW kullanıldı'],
     ['Commit doğrulaması',sourceError?'Sınırlı: '+sourceError:'Sabit commit üzerinden okundu'],
     ['Piyasa kaynağı',str(m.provider)],
     ['Tarama tamamlanma (TR)',time(m.finished_at_utc)],
     ['Son sağlık kontrolü (TR)',time(h.updated_at)],
     ['Sağlık raporu',str(h.status)],
     ['Veri doğrulaması',num(m.candidate_counts?.verified,0)+' / '+num(m.candidate_counts?.attempted,0)],
     ['Son tetikleyici',str(m.trigger)],
     ['Zamanlama kanıtı',num(h.observed_real_scheduled_runs,0)+' gözlenen scheduled run'],
     ['Sanal kasa fonlama',str(p.funding_state)],
     ['Araştırma sürümü',str(db.review?.model_version)],
     ['Araştırma modülü',str(db.support?.state||'ULAŞILAMIYOR')],
     ['Gerçek emir',m.no_real_orders===true?'KAPALI':'DOĞRULANAMADI'],
     ['Başarısız kaynak',faults.length?faults.join(', '):'Yok']].forEach(([a,b])=>n.append(row(a,b)));
  }
  async function getJson(path){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{const r=await fetch(path,{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(timer);}
  }
  async function reload(){
    $('reload').disabled=true;set('connection','Yükleniyor…');$('connection').className='status';faults=[];
    try{sourceCommit=await currentHead();sourceError=null;}catch(e){sourceCommit=null;sourceError=String(e.message||e);faults.push('commit pin');}
    const entries=[...Object.entries(FILES).map(([key,fn])=>[key,dataUrl(fn)]),['support',MAKINE+'?ts='+Date.now()]];
    const results=await Promise.allSettled(entries.map(([,url])=>getJson(url)));
    const updated={};
    results.forEach((r,i)=>{const key=entries[i][0];if(r.status==='fulfilled')updated[key]=r.value;else{faults.push(key);updated[key]=null;}});
    db=updated;
    const stamp=age(db.manifest?.finished_at_utc);
    const id=db.manifest?.scan_id;
    const feeds=[db.radar,db.paper,db.spark,db.review];
    if(!id || feeds.some(f=>!f || f.scan_id!==id)){faults.push('SCAN_ID_MISMATCH');db.radar=null;}
    const healthy=db.manifest?.publication_valid===true && db.health?.status==='OK' && sourceCommit!==null && !faults.includes('SCAN_ID_MISMATCH') && stamp!==null && stamp>=0 && stamp<=25;
    set('connection',healthy?'Veri güncel':stamp===null?'Kaynak eksik':stamp>25?'Veri gecikmiş':'Kontrol gerekli');
    $('connection').className='status '+(healthy?'ok':'bad');
    renderTop();renderRadar();renderLearn();renderFunds();renderResearch();renderSystem();renderLeverage();
    $('reload').disabled=false;
  }
  document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.goto)));
  document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>go(b.dataset.tab)));
  $('reload').addEventListener('click',reload);
  $('search').addEventListener('input',e=>{search=e.target.value.trim().toUpperCase();renderRadar();});
  $('direction').addEventListener('change',e=>{mode=e.target.value;renderRadar();});
  $('stage').addEventListener('change',e=>{stage=e.target.value;renderRadar();});
  $('leverage').addEventListener('input',renderLeverage);
  if(['overview','radar','learn','funds','research','system'].includes(location.hash.slice(1)))go(location.hash.slice(1));
  reload();
  // Never pretend this is streaming; refresh from verified GitHub sources every 5 minutes.
  setInterval(()=>{if(!document.hidden&&!$('reload').disabled)reload();},300000);
})();