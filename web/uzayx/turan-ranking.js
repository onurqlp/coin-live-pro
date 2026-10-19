'use strict';
/* TURAN rank engine: exact-id paper attribution only; unexecuted forward events remain observations. */
((root,build)=>{
 const api=build();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.UzayXTuranRank=api;
})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const finite=x=>x!==null&&x!==undefined&&x!==''&&typeof x!=='boolean'&&Number.isFinite(Number(x))?Number(x):null;
 const safeid=x=>typeof x==='string'&&/^(?:T|L)\d{3}$/.test(x)?x:null;
 const observedHorizon=(item,horizon='1H')=>{
   const r=item?.horizons?.[horizon];
   if(r?.state!=='OBSERVED'||finite(r.close_direction_pct)===null)return null;
   return {horizon,move:finite(r.close_direction_pct),end:r.measurement_end_utc||null};
 };
 function buildBoard(registry,paper,forward,ops){
   if(registry?.schema!=='turan.unified_registry.v1'||!Array.isArray(registry.entries)||registry.entries.length!==230||
      new Set(registry.entries.map(x=>x.id)).size!==230||paper?.no_real_orders!==true||
      forward?.no_real_trades!==true||paper.scan_id!==forward.scan_id||ops?.source_scan_id!==paper.scan_id||
      ops?.source_publication_valid!==true||ops?.real_orders!==false||ops?.experimental_spark?.is_real_money!==false)
      throw Error('STRATEGY_SOURCES_UNVERIFIED');
   const counts=paper.summary?.counts||{},expected=Object.values(counts).reduce((s,n)=>s+(Number.isInteger(n)&&n>=0?n:0),0);
   const tickets=Array.isArray(paper.recent_tickets)?paper.recent_tickets:[];
   const fullLedger=expected>0&&tickets.length===expected&&tickets.every(t=>t?.event_id&&t.is_real_trade===false);
   const byId=new Map(registry.entries.map(x=>[x.id,{...x,closed:[],open:[],realized:0,unrealized:0,closedNet:0,closedWinnings:0,closedLosses:0,exposure:0,margin:0,observations:[],winObservation:0,lossObservation:0,closedCount:0,tagged:false}]));
   const modelMap=new Map(registry.entries.filter(e=>e.model).map(e=>[e.model,e.id]));
   if(fullLedger){
    for(const x of tickets){
     const id=safeid(x.turan_strategy_id)||safeid(x.strategy_id)||modelMap.get(x.strategy_id);
     if(!id||!byId.has(id))continue;
     const item=byId.get(id);
     if(!['OPEN','CLOSED'].includes(x.status))continue;
     const n=finite(x.realized_net_usdt),u=finite(x.unrealized_net_usdt),margin=finite(x.initial_margin_usdt),nom=finite(x.remaining_notional_usdt);
     if(n===null||u===null||margin===null)continue;
     item.tagged=true;item.realized+=n;item.unrealized+=u;
     if(x.status==='CLOSED'){
       item.closed.push(x);item.closedCount++;item.closedNet+=n;
       if(n>0)item.closedWinnings+=n;else if(n<0)item.closedLosses+=n;
     }else{item.open.push(x);item.margin+=margin;item.exposure+=nom||0;}
    }
   }
   for(const x of forward.results||[]){
     if(x.not_executed_trade!==true||!x.strategy_id||!modelMap.has(x.strategy_id))continue;
     const entry=byId.get(modelMap.get(x.strategy_id));
     const horizon=observedHorizon(x,'1H');if(!horizon||!x.symbol||!x.observed_at_utc||!['LONG','SHORT'].includes(x.side))continue;
     entry.observations.push({symbol:x.symbol,side:x.side,observedAt:x.observed_at_utc,measuredAt:horizon.end,directionalPct:horizon.move,positive:horizon.move>0,negative:horizon.move<0,horizon:'1H',setupId:x.setup_id});
     if(horizon.move>0)entry.winObservation++;if(horizon.move<0)entry.lossObservation++;
   }
   const items=[...byId.values()];
   for(const x of items)x.observations.sort((a,b)=>Date.parse(b.observedAt||'')-Date.parse(a.observedAt||''));
   const attributable=items.filter(x=>x.tagged&&x.closedCount>0);
   const compare=(a,b)=>{
     const ma=a.closedCount>0&&a.tagged,mb=b.closedCount>0&&b.tagged;
     if(ma!==mb)return mb-ma;
     if(ma&&mb){if(a.realized!==b.realized)return b.realized-a.realized;if(a.closedCount!==b.closedCount)return b.closedCount-a.closedCount;}
     const ao=a.observations.length,bo=b.observations.length;
     if(ao!==bo)return bo-ao;
     // Research preview: prefer pre-existing observed models; others remain provisional.
     if(a.source!==b.source)return a.source==='legacy'?-1:1;
     return a.id.localeCompare(b.id);
   };
   const ranked=items.slice().sort(compare);
   return {scan:paper.scan_id,generated:ops.generated_at_utc,completeLedger:fullLedger,attributableCount:attributable.length,
    rankQualifiedCount:attributable.filter(x=>x.closedCount>=30).length,
    total:items.length,top:ranked.slice(0,30),entries:items,archived:ranked.slice(30),moneyRankingAvailable:attributable.length>0,
    rankingType:attributable.length?'Sanal gerçekleşen net sonuca göre; henüz istatistiksel onay değil':'Öncelikli izleme sırası · kâr sıralaması değil',
    unassignedMoney:ops.experimental_spark.realized_net_usdt};
 }
 return {buildBoard,observedHorizon};
});
