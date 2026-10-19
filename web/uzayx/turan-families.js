'use strict';
/* TURAN: proposed 200-family AR-GE registry. Never create orders or infer realized returns. */
((root,factory)=>{
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root&&root.document)root.document.addEventListener('DOMContentLoaded',()=>api.mount(root.document));
})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const groupDesign={
 'FIYAT ANOMALILERI':['Kapanmış OHLCV, ATR ve aynı parite geçmişi','Anormal sapmanın sonraki kapanışlara etkisini kontrol grubuyla karşılaştır.'],
 'HACIM VE IŞLEM AKIŞI':['Zaman damgalı işlem akışı, agresif alım/satım ve hacim','Miktar ve işlemlerin fiyat yönüyle gerçekten eşleştiğini doğrula.'],
 'EMIR DEFTERI VE LIKIDITE':['Zaman damgalı çok seviyeli emir defteri, spread ve gerçekleşen işlemler','Tek anlık tahta görüntüsünü işlem yapılabilir likidite sanma; iptalleri ayrı ölç.'],
 'TREND DEVAMI VE IVME':['1H / 4H / 1D kapanmış mumlar, trend ve hacim','Trend dönemlerini yatay piyasa kontrol dönemleriyle karşılaştır.'],
 'VOLATILITE VE SIKIŞMA':['Kapanmış mumlar, ATR, bant genişliği ve gerçekleşmiş oynaklık','Sıkışma ve açılma eşiklerini geçmiş örneklemde seçip ileri dönemde sabitle.'],
 'ZIRVE DIP VE DÖNÜŞ':['Fiyat tepe/dipleri, işlem hacmi, wick ve kapanmış mumlar','Ters dönüşü tepe/dip ortaya çıkmadan önce erişilebilir veriden test et.'],
 'TASFIYE VE SQUEEZE':['Kaynağı doğrulanmış tasfiye akışı, fiyat ve açık pozisyon','Tasfiye verisinin borsa kapsamını kontrol et; uydurma tasfiye seviyesi kullanma.'],
 'OI FUNDING VE POZISYONLANMA':['Kontrat bazlı zaman damgalı OI, gerçekleşmiş funding ve fiyat','Funding zamanı ve OI kapsamını eşleştir; geçmiş funding gelecekteki ücret değildir.'],
 'VADELI VE SPOT PIYASA AYRIŞMALARI':['Eşzamanlı spot/perp kotasyonları, sözleşme koşulları ve ücretler','Eşzamanlı uygulanabilir kotasyon yoksa fiyat avantajı iddia etme.'],
 'BTC VE PIYASA REJIMI':['BTC ve altcoinlerin senkron mumları, piyasa bağlamı','Rejim geçişini ileri veri sızıntısı olmadan tarih damgalı belirle.'],
 'COINLER ARASI ILIŞKILER':['Aynı zaman diliminde coin/sektör fiyatları, likidite','Sektör seçme ve survivorship yanlılığını dönem dışı testte denetle.'],
 'HABER OLAY VE SOSYAL TETIKLEYICILER':['Özgün duyuru zamanı, güvenilir haber kaynağı, sosyal akış ve fiyat','Yayımlanma ile piyasaya erişim zamanı farkını ölç; söylentiyi kanıt sayma.'],
 'ONCHAIN VE BÜYÜK CÜZDAN AKIŞI':['Zincir üstü işlem zamanı, cüzdan etiketleri, borsa adresi doğrulaması','Adreslerin sahipliği doğrulanmazsa balina davranışı iddia etme.'],
 'ZAMAN VE SEANS ETKILERI':['UTC seans saatleri, DST uyumu, spread ve işlem hacmi','Saat dilimi/DST farklılıklarını giderip birden çok gün karşılaştır.'],
 'İSTATISTIK VE ANOMALI MODELLEME':['Temiz formation ve ayrılmış ileri test, veri kalitesi, model parametreleri','Parametre seçimini yalnız eğitim döneminde yap; OOS örnekleme dokunma.'],
 'SAHTE SINYALLER VE KARŞI TEZLER':['Orijinal sinyal zamanı, sonraki kapanmış mumlar ve maliyetler','Yanlış sinyal ile zıt yönde kârlı işlem farklı iddialardır; ayrı test et.'],
 'EMIR UYGULAMA VE POZISYON ÇIKIŞLARI':['Komisyon, fonlama, spread, kayma, emir dolum bilgisi','Piyasa/limit dolumlarını geriye dönük kusursuz varsayma.'],
 'STRATEJI FÜZYONU VE META SINYALLER':['Strateji kimlikleri, bağımsız veri kaynakları, eşzamanlı sinyaller','Aynı olayı çoklu sinyal gibi sayma; bağımlılık ve risk kümelerini ölç.'],
 'GEÇMIŞ ÖĞRENME VE KAÇAN FIRSATLAR':['Olay anındaki erişilebilir işaretler, sürüm ve olay günlüğü','Sadece kazananları seçme yanlılığını ve gelecek veriyi kullanmayı yasakla.'],
 'PORTFÖY KAPASITE VE ADAPTASYON':['Maruziyet, likidite, kaldıraç, tasfiye, korelasyon ve net ücret','Portföy sınırları ve NO_TRADE kararını alternatif olarak karşılaştır.']
 };
 const fold=s=>String(s??'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 function filterFamilies(rows,{query='',category='ALL'}={}){
  const q=fold(query).trim();
  return rows.filter(x=>(category==='ALL'||x.category===category)&&(!q||fold([x.id,x.name,x.category,x.mechanism].join(' ')).includes(q)));
 }
 function scenarioText(direction,family){
  const m=family?.mechanism||'ilgili hareket',s=String(m).toLocaleLowerCase('tr-TR');
  if(direction==='LONG')return 'Araştırma senaryosu: '+s+' gözlemi sonrası yalnız doğrulanmış sonraki kapanışta varsayımsal LONG kuralını ölç. Ters yön, işlem maliyetleri ve tasfiye riskini dahil et. Bu bir giriş önerisi değildir.';
  if(direction==='SHORT')return 'Araştırma senaryosu: '+s+' gözlemi sonrası yalnız doğrulanmış sonraki kapanışta varsayımsal SHORT kuralını ölç. Fonlama, komisyon, kayma ve tasfiye riskini dahil et. Bu bir giriş önerisi değildir.';
  if(direction==='NO_TRADE')return 'Araştırma senaryosu: kaynak güvenilmez, yön belirsiz, likidite yetersiz veya maliyet avantajı yoksa işlem açma. İşlem yapılmayan alternatifin kaçırılan fırsatını da ölç.';
  return 'Araştırma senaryosu: '+s+' gözlemi oluşsa bile ek teyit bekle. Bekleme süresini, yanlış alarmları ve kaçırılan hareketleri ileri dönemde ayrı ölç.';
 }
 function mount(doc){
  const root=doc.getElementById('turan-families-root'),current=doc.getElementById('turan-current-group'),proposal=doc.getElementById('turan-research-group');
  if(!root||!current||!proposal)return;
  const create=(tag,klass='',s)=>{const n=doc.createElement(tag);if(klass)n.className=klass;if(s!==undefined)n.textContent=String(s);return n};
  let rows=[],filter={query:'',category:'ALL'},shown=24,openIds=new Set(),expanded=false,loading=null;
  const tabs=[...doc.querySelectorAll('[data-turan-mode]')];
  function mode(target){
   current.hidden=target!=='current';proposal.hidden=target!=='research';
   tabs.forEach(b=>{const on=b.dataset.turanMode===target;b.setAttribute('aria-pressed',on?'true':'false');b.classList.toggle('selected',on)});
   if(target==='research')load();
  }
  tabs.forEach(b=>b.addEventListener('click',()=>mode(b.dataset.turanMode)));
  const tools=create('div','turan-family-tools');
  const search=create('input','turan-family-search');search.type='search';search.placeholder='Kod, isim veya olay ara';search.setAttribute('aria-label','200 strateji ailesinde ara');
  const category=create('select','turan-family-category');category.setAttribute('aria-label','Araştırma ailesi');
  const all=create('option','','Tüm aileler (20)');all.value='ALL';category.append(all);
  const expand=create('button','turan-family-action','Görünen detayları aç');expand.type='button';
  const reset=create('button','turan-family-action','Filtreleri temizle');reset.type='button';
  tools.append(search,category,expand,reset);
  const summary=create('p','turan-family-summary','200 aile yükleniyor…');
  const list=create('div','turan-family-list');
  const more=create('button','turan-family-more','24 aile daha göster');more.type='button';
  const protocol=create('details','turan-family-protocol');const ps=create('summary','','Haftalık öğrenme ve doğrulama protokolü');
  const pp=create('div','turan-family-protocol-content');
  pp.append(create('p','','Olay ID • coin • UTC zaman • erişilebilir sinyal • LONG/SHORT/BEKLE/NO_TRADE • varsayımsal dolum • komisyon • spread • kayma • funding • kaldıraç/tasfiye • OOS sonuç • ters hipotez • karar: ilerlet, uyut, ele veya tersini test et.'));
  pp.append(create('p','','Sabit eşiği geçmiş veride seç; farklı dönem ve coinlerde ileri test yap. Sonucu doğrulanmadan aileyi kazanan diye etiketleme. Kaydı olmayan sonuçlar uydurulmaz.'));
  protocol.append(ps,pp);
  const source=create('p','turan-family-provenance','T001–T200 öneri kodlarıdır. Mevcut 30 TURAN algoritmasıyla birleştirilmez ve gerçek emir üretmez.');
  const link=create('a','turan-family-export','200 ailenin JSON kaydı ↗');link.href='./turan-families-v1.json';link.target='_blank';link.rel='noopener noreferrer';
  root.replaceChildren(tools,summary,list,more,protocol,source,link);
  function detail(card,item){
   const content=create('div','turan-family-detail');
   const field=(title,description)=>{
    const row=create('div','turan-family-field');row.append(create('small','',title),create('p','',description));content.append(row);
   };
   const info=groupDesign[item.category]||['Kaynak ve veri kapsamı doğrulanmalı','İleriye dönük bağımsız ölçüm gerekli'];
   field('Özgün mekanizma',item.mechanism);
   field('Gerekli kaynak / doğrulama',info[0]+' · Erişim ve veri bütünlüğü henüz doğrulanmadı.');
   field('Deney tasarımı önerisi',info[1]);
   field('Geçersizleşme', 'Kaynak gecikmesi, sonraki kapanışta koşulun bozulması, spread artışı veya net avantaj bulunmaması halinde NO_TRADE hipotezini karşılaştır.');
   field('Ters yönde test', 'İlk hipotezin başarısız olması zıt yönün kazanacağını göstermez. Aynı zaman ve maliyet koşullarıyla zıt yönü ayrı ileri test et.');
   const chooser=create('div','turan-direction-chooser');chooser.append(create('small','','Dört karşılaştırmalı senaryo (yalnız araştırma)'));
   const buttons=create('div','turan-direction-buttons'),out=create('p','turan-scenario-result');
   function selectSide(side){out.textContent=scenarioText(side,item);buttons.querySelectorAll('button').forEach(b=>{const chosen=b.dataset.side===side;b.setAttribute('aria-pressed',chosen?'true':'false')})}
   ['LONG','SHORT','BEKLE','NO_TRADE'].forEach(side=>{const b=create('button','turan-direction-btn',side);b.type='button';b.dataset.side=side;b.setAttribute('aria-pressed',side==='BEKLE'?'true':'false');b.addEventListener('click',()=>selectSide(side));buttons.append(b)});
   chooser.append(buttons,out);content.append(chooser);selectSide('BEKLE');
   field('Maliyet ve risk', 'Her testte komisyon, spread, kayma, fonlama, kaldıraç ve tasfiye riski zorunludur. Geçmiş mumdan kusursuz dolum varsayılmaz.');
   field('Bu aile için sanal teminat / nominal işlem tutarı', '— / — · doğrulanmış işlem eşleşmesi bulunmuyor.');
   field('Bu aile için gerçekleşen kazanç / kayıp', '— / — · henüz test edilmedi, rakam uydurulmuyor.');
   field('Kanıt ve sonuç durumu', 'AR-GE / doğrulanmadı · bağımsız backtest, ileri test ve net PnL yok. Uyuyor ya da kazanıyor olarak etiketlenmez.');
   field('İlerletme kararı', 'Kaynak doğrula → geçmiş/ileri dönemleri ayır → LONG/SHORT/BEKLE/NO_TRADE karşılaştır → OOS doğrula → ancak sonra ilerlet/uyut/ele.');
   card.append(content);
  }
  function render(){
   const matched=filterFamilies(rows,filter),part=matched.slice(0,shown);
   summary.textContent=matched.length+' / '+rows.length+' AR-GE ailesi · 20 konu başlığı · başarı sonucu doğrulanmadı';
   list.replaceChildren();
   for(const item of part){
    const card=create('details','turan-family-card');card.open=openIds.has(item.id)||expanded;card.dataset.id=item.id;
    const head=create('summary','turan-family-card-head');
    const name=create('span','turan-family-name');name.append(create('strong','',item.id+' · '+item.name),create('small','',item.mechanism));
    const state=create('span','turan-family-state','AR-GE');
    head.append(name,state);card.append(head);detail(card,item);
    card.addEventListener('toggle',()=>{if(card.open)openIds.add(item.id);else openIds.delete(item.id)});
    list.append(card);
   }
   if(!part.length)list.append(create('p','turan-family-empty','Eşleşen aile bulunamadı.'));
   const rest=matched.length-shown;more.hidden=rest<=0;more.textContent=rest>0?Math.min(24,rest)+' aile daha göster':'';
   expand.textContent=expanded?'Görünen detayları kapat':'Görünen detayları aç';
  }
  async function load(){
   if(rows.length){render();return}
   if(loading)return loading;
   loading=(async()=>{
    try{
     const res=await fetch('./turan-families-v1.json',{cache:'no-store'});
     if(!res.ok)throw Error('HTTP '+res.status);
     const payload=await res.json();
     if(payload.schema!=='uzayx.turan.research_family_catalog.v1'||payload.family_count!==200||
        payload.category_count!==20||!Array.isArray(payload.families)||payload.families.length!==200||
        new Set(payload.families.map(x=>x.id)).size!==200)throw Error('200 aile kaydında bütünlük hatası');
     rows=payload.families;
     for(const name of [...new Set(rows.map(x=>x.category))]){
      const option=create('option','',name);option.value=name;category.append(option);
     }
     render();
    }catch(err){
     summary.textContent='200 aile kaynağı yüklenemedi: '+String(err.message||err);
     list.replaceChildren(create('p','turan-family-empty','Kayıt doğrulanamadı. Eski sonuçlar veya tahmini veriler gösterilmiyor.'));
     more.hidden=true;
    }finally{loading=null}
   })();return loading;
  }
  search.addEventListener('input',()=>{filter.query=search.value;shown=24;expanded=false;render()});
  category.addEventListener('change',()=>{filter.category=category.value;shown=24;expanded=false;render()});
  reset.addEventListener('click',()=>{search.value='';category.value='ALL';filter={query:'',category:'ALL'};shown=24;expanded=false;openIds.clear();render()});
  more.addEventListener('click',()=>{shown+=24;render()});
  expand.addEventListener('click',()=>{expanded=!expanded;list.querySelectorAll('details.turan-family-card').forEach(n=>n.open=expanded);expand.textContent=expanded?'Görünen detayları kapat':'Görünen detayları aç'});
  const initial=doc.querySelector('[data-turan-mode][aria-pressed="true"]')?.dataset.turanMode||'current';mode(initial);
 }
 return {filterFamilies,scenarioText,groupDesign,mount};
});
