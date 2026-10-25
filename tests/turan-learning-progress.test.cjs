'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../web/uzayx/turan/turan.js'),'utf8');
const page=fs.readFileSync(path.join(__dirname,'../web/uzayx/turan/index.html'),'utf8');
const extract=name=>{
 const match=source.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  \\}`));
 assert.ok(match,`${name} helper exists`);
 return match[0];
};
const context={};
vm.runInNewContext(`${extract('learningProgressSummary')}\n${extract('paperEvidenceSummary')}\n${extract('learningStage')}\n${extract('journeySummary')}\nthis.summarize=learningProgressSummary;this.cash=paperEvidenceSummary;this.stage=learningStage;this.journey=journeySummary;`,context);

test('cash evidence is shown only when it matches the same verified read-only scan',()=>{
 const snapshot={source_scan_id:'scan-a',paper_evidence:{scan_id:'scan-a',source:'OKX_MODELLED_PAPER_LEDGER',reconciled:true,no_real_orders:true,starting_usdt:10000,equity_usdt:9613.95,total_pnl_usdt:-386.05,fees_estimated_usdt:92.82,closed_count:240,open_count:15,funding:'UNMODELED',liquidation:'UNVERIFIED'}};
 const cash=context.cash(snapshot);
 assert.equal(cash.totalPnl,-386.05);assert.equal(cash.equity,9613.95);assert.equal(cash.closed,240);assert.equal(cash.open,15);
 assert.equal(cash.funding,'UNMODELED');assert.equal(cash.liquidation,'UNVERIFIED');
 assert.equal(context.cash({...snapshot,paper_evidence:{...snapshot.paper_evidence,scan_id:'scan-b'}}),null);
 assert.equal(context.cash({...snapshot,paper_evidence:{...snapshot.paper_evidence,no_real_orders:false}}),null);
});

test('summary derives coverage, maturation and validation gap from current report only',()=>{
 const summary=context.summarize({totals:{registered:230,bank:200,prospective_predictions:345,settled_predictions:55,verified_profitable:0},learning:{validation_span_days:3.917,shadow_champion:null},contest:{selection_requires_days:7},strategies:[]});
 assert.equal(summary.expected,200);assert.equal(summary.evaluated,0);assert.equal(summary.missing,200);
 assert.equal(summary.maturedPct,55/345*100);assert.equal(summary.daysRemaining,3.083);
 assert.equal(summary.cyclePublished,false);assert.equal(summary.independentlyVerified,0);
});

test('latest cycle counts are reported without inventing missing coverage',()=>{
 const summary=context.summarize({totals:{bank:200,prospective_predictions:10,settled_predictions:2},learning:{validation_span_days:8},contest:{selection_requires_days:7},cycle_evaluation:{expected_count:200,checked_count:198,missing_count:2,rule_evaluated_count:51,data_ready_count:47,status_counts:{BLOCKED_SOURCE:100,SIGNAL:4,NO_SIGNAL:47}}});
 assert.equal(summary.evaluated,198);assert.equal(summary.missing,2);assert.equal(summary.ruleEvaluated,51);assert.equal(summary.dataReady,47);assert.equal(summary.blocked,100);assert.equal(summary.daysRemaining,0);assert.equal(summary.cyclePublished,true);
});

test('per-strategy learning stage honors source blocks and closed evidence',()=>{
 assert.equal(context.stage({state:'BLOCKED_REQUIRED_EVIDENCE',paper_closed:3}),'Kaynak bekliyor');
 assert.equal(context.stage({state:'IMPLEMENTED_FORWARD_PAPER',paper_closed:1}),'Sonuç birikiyor');
 assert.equal(context.stage({state:'IMPLEMENTED_FORWARD_PAPER',last_cycle_evaluation:{status:'NO_SIGNAL'}}),'Döngüde değerlendirildi');
 assert.equal(context.stage({state:'IMPLEMENTED_FORWARD_PAPER'}),'İleri gözlem');
 assert.equal(context.stage({state:'IMPLEMENTED_CONTROL',paper_closed:4}),'Kontrol / araştırma');
});

test('desktop and six-item mobile navigation point to the published progress section',()=>{
 assert.match(page,/data-view="progress"/);assert.match(page,/id="view-progress"/);
 assert.match(page,/learning-progress-kpis/);assert.match(page,/learning-progress-strategies/);
 const mobile=page.match(/<nav class="mobile-nav"[\s\S]*?<\/nav>/)?.[0]||'';
 assert.equal((mobile.match(/data-view=/g)||[]).length,6);
 assert.match(page,/turan\.js\?v=6/);assert.match(page,/turan\.css\?v=4/);
 assert.match(page,/id="journey-panel"/);
});

test('journey accepts matching deduplicated snapshots and refuses mismatched scans',()=>{
 const snapshot=require('../web/data/turan-core.json');
 const ops=require('../web/data/ops-report.json');
 const experiments=require('../web/data/turan-experiments.json');
 const spark=require('../web/data/v4-spark-paper.json');
 const summary=context.journey(snapshot,{ops,experiments,spark});
 assert.equal(summary.available,true);
 assert.equal(summary.closed,ops.cohorts['TÜMÜ'].closed);
 assert.equal(summary.positive+summary.negative,summary.closed);
 assert.equal(summary.reliable,snapshot.totals.verified_profitable);
 assert.equal(summary.sevenChange,null);
 assert.equal(context.journey(snapshot,{ops:{...ops,cohorts:{'TÜMÜ':{closed:999,positive:1,negative:1}}},experiments,spark}).available,false);
 assert.equal(context.journey(snapshot,null).available,false);
});

test('journey keeps all-time totals when only a rolling daily window remains',()=>{
 const snapshot=require('../web/data/turan-core.json');
 const ops=require('../web/data/ops-report.json');
 const experiments=require('../web/data/turan-experiments.json');
 const spark=require('../web/data/v4-spark-paper.json');
 const recent={...ops,daily:ops.daily.slice(0,4)};
 const summary=context.journey(snapshot,{ops:recent,experiments,spark});
 assert.equal(summary.available,true);
 assert.equal(summary.closed,ops.cohorts['TÜMÜ'].closed);
 assert.equal(summary.dayCount,4);
 assert.equal(summary.sevenNet,null);
 const future={...snapshot,paper_evidence:{...snapshot.paper_evidence,closed_count:ops.cohorts['TÜMÜ'].closed+10}};
 const futureOps={...ops,cohorts:{...ops.cohorts,'TÜMÜ':{...ops.cohorts['TÜMÜ'],closed:ops.cohorts['TÜMÜ'].closed+10,positive:ops.cohorts['TÜMÜ'].positive+4,negative:ops.cohorts['TÜMÜ'].negative+6}},experimental_spark:{...ops.experimental_spark,closed_cohort_count:ops.cohorts['TÜMÜ'].closed+10,positive_closed:ops.cohorts['TÜMÜ'].positive+4,negative_closed:ops.cohorts['TÜMÜ'].negative+6}};
 assert.equal(context.journey(future,{ops:futureOps,experiments,spark}).available,true);
 assert.equal(context.journey(snapshot,{ops:{...ops,daily:[...ops.daily,ops.daily[0]]},experiments,spark}).available,false);
});
