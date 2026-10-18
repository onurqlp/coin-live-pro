import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOverlay } from '../lib/overlay.mjs';
const sha = 'a'.repeat(40), produced = '2026-10-18T00:00:00Z';
const sample = {
  schema:'makine-coinlive-research-handoff-v1', generator:'MAKINE_CORE', generated_at_utc:produced,
  source_commit_sha:'b'.repeat(40), source_scan_id:'sid-1', source_integrity:'VERIFIED',
  can_execute_orders:false, can_modify_coins_live_ledger:false, can_modify_live_policy:false,
  can_promote_to_live_signal:false, new_trade_candidates:[],
  recommendations:[{ id:'M-31', idea:'Funding farkı', recommendation:'RESEARCH_ONLY', not_executable:true, priority:'B' }]
};
const fixture = (changes={}) => async url => ({ ok:true, text:async()=>JSON.stringify(url.endsWith('/commits/main') ? {sha} : {...sample,...changes}) });
test('fresh overlay pinned and read only',async()=>{const o=await loadOverlay({fetcher:fixture(),now:Date.parse(produced)+60_000});assert.equal(o.state,'READ_ONLY_RESEARCH');assert.equal(o.recommendations.length,1);assert.equal(o.changesCoreSignals,false);assert.equal(o.evidence.commit,sha);});
test('stale manual output cannot create current opportunities',async()=>{const o=await loadOverlay({fetcher:fixture(),now:Date.parse(produced)+46*60_000});assert.equal(o.state,'STALE');assert.deepEqual(o.recommendations,[]);assert.deepEqual(o.observations,[]);});
test('trade-enabled overlay rejected',async()=>{await assert.rejects(loadOverlay({fetcher:fixture({can_execute_orders:true}),now:Date.parse(produced)+60_000}),e=>e.code==='UNSAFE_OVERLAY');});
test('unexpected new trading candidate rejected',async()=>{await assert.rejects(loadOverlay({fetcher:fixture({new_trade_candidates:[{symbol:'BTCUSDT'}]}),now:Date.parse(produced)+60_000}),e=>e.code==='UNSAFE_OVERLAY');});
test('future timestamp and different schema rejected',async()=>{
 await assert.rejects(loadOverlay({fetcher:fixture({generated_at_utc:'2099-01-01T00:00:00Z'}),now:Date.parse(produced)+60_000}),e=>e.code==='INVALID_OVERLAY_TIMESTAMP');
 await assert.rejects(loadOverlay({fetcher:fixture({schema:'invalid'}),now:Date.parse(produced)+60_000}),e=>e.code==='UNSAFE_OVERLAY');
});
