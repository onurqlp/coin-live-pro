import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {loadChart} from '../lib/chart.mjs';
import {SourceError} from '../lib/snapshot.mjs';
const SHA='a'.repeat(40), NOW=Date.parse('2026-10-17T23:20:00Z');
const raw=JSON.stringify;
const sha256=x=>crypto.createHash('sha256').update(Buffer.from(x)).digest('hex');
const blob=x=>crypto.createHash('sha1').update(`blob ${Buffer.byteLength(x)}\0`).update(x).digest('hex');
function fixture({alterBlob=false,changeHistory=false}={}){
 const times=Array.from({length:14},(_,i)=>Date.parse('2026-10-17T10:00:00Z')+i*3600000);
 const pack={source:'OKX_CLOSED_CANDLES',chart_only:true,no_real_orders:true,source_mtf_at:'2026-10-17T23:10:00Z',candles_by_symbol:{BTCUSDT:{'1H':times.map((t,i)=>[t,100+i,102+i,99+i,101+i,1])}}};
 const history={scan_id: 'scan-123',events:[{symbol:'BTCUSDT',type:'INVALIDATED',event_time_utc:'2026-10-17T19:05:00Z',side:'SHORT'}]};
 const hs=raw(history),cs=raw(pack);
 const manifest={publication_valid:true,no_real_orders:true,scan_id:'scan-123',started_at_utc:'2026-10-17T23:10:00Z',finished_at_utc:'2026-10-17T23:15:00Z',sources:{'v4-history-index':{bytes:Buffer.byteLength(hs),sha256:sha256(hs)}}};
 const tree={tree:[{path:'web/data/chart-pack.json',type:'blob',sha:alterBlob?'b'.repeat(40):blob(cs)}]};
 const fetcher=async url=>{const data=url.endsWith('/commits/main')?{sha:SHA}:url.endsWith('/v4-manifest.json')?manifest:url.includes('/git/trees/')?tree:url.endsWith('/chart-pack.json')?pack:url.endsWith('/v4-history-index.json')?changeHistory?{scan_id:'bad',events:[]}:history:null;return {ok:data!==null,status:200,text:async()=>raw(data)};};
 return {fetcher};
}
test('chart renders only fully closed bars and observation markers after signed Git blob validation',async()=>{
 const r=await loadChart({fetcher:fixture().fetcher,symbol:'BTCUSDT',timeframe:'1H',commit:SHA,now:NOW});
 assert.equal(r.candles.length,13); // candle 23:00 is not closed at 23:15
 assert.equal(r.excludedUnclosedCount,1);
 assert.equal(r.sourceValidation,'GIT_COMMIT_BLOB_SHA1_PLUS_HISTORY_MANIFEST_SHA256');
 assert.equal(r.markers.length,1);assert.equal(r.markers[0].notExecution,true);
 assert.equal(r.noRealOrders,true);
});
test('tampered chart-pack rejected',async()=>{
 await assert.rejects(loadChart({fetcher:fixture({alterBlob:true}).fetcher,commit:SHA,now:NOW}),x=>x instanceof SourceError&&x.code==='CHART_HASH_MISMATCH');
});
test('different history scan rejected',async()=>{
 const f=fixture({changeHistory:true});
 await assert.rejects(loadChart({fetcher:f.fetcher,commit:SHA,now:NOW}),x=>x instanceof SourceError&&x.code==='HISTORY_HASH_MISMATCH');
});
test('invalid symbol rejected and missing timeframe cannot fake candle',async()=>{
 await assert.rejects(loadChart({fetcher:fixture().fetcher,symbol:'BTC/USDT',commit:SHA,now:NOW}),x=>x.code==='BAD_CHART_PARAMETERS');
 await assert.rejects(loadChart({fetcher:fixture().fetcher,timeframe:'15m',commit:SHA,now:NOW}),x=>x.code==='BAD_CHART_PARAMETERS');
});
test('commit roll-over causes refresh rather than overlaying mismatched scans',async()=>{
 await assert.rejects(loadChart({fetcher:fixture().fetcher,commit:'c'.repeat(40),now:NOW}),x=>x.code==='SCAN_REFRESH_REQUIRED');
});
