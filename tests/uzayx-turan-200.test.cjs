'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const catalog=JSON.parse(read('web/uzayx/turan-200-data.json'));
const page=read('web/uzayx/site.html');
const app=read('web/uzayx/index.html');
test('all 200 source-derived TURAN families are complete and independent',()=>{
 assert.equal(catalog.schema,'turan-research-200-v1');
 assert.equal(catalog.items.length,200);
 assert.equal(catalog.groups.length,20);
 assert.equal(new Set(catalog.items.map(x=>x.id)).size,200);
 assert.deepEqual(catalog.items.map(x=>x.id),Array.from({length:200},(_,i)=>'T'+String(i+1).padStart(3,'0')));
 for(const g of catalog.groups){
   assert.equal(catalog.items.filter(x=>x.family===g.name).length,10);
 }
 for(const x of catalog.items){
   assert.ok(x.name.trim()&&x.hypothesis.trim()&&x.family.trim());
   assert.equal(x.status,'HYPOTHESIS_UNVERIFIED');
 }
 assert.equal(catalog.items[0].name,'Bozkurt İzi');
 assert.equal(catalog.items.at(-1).name,'Tengri İşlemsizlik');
});
test('200 families cannot be mistaken for actual live/backtested/verified strategies',()=>{
 for(const key of ['is_a_proposal','all_unverified','not_live_strategies','not_a_backtest','not_executable','no_profit_claims','requires_forward_oos_and_cost_validation','preexisting_30_are_separate'])assert.equal(catalog[key],true);
});
test('TURAN v200 display keeps old 30, separate ATLAS and true embedded web/PWA interface',()=>{
 assert.match(page,/id="turan-200-root"/);
 assert.match(page,/id="turan-old-view" hidden/);
 assert.match(page,/id="turan-catalog"/);
 assert.match(page,/id="volcano-atlas"/);
 assert.match(page,/data-turan-view="new"/);
 assert.match(page,/data-turan-view="old"/);
 assert.match(page,/src="\.\/turan-200\.js/);
 assert.match(page,/href="\.\/turan-200\.css/);
 assert.match(app,/<iframe[^>]*src="\.\/site\.html"/);
});
test('TURAN direction controls test all scenarios separately without execution',()=>{
 const js=read('web/uzayx/turan-200.js');
 new vm.Script(js);
 for(const word of ["LONG","SHORT","WAIT","NO_TRADE","Maliyet","Yön seç","Tüm grupları aç","Ters"])assert.ok(js.includes(word),'missing '+word);
 assert.doesNotMatch(js,/\b(createOrder|placeOrder|submitOrder|sendOrder)\s*\(/i);
});
