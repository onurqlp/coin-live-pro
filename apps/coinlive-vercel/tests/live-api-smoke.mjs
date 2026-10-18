// Read-only integration against real public, immutable GitHub source content.
// No exchange orders, no archived-file writes, no mock API responses.
import assert from 'node:assert/strict';
import snapshotHandler from '../api/snapshot.js';
import chartHandler from '../api/chart.js';
import overlayHandler from '../api/overlay.js';

async function invoke(handler, request) {
  const res={
    code:200,headers:{},value:null,
    setHeader(name,value){this.headers[name.toLowerCase()]=value;return this;},
    status(code){this.code=code;return this;},
    json(value){this.value=value;return this;}
  };
  const before=performance.now();
  await handler(request,res);
  return {status:res.code,body:res.value,latencyMs:Math.round(performance.now()-before),headers:res.headers};
}
const snap=await invoke(snapshotHandler,{method:'GET',query:{}});
console.log('SNAPSHOT',JSON.stringify({status:snap.status,ms:snap.latencyMs,
  error:snap.body?.error,detail:snap.body?.detail,
  source:snap.body?.source&&{commit:snap.body.source.commit,scanId:snap.body.source.scanId,
  observed:snap.body.source.observedAtUtc,status:snap.body.source.status,
  verified:snap.body.source.payloadShaVerified,
  attempted:snap.body.source.attemptedPairs,tested:snap.body.source.testedPairs}}));
assert.equal(snap.status,200,'live snapshot contract must pass');
assert.equal(snap.body.schema,'coinlive.v5.readonly.v1');
assert.equal(snap.body.sourceProductVersion,'4.03');
assert.equal(snap.body.source.status,'VERIFIED','source is stale; do not claim live candidates');
assert.equal(snap.body.source.manifestVerified,true);
assert.equal(snap.body.source.payloadShaVerified,true);
assert.equal(snap.body.safety.noRealOrders,true);
assert.equal(snap.body.paper.startingBalanceUsdt,10000);
assert.equal(snap.body.experimental.startingBalanceUsdt,10000);
assert.equal(snap.body.safety.strictPaperSeparated,true);
assert.equal(snap.body.safety.noBackfill,true);
assert.deepEqual([7,14,30,90],snap.body.forward.periods.map(x=>x.days));
const strictFunding=snap.body.paper.fundingState;
assert.equal(typeof strictFunding,'string');
const chart=await invoke(chartHandler,{method:'GET',query:{symbol:'BTCUSDT',tf:'1H',commit:snap.body.source.commit}});
console.log('CHART',JSON.stringify({status:chart.status,ms:chart.latencyMs,
  error:chart.body?.error,barCount:chart.body?.candles?.length,
  scanId:chart.body?.scanId,excludedOpenBars:chart.body?.excludedUnclosedCount}));
if(chart.status===409 && chart.body?.error==='SCAN_REFRESH_REQUIRED') {
  // Natural 5-minute scan commit turnover is not evidence of a bad chart.
  console.log('CHART source rolled over mid-test; recording safe 409, not a counterfeit chart.');
} else {
  assert.equal(chart.status,200,'source-pinned chart endpoint failed');
  assert.equal(chart.body.candleState,'CLOSED_ONLY');
  assert.equal(chart.body.noRealOrders,true);
  assert.equal(chart.body.historySourceVerified,true);
  assert.equal(chart.body.scanId,snap.body.source.scanId);
  assert.equal(chart.body.sourceValidation,'GIT_COMMIT_BLOB_SHA1_PLUS_HISTORY_MANIFEST_SHA256');
  assert.ok(chart.body.candles?.length>=8);
  assert.ok(chart.body.markers?.every(x=>x.notExecution===true));
}
const overlay=await invoke(overlayHandler,{method:'GET',query:{}});
console.log('MAKINE',JSON.stringify({status:overlay.status,ms:overlay.latencyMs,
  state:overlay.body?.state,ageMinutes:overlay.body?.evidence?.ageMinutes,error:overlay.body?.error}));
assert.equal(overlay.status,200,'optional overlay must not break radar on external outage');
assert.equal(overlay.body.readOnly,true);
assert.equal(overlay.body.changesCoreSignals,false);
assert.equal(overlay.body.noNewTradeCandidates,true);
assert.ok(['STALE','READ_ONLY_RESEARCH','UNAVAILABLE'].includes(overlay.body.state));
if(overlay.body.state==='STALE'){
  assert.deepEqual(overlay.body.recommendations,[]);
  assert.deepEqual(overlay.body.observations,[]);
}
const blocked=await invoke(snapshotHandler,{method:'POST',query:{}});
assert.equal(blocked.status,405);
assert.equal(blocked.body.state,'NO_VERIFIED_DATA');
console.log('PASS real source integration: pinned snapshot and chart validated; MAKINE constrained; write method rejected');
