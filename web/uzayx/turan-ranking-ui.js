'use strict';
/* Read-only live TURAN Top30: money rankings only with exact ledger identity. */
(()=>{
 const el=document.getElementById('turan-top30');if(!el||!window.UzayXTuranRank)return;
 const $=(tag,cl,txt)=>{const n=document.createElement(tag);if(cl)n.className=cl;if(txt!==undefined)n.textContent=String(txt);return n};
 const fmt=(n,suffix='')=>n===null||n===undefined||!Number.isFinite(Number(n))?'—':(Number(n)>0?'+':'')+Number(n).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+suffix;
 const money=n=>fmt(n,' USDT');
 const clock=v=>{const d=new Date(v||'');return Number.isFinite(+d)?d.toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—'};
 const head=$('div','trank-heading');
 const heading=$('div','trank-heading-main');
 heading.append($('strong','','İlk 30 · Strateji performansı'),$('small','','Kâr varsa net kâra göre; kanıt yoksa gözlem önceliğine göre.'));
 const btn=$('button','trank-refresh','↻ Verileri kontrol et');btn.type='button';
 head.append(heading,btn);
 const info=$('p','trank-info','Kaynaklar doğrulanıyor…');
 const stats=$('div','trank-stats');
 const controls=$('div','trank-controls');
 const filter=$('select','trank-filter');filter.setAttribute('aria-label','İlk 30 liste filtresi');
 [['ALL','İlk 30 (tümü)'],['MEASURED','İşlem sonucu kayıtlı'],['OBSERVED','1H gözlem bulunan'],['UNMEASURED','Henüz ölçülmeyen']].forEach(([v,t])=>{const op=$('option','',t);op.value=v;filter.append(op)});
 const query=$('input','trank-search');query.type='search';query.placeholder='Coin, strateji, kod ara';query.setAttribute('aria-label','İlk 30 stratejide ara');
 const expand=$('button','trank-expand','Tüm detayları aç');expand.type='button';
 controls.append(query,filter,expand);
 const list=$('div','trank-list');
 const footer=$('p','trank-footer','İşlem gerçekleşmesi ve kâr/zarar için aynı strateji kimliğiyle uzlaştırılmış sanal emir kaydı gerekir. 1H fiyat gözlemleri kâr, dolum veya başarı garantisi değildir.');
 const old=$('details','trank-old');
 const oldHead=$('summary','','Eski 30 araştırma tasarımının bütün ayrıntıları');
 old.append(oldHead);
 el.replaceChildren(head,info,stats,controls,list,footer,old);
 const original=document.getElementById('turan-catalog');if(original)old.append(original);
 let data=null,error='',busy=false,allOpen=false,limitObs=8;
 function summaryCell(k,v,type=''){
  const b=$('div','trank-stat '+type);b.append($('small','',k),$('strong','',v));return b;
 }
 function line(body,label,value){
  const row=$('div','trank-line');row.append($('span','',label),$('strong','',value));body.append(row);
 }
 function tradeRow(t){
  const pnl=(Number(t.realized_net_usdt)||0)+(t.status==='OPEN'?(Number(t.unrealized_net_usdt)||0):0);
  const row=$('div','trank-trade-row');
  row.append($('div','trank-event-meta',(t.symbol||'—')+' · '+(t.side||'—')+' · '+clock(t.closed_at_utc||t.filled_at_utc||t.signal_at_utc)));
  row.append($('span','trank-event-result '+(pnl<0?'negative':'positive'),money(pnl)));
  return row;
 }
 function observationRow(x){
  const row=$('div','trank-obs-row');
  row.append($('div','trank-event-meta',(x.symbol||'—')+' · '+x.side+' · '+clock(x.observedAt)+' → '+clock(x.measuredAt)));
  row.append($('span','trank-event-result '+(x.positive?'positive':x.negative?'negative':''),fmt(x.directionalPct,'%')+' · '+(x.positive?'yöne uydu':x.negative?'ters gitti':'nötr')));
  return row;
 }
 function card(x,index){
  const root=$('details','trank-card');root.open=allOpen;
  const summary=$('summary','trank-card-title');
  const left=$('div','trank-name');left.append($('strong','',(index+1)+'. '+x.name),$('small','',x.id+' · '+(x.source==='legacy'?'Eski araştırma modeli':'Yeni AR-GE ailesi')));
  const right=$('div','trank-right');
  const hasPnl=x.tagged&&x.closedCount>0;
  right.append($('strong','trank-money '+(hasPnl?(x.realized<0?'negative':'positive'):'not-available'),hasPnl?money(x.realized):'PnL ölçülmedi'));
  if(x.observations.length)right.append($('small','','1H yön gözlemi: '+x.winObservation+' uyumlu / '+x.lossObservation+' ters'));
  else right.append($('small','','Veri bekleniyor'));
  summary.append(left,right);root.append(summary);
  const content=$('div','trank-card-body');
  line(content,'Araştırma hipotezi',x.desc||'—');
  line(content,'Strateji durumu',hasPnl?'Sanal işlem kaydı mevcut; dönem dışı doğrulama ayrı gerekir':x.observations.length?'Gözlem var, sanal işlem sonucu atfedilmemiş':'Bağımsız performans henüz ölçülmedi');
  line(content,'Sanal net gerçekleşen',hasPnl?money(x.realized):'— · ilişkilendirilmiş emir yok');
  line(content,'Kapanış kazançları',hasPnl?money(x.closedWinnings):'—');
  line(content,'Kapanış kayıpları',hasPnl?money(x.closedLosses):'—');
  line(content,'Açık tahmini PnL',x.tagged?money(x.unrealized):'— · ölçülmedi');
  line(content,'Aktif teminat',x.tagged?money(x.margin):'— · ölçülmedi');
  line(content,'Sanal kapanış sayısı',x.tagged?String(x.closedCount):'—');
  if(x.model){
   line(content,'Bağlı eski gözlem modeli',x.model+' · gerçek emir değildir');
   line(content,'1 saatlik yön gözlemleri',x.observations.length+' gözlem / '+x.winObservation+' uyumlu / '+x.lossObservation+' ters');
  }else line(content,'1 saatlik yön gözlemleri','Henüz bağlı model yok; kayıt uydurulmaz');
  if(x.tagged&&x.closed.length){
   content.append($('h4','trank-subtitle','İşlem sonucu bulunan coinler'));
   const trades=$('div','trank-events');x.closed.slice(0,12).forEach(t=>trades.append(tradeRow(t)));content.append(trades);
   if(x.closed.length>12)content.append($('p','trank-note','İlk 12 işlem gösterildi · toplam '+x.closed.length+' kapanış'));
  }
  if(x.observations.length){
   const box=$('div','trank-evidence');box.append($('h4','trank-subtitle','Coin / zaman · 1 saatlik fiyat yönü'));
   const favorable=$('div','trank-obs');const adverse=$('div','trank-obs');
   const wins=x.observations.filter(y=>y.positive),losses=x.observations.filter(y=>y.negative);
   const winTitle=$('h5','trank-obs-label','Yöne uyan gözlemler');const lossTitle=$('h5','trank-obs-label','Yöne uymayan gözlemler');
   const mount=(host,arr)=>{if(!arr.length)host.append($('p','trank-note','Kayıt yok'));else arr.slice(0,limitObs).forEach(x=>host.append(observationRow(x)))};
   favorable.append(winTitle);mount(favorable,wins);
   adverse.append(lossTitle);mount(adverse,losses);
   box.append(favorable,adverse);
   box.append($('p','trank-note','Yön değişimi ileri kapanmış mumla ölçülmüştür. Gerçek işlem, dolum, net kâr ve kazanma oranı değildir. Aynı olay farklı modellerde bulunabilir.'));
   content.append(box);
   if(wins.length>limitObs||losses.length>limitObs){
    const more=$('button','trank-more','Bütün coin ve tarih kayıtlarını göster');more.type='button';
    more.addEventListener('click',()=>{favorable.replaceChildren(winTitle);adverse.replaceChildren(lossTitle);wins.forEach(y=>favorable.append(observationRow(y)));losses.forEach(y=>adverse.append(observationRow(y)));more.remove()});content.append(more);
   }
  }
  content.append($('p','trank-note','Kaynak eşleşmesi: '+(x.tagged?'Sanal bilette açık strateji kimliği':'Emir ile strateji arasında doğrulanmış kimlik bağlantısı yok')+' · Sonuçlar sanaldır, fonlama maliyeti modellenmemiştir.'));
  root.append(content);return root;
 }
 function render(){
  list.replaceChildren();stats.replaceChildren();
  if(!data){info.textContent=error?'Kaynak kontrol hatası: '+error:'Veriler yükleniyor…';return}
  stats.append(summaryCell('Araştırma havuzu',data.total+' aile'),
   summaryCell('Sanal PnL kaydı olan',data.attributableCount+' aile',data.attributableCount?'positive':''),
   summaryCell('İlk 30',data.top.length+' kart'));
  info.textContent=data.moneyRankingAvailable
   ?'Net kâr sıralaması: sadece doğrudan atfedilmiş sanal kapanışlar · '+clock(data.generated)+' · sonuçlar ileri doğrulanmış kâr garantisi değildir.'
   :'Henüz strateji kimliğiyle eşleşen sanal kapanış yok. İlk 30 şu an GÖZLEM ÖNCELİĞİ sırasıdır, en kârlılar listesi değildir. '+clock(data.generated);
  if(!data.completeLedger)info.textContent+=' · İşlem dökümü eksik olduğundan PnL atfı kapalı.';
  const term=query.value.toLocaleLowerCase('tr-TR').trim(),f=filter.value;
  const showing=data.top.filter(x=>(f==='ALL'||f==='MEASURED'&&x.tagged&&x.closedCount>0||f==='OBSERVED'&&x.observations.length>0||f==='UNMEASURED'&&!x.tagged)&&
   (!term||(x.name+' '+x.id+' '+x.desc+' '+x.observations.map(t=>t.symbol).join(' ')).toLocaleLowerCase('tr-TR').includes(term)));
  showing.forEach(x=>list.append(card(x,data.top.indexOf(x))));
  if(!showing.length)list.append($('p','trank-note','Bu filtrede ilk 30 içinde eşleşen strateji yok. Diğer 200 aileyi AR-GE kataloğunda bulabilirsin.'));
  expand.textContent=allOpen?'Tüm detayları kapat':'Tüm detayları aç';
 }
 async function reload(){
  if(busy)return;busy=true;btn.disabled=true;btn.textContent='Kontrol ediliyor…';
  const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),17000);
  try{
   const files=['./turan-registry.json','../data/v4-spark-paper.json','../data/v4-forward.json','../data/ops-report.json'];
   const result=await Promise.all(files.map(async p=>{const r=await fetch(p+'?v='+Date.now(),{cache:'no-store',signal:ctl.signal});if(!r.ok)throw Error('HTTP '+r.status+' · '+p);return r.json()}));
   data=window.UzayXTuranRank.buildBoard(...result);error='';render();
  }catch(e){data=null;error=String(e.message||e);render()}
  finally{clearTimeout(timeout);busy=false;btn.disabled=false;btn.textContent='↻ Verileri kontrol et'}
 }
 btn.addEventListener('click',reload);filter.addEventListener('change',render);query.addEventListener('input',render);
 expand.addEventListener('click',()=>{allOpen=!allOpen;list.querySelectorAll('details.trank-card').forEach(x=>x.open=allOpen);expand.textContent=allOpen?'Tüm detayları kapat':'Tüm detayları aç'});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.getElementById('turan')?.classList.contains('active'))reload()});
 window.addEventListener('uzayx:tab',e=>{if(e.detail?.tab==='turan')reload()});
 setInterval(()=>{if(!document.hidden&&document.getElementById('turan')?.classList.contains('active'))reload()},120000);
 reload();
})();
