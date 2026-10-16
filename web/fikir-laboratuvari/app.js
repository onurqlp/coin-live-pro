'use strict';
(function(){
const models=Array.isArray(window.VENTURE_MODELS)?window.VENTURE_MODELS:[];
const $=id=>document.getElementById(id);
const URLBASE='https://onurqlp.github.io/coin-live-pro/fikir-laboratuvari/';
const tierName={A:'ÖNCELİKLİ ADAY',B:'ARAŞTIRILABİLİR',C:'ŞİMDİLİK ELE'};
const priority={A:0,B:1,C:2};
const featured=[21,17,16,14,13,19];
const saveKey='makine2_shortlist_1',noteKey='makine2_notes_1';
function readStore(k,fallback){try{const v=JSON.parse(localStorage.getItem(k));return v===null?fallback:v}catch(e){return fallback}}
let shortlist=Array.isArray(readStore(saveKey,[]))?readStore(saveKey,[]).filter(x=>Number.isInteger(x)&&models.some(m=>m.id===x)):[];
let compare=[],full=false,currentCategory='all',currentTier='all',currentSort='priority',currentSearch='',budget=150000;
const nf=new Intl.NumberFormat('tr-TR',{maximumFractionDigits:0});
const money=v=>nf.format(Math.round(v))+' TL';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const get=id=>models.find(m=>m.id===Number(id));
const persist=()=>{try{localStorage.setItem(saveKey,JSON.stringify(shortlist))}catch(e){}};
function toast(s){const e=$('toast');e.textContent=s;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2500)}
function infoHTML(m){
 return '<div class="model-meta"><div><small>İLK PİLOT BÜTÇESİ</small><b>~'+nf.format(m.capital)+' bin TL</b></div><div><small>AYLIK İŞLETİM*</small><b>~'+nf.format(m.ops)+' sa</b></div><div><small>OTOMASYON</small><b>'+m.auto+'/5</b></div><div><small>RİSK / KARMAŞIKLIK</small><b>'+m.risk+'/5</b></div></div>';
}
function catalogueList(){
 let rows=models.filter(m=>(currentCategory==='all'||m.cat===currentCategory)&&(currentTier==='all'||m.tier===currentTier)&&(
 !currentSearch||Object.values(m).some(v=>String(v).toLocaleLowerCase('tr').includes(currentSearch))));
 rows.sort((a,b)=>{
  if(currentSort==='capital')return a.capital-b.capital||priority[a.tier]-priority[b.tier];
  if(currentSort==='ops')return a.ops-b.ops||priority[a.tier]-priority[b.tier];
  if(currentSort==='auto')return b.auto-a.auto||priority[a.tier]-priority[b.tier];
  if(currentSort==='risk')return a.risk-b.risk||priority[a.tier]-priority[b.tier];
  return priority[a.tier]-priority[b.tier]||a.capital-b.capital||a.id-b.id;
 });
 return rows;
}
function renderModels(){
 const rows=catalogueList(),shown=full?rows:rows.slice(0,12);
 $('resultCount').textContent=rows.length+' model bulundu · '+shown.length+' gösteriliyor';
 $('modelGrid').innerHTML=shown.map(m=>'<article class="model-card"><div class="model-head"><span class="model-id">'+String(m.id).padStart(2,'0')+' / '+esc(m.cat.toLocaleUpperCase('tr'))+'</span><span class="tier tier-'+m.tier+'">'+tierName[m.tier]+'</span></div><h3>'+esc(m.name)+'</h3><p class="model-sub">'+esc(m.tag)+'</p>'+infoHTML(m)+'<div class="model-foot"><button class="micro-btn" type="button" data-detail="'+m.id+'">Nasıl para kazandırır? ↗</button><span><button class="icon-btn '+(shortlist.includes(m.id)?'saved':'')+'" type="button" data-save="'+m.id+'" aria-label="'+(shortlist.includes(m.id)?'Kısa listeden çıkar':'Kısa listeye ekle')+'" title="Kısa listeye ekle">☆</button> <button class="icon-btn '+(compare.includes(m.id)?'compare-on':'')+'" type="button" data-compare="'+m.id+'" aria-label="Karşılaştırmaya ekle" title="Karşılaştırmaya ekle">⇄</button></span></div></article>').join('')||'<div class="empty">Bu filtrelerde eşleşen fikir yok. Filtreleri temizle.</div>';
 $('showAll').hidden=rows.length<=12;
 $('showAll').textContent=full?'İlk 12 adayı göster ↑':'Diğer '+(rows.length-12)+' modeli göster ↓';
}
function renderFeatured(){
 $('featuredGrid').innerHTML=featured.map((id,i)=>{
 const m=get(id);if(!m)return '';
 return '<article class="top-card"><div class="top-card-number">'+String(i+1).padStart(2,'0')+'</div><div><h3>'+esc(m.name)+'</h3><p>'+esc(m.simple)+'</p><div class="top-badges"><span>'+esc(m.cat)+'</span><span>~'+m.capital+'K TL pilot</span><span>Otomasyon '+m.auto+'/5</span></div><button type="button" data-detail="'+m.id+'">Nasıl kurulur, kim öder? ↗</button></div></article>';
 }).join('');
}
function dialogPart(name,txt,highlight){return '<div class="dialog-block'+(highlight?' highlight':'')+'"><h3>'+esc(name)+'</h3><p>'+esc(txt)+'</p></div>'}
function openModel(id){
 const m=get(id);if(!m)return;
 $('modelDialogBody').innerHTML='<div class="dialog-kicker">'+esc(m.cat.toLocaleUpperCase('tr'))+' / MODEL '+String(m.id).padStart(2,'0')+'</div><h2>'+esc(m.name)+'</h2><p class="dialog-intro">'+esc(m.tag)+'</p>'+
 '<div class="dialog-statline"><span>'+tierName[m.tier]+'</span><span>İlk pilot ~'+m.capital+' bin TL</span><span>İşletim ~'+m.ops+' saat/ay*</span><span>Risk '+m.risk+'/5</span></div>'+
 dialogPart('01 / BU NEDİR? EN BASİT HALİYLE',m.simple)+
 dialogPart('02 / BİZE KİM PARA VERECEK?',m.buyer)+
 dialogPart('03 / PARA TAM OLARAK NEREDEN GELİR?',m.money)+
 dialogPart('04 / HANGİ OTOMASYONU KURACAĞIZ?',m.build)+
 dialogPart('05 / HANGİ NOKTADA İŞ BOZULUR?',m.obstacle)+
 dialogPart('06 / PARA HARCADAN ÖNCE İLK DENEY',m.pilot)+
 dialogPart('07 / ÖLDÜRME / VAZGEÇME KURALI',m.kill)+
 dialogPart('ÖRNEK EKONOMİ — HİPOTETİK',m.example,true)+
 '<div class="dialog-footer"><button type="button" class="btn btn-primary" data-save="'+m.id+'">'+(shortlist.includes(m.id)?'☆ Kısa listeden çıkar':'☆ Kısa listeme ekle')+'</button><button type="button" class="btn btn-outline" data-compare="'+m.id+'">⇄ Karşılaştır</button></div>'+
 '<p style="color:#708298;font-size:10px;margin-top:20px">* Süre, bütçe ve kâr örnekleri doğrulanmış pazar verisi değil, ön eleme varsayımlarıdır.</p>';
 $('modelDialog').showModal();
}
function toggleSave(id){
 const n=Number(id),index=shortlist.indexOf(n);
 if(index>=0){shortlist.splice(index,1);toast('Kısa listeden çıkarıldı')}else{shortlist.push(n);toast('Kısa listeye eklendi')};
 persist();renderModels();renderShortlist();
 const dialog=$('modelDialog');if(dialog.open&&get(n)&&$('modelDialogBody').querySelector('[data-save="'+n+'"]')){
  const b=$('modelDialogBody').querySelector('[data-save="'+n+'"]');b.textContent=shortlist.includes(n)?'☆ Kısa listeden çıkar':'☆ Kısa listeme ekle';
 }
}
function toggleCompare(id){
 const n=Number(id),index=compare.indexOf(n);
 if(index>=0)compare.splice(index,1);
 else if(compare.length>=3){toast('Yan yana en fazla 3 model karşılaştırılabilir');return}
 else compare.push(n);
 renderModels();renderTray();
}
function renderTray(){
 $('compareTray').hidden=compare.length===0;
 $('compareTitle').textContent=compare.length+'/3 MODEL KARŞILAŞTIR';
 $('compareLabels').textContent=compare.map(id=>get(id)?.name).filter(Boolean).join(' • ');
}
function openCompare(){
 const ms=compare.map(get).filter(Boolean);if(ms.length<2){toast('Karşılaştırmak için iki veya üç model seçin');return}
 const lines=[
 ['Temel fikir',m=>m.simple],['Para kaynağı',m=>m.money],['Kim öder?',m=>m.buyer],
 ['Pilot bütçesi',m=>m.capital+' bin TL (varsayım)'],['Aylık müdahale',m=>m.ops+' saat (varsayım)'],
 ['Otomasyon',m=>m.auto+'/5'],['Risk',m=>m.risk+'/5'],['Nasıl kurulur?',m=>m.build],
 ['En büyük engel',m=>m.obstacle],['İlk test',m=>m.pilot],['Vazgeçme kuralı',m=>m.kill]
 ];
 $('comparisonBody').innerHTML='<div class="dialog-kicker">MAKİNE 2.0 / KARAR ANALİZİ</div><h2>Yan yana <em>gerçek karşılaştırma.</em></h2><p class="dialog-intro">Bir fikri sevmek yetmez: nasıl para kazanıyor ve neden başarısız olabilir?</p>'+
 '<div class="comparison-scroll"><table class="comparison-table"><thead><tr><th>KARAR KRİTERİ</th>'+ms.map(m=>'<th>'+esc(m.name)+'</th>').join('')+'</tr></thead><tbody>'+
 lines.map(l=>'<tr><td>'+esc(l[0])+'</td>'+ms.map(m=>'<td>'+esc(l[1](m))+'</td>').join('')+'</tr>').join('')+
 '</tbody></table></div>';
 $('comparisonDialog').showModal();
}
function renderShortlist(){
 $('shortlistCount').textContent=shortlist.length;
 $('shortlistRows').innerHTML=shortlist.length?shortlist.map(id=>{
  const m=get(id);if(!m)return '';
  return '<div class="short-row"><span><b>'+esc(m.name)+'</b><br><small style="color:#708298">'+esc(m.cat)+'</small></span><button aria-label="Kısa listeden sil" data-delete="'+id+'">Sil</button></div>';
 }).join(''):'<p class="muted">Henüz model seçilmedi. Yukarıdan beğendiğiniz modellerde ☆ simgesine dokunun.</p>';
}
function decisionText(){
 const note=$('partnerNotes').value.trim(),names=shortlist.map(id=>get(id)?.name).filter(Boolean);
 return 'MAKİNE 2.0 / ORTAK KARARI\n\nSeçtiğim modeller:\n'+
 (names.length?names.map((n,i)=>(i+1)+'. '+n).join('\n'):'Henüz seçmedim')+
 '\n\nNotlarım:\n'+(note||'Henüz not yok')+
 '\n\nSunum: '+URLBASE+
 '\nBu fikirler araştırma amaçlıdır; garanti kazanç değildir.';
}
async function copyText(t){
 try{await navigator.clipboard.writeText(t);toast('Metin kopyalandı')}
 catch(e){const el=document.createElement('textarea');el.value=t;document.body.appendChild(el);el.select();const ok=document.execCommand('copy');el.remove();toast(ok?'Metin kopyalandı':'Kopyalama engellendi; paylaş düğmesini kullan')}
}
const configs={
 saas:{labels:['Ücretli müşteri sayısı','Müşteri başı aylık ücret','Müşteri başı değişken maliyet','Aylık sabit gider'],min:[0,0,0,0],max:[120,3000,1200,30000],step:[1,50,20,250],base:[20,650,120,4000],unit:['',' TL',' TL',' TL'],explain:'Gelir = müşteri × ücret. Gider = müşteri × değişken maliyet + sabit gider.'},
 api:{labels:['Aylık ücretli API müşterisi','Müşteri başı aylık abonelik','Müşteri başı veri/API maliyeti','Sabit veri + sunucu gideri'],min:[0,0,0,0],max:[100,4000,1800,40000],step:[1,50,25,250],base:[12,1250,250,4000],unit:['',' TL',' TL',' TL'],explain:'Gelir = ücretli abonelik × fiyat. Bu senaryo veri lisansı, destek ve müşteri edinme maliyetlerini ayrıca değerlendirmeyi gerektirir.'},
 compute:{labels:['Aylık tamamlanan işlem','İşlem başı satış fiyatı','İşlem başı bulut maliyeti','Aylık sabit altyapı gideri'],min:[0,0,0,0],max:[5000,200,130,20000],step:[25,5,1,250],base:[400,35,9,3000],unit:['',' TL',' TL',' TL'],explain:'Gelir = tamamlanan iş × iş ücreti. Başarısız işler, veri transferi ve bekleme süresi maliyeti mutlaka ölçülür.'},
 arb:{labels:['İşlem için ayrılan sermaye','Varsayılan AYLIK brüt fark','Aylık tüm değişken maliyet oranı','Aylık sabit işletim gideri'],min:[0,0,0,0],max:[200000,3,3,20000],step:[5000,.05,.05,250],base:[100000,.8,.5,850],unit:[' TL','%','%',' TL'],explain:'Basitleştirilmiş senaryo: brüt = ayrılan sermaye × aylık fark; değişken gider = sermaye × aylık toplam maliyet yüzdesi. Gerçekte işlemler, yeniden yatırım, risk ve sermaye kullanımı bundan daha karmaşıktır.'}
};
let currentSim='saas',scenario='base';
const sliders=['simVolume','simPrice','simVariable','simFixed'],labIds=['volumeLabel','priceLabel','variableLabel','fixedLabel'],valIds=['volumeValue','priceValue','variableValue','fixedValue'];
function setSimKind(k){currentSim=k in configs?k:'saas';$('simKind').value=currentSim;setScenario('base')}
function setScenario(mode){
 scenario=mode;
 const c=configs[currentSim],v=[...c.base];
 if(mode==='cautious'){v[0]=Math.round(c.base[0]*.5);v[1]=currentSim==='arb'?Math.max(0,c.base[1]*.45):c.base[1];v[2]=currentSim==='arb'?c.base[2]*1.3:c.base[2]*1.2;v[3]=c.base[3]*1.2}
 if(mode==='strong'){v[0]=Math.round(c.base[0]*1.75);v[1]=currentSim==='arb'?c.base[1]*1.5:c.base[1];v[2]=currentSim==='arb'?c.base[2]*.9:c.base[2];v[3]=c.base[3]*1.1}
 sliders.forEach((id,i)=>{const el=$(id);el.min=c.min[i];el.max=c.max[i];el.step=c.step[i];el.value=Math.max(c.min[i],Math.min(c.max[i],v[i]));$(labIds[i]).textContent=c.labels[i]});
 $('simExplain').textContent=c.explain;
 document.querySelectorAll('.scenario').forEach(b=>b.classList.toggle('active',b.dataset.scenario===mode));
 updateCalc();
}
function updateCalc(){
 const c=configs[currentSim];const v=sliders.map(id=>Number($(id).value)),[count,price,variable,fixed]=v;
 v.forEach((x,i)=>{$(valIds[i]).textContent=(currentSim==='arb'&&i===1||currentSim==='arb'&&i===2)?x.toLocaleString('tr-TR',{maximumFractionDigits:2})+'%':nf.format(x)+c.unit[i]});
 let gross,cost,net,breakeven,label;
 if(currentSim==='arb'){
   gross=count*price/100;cost=count*variable/100+fixed;net=gross-cost;
   breakeven=count>0?((variable+100*fixed/count)).toFixed(2)+'%':'—';
   label='Başabaş brüt aylık fark';
   $('resultTone').textContent='Sadece varsayımsal net fark; gerçek yatırım getirisi değildir.';
 }else{
   gross=count*price;cost=count*variable+fixed;net=gross-cost;
   breakeven=price>variable?nf.format(Math.ceil(fixed/(price-variable)))+' müşteri/iş':'Mümkün değil';
   label=currentSim==='compute'?'Başabaş aylık işlem':'Başabaş müşteri';
   $('resultTone').textContent='Vergi, reklam, müşteri edinme ve kurucu zamanı hariç.';
 }
 $('resultNet').textContent=(net>0?'+':'')+money(net);
 $('resultNet').className=net>=0?'positive':'negative';
 $('resultGross').textContent=money(gross);$('resultCosts').textContent=money(cost);
 $('resultMargin').textContent=gross>0?(100*net/gross).toLocaleString('tr-TR',{maximumFractionDigits:1})+'%':'—';
 $('breakEvenLabel').textContent=label;$('resultBreakeven').textContent=breakeven;
 const high=Math.max(gross,cost,1);$('grossBar').style.width=Math.max(1,100*gross/high)+'%';$('costBar').style.width=Math.max(1,100*cost/high)+'%';
}
function renderBudget(){
 const template=[
 {key:'Ürün / altyapı',part:.25,color:'#eebc7c',note:'Kod, API, sunucu ve alan adı'},
 {key:'Dağıtım pilotu',part:.17,color:'#92bcd3',note:'Mağaza görünürlüğü ve küçük tanıtım'},
 {key:'Ticari / hukuki gider',part:.08,color:'#c1a9d4',note:'Şirket, sözleşme, muhasebe'},
 {key:'Kontrollü deney payı',part:.10,color:'#9fdbb8',note:'İkinci ürün ya da veri testi'},
 {key:'Dokunulmayan rezerv',part:.40,color:'#6d879a',note:'En az %40 nakit güvenlik yastığı'}
 ];
 $('budgetBar').innerHTML=template.map(x=>'<div class="budget-part" style="width:'+(100*x.part)+'%;background:'+x.color+'" title="'+esc(x.key)+'"><b>%'+Math.round(x.part*100)+'</b><small>'+nf.format(budget*x.part)+'</small></div>').join('');
 $('budgetItems').innerHTML=template.map(x=>'<div class="budget-item"><span class="budget-dot" style="background:'+x.color+'"></span><div><b>'+esc(x.key)+' — '+money(budget*x.part)+'</b><span>'+esc(x.note)+'</span></div></div>').join('');
 document.querySelectorAll('.budget-choice').forEach(b=>b.classList.toggle('active',Number(b.dataset.budget)===budget));
}
function init(){
 if(!models.length){$('modelGrid').textContent='Model kataloğu yüklenemedi. Sayfayı yenileyin.';return}
 const cats=[...new Set(models.map(m=>m.cat))];$('categoryFilter').innerHTML='<option value="all">Tüm alanlar</option>'+cats.map(cat=>'<option value="'+esc(cat)+'">'+esc(cat)+'</option>').join('');
 const selection=(new URLSearchParams(location.search)).get('oneriler');
 if(selection&&shortlist.length===0){shortlist=selection.split(',').map(Number).filter(n=>get(n)).slice(0,8);persist()}
 const saved=readStore(noteKey,'');if(typeof saved==='string')$('partnerNotes').value=saved.slice(0,3000);
 renderModels();renderFeatured();renderTray();renderShortlist();renderBudget();setSimKind('saas');
 $('modelSearch').addEventListener('input',e=>{currentSearch=e.target.value.trim().toLocaleLowerCase('tr');full=false;renderModels()});
 $('categoryFilter').addEventListener('change',e=>{currentCategory=e.target.value;full=false;renderModels()});
 $('tierFilter').addEventListener('change',e=>{currentTier=e.target.value;full=false;renderModels()});
 $('sortFilter').addEventListener('change',e=>{currentSort=e.target.value;renderModels()});
 $('showAll').addEventListener('click',()=>{full=!full;renderModels()});
 document.addEventListener('click',e=>{
   const d=e.target.closest('[data-detail]'),s=e.target.closest('[data-save]'),c=e.target.closest('[data-compare]'),r=e.target.closest('[data-delete]'),b=e.target.closest('[data-budget]'),sc=e.target.closest('[data-scenario]');
   if(d)openModel(d.dataset.detail);
   else if(s)toggleSave(s.dataset.save);
   else if(c)toggleCompare(c.dataset.compare);
   else if(r)toggleSave(r.dataset.delete);
   else if(b){budget=Number(b.dataset.budget);renderBudget()}
   else if(sc)setScenario(sc.dataset.scenario);
 });
 $('simKind').addEventListener('change',e=>setSimKind(e.target.value));
 sliders.forEach(id=>$(id).addEventListener('input',()=>{document.querySelectorAll('.scenario').forEach(b=>b.classList.remove('active'));updateCalc()}));
 $('clearCompare').addEventListener('click',()=>{compare=[];renderModels();renderTray()});
 $('openCompare').addEventListener('click',openCompare);
 $('closeModel').addEventListener('click',()=>$('modelDialog').close());
 $('closeCompare').addEventListener('click',()=>$('comparisonDialog').close());
 for(const name of ['modelDialog','comparisonDialog']){$(name).addEventListener('click',e=>{if(e.target===$(name))$(name).close()})}
 $('partnerNotes').addEventListener('input',()=>{try{localStorage.setItem(noteKey,JSON.stringify($('partnerNotes').value.slice(0,3000)))}catch(e){}});
 $('copySelection').addEventListener('click',()=>copyText(decisionText()));
 $('copyDecision').addEventListener('click',()=>copyText(decisionText()));
 $('shareWhatsapp').addEventListener('click',()=>{const text=decisionText();window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank','noopener,noreferrer')});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
