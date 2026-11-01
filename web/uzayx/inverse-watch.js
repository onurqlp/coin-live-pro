/* TURAN reverse SHADOW board: read-only frozen selection and forward paired replay.
   NO trading; never turn a losing original into a guaranteed profitable inverse. */
(() => {
  'use strict';
  const ROOT = 'https://raw.githubusercontent.com/onurqlp/coin-live-pro/';
  const $ = id => document.getElementById(id);
  const main = $('inverse-watch-home');
  const full = $('inverse-watch-board');
  if (!main && !full) return;
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const fmt = (v, digits=2) => finite(v) ?
    v.toLocaleString('tr-TR',{minimumFractionDigits:digits,maximumFractionDigits:digits}) : '—';
  const usd = v => finite(v) ? (v>0?'+':'')+fmt(v)+' USDT' : '—';
  const clock = v => { const n=Date.parse(v||'');return Number.isFinite(n)?
    new Date(n).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—'; };
  const node = (tag,cls,text) => {
    const p=document.createElement(tag);
    if(cls)p.className=cls;
    if(text!==undefined)p.textContent=String(text);
    return p;
  };
  let previousSha='',busy=false,lastReport=null,lastManifest=null;
  function notice(parent,text){
    parent.replaceChildren(node('p','ix-note',text));
  }
  function field(label,value,kind){
    const el=node('div','ix-field'),small=node('small','',label),strong=node('strong',kind||'',value);
    el.append(small,strong);return el;
  }
  function card(item,compact=false){
    const entry=node('article','ix-item');
    const header=node('div','ix-header');
    const title=node('div','ix-name');
    title.append(node('strong','',item.strategy_id+' · '+item.name),
      node('small','',item.forward.state==='RULE_CHANGED_REVIEW_ONLY'?
        'Kural sürümü değişti · yalnız arşiv':'TERS YÖN / DONDURULMUŞ ADAY'));
    const mode=node('span','ix-state',item.forward.state==='FORWARD_MODEL_EDGE_OBSERVED'?
      'İleri model lehine':item.forward.state==='FORWARD_MODEL_EDGE_NOT_ESTABLISHED'?
      'İleri üstünlük yok':item.forward.state==='RULE_CHANGED_REVIEW_ONLY'?
      'Kural değişti':'İleri kanıt bekleniyor');
    header.append(title,mode);
    const b=item.selection_baseline||{},f=item.forward||{};
    const facts=node('div','ix-pairs');
    const historical=node('div','ix-period');
    historical.append(node('small','ix-period-label','SEÇİM ÖNCESİ · MODEL (IN-SAMPLE)'));
    historical.append(field('Orijinal',usd(b.original_modeled_usdt),
      b.original_modeled_usdt<0?'ix-loss':''),field('Ters yön',usd(b.inverse_modeled_usdt),
      b.inverse_modeled_usdt>0?'ix-gain':''),node('small','ix-desc',fmt(b.paired_count,0)+' eşleşme · '+fmt(b.market_days,0)+' piyasa günü'));
    const future=node('div','ix-period');
    future.append(node('small','ix-period-label','SEÇİMDEN SONRA · BAĞIMSIZ ZAMAN DÖNEMİ'));
    future.append(field('Orijinal',f.paired_count>0?usd(f.original_modeled_usdt):'Henüz kapanış yok',
      f.paired_count>0&&f.original_modeled_usdt<0?'ix-loss':''),
      field('Ters yön',f.paired_count>0?usd(f.inverse_modeled_usdt):'Henüz kapanış yok',
      f.paired_count>0&&f.inverse_modeled_usdt>0?'ix-gain':''),
      node('small','ix-desc',fmt(f.paired_count,0)+' kapalı çift · '+fmt(f.market_days,0)+' gün · '+fmt(f.episode_clusters,0)+' olay kümesi'));
    facts.append(historical,future);entry.append(header,facts);
    if(!compact){
      const proof=node('div','ix-evidence');
      proof.append(field('Seçimde bağımsız kapanış',fmt(b.independent_primary_closed,0)),
        field('Bağımsız gün',fmt(b.independent_days,0)),
        field('İleri çift bekleyen / engelli',fmt(f.pending_or_blocked_count,0)),
        field('Son eşleşme',f.last_decision_at_utc?
          (f.last_original_side+' → '+f.last_inverse_side+' · '+clock(f.last_decision_at_utc)):'Henüz yeni sinyal yok'));
      entry.append(proof,node('p','ix-note',
        'Geçmiş karşılaştırma seçim verisiyle yapılmıştır. İleri test ayrı tarih aralığıdır. Funding/likidasyon belirsiz; model tutarları gerçek kâr veya birleşik kasa değildir.'));
    }
    return entry;
  }
  function render(report,manifest){
    const issued=Date.parse(manifest.finished_at_utc||'');
    const fresh=Number.isFinite(issued)&&Date.now()>=issued-120000&&Date.now()-issued<=25*60000;
    const items=report.items||[];
    const complete=items.length===6&&new Set(items.map(x=>x.strategy_id)).size===6;
    if(!complete||report.schema!=='turan.inverse.watch.v1'||report.no_real_orders!==true||
       report.paper_only!==true||report.auto_promote!==false||
       report.changes_shared_cash!==false||report.selection_is_frozen!==true||
       report.forward_only_after_cutoff!==true||
       report.source_scan_id!==manifest.scan_id||manifest.publication_valid!==true ||
       manifest.no_real_orders!==true){
      throw Error('TERS_YON_SOURCE_MISMATCH');
    }
    for(const host of [main,full]){
      if(!host)continue;
      host.replaceChildren();
      const heading=node('div','ix-intro');
      const label=node('small','ix-kicker','TURAN · 1 KASIM TERS YÖN DENEYİ');
      const h=node('h3','',host===main?'6 strateji ters yönde izleniyor':'Ters Yön · Altı Sabit Aday');
      const desc=node('p','', 'Yeterli sayıda olumsuz orijinal ve olumlu ters deney gösteren 6 strateji, seçildikleri tarihten itibaren ayrı izleniyor. Eski zarar otomatik kazanç yapılmadı.');
      const time=node('small','ix-time',
        'Seçim: '+clock(report.selection_asof_utc)+' TSİ · Son tarama: '+clock(manifest.finished_at_utc)+' TSİ'+
        (fresh?' · güncel veri':' · ARŞİV / VERİ GECİKMİŞ'));
      heading.append(label,h,desc,time);
      host.append(heading);
      const grid=node('div', 'ix-grid'+(host===main?' ix-mini':''));
      for(const item of items)grid.append(card(item,host===main));
      host.append(grid);
      if(host===main){
        const a=node('a','ix-link','Orijinal / ters ayrıntılı tabloyu aç ↗');
        a.href='./turan/#inverse';host.append(a);
      }else{
        host.append(node('p','ix-foot','Ölçüm: aynı experiment_id, aynı kural sürümü, kapanmış sonraki 5 dakikalık mumlarda ayrı yürütülen ORIGINAL / INVERSE simülasyonu. Seçim geçmişe dayalı, ileri test seçim kesitinden sonradır. Fonlama ve likidasyon belirsizdir; sonuçlar bağımsız portföy hesabı değildir. Gerçek emir, otomatik strateji terfisi veya kasa değişikliği yoktur.'));
        const refresh=node('button','ix-reload','↻ Yeni veriyi denetle');
        refresh.type='button';refresh.addEventListener('click',()=>loadStandalone(true));host.append(refresh);
      }
    }
    lastReport=report;lastManifest=manifest;
  }
  async function fetchJson(url){
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok)throw Error('HTTP '+r.status);
    return r.json();
  }
  async function fetchAt(sha,manifest){
    if(!/^[a-f0-9]{40}$/.test(sha||''))throw Error('Kaynak SHA doğrulanamadı');
    if(previousSha===sha&&lastReport){
      render(lastReport,manifest);return;
    }
    const report=await fetchJson(ROOT+sha+'/web/data/turan-inverse-watch.json');
    render(report,manifest);
    previousSha=sha;
  }
  async function loadStandalone(force=false){
    if(!full||busy)return;
    busy=true;
    if(force)notice(full,'Yeni tarama ve eşleşmeler kontrol ediliyor…');
    try{
      const head=await fetchJson('https://api.github.com/repos/onurqlp/coin-live-pro/commits/main');
      const sha=head.sha;
      if(!/^[a-f0-9]{40}$/.test(sha||''))throw Error('Kaynak commit kimliği eksik');
      const manifest=await fetchJson(ROOT+sha+'/web/data/v4-manifest.json');
      await fetchAt(sha,manifest);
    }catch(e){notice(full,'Ters yön araştırma kaynağı henüz doğrulanamadı: '+String(e.message||e)+'. Eski tutarlar güncel gibi gösterilmiyor.');}
    finally{busy=false;}
  }
  if(main){
    for(const evt of ['uzayx:loaded','uzayx:source-check'])window.addEventListener(evt,e=>{
      const {db,sourceCommit}=e.detail||{};
      if(!db?.manifest)return;
      fetchAt(sourceCommit,db.manifest).catch(err=>notice(main,
        'Ters yön ileri kayıtları kaynakla henüz eşleşmedi ('+String(err.message||err)+'). Bir sonraki taramada yeniden denetlenecek.'));
    });
  }
  if(full){
    loadStandalone();
    document.getElementById('refresh')?.addEventListener('click',()=>loadStandalone(true));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadStandalone(true)});
    setInterval(()=>{if(!document.hidden)loadStandalone()},120000);
  }
})();
