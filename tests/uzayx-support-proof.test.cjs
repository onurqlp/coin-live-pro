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


test('A3 B2 T0 become evidence-backed observations but never orders',()=>{
 const s=support();
 s.modules[2]={id:'A3',state:'OBSERVING',signal:false,executable:false,
   observations:[{status:'INPUTS_ONLY',source:'OKX_SPOT',aligned_closed_days:80,
     symbols:['BTCUSDT','ETHUSDT','SOLUSDT'],asof_utc:'2026-10-17T00:00:00Z',
     actionable:false,latest_close_usdt:{BTC:80000,ETH:2400,SOL:100}}]};
 s.modules[4]={id:'B2',state:'OBSERVING',signal:false,executable:false,
   observations:[{status:'SCREEN_ONLY',actionable:false,venues:['OKX','KRAKEN'],
    best_quotes:{OKX:{bid:1.001,ask:1.002},KRAKEN:{bid:1.001,ask:1.002}},
    routes:[{net_pnl:null,net_spread_bps:null},{net_pnl:null,net_spread_bps:null}]}]};
 s.modules[5]={id:'T0',state:'OBSERVING',signal:false,executable:false,
   observations:[{status:'REFERENCE_ONLY',date_utc:'2026-10-16',actionable:false,
     yields_percent:{'2Y':4.7,'10Y':5.09}}]};
 s.modules[3].signal=false;
 for(const id of ['A3','B2','T0']){
   const r=proofs.evaluate(s,id,now);
   assert.equal(r.state,'OBSERVED',id+' '+r.message);
   assert.equal(r.ok,true,id);
   assert.match(r.message,/yok|değildir|henüz/);
 }
 s.modules[4].observations[0].routes[0].net_pnl=4;
 assert.equal(proofs.evaluate(s,'B2',now).ok,false,'must not fabricate net PnL');
 s.modules[2].observations[0].asof_utc='2026-09-01T00:00:00Z';
 assert.equal(proofs.evaluate(s,'A3',now).ok,false,'stale bars must fail');
});
