'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=path=>fs.readFileSync(path,'utf8');
const source=JSON.parse(read('web/uzayx/turan-families-v1.json'));
const backup=JSON.parse(read('web/uzayx/turan-200-data.json'));
const {filterFamilies,scenarioText,groupDesign}=require('../web/uzayx/turan-families.js');
const page=read('web/uzayx/site.html'),app=read('web/uzayx/index.html');
test('All 200 user-supplied research families are complete and traceable',()=>{
 assert.equal(source.schema,'uzayx.turan.research_family_catalog.v1');
 assert.equal(source.family_count,200);assert.equal(source.category_count,20);
 assert.equal(source.verification,'UNVALIDATED_HYPOTHESES');
 assert.equal(source.not_automatic_execution,true);assert.equal(source.not_real_trades,true);
 assert.equal(source.families.length,200);assert.equal(new Set(source.families.map(x=>x.name)).size,200);
 assert.equal(new Set(source.families.map(x=>x.id)).size,200);
 source.families.forEach((x,i)=>{assert.equal(x.id,'T'+String(i+1).padStart(3,'0'));assert.ok(x.name&&x.mechanism&&x.category);assert.match(x.status,/AR-GE/);assert.ok(groupDesign[x.category]);});
 assert.deepEqual(Object.values(source.category_sizes),Array(20).fill(10));
 assert.equal(source.families[0].name,'Bozkurt İzi');assert.equal(source.families[199].name,'Tengri İşlemsizlik');
});
test('Both retained source representations have the same 200 unique codes and names',()=>{
 assert.equal(backup.items.length,200);
 assert.deepEqual(backup.items.map(x=>x.id),source.families.map(x=>x.id));
 assert.deepEqual(backup.items.map(x=>x.name),source.families.map(x=>x.name));
});
test('Research browsing and independent directions never imply confirmed trade results',()=>{
 assert.equal(filterFamilies(source.families,{category:'FIYAT ANOMALILERI'}).length,10);
 assert.ok(filterFamilies(source.families,{query:'T200'}).some(x=>x.id==='T200'));
 assert.ok(filterFamilies(source.families,{query:'Bozkurt İzi'}).some(x=>x.id==='T001'));
 assert.equal(filterFamilies(source.families,{query:'THIS_DOES_NOT_EXIST'}).length,0);
 for(const side of ['LONG','SHORT','BEKLE','NO_TRADE'])assert.match(scenarioText(side,source.families[0]),/Araştırma senaryosu/);
 assert.match(scenarioText('LONG',source.families[0]),/giriş önerisi değildir/);
});
test('TURAN 200 only, old UI archived and ATLAS independent',()=>{
 for(const x of ['id="turan-current-group"','id="turan-research-group"','id="turan-families-root"','id="turan-catalog"','id="volcano-atlas"','data-turan-mode="current"','data-turan-mode="research"'])assert.ok(page.includes(x),x);
 assert.ok(page.includes('id="turan-legacy" hidden'));
 assert.ok(page.includes('src="./pnl-dashboard.js'));
 assert.ok(!page.includes('src="./turan-ranking-ui.js'));
 assert.match(page,/href="\.\/turan-families\.css(?:\?v=[^"]+)?"/);
 assert.match(app,/<iframe[^>]*src="\.\/site\.html"/);
 assert.match(app,/location\.reload/);
});
test('Research-only controller parses and has no automatic trading gateway',()=>{
 const js=read('web/uzayx/turan-families.js');new vm.Script(js);
 for(const word of ['LONG','SHORT','BEKLE','NO_TRADE','Görünen detayları aç','24 aile daha göster','test'])assert.ok(js.includes(word),word);
 assert.doesNotMatch(js,/\b(createOrder|placeOrder|submitOrder|sendOrder)\s*\(/i);
});
