const test=require('node:test'),assert=require('node:assert/strict');
const desk=require('../web/uzayx/research-desk.js');
const now=Date.parse('2026-10-20T00:00:00Z');
const valid=()=>({schema:'uzayx.research.v1',scan_id:'s',no_real_orders:true,research_only:true,
  source_finished_at_utc:new Date(now).toISOString(),account:{reconciled:true,equity_usdt:9995}});
test('research money requires the same pinned scan, provenance and freshness',()=>{
 assert.equal(desk.accept(valid(),{scan_id:'s',publication_valid:true},'a'.repeat(40),now).valid,true);
 assert.equal(desk.accept(valid(),{scan_id:'other',publication_valid:true},'a'.repeat(40),now).valid,false);
 assert.equal(desk.accept(valid(),{scan_id:'s',publication_valid:true},null,now).valid,false);
 assert.equal(desk.accept(valid(),{scan_id:'s',publication_valid:true},'a'.repeat(40),now+26*60000).valid,false);
});
test('a cash mismatch never becomes an apparent zero-loss success',()=>{
 const d=valid();d.account.reconciled=false;
 assert.equal(desk.accept(d,{scan_id:'s',publication_valid:true},'a'.repeat(40),now).valid,false);
});
