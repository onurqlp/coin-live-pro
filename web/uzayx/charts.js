/* UzayX 2 — closed-candle charts, risk levels and research-only indicators.
   Browser UI plus pure functions for unit tests. No trade execution. */
(function(root, factory) {
  const api=factory(root);
  if(typeof module==='object' && module.exports) module.exports=api;
  root.UzayXCharts=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root) {
  'use strict';
  const isNum=x=>typeof x==='number' && Number.isFinite(x);
  const validNum=x=>isNum(x)&&x>0;
  function normalizeCandles(raw) {
    if(!Array.isArray(raw))return [];
    const rows=raw.filter(a=>Array.isArray(a)&&a.length>=5&&
      [a[0],a[1],a[2],a[3],a[4]].every(isNum)&&a[0]>0&&
      [a[1],a[2],a[3],a[4]].every(v=>v>0)&&
      a[2]>=Math.max(a[1],a[4])&&a[3]<=Math.min(a[1],a[4]))
      .sort((a,b)=>a[0]-b[0]);
    return rows.filter((a,i)=>i===0||a[0]!==rows[i-1][0]).slice(-80);
  }
  function computeIndicators(rows) {
    const closes=rows.map(x=>x[4]);
    const rsi=Array(closes.length).fill(null),macd=Array(closes.length).fill(null),signal=Array(closes.length).fill(null),hist=Array(closes.length).fill(null);
    let gain=0,loss=0,fast=null,slow=null,sig=null;
    const alpha12=2/13,alpha26=2/27,alpha9=2/10;
    for(let i=0;i<closes.length;i++){
      const v=closes[i];
      fast=fast===null?v:fast+alpha12*(v-fast);
      slow=slow===null?v:slow+alpha26*(v-slow);
      if(i>=25){macd[i]=fast-slow;sig=sig===null?macd[i]:sig+alpha9*(macd[i]-sig);if(i>=33){signal[i]=sig;hist[i]=macd[i]-sig;}}
      if(i===0)continue;
      const change=v-closes[i-1],up=Math.max(0,change),down=Math.max(0,-change);
      if(i<=14){
        gain+=up;loss+=down;
        if(i===14){gain/=14;loss/=14;}
      }else{
        gain=(gain*13+up)/14;loss=(loss*13+down)/14;
      }
      if(i>=14)rsi[i]=loss===0?(gain===0?50:100):100-100/(1+gain/loss);
    }
    return {rsi,macd,signal,hist};
  }
  function deriveLevels(candidate,frame) {
    if(!candidate||!validNum(candidate.price))return [];
    const side=candidate.side==='LONG'?'LONG':candidate.side==='SHORT'?'SHORT':null;
    if(!side)return [];
    const result=[{key:'ref',label:'Gözlem fiyatı',value:candidate.price,color:'#96b6ca'}];
    const threshold=side==='SHORT'?frame?.breakout_low_prev8:frame?.breakout_high_prev8;
    if(frame?.quality==='CLOSED_CONFIRMED'&&validNum(threshold))
      result.push({key:'threshold',label:'Kırılım eşiği',value:threshold,color:'#b1a3ff'});
    if(validNum(candidate.stop))result.push({key:'stop',label:'STOP',value:candidate.stop,color:'#fa8698'});
    (Array.isArray(candidate.targets)?candidate.targets.slice(0,3):[]).forEach((v,i)=>{
      if(validNum(v))result.push({key:'tp'+(i+1),label:'TP'+(i+1),value:v,color:'#66dfba'});
    });
    return result;
  }
  function sourceAligned(state,chart,mtf){
    return Boolean(state?.sourceCommit&&/^[0-9a-f]{40}$/.test(state.sourceCommit)&&
      state?.db?.manifest?.publication_valid===true&&
      state.db.manifest.scan_id&&state.db.radar?.scan_id===state.db.manifest.scan_id&&
      state.db.radar.source_mtf_at===mtf?.fetched_at&&
      chart?.source_mtf_at===mtf?.fetched_at&&
      chart?.source==='OKX_CLOSED_CANDLES'&&chart.chart_only===true&&
      chart.no_real_orders===true);
  }
  const fmt=(v,d=3)=>isNum(v)?v.toLocaleString('tr-TR',{maximumFractionDigits:d}):'—';
  const date=s=>{const x=new Date(s||'');return Number.isFinite(+x)?x.toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';};
  const doc=root.document;
  let source=null,pack=null,mtf=null,loadedSha=null,loading=null,chosen=null,tf='1H';
  const $=id=>doc?.getElementById(id);
  const text=(id,v)=>{if($(id))$(id).textContent=v;};
  function node(tag,cl,label){const x=doc.createElement(tag);if(cl)x.className=cl;if(label!==undefined)x.textContent=label;return x;}
  function allCandidates(){
    const r=source?.db?.radar||{};
    return [].concat(r.spotlight||[],r.motion||[],r.watch||[],r.recheck||[]);
  }
  function findCandidate(symbol){
    return allCandidates().filter(p=>p.symbol===symbol).sort((a,b)=>Date.parse(b.last_evaluated_at||0)-Date.parse(a.last_evaluated_at||0))[0]||null;
  }
  function chartStateMessage(){
    const observed=source?.db?.manifest?.finished_at_utc;
    const delay=Math.round((Date.now()-Date.parse(observed||''))/60000);
    if(!Number.isFinite(delay)||delay<0||delay>25)return 'Kaynak gecikmiş · grafik geçmiş gözlemdir';
    if(source?.db?.health?.status!=='OK')return 'Tarama uyarısı · yeni teyit yok';
    return 'Kaynak '+fmt(delay,0)+' dk önce doğrulandı';
  }
  async function json(url){
    const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),13000);
    try{const r=await fetch(url,{cache:'no-store',signal:ctrl.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(timeout);}
  }
  async function ensure(){
    if(!source?.sourceCommit){text('mini-chart-state','Kaynak commit doğrulanmadı');return false;}
    if(loadedSha===source.sourceCommit && pack && mtf)return true;
    if(loading)return loading;
    const commit=source.sourceCommit;
    const base='https://raw.githubusercontent.com/onurqlp/coin-live-pro/'+commit+'/web/data/';
    loading=(async()=>{
      try{
        const [a,b]=await Promise.all([json(base+'chart-pack.json'),json(base+'mtf.json')]);
        if(!source||source.sourceCommit!==commit)return false;
        if(!sourceAligned(source,a,b))throw Error('Grafik/MACD/RSI kaynakları aynı doğrulanmış taramaya ait değil');
        pack=a;mtf=b;loadedSha=commit;
        const avail=Object.keys(pack.candles_by_symbol||{});
        if(!chosen||!avail.includes(chosen)){
          const best=allCandidates().find(p=>avail.includes(p.symbol)&&p.review_state==='FRESH')||
            allCandidates().find(p=>avail.includes(p.symbol));
          chosen=best?.symbol||(avail.includes('BTCUSDT')?'BTCUSDT':avail[0]||null);
        }
        updateSelector();paint();
        return true;
      }catch(e){pack=null;mtf=null;loadedSha=null;text('mini-chart-state','Grafik doğrulanamadı: '+String(e.message||e));text('chart-message','Grafik doğrulanamadı: '+String(e.message||e));return false;}
      finally{loading=null;}
    })();
    return loading;
  }
  function updateSelector(){
    const select=$('chart-symbol');if(!select||!pack)return;
    select.replaceChildren();
    const options=Object.keys(pack.candles_by_symbol||{}).sort((a,b)=>{
      const ca=findCandidate(a),cb=findCandidate(b);
      return Number(Boolean(cb))-Number(Boolean(ca)) || a.localeCompare(b);
    });
    options.forEach(k=>{const option=node('option','',k);option.value=k;select.append(option);});
    if(!options.includes(chosen))chosen=options[0]||null;
    select.value=chosen||'';
  }
  function canvasSetup(canvas,height){
    if(!canvas||!canvas.clientWidth)return null;
    const w=canvas.clientWidth,h=height,dpr=Math.min(3,root.devicePixelRatio||1);
    canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    return {ctx,w,h};
  }
  function priceChart(canvas,rows,levels,small){
    const cfg=canvasSetup(canvas,small?198:350);if(!cfg||!rows.length)return;
    const {ctx,w,h}=cfg, L=10,R=small?70:100,T=18,B=25,plotW=w-L-R,plotH=h-T-B;
    if(plotW<60)return;
    const values=rows.flatMap(r=>[r[2],r[3]]).concat(levels.map(x=>x.value));
    let hi=Math.max(...values),lo=Math.min(...values),pad=(hi-lo)*.075||hi*.005;
    hi+=pad;lo=Math.max(0,lo-pad);
    const y=v=>T+(hi-v)/(hi-lo)*plotH;
    ctx.font='10px system-ui';ctx.textBaseline='middle';
    for(let i=0;i<=4;i++){
      const v=lo+(hi-lo)*i/4,py=y(v);
      ctx.strokeStyle='#263849';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(L,py);ctx.lineTo(w-R+2,py);ctx.stroke();
      ctx.fillStyle='#859bab';ctx.textAlign='right';ctx.fillText(fmt(v,v>=10?2:5),w-3,py);
    }
    const barWidth=plotW/rows.length;
    rows.forEach((b,i)=>{
      const x=L+barWidth*(i+.5),green=b[4]>=b[1];
      ctx.strokeStyle=ctx.fillStyle=green?'#5acdae':'#ef8093';
      ctx.lineWidth=Math.max(1,Math.min(2,barWidth*.22));
      ctx.beginPath();ctx.moveTo(x,y(b[2]));ctx.lineTo(x,y(b[3]));ctx.stroke();
      const top=Math.min(y(b[1]),y(b[4])),height=Math.max(1,Math.abs(y(b[1])-y(b[4])));
      ctx.fillRect(x-Math.max(1,barWidth*.31),top,Math.max(2,barWidth*.62),height);
    });
    levels.forEach(x=>{
      const py=y(x.value);if(py<T||py>h-B)return;
      ctx.setLineDash(x.key==='ref'?[3,5]:[6,4]);
      ctx.strokeStyle=x.color;ctx.lineWidth=x.key==='stop'?1.7:1.1;
      ctx.beginPath();ctx.moveTo(L,py);ctx.lineTo(w-R,py);ctx.stroke();
      ctx.setLineDash([]);ctx.textAlign='right';ctx.fillStyle=x.color;
      ctx.font=small?'9px system-ui':'10px system-ui';
      ctx.fillText(x.key==='ref'?'FİYAT':x.key==='threshold'?'EŞİK':x.label,w-3,Math.max(T+7,Math.min(h-B-7,py-9)));
    });
    ctx.fillStyle='#91a8b6';ctx.textAlign='left';ctx.font='10px system-ui';
    [0,Math.floor(rows.length/2),rows.length-1].forEach(i=>{
      const x=L+barWidth*(i+.5);
      const dt=new Date(rows[i][0]);
      ctx.fillText(dt.toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit',timeZone:'UTC'}),Math.max(L,Math.min(w-R-40,x-20)),h-10);
    });
  }
  function oscillator(canvas,series,type){
    const cfg=canvasSetup(canvas,106);if(!cfg)return;
    const {ctx,w,h}=cfg,L=11,R=53,T=11,B=15,plotH=h-T-B,plotW=w-L-R;
    const n=series.length;if(!n)return;
    const vals=series.filter(isNum);
    if(vals.length<2)return;
    let lo=type==='rsi'?0:Math.min(0,...vals),hi=type==='rsi'?100:Math.max(0,...vals);
    if(lo===hi){lo-=1;hi+=1;}
    const y=v=>T+(hi-v)/(hi-lo)*plotH;
    ctx.font='10px system-ui';ctx.textAlign='right';
    (type==='rsi'?[30,50,70]:[0]).forEach(v=>{
      const py=y(v);ctx.setLineDash(v===50||v===0?[]:[3,4]);ctx.strokeStyle='#394657';ctx.beginPath();ctx.moveTo(L,py);ctx.lineTo(w-R,py);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#91a8b6';ctx.fillText(fmt(v,1),w-6,py+3);
    });
    const dx=plotW/n;
    if(type==='macd'){
      series.forEach((v,i)=>{if(!isNum(v))return;ctx.fillStyle=v>=0?'#5acdae':'#ee8897';ctx.fillRect(L+i*dx,y(Math.max(0,v)),Math.max(1,dx*.65),Math.max(1,Math.abs(y(v)-y(0))));});
    }else{
      ctx.beginPath();let started=false;
      series.forEach((v,i)=>{if(!isNum(v))return;const x=L+i*dx+dx/2;started?ctx.lineTo(x,y(v)):ctx.moveTo(x,y(v));started=true;});
      ctx.strokeStyle='#a1a7fc';ctx.lineWidth=2;ctx.stroke();
    }
  }
  function levelTiles(container,levels,extra){
    if(!container)return;
    container.replaceChildren();
    levels.forEach(x=>{
      const item=node('div','level-cell '+x.key);
      item.append(node('span','',x.label),node('strong','',fmt(x.value,x.value<1?7:4)));
      container.append(item);
    });
    if(!levels.length)container.append(node('p','muted','Kaydedilmiş eşik / stop / hedef bulunamadı.'));
    if(extra)container.append(node('p','levels-disclaimer',extra));
  }
  function paint(){
    if(!pack||!mtf||!chosen)return;
    const a=pack.candles_by_symbol?.[chosen];
    const rows=normalizeCandles(a?.[tf]);
    const c=findCandidate(chosen);
    const indicators=mtf.candidates?.find(x=>x.symbol===chosen&&(!c||x.side===c.side))||
      mtf.candidates?.find(x=>x.symbol===chosen);
    const frame=indicators?.frames?.[tf];
    const breakout=indicators?.frames?.['4H'];
    const levels=deriveLevels(c,breakout);
    const state=chartStateMessage();
    text('mini-chart-label',chosen+' · '+tf+' · '+(c?.side||'PİYASA'));
    text('chart-heading',chosen+' · '+tf);
    text('chart-message',state+' · OKX kapanmış mumları, işlem tavsiyesi değil');
    text('mini-chart-state',state);
    text('chart-last-candle',rows.length?'Son mum: '+date(new Date(rows.at(-1)[0]).toISOString())+' · '+rows.length+' kayıt':'Bu parite / periyotta mum bulunamadı');
    const badges=$('chart-indicators');if(badges){
      badges.replaceChildren();
      [['RSI 1H',indicators?.frames?.['1H']?.rsi_14],['RSI 4H',indicators?.frames?.['4H']?.rsi_14],
        ['MACD 4H',indicators?.frames?.['4H']?.macd_12_26_9?.hist_pct],
        ['ADX 4H',indicators?.frames?.['4H']?.adx_14]].forEach(([n,v])=>{
        const b=node('div','indicator-tile');b.append(node('span','',n),node('b','',fmt(v,2)));badges.append(b);
      });
    }
    text('scenario-title',c?(c.side==='SHORT'?'SHORT gözlemi':'LONG gözlemi')+' · '+(c.paper_entry_state==='ELIGIBLE'?'Koşullu inceleme':'Giriş teyidi yok'):'Bu pariteye ait güncel radar senaryosu yok');
    text('scenario-detail',c?'Kaydedilen: '+date(c.last_evaluated_at)+' · '+(c.confirmation_state||'TEYİT BEKLENİYOR')+
      ' · Grafikteki eşik 4H kapanmış mum yapısıdır; emir tetikleyicisi değildir.':'Seçilen parite için yalnız geçmiş kapanmış mumlar gösteriliyor.');
    levelTiles($('chart-levels'),levels,'Seviyeler OKX kaynaklı kaydedilmiş araştırma senaryosudur. Binance fiyatı farklı olabilir.');
    levelTiles($('mini-levels'),levels.slice(0,5),null);
    if(rows.length<2)return;
    priceChart($('mini-price'),rows,levels,true);
    priceChart($('chart-price'),rows,levels,false);
    const osc=computeIndicators(rows);
    oscillator($('chart-rsi'),osc.rsi,'rsi');
    oscillator($('chart-macd'),osc.hist,'macd');
    text('chart-indicator-note','RSI(14) ve MACD(12/26/9) görsel eğrileri kapanmış mumlardan hesaplanır; üstteki 1H/4H sayıları doğrulanmış MTF kaynağıdır.');
  }
  function onLoaded(ev){
    source=ev.detail;const sha=source?.sourceCommit;
    if(sha!==loadedSha){pack=null;mtf=null;loadedSha=null;}
    if(!sha||!source?.db?.radar){text('mini-chart-state','Kaynak doğrulanmadı; grafik gizli');return;}
    if(loadedSha===sha){paint();return;}
    ensure();
  }
  function open(candidate){
    const requested=typeof candidate==='string'?candidate:candidate?.symbol||chosen;
    chosen=requested;
    const tab=doc?.querySelector('[data-tab="chart"]');tab?.click();
    ensure().then(()=>{if(pack?.candles_by_symbol?.[requested]){chosen=requested;$('chart-symbol').value=chosen;paint();}else{text('chart-message','İstenen parite için doğrulanmış mum paketi yok. Listeden başka parite seçin.');}});
  }
  if(doc){
    root.addEventListener('uzayx:loaded',onLoaded);
    root.addEventListener('uzayx:tab',e=>{if(e.detail?.tab==='chart'){ensure().then(ok=>{if(ok)paint();});}});
    root.addEventListener('resize',()=>{if(pack)paint();});
    doc.addEventListener('visibilitychange',()=>{if(!doc.hidden&&pack)paint();});
    doc.addEventListener('uzayx:open-chart',e=>open(e.detail?.candidate||e.detail?.symbol));
    doc.addEventListener('DOMContentLoaded',()=>{
      $('chart-symbol')?.addEventListener('change',e=>{chosen=e.target.value;paint();});
      doc.querySelectorAll('[data-chart-tf]').forEach(b=>b.addEventListener('click',()=>{
        tf=b.dataset.chartTf;doc.querySelectorAll('[data-chart-tf]').forEach(x=>x.classList.toggle('selected',x===b));paint();
      }));
    });
  }
  return {normalizeCandles,computeIndicators,deriveLevels,sourceAligned,open};
});