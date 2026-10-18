/* UzayX / MAKINE independent module evidence. Never claims blocked inputs operate. */
(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.UzayXSupportProof=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const META={
 A1:{what:'İki benzer hissenin fiyat farkının normale dönüp dönmediğini araştırır.',params:['Düzeltilmiş kapanış','Temettü / bölünme','Ödünç alınabilir hisse','Eşzamanlı fiyat']},
 A2:{what:'Benzer iki ETF arasındaki sapmayı, endeks ve NAV farkını kontrol eder.',params:['NAV / endeks','Kur','Dağıtılan temettü','Short erişimi']},
 A3:{what:'Birden fazla varlığın istatistiksel dengesini araştırır.',params:['Johansen rank','Eğitim dönemi','Bağımsız ileri test','Tüm bacakların short erişimi']},
 B1:{what:'Vadeli işlemlerin funding oranını ve izlenen coinlerle eşleşmesini gözlemler.',params:['Borsa: OKX','BTC / ETH','8 saatlik funding','Coin eşleşme filtresi']},
 B2:{what:'USDC / USDT fiyatlarının iki borsada gerçek sapma gösterip göstermediğini arar.',params:['İki borsa fiyatı','Alış / satış farkı','Zaman eşleşmesi','Çekilebilirlik']},
 T0:{what:'Tahvil fiyatı ile repo finansman maliyetini karşılaştırır.',params:['ISIN','Kirli fiyat','Duration','Repo teminatı / dealer']}
 };
 const $=id=>root.document?.getElementById(id);
 const el=(tag,cl,text)=>{const n=root.document.createElement(tag);if(cl)n.className=cl;if(text!==undefined)n.textContent=String(text);return n;};
 const fmt=(v,d=3)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('tr-TR',{maximumFractionDigits:d}):'—';
 const time=s=>{const t=Date.parse(s||'');return Number.isFinite(t)?new Date(t).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';};
 const isVerifiedFraction=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<1;
 function evaluate(doc,id,now=Date.now()){
   const mod=(doc?.modules||[]).find(x=>x.id===id);
   const generation=Date.parse(doc?.generated_at_utc||'');
   const age=now-generation;
   if(!mod||doc.module_count!==6||doc.modules?.length!==6||doc.schema!=='makine-six-support-v2')
     return {state:'UNVERIFIED',ok:false,message:'Altı modüllük kaynak şeması doğrulanamadı.'};
   if(!Number.isFinite(age)||age< -120000||age>60*60000)
     return {state:'STALE',ok:false,message:'Kaynak '+time(doc.generated_at_utc)+' tarihinde kaldı. Güncel çalışma kanıtı yok.'};
   if(mod.state==='BLOCKED_SOURCE'){
     return {state:'BLOCKED',ok:true,message:'Kaynak denetlendi ('+time(doc.generated_at_utc)+'). Modül ENGELLİ: '+String(mod.blocker||'Gerekli veri yok')+'. İşlem ve aktif strateji yok.'};
   }
   if(mod.state==='OBSERVING'){
     const obs=Array.isArray(mod.observations)?mod.observations:[];
     const validated=obs.length>0&&obs.every(x=>x.venue==='OKX'&&x.executable===false&&
       isVerifiedFraction(x.last_realized_rate_fraction_per_event)&&x.interval_hours>0&&
       now-Date.parse(x.last_realized_time_utc||'')<=12*3600000&&
       now-Date.parse(x.last_realized_time_utc||'')>=0);
     const approved=validated&&doc.safety?.no_orders===true&&mod.executable===false;
     return {state:approved?'OBSERVED':'UNVERIFIED',ok:approved,
       message:approved?obs.length+' doğrulanabilir funding kaydı · son '+time(doc.generated_at_utc)+
        ' · sadece gözlem · sinyal/emir yok':
        'Funding verisi veya saat/izin kanıtı eksik. İşlem kararı verilmez.'};
   }
   return {state:'UNVERIFIED',ok:false,message:'Modül durumu tanınmıyor: '+String(mod.state)};
 }
 let live=null,lastLoad=null;
 function row(title,value){const d=el('div','proof-row');d.append(el('span','',title),el('strong','',value));return d;}
 function render(doc){
   const target=$('module-grid');if(!target)return;
   target.replaceChildren();
   lastLoad=doc;
   const ts=doc?.generated_at_utc||'';
   $('module-source').textContent='Bağımsız MAKİNE · '+time(ts)+' · '+String(doc?.runtime?.mode||'Çalışma kanıtı yok')+
     ' · Trading sinyali olarak kullanılamaz';
   const mods=Array.isArray(doc?.modules)?doc.modules:[];
   if(!mods.length){target.append(el('div','empty','MAKİNE modülleri yüklenemedi.'));return;}
   mods.forEach(m=>{
     const desc=META[m.id]||{what:m.purpose,params:[]};
     const a=el('article','module proof-module');
     a.append(el('span','id',m.id),el('h3','',m.name),
       el('p','proof-explain',desc.what));
     const state=m.state==='OBSERVING'?'GÖZLEM':m.state==='BLOCKED_SOURCE'?'VERİ ENGELİ':'DOĞRULANMADI';
     a.append(el('span','chip '+(m.state==='OBSERVING'?'':'amber'),state));
     const details=el('details','proof-details');
     details.append(el('summary','','Parametreler ve kanıt'));
     const chips=el('div','proof-params');desc.params.forEach(v=>chips.append(el('span','proof-param',v)));
     details.append(chips);
     details.append(row('Strateji motoru',String(m.strategy_state||'—')));
     details.append(row('Veri etiketi',String(m.data_label||'—')));
     details.append(row('İşlem yetkisi',m.executable===false?'YOK':'DOĞRULANAMADI'));
     if(m.state==='OBSERVING'){
       (m.observations||[]).forEach(x=>details.append(row(String(x.symbol)+' / '+String(x.venue),
         '8s funding '+fmt((x.last_realized_rate_fraction_per_event||0)*100,5)+'% · '+time(x.last_realized_time_utc))));
       details.append(row('Coin eşleşmesi',String(m.coinlive_watch_matches?.length||0)+' eşleşme'));
     }else details.append(el('p','proof-blocker',String(m.blocker||'Giriş kaynağı eksik')));
     a.append(details);
     const actions=el('div','proof-actions');
     const btn=el('button','secondary proof-btn','Kaynağı denetle');btn.type='button';
     const output=el('p','proof-result','Henüz çevrimiçi kontrol yapılmadı.');
     btn.addEventListener('click',()=>verify(m.id,output,btn));
     actions.append(btn);a.append(actions,output);
     target.append(a);
   });
 }
 async function request(){
   const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
   try{
     const response=await fetch('https://raw.githubusercontent.com/onurqlp/makine-core/main/site/data/support.json?proof='+Date.now(),
       {cache:'no-store',signal:controller.signal});
     if(!response.ok)throw Error('HTTP '+response.status);
     return await response.json();
   }finally{clearTimeout(timeout);}
 }
 async function verify(id,output,button){
   if(button)button.disabled=true;
   output.textContent='Kaynağın yeni kopyası kontrol ediliyor…';
   try{
     const doc=await request();
     const result=evaluate(doc,id);
     output.textContent=result.message;
     output.className='proof-result '+(result.ok?'proof-yes':'proof-no');
     if($('module-verified-at'))$('module-verified-at').textContent='Çevrimiçi kaynak denetimi: '+time(new Date().toISOString());
     live=doc;
   }catch(e){
     output.textContent='Bağlantı başarısız: '+String(e.message||e)+' · modül çalışıyor sayılmadı.';
     output.className='proof-result proof-no';
   }finally{if(button)button.disabled=false;}
 }
 async function verifyAll(){
   const btn=$('module-check-all');if(btn)btn.disabled=true;
   try{
     const doc=await request();live=doc;
     const panels=$('module-grid')?.querySelectorAll('.proof-module')||[];
     panels.forEach((panel,i)=>{
       const id=doc.modules?.[i]?.id;
       const n=panel.querySelector('.proof-result');if(!n)return;
       const r=evaluate(doc,id);
       n.textContent=r.message;
       n.className='proof-result '+(r.ok?'proof-yes':'proof-no');
     });
     if($('module-verified-at'))$('module-verified-at').textContent='6 modül kontrol edildi · '+time(new Date().toISOString())+
        ' · çalışan 1 gözlem, 5 engelli kaynak (değişebilir)';
   }catch(e){if($('module-verified-at'))$('module-verified-at').textContent='Kaynak doğrulanamadı: '+String(e.message||e);}
   finally{if(btn)btn.disabled=false;}
 }
 if(root.document){
   root.addEventListener('uzayx:loaded',e=>render(e.detail?.db?.support));
   root.document.addEventListener('DOMContentLoaded',()=>{
     $('module-check-all')?.addEventListener('click',verifyAll);
   });
 }
 return {evaluate};
});