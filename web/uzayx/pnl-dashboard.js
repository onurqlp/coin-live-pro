/* Source-pinned PAPER PNL display; strategy matches are not duplicate cash earnings. */
(function(root){
 'use strict';
 function valid(x, manifest){
  return !!x && x.schema==='uzayx.pnl.ledger.v1' &&
   x.no_real_orders===true && x.reconciled===true &&
   x.not_realized_exchange_pnl===true &&
   x.scan_id===manifest?.scan_id && manifest?.publication_valid===true &&
   Array.isArray(x.strategies) && x.strategies.length===200 &&
   Number.isFinite(x.total_pnl_usdt) &&
   Math.abs(x.starting_usdt+x.total_pnl_usdt-x.equity_usdt)<.04;
 }
 if(typeof module==='object'&&module.exports)module.exports={valid};
 if(!root.document)return;
 const document=root.document,fmt=(n,d=2)=>Number.isFinite(n)?n.toLocaleString('tr-TR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
 const usd=n=>Number.isFinite(n)?(n>0?'+':'')+fmt(n)+' USDT':'—';
 const node=(type,cl,txt)=>{const a=document.createElement(type);if(cl)a.className=cl;if(txt!==undefined)a.textContent=String(txt);return a;};
 let result=null,filters={type:'ALL',text:''},last='';
 function info(key,value){const el=node('div','pnl-metric');el.append(node('small','',key),node('strong',value<0?'pnl-loss':value>0?'pnl-profit':'',usd(value)));return el;}
 function panel(parent,id,title){
  if(!parent)return null;
  let p=document.getElementById(id);if(p)return p;
  p=node('section','panel pnl-panel');p.id=id;p.append(node('h3','',title),node('p','pnl-note','Kayıtlar doğrulanıyor…'));parent.prepend(p);return p;
 }
 function ensure(){return {
  home:panel(document.getElementById('overview'),'pnl-home','Sanal Net PNL · Kasa Özeti'),
  strategies:panel(document.getElementById('turan'),'pnl-strategies','200 Strateji · PNL ve Aktivasyon')
 };}
 function status(p,txt){while(p.children.length>1)p.lastElementChild.remove();p.append(node('p','pnl-warning',txt));}
 function render(){
  const ps=ensure();if(!result)return;
  const data=result;
  const source=new Date(data.source_at_utc),age=Date.now()-source.getTime(),stale=!Number.isFinite(age)||age>25*60000||age< -120000;
  if(!valid(data,root.__uxPnlManifest)){for(const p of Object.values(ps))if(p)status(p,'PNL_LEDGER_MISMATCH · Kayıtlar doğrulanamadı.');return;}
  for(const p of Object.values(ps))if(p)while(p.children.length>1)p.lastElementChild.remove();
  const stamp=Number.isFinite(+source)?source.toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',hour:'2-digit'}):'Bilinmiyor';
  const note='Kaynak: '+stamp+' TSİ · '+(stale?'DATA_STALE · Son teyitli arşiv; güncel fiyat değildir. ':'')+'Sanal hesap / OKX · Fonlama ve kesin tasfiye hariç. Gerçek Binance PNL değildir.';
  if(ps.home){
   const grid=node('div','pnl-kpis');
   for(const [k,v] of [['Toplam net PNL',data.total_pnl_usdt],['Gerçekleşen',data.realized_usdt],
    ['Açık tahmini PNL',data.unrealized_usdt],['Bugün kapanan',data.daily_realized_usdt?.['1']],
    ['7 gün gerçekleşen',data.daily_realized_usdt?.['7']],['30 gün gerçekleşen',data.daily_realized_usdt?.['30']]])grid.append(info(k,v));
   ps.home.append(grid,node('p','pnl-source',note),
    node('p','pnl-note','Kasa: '+fmt(data.equity_usdt)+' USDT · Açık '+data.open_count+' · Kapanan '+data.closed_count+' · Tahmini toplam ücret '+fmt(data.fees_estimated_usdt)+' USDT.'));
  }
  if(ps.strategies){
   const st=data.strategy_activation;
   ps.strategies.append(node('p','pnl-source',
    st.paper_active+' PAPER aktif · '+st.controls_active+' kontrol etkin · '+st.blocked_source+' kaynak eksik · Gerçek emir: 0.'),
    node('p','pnl-note','Stratejinin gerçek PNL sütunu yalnız tam defterde ilk/ana strateji kimliğiyle eşleşen sanal işlemdir. Bir işlemin destek verdiği diğer stratejiye kazanç yazılmaz.'));
   const controls=node('div','pnl-controls');
   const select=node('select','pnl-select');
   for(const [value,label] of [['ALL','Tüm stratejiler'],['PAPER_ACTIVE','PAPER aktif'],['RESEARCH_SOURCE_BLOCKED','Verisi eksik'],['PNL','İşlem sonucu olan']]){
    const op=node('option','',label);op.value=value;select.append(op);}
   select.value=filters.type;select.addEventListener('change',()=>{filters.type=select.value;drawRows();});
   const search=node('input','pnl-search');search.type='search';search.placeholder='Strateji veya ID ara';search.value=filters.text;
   search.addEventListener('input',()=>{filters.text=search.value;drawRows();});
   controls.append(select,search);ps.strategies.append(controls);
   const table=node('div','pnl-table');table.id='pnl-strategy-list';ps.strategies.append(table);
   const legacy=node('details','pnl-legacy');legacy.append(node('summary','','Önceki kimliksiz / eski strateji hesapları · kâr dağıtımı yapılmadı'));
   for(const x of data.legacy_unassigned){
    const p=node('p','pnl-row');p.append(node('span','',x.name+' · '+x.closed+' kapanmış'),node('b',x.realized<0?'pnl-loss':'pnl-profit',usd(x.realized)));legacy.append(p);}
   ps.strategies.append(legacy,node('p','pnl-source',note));
   const coins=node('details','pnl-legacy');coins.append(node('summary','','Coin bazında tüm sanal PNL · '+data.coins.length+' parite'));
   for(const x of data.coins){
    const p=node('p','pnl-row');const total=x.realized+x.unrealized;
    p.append(node('span','',x.symbol+' · '+x.closed+' kapanan / '+x.open+' açık'),
     node('b',total<0?'pnl-loss':'pnl-profit',usd(total)));coins.append(p);
   }
   ps.strategies.append(coins);
   drawRows();
  }
 }
 function drawRows(){
  const host=document.getElementById('pnl-strategy-list');if(!host||!result)return;
  host.replaceChildren();
  const q=filters.text.trim().toLocaleLowerCase('tr-TR');
  const rows=result.strategies.filter(s=>
   (filters.type==='ALL'||filters.type==='PNL'&&s.primary_ticket_count>0||s.state===filters.type)&&
   (s.id+' '+s.name).toLocaleLowerCase('tr-TR').includes(q))
   .sort((a,b)=>(b.primary_ticket_count>0)-(a.primary_ticket_count>0)||
     (b.realized-a.realized)||a.id.localeCompare(b.id));
  host.append(node('p','pnl-note',rows.length+' strateji · işlem sonucu olmayanlara sıfır PNL kanıtı atanmıyor.'));
  for(const x of rows){
   const row=node('div','pnl-entry');
   const left=node('div','pnl-entry-main');left.append(node('b','',x.id+' · '+x.name),
    node('small','',x.state==='PAPER_ACTIVE'?'PAPER AKTİF':x.state==='CONTROL_ACTIVE'?'KONTROL AKTİF':'KAYNAK BEKLİYOR'));
   const right=node('div','pnl-entry-stat');
   right.append(node('strong',x.realized<0?'pnl-loss':x.realized>0?'pnl-profit':'',
    x.primary_ticket_count>0?usd(x.realized):'PNL YOK'));
   right.append(node('small','',x.closed+' kapanan · '+x.open+' açık · '+x.supporting_matches+' destek'));
   row.append(left,right);host.append(row);
  }
 }
 const receive=async e=>{
  const commit=e.detail?.sourceCommit,m=e.detail?.db?.manifest;
  root.__uxPnlManifest=m;
  if(!/^[a-f0-9]{40}$/.test(commit||'')||!m?.publication_valid){
   for(const p of Object.values(ensure()))if(p)status(p,'SOURCE_UNAVAILABLE · Güvenilir kaynak SHA bulunamadı.');return;}
  if(last===commit&&result)return;last=commit;
  try{
   const url='https://raw.githubusercontent.com/onurqlp/coin-live-pro/'+commit+'/web/data/uzayx-pnl-report.json';
   const response=await fetch(url,{cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   result=await response.json();render();
  }catch(err){result=null;for(const p of Object.values(ensure()))if(p)status(p,'PNL_SOURCE_UNAVAILABLE · Tam kasa PNL raporu henüz üretilmedi.');}
 };
 root.addEventListener('uzayx:loaded',receive);
 root.addEventListener('uzayx:source-check',receive);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure,{once:true});else ensure();
})(typeof globalThis!=='undefined'?globalThis:this);
