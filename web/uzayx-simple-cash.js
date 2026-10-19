'use strict';
(async()=>{
const root=document.getElementById('uzayxSimpleCash');if(!root)return;
const fmt=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString('tr-TR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={LONG:'Bozkurt · Yükseliş',SHORT:'Erlik · Düşüş',AŞAMA_1:'Umay · İlk izleme',AŞAMA_2:'Tulpar · Hızlanma',AŞAMA_3:'Alkarısı · Kırılım kontrolü',BB_4H_SIKIŞMA:'Tulpar · Sıkışma',MACD_4H_DESTEK:'Bozkurt · MACD destek',GELDI_OTOMATIK_GIRIS:'Göktürk · Teyitli giriş'};
const numeric=(v)=>Number.isFinite(Number(v))?Number(v):0;
try{
const res=await fetch('./data/ops-report.json?refresh='+Date.now(),{cache:'no-store'});if(!res.ok)throw Error('Rapor erişilemedi');
const d=await res.json(),a=d.experimental_spark||{},count=a.ticket_counts||{},co=d.cohorts||{};
const balance=numeric(a.virtual_equity_usdt),start=10000,change=balance-start;
const goal=11000,progress=Math.min(100,Math.max(0,100*(balance-start)/(goal-start)));
root.innerHTML='<div class="uxHead"><div><small>SANAL PORTFÖY · ARAŞTIRMA</small><h2>Kasa</h2></div><span class="uxChip">Gerçek para değil</span></div>'+
'<div class="uxGrid"><article><small>Kasada şu an</small><strong>'+fmt(balance)+' <em>USDT</em></strong></article><article><small>Başlangıçtan beri</small><strong class="'+(change>=0?'uxUp':'uxDown')+'">'+(change>0?'+':'')+fmt(change)+' <em>USDT</em></strong></article><article><small>Açık / kapanan işlem</small><strong>'+numeric(count.OPEN)+' / '+numeric(count.CLOSED)+'</strong></article></div>'+
'<div class="uxGoal"><div><span>Örnek hedef: 11.000 USDT</span><b>'+fmt(Math.max(0,goal-balance))+' USDT kaldı</b></div><div class="uxTrack"><i style="width:'+progress+'%"></i></div><small>Hedef yalnız görsel takip içindir; kesin getiri beklentisi değildir.</small></div>'+
'<div class="uxStrategies"><h3>Stratejiler ne öğreniyor?</h3><p>Gerçekleşmiş sonuçlardan erken ipuçları. En az '+(d.min_closed_for_comparison||30)+' kapanış olmadan kazanan strateji ilan edilmez. Gruplar çakışabilir; toplamları kasa sonucu değildir.</p><div class="uxRows">'+Object.entries(co).filter(([k])=>names[k]).sort((x,y)=>numeric(y[1].realized_total_usdt)-numeric(x[1].realized_total_usdt)).map(([key,c])=>'<div class="uxStrategy"><div><b>'+escape(names[key])+'</b><small>'+numeric(c.closed)+' kapanan · '+numeric(c.positive)+' olumlu · '+numeric(c.negative)+' olumsuz</small></div><div class="uxOutcome '+(numeric(c.realized_total_usdt)>=0?'uxUp':'uxDown')+'">'+(numeric(c.realized_total_usdt)>0?'+':'')+fmt(c.realized_total_usdt)+' USDT<small>'+(c.evidence_sufficient_for_comparison?'İncelenebilir':'Veri birikiyor')+'</small></div></div>').join('')+'</div></div>'+
'<details class="uxResearch"><summary>Kaybeden durumları tersine test etme planı</summary><p>Alkarısı: zarar eden kırılımların karşı yönünü aynı zaman damgası, sonraki kapanmış mumlar, spread, komisyon, kayma ve fonlama ile bağımsız sanal gözlemde karşılaştır. Geçmiş sonuca bakarak aynı veriye aşırı uyum sağlama. Yeterli örneklem ve dönem dışı doğrulama olmadan gerçek stratejiye dönüştürme.</p></details>'+
'<small class="uxFresh">Son rapor: '+escape(d.generated_at_utc||'bilinmiyor')+' · Güncellemeler merkezi raporla gelir</small>';
}catch(e){root.textContent='Kasa verisi şu anda doğrulanamıyor. Eski bilgi gösterilmiyor.';}
})();