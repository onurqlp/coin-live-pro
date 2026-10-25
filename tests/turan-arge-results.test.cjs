'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../web/uzayx/turan/turan.js','utf8');
function read(){const match=source.match(/  function researchComparison\([\s\S]*?\n  \}/);assert.ok(match,'version-aware paired result helper missing');const ctx={};vm.runInNewContext(match[0]+';this.read=researchComparison;',ctx);return ctx.read;}
test('missing paired evidence cannot be called profit',()=>{const fn=read();assert.equal(fn({},'v2').length,0);});
test('different versions and different pair denominators stay separate',()=>{
 const fn=read();const data={cohorts:[{strategy_id:'T001',strategy_version:'v2',original_inverse:{paired_count:3,original_modeled_usdt:-2,inverse_modeled_usdt:4,excluded_count:2},original_wait:{paired_count:1,original_modeled_usdt:8,wait_modeled_usdt:9}},
 {strategy_id:'T001',strategy_version:'v1',original_inverse:{paired_count:200,original_modeled_usdt:100,inverse_modeled_usdt:300}}]};
 const result=fn(data,'v2');assert.equal(result.length,1);assert.equal(result[0].pairs,3);assert.equal(result[0].original,-2);assert.equal(result[0].inverse,4);assert.equal(result[0].excluded,2);assert.equal(result[0].waitPairs,1);assert.equal(result[0].waitOriginal,8);
});
test('zero paired forecasts means comparison unavailable',()=>{
 const match=source.match(/  function forecastQualityLabel\([\s\S]*?\n  \}/);assert.ok(match,'zero-denominator forecast quality label missing');
 const ctx={};vm.runInNewContext(match[0]+';this.label=forecastQualityLabel;',ctx);
 assert.equal(ctx.label({paired_count:0,beats_zero_baseline:false}),'Karşılaştırılabilir kapanmış tahmin bekleniyor');
 assert.equal(ctx.label({paired_count:2,beats_zero_baseline:false}),'Bu kesitte referansı geçemedi');
});
