// Headless Chromium responsive + interaction smoke checks against deterministic,
// wholly synthetic API data. Never accesses a live exchange or writes a ledger.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const baseDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
const commit='a'.repeat(40);
let stale=false;
const signal={id:'paper-fixture-1',symbol:'BTCUSDT',side:'LONG',stage:'WATCH',
  strategy:'TREND_BREAKOUT',score:64,riskScore:25,reviewState:'FRESH',
  confirmation:'UNCONFIRMED',observedAtUtc:'2026-10-18T08:00:00Z',
  price:71000,stop:69000,targets:[73000,75000,77000],reasons:['SYNTHETIC_TEST_ONLY']};
const snapshot=()=>({
 schema:'coinlive.v5.readonly.v1',appVersion:'5.0.0-preview',sourceProductVersion:'4.03',
 source:{repo:'onurqlp/coin-live-pro',commit,scanId:'synthetic-scan',
   observedAtUtc:'2026-10-18T08:00:00Z',ageMinutes:stale?45:1,status:stale?'STALE':'VERIFIED',
   healthStatus:'TEST',provider:'OKX',trigger:'TEST',attemptedPairs:1,testedPairs:1,
   scheduledRunsObserved:1,manifestVerified:true,payloadShaVerified:true,
   unscopedSources:[],healthLegacyScanId:'legacy-scan'},
 safety:{stale,noRealOrders:true},radar:{count:stale?0:1,candidates:stale?[]:[signal],
   pendingCount:0,early:[],counts:{watch:1}},
 paper:{startingBalanceUsdt:10000,equityUsdt:10000,realizedUsdt:0,
   unrealizedUsdt:0,openCount:0,fundingState:'UNKNOWN_NOT_MODELED'},
 experimental:{startingBalanceUsdt:10000,estimatedEquityUsdt:9999,
   accountingRealizedUsdt:-1,reviewAll:{closed:4,realized_total_usdt:-2},
   fundingState:'UNMODELED',note:'TEST ACCOUNTS ARE SEPARATE'},
 forward:{observations:0,periods:[7,14,30,90].map(days=>({days,quality:'INSUFFICIENT_SAMPLE',
   strategies:{TREND_BREAKOUT:{discovered:1,entryEligible:0,
     horizons:{'1H':{observed:0},'4H':{observed:0},'24H':{observed:0},'3D':{observed:0},'7D':{observed:0}}}}}))}
});
const candles=Array.from({length:28},(_,i)=>{
 const t=Date.parse('2026-10-17T00:00:00Z')+i*3600000,open=70000+i*10;
 return {t,open,high:open+100,low:open-100,close:open+30};
});
const chart={symbol:'BTCUSDT',timeframe:'1H',commit,candleState:'CLOSED_ONLY',
 candles,excludedUnclosedCount:1,markers:[{type:'DISCOVERED',atUtc:'2026-10-17T06:00:00Z',notExecution:true}]};
const mime={'html':'text/html; charset=utf-8','js':'text/javascript; charset=utf-8',
 'css':'text/css; charset=utf-8','png':'image/png','svg':'image/svg+xml','webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{
 try{
  if(req.url?.startsWith('/api/')){
   res.setHeader('Content-Type','application/json; charset=utf-8');
   res.setHeader('Cache-Control','no-store');
   const body=req.url.startsWith('/api/snapshot')?snapshot():
     req.url.startsWith('/api/chart')?chart:
     {source:'MAKINE_CORE',state:'STALE',readOnly:true,
      changesCoreSignals:false,evidence:{ageMinutes:1400,generatedAtUtc:'2026-10-17T00:00:00Z',
      basedOnCoinliveScanId:'old-scan'}};
   res.end(JSON.stringify(body));return;
  }
  const u=new URL(req.url||'/', 'http://localhost');
  const name=(u.pathname==='/'?'/index.html':u.pathname);
  if(!['/index.html','/app.js','/style.css','/sw.js','/icon.svg','/icon-192.png','/icon-512.png','/manifest.webmanifest'].includes(name)){
   res.writeHead(404);res.end();return;
  }
  const file=path.join(baseDir,name.slice(1)),ext=name.split('.').at(-1);
  const content=await fs.readFile(file);res.setHeader('Content-Type',mime[ext]||'text/plain');
  res.end(content);
 }catch(e){res.writeHead(500);res.end(e.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let count=0;
try{
 for(const width of [360,390,768,1366]){
  const ctx=await browser.newContext({viewport:{width,height:820},deviceScaleFactor:1,
    isMobile:width<600,hasTouch:width<600});
  const page=await ctx.newPage();
  const failures=[];
  page.on('pageerror',e=>failures.push(e.message));
  await page.goto(origin+'/',{waitUntil:'networkidle',timeout:20000});
  if(width===360){
    const icons=await page.evaluate(async()=>{
      const manifest=await (await fetch('/manifest.webmanifest')).json();
      const results=[];
      for(const dim of [192,512]){
        const meta=manifest.icons.find(x=>x.sizes===dim+'x'+dim&&x.type==='image/png');
        if(!meta)return {id:manifest.id,results,missing:dim};
        const image=new Image();image.src=meta.src;
        await image.decode();
        results.push({width:image.naturalWidth,height:image.naturalHeight});
      }
      return {id:manifest.id,results};
    });
    assert.equal(icons.id,'/');
    assert.deepEqual(icons.results,[{width:192,height:192},{width:512,height:512}]);
  }
  await page.locator('#cards button').first().waitFor({timeout:10000});
  assert.match(await page.locator('#count').innerText(),/1 güncel araştırma/);
  assert.equal(await page.locator('#paperCards').innerText().then(t=>t.includes('10.000')),true);
  assert.equal(await page.locator('#health').innerText(),'✓ Doğrulanmış');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  assert.equal(overflow,false,'horizontal overflow at '+width);
  await page.locator('#cards button').first().click();
  await page.locator('#marketChart').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#chartStatus')?.textContent?.includes('28 bar'),null,{timeout:15000});
  const painted=await page.locator('#marketChart').evaluate(c=>{
   const p=c.getContext('2d').getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data;
   return c.width>0&&c.height>0&&p.length===4;
  });
  assert.equal(painted,true,'canvas initialized at '+width);
  await page.locator('[data-tab="system"]').click();
  await page.waitForFunction(()=>document.querySelector('#overlayInfo')?.textContent?.includes('ESKİ'),null,{timeout:15000});
  assert.match(await page.locator('#systemInfo').innerText(),/4.03/);
  await page.locator('[data-tab="forward"]').click();
  assert.match(await page.locator('#forwardInfo').innerText(),/INSUFFICIENT_SAMPLE/);
  assert.deepEqual(failures,[],'page errors at '+width);
  if(width===360){
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.reload({waitUntil:'networkidle'});
    const controlled=await page.evaluate(()=>!!navigator.serviceWorker.controller);
    assert.equal(controlled,true,'PWA service worker must control reload');
    await ctx.setOffline(true);
    await page.reload({waitUntil:'load',timeout:12000});
    await page.waitForFunction(()=>document.querySelector('#health')?.textContent?.includes('Veri doğrulanamadı'),null,{timeout:12000});
    assert.equal(await page.locator('#cards button').count(),0,'offline PWA may never show active opportunities');
    await ctx.setOffline(false);
    console.log('PASS Chromium offline PWA: cached shell and no API signal replay');
  }
  await ctx.close();count++;
  console.log('PASS Chromium '+width+'px: radar, chart, MAKINE stale warning, cash, history, overflow');
 }
 stale=true;
 const ctx=await browser.newContext();const page=await ctx.newPage();
 await page.goto(origin+'/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>document.querySelector('#health')?.textContent?.includes('ESKİ'));
 assert.equal(await page.locator('#cards button').count(),0,'stale data must suppress opportunities');
 console.log('PASS Chromium stale snapshot: no active signals');
 await ctx.close();
 console.log('PASS '+count+' responsive widths + stale fail-closed smoke checks');
}finally{await browser.close();await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
