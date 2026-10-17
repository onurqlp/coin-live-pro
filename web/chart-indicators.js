'use strict';
/* RSI14 / MACD(12,26,9) / BB(20,2) derived only from downloaded CLOSED OHLC.
   Visual proof, not strategy confirmation or calibrated forecast. */
(function(g){
function ema(values,period){
 const a=2/(period+1),o=[],p=[];let prior=null;
 for(const x of values){
  p.push(x);
  if(prior===null&&p.length>=period)prior=p.slice(-period).reduce((a,b)=>a+b,0)/period;
  else if(prior!==null)prior=x*a+prior*(1-a);
  o.push(prior);
 }
 return o;
}
function rsi(values,n=14){
 let gain=0,loss=0,ag=null,al=null;
 return values.map((v,i)=>{
  if(!i)return null;
  const d=v-values[i-1],up=Math.max(0,d),down=Math.max(0,-d);
  if(i<=n){gain+=up;loss+=down;if(i!==n)return null;ag=gain/n;al=loss/n}
  else{ag=(ag*(n-1)+up)/n;al=(al*(n-1)+down)/n}
  return al===0?100:100-100/(1+ag/al);
 });
}
function indicators(closes){
 const e12=ema(closes,12),e26=ema(closes,26);
 const macd=closes.map((_,i)=>e12[i]!==null&&e26[i]!==null?e12[i]-e26[i]:null);
 const observed=macd.filter(x=>x!==null),sm=ema(observed,9),signal=[];
 let ix=0;
 macd.forEach(v=>signal.push(v!==null?sm[ix++]:null));
 const hist=macd.map((v,i)=>v!==null&&signal[i]!==null?v-signal[i]:null);
 const bb=closes.map((_,i)=>{
  if(i<19)return null;
  const x=closes.slice(i-19,i+1),mid=x.reduce((a,b)=>a+b,0)/20;
  const sd=Math.sqrt(x.reduce((a,b)=>a+(b-mid)**2,0)/20);
  return {lower:mid-2*sd,mid,upper:mid+2*sd,
   widthPct:mid>0?4*sd/mid*100:0};
 });
 return {rsi:rsi(closes),macd,signal,hist,bb};
}
function render(canvas,candles){
 if(!canvas)return;
 const raw=(candles||[]).filter(x=>Array.isArray(x)&&
     x.length>=5&&x.slice(1,5).every(z=>Number.isFinite(z)&&z>0));
 const closes=raw.map(x=>x[4]);
 const w=Math.max(270,canvas.clientWidth||500),h=238,dpr=Math.min(devicePixelRatio||1,2);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);
 c.fillStyle='#0e1d2d';c.fillRect(0,0,w,h);
 if(closes.length<35){c.fillStyle='#c7d5e4';c.font='12px system-ui';
 c.fillText('RSI/MACD/Bollinger için en az 35 kapanmış mum gerekli.',12,28);return null}
 const data=indicators(closes),left=40,right=w-8,span=right-left;
 const draw=(series,top,bottom,min,max,color)=>{
  c.strokeStyle=color;c.lineWidth=1.5;c.beginPath();let open=false;
  for(let i=0;i<series.length;i++){
   const y=series[i];if(y===null||!Number.isFinite(y)){open=false;continue}
   const px=left+i/(series.length-1)*span,py=bottom-(y-min)/Math.max(1e-12,max-min)*(bottom-top);
   if(!open)c.moveTo(px,py);else c.lineTo(px,py);open=true;
  }c.stroke();
 };
 const font=(txt,y)=>{c.font='11px system-ui';c.fillStyle='#adc7d9';c.fillText(txt,7,y)};
 const n=closes.length-1;
 c.strokeStyle='#294156';c.beginPath();c.moveTo(0,77);c.lineTo(w,77);c.moveTo(0,156);c.lineTo(w,156);c.stroke();
 const endRsi=data.rsi[n];font('RSI 14  '+(endRsi===null?'—':endRsi.toFixed(1)),15);
 draw(data.rsi,20,68,0,100,'#e4b77b');
 const hist=data.hist.filter(v=>v!==null);
 const maxHist=Math.max(1e-9,...hist.map(Math.abs))*1.25;
 font('MACD 12/26/9',94);
 const mid=126;
 for(let i=0;i<data.hist.length;i++){
  const v=data.hist[i];if(v===null)continue;
  const x=left+i/(data.hist.length-1)*span,y=mid-v/maxHist*27;
  c.fillStyle=v>=0?'#58d5b0':'#fa7d96';c.fillRect(x,Math.min(mid,y),Math.max(1,span/(data.hist.length-1)-1),Math.max(1,Math.abs(y-mid)));
 }
 c.fillStyle='#718ba2';c.fillRect(left,mid,span,1);
 const widths=data.bb.map(x=>x?.widthPct??null),vals=widths.filter(x=>x!==null),
 maxBB=Math.max(0.05,...vals)*1.1;
 font('BB 20/2',174);
 draw(widths,180,227,0,maxBB,'#88c2ff');
 const lastBB=data.bb[n];
 if(lastBB){font('Genişlik %'+lastBB.widthPct.toFixed(2),191);}
 return {rsi:endRsi,macdHist:data.hist[n],bb:lastBB,source:'CLOSED_OHLC_CLIENT_RECALC'};
}
g.CoinLiveIndicators={indicators,render};
})(globalThis);
