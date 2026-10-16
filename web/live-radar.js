'use strict';
/*
 * COIN.LIVE PRO · independent browser-side 15-minute futures scanner.
 * GitHub Actions remains the only source of shared, auditable forward history.
 * Local observations persist only in this browser for 14 days and are NOT
 * merged into the 7/14-day shared performance report.
 */
(()=>{
const host=window.CoinLivePro;
if(!host)return;
const S=host.state,frameMs={'15m':900000,'1H':3600000,'4H':14400000};
const INTERVAL=15*60000,MAX_COINS=38;
let running=false,lastStart=0,round=0;
try{round=Math.max(0,Number(localStorage.getItem('clpro.scan_round'))||0)}catch(e){}
try{
 const old=JSON.parse(localStorage.getItem('clpro.local_events_v1')||'[]');
 S.browserEvents=Array.isArray(old)?old.filter(e=>Date.now()-e.at_ms<14*86400000).slice(0,250):[];
}catch(e){S.browserEvents=[];}
const mean=v=>v.reduce((a,b)=>a+b,0)/v.length;
const ema=(v,n)=>{let out=v[0],k=2/(n+1);for(const x of v.slice(1))out+=(x-out)*k;return out;};
const atr=v=>mean(v.slice(-14).map((x,i,arr)=>i===0?x.h-x.l:Math.max(x.h-x.l,Math.abs(x.h-arr[i-1].c),Math.abs(x.l-arr[i-1].c))));
const age=t=>Date.now()-t;
function select(){
 const market=S.market.filter(m=>m.price>0&&m.volume>=12000000&&Number.isFinite(m.change)).slice().sort((a,b)=>b.volume-a.volume);
 const mostLiquid=market.slice(0,7).map(x=>x.symbol);
 const movers=market.slice().sort((a,b)=>Math.abs(b.change)*Math.sqrt(b.volume)-Math.abs(a.change)*Math.sqrt(a.volume)).slice(0,7).map(x=>x.symbol);
 const fixed=[...new Set([...mostLiquid,...movers])];
 const rest=market.filter(m=>!fixed.includes(m.symbol));
 const offset=rest.length?(round*25)%rest.length:0;
 const rotated=rest.length?rest.slice(offset).concat(rest.slice(0,offset)).slice(0,MAX_COINS-fixed.length):[];
 round++;try{localStorage.setItem('clpro.scan_round',String(round))}catch(e){}
 return [...fixed.map(s=>market.find(x=>x.symbol===s)),...rotated].filter(Boolean).slice(0,MAX_COINS);
}
async function candles(inst,frame){
 const url='https://www.okx.com/api/v5/market/candles?'+new URLSearchParams({instId:inst,bar:frame,limit:'90'});
 const response=await host.get(url);
 if(response.code!=='0'||!Array.isArray(response.data))throw Error('OKX mum yanıtı yok');
 const now=Date.now();
 return response.data.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]}))
  .filter(x=>Number.isFinite(x.t)&&x.h>0&&x.l>0&&x.c>0&&x.v>=0&&x.t+frameMs[frame]<now-1500)
  .sort((a,b)=>a.t-b.t);
}
function examine(m,frames){
 const [a,b,c]=frames;if(Math.min(a.length,b.length,c.length)<55)return null;
 const now=Date.now();
 if(now-(a.at(-1).t+frameMs['15m'])>31*60000||
    now-(b.at(-1).t+frameMs['1H'])>125*60000||
    now-(c.at(-1).t+frameMs['4H'])>485*60000)return null;
 const p=m.price;
 const bClose=b.map(x=>x.c).slice(-60),cClose=c.map(x=>x.c).slice(-60);
 const m20=ema(bClose,20),m50=ema(bClose,50),m4=ema(cClose,20);
 const alignment=m20>m50&&c.at(-1).c>m4?'LONG':m20<m50&&c.at(-1).c<m4?'SHORT':null;
 if(!alignment)return null;
 const high=Math.max(...a.slice(-15,-1).map(x=>x.h));
 const low=Math.min(...a.slice(-15,-1).map(x=>x.l));
 const threshold=alignment==='LONG'?high:low;
 const dist=alignment==='LONG'?(high-p)/p*100:(p-low)/p*100;
 const near=dist>=-.25&&dist<=1.05;
 const volbase=mean(a.slice(-21,-1).map(x=>x.v));
 if(volbase<=0)return null;
 const vr=a.at(-1).v/volbase;
 const recent=a.slice(-20).map(x=>x.c),dev=Math.sqrt(mean(recent.map(x=>(x-mean(recent))**2)));
 const width=dev*4/mean(recent)*100;
 const volatility=atr(a)/p*100;
 let score=Math.round(22+(near?25:0)+Math.min(19,Math.max(0,(vr-.65)*24))+
     (width<3?15:width<5?10:width<8?4:0)+(m.volume>=1e8?10:m.volume>=2e7?6:0));
 if(Math.abs(m.change)>18)score-=20;
 score=Math.max(0,Math.min(100,score));
 if(volatility<.08||volatility>6.5||!near||vr<.92||score<58)return null;
 const last=a.at(-1);
 const resistance=Math.max(...a.slice(-10,-2).map(x=>x.h));
 const support=Math.min(...a.slice(-10,-2).map(x=>x.l));
 const breakout=alignment==='LONG'?last.c>resistance&&last.c>last.o:last.c<support&&last.c<last.o;
 const confirmed=breakout&&vr>=1.4&&Math.abs(p-last.c)/p<.018&&score>=62;
 const sign=alignment==='LONG'?1:-1;
 const sd=Math.max(.009*p,1.7*atr(a));
 if(sd/p>.055||sd/p<.003)return null;
 return {
   symbol:m.symbol,side:alignment,stage:confirmed?'CONFIRMED':'WATCH',provider:'OKX',engine:'BROWSER',score,
   price:p,threshold,stop:+(p-sign*sd).toPrecision(12),
   targets:[1,2,3].map(k=>+(p+sign*sd*k).toPrecision(12)),
   volume_ratio:+vr.toFixed(3),at_ms:now,time:new Date(now).toISOString(),
   ohlc15:a.slice(-70).map(x=>[x.t,x.o,x.h,x.l,x.c,x.v])
 };
}
function preserve(e){
 const now=Date.now(),old=S.browserEvents;
 if(old.some(x=>x.symbol===e.symbol&&x.side===e.side&&x.stage===e.stage&&now-x.at_ms<3*3600000))return;
 const id='LOCAL|'+e.symbol+'|'+e.side+'|'+e.stage+'|'+Math.floor(now/900000);
 const event={id,symbol:e.symbol,side:e.side,stage:e.stage,score:e.score,price:e.price,at_ms:now};
 S.browserEvents=[event,...old].filter(x=>now-x.at_ms<14*86400000).slice(0,250);
 try{localStorage.setItem('clpro.local_events_v1',JSON.stringify(S.browserEvents));}catch(e){}
 if(e.score>=70&&'Notification' in window&&Notification.permission==='granted'){
   host.notify({...e,id});
 }
}
async function scan(force=false){
 if(running)return;
 if(!force&&lastStart&&age(lastStart)<INTERVAL)return;
 if(force&&lastStart&&age(lastStart)<120000)return;
 if(!S.live||age(S.lastRefresh)>85000){
   S.localScanStatus='CANLI OKX BEKLENİYOR';
   host.refreshState();return;
 }
 running=true;lastStart=Date.now();const provider=S.provider;
 const batch=select(),found=[],errors=[];let good=0,cursor=0;
 S.localScanStatus=batch.length+' coin için 15m/1H/4H taraması başladı';
 host.refreshState();
 async function worker(){
   while(cursor<batch.length){
     const index=cursor++,m=batch[index],inst=m.symbol.replace(/USDT$/,'-USDT-SWAP');
     try{
       const data=await Promise.all(['15m','1H','4H'].map(frame=>candles(inst,frame)));
       if(provider!==S.provider)throw Error('Veri sağlayıcısı değişti');
       if(Math.min(...data.map(z=>z.length))<55)continue;
       good++;
       const item=examine(m,data);if(item)found.push(item);
     }catch(e){errors.push(m.symbol);}
   }
 }
 await Promise.all(Array.from({length:4},worker));
 if(provider===S.provider&&good>=12){
   S.localRadar=found.sort((a,b)=>b.score-a.score);
   S.localScanTime=Date.now();S.localCoverage=good;
   S.localScanStatus='CANLI 15 DK TARAMA: '+good+'/'+batch.length+' coin · '+found.length+' LONG/SHORT aday';
   for(const item of found)preserve(item);
   host.render();
 }else{
   S.localScanStatus='MUM KAYNAĞI HATASI · başarılı '+good+'/'+batch.length+' · önceki doğrulanmış sinyaller korunuyor';
   host.refreshState();
 }
 running=false;
}
// Diagnostic comparison only. NEVER creates authoritative events or PnL.
window.CoinLiveProClient={scan};
S.localScanStatus='Elle yapılan tarayıcı karşılaştırması; merkezi pilot değil';
})();