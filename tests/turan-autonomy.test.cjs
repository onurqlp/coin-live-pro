'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../web/uzayx/turan/turan.js'),'utf8');
const match=source.match(/  function autonomyState\([\s\S]*?\n  \}/);
assert.ok(match,'autonomyState helper exists');
const context={};vm.runInNewContext(match[0]+'\nthis.evaluate=autonomyState;',context);
const now=Date.parse('2026-10-25T16:00:00Z');
const core={generated_at_utc:'2026-10-25T15:55:00Z'};
const health={updated_at:'2026-10-25T15:55:00Z',status:'DEGRADED_SCHEDULE_GAP',last_trigger:'workflow_dispatch',missed_slots_latest:1};
test('recent external dispatch with missed scheduled slot is not presented as reliable scheduled delivery',()=>{
 const result=context.evaluate(core,health,now);
 assert.equal(result.kind,'warn');assert.match(result.title,/zamanlama boşluğu/i);
 assert.match(result.trigger,/harici/i);assert.doesNotMatch(result.title,/zamanlayıcı.*çalışıyor/i);
});
test('stale core or market health blocks a current status independently',()=>{
 assert.equal(context.evaluate({...core,generated_at_utc:'2026-10-25T15:20:00Z'},health,now).kind,'stale');
 assert.equal(context.evaluate(core,{...health,updated_at:'2026-10-25T15:20:00Z'},now).kind,'stale');
});
test('missing health is unverified and fresh scheduled scan is recognized without uptime promise',()=>{
 assert.equal(context.evaluate(core,null,now).kind,'unknown');
 const result=context.evaluate(core,{...health,status:'OK',last_trigger:'schedule',missed_slots_latest:0},now);
 assert.equal(result.kind,'ok');assert.match(result.trigger,/zamanlayıcı/i);
});
