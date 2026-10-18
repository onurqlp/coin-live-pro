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
   assert.equal(home.hero,'Piyasa özeti');
   assert.ok(home.scrollWidth<=width+3,'Horizontal page overflow on '+name+': '+home.scrollWidth);
   assert.equal(home.navs,7);
   await page.screenshot({path:'/tmp/uzayx-'+name+'-home.png',fullPage:true});
   await page.locator('[data-tab="chart"]').click();
   await page.waitForFunction(()=>document.querySelector('#chart')?.classList.contains('active'),{timeout:5000});
   await page.waitForFunction(()=>document.querySelector('#chart-symbol option[value]')!==null,{timeout:28000}).catch(()=>{});
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
   await page.locator('[data-tab="learn"]').click();
   const demo={schema:'uzayx.lessons.archive.v1',records:[{day_utc:'2026-10-17',cohort_statistics:{'TÜMÜ':{closed:2,positive:1,net_usdt:-1.2}}}]};
   const sample=path.join(os.tmpdir(),'uzayx-smoke-sample-'+name+'.json');
   fs.writeFileSync(sample,JSON.stringify(demo));
   await page.locator('#archive-file').uploadFile(sample);
   await page.waitForFunction(()=>document.querySelectorAll('#archive-comparison .archive-compare-card').length>0,{timeout:10000});
   await page.locator('[data-tab="system"]').click();
   assert.ok(await page.$('#system-rows .system-row'),'Health diagnostics missing');
   console.log('UX_SMOKE_OK',name,JSON.stringify({home,chart}));
   await page.close();
  }
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});