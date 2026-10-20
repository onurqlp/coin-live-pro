/* Affected release paths only: responsive dashboard, pinned feeds and network recovery. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const puppeteer=require('puppeteer-core');
const fixture=process.env.UZAYX_FIXTURE==='1';
let base=process.env.UZAYX_URL||'https://onurqlp.github.io/coin-live-pro/uzayx/site.html';
const root=path.resolve(__dirname,'..');
async function main(){
 let server;
 if(fixture){
  server=require('node:http').createServer((req,res)=>{
   const file=path.join(root,'web',new URL(req.url,'http://localhost').pathname);
   if(!file.startsWith(path.join(root,'web')+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
   res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.json')?'application/json':'text/html');
   res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+server.address().port+'/uzayx/site.html';
 }
 const browser=await puppeteer.launch({executablePath:process.env.CHROME||'/tmp/uzayx-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try{
  for(const width of [390,1440]){
   const page=await browser.newPage();await page.setViewport({width,height:900,deviceScaleFactor:1});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   let offline=false,headRequests=0,manualCloseReport=null;
   if(fixture){
    await page.evaluateOnNewDocument(()=>window.addEventListener('uzayx:loaded',event=>{window.__lastVerifiedState=event.detail;}));
    const snapshot=JSON.parse(fs.readFileSync(path.join(root,'web/data/v4-manifest.json')));
    const offset=Date.parse(snapshot.finished_at_utc)+60000-Date.now();
    await page.evaluateOnNewDocument(offset=>{window.__clockOffset=offset;const real=Date.now.bind(Date);Date.now=()=>real()+window.__clockOffset;},offset);
    await page.setRequestInterception(true);
    page.on('request',request=>{
     const u=new URL(request.url());
     if(u.host==='api.github.com'){headRequests++;return request.respond({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({sha:'a'.repeat(40)})});}
     if(u.host==='raw.githubusercontent.com'){
      if(manualCloseReport&&u.pathname.endsWith('/uzayx-cash-close.json'))return request.respond({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify(manualCloseReport)});
      if(offline&&u.pathname.endsWith('/v4-manifest.json'))return request.abort('internetdisconnected');
      const match=u.pathname.match(/^\/onurqlp\/coin-live-pro\/[^/]+\/(.+)$/);
      const file=match&&path.join(root,match[1]);
      if(file&&file.startsWith(root+path.sep)&&fs.existsSync(file))return request.respond({status:200,headers:{'access-control-allow-origin':'*'},contentType:file.endsWith('.json')?'application/json':'text/plain',body:fs.readFileSync(file)});
      return request.respond({status:404,headers:{'access-control-allow-origin':'*'},body:'unavailable optional source'});
     }
     if(u.host==='www.okx.com'||u.host==='api.binance.com'||u.host==='fapi.binance.com')return request.abort();
     return request.continue();
    });
   }
   await page.goto(base+'?release='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForFunction(()=>document.querySelector('#risk-desk-body .rd-grid')&&document.querySelectorAll('#research-families .rd-family').length===7,{timeout:35000});
   const scan=await page.evaluate(()=>({brief:document.querySelector('#research-brief')?.innerText,
    cash:document.querySelector('#risk-desk-body')?.innerText, families:document.querySelectorAll('.rd-family').length,
    overflow:document.documentElement.scrollWidth>innerWidth+2,ready:!document.querySelector('#reload').disabled}));
   assert.equal(scan.overflow,false,'Homepage horizontal overflow '+width);assert.equal(scan.ready,true);
   assert.match(scan.cash,/Fonlama dahil değil/);assert.match(scan.cash,/20x/);
   assert.match(scan.brief,/Hareketlenen/);
   await page.waitForFunction(()=>document.querySelector('#mini-chart-state')?.textContent.includes('Son kapanmış mum'),{timeout:15000});
   const homeCharts=await page.evaluate(()=>['mini-price','home-rsi','home-macd'].map(id=>{
    const canvas=document.getElementById(id),rect=canvas.getBoundingClientRect();
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let ink=false;for(let i=3;i<pixels.length;i+=4)if(pixels[i]){ink=true;break;}
    return {id,visible:rect.width>80&&rect.height>50,ink};
   }));
   assert.ok(homeCharts.every(x=>x.visible&&x.ink),'Homepage charts visible and painted '+width+': '+JSON.stringify(homeCharts));
   const open=async tab=>page.evaluate(t=>document.querySelector('[data-tab="'+t+'"]').click(),tab);
   await open('research');await page.locator('#research-desk > summary').click();await page.locator('[data-rd-horizon="7D"]').click();
   const lab=await page.evaluate(()=>({selected:document.querySelector('[data-rd-horizon="7D"]').getAttribute('aria-pressed'),
    blocked:document.querySelector('#research-families').innerText,overflow:document.documentElement.scrollWidth>innerWidth+2}));
   assert.equal(lab.selected,'true');assert.equal(lab.overflow,false);assert.match(lab.blocked,/Sektör kaynağı bekleniyor/);
   await page.screenshot({path:'/tmp/uzayx-research-'+width+'.png',fullPage:false});
   if(fixture){
    await open('turan');
    await page.waitForFunction(()=>document.querySelectorAll('#pnl-strategy-list .pnl-strategy-card').length>0,{timeout:16000});
    const overview=await page.evaluate(()=>({visible:document.querySelectorAll('#pnl-strategy-list .pnl-strategy-card').length,
     open:document.querySelector('.pnl-turan-metrics')?.innerText,
     legacy:document.getElementById('turan-legacy')?.getBoundingClientRect().height}));
    assert.ok(overview.visible>=20,'TURAN visible cards missing');
    assert.equal(overview.legacy,0,'Archived 30/200 UI leaked into final page');
    assert.match(overview.open,/Açık sanal pozisyon/);
    await page.evaluate(()=>{document.querySelector('#pnl-strategy-list .pnl-strategy-card').open=true;});
    const detail=await page.evaluate(()=>({lab:document.querySelector('.pnl-strategy-card[open] .pnl-inverse')?.innerText,
     evidence:document.querySelector('.pnl-strategy-card[open] .pnl-learning')?.innerText}));
    assert.match(detail.lab,/SHORT \/ ters varsayım/);assert.match(detail.evidence,/Bağımsız kapanış/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
   }
   await open('funds');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
   const closeControl=await page.$eval('#cash-close-all',n=>({text:n.textContent,url:n.href,target:n.target,width:n.getBoundingClientRect().width}));
   assert.match(closeControl.text,/Tüm işlemleri kapat/);
   assert.equal(closeControl.url,'https://github.com/onurqlp/coin-live-pro/actions/workflows/uzayx-close-all.yml');
   assert.equal(closeControl.target,'_blank');assert.ok(closeControl.width>100);
   await page.locator('#risk-desk-body .rd-disclosure').click();
   assert.ok(await page.$('#risk-desk-body .rd-attribution'));
   if(fixture&&width===390){
    const before=headRequests;
    offline=true;
    await page.evaluate(()=>{window.__clockOffset+=26*60000;window.dispatchEvent(new Event('online'));});
    await page.waitForFunction(()=>document.querySelector('#connection').textContent.includes('Bağlantı'),{timeout:10000});
    assert.equal(await page.$$eval('#radar-list .coin-card',nodes=>nodes.length),0,'Expired radar cards survived failed polling');
    assert.equal(await page.$$eval('#watch-items .watch-row',nodes=>nodes.length),0,'Expired home cards survived failed polling');
    assert.equal(await page.$$eval('#risk-desk-body .rd-grid',nodes=>nodes.length),0,'Stale cash labeled as live');
    offline=false;
    await page.evaluate(()=>{window.__clockOffset-=26*60000;window.dispatchEvent(new Event('online'));});
    await page.waitForFunction(()=>document.querySelector('#connection').textContent==='Veri güncel'&&document.querySelector('#risk-desk-body .rd-grid'),{timeout:10000});
    assert.equal(headRequests,before,'Unchanged scan unnecessarily re-fetched HEAD');
   }
   if(fixture){
    await page.evaluate(()=>document.querySelector('#cash-close-all').addEventListener('click',event=>event.preventDefault(),{once:true}));
    await page.locator('#cash-close-all').click();
    assert.match(await page.$eval('#cash-close-message',n=>n.textContent),/Run workflow/);
    assert.doesNotMatch(await page.$eval('#cash-close-message',n=>n.textContent),/pozisyon kapatıldı/,'Opening authorization must not fabricate a close');
    const pending=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('uzayx.pendingPaperClose.v1')));
    manualCloseReport={request_id:'uzayx-manual-123456',closed_at_utc:new Date(pending.at+1000).toISOString(),
      real_orders:false,all_active_positions_closed:true,positions:[{book:'spark',net_closed_usdt:-3}],cancelled:[],spark_equity_after_usdt:9997};
    await page.evaluate(()=>{
     const state=window.__lastVerifiedState;
     window.dispatchEvent(new CustomEvent('uzayx:loaded',{detail:{...state,sourceCommit:'b'.repeat(40),
      db:{...state.db,spark:{...state.db.spark,close_request_id:'uzayx-manual-123456'}}}}));
    });
    await page.waitForFunction(()=>document.querySelector('#cash-close-message').textContent.includes('1 sanal pozisyon kapatıldı'),{timeout:8000});
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('uzayx.pendingPaperClose.v1')),null);
    assert.match(await page.$eval('#cash-close-message',n=>n.textContent),/9.997,00 USDT/);
   }
   assert.deepEqual(errors,[],'Uncaught browser errors');
   console.log(JSON.stringify({width,families:scan.families,overflow:false,recovery:fixture&&width===390?'verified':'not exercised',errors}));
   await page.close();
  }
 }finally{await browser.close();if(server)server.close();}
}
main().catch(e=>{console.error(e);process.exit(1)});
