/* UzayX paper portfolio viewer: records from existing forward-only virtual ledger.
   No backfill, no created fills, no live account credentials. */
(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.UzayXPortfolio=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const fmt=(v,d=2)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('tr-TR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
 const signed=v=>(typeof v==='number'&&v>0?'+':'')+fmt(v,4);
 const money=v=>typeof v==='number'&&Number.isFinite(v)?fmt(v,2)+' USDT':'—';
 const numeric=v=>typeof v==='number'&&Number.isFinite(v);
 const pct=v=>numeric(v)?(v>0?'+':'')+fmt(v,2)+'%':'—';
 const positionNet=t=>t?.status==='WAITING_FUTURE_BAR'?null:
  numeric(t?.realized_net_usdt)&&numeric(t?.unrealized_net_usdt)?t.realized_net_usdt+t.unrealized_net_usdt:
  numeric(t?.realized_net_usdt)&&t?.status==='CLOSED'?t.realized_net_usdt:null;
 const statusName=v=>({OPEN:'Açık',CLOSED:'Kapandı',WAITING_FUTURE_BAR:'Mum bekleniyor',DATA_GAP:'Veri boşluğu',CAPACITY_BLOCKED:'Kasa limiti',INVALID_LEVEL:'Seviye geçersiz',OPPOSITE_CANCELLED:'Karşı sinyal iptali'})[v]||String(v||'—');
 const stamp=s=>{const t=Date.parse(s||'');return Number.isFinite(t)?new Date(t).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';};
 const $=id=>root.document?.getElementById(id);
 const node=(tag,cls,text)=>{const n=root.document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
 function reconcile(doc){
   const s=doc?.summary||{},q=s.counts||{},recent=Array.isArray(doc?.recent_tickets)?doc.recent_tickets:[];
   const expected=Object.values(q).reduce((a,v)=>a+(Number.isInteger(v)&&v>=0?v:0),0);
   const proven=doc?.no_real_orders===true&&doc?.combined_with_strict_paper_cash===false&&
     doc?.no_backfilled_outcomes===true&&
     typeof doc.all_events_count==='number'&&expected===doc.all_events_count &&
     recent.every(t=>t.is_real_trade===false);
   return {proven,total:doc?.all_events_count||0,represented:recent.length,
     open:q.OPEN||0,waiting:q.WAITING_FUTURE_BAR||0,closed:q.CLOSED||0,
     daily:s.daily||[],balance:s.virtual_equity_usdt,realized:s.realized_net_usdt,unrealized:s.unrealized_net_usdt,
     counts:q};
 }
 function positions(doc,filter='OPEN',search=''){
   const list=Array.isArray(doc?.recent_tickets)?doc.recent_tickets:[];
   const query=String(search).trim().toUpperCase();
   const verifiedFullOpen=doc?.open_positions_complete===true&&Array.isArray(doc.open_positions)&&
     doc.open_positions.length===doc?.summary?.counts?.OPEN;
   const openPositions=verifiedFullOpen?doc.open_positions:[];
   const combined=filter==='OPEN'&&verifiedFullOpen?openPositions:
     filter==='ALL'&&verifiedFullOpen?
       [...openPositions,...list.filter(t=>t.status!=='OPEN')]:list;
   return combined.filter(t=>filter==='ALL'||t.status===filter)
     .filter(t=>!query||String(t.symbol||'').toUpperCase().includes(query))
     .sort((a,b)=>(Date.parse(b.filled_at_utc||b.signal_at_utc)||0)-(Date.parse(a.filled_at_utc||a.signal_at_utc)||0));
 }
 let source=null,filter='OPEN',query='',selectedId=null,focused=null,homeSearch='',homeExpanded=false,positionLimit=80;
 const HOME_PREVIEW=12;
 // Single immutable-snapshot summary. Do not display stale/mismatched figures as live returns.
 function homeGlance(doc,manifest,paper,commit,now=Date.now()){
   const valid=Boolean(/^[0-9a-f]{40}$/.test(commit||'')&&
     manifest?.publication_valid===true&&manifest?.no_real_orders===true&&
     doc?.no_real_orders===true&&doc?.combined_with_strict_paper_cash===false&&
     doc?.no_backfilled_outcomes===true&&doc?.scan_id===manifest?.scan_id&&
     paper?.scan_id===manifest?.scan_id);
   const age=now-Date.parse(manifest?.finished_at_utc||'');
   const fresh=Number.isFinite(age)&&age>=-120000&&age<=25*60000;
   if(!valid)return {valid:false,fresh:false,last:null,floating:null,todayNet:null,todayClosed:null,margin:null,notional:null,leverageMin:null,leverageMax:null};
   const items=[...(Array.isArray(doc.recent_tickets)?doc.recent_tickets:[]),
     ...(Array.isArray(doc.open_positions)?doc.open_positions:[])]
     .filter(t=>t?.is_real_trade!==true&&Number.isFinite(Date.parse(t.filled_at_utc||'')))
     .sort((a,b)=>Date.parse(b.filled_at_utc)-Date.parse(a.filled_at_utc));
   const today=new Date(now).toISOString().slice(0,10);
   const daily=doc.daily?.today?.date_utc===today?doc.daily.today:null;
   return {valid:true,fresh,last:items[0]||null,
     floating:numeric(doc.summary?.unrealized_net_usdt)?doc.summary.unrealized_net_usdt:null,
     todayNet:numeric(daily?.realized_net_usdt)?daily.realized_net_usdt:null,
     todayClosed:Number.isInteger(daily?.closed)?daily.closed:null,
     margin:numeric(doc.minimum_new_margin_usdt)?doc.minimum_new_margin_usdt:null,
     notional:numeric(doc.minimum_new_ticket_notional_usdt)?doc.minimum_new_ticket_notional_usdt:null,
     leverageMin:numeric(doc.leverage_min)?doc.leverage_min:null,
     leverageMax:numeric(doc.leverage_max)?doc.leverage_max:null};
 }
 function renderHomeGlance(doc,manifest,paper,commit){
   const state=homeGlance(doc,manifest,paper,commit);
   const set=(id,value)=>{const item=$(id);if(item)item.textContent=value;};
   const signedMoney=v=>numeric(v)?paperPnl(v):'—';
   const color=(id,v)=>{const item=$(id);if(item)item.className=numeric(v)?v<0?'negative':'positive':'muted';};
   set('home-latest-symbol',state.valid&&state.last?state.last.symbol+' · '+state.last.side:'—');
   set('home-latest-time',state.valid&&state.last?
     stamp(state.last.filled_at_utc)+' · '+money(state.last.reference_notional_usdt)+' nominal':
     'Doğrulanmış giriş bekleniyor');
   set('home-floating',state.valid?signedMoney(state.floating):'—');
   set('home-today-net',state.valid?signedMoney(state.todayNet):'—');
   set('home-today-closed',state.valid&&state.todayClosed!==null?
     state.todayClosed+' kapanan sanal pozisyon · UTC':'Bugünkü kapanış verisi yok');
   set('home-entry-budget',state.valid&&state.margin!==null?money(state.margin)+' teminat':'—');
   set('home-entry-setup',state.valid&&state.notional!==null?
     'En az '+money(state.notional)+' nominal'+
       (state.leverageMin!==null&&state.leverageMax!==null?' · '+state.leverageMin+'–'+state.leverageMax+'x':''):
     'Yeni kayıt büyüklüğü doğrulanamadı');
   set('home-glance-source',!state.valid?'Kaynak eşleşmedi · değerler gizlendi. Yeni kayıt bekleniyor.':
     state.fresh?'Doğrulanmış tarama · '+stamp(doc.updated_at)+' · tahmini sanal sonuçlar.':
       'Gecikmiş son kayıt · '+stamp(doc.updated_at)+' · canlı piyasa sonucu değildir.');
   color('home-floating',state.valid?state.floating:null);
   color('home-today-net',state.valid?state.todayNet:null);
 }
 const paperPnl=v=>typeof v==='number'&&Number.isFinite(v)?signed(v)+' USDT':'—';
 function completeOpenPositions(doc){
   const total=doc?.summary?.counts?.OPEN;
   const a=doc?.open_positions;
   if(doc?.open_positions_complete===true&&Number.isInteger(total)&&Array.isArray(a)&&
      a.length===total&&a.every(t=>t.status==='OPEN'&&t.is_real_trade!==true))
     return {complete:true,rows:a};
   return {complete:false,rows:Array.isArray(doc?.recent_tickets)?
     doc.recent_tickets.filter(x=>x.status==='OPEN'):[]};
 }
 function renderHome(){
   const box=$('home-open-list');if(!box)return;
   const doc=source?.db?.spark||{},s=source?.db?.manifest||{},full=completeOpenPositions(doc);
   const valid=source?.sourceCommit&&s.publication_valid===true&&
     doc.scan_id===s.scan_id&&source?.db?.paper?.scan_id===s.scan_id&&doc.no_real_orders===true;
   const age=Date.now()-Date.parse(s.finished_at_utc||'');
   const fresh=Number.isFinite(age)&&age>=-120000&&age<=25*60000;
   renderHomeGlance(doc,s,source?.db?.paper,source?.sourceCommit);
   const all=full.rows;
   const matches=all.filter(x=>String(x.symbol||'').toUpperCase().includes(homeSearch)).sort((a,b)=>
     (Date.parse(b.filled_at_utc||b.signal_at_utc)||0)-(Date.parse(a.filled_at_utc||a.signal_at_utc)||0));
   const rows=homeExpanded?matches:matches.slice(0,HOME_PREVIEW);
   const more=$('home-open-more');
   if(more){more.hidden=matches.length<=HOME_PREVIEW;more.textContent=homeExpanded?'Listeyi kısalt':'Tüm '+matches.length+' açık pozisyonu göster';}
   $('home-open-count').textContent=Number.isInteger(doc.summary?.counts?.OPEN)?String(doc.summary.counts.OPEN):'—';
   $('home-open-time').textContent='Kayıt '+stamp(doc.updated_at)+' · '+(valid&&fresh?'Güncel':valid?'Gecikmiş':'Doğrulanamadı');
   const opposite=Number.isInteger(doc.opposite_pending_count)?doc.opposite_pending_count:0;
   $('home-open-note').textContent=(full.complete?
     'Toplam '+all.length+' açık sanal bilet doğrulandı':
     'Kısmi kayıt: '+all.length+' açık bilet; tamamı henüz doğrulanamadı')+
     ' · gösterilen '+rows.length+(homeSearch?' (arama sonucu)':'')+
     (opposite?' · Karşı sinyal kapanışı için doğrulanmış 5 dk mum bekleyen: '+opposite:'')+
     ' · Gerçek emir yok.';
   box.replaceChildren();
   if(!rows.length){box.append(node('p','muted',valid?'Eşleşen açık sanal pozisyon yok.':'Sanal kasa doğrulanamadı.'));return;}
   rows.forEach(t=>{
     const btn=node('button','home-open-row');btn.type='button';
     const n=node('span','home-position-symbol');
     n.append(node('b','',String(t.symbol||'—')),node('small','',String(t.side||'')));
     const raw=(typeof t.unrealized_net_usdt==='number'&&Number.isFinite(t.unrealized_net_usdt)?t.unrealized_net_usdt:null);
     const pnl=node('span','home-position-pnl '+(raw===null?'muted':raw<0?'negative':'positive'),paperPnl(raw));
     btn.append(n,node('span','home-position-fill',fmt(t.fill_price,5)),pnl,node('span','home-position-caret','›'));
     btn.title='Ana sayfada bu paritenin grafiğini incele';
     btn.addEventListener('click',()=>{
       const candidate={symbol:t.symbol,side:t.side,kind:'PAPER',price:t.mark_price||t.fill_price,
         stop:t.stop,targets:[t.tp1,t.tp2,t.tp3],score:0,
         last_evaluated_at:doc.updated_at,review_state:'PAPER_ONLY',
         paper_entry_state:'NOT_ELIGIBLE',confirmation_state:'SANAL_ACIK'};
       root.dispatchEvent(new CustomEvent('uzayx:select-coin',{detail:{candidate}}));
       const detail=$('watch-detail');if(detail){
         detail.hidden=false;
         $('watch-detail-title').textContent=t.symbol+' · '+t.side+' · SANAL';
         $('watch-detail-meta').textContent='Açık sanal pozisyon · giriş '+stamp(t.filled_at_utc);
         $('watch-detail-price').textContent=fmt(t.fill_price,5);
         $('watch-detail-stop').textContent=fmt(t.stop,5);
         $('watch-detail-tps').textContent=[t.tp1,t.tp2,t.tp3].map((v,i)=>'TP'+(i+1)+' '+fmt(v,5)).join(' · ');
         $('watch-detail-paper').textContent='Açık PnL: '+(raw===null?'doğrulanmadı':paperPnl(raw))+' · emir gönderilmez';
       }
     });
     box.append(btn);
   });
 }
 function moneyCell(label,value){const n=node('div','position-stat');n.append(node('small','',label),node('b','',value));return n;}
 function renderRecent(doc){
   const recent=Array.isArray(doc?.recent_tickets)?doc.recent_tickets:[];
   const full=completeOpenPositions(doc);
   const byId=new Map([...recent,...full.rows].filter(x=>x?.event_id).map(x=>[x.event_id,x]));
   const lastOpen=[...byId.values()].filter(x=>Date.parse(x.filled_at_utc||''))
     .sort((a,b)=>Date.parse(b.filled_at_utc)-Date.parse(a.filled_at_utc))[0];
   const lastClose=recent.filter(x=>x.status==='CLOSED'&&Date.parse(x.closed_at_utc||''))
     .sort((a,b)=>Date.parse(b.closed_at_utc)-Date.parse(a.closed_at_utc))[0];
   $('cash-latest-open').textContent=lastOpen?lastOpen.symbol+' · '+lastOpen.side:'Henüz doğrulanan yok';
   $('cash-latest-open-time').textContent=lastOpen?
     stamp(lastOpen.filled_at_utc)+' · '+money(lastOpen.reference_notional_usdt)+' nominal':'Giriş için sonraki kapanmış mum bekleniyor';
   $('cash-latest-close').textContent=lastClose?lastClose.symbol+' · '+lastClose.side:'Son örnekte yok';
   $('cash-latest-close-time').textContent=lastClose?
     stamp(lastClose.closed_at_utc)+' · net '+paperPnl(lastClose.realized_net_usdt):'Kapanmış kayıtlar son bilet örneğinden okunur';
   const margin=doc?.minimum_new_margin_usdt;
   $('cash-size-policy').textContent=typeof margin==='number'?money(margin)+' teminat':'—';
   $('cash-size-note').textContent='10–30x · min. '+money(doc?.minimum_new_ticket_notional_usdt)+
     ' nominal · eski dönem sadece arşivde';
 }
 function renderDaily(doc){
   const canvas=$('cash-performance');if(!canvas)return;
   const days=(doc?.daily?.days||[]).filter(d=>typeof d.realized_net_usdt==='number')
     .slice(0,30).reverse();
   const parent=canvas.parentElement;
   const w=parent?.clientWidth||300,h=160,dpr=Math.min(2,root.devicePixelRatio||1);
   canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
   const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
   if(!days.length){ctx.fillStyle='#adc0cb';ctx.fillText('Günlük kapanış verisi yok',12,h/2);return;}
   const vals=days.map(x=>x.realized_net_usdt),max=Math.max(1,...vals.map(Math.abs)),mid=h*.50;
   ctx.strokeStyle='#3e5868';ctx.beginPath();ctx.moveTo(8,mid);ctx.lineTo(w-8,mid);ctx.stroke();
   const bar=Math.min(56,(w-36)/days.length);
   days.forEach((d,i)=>{
     const x=18+i*((w-36)/days.length)+(w-36)/days.length/2;
     const height=(Math.abs(d.realized_net_usdt)/max)*(h*.34);
     ctx.fillStyle=d.realized_net_usdt>=0?'#5ed6b1':'#f18b9b';
     ctx.fillRect(x-bar*.33,d.realized_net_usdt>=0?mid-height:mid,bar*.66,Math.max(height,1));
     ctx.fillStyle='#b7cad6';ctx.font='10px system-ui';ctx.textAlign='center';
     ctx.fillText(String(d.date_utc||'').slice(5),x,h-9);
     ctx.fillText(signed(d.realized_net_usdt),x,d.realized_net_usdt>=0?Math.max(10,mid-height-8):Math.min(h-20,mid+height+11));
   });
 }
 function show(t){
   focused=t;selectedId=t?.event_id||null;
   const info=$('position-detail');if(!info)return;
   if(!t){info.replaceChildren(node('p','muted','Göstermek için bir sanal pozisyon seçin.'));return;}
   info.replaceChildren();
   const title=node('div','position-detail-head');
   title.append(node('strong','',t.symbol+' · '+t.side),node('span','chip',statusName(t.status)));
   info.append(title);
   const size=t.reference_notional_usdt;
   const net=positionNet(t);
   const roi=numeric(net)&&numeric(size)&&size>0?100*net/size:null;
   const detail=node('div','position-stats');
   detail.append(
     moneyCell('Sinyal zamanı (TR)',stamp(t.signal_at_utc)),
     moneyCell('Giriş zamanı (TR)',stamp(t.filled_at_utc)),
     moneyCell('Kapanış zamanı (TR)',stamp(t.closed_at_utc)),
     moneyCell('Yön ve aşama',t.side+' · '+String(t.entry_class||t.stage_at_birth||'KIVILCIM')),
     moneyCell('Sinyal fiyatı (OKX)',fmt(t.signal_price,7)),
     moneyCell('Sanal giriş fiyatı',fmt(t.fill_price,7)),
     moneyCell('Son kayıtlı fiyat',fmt(t.mark_price,7)),
     moneyCell('STOP',fmt(t.stop,7)),
     moneyCell('TP1 / TP2 / TP3',[t.tp1,t.tp2,t.tp3].map(v=>fmt(v,7)).join(' / ')),
     moneyCell('Başlangıç nominali',money(size)),
     moneyCell('Kaldıraç',typeof t.leverage==='number'?fmt(t.leverage,0)+'x':'—'),
     moneyCell('Sanal başlangıç teminatı',money(t.initial_margin_usdt)),
     moneyCell('Kalan pozisyon nominali',money(t.remaining_notional_usdt)),
     moneyCell('Kayıtlı birim miktar',fmt(t.remaining_qty,8)),
     moneyCell('Gerçekleşen net sanal kâr/zarar',money(t.realized_net_usdt)),
     moneyCell('Açık net sanal değerleme',t.status==='OPEN'?money(t.unrealized_net_usdt):'—'),
     moneyCell('Toplam net sonuç',numeric(net)?paperPnl(net):'—'),
     moneyCell('Nominale göre net sonuç',pct(roi)),
     moneyCell('Tahmini ödenen komisyon',money(t.fees_estimated_usdt)),
     moneyCell('Giriş komisyonu',money(t.entry_fee_usdt)),
     moneyCell('Değerleme durumu',String(t.valuation_status||'—'))
   );
   info.append(detail);
   const records=Array.isArray(t.exits)?t.exits:[];
   const ledger=node('div','position-exits');
   ledger.append(node('h4','','Gerçekleşen sanal çıkışlar · '+records.length));
   if(records.length)records.forEach(x=>{
     ledger.append(node('p','position-exit-row',
       String(x.kind||'Çıkış')+' · '+stamp(x.closed_at_utc)+' · Fiyat '+fmt(x.price,7)+
       ' · Miktar '+fmt(x.qty,7)+' · Net '+paperPnl(x.net_usdt)));
   });else ledger.append(node('p','muted tiny','Henüz kayıtlı sanal çıkış yok.'));
   info.append(ledger);
   info.append(node('p','muted tiny',
     'Kaynak: ileride kapanmış OKX 5 dakikalık mumundan tahmini dolum. 10–30x sanal kaldıraç seviyesi ölçülmüş kazanma ihtimali değildir. Komisyon ve kayma varsayımsaldır; fonlama, gerçek emir fiyatı ve tasfiye dahil değildir. '+ 
     (numeric(size)&&size<30?'Bu işlem 30 USDT kuralından önceki tarihsel kayıttır.':'')+
     ' Gerçek emir verilmez.'));
   root.dispatchEvent(new CustomEvent('uzayx:position-selected',{detail:{ticket:t}}));
 }
 function renderRows(){
   const area=$('position-rows');if(!area)return;area.replaceChildren();
   const items=positions(source?.db?.spark,filter,query);
   root.document.querySelectorAll('[data-position-filter]').forEach(b=>{
     const on=b.dataset.positionFilter===filter;
     b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));
   });
   if(!items.length){
     area.append(node('p','muted','Bu durumda görüntülenecek güncel örnek yok.'));
     $('position-more').hidden=true;
     $('position-count').textContent='0 kayıt · kapanmış kayıtlar son bilet örneği ile sınırlıdır';
     show(null);return;
   }
   items.slice(0,positionLimit).forEach(t=>{
     const pnl=positionNet(t);
     const b=node('button','position-row'+(selectedId===t.event_id?' selected':''));
     b.type='button';
     b.append(
       node('span','position-symbol',t.symbol+' · '+t.side),
       node('span','position-entry',
         (t.status==='WAITING_FUTURE_BAR'?'Giriş bekleniyor':stamp(t.filled_at_utc))+
         ' · '+money(t.reference_notional_usdt)),
       node('span','position-pnl '+(numeric(pnl)?pnl<0?'negative':'positive':'muted'),
         numeric(pnl)?paperPnl(pnl):'—')
     );
     b.addEventListener('click',()=>{show(t);renderRows();});
     area.append(b);
   });
   const more=$('position-more');
   more.hidden=items.length<=positionLimit;
   more.textContent='Sonraki '+Math.min(80,items.length-positionLimit)+' pozisyonu göster';
   $('position-count').textContent=items.length+' eşleşen sanal kayıt · '+Math.min(positionLimit,items.length)+
     ' gösteriliyor'+(filter==='CLOSED'?' · son kayıt örneği':'');
   show(items.find(x=>x.event_id===selectedId)||items[0]);
 }
 function render(){
   const doc=source?.db?.spark||{},summary=reconcile(doc),paper=source?.db?.paper||{};
   if(!$('cash-status'))return;
   const valid=summary.proven&&doc.scan_id===source?.db?.manifest?.scan_id &&
     paper.scan_id===doc.scan_id&&source?.sourceCommit&&source?.db?.manifest?.publication_valid===true;
   const sourceAge=Date.now()-Date.parse(source?.db?.manifest?.finished_at_utc||'');
   const fresh=Number.isFinite(sourceAge)&&sourceAge>=-120000&&sourceAge<=25*60000;
   $('cash-status').textContent=!valid?'Kayıt doğrulama uyarısı':fresh?'Sanal motor · güncel kayıt':'Sanal kayıt · veri gecikmiş';
   $('cash-status').className='chip '+(valid&&fresh?'':'amber');
   $('cash-equity').textContent=money(summary.balance);
   $('cash-realized').textContent=money(summary.realized);
   $('cash-floating').textContent=money(summary.unrealized);
   $('cash-open').textContent=fmt(summary.open,0);
   $('cash-waiting').textContent=fmt(summary.waiting,0);
   $('cash-closed').textContent=fmt(summary.closed,0);
   $('cash-total').textContent=fmt(summary.total,0);
   $('cash-coverage').textContent=(doc.epoch_id?
      'Yeni dönem '+stamp(doc.epoch_started_at_utc)+' · önceki kasanın tüm işlemleri ayrı arşive taşındı. ':'')+
      summary.represented+' son bilet gösteriliyor / toplam '+summary.total+
      '. Kaydedilen her yeni kıvılcım sanal niyet olarak izlenir; dolum sonraki kapanmış mumdan doğrulanır.';
   $('cash-asof').textContent='Kayıt: '+stamp(doc.updated_at)+' · '+(valid?'Kaynak uyumlu':'Kontrol gerekli');
   $('cash-main').textContent=money(paper.equity_usdt);
   $('cash-main-open').textContent=fmt(paper.open_positions?.length||0,0)+' ana pozisyon';
   renderDaily(doc);renderRecent(doc);renderRows();renderHome();
 }
 if(root.document){
   root.addEventListener('uzayx:loaded',e=>{source=e.detail;render();});
   root.addEventListener('uzayx:tab',e=>{if(e.detail?.tab==='funds')render();});
   root.addEventListener('resize',()=>{if(source&&$('funds')?.classList.contains('active'))renderDaily(source.db.spark);});
   root.document.addEventListener('DOMContentLoaded',()=>{
     root.document.querySelectorAll('[data-position-filter]').forEach(b=>b.addEventListener('click',()=>{
       filter=b.dataset.positionFilter;positionLimit=80;renderRows();
     }));
     $('position-search')?.addEventListener('input',e=>{query=e.target.value.toUpperCase().trim();positionLimit=80;renderRows();});
     $('position-more')?.addEventListener('click',()=>{positionLimit+=80;renderRows();});
     $('home-position-search')?.addEventListener('input',e=>{homeSearch=e.target.value.toUpperCase().trim();homeExpanded=false;renderHome();});
     $('home-open-more')?.addEventListener('click',()=>{homeExpanded=!homeExpanded;renderHome();});
     $('cash-reload')?.addEventListener('click',()=>root.document.getElementById('reload')?.click());
     $('cash-audit')?.addEventListener('click',()=>root.document.querySelector('[data-tab="system"]')?.click());
   });
 }
 return {reconcile,positions,completeOpenPositions,paperPnl,homeGlance};
});