'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const get=p=>fs.readFileSync(p,'utf8');
const js=get('web/uzayx/turan-catalog.js'),html=get('web/uzayx/site.html'),shell=get('web/uzayx/index.html'),app=get('web/uzayx/app.js'),coreUi=get('web/uzayx/turan/turan.js'),coreHtml=get('web/uzayx/turan/index.html');
test('Thirty distinct named TURAN designs, seven real forward observation mappings',()=>{
 const m=js.match(/const raw=(\[[\s\S]*?\]);\s*const kinds=/);
 assert.ok(m,'machine-readable strategy registry found');
 const data=JSON.parse(m[1]);
 assert.equal(data.length,30);
 assert.equal(new Set(data.map(x=>x[0])).size,30);
 assert.ok(data.every(x=>x.length===11&&x[3]&&x[4]&&x[5]&&x[6]&&x[7]));
 const sources=data.filter(x=>x[10]==='source');
 assert.equal(sources.length,7);
 assert.deepEqual(new Set(sources.map(x=>x[8])),new Set(['TREND_BREAKOUT','VOLUME_EXPANSION','BREAKOUT_RETEST','REVERSAL_SETUP','VOLATILITY_SQUEEZE','OI_FUNDING_PRESSURE','SHORT_BREAKDOWN']));
 assert.equal(data.filter(x=>x[10]==='blend').length,3);
});
test('TURAN isolated from preserved ATLAS, with expandable status and model evidence',()=>{
 assert.match(html,/id="turan"/);
 assert.match(html,/id="volcano-atlas"/);
 assert.match(html,/id="turan-catalog"/);
 assert.match(html,/data-tab="turan"/);
 assert.match(html,/data-dock="turan"/);
 assert.match(html,/src="\.\/atlas\.js"/);
 assert.match(js,/Tüm detayları aç/);
 assert.match(js,/forward_horizons/);
 assert.match(js,/evidence_sufficient_for_comparison|Yetersiz örneklem/);
 assert.match(app,/'turan','research','system'/);
});
test('Installed app and website keep the same actual HTML code',()=>{
 assert.match(shell,/<iframe[^>]+src="\.\/site\.html"/);
 assert.match(shell,/location\.reload/);
 assert.doesNotMatch(shell,/src="\.\/app\.js"/);
});
test('TURAN exposes latest 200-ID cycle and per-strategy decision states',()=>{
 assert.match(coreUi,/cycle_evaluation/);
 assert.match(coreUi,/last_cycle_evaluation/);
 for(const state of ['SIGNAL','NO_SIGNAL','BLOCKED_SOURCE','CONTROL_RESEARCH_ONLY'])assert.ok(coreUi.includes(state),state);
 assert.match(coreHtml,/turan\.js\?v=2/);
});
test('All TURAN scripts parse',()=>{
 for(const path of ['web/uzayx/turan-catalog.js','web/uzayx/turan.js','web/uzayx/mobile-shell.js','web/uzayx/turan/turan.js'])new vm.Script(get(path),{filename:path});
});
