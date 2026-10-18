const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const portfolio=require('../web/uzayx/portfolio.js');
const proofs=require('../web/uzayx/support-proof.js');
const now=Date.parse('2026-10-18T20:30:00Z');
function support(){
  const ids=['A1','A2','A3','B1','B2','T0'];
  const modules=ids.map(id=>({
    id,name:id,blocker:'Source not verified',state:id==='B1'?'OBSERVING':'BLOCKED_SOURCE',
    executable:false,strategy_state:id==='B1'?'WATCH_ONLY':'NOT_CONNECTED',
    observations:id==='B1'?[{symbol:'BTCUSDT',venue:'OKX',last_realized_rate_fraction_per_event:0.00003,
      last_realized_time_utc:'2026-10-18T16:00:00Z',interval_hours:8,executable:false}]:[]
  }));
  return {schema:'makine-six-support-v2',module_count:6,generated_at_utc:'2026-10-18T20:29:00Z',
    modules,safety:{no_orders:true}};
}
test('B1 has verifiable read-only funding evidence but no trade authorization',()=>{
 const r=proofs.evaluate(support(),'B1',now);
 assert.equal(r.state,'OBSERVED');assert.equal(r.ok,true);
 assert.match(r.message,/sadece gözlem/i);
});
test('A1 A2 A3 B2 T0 cannot claim working source from health button',()=>{
 const doc=support();
 for(const id of ['A1','A2','A3','B2','T0']){
  const r=proofs.evaluate(doc,id,now);
  assert.equal(r.state,'BLOCKED');
  assert.match(r.message,/ENGELLİ/);
 }
 assert.equal(proofs.evaluate(doc,'B1',now+70*60000).ok,false);
 doc.modules[3].observations[0].last_realized_rate_fraction_per_event='0.00003';
 assert.equal(proofs.evaluate(doc,'B1',now).ok,false);
});
test('full open list preserves exact open count; partial list clearly degraded',()=>{
 const sample=[{event_id:'open1',symbol:'BTCUSDT',side:'SHORT',status:'OPEN',fill_price:101,is_real_trade:false},
   {event_id:'open2',symbol:'ETHUSDT',side:'SHORT',status:'OPEN',fill_price:55,is_real_trade:false}];
 const p={summary:{counts:{OPEN:2}},open_positions_complete:true,open_positions:sample,
  recent_tickets:[{status:'CLOSED',symbol:'SOLUSDT'}]};
 assert.equal(portfolio.completeOpenPositions(p).complete,true);
 assert.equal(portfolio.positions(p,'OPEN').length,2);
 assert.equal(portfolio.positions(p,'OPEN','ETH').length,1);
 assert.equal(portfolio.positions(p,'ALL').length,3);
 const corrupted={...p,open_positions:[sample[0]]};
 assert.equal(portfolio.completeOpenPositions(corrupted).complete,false);
});
test('home open tickets, module verification controls, logo invariants',()=>{
 const page=fs.readFileSync('web/uzayx/index.html','utf8');
 for(const id of ['home-open-count','home-open-list','home-position-search','module-check-all','module-verified-at'])
   assert.ok(page.includes('id="'+id+'"'),'missing '+id);
 assert.match(page,/src="\.\/support-proof\.js"/);
 assert.match(page,/src="\.\/portfolio\.js"/);
 assert.match(page,/<img src="\.\.\/assets\/uzayx-logo.svg" alt="UZAYX"/);
 assert.equal((page.match(/binance\.com\/en\/futures\/home/g)||[]).length,1);
});
