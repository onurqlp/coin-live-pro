'use strict';
// Targeted PUBLIC TURAN terminal test at mobile and desktop viewport.
// No orders, no Google integration, no destructive writes.
const puppeteer=require('puppeteer-core');
const assert=require('node:assert/strict');
(async ()=>{
  const chrome=process.env.CHROME||'/usr/bin/google-chrome';
  const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const base='https://onurqlp.github.io/coin-live-pro/uzayx/turan/';
  try{
    for(const width of [390,1440]){
      const page=await browser.newPage();
      const exceptions=[];
      page.on('pageerror',error=>exceptions.push(error.message));
      await page.setViewport({width,height:820,deviceScaleFactor:1});
      await page.goto(base+'?smoke='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
      await page.waitForFunction(()=>document.getElementById('live-state')?.textContent?.includes('rapor')||
        document.getElementById('live-state')?.textContent?.includes('Veri zamanı')||
        document.getElementById('live-state')?.classList.contains('fail'),{timeout:25000});
      const state=await page.$eval('#live-state',x=>x.textContent.trim());
      assert(!state.includes('doğrulanamadı')&&!state.includes('erişilemiyor'),state);
      const kpis=await page.$$eval('#kpis .kpi',els=>els.length);
      assert.equal(kpis,4,'Dashboard should render four actual source counters');
      const mobile=width<700;
      await page.click(mobile?'.mobile-nav [data-view=arena]':'.side [data-view=arena]');
      const count=await page.$$eval('#strategies .strategy-card',els=>els.length);
      assert(count>=1,'Strategy cards must load from verified report');
      await page.click(mobile?'.mobile-nav [data-view=cases]':'.side [data-view=cases]');
      const rows=await page.$$eval('#cases-body tr',els=>els.length);
      assert(rows>=1,'Case history must render');
      await page.click(mobile?'.mobile-nav [data-view=learning]':'.side [data-view=learning]');
      const journal=await page.$$eval('#journal-summary .journal-entry',els=>els.length);
      assert.equal(journal,3,'Learning journal should render');
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
      assert(!overflow,'TURAN viewport overflows at '+width+'px');
      assert.deepEqual(exceptions,[],'No JS runtime failures');
      await page.screenshot({path:'/tmp/uzayx-turan-'+width+'.png',fullPage:false});
      console.log('TURAN_PUBLIC_SMOKE_OK',width,state,'cards',count,'events',rows);
      await page.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
