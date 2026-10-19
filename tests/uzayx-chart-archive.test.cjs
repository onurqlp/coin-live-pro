const test=require('node:test');
const assert=require('node:assert/strict');
const charts=require('../web/uzayx/charts.js');
const archive=require('../web/uzayx/archive.js');
test('candles are ordered, deduplicated, and invalid OHLC excluded',()=>{
 const rows=[[2000,10,12,9,11],[1000,9,11,8,10],[1000,9,11,8,10],[3000,4,3,2,5]];
 assert.deepEqual(charts.normalizeCandles(rows).map(x=>x[0]),[1000,2000]);
});
test('oscillators use closed numerical candles, no fabricated values',()=>{
 const candles=Array.from({length:62},(_,i)=>[1700000000000+i*3600000,100+i,102+i,99+i,101+i]);
 const o=charts.computeIndicators(candles);
 assert.equal(o.rsi.length,62);
 assert.equal(o.rsi[0],null);
 assert.equal(o.rsi[14],100);
 assert.ok(Number.isFinite(o.hist.at(-1)));
 assert.equal(o.hist[24],null);
});
test('levels require confirmed breakout frame and positive price',()=>{
 const p={price:100,side:'SHORT',stop:105,targets:[97,94,90]};
 const good={quality:'CLOSED_CONFIRMED',breakout_low_prev8:98};
 assert.deepEqual(charts.deriveLevels(p,good).map(x=>x.key),['ref','threshold','stop','tp1','tp2','tp3']);
 assert.equal(charts.deriveLevels(p,{quality:'UNKNOWN',breakout_low_prev8:98}).some(x=>x.key==='threshold'),false);
 assert.deepEqual(charts.deriveLevels({price:null},good),[]);
});
test('chart must share pinned commit and MTF scan proof',()=>{
 const sha='a'.repeat(40);
 const state={sourceCommit:sha,db:{manifest:{publication_valid:true,scan_id:'one'},radar:{scan_id:'one',source_mtf_at:'time'}}};
 const chart={source:'OKX_CLOSED_CANDLES',source_mtf_at:'time',chart_only:true,no_real_orders:true};
 const mtf={fetched_at:'time'};
 assert.equal(charts.sourceAligned(state,chart,mtf),true);
 assert.equal(charts.sourceAligned(state,{...chart,source_mtf_at:'old'},mtf),false);
 assert.equal(charts.sourceAligned({...state,sourceCommit:null},chart,mtf),false);
 assert.equal(charts.sourceAligned({...state,db:{...state.db,radar:{scan_id:'different',source_mtf_at:'time'}}},chart,mtf),false);
});
test('daily archive and ops snapshots map to same immutable cohort comparison contract',()=>{
 const old=archive.normalizeSnapshot({schema:'uzayx.lessons.archive.v1',records:[{
     day_utc:'2026-10-17',cohort_statistics:{'TÜMÜ':{closed:2,positive:1,net_usdt:-1.2},'LONG':{closed:1,positive:0,net_usdt:-2}}}]},'history');
 const now=archive.normalizeSnapshot({generated_at_utc:'2026-10-18T00:00:00Z',cohorts:{'TÜMÜ':{closed:3,positive:2,realized_total_usdt:0.3},'LONG':{closed:1,positive:0,realized_total_usdt:-2}}},'ops');
 assert.equal(old.length,1);
 const rows=archive.compare(old[0],now[0]);
 assert.equal(rows[0].closedDelta,1);
 assert.equal(rows[0].netDelta,1.5);
 assert.equal(rows[1].netDelta,0);
});
test('handoff ZIP historical metadata does not invent PnL',()=>{
 const record=archive.normalizeSnapshot({package_created_at_date:'2026-10-18',repos:{coinlive:{production_version:'4.03',health_status:'OK'}}},'devir')[0];
 assert.equal(record.kind,'handoff');
 assert.equal(archive.compare(record,{cohorts:{}}).length,0);
 assert.throws(()=>archive.normalizeSnapshot({payload:'unknown'}),/değil/);
});
test('homepage contract: Futures only in header, full chart in a secondary workspace',()=>{
 const fs=require('node:fs');
 const page=fs.readFileSync('web/uzayx/site.html','utf8');
 const app=fs.readFileSync('web/uzayx/app.js','utf8');
 assert.equal((page.match(/binance\.com\/en\/futures\/home/g)||[]).length,1);
 for(const id of ['overview','chart','chart-price','chart-rsi','chart-macd','archive-file','archive-comparison','mini-price','chart-levels','mini-levels']){
   assert.match(page,new RegExp('id="'+id+'"'));
 }
 assert.match(page,/src="\.\/charts\.js"/);
 assert.match(page,/src="\.\/archive\.js"/);
 assert.match(app,/setInterval\(minuteCheck,60000\)/);
 assert.doesNotMatch(app,/binance\.com\/en\/futures\/home/);
});