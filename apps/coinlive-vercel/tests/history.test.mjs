import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadHistory } from '../lib/history.mjs';
const commit='a'.repeat(40), scan='testscan';
const history=JSON.stringify({scan_id:scan,archived_total:4,events:[
 {event_id:'1',type:'WATCH_STARTED',symbol:'BTCUSDT',side:'LONG',event_time_utc:'2026-10-18T08:00:00Z'},
 {event_id:'2',type:'INVALIDATED',symbol:'ETHUSDT',side:'SHORT',event_time_utc:'2026-10-18T08:05:00Z'}]});
const manifest=JSON.stringify({publication_valid:true,no_real_orders:true,scan_id:scan,finished_at_utc:'2026-10-18T08:10:00Z',
 sources:{'v4-history-index':{sha256:crypto.createHash('sha256').update(history).digest('hex'),bytes:Buffer.byteLength(history)}}});
const provider=(content=history,manifestText=manifest)=>async url=>({
 ok:true,text:async()=>url.endsWith('/commits/main')?JSON.stringify({sha:commit}):
 url.endsWith('v4-manifest.json')?manifestText:content
});
test('pinned history verifies sha and orders newest first',async()=>{
 const x=await loadHistory({commit,fetcher:provider(),now:Date.parse('2026-10-18T08:11:00Z')});
 assert.equal(x.sourceVerified,true);assert.equal(x.events[0].type,'INVALIDATED');assert.equal(x.noRealOrders,true);
});
test('history preserves events but marks an outdated scan',async()=>{
 const x=await loadHistory({commit,fetcher:provider(),now:Date.parse('2026-10-18T09:11:00Z')});
 assert.equal(x.sourceStatus,'STALE_HISTORY');assert.equal(x.events.length,2);
});
test('tampered history fails closed',async()=>{
 await assert.rejects(loadHistory({commit,fetcher:provider(history+' '),now:Date.parse('2026-10-18T08:11:00Z')}),x=>x.code==='SOURCE_HASH_MISMATCH');
});
test('wrong pinned commit cannot silently substitute',async()=>{
 await assert.rejects(loadHistory({commit:'b'.repeat(40),fetcher:provider(),now:Date.parse('2026-10-18T08:11:00Z')}),x=>x.code==='SCAN_REFRESH_REQUIRED');
});
