'use strict';(()=>{
 const el=document.getElementById('turan-results');if(!el)return;
 const span=(tag,cl,txt)=>{const n=document.createElement(tag);if(cl)n.className=cl;n.textContent=String(txt);return n};
 const fmt=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
 async function render(){
  try{
   const r=await fetch('../data/ops-report.json?ts='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);
   const j=await r.json();const c=j.cohorts?.['TÜMÜ'];if(!c)throw Error('Eksik örneklem');
   const min=Number(j.min_closed_for_comparison)||30;
   const data=[
    ['İncelenen eski sanal kapanış',Number(c.closed)||0],
    ['Olumlu / olumsuz kapanış',(Number(c.positive)||0)+' / '+(Number(c.negative)||0)],
    ['Örneklem eşiği',min+' kapanış (ilk kontrol)'],
    ['Sonuç niteliği',c.evidence_sufficient_for_comparison?'İlk karşılaştırma yapılabilir, bağımsız doğrulama gerekir':'Yetersiz örneklem']
   ];
   el.replaceChildren();for(const [k,v] of data){const item=span('div','turan-row','');item.append(span('div','',k),span('strong','',v));el.append(item)}
   const note=span('p','muted tiny','Bunlar 30 TURAN stratejisinin sonuçları değil, mevcut deneysel hesabın önceki işlem grubudur. Gruplar çakışabilir ve ters işlem getirisi ispatlanmış değildir. Son rapor: '+(j.generated_at_utc||'bilinmiyor'));
   el.append(note);
  }catch(e){el.textContent='Öğrenme özeti doğrulanamıyor. Önceki sonuçlar yeni strateji başarısı gibi gösterilmiyor.';}
 }
 render();document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
})();