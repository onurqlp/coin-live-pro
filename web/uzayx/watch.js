/* UzayX Watchdesk — one-screen observation list, not orders.
   Pure selection logic can be regression-tested without browser. */
(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.UzayXWatchdesk=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const MAX_AGE_MS=25*60*1000;
 const price=v=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('tr-TR',{maximumFractionDigits:v<1?7:4}):'—';
 const time=s=>{const t=Date.parse(s||'');return Number.isFinite(t)?new Date(t).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'}):'—';};
 const within=(date,now)=>{const t=Date.parse(date||'');return Number.isFinite(t)&&now>=t-120000&&now-t<=MAX_AGE_MS;};
 const eligibleScan=(db,sha,now)=>{
   const m=db?.manifest;
   return Boolean(/^[a-f0-9]{40}$/.test(sha||'')&&m?.publication_valid===true&&m?.no_real_orders===true&&
    db?.radar?.scan_id===m.scan_id&&db?.early?.scan_id===m.scan_id&&db?.spark?.scan_id===m.scan_id&&
    db?.review?.scan_id===m.scan_id&&within(m.finished_at_utc,now));
 };
 function normalizeSpark(e,ticket){
   const stop=ticket?.event_id===e.event_id?ticket.stop:null;
   const tp=ticket?.event_id===e.event_id?[ticket.tp1,ticket.tp2,ticket.tp3]:[];
   return {id:e.event_id,symbol:e.symbol,side:e.side,kind:'SPARK',
     stage:e.research_tier,price:e.price_at_scan,stop,targets:tp,
     hourly_level:e.hourly_level,level_source:'1H',score:e.research_rank,
     last_evaluated_at:e.source_observed_at_utc,review_state:'EARLY_RESEARCH',
     confirmation_state:e.hourly_level_state||'NOT_CONFIRMED',
     paper_entry_state:'NOT_ELIGIBLE',paperStatus:ticket?.status||'UNTRACKED',
     paperPrice:ticket?.fill_price??null,event_id:e.event_id,
     metrics:{'4h_rsi':ticket?.features_at_birth?.['4H']?.rsi,
       '4h_macd_signed':ticket?.features_at_birth?.['4H']?.macd_hist_pct,
       '4h_relative_volume':e.relative_volume_4h},
     stale:false};
 }
 function toRadar(p,kind){
  return {id:p.setup_id||p.symbol+':'+p.side,symbol:p.symbol,side:p.side,kind,stage:p.lifecycle_stage,
   price:p.price,stop:p.stop,targets:p.targets,score:p.score,metrics:p.metrics,
   last_evaluated_at:p.last_evaluated_at,review_state:p.review_state,
   paper_entry_state:p.paper_entry_state,confirmation_state:p.confirmation_state,
   stale:false};
 }
 function buildGroups(db,sha,now=Date.now()){
   // UI in production is strictly fed by the 200 registered strategies.
   if(db?.strategyMode===true){
     const groups={WATCH:[],MOTION:[],SPARK:[]},m=db.manifest,b=db.strategyBank;
     const valid=Boolean(/^[a-f0-9]{40}$/.test(sha||'')&&m?.publication_valid===true&&m?.no_real_orders===true&&
       db.spark?.scan_id===m.scan_id&&b?.policy==='TURAN200_ONLY'&&b?.registry_count===200&&
       b?.no_real_orders===true&&b?.source_mtf_at===db.spark?.source_mtf_at&&
       within(m.finished_at_utc,now)&&within(b.updated_at,now));
     if(!valid)return {valid:false,groups,reason:'STRATEGY_200_SOURCE_MISMATCH'};
     const dedup=new Set();
     for(const s of b.signals||[]){
       if(!/^T(?:0[0-9]{2}|1[0-9]{2}|200)$/.test(s.strategy_id||'')||
        !['LONG','SHORT'].includes(s.side)||!s.symbol||!Number.isFinite(s.price_at_scan)||
        !within(s.source_observed_at_utc,now))continue;
       const id=s.strategy_id+':'+s.symbol+':'+s.side+':'+(s.source_closed_1h_at_utc||'');
       if(dedup.has(id))continue;dedup.add(id);
       const kind=s.paper_stage_number===3?'SPARK':s.paper_stage_number===2?'MOTION':'WATCH';
       groups[kind].push({id,event_id:id,symbol:s.symbol,side:s.side,kind,
        strategy_id:s.strategy_id,strategy_ids:s.strategy_ids||[s.strategy_id],stage:s.paper_stage_name,
        price:s.price_at_scan,stop:null,targets:[],score:s.research_rank,
        last_evaluated_at:s.source_observed_at_utc,review_state:'TURAN200_VERIFIED_SOURCE',
        confirmation_state:s.hourly_level_state||'WAIT_FOR_CLOSED_1H',
        paper_entry_state:s.paper_eligible?'ELIGIBLE':'NOT_ELIGIBLE',paperStatus:'OBSERVING',
        metrics:{'4h_relative_volume':s.relative_volume_4h},stale:false});
     }
     for(const k of Object.keys(groups))groups[k].sort((a,b)=>(b.score||0)-(a.score||0)||a.id.localeCompare(b.id));
     return {valid:true,groups,reason:null,strategy_only:true};
   }
   const ok=eligibleScan(db,sha,now);
   const groups={WATCH:[],MOTION:[],SPARK:[]};
   if(!ok)return {valid:false,groups,reason:'Veri zamanı veya tarama kimliği doğrulanamadı.'};
   const radar=db.radar||{},spark=db.spark||{},early=db.early||{};
   const tickets=new Map((spark.recent_tickets||[]).filter(t=>t.event_id).map(t=>[t.event_id,t]));
   const fresh=p=>p?.review_state==='FRESH'&&within(p.last_evaluated_at,now)&&within(p.last_evidence_at,now);
   const seen=new Set();
   for(const p of [].concat(radar.spotlight||[],radar.motion||[])){
     if(!fresh(p))continue;
     const id=p.symbol+':'+p.side;if(seen.has(id))continue;seen.add(id);
     groups.MOTION.push(toRadar(p,'MOTION'));
   }
   for(const p of radar.watch||[]){
     if(!fresh(p))continue;
     const id=p.symbol+':'+p.side;if(seen.has(id))continue;seen.add(id);
     groups.WATCH.push(toRadar(p,'WATCH'));
   }
   const discoveries=new Set();
   for(const e of early.candidates||[]){
     if(!within(e.source_observed_at_utc,now)||!e.event_id||discoveries.has(e.event_id))continue;
     discoveries.add(e.event_id);
     const snap=normalizeSpark(e,tickets.get(e.event_id));
     // Visual grouping only: early research tiers never become confirmed radar entries.
     // Strongest early tier appears under movement, middle under watch, raw sparks under sparks.
     const lane=e.research_tier==='ISIK_GUCLENIYOR'?'MOTION':
       e.research_tier==='ERKEN_SINYAL'?'WATCH':'SPARK';
     groups[lane].push(snap);
   }
   for(const k of Object.keys(groups))groups[k].sort((a,b)=>(b.score||0)-(a.score||0)||a.symbol.localeCompare(b.symbol));
   return {valid:true,groups,reason:null};
 }
 const state={filter:'ALL',query:'',chosen:null,expanded:false};
 let latest=null,selection=null;
 const $=id=>root.document?.getElementById(id);
 const elt=(tag,cls,txt)=>{const el=root.document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=txt;return el;};
 function labels(group){return {ALL:'Tümü',MOTION:'Hareketlenen',WATCH:'İzlenen',SPARK:'Kıvılcımlar'}[group];}
 function visible(){
   if(!latest?.valid)return [];
   const g=latest.groups;
   const all=state.filter==='ALL'?[...g.MOTION,...g.SPARK,...g.WATCH]:g[state.filter]||[];
   return all.filter(x=>!state.query||x.symbol.includes(state.query)).slice(0,28);
 }
 function totals(){
   const counts=Object.fromEntries(['MOTION','WATCH','SPARK'].map(k=>[k,latest?.groups?.[k]?.length||0]));
   counts.ALL=counts.MOTION+counts.WATCH+counts.SPARK;
   return counts;
 }
 function choose(item){
   state.chosen=item.id;selection=item;state.expanded=true;
   renderList();
   const panel=$('watch-detail');
   if(panel){
     panel.hidden=false;
     $('watch-detail-title').textContent=item.symbol+' · '+item.side;
     $('watch-detail-meta').textContent=(item.kind==='SPARK'?'Kıvılcım / '+item.stage:labels(item.kind))+
      ' · '+(item.strategy_id?item.strategy_id+' · ':'')+(item.kind==='SPARK'?'Araştırma, giriş teyidi yok':item.review_state)+
      ' · Gözlem '+time(item.last_evaluated_at);
     $('watch-detail-price').textContent=price(item.price);
     $('watch-detail-stop').textContent=price(item.stop);
     $('watch-detail-tps').textContent=(item.targets||[]).filter(x=>typeof x==='number'&&Number.isFinite(x)).map((p,i)=>'TP'+(i+1)+' '+price(p)).join('  •  ')||'Hedef yok';
     $('watch-detail-rsi').textContent=price(item.metrics?.['4h_rsi']);
     $('watch-detail-macd').textContent=price(item.metrics?.['4h_macd_signed']);
     $('watch-detail-paper').textContent=item.kind==='SPARK'?'Sanal bilet: '+String(item.paperStatus):'Yalnız radar takibi';
   }
   root.dispatchEvent(new CustomEvent('uzayx:select-coin',{detail:{candidate:item}}));
 }
 function renderList(){
   const area=$('watch-items');if(!area)return;
   area.replaceChildren();
   const rows=visible();
   const counts=totals();
   root.document.querySelectorAll('[data-watch-filter]').forEach(b=>{
     const on=b.dataset.watchFilter===state.filter;
     b.classList.toggle('selected',on);
     b.setAttribute('aria-pressed',String(on));
     const label=labels(b.dataset.watchFilter);
     b.textContent=label+'  '+(counts[b.dataset.watchFilter]||0);
   });
   if(!latest?.valid){
     area.append(elt('div','watch-empty','Güncel tarama doğrulanmadı. Eski gözlemler arşivde korunuyor.'));
     if($('watch-detail'))$('watch-detail').hidden=true;
     return;
   }
   if(!rows.length){area.append(elt('div','watch-empty','Bu grupta yeni doğrulanmış gözlem yok. Eski kayıtları arşivde inceleyebilirsiniz.'));return;}
   rows.forEach(p=>{
     const b=elt('button','watch-row'+(p.id===state.chosen?' selected':''));b.type='button';
     b.setAttribute('aria-pressed',String(p.id===state.chosen));
     const title=elt('span','watch-symbol');title.append(elt('b','',p.symbol),elt('small','',p.side));
     const status=elt('span','watch-stage',p.kind==='SPARK'?(p.stage==='KIVILCIM'?'Kıvılcım':p.stage==='ERKEN_SINYAL'?'Erken':'Güçleniyor'):labels(p.kind));
     const value=elt('span','watch-price',price(p.price));
     b.append(title,status,value,elt('span','watch-caret','›'));
     b.addEventListener('click',()=>choose(p));
     area.append(b);
   });
 }
 function render(){
   renderList();
   const c=totals();
   if($('watch-count'))$('watch-count').textContent=latest?.valid?c.ALL+' yeni gözlem':'Yeni tarama bekleniyor';
   if(!latest?.valid){selection=null;return;}
   const all=[...latest.groups.MOTION,...latest.groups.SPARK,...latest.groups.WATCH];
   const same=all.find(x=>x.id===state.chosen);
   const best=same||all[0];
   if(!best){if($('watch-detail'))$('watch-detail').hidden=true;return;}
   // Preserve manually selected coin, even if a subsequent filter hides it.
   if(!same&&state.chosen){state.chosen=null;}
   choose(best);
 }
 function onLoad(e){
   const {db,sourceCommit}=e.detail||{};
   latest=buildGroups(db,sourceCommit);
   render();
 }
 if(root.document){
   root.addEventListener('uzayx:loaded',onLoad);
   root.document.addEventListener('DOMContentLoaded',()=>{
     root.document.querySelectorAll('[data-watch-filter]').forEach(b=>b.addEventListener('click',()=>{
       state.filter=b.dataset.watchFilter;renderList();
     }));
     $('watch-search')?.addEventListener('input',e=>{state.query=e.target.value.trim().toUpperCase();renderList();});
     $('watch-detail-close')?.addEventListener('click',()=>{$('watch-detail').hidden=true;state.expanded=false;});
     $('watch-verify')?.addEventListener('click',()=>root.document.getElementById('reload')?.click());
     $('watch-archive')?.addEventListener('click',()=>root.document.querySelector('[data-tab="learn"]')?.click());
   });
 }
 return {within,eligibleScan,normalizeSpark,buildGroups};
});