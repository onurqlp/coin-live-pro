/* Verifiable historical archive coverage; research only, no trading actions. */
(function(root){
 'use strict';
 function valid(x) {
  return !!x && x.schema==='uzayx.binance.coverage.v1' &&
   x.real_orders===false && x.net_strategy_pnl_verified===false &&
   Number.isInteger(x.catalogue_observed_count) &&
   Number.isInteger(x.archived_symbol_count) &&
   Number.isInteger(x.current_trading_verified_count) &&
   Number.isInteger(x.verified_1h_months) &&
   x.archived_symbol_count<=x.catalogue_observed_count &&
   x.verified_1h_months>=x.archived_symbol_count &&
   typeof x.source_updated_at_utc==='string';
 }
 if (typeof module==='object' && module.exports) module.exports={valid};
 if (!root.document) return;
 let section, lastCommit='';
 const tr=n=>Number.isFinite(n)?n.toLocaleString('tr-TR'):'—';
 function tag(t,c,s){const n=document.createElement(t);if(c)n.className=c;n.textContent=s;return n;}
 function init(){
  const p=document.getElementById('research');
  if (!p || document.getElementById('binance-coverage'))return;
  section=tag('article','panel rd-panel','');
  section.id='binance-coverage';
  section.setAttribute('aria-label','Binance geçmiş veri kapsamı');
  section.append(tag('h3','','Binance Futures · Geçmiş Veri Kapsamı'),
   tag('p','rd-note','Doğrulanmış, tarihsel kaynakların büyüyen araştırma arşivi. Canlı sinyal veya ispatlanmış PNL değildir.'));
  section.append(tag('p','rd-warning','Veri kapsamı kontrol ediliyor…'));
  p.querySelector('.sectionhead')?.after(section);
 }
 function render(x,reason){
  init();if(!section)return;
  while(section.children.length>2)section.lastElementChild.remove();
  if(!valid(x)){section.append(tag('p','rd-warning',reason||'SOURCE_UNAVAILABLE · Kaynak henüz doğrulanamadı.'));return;}
  const age=Date.now()-Date.parse(x.source_updated_at_utc);
  if(!Number.isFinite(age)||age< -120000||age>48*3600000){
   section.append(tag('p','rd-warning','DATA_STALE · Tarihsel arşiv özeti 48 saatten eski.'));return;
  }
  const grid=tag('div','rd-grid','');
  for(const [label,value] of [
   ['Katalogdaki sözleşme',tr(x.catalogue_observed_count)],
   ['Güncel durumu API ile doğrulanan',tr(x.current_trading_verified_count)],
   ['Doğrulanmış aylık dosya',tr(x.verified_1h_months)],
   ['OHLCV verisi olan sözleşme',tr(x.archived_symbol_count)],
   ['Doğrulanmış 1H mum',tr(x.verified_1h_bars)]]){
   const cell=tag('div','rd-metric','');
   cell.append(tag('small','',label),tag('strong','',value));
   grid.append(cell);
  }
  section.append(grid);
  const warnings=[];
  if(x.funding!=='VERIFIED')warnings.push('Funding: '+String(x.funding));
  if(x.open_interest!=='VERIFIED')warnings.push('Open interest: '+String(x.open_interest));
  if(x.orderbook_history!=='VERIFIED')warnings.push('Emir defteri geçmişi: '+String(x.orderbook_history));
  if(x.source_health?.um!=='OK'||x.source_health?.cm!=='OK')warnings.unshift('SOURCE_UNAVAILABLE · Binance canlı sözleşme API durumu doğrulanamadı.');
  warnings.push('Geriye dönük tüm delist edilmiş sözleşme evreni doğrulanmadı.');
  section.append(tag('p','rd-warning',warnings.join(' · ')));
  section.append(tag('p','rd-source',
    'Arşiv kaynağı '+new Date(x.source_updated_at_utc).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})+
    ' TSİ · '+x.research_state+' · Sadece araştırma, gerçek emir yok.'));
 }
 root.addEventListener('uzayx:loaded',async e=>{
  const commit=e.detail?.sourceCommit;
  if(!/^[a-f0-9]{40}$/.test(commit||'')){render(null,'SOURCE_UNAVAILABLE · Kaynak SHA doğrulanamadı.');return;}
  if(commit===lastCommit)return;lastCommit=commit;
  const url='https://raw.githubusercontent.com/onurqlp/coin-live-pro/'+commit+'/web/data/uzayx-binance-coverage.json';
  try{
   const resp=await fetch(url,{cache:'no-store'});
   if(!resp.ok)throw new Error('HTTP_'+resp.status);
   render(await resp.json());
  }catch(error){render(null,'SOURCE_UNAVAILABLE · Binance arşiv özeti yüklenemedi.');}
 });
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof globalThis!=='undefined'?globalThis:this);
