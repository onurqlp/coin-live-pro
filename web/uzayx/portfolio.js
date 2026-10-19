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
 const money=v=>fmt(v,2)+' USDT';
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
 let source=null,filter='OPEN',query='',selectedId=null,focused=null,homeSearch='',homeExpanded=false;
 const HOME_PREVIEW=12;
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
   const title=node('div','position-detail-head');title.append(node('strong','',t.symbol+' · '+t.side),node('span','chip',t.status));info.append(title);
   const detail=node('div','position-stats');
   detail.append(
    moneyCell('Sinyal fiyatı',fmt(t.signal_price,6)),moneyCell('Sanal giriş',fmt(t.fill_price,6)),
    moneyCell('Son işaretleme',fmt(t.mark_price,6)),moneyCell('STOP',fmt(t.stop,6)),
    moneyCell('TP1 / TP2 / TP3',[t.tp1,t.tp2,t.tp3].map(v=>fmt(v,6)).join(' / ')),
    moneyCell('Gerçekleşmiş',money(t.realized_net_usdt)),moneyCell('Açık değerleme',money(t.unrealized_net_usdt)),
    moneyCell('Notional',money(t.reference_notional_usdt)));
   info.append(detail);
   info.append(node('p','muted tiny','Sinyal '+stamp(t.signal_at_utc)+' · Sanal giriş '+stamp(t.filled_at_utc)+
     ' · Kaynak: kapanmış OKX 5 dakikalık mumdan tahmini dolum. Funding modellenmedi.'));
   root.dispatchEvent(new CustomEvent('uzayx:position-selected',{detail:{ticket:t}}));
 }
 function renderRows(){
   const area=$('position-rows');if(!area)return;area.replaceChildren();
   const items=positions(source?.db?.spark,filter,query);
   root.document.querySelectorAll('[data-position-filter]').forEach(b=>{
     const on=b.dataset.positionFilter===filter;
     b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));
   });
   if(!items.length){area.append(node('p','muted','Bu durumda görüntülenecek güncel örnek yok.'));show(null);return;}
   items.slice(0,40).forEach(t=>{
     const b=node('button','position-row'+(selectedId===t.event_id?' selected':''));b.type='button';
     b.append(node('span','position-symbol',t.symbol+' · '+t.side),
       node('span','position-entry',t.status==='WAITING_FUTURE_BAR'?'Giriş bekliyor':fmt(t.fill_price,6)),
       node('span','position-pnl '+((t.unrealized_net_usdt||0)+(t.realized_net_usdt||0)>=0?'positive':'negative'),
         t.status==='WAITING_FUTURE_BAR'?'—':signed((t.unrealized_net_usdt||0)+(t.realized_net_usdt||0))+' USDT'));
     b.addEventListener('click',()=>{show(t);renderRows();});
     area.append(b);
   });
   if(!items.some(x=>x.event_id===selectedId))show(items[0]);
   $('position-count').textContent='Son kayıt örneğinde '+items.length+' eşleşme · ilk 40 gösteriliyor';
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
   $('cash-coverage').textContent=summary.represented+' son bilet gösteriliyor / toplam '+summary.total+
      '. Kaydedilen her yeni kıvılcım sanal niyet olarak izlenir; dolum sonraki kapanmış mumdan doğrulanır.';
   $('cash-asof').textContent='Kayıt: '+stamp(doc.updated_at)+' · '+(valid?'Kaynak uyumlu':'Kontrol gerekli');
   $('cash-main').textContent=money(paper.equity_usdt);
   $('cash-main-open').textContent=fmt(paper.open_positions?.length||0,0)+' ana pozisyon';
   renderDaily(doc);renderRows();renderHome();
 }
 if(root.document){
   root.addEventListener('uzayx:loaded',e=>{source=e.detail;render();});
   root.addEventListener('uzayx:tab',e=>{if(e.detail?.tab==='funds')render();});
   root.addEventListener('resize',()=>{if(source&&$('funds')?.classList.contains('active'))renderDaily(source.db.spark);});
   root.document.addEventListener('DOMContentLoaded',()=>{
     root.document.querySelectorAll('[data-position-filter]').forEach(b=>b.addEventListener('click',()=>{
       filter=b.dataset.positionFilter;renderRows();
     }));
     $('position-search')?.addEventListener('input',e=>{query=e.target.value.toUpperCase().trim();renderRows();});
     $('home-position-search')?.addEventListener('input',e=>{homeSearch=e.target.value.toUpperCase().trim();homeExpanded=false;renderHome();});
     $('home-open-more')?.addEventListener('click',()=>{homeExpanded=!homeExpanded;renderHome();});
     $('cash-reload')?.addEventListener('click',()=>root.document.getElementById('reload')?.click());
     $('cash-audit')?.addEventListener('click',()=>root.document.querySelector('[data-tab="system"]')?.click());
   });
 }
 return {reconcile,positions,completeOpenPositions,paperPnl};
});