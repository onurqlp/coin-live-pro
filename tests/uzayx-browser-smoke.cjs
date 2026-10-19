/* UzayX browser smoke: real phone / desktop widths, navigation and local archive. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const url='https://onurqlp.github.io/coin-live-pro/uzayx/';
async function run(){
 const executablePath=process.env.CHROME;
 assert.ok(executablePath,'CHROME required');
 const browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try{
  for(const [width,height,name] of [[390,844,'mobile'],[1440,900,'desktop']]){
   const page=await browser.newPage();
   await page.setViewport({width,height,deviceScaleFactor:1});
   await page.goto(url+'#overview',{waitUntil:'domcontentloaded',timeout:45000});
   const openTab=async tab=>{
    if(name==='mobile'){
     const dock=['overview','chart','funds','learn'].includes(tab);
     if(!dock)await page.locator('#mobile-menu-toggle').click();
     await page.locator(dock?'[data-dock="'+tab+'"]':'#desktop-tabs [data-tab="'+tab+'"]').click();
    }else await page.locator('#desktop-tabs [data-tab="'+tab+'"]').click();
   };
   await page.waitForSelector('#mini-price');
   await page.waitForFunction(()=>document.querySelector('#connection')?.textContent!=='Veri kontrol ediliyor',{timeout:25000});
   const home=await page.evaluate(()=>({
    title:document.title,
    width:innerWidth,
    scrollWidth:document.documentElement.scrollWidth,
    navs:[...document.querySelectorAll('.tab')].length,
    futures:[...document.querySelectorAll('a[href*="binance.com/en/futures/home"]')].length,
    hero:document.querySelector('.compact-hero h1')?.textContent.trim(),
    status:document.querySelector('#connection')?.textContent.trim(),
    age:document.querySelector('#m-age')?.textContent.trim(),
    mainBlocks:document.querySelectorAll('#overview .overview-flow > article').length
   }));
   assert.match(home.title,/UzayX/);
   assert.equal(home.futures,1,'Futures must appear once');
   assert.equal(home.mainBlocks,3,'Home must be compact');
   assert.equal(home.hero,'Piyasada ne oluyor?');
   assert.ok(home.scrollWidth<=width+3,'Horizontal page overflow on '+name+': '+home.scrollWidth);
   assert.equal(home.navs,7);
   await page.waitForFunction(()=>document.querySelector('.watch-row')||document.querySelector('.watch-empty'),{timeout:15000});
   const rows=await page.$$('.watch-row');
   if(rows.length){
     await page.locator('.watch-row').click();
     const inline=await page.evaluate(()=>({
       hash:location.hash,label:document.querySelector('#mini-chart-label')?.textContent,
       detail:document.querySelector('#watch-detail')?.hidden,
       list:document.querySelectorAll('.watch-row').length
     }));
     assert.equal(inline.hash,'#overview','Selecting coin must not navigate away');
     assert.equal(inline.detail,false,'Selected coin should expand in same screen');
     assert.ok(inline.list>0);
   } else {
     const visible=await page.$eval('#watch-items',x=>x.textContent);
     assert.ok(visible.trim().length>0,'Watchdesk should report its current state');
   }
   await page.waitForFunction(()=>document.querySelector('#home-open-count')?.textContent!=='—',{timeout:20000});
   const summary=await page.evaluate(()=>({
     open:document.querySelector('#home-open-count')?.textContent,
     rows:document.querySelectorAll('#home-open-list .home-open-row').length,
     note:document.querySelector('#home-open-note')?.textContent,
     age:document.querySelector('#home-open-time')?.textContent
   }));
   assert.ok(Number(summary.open.replaceAll('.',''))>=0,'Open position count is not numeric');
   if(Number(summary.open.replaceAll('.',''))>0)assert.ok(summary.rows>0,'Home must show open positions');
   const firstOpen=await page.$('.home-open-row');
   if(firstOpen){
     await firstOpen.click();
     assert.equal(new URL(page.url()).hash,'#overview','Open position click must stay on homepage');
   }
   await page.screenshot({path:'/tmp/uzayx-'+name+'-home.png',fullPage:true});
   await openTab('chart');
   await page.waitForFunction(()=>document.querySelector('#chart')?.classList.contains('active'),{timeout:5000});
   await page.waitForFunction(()=>document.querySelector('#chart-symbol option[value]')!==null,{timeout:28000}).catch(()=>{});
   await page.waitForFunction(()=>{
     const el=document.querySelector('#chart-price');
     return el && el.clientWidth>300 && el.width>(innerWidth<700?320:600);
   },{timeout:18000});
   const chart=await page.evaluate(()=>({
    width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    priceCanvas:document.querySelector('#chart-price')?.width||0,
    rsiCanvas:document.querySelector('#chart-rsi')?.width||0,
    macdCanvas:document.querySelector('#chart-macd')?.width||0,
    msg:document.querySelector('#chart-message')?.textContent.trim(),
    indicatorCount:document.querySelectorAll('#chart-indicators .indicator-tile').length
   }));
   assert.ok(chart.scrollWidth<=width+3,'Chart overflow on '+name+': '+chart.scrollWidth);
   assert.ok(chart.priceCanvas>0,'Price chart not rendered: '+chart.msg);
   assert.ok(chart.rsiCanvas>0&&chart.macdCanvas>0,'Indicator charts not rendered: '+chart.msg);
   assert.equal(chart.indicatorCount,4);
   await page.screenshot({path:'/tmp/uzayx-'+name+'-chart.png',fullPage:true});
   await openTab('funds');
   await page.waitForFunction(()=>document.querySelector('#cash-total')?.textContent!=='—',{timeout:15000});
   const cash=await page.evaluate(()=>({
     title:document.querySelector('#funds-title')?.textContent,
     total:document.querySelector('#cash-total')?.textContent,
     waiting:document.querySelector('#cash-waiting')?.textContent,
     rows:document.querySelectorAll('#position-rows .position-row').length,
     main:document.querySelector('#cash-main')?.textContent,
     status:document.querySelector('#cash-status')?.textContent
   }));
   assert.match(cash.title,/Kasa|kasa/);
   assert.ok(cash.rows>0,'Cash must show sampled positions');
   await page.locator('#position-rows .position-row').click();
   await page.waitForFunction(()=>document.querySelector('#position-detail .position-stat'),{timeout:5000});
   await page.screenshot({path:'/tmp/uzayx-'+name+'-cash.png',fullPage:true});
   await openTab('research');
   await page.waitForFunction(()=>document.querySelectorAll('#module-grid .proof-module').length===6,{timeout:12000});
   const modules=await page.evaluate(()=>[...document.querySelectorAll('#module-grid .proof-module')].map(x=>({
     id:x.querySelector('.id')?.textContent,status:x.querySelector('.chip')?.textContent,
     explanation:x.querySelector('.proof-explain')?.textContent,btn:x.querySelector('button.proof-btn')?.textContent
   })));
   assert.equal(modules.length,6);
   assert.deepEqual(modules.map(x=>x.id),['A1','A2','A3','B1','B2','T0']);
   assert.ok(modules.every(x=>x.explanation?.length>15&&x.btn==='Kaynağı denetle'));
   await page.locator('#module-check-all').click();
   await page.waitForFunction(()=>document.querySelector('#module-verified-at')?.textContent.includes('denetlendi')||
     document.querySelector('#module-verified-at')?.textContent.includes('doğrulanamadı'),{timeout:25000});
   const proof=await page.evaluate(()=>[...document.querySelectorAll('.proof-module')].map(x=>({
     module:x.querySelector('.id')?.textContent,
     result:x.querySelector('.proof-result')?.textContent
   })));
   assert.equal(proof.length,6);
   assert.ok(proof.every(x=>x.result&&!x.result.includes('Henüz çevrimiçi kontrol yapılmadı')));
   const proofById=Object.fromEntries(proof.map(x=>[x.module,x.result]));
   for(const id of ['A1','A2']){
     assert.match(proofById[id],/ortak kapanış seansı|ENGELLİ|doğrulanamadı|fiyat kaynağı|Güncel çalışma kanıtı yok/i,
       id+' must report verified public price inputs or honestly report a source blocker');
   }
   for(const id of ['A3','B1','B2','T0']){
     assert.doesNotMatch(proofById[id],/Funding verisi veya saat\/izin kanıtı eksik/i,
       'New evidence verifier must not mistake '+id+' for B1.');
   }

   await openTab('learn');
   const demo={schema:'uzayx.lessons.archive.v1',records:[{day_utc:'2026-10-17',cohort_statistics:{'TÜMÜ':{closed:2,positive:1,net_usdt:-1.2}}}]};
   const sample=path.join(os.tmpdir(),'uzayx-smoke-sample-'+name+'.json');
   fs.writeFileSync(sample,JSON.stringify(demo));
   const input=await page.$('#archive-file');
   await input.uploadFile(sample);
   await page.waitForFunction(()=>document.querySelectorAll('#archive-comparison .archive-compare-card').length>0,{timeout:10000});
   await openTab('system');
   assert.ok(await page.$('#system-rows .system-row'),'Health diagnostics missing');
   console.log('UX_SMOKE_OK',name,JSON.stringify({home,summary,chart,cash,modules,proof}));
   await page.close();
  }
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});