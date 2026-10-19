/* Source-pinned research and complete-ledger attribution; no order or cash writes. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;
root.UzayXResearchDesk=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
function accept(data,manifest,commit,now=Date.now()){
 const age=now-Date.parse(data?.source_finished_at_utc||'');
 const valid=Boolean(/^[a-f0-9]{40}$/.test(commit||'')&&data?.schema==='uzayx.research.v1'&&
   data?.no_real_orders===true&&data?.research_only===true&&data?.account?.reconciled===true&&
   manifest?.publication_valid===true&&data.scan_id===manifest.scan_id&&Number.isFinite(age)&&age>=-120000&&age<=25*60000);
 return {valid,age,reason:valid?null:'Güncel ve aynı taramaya ait araştırma kaydı bekleniyor.'};
}
if(!root.document)return {accept};
const doc=root.document,$=id=>doc.getElementById(id);
const el=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
const fmt=(v,d=2)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('tr-TR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const money=v=>fmt(v)+' USDT';
const time=s=>{const d=new Date(s||'');return Number.isFinite(+d)?d.toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';};
const labels={SPARK_KIVILCIM:'Kıvılcım kuralı',SPARK_ERKEN_SINYAL:'Erken sinyal kuralı',SPARK_ISIK_GUCLENIYOR:'Güçlenen ışık kuralı',SPARK_GELDI:'GELDİ kuralı',LEGACY_UNASSIGNED:'Kimliği olmayan eski kayıtlar'};
let latest=null,horizon='24H';
function heading(title,note){const head=el('div','rd-head');head.append(el('h3','',title),el('span','rd-label',note));return head;}
function metric(label,value,note){const cell=el('div','rd-metric');cell.append(el('small','',label),el('strong','',value));if(note)cell.append(el('small','',note));return cell;}
function init(){
 const overview=$('overview'),turan=$('turan'),funds=$('funds');if(!overview||!turan||!funds)return;
 const brief=el('article','rd-brief');brief.id='research-brief';brief.setAttribute('aria-label','Güncel piyasa özeti');
 brief.append(heading('Piyasa özeti','Kaynak kontrol ediliyor'));
 const lanes=el('div','rd-lanes');
 for(const [id,label] of [['MOTION','Hareketlenen'],['WATCH','İzlenen'],['SPARK','Kıvılcım']]){
  const b=el('button','rd-lane');b.type='button';b.dataset.briefFilter=id;
  b.append(el('strong','','—'),el('span','',label));
  b.addEventListener('click',()=>{doc.querySelector('[data-watch-filter="'+id+'"]')?.click();$('watch-search')?.scrollIntoView({block:'center',behavior:'smooth'});});lanes.append(b);
 }
 brief.append(lanes,el('p','rd-source','Doğrulanmış tarama bekleniyor.'));overview.prepend(brief);
 const lab=el('details','panel rd-panel');lab.id='research-desk';
 const labSummary=el('summary','rd-lab-summary');labSummary.append(heading('İleri araştırma laboratuvarı','7 aile · ayrıntıları aç'));
 lab.append(labSummary);
 lab.append(el('p','rd-note','Yeni kurallar ayrı izlenir. 1–7 günlük fiyat hareketi, gerçekleşmiş işlem kârı değildir.'));
 const frames=el('div','rd-frames');frames.setAttribute('aria-label','Araştırma gözlem süresi');
 for(const [id,label] of [['1H','1 saat'],['4H','4 saat'],['24H','1 gün'],['3D','3 gün'],['7D','7 gün']]){
  const b=el('button','',label);b.type='button';b.dataset.rdHorizon=id;
  b.addEventListener('click',()=>{horizon=id;render();});frames.append(b);
 }
 const families=el('div','rd-families');families.id='research-families';families.textContent='Araştırma kaydı yükleniyor…';
 lab.append(frames,families);turan.insertBefore(lab,$('turan-cash-view'));
 const risk=el('article','panel rd-panel');risk.id='risk-desk';risk.append(heading('Kasa ve ortak risk','SANAL HESAP'));
 const body=el('div');body.id='risk-desk-body';body.textContent='Tam kayıt defteri doğrulanıyor…';risk.append(body);
 const first=funds.querySelector('.cash-kpis');if(first)first.after(risk);else funds.append(risk);
 if(latest)render();
}
function render(){
 if(!$('research-brief')||!latest)return;
 const {db,sourceCommit,faults=[]}=latest,m=db?.manifest,r=db?.research;
 const groups=root.UzayXWatchdesk?.buildGroups(db,sourceCommit);
 const brief=$('research-brief');brief.classList.toggle('rd-delayed',!groups?.valid);
 brief.querySelector('.rd-label').textContent=!groups?.valid?'Güncel kaynak bekleniyor':faults.includes('minute_check')?'Son doğrulanmış kayıt':'Doğrulanmış gözlem';
 brief.querySelector('.rd-source').textContent='OKX · '+time(m?.finished_at_utc)+' TSİ · Gözlem sayıları, işlem emri değildir.';
 brief.querySelectorAll('[data-brief-filter]').forEach(b=>{
  const count=groups?.valid?groups.groups[b.dataset.briefFilter].length:null;
  b.querySelector('strong').textContent=fmt(count,0);b.disabled=!groups?.valid;
 });
 const state=accept(r,m,sourceCommit),area=$('research-families'),body=$('risk-desk-body');
 area.replaceChildren();body.replaceChildren();
 $('research-desk').querySelectorAll('[data-rd-horizon]').forEach(b=>{const on=b.dataset.rdHorizon===horizon;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
 if(!state.valid){area.append(el('p','rd-warning',state.reason));body.append(el('p','rd-warning',state.reason));return;}
 for(const family of r.families||[]){
  const d=el('details','rd-family'),s=el('summary'),left=el('div');
  left.append(el('strong','',family.id+' · '+family.name),el('small','',family.status==='BLOCKED_SECTOR_SOURCE'?'Sektör kaynağı bekleniyor':family.events+' yeni olay'));
  const x=family.horizons?.[horizon];s.append(left,el('span','rd-result',x?.observed?fmt(x.median_direction_pct)+'%':'Sonuç bekleniyor'));d.append(s);
  d.append(el('p','rd-note',family.rule));
  const stats=el('div','rd-grid');stats.append(metric('Ölçülen olay',fmt(x?.observed||0,0)),metric('Süresi dolmayan',fmt(x?.tracking||0,0)),metric('Veri eksik',fmt(x?.unavailable||0,0)));d.append(stats);
  d.append(el('p','rd-note',x?.observed?'Özgün yöne göre medyan fiyat hareketi '+fmt(x.median_direction_pct)+'%; ters yöne göre '+fmt(-x.median_direction_pct)+'%. Dolum, stop, komisyon ve fonlama içeren işlem sonucu değildir.':'Süre tamamlanıp gelecekteki kapalı mumlar doğrulanınca sonuç burada görünür.'));
  const events=(r.events||[]).filter(e=>e.strategy_id===family.id).slice(-5).reverse();
  for(const e of events)d.append(el('p','rd-event',e.symbol+' · '+e.side+' · '+time(e.observed_at_utc)+' · '+(e.horizons?.[horizon]?.state==='OBSERVED'?fmt(e.horizons[horizon].close_direction_pct)+'%':'İzleniyor / veri bekleniyor')));
  area.append(d);
 }
 const c=r.account,grid=el('div','rd-grid');
 grid.append(metric('Brüt nominal',money(c.gross_nominal_usdt)),metric('Ayrılmış teminat',money(c.remaining_margin_usdt)),metric('Açık sanal bilet',fmt(c.open_count,0)));
 body.append(grid,el('p','rd-warning','Fonlama dahil değil. Kesin tasfiye ve emir defteri yürütümü modellenmedi. Yeni girişlerde kaldıraç en fazla 20x.'));
 body.append(el('p','rd-note','LONG nominal '+money(c.nominal_by_side.LONG)+' · SHORT nominal '+money(c.nominal_by_side.SHORT)+'. Aynı coin ve hareketten doğan biletler ortak risk taşır.'));
 const accountGrid=el('div','rd-grid');accountGrid.append(metric('Tam kapanan sonuç',money(c.closed_realized_usdt)),metric('Diğer kısmi gerçekleşen',money(c.partial_realized_usdt)),metric('Toplam gerçekleşen',money(c.realized_all_usdt)));body.append(accountGrid);
 const attribution=el('details','rd-disclosure');attribution.append(el('summary','',c.attributed_count+' kimlikli yeni kayıt · '+c.unknown_attribution_count+' eski kayıt ayrı'));
 for(const g of c.groups||[]){const row=el('div','rd-attribution');row.append(el('span','',labels[g.id]||g.id),el('strong','',money(g.realized_usdt)),el('small','',g.count+' bilet · '+g.closed+' kapanmış · '+g.open+' açık'));attribution.append(row);}
 attribution.append(el('p','rd-note','Bu gerçek Spark kural kimlikleri TURAN ailesi değildir. Eski biletlere geriye dönük strateji atanmamıştır.'));
 body.append(attribution);
 const coins=el('details','rd-disclosure');coins.append(el('summary','','Coin bazında yoğunlaşma ve senaryo'));
 for(const coin of (c.coins||[]).slice(0,12)){const row=el('div','rd-attribution');row.append(el('span','',coin.symbol),el('strong','',money(coin.nominal_usdt)),el('small','',coin.tickets+' açık bilet'));coins.append(row);}
 coins.append(el('p','rd-note','Bütün açık kontratların aynı anda %2 yükseldiği sabit miktarlı senaryo: '+money(c.uniform_plus_2pct_scenario_usdt)+'. Stop/TP, ücret ve funding hariç varsayımdır; tahmin değildir.'));body.append(coins);
 body.append(el('p','rd-source','Tam kayıt defteri uzlaştırıldı · '+time(r.generated_at_utc)+' TSİ · kaynak '+sourceCommit.slice(0,8)));
}
root.addEventListener('uzayx:loaded',e=>{latest=e.detail;render();});
root.addEventListener('uzayx:source-check',e=>{latest=e.detail;render();});
if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init);else init();
return {accept};
});
