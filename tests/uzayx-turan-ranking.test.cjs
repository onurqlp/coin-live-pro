'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=x=>fs.readFileSync(x,'utf8');
const registry=JSON.parse(read('web/uzayx/turan-registry.json'));
const paper=JSON.parse(read('web/data/v4-spark-paper.json'));
const forward=JSON.parse(read('web/data/v4-forward.json'));
const ops=JSON.parse(read('web/data/ops-report.json'));
const {buildBoard,observedHorizon}=require('../web/uzayx/turan-ranking.js');
const html=read('web/uzayx/site.html');
const cleanPaper=()=>({...paper,recent_tickets:paper.recent_tickets.map(t=>{const n={...t};delete n.strategy_id;delete n.turan_strategy_id;return n})});
test('Pool has original thirty and the user-supplied two hundred with stable independent IDs',()=>{
 assert.equal(registry.schema,'turan.unified_registry.v1');assert.equal(registry.entries.length,230);
 assert.equal(new Set(registry.entries.map(e=>e.id)).size,230);
 assert.equal(registry.entries.filter(e=>e.source==='proposal').length,200);
 assert.equal(registry.entries.filter(e=>e.source==='legacy').length,30);
});
test('No strategy attribution is ever inferred from unexecuted observation or overall paper PnL',()=>{
 const b=buildBoard(registry,cleanPaper(),forward,ops);
 assert.equal(b.attributableCount,0);assert.equal(b.moneyRankingAvailable,false);
 assert.equal(b.top.length,30);assert.equal(b.total,230);
 assert.equal(b.entries.every(x=>!x.tagged&&x.closedCount===0),true);
 const knownModels=new Set(registry.entries.filter(x=>x.model).map(x=>x.model));
 const eligible=forward.results.some(x=>x.not_executed_trade===true&&knownModels.has(x.strategy_id)&&observedHorizon(x));
 assert.equal(b.entries.some(x=>x.observations.length>0),eligible,'only model-matched observed forward cases remain visible');
 assert.equal(b.entries.find(x=>x.id==='T001').observations.length,0,'proposal events do not inherit old models');
});
test('Forward 1H direction is already normalized to LONG/SHORT in source: no double side-flip',()=>{
 const x=forward.results.find(x=>x.side==='SHORT'&&x.horizons?.['1H']?.state==='OBSERVED');
 if(x){const out=observedHorizon(x);assert.equal(out.move,x.horizons['1H'].close_direction_pct);}
});
test('Directly tagged full-ledger virtual returns move families into top 30',()=>{
 const base=cleanPaper();
 const candidates=[{event_id:'synthetic-a',symbol:'ALPHAUSDT',status:'CLOSED',side:'LONG',is_real_trade:false,realized_net_usdt:0,unrealized_net_usdt:0,initial_margin_usdt:30},
  {event_id:'synthetic-b',symbol:'BETAUSDT',status:'CLOSED',side:'SHORT',is_real_trade:false,realized_net_usdt:0,unrealized_net_usdt:0,initial_margin_usdt:30}];
 const p={...base,recent_tickets:candidates,summary:{...base.summary,counts:{CLOSED:2,OPEN:0,WAITING_FUTURE_BAR:0}}};
 const pp=p.recent_tickets.map(t=>({...t}));
 let assigned=0;
 for(const t of pp){if(t.event_id===candidates[0].event_id){t.turan_strategy_id='T200';t.realized_net_usdt=-9;assigned++;}
 else if(t.event_id===candidates[1].event_id){t.turan_strategy_id='T050';t.realized_net_usdt=+11;assigned++;}}
 assert.equal(assigned,2);
 const b=buildBoard(registry,{...p,recent_tickets:pp},forward,ops);
 assert.equal(b.moneyRankingAvailable,true);assert.equal(b.attributableCount,2);
 assert.equal(b.top[0].id,'T050');assert.equal(b.top[0].closedWinnings,11);
 assert.equal(b.top[1].id,'T200');assert.equal(b.top[1].closedLosses,-9);
 assert.equal(b.top[0].closed[0].symbol,candidates[1].symbol);
});
test('Mixed scans or partial ticket archives prevent profit ranking',()=>{
 const p=cleanPaper();assert.throws(()=>buildBoard(registry,p,{...forward,scan_id:'mismatch'},ops));
 const partial={...p,recent_tickets:p.recent_tickets.slice(1).map(x=>({...x,strategy_id:'T001'}))};
 const board=buildBoard(registry,partial,forward,ops);
 assert.equal(board.completeLedger,false);assert.equal(board.moneyRankingAvailable,false);
});
test('Top30 screen and independent AR-GE archive load in the same web/PWA UI',()=>{
 for(const x of ['id="turan-top30"','id="turan-families-root"','id="turan-catalog"','id="volcano-atlas"','src="./turan-ranking.js?v=1"','src="./turan-ranking-ui.js?v=1"','href="./turan-ranking.css?v=1"'])assert.ok(html.includes(x),x);
 new vm.Script(read('web/uzayx/turan-ranking-ui.js'));
 const mobile=read('web/uzayx/index.html');assert.match(mobile,/src="\.\/site\.html"/);
});
