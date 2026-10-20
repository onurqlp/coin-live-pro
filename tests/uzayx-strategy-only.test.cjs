const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const site=fs.readFileSync('web/uzayx/site.html','utf8');
test('200 only in TURAN with active charts and cash',()=>{
 assert.match(site,/id="turan-legacy" hidden/);
 assert.match(site,/pnl-dashboard\.js/);
 assert.doesNotMatch(site,/src="\.\/turan-ranking-ui\.js/);
 for(const id of ['mini-price','chart-price','home-open-list','cash-equity'])assert.ok(site.includes('id="'+id+'"'),id);
});
test('live observer fails closed if 200 bank is unavailable',()=>{
 const watch=require('../web/uzayx/watch.js');const now=Date.parse('2026-10-21T00:20:00Z');
 const data={strategyMode:true,manifest:{scan_id:'scan',publication_valid:true,no_real_orders:true,finished_at_utc:'2026-10-21T00:18:00Z'},spark:{scan_id:'scan',source_mtf_at:'2026-10-21T00:17:00Z'},strategyBank:{policy:'TURAN200_ONLY',registry_count:200,no_real_orders:true,source_mtf_at:'2026-10-21T00:17:00Z',updated_at:'2026-10-21T00:18:00Z',signals:[{strategy_id:'T033',symbol:'SOLUSDT',side:'LONG',paper_stage_number:3,price_at_scan:100,research_rank:77,source_observed_at_utc:'2026-10-21T00:18:00Z'}]}};
 let r=watch.buildGroups(data,'a'.repeat(40),now);assert.equal(r.valid,true);assert.equal(r.groups.SPARK[0].strategy_id,'T033');
 delete data.strategyBank;r=watch.buildGroups(data,'a'.repeat(40),now);assert.equal(r.valid,false);
});
