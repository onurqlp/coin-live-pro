'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const ui=require('../web/uzayx/pnl-dashboard.js');
const read=p=>fs.readFileSync(p,'utf8');
test('no speculative inverse PNL can enter cashier data',()=>{
 const a=ui.scenario(-2,300,.2);assert.equal(a.long,-6.6);assert.equal(a.short,5.4);assert.equal(a.wait,0);
 assert.equal(ui.scenario(100,300,.2),null);assert.equal(ui.scenario(-2,300,-1),null);
});
test('evidence progress counts independently, not as invented profit',()=>{
 const p=ui.progress({id:'T001',state:'PAPER_ACTIVE'},{strategy_contest:{board:{T001:{independent_days:2,independent_primary_closed:4,holdout_primary_closed:0,shared_supporting_closed:10}},selection_requires_days:7,selection_requires_primary_closed:60}});
 assert.equal(p.ready,false);assert.equal(p.shared,10);assert.equal(p.closed,4);assert.equal(p.holdout,0);
});
test('report and strategy bank must match scan and identity',()=>{
 const bank={policy:'TURAN200_ONLY',registry_count:200,registry:Array(200).fill({}),no_real_orders:true,source_mtf_at:'iso'};
 const x={schema:'uzayx.pnl.ledger.v1',scan_id:'scan',reconciled:true,no_real_orders:true,not_realized_exchange_pnl:true,
 starting_usdt:10000,total_pnl_usdt:-5,realized_usdt:-4,unrealized_usdt:-1,equity_usdt:9995,strategies:Array.from({length:200},(_,i)=>({id:'T'+String(i+1).padStart(3,'0')}))};
 const m={scan_id:'scan',publication_valid:true};const s={scan_id:'scan',source_mtf_at:'iso'};
 assert.equal(ui.sourcesMatch(x,m,bank,s),true);assert.equal(ui.sourcesMatch(x,m,{...bank,registry_count:199},s),false);
 assert.equal(ui.sourcesMatch({...x,realized_usdt:10},m,bank,s),false);
});
test('existing charts, open positions, navigation and one dynamic TURAN module retained',()=>{
 const html=read('web/uzayx/site.html');
 for(const id of ['mini-price','chart-price','home-open-list','cash-equity','turan','turan-legacy'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(html.includes('pnl-dashboard.js?v=3'));assert.ok(!html.includes('proof-preview-title'));
 assert.match(read('web/uzayx/pnl-dashboard.js'),/Ters psikoloji/);
});
