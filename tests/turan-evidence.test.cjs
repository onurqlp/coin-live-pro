'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../web/uzayx/turan/turan.js','utf8');
const match=source.match(/  function strategyEvidenceSummary\([\s\S]*?\n  \}/);
test('isolated evidence rejects mismatched or mixed-cash experiments',()=>{
 assert.ok(match,'strategyEvidenceSummary helper exists');
 const ctx={};vm.runInNewContext(match[0]+';this.read=strategyEvidenceSummary;',ctx);
 const x={source_scan_id:'scan',attribution:{counts:{EXACT:2,RECONSTRUCTED:3,CANDIDATE:1,UNATTRIBUTED:4}},experiments:{scan_id:'scan',no_real_orders:true,separate_from_shared_cash:true,experiment_count:10,new_evidence_count:2,no_new_evidence_count:198}};
 assert.equal(ctx.read(x).experiments.experiment_count,10);
 assert.equal(ctx.read({...x,experiments:{...x.experiments,scan_id:'old'}}).experiments,null);
 assert.equal(ctx.read({...x,experiments:{...x.experiments,separate_from_shared_cash:false}}).experiments,null);
});
