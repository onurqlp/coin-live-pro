const test=require('node:test');
const assert=require('node:assert/strict');
const watch=require('../web/uzayx/watch.js');
const portfolio=require('../web/uzayx/portfolio.js');
const fs=require('node:fs');
const when='2026-10-18T20:00:00.000Z',now=Date.parse(when);
function data(){
 const radar={scan_id:'ident',spotlight:[],motion:[],watch:[{
  setup_id:'old',symbol:'ABCUSDT',side:'SHORT',review_state:'RECHECK_PENDING',
  last_evaluated_at:'2026-10-16T10:00:00Z',last_evidence_at:'2026-10-16T09:00:00Z',score:99
 }]};
 const candidate=(rank,tier)=>({symbol:'TEST'+rank+'USDT',event_id:'evt'+rank,side:'SHORT',
  research_rank:rank,research_tier:tier,price_at_scan:1.25,hourly_level:1.20,
  source_observed_at_utc:'2026-10-18T19:55:00Z'});
 const early={scan_id:'ident',candidates:[candidate(80,'ISIK_GUCLENIYOR'),candidate(65,'ERKEN_SINYAL'),candidate(40,'KIVILCIM')]};
 const spark={scan_id:'ident',recent_tickets:[{event_id:'evt80',status:'WAITING_FUTURE_BAR',stop:1.30,tp1:1.19,tp2:1.16,tp3:1.13,
  features_at_birth:{'4H':{rsi:31.1,macd_hist_pct:-.05}},fill_price:null}]};
 return {manifest:{scan_id:'ident',finished_at_utc:when,publication_valid:true,no_real_orders:true},
  radar,early,spark,review:{scan_id:'ident'}};
}
test('3 early research tiers each surface in one-screen lanes, never auto-entry',()=>{
 const o=watch.buildGroups(data(),'a'.repeat(40),now);
 assert.equal(o.valid,true);
 assert.deepEqual([o.groups.MOTION.length,o.groups.WATCH.length,o.groups.SPARK.length],[1,1,1]);
 assert.equal(o.groups.MOTION[0].paper_entry_state,'NOT_ELIGIBLE');
 assert.equal(o.groups.MOTION[0].paperStatus,'WAITING_FUTURE_BAR');
 assert.equal(o.groups.MOTION[0].paperPrice,null);
 assert.equal(o.groups.MOTION[0].hourly_level,1.2);
 assert.equal(o.groups.WATCH.some(x=>x.symbol==='ABCUSDT'),false);
});
test('stale, future-dated and mismatched scan fail closed',()=>{
 const d=data();
 assert.equal(watch.buildGroups(d,'a'.repeat(40),now+30*60000).valid,false);
 assert.equal(watch.buildGroups(d,null,now).valid,false);
 d.early.scan_id='other';
 assert.equal(watch.buildGroups(d,'a'.repeat(40),now).valid,false);
});
test('paper summary audit distinguishes 1058 ledger tickets from recent limited view',()=>{
 const doc={scan_id:'s',summary:{counts:{WAITING_FUTURE_BAR:2,OPEN:5,CLOSED:3},virtual_equity_usdt:10007,
   realized_net_usdt:4,unrealized_net_usdt:3},all_events_count:10,
   combined_with_strict_paper_cash:false,no_backfilled_outcomes:true,no_real_orders:true,
   recent_tickets:[{event_id:'e1',is_real_trade:false,status:'OPEN',symbol:'ETHUSDT',
    signal_at_utc:'2026-10-18T12:00:00Z',fill_price:2200,unrealized_net_usdt:1.2},
   {event_id:'e2',is_real_trade:false,status:'WAITING_FUTURE_BAR',symbol:'SOLUSDT',
    signal_at_utc:'2026-10-18T13:00:00Z',fill_price:null}]};
 const s=portfolio.reconcile(doc);
 assert.equal(s.proven,true);assert.equal(s.total,10);assert.equal(s.represented,2);
 assert.equal(s.open,5);
 assert.equal(portfolio.positions(doc,'OPEN').length,1);
 assert.equal(portfolio.positions(doc,'WAITING_FUTURE_BAR')[0].fill_price,null);
 assert.equal(portfolio.positions(doc,'ALL','ETH').length,1);
 assert.equal(portfolio.reconcile({...doc,all_events_count:99}).proven,false);
 assert.equal(portfolio.paperPnl(null),'—');
 assert.equal(portfolio.paperPnl(undefined),'—');
 assert.equal(portfolio.paperPnl(NaN),'—');
 assert.notEqual(portfolio.paperPnl(0),'—');
});
test('logo asset, compact watch monitor and separate cash charts are present',()=>{
 const html=fs.readFileSync('web/uzayx/site.html','utf8');
 const js=fs.readFileSync('web/uzayx/app.js','utf8');
 assert.match(html,/<img src="\.\.\/assets\/uzayx-logo.svg" alt="UZAYX"/);
 for(const id of ['watch-items','watch-detail','watch-search','mini-price','position-rows','position-detail',
   'position-chart','cash-performance','cash-open','cash-waiting','cash-closed','history-events','watch-verify','motor-check']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/src="\.\/watch\.js"/);
 assert.match(html,/src="\.\/portfolio\.js"/);
 assert.equal((html.match(/binance\.com\/en\/futures\/home/g)||[]).length,1);
 assert.match(js,/early: 'v4-early.json'/);
 assert.doesNotMatch(js,/createOrder|placeOrder|apiSecret/i);
});

test('home glance uses one verified snapshot and distinguishes fresh from stale',()=>{
 const now=Date.parse('2026-10-19T16:00:00Z'),sha='a'.repeat(40);
 const manifest={scan_id:'scan',finished_at_utc:'2026-10-19T15:55:00Z',publication_valid:true,no_real_orders:true};
 const paper={scan_id:'scan'};
 const doc={scan_id:'scan',updated_at:'2026-10-19T15:55:00Z',no_real_orders:true,
   combined_with_strict_paper_cash:false,no_backfilled_outcomes:true,
   summary:{unrealized_net_usdt:-2.5},
   recent_tickets:[{event_id:'last',symbol:'SOLUSDT',side:'LONG',filled_at_utc:'2026-10-19T15:49:00Z',reference_notional_usdt:300,is_real_trade:false}],
   open_positions:[],minimum_new_margin_usdt:30,minimum_new_ticket_notional_usdt:300,
   leverage_min:10,leverage_max:30,
   daily:{today:{date_utc:'2026-10-19',closed:3,realized_net_usdt:4.2}}
 };
 const valid=portfolio.homeGlance(doc,manifest,paper,sha,now);
 assert.equal(valid.valid,true);assert.equal(valid.fresh,true);
 assert.equal(valid.last.symbol,'SOLUSDT');assert.equal(valid.floating,-2.5);
 assert.equal(valid.todayClosed,3);assert.equal(valid.todayNet,4.2);
 assert.equal(valid.margin,30);assert.equal(valid.notional,300);
 assert.equal(portfolio.homeGlance(doc,manifest,paper,sha,now+3600000).fresh,false);
 assert.equal(portfolio.homeGlance(doc,manifest,{scan_id:'wrong'},sha,now).valid,false);
 assert.equal(portfolio.homeGlance(doc,manifest,paper,null,now).last,null);
 assert.equal(portfolio.homeGlance({...doc,daily:{today:{date_utc:'2026-10-18',closed:9,realized_net_usdt:100}}},manifest,paper,sha,now).todayNet,null);
});
