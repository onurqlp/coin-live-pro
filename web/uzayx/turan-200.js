'use strict';
(()=>{
const root=document.getElementById('turan-200-root');
if(!root)return;
const req=[
['Kapanmış mum, ATR, beklenen oynaklık ve ölçülebilir spread','OHLCV'],
['Zaman damgalı gerçekleşen işlemler, agresör yönü, hacim ve fiyat','İşlem akışı'],
['L2 emir defteri, derinlik, gerçekleşen/iptal edilen emirler ve spread','Derinlik'],
['Kapanmış 1H/4H/1D mumlar, hacim, trend ölçüsü ve güncel spread','OHLCV'],
['Kapanmış mum, ATR, bant genişliği, realized volatilite','OHLCV'],
['Kapanmış OHLCV, fitil, hacim ve dönüş sonrası ileri mum','OHLCV'],
['Borsadan doğrulanmış tasfiye akışı, OI, likidite ve saat','Türev'],
['Gerçekleşmiş funding, OI, mark/index fiyat ve geçerli zaman damgası','Türev'],
['Eşzamanlı spot/perp fiyat teklifleri, uygulanabilir komisyon ve baz','Çoklu piyasa'],
['BTC ve altcoin eşzamanlı mumları, beta/korelasyon, rejim','Çoklu piyasa'],
['Eşzamanlı çoklu coin OHLCV, sektör eşlemesi, hacim','Çoklu piyasa'],
['Doğrulanmış haber zamanı, ilk erişim zamanı, fiyat ve hacim','Haber'],
['Doğrulanmış zincir üstü olay, etiketli adresler, borsa akışı','On-chain'],
['UTC/DST uyumlu seans ve gerçekleşmiş işlem saatleri','Zaman'],
['Eğitim ve dönem-dışı ayrılmış OHLCV, parametrik hata ölçüsü','İstatistik'],
['Önceden kayıtlı sinyal, sonraki kapanmış mum, iki yönlü maliyet','İstatistik'],
['Alış/satış uygulanabilirliği, dolum, maker/taker ücretleri ve kayma','Uygulama'],
['Kaynakça bağımsız sinyaller, korelasyon ve yinelenen olay ID','Birleşik'],
['Olay öncesi erişilebilir kayıtlar, işlem geçmişi, ileri dönem test seti','Öğrenme'],
['Kaldıraç, açık pozisyon, likidite, korelasyon ve toplam risk','Risk']
];
const $=(tag,cl,txt)=>{const n=document.createElement(tag);if(cl)n.className=cl;if(txt!==undefined)n.textContent=String(txt);return n;};
const state={data:null,q:'',group:'ALL',source:'ALL',openAll:false};
const head=$('div','t200-heading'),title=$('div','t200-heading-text');
title.append($('strong','','200 yeni araştırma ailesi'),$('small','','20 araştırma konusu · 10 aile / konu · her biri ayrı hipotez'));
const flag=$('span','t200-warning','200 AR-GE · 0 doğrulanmış');head.append(title,flag);
const tools=$('div','t200-toolbar');
const search=$('input','t200-search');search.type='search';search.placeholder='İsim, kod veya araştırma konusu ara';search.setAttribute('aria-label','200 stratejide ara');
const category=$('select','t200-category');category.setAttribute('aria-label','Araştırma konusuna göre filtrele');
const dataSelect=$('select','t200-source');dataSelect.setAttribute('aria-label','Veri ihtiyacına göre filtrele');
const button=(txt,cl)=>{const n=$('button',cl,txt);n.type='button';return n};
const open=button('Tüm grupları aç','t200-toggle'),clear=button('Temizle','t200-reset');
tools.append(search,category,dataSelect,open,clear);
const info=$('p','t200-info','200 yeni aile yükleniyor…'),view=$('div','t200-groups');
const foot=$('p','t200-footer','Tüm kayıtlar araştırma hipotezidir; gerçek emir, performans veya doğrulanmış kazanç değildir. Mevcut 30 yaklaşım ayrı sekmede korunur.');
root.replaceChildren(head,tools,info,view,foot);
function option(select,id,label){const o=$('option','',label);o.value=id;select.append(o)}
option(category,'ALL','Bütün konular');
option(dataSelect,'ALL','Tüm veri tipleri');
[...new Set(req.map(x=>x[1]))].forEach(s=>option(dataSelect,s,s));
function field(body,label,value){const row=$('div','t200-field');row.append($('span','',label),$('b','',value));body.append(row)}
const directions=[
['LONG','LONG','Yükseliş yönünü ileri kapalı mumlarda bağımsız incele; teorik kazancı komisyon, spread, kayma ve fonlama sonrası ölç.'],
['SHORT','SHORT','Düşüş yönünü ayrı sinyal zamanı ve ayrı uygulanabilir dolum varsayımıyla ileri test et; short erişimi ve tasfiye riskini ölç.'],
['WAIT','BEKLE','Sinyal görüldükten sonra ek kapanış/likidite teyidini bekleme ve fırsat kaçırma maliyetini karşılaştır.'],
['NO_TRADE','İŞLEM YOK','Avantaj veya veri doğrulanmazsa sıfır pozisyon senaryosunun sonuçlarını diğer yollarla yan yana tut.']
];
const costs='Komisyon (giriş/çıkış) + spread + kayma + gerçekleşmiş funding + teminat, kaldıraç ve tasfiye riski doğrulanmadan sonuç üretilmez.';
function familyCard(item,idx){
const el=$('details','t200-family');
const summary=$('summary','t200-family-head');
const s=$('span','t200-family-name');s.append($('strong','',item.id+' · '+item.name),$('small','',item.hypothesis));
summary.append(s,$('span','t200-state','Hipotez'));el.append(summary);
const body=$('div','t200-family-body');
field(body,'Araştırılan olay',item.hypothesis);
field(body,'Bağımsız aile kodu',item.id+' · mevcut 30 aileyle otomatik eşleştirilmedi');
field(body,'Gereken kaynak',req[idx]?.[0]||'Veri doğrulaması gerekli');
field(body,'Kaynak durumu','Bireysel kaynak ve ileri test doğrulanmadı');
field(body,'Yanlışlama ölçütü','Olay sonrasında fiyat/akış beklenen ilişkiyi göstermiyorsa hipotez reddedilir; eşikler deney başlamadan sabitlenir.');
const dhead=$('strong','t200-direction-title','Ayrı ayrı nasıl test edelim?');
const controls=$('div','t200-directions');const outcome=$('p','t200-direction-result','Yön seç: bu düğmeler işlem açmaz, yalnız deney planını gösterir.');
directions.forEach(([val,name])=>{const b=button(name,'t200-direction');b.dataset.direction=val;b.setAttribute('aria-pressed','false');controls.append(b)});
body.append(dhead,controls,outcome);
const more=$('details','t200-more');more.append($('summary','','Maliyet, karşı tez ve haftalık test planı'));
const deep=$('div','t200-more-content');
field(deep,'Karşı tez','Aynı olayın ters yönü ve NO_TRADE seçeneği ayrı ileri dönem kohortu olarak ölçülür; geçmişte kayıp ters yönde kazanç kanıtı değildir.');
field(deep,'Maliyet ve kaldıraç',costs);
field(deep,'Ön-kayıt','Coin, ilk erişim saati, veri kaynağı, tetik zamanı, LONG/SHORT/BEKLE/NO_TRADE ve yanlışlama koşulu sinyal öncesinde kilitlenir.');
field(deep,'Test sırası','Veri kaynağını doğrula → geri ve ileri dönemleri ayır → dolum/komisyonu modelle → OOS sınaması yap → uyut/ele/ilerlet kararı ver.');
field(deep,'Haftalık karar seçenekleri','İlerlet · uyut · ele · tersini ayrıca test et (henüz karar alınmadı)');
more.append(deep);body.append(more);el.append(body);
controls.addEventListener('click',event=>{
 const b=event.target.closest('button[data-direction]');if(!b)return;
 controls.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
 const d=directions.find(x=>x[0]===b.dataset.direction);
 outcome.textContent=d[2]+' Önerilen deneydir; henüz hesaplanmış getiri veya emir değildir.';
});
return el;
}
function render(){
if(!state.data)return;
const items=state.data.items;
const groups=state.data.groups;
const matches=items.filter(x=>{
 const idx=groups.findIndex(g=>g.name===x.family);
 const hay=(x.id+' '+x.name+' '+x.hypothesis+' '+x.family).toLocaleLowerCase('tr-TR');
 return (state.group==='ALL'||state.group===x.family)
 &&(state.source==='ALL'||req[idx]?.[1]===state.source)
 &&hay.includes(state.q);
});
info.textContent=matches.length+' / 200 aile · '+new Set(matches.map(x=>x.family)).size+' konu · tamamı doğrulanmamış araştırma taslağı';
view.replaceChildren();
groups.forEach((group,idx)=>{
 const found=matches.filter(x=>x.family===group.name);if(!found.length)return;
 const card=$('details','t200-group');
 const name=$('summary','t200-group-header');
 const label=$('span','');label.append($('strong','',group.name),$('small','',req[idx][1]+' · '+found.length+' aile'));
 name.append(label,$('span','t200-count',found.length+'/10'));card.append(name);
 const content=$('div','t200-cards');card.append(content);view.append(card);
 const fill=()=>{if(content.childElementCount)return;found.forEach(x=>content.append(familyCard(x,idx)))};
 card.addEventListener('toggle',()=>{if(card.open)fill()});
 if(state.openAll||state.q||state.group!=='ALL'||state.source!=='ALL'){card.open=true;fill()}
 });
 if(!matches.length)view.append($('p','t200-none','Bu ölçütlerde aile bulunamadı.'));
 open.textContent=state.openAll?'Tüm grupları kapat':'Tüm grupları aç';
}
async function load(){
try{
 const response=await fetch('./turan-200-data.json?v=1&_='+Date.now(),{cache:'no-store'});
 if(!response.ok)throw Error('HTTP '+response.status);
 const data=await response.json();
 if(data.schema!=='turan-research-200-v1'||data.items?.length!==200||data.groups?.length!==20||!data.all_unverified||new Set(data.items.map(x=>x.id)).size!==200)throw Error('Katalog bütünlük kontrolü başarısız');
 state.data=data;
 data.groups.forEach(g=>option(category,g.name,g.name));
 render();
}catch(e){info.textContent='Katalog doğrulanamadı: '+String(e.message||e)+' · Varsayımsal 200 kayıt gösterilmiyor.';}
}
search.addEventListener('input',()=>{state.q=search.value.trim().toLocaleLowerCase('tr-TR');render()});
category.addEventListener('change',()=>{state.group=category.value;render()});
dataSelect.addEventListener('change',()=>{state.source=dataSelect.value;render()});
open.addEventListener('click',()=>{state.openAll=!state.openAll;render()});
clear.addEventListener('click',()=>{state.q='';state.group='ALL';state.source='ALL';state.openAll=false;search.value='';category.value='ALL';dataSelect.value='ALL';render()});
load();
})();