'use strict';
(() => {
 const root=document.getElementById('turan-catalog');if(!root)return;
 const raw=[["Bozkurt","Trend kırılımı","trend","4H yönü ve kapanmış 1H kırılımı aynı yönde; hacim teyidi","4H trend ters döner veya fiyat kırılımın altına döner","Alkarısı","Göktürk","OHLCV, spread","TREND_BREAKOUT","LONG","source"],["Tulpar","Hacim ivmesi","momentum","Hacim baz çizgiyi geçer, kapanış yönü fiyatla uyumlu","Hacim sönümlenir veya fiyat hacmi doğrulamaz","Mergen","Bozkurt","OHLCV, göreli hacim","VOLUME_EXPANSION","AŞAMA_2","source"],["Umay","Sermaye koruma filtresi","risk","Spread, derinlik, risk tutarı ve maliyet sınırları birlikte yeterli","Veriler eksik, pozisyon limiti dolu veya maliyet avantajı siliyor","—","Korkut","Spread, emir defteri, komisyon",null,null,"watch"],["Erlik","Düşüşün devamı","short","Aşağı kırılım kapanmış mumla doğrulanır ve BTC yönü çelişmez","Destek geri alınır veya kısa işlem maliyeti artar","Simurg","Ötüken","OHLCV, fonlama, trend","SHORT_BREAKDOWN","SHORT","source"],["Alkarısı","Sahte kırılım dönüşü","reversal","Kırılım sonrası yeniden test başarısız ve teyit mumu geri döner","Yeniden test üstünde/altında sürdürülebilir kapanış olur","Bozkurt","Demirci","Kırılım seviyesi, kapanmış mum","BREAKOUT_RETEST","AŞAMA_3","source"],["Simurg","Yön değişimi","reversal","Aşırı hareket sonrası zıt yönlü fiyat yapısı ve hacim teyidi","Tepki zayıf kalır, eski trend yeni zirve/dip yapar","Erlik","Kayra","RSI, MACD, kapanmış mum","REVERSAL_SETUP","RSI_4H_DIĞER","source"],["Kürşad","Kırılım sonrası geri test","trend","Kırılım seviyesine kontrollü dönüş ve tekrar yön teyidi","Seviye kaybedilir veya dönüşte spread büyür","Alp","Demirci","Retest mumları, hacim",null,null,"watch"],["Oğuz","Zaman dilimi uzlaşması","combined","1D/4H/1H yönü ve piyasa rejimi birbirini doğrular","Zaman dilimleri ayrışır","—","Bozkurt + Ötüken","1D/4H/1H OHLCV",null,null,"blend"],["Göktürk","1H son kapanış teyidi","confirm","Kapanmış 1H mum eşiği geçti ve 15m/5m tersleşmedi","Kapanış teyidi kaybolur veya veri gecikir","Alkarısı","Bozkurt","OHLCV, kaynak saati",null,"GELDI_OTOMATIK_GIRIS","watch"],["Börü","Trend içi geri çekilme","trend","Ana yönde destek testi ve düşük hacimli kontrollü geri çekilme","Trend destek yapısı kırılır","Alp","Oğuz","OHLCV, ATR",null,null,"sleep"],["Ak Ana","Likidite koruma filtresi","risk","Emir defterinde yeterli karşı taraf ve düşük spread","Tek kare likidite kaybolur veya makas açılır","—","Umay","Order book, spread, hacim",null,null,"watch"],["Kayra","Aşırı oynaklık koruması","risk","ATR normal aralıkta; varsayımsal stop mesafesi ekonomik","ATR patlaması ve kayma tahmini eşiği aşar","Yada","Umay","ATR, spread, kayma",null,null,"watch"],["Ülgen","Yukarı momentum devamı","long","1D yukarı trend ile 4H ivme aynı yönde","4H momentum kırılır","Kartal","Bozkurt","OHLCV, MACD",null,"MACD_4H_DESTEK","sleep"],["Yada","Volatilite genişlemesi","volatility","Sıkışma sonrasında ATR ve hacim birlikte genişler","Kapanış sıkışma içine döner","Ergenekon","Tulpar","Bollinger, ATR, hacim",null,null,"sleep"],["Mergen","Momentum zayıflaması","reversal","Fiyat yeni uç yaparken momentum daha zayıf","Momentum uyumsuzluğu kapanmış mumda bozulur","Tulpar","Simurg","RSI, MACD, fiyat",null,null,"sleep"],["Kızagan","Hızlı hareket düzeltmesi","reversal","Yüksek hacimli tek yönlü hareket sonrası zayıf takip","Yeni zirve/dip ve yüksek hacimle devam eder","Tulpar","Simurg","OHLCV, wick, ATR",null,null,"sleep"],["Tepegöz","Aşırı alım sapması","short","RSI aşırılığı ve tepe yapısında başarısız kırılım","Yükseliş trendi ve hacim güçlü kalır","Ülgen","Alkarısı","RSI, hacim",null,null,"sleep"],["Korkut","Net maliyet testi","risk","Beklenen varsayımsal hareket komisyon, kayma, fonlama üstünde","Net avantajı maliyetler tüketir","—","Umay","Maker/taker ücreti, funding, spread",null,null,"watch"],["Tengri","Piyasa rejimi seçici","combined","Trend/yatay/aşırı oynak rejimi tanımlanır; yalnız uyumlu adaylar incelenir","Rejim belirsiz veya ani değişir","—","Oğuz + Kayra","BTC, ATR, trend",null,null,"blend"],["Ay Ata","Fonlama ve açık pozisyon baskısı","futures","Fonlama/OI sapması fiyat ve zaman damgasıyla karşılaştırılır","Funding veya OI kaynağı stale / kapsam uyumsuz","—","Erlik + Ak Ana","Funding, OI, fiyat","OI_FUNDING_PRESSURE",null,"source"],["Gün Ana","Likidite artışı","momentum","Gerçek hacim ve işlem derinliği birlikte artar","Hacim tek seferlik kalır","Ak Ana","Tulpar","Hacim, order book",null,null,"sleep"],["Demirci","Destek direnç testi","structure","Fiyat aynı bölgeyi sonraki kapanışta korur","Seviye açık biçimde kaybedilir","Alp","Kürşad","Kapanmış 4H/1H mum",null,null,"sleep"],["Ergenekon","Sıkışma kırılması","volatility","Bollinger bant sıkışması sonrası yönlü kapanış olur","Bant içine yeniden döner","Alkarısı","Yada","Bollinger, ATR","VOLATILITY_SQUEEZE","BB_4H_SIKIŞMA","source"],["Ötüken","BTC pazar uyumu","risk","Altcoin yönü BTC rejimi ile desteklenir","BTC sert yön değiştirir","—","Oğuz","BTC/altcoin 1D/4H",null,null,"sleep"],["Bayındır","Göreli trend gücü","ranking","Benzer likiditedeki coinler trend gücüyle sıralanır","Güç verileri aynı anda güncel değil","—","Bozkurt","ADX, hacim, spread",null,null,"sleep"],["Alp","Başarısız kırılım","reversal","Seviye testinde tuzak fitil ve zıt kapanış görülür","Kırılım teyitli devam eder","Kürşad","Alkarısı","Mum fitili, likidite",null,null,"sleep"],["Bengü","Çoklu strateji ortak aday","combined","Farklı veri kaynağı kullanan en az iki hipotez bağımsız uzlaşır","Modeller aynı olayı iki kez sayar veya korelasyon yükselir","—","Oğuz + Umay + Korkut","Sinyal kimliği, korelasyon, maliyet",null,null,"blend"],["Kut","İşlem kalite puanı","ranking","Net maliyet, veri yaşı, örneklem ve likidite eşikleri geçilir","Kalite değişkenlerinden biri eksik","—","Umay + Korkut","Veri kalitesi, spread, likidite",null,null,"sleep"],["Kartal","Yükseliş sonrası SHORT","reversal","Keskin yükseliş sonrası aşağı dönüş gerçek kapanışla teyitlenir","Fiyat yeni güçlü zirve yapar","Ülgen","Alkarısı + Ay Ata","OHLCV, wick, funding",null,null,"sleep"],["Yel","Düşüş sonrası LONG","reversal","Dik düşüşten sonra kapanış ve hacimle tepki doğrulanır","Yeni dip gelir, hacim teyidi yok","Erlik","Simurg + Kayra","OHLCV, RSI, kayma",null,null,"sleep"]];
 const kinds={source:'İleri gözlem',watch:'Hazırlık',sleep:'Uyuyan / yedek',blend:'Birleşik aday'};
 const labels={source:'OBSERVING',watch:'RESEARCH',sleep:'DORMANT',blend:'COMBINATION'};
 const $=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=String(txt);return n};
 const spec=raw.map((r,i)=>({id:i+1,name:r[0],title:r[1],kind:r[2],trigger:r[3],invalid:r[4],reverse:r[5],partner:r[6],inputs:r[7],model:r[8],cohort:r[9],phase:r[10]}));
 let report=null,reportError='',opened=false,filter='all',term='',busy=false;
 const fmt=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('tr-TR',{maximumFractionDigits:2}):'—';
 const today=s=>{const t=Date.parse(s||'');return Number.isFinite(t)?new Date(t).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'}):'bilinmiyor'};
 const countBy=k=>spec.filter(x=>x.phase===k).length;
 const toolbar=$('div','turan-tools');
 const search=$('input','turan-search');search.type='search';search.placeholder='Strateji ara';search.setAttribute('aria-label','Strateji ara');
 const pick=$('select','turan-filter');pick.setAttribute('aria-label','Strateji durumuna göre filtrele');
 [['all','Tümü (30)'],['source','İleri gözlem'],['watch','Hazırlık'],['sleep','Uyuyan / yedek'],['blend','Birleşik']].forEach(([v,t])=>{const o=$('option','',t);o.value=v;pick.append(o)});
 const toggle=$('button','turan-toggle','Tüm detayları aç');toggle.type='button';
 const reload=$('button','turan-reload','↻ Sonuçları kontrol et');reload.type='button';
 toolbar.append(search,pick,toggle,reload);
 const summary=$('p','turan-counts');
 const context=$('p','turan-context');
 const list=$('div','turan-list');
 const hint=$('p','turan-note','İleri gözlem: eski modelin arşivinde gözlenen senaryodur, otomatik işlem değildir. Hazırlık / uyuyan / birleşik stratejiler için henüz bağımsız performans ölçülmedi. Ayrıntıları görmek için karta dokun.');
 root.replaceChildren(toolbar,summary,context,list,hint);
 const field=(box,label,value)=>{const n=$('div','turan-detail-row');n.append($('span','',label),$('strong','',value));box.append(n)};
 function evidence(item,body){
   if(!report){field(body,'Güncel kaynak',reportError?'Rapor erişilemedi':'Henüz yüklenmedi');return;}
   const n=Date.parse(report.generated_at_utc||'');
   const fresh=Number.isFinite(n)&&Date.now()-n<30*60*1000&&Date.now()-n>-120000;
   field(body,'Kaynak tarihi',today(report.generated_at_utc)+(fresh?' · güncel':' · gecikmiş / doğrulanmadı'));
   if(item.model){
     const data=report.windows?.['7']?.strategies?.[item.model];
     if(!data){field(body,'Model eşleşmesi','Bu taramada kanıt yok');return;}
     field(body,'Bağlı gözlem modeli',item.model);
     field(body,'Keşif kaydı',fmt(data.discovered));
     field(body,'Girişe uygun gözlem',fmt(data.entry_eligible)+' · gerçek emir yok');
     for(const h of ['1H','4H','24H']){
       const v=data.forward_horizons?.[h];
       if(v)field(body,h+' ileri yön gözlemi',fmt(v.observed)+' kapanmış takip · medyan yön '+fmt(v.median_close_direction_pct)+'% (getiri değil)');
     }
     field(body,'Başarı iddiası','Yetersiz örneklem; strateji net kârı ölçülmedi');
   }else{
     field(body,'Bağımsız performans','Henüz ölçülmedi · sanal emir çalıştırılmıyor');
   }
   if(item.cohort&&report.cohorts?.[item.cohort]){
     const c=report.cohorts[item.cohort];
     field(body,'İlişkili eski işlem grubu',item.cohort+' · '+fmt(c.closed)+' kapanış · '+fmt(c.positive)+' olumlu / '+fmt(c.negative)+' olumsuz');
     field(body,'Grup sonucu (strateji sonucu değil)',fmt(c.realized_total_usdt)+' USDT · başka gruplarla çakışır');
   }
 }
 function render(){
   summary.textContent='30 araştırma adayı · '+countBy('source')+' ileri gözlem · '+countBy('watch')+' hazırlık · '+countBy('sleep')+' uyuyan/yedek · '+countBy('blend')+' birleşik';
   context.textContent=report?'Son rapor: '+today(report.generated_at_utc)+' · Strateji PnL’si ile eski işlem grupları karıştırılmaz.':(reportError?'Sonuçlar doğrulanamıyor. Sadece araştırma taslakları gösteriliyor.':'Kaynak raporu yükleniyor…');
   const showing=spec.filter(x=>(filter==='all'||x.phase===filter)&&((x.name+' '+x.title+' '+x.kind+' '+x.trigger+' '+x.partner).toLocaleLowerCase('tr-TR').includes(term)));
   list.replaceChildren();
   showing.forEach(item=>{
     const card=$('details','turan-candidate');card.open=opened;
     const head=$('summary','turan-candidate-head');
     const title=$('span','turan-candidate-title');title.append($('strong','',item.id+'. '+item.name),$('small','',item.title));
     const chip=$('span','turan-chip turan-chip-'+item.phase,kinds[item.phase]);
     head.append(title,chip);card.append(head);
     const detail=$('div','turan-detail');
     field(detail,'Araştırma koşulu',item.trigger);
     field(detail,'Geçersizleşme / durdur',item.invalid);
     field(detail,'Gereken veri',item.inputs);
     field(detail,'Ters yönde incelenecek',item.reverse==='—'?'Uygun ters yön tanımlanmadı':item.reverse);
     field(detail,'Birlikte araştırılacak',item.partner);
     field(detail,'Uygulama düzeyi',item.phase==='source'?'Mevcut eski modelin ileri gözlemi; TURAN adına işlem açılmaz':item.phase==='blend'?'Birlikte çalışma hipotezi; otomatik yürütme yok':'Araştırma taslağı; otomatik yürütme yok');
     evidence(item,detail);
     field(detail,'Sıradaki kontrol','Kaynak/etiket doğrulama → bağımsız ileri test → komisyon, kayma ve fonlama → dönem dışı karşılaştırma');
     card.append(detail);list.append(card);
   });
   if(!showing.length)list.append($('p','turan-empty','Bu filtrede strateji yok.'));
   toggle.textContent=opened?'Tüm detayları kapat':'Tüm detayları aç';
 }
 async function refresh(){
   if(busy)return;busy=true;reload.disabled=true;reload.textContent='Kontrol ediliyor…';
   try{
     const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),12000);
     let res;try{res=await fetch('../data/ops-report.json?ts='+Date.now(),{cache:'no-store',signal:ctrl.signal});if(!res.ok)throw Error('HTTP '+res.status);report=await res.json();if(!report.cohorts||!report.windows)throw Error('Eksik rapor şeması');reportError='';}finally{clearTimeout(timer)}
   }catch(e){report=null;reportError=String(e.message||e);}
   busy=false;reload.disabled=false;reload.textContent='↻ Sonuçları kontrol et';render();
 }
 search.addEventListener('input',()=>{term=search.value.toLocaleLowerCase('tr-TR').trim();render()});
 pick.addEventListener('change',()=>{filter=pick.value;render()});
 toggle.addEventListener('click',()=>{opened=!opened;list.querySelectorAll('details').forEach(x=>x.open=opened);toggle.textContent=opened?'Tüm detayları kapat':'Tüm detayları aç'});
 reload.addEventListener('click',refresh);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
 render();refresh();
})();