'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {summarize}=require('../web/uzayx/turan-finance.js');
const ops=JSON.parse(fs.readFileSync('web/data/ops-report.json','utf8'));
const paper=JSON.parse(fs.readFileSync('web/data/v4-spark-paper.json','utf8'));
const site=fs.readFileSync('web/uzayx/site.html','utf8');
test('Money summaries reconcile the exact matching audited scan',()=>{
 const d=summarize(ops,paper);
 assert.equal(d.realMoney,false);
 assert.equal(d.openCount,paper.summary.counts.OPEN);
 assert.equal(d.closedCount,paper.summary.counts.CLOSED);
 assert.equal(d.equity,ops.experimental_spark.virtual_equity_usdt);
 assert.equal(d.realized,ops.experimental_spark.realized_net_usdt);
 assert.equal(d.unrealized,ops.experimental_spark.unrealized_net_usdt);
 assert.equal(d.complete,true);
 assert.equal(d.open.length,d.openCount);
 assert.ok(d.closed.length<=d.closedCount);
 if(d.closedComplete){assert.equal(d.closed.length,d.closedCount);assert.ok(Math.abs(d.closedWins+d.closedLosses-d.closedNet)<0.05)}
 assert.ok(Math.abs(d.notional-paper.summary.open_reference_exposure_usdt)<0.05);
 assert.ok(Math.abs(d.unrealized-d.open.reduce((s,r)=>s+(r.unrealized_net_usdt||0),0))<0.05);
 assert.ok(d.margin>=0);
});
test('Strict V4 and experimental paper remain independent and not real money',()=>{
 assert.equal(ops.real_orders,false);
 assert.equal(paper.no_real_orders,true);
 assert.equal(paper.combined_with_strict_paper_cash,false);
 assert.equal(ops.strict_v4_account.independent_from_experimental,true);
});
test('Mixed scan or incomplete paper source blocks false money claims',()=>{
 assert.throws(()=>summarize({...ops,source_scan_id:'MISMATCH'},paper));
 assert.throws(()=>summarize({...ops,real_orders:true},paper));
 assert.throws(()=>summarize(ops,{...paper,summary:{...paper.summary,open_reference_exposure_usdt:-1}}));
});
test('New visible UX has one 30 tab, one 200 tab, independent ATLAS and trade drilldown',()=>{
 assert.match(site,/id="turan-current-group"/);
 assert.match(site,/id="turan-research-group"/);
 assert.match(site,/id="turan-cash-view"/);
 assert.match(site,/id="turan-families-root"/);
 assert.match(site,/id="turan-catalog"/);
 assert.match(site,/id="volcano-atlas"/);
 assert.equal((site.match(/data-turan-mode=/g)||[]).length,2);
 assert.doesNotMatch(site,/data-turan-view=/);
 assert.match(site,/src="\.\/turan-finance\.js/);
 assert.match(site,/href="\.\/turan-finance\.css/);
 assert.doesNotMatch(site,/src="\.\/turan-200\.js/);
});
