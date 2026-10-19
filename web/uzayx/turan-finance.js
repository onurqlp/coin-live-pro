'use strict';
/* TURAN paper-money explorer: independently reconciled figures, never a trading/account API. */
((root,factory)=>{
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root?.document)root.document.addEventListener('DOMContentLoaded',()=>api.mount(root.document));
})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const N=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
 const usd=x=>N(x)===null?'—':(x>0?'+':'')+Number(x).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' USDT';
 const amount=x=>N(x)===null?'—':Number(x).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' USDT';
 function summarize(ops,paper){
  if(!ops||!paper||ops.source_scan_id!==paper.scan_id||ops.source_publication_valid!==true||ops.real_orders!==false||ops.experimental_spark?.is_real_money!==false||paper.no_real_orders!==true)
   throw Error('Farklı tarama, tutarsız kaynak veya gerçek emir işareti; para sonuçları gösterilmez');
  const s=ops.experimental_spark,p=paper.summary||{},counts=p.counts||{},raw=Array.isArray(paper.open_positions)?paper.open_positions:[];
  const complete=paper.open_positions_complete===true&&raw.length===counts.OPEN;
  const open=complete?raw:[];
  const notional=complete?open.reduce((v,x)=>v+(N(x.remaining_notional_usdt)||0),0):null;
  const margin=complete?open.reduce((v,x)=>v+(N(x.initial_margin_usdt)||0),0):null;
  const floating=complete?open.reduce((v,x)=>v+(N(x.unrealized_net_usdt)||0),0):null;
  const reportedNotional=N(p.open_reference_exposure_usdt),reportedFloating=N(s.unrealized_net_usdt);
  if(complete&&((reportedNotional!==null&&Math.abs(reportedNotional-notional)>0.05)||(reportedFloating!==null&&Math.abs(reportedFloating-floating)>0.05)))
   throw Error('Açık pozisyon toplamı hesapla uyuşmuyor');
  const closed=(Array.isArray(paper.recent_tickets)?paper.recent_tickets:[]).filter(x=>x.status==='CLOSED');
  const outcome=ops.cohorts?.['TÜMÜ'];
  return {time:ops.generated_at_utc,starting:N(paper.starting_balance_usdt),equity:N(s.virtual_equity_usdt),
   realized:N(s.realized_net_usdt),unrealized:N(s.unrealized_net_usdt),openCount:counts.OPEN??null,closedCount:counts.CLOSED??null,
   positive:outcome?.positive??null,negative:outcome?.negative??null,closedNet:N(outcome?.realized_total_usdt),margin,notional,
   complete,open,closed,closedComplete:closed.length===(counts.CLOSED||0),funding:paper.funding_state||'UNMODELED',
   realMoney:false};
 }
 function mount(doc){
  const host=doc.getElementById('turan-cash-view');if(!host)return;
  const el=(tag,cl,txt)=>{const n=doc.createElement(tag);if(cl)n.className=cl;if(txt!==undefined)n.textContent=String(txt);return n};
  const header=el('div','uxf-head');header.append(el('div','uxf-heading','Sanal işlemlerin para durumu'));
  const refresh=el('button','uxf-refresh','↻ Güncelle');refresh.type='button';header.append(refresh);
  const status=el('p','uxf-status','İşlem kayıtları kontrol ediliyor…');
  const grid=el('div','uxf-kpis');
  const detail=el('details','uxf-expander');detail.open=false;
  const summary=el('summary','uxf-summary','İşlem işlemi incele · Açık / Kapanmış');
  const controls=el('div','uxf-controls');
  const type=el('select','uxf-type');type.setAttribute('aria-label','İşlem durumu');
  for(const [v,t] of [['OPEN','Açık işlemler'],['CLOSED','Kapanmış işlemler']]){const op=el('option','',t);op.value=v;type.append(op)}
  const search=el('input','uxf-search');search.type='search';search.placeholder='Coin ara';search.setAttribute('aria-label','Coin ara');
  const more=el('button','uxf-more','Daha fazla göster');more.type='button';
  const list=el('div','uxf-list');controls.append(type,search);
  const foot=el('p','uxf-foot','Gerçek para veya borsa hesabı değil. Teminat ve nominal tutar birbirine eklenmez. Açık PnL tahminidir; fonlama henüz hesaplanmıyor.');
  detail.append(summary,controls,list,more);
  host.replaceChildren(header,status,grid,detail,foot);
  let model=null,limit=8,busy=false;
  const field=(title,value,kind='')=>{const cell=el('div','uxf-kpi '+kind);cell.append(el('span','',title),el('strong','',value));grid.append(cell)};
  function item(p){
   const d=el('details','uxf-ticket');
   const h=el('summary','uxf-ticket-head');
   const name=el('span','uxf-ticket-name',String(p.symbol||'Coin')+' · '+String(p.side||'—'));
   const pnl=(N(p.realized_net_usdt)||0)+(p.status==='OPEN'?(N(p.unrealized_net_usdt)||0):0);
   const value=el('span','uxf-ticket-pnl '+(pnl<0?'loss':pnl>0?'gain':''),usd(pnl));h.append(name,value);d.append(h);
   const rows=el('div','uxf-ticket-info');
   for(const [key,v] of [
    ['Durum',p.status==='OPEN'?'Açık · kapanmamış':'Kapanmış · sanal'],
    ['Ayrılan teminat',amount(p.initial_margin_usdt)],
    ['İlk nominal pozisyon',amount(p.reference_notional_usdt)],
    ['Kalan nominal',p.status==='OPEN'?amount(p.remaining_notional_usdt):'0,00 USDT'],
    ['Kaldıraç',p.leverage?String(p.leverage)+'×':'—'],
    ['Gerçekleşen net sonuç',usd(p.realized_net_usdt)],
    ['Açık tahmini PnL',p.status==='OPEN'?usd(p.unrealized_net_usdt):'—'],
    ['Tahmini komisyon',amount(p.fees_estimated_usdt)],
    ['Funding','MODELLENMEDİ'],
    ['Değerleme kaynağı',p.valuation_status||'—']]){
    const row=el('div','uxf-ticket-row');row.append(el('span','',key),el('b','',v));rows.append(row);
   }
   d.append(rows);return d;
  }
  function renderList(){
   if(!model)return;
   const selected=type.value==='CLOSED'?model.closed:model.open;
   const q=search.value.toLocaleUpperCase('tr-TR').trim();
   const matches=selected.filter(x=>(x.symbol||'').toLocaleUpperCase('tr-TR').includes(q));
   list.replaceChildren();
   for(const p of matches.slice(0,limit))list.append(item(p));
   if(!matches.length)list.append(el('p','uxf-empty','Bu koşula uygun kayıt yok.'));
   more.hidden=matches.length<=limit;
   more.textContent='Daha fazla göster ('+Math.max(0,matches.length-limit)+')';
   summary.textContent=(type.value==='OPEN'?'Açık pozisyonlar: '+model.openCount:'Kapanmış işlemler: '+model.closedCount)+' · Detayları aç';
  }
  function render(){
   if(!model)return;
   grid.replaceChildren();
   field('Sanal özkaynak',amount(model.equity));
   field('Sanal başlangıç',amount(model.starting));
   field('Gerçekleşen net',usd(model.realized),model.realized<0?'negative':'positive');
   field('Açık tahmini PnL',usd(model.unrealized),model.unrealized<0?'negative':'positive');
   field('Açık teminat toplamı',model.complete?amount(model.margin):'DOĞRULANAMIYOR');
   field('Kalan nominal maruziyet',model.complete?amount(model.notional):'DOĞRULANAMIYOR');
   field('Açık / Kapanmış',model.openCount+' / '+model.closedCount);
   field('Kapanan kâr / zarar adedi',model.positive+' / '+model.negative);
   const t=Date.parse(model.time||'');const age=Number.isFinite(t)?(Date.now()-t)/60000:null;
   status.textContent='Son kayıt: '+(Number.isFinite(t)?new Date(t).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'}):'bilinmiyor')+
   (age!==null&&age>30?' · Veri gecikmiş':'')+' · Rakamlar yalnız deneysel sanal hesaba aittir.';
   renderList();
  }
  async function load(){
   if(busy)return;
   busy=true;refresh.disabled=true;refresh.textContent='Kontrol ediliyor…';
   try{
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),14000);let a,b;
    try{
     [a,b]=await Promise.all(['../data/ops-report.json','../data/v4-spark-paper.json'].map(async url=>{
      const r=await fetch(url+'?now='+Date.now(),{cache:'no-store',signal:ctrl.signal});if(!r.ok)throw Error('HTTP '+r.status);return r.json();
     }));
    }finally{clearTimeout(timer)}
    model=summarize(a,b);render();
   }catch(e){model=null;grid.replaceChildren();list.replaceChildren();status.textContent='Sanal hesap uzlaştırılamadı: '+String(e.message||e)+'. Eski para rakamlarını güncelmiş gibi göstermiyoruz.';}
   finally{busy=false;refresh.disabled=false;refresh.textContent='↻ Güncelle'}
  }
  type.addEventListener('change',()=>{limit=8;renderList()});
  search.addEventListener('input',()=>{limit=8;renderList()});
  more.addEventListener('click',()=>{limit+=20;renderList()});
  refresh.addEventListener('click',load);
  doc.addEventListener('visibilitychange',()=>{if(!doc.hidden&&doc.getElementById('turan')?.classList.contains('active'))load()});
  doc.defaultView?.addEventListener('uzayx:tab',e=>{if(e.detail?.tab==='turan')load()});
  // Refresh only while the TURAN view is being used. Never change trade records.
  setInterval(()=>{if(!doc.hidden&&doc.getElementById('turan')?.classList.contains('active'))load()},120000);
  load();
 }
 return {summarize,mount};
});
