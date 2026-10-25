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
test('newer same-version verified archive replaces stale embedded replay only',()=>{
 const match=source.match(/  function preferVerifiedReplay\([\s\S]*?\n  \}/);
 assert.ok(match,'independent historical report selection missing');
 const ctx={};vm.runInNewContext(match[0]+';this.pick=preferVerifiedReplay;',ctx);
 const current={rule_version:'v2',replay:{generated_at_utc:'2026-10-25T10:00:00Z',symbols_replayed:4}};
 const newer={schema:'turan.replay.v1',no_real_orders:true,strategy_version:'v2',source:'BINANCE_VERIFIED_MONTHLY_1H',complete_net_usdt:null,
   generated_at_utc:'2026-10-25T11:00:00Z',symbols_replayed:16};
 assert.equal(ctx.pick(current,newer).symbols_replayed,16);
 assert.equal(ctx.pick(current,{...newer,strategy_version:'v1'}).symbols_replayed,4);
 assert.equal(ctx.pick(current,{...newer,no_real_orders:false}).symbols_replayed,4);
 assert.equal(ctx.pick(current,{...newer,generated_at_utc:'2026-10-25T09:00:00Z'}).symbols_replayed,4);
});
