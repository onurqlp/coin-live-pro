const test=require('node:test'),assert=require('node:assert/strict');
const close=require('../web/uzayx/cash-close.js');
const now=Date.now(),pending={at:now,before:'uzayx-original'};
const doc={close_request_id:'uzayx-manual-123'};
const report={request_id:doc.close_request_id,closed_at_utc:new Date(now+1000).toISOString(),
 all_active_positions_closed:true,real_orders:false,positions:[{book:'spark',net_closed_usdt:-3}],cancelled:[],spark_equity_after_usdt:9997};
test('requires a new completed server record belonging to the current shared cashbook',()=>{
 assert.equal(close.completed(report,doc,pending),true);
 for(const bad of [{...report,all_active_positions_closed:false},{...report,real_orders:true},
  {...report,request_id:pending.before},{...report,closed_at_utc:new Date(now-300000).toISOString()}]){
  assert.equal(close.completed(bad,doc,pending),false);
 }
 assert.equal(close.completed(report,{close_request_id:'another-request'},pending),false);
 assert.equal(close.completed(report,doc,null),false);
});
test('the control links only to the authenticated close workflow',()=>{
 assert.equal(close.WORKFLOW_URL,'https://github.com/onurqlp/coin-live-pro/actions/workflows/uzayx-close-all.yml');
 assert.match(close.summary(report),/1 sanal pozisyon/);
 assert.match(close.summary(report),/9.997,00 USDT/);
});
