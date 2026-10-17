import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('web/chart-guidance.js','utf8');
const context={};vm.runInNewContext(source,context);
const {build,render,format}=context.CoinLiveChartGuidance;
const NOW=Date.parse('2026-10-17T11:30:00Z');
const iso=x=>new Date(x).toISOString();
const frame=(trend,t,levelHi,levelLo,atr=2)=>({
 quality:'CLOSED_CONFIRMED',trend,last_candle_utc:iso(t),
 breakout_high_prev8:levelHi,breakout_low_prev8:levelLo,atr_pct:atr,volume_ratio_20:1.2
});
const frames={
 '1H':frame('UP',NOW-2*3600000,110,90,2),
 '4H':frame('UP',NOW-8*3600000,120,80,3),
 '1D':frame('UP',NOW-48*3600000,125,75,5),
 '1W':frame('UP',NOW-14*86400000,135,65,6)};
const mtf={fetched_at:iso(NOW-60000),candidates:[{
 symbol:'BTCUSDT',side:'LONG',observed_at_utc:iso(NOW-60000),
 price_reference:105,frames,score:70
}]};
const model={manifest:{finished_at_utc:iso(NOW-30000)},mtf,
 early:{candidates:[{symbol:'BTCUSDT',side:'LONG',price_at_scan:105,
  research_tier:'ERKEN_SINYAL',hourly_level:110,
  source_observed_at_utc:iso(NOW-60000),reasons:['1H_SUPPORT']}]},
 radar:{watch:[],motion:[],spotlight:[]}};
const plan=build({symbol:'BTCUSDT',side:'LONG',model,nowMs:NOW});
assert.equal(plan.mode,'ATR_RESEARCH_PROJECTION');
assert.equal(plan.entry,110);
assert.equal(plan.stop,107.8);
assert.ok(Math.abs(plan.targets[0]-112.2)<1e-9);
assert.ok(Math.abs(plan.targets[2]-116.6)<1e-9);
assert.deepEqual(Array.from(plan.levels.slice(-3),x=>x.label),['TP1','TP2','TP3']);
assert.ok(plan.levels.some(x=>x.label==='4H EŞİK'));
assert.ok(plan.levels.some(x=>x.label==='1D EŞİK'));
assert.match(render(plan),/Model ne düşünüyor\?/);
assert.match(render(plan),/KOŞULLU TP SENARYOSU/);
assert.match(render(plan),/1H ATR/);
assert.equal(plan.fresh,true);
assert.equal(build({symbol:'BTCUSDT',side:'LONG',model,nowMs:NOW+40*60000}).fresh,false);
const shortFrames=Object.fromEntries(Object.entries(frames).map(([tf,v])=>
 [tf,{...v,trend:'DOWN'}]));
const shortModel={...model,mtf:{...mtf,candidates:[{...mtf.candidates[0],side:'SHORT',frames:shortFrames}]},
 early:{candidates:[{symbol:'BTCUSDT',side:'SHORT',hourly_level:90,price_at_scan:95,
  research_tier:'KIVILCIM',source_observed_at_utc:iso(NOW-60000)}]}};
const down=build({symbol:'BTCUSDT',side:'SHORT',model:shortModel,nowMs:NOW});
assert.equal(down.entry,90);
assert.ok(Math.abs(down.stop-91.8)<1e-9);
assert.ok(Math.abs(down.targets[0]-88.2)<1e-9);
const explicit={...model,radar:{spotlight:[{
 symbol:'BTCUSDT',side:'LONG',price:100,stop:96,targets:[104,108,112],
 lifecycle_stage:'SPOTLIGHT',score:89,last_evaluated_at:iso(NOW-1000)
}],motion:[],watch:[]}};
const sourcePlan=build({symbol:'BTCUSDT',side:'LONG',model:explicit,nowMs:NOW});
assert.equal(sourcePlan.mode,'SOURCE_RESEARCH_LEVELS');
assert.deepEqual(Array.from(sourcePlan.targets),[104,108,112]);
assert.equal(sourcePlan.entry,100);
const absent=build({symbol:'ETHUSDT',model:{manifest:model.manifest},nowMs:NOW});
assert.equal(absent.mode,'NO_LEVEL');
assert.deepEqual(Array.from(absent.targets),[]);
assert.doesNotMatch(render(absent),/TP1/);
const partial=build({symbol:'BTCUSDT',side:'LONG',model:{
 ...model,mtf:{fetched_at:mtf.fetched_at,candidates:[{...mtf.candidates[0],
 frames:{...frames,'1H':{...frames['1H'],atr_pct:null}}}]}
},nowMs:NOW});
assert.equal(partial.mode,'NO_LEVEL');
assert.equal(partial.stop,null);
assert.match(format(.000003989),/0\.000003989/);
console.log('PASS: deterministic verified 1H/4H/1D graph scenario, original V4 targets, symmetric SHORT and honest no-data cases.');
