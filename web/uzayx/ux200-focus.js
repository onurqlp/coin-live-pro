/* UZAYX 200: display-only progressive disclosure. Trading and source calculations unchanged. */
(function(){
  'use strict';
  function init(){
    const overview=document.getElementById('overview');
    const flow=overview&&overview.querySelector('.overview-flow');
    const positions=overview&&overview.querySelector('.home-positions');
    if(!overview||!flow||!positions)return;
    // Put the existing real open-position feed first, never clone its IDs or ledger.
    if(flow.parentNode===overview && positions.parentNode===overview){
      overview.insertBefore(positions,flow);
    }
    if(!document.querySelector('.ux200-intro')){
      const intro=document.createElement('aside');
      intro.className='ux200-intro';
      intro.setAttribute('aria-label','UZAYX strateji motoru');
      intro.innerHTML='<div class="ux200-top"><strong>UZAYX · Strateji Merkezi</strong><a href="#turan" data-goto="turan">Stratejileri incele ↗</a></div><p>30 TURAN stratejisi ve 200 AR-GE ailesi ayrı doğrulama aşamalarındadır. Sanal kasa ve açık pozisyonlar önceliklidir; geçmiş test kazancı canlı performans değildir.</p>';
      overview.insertBefore(intro,positions);
      intro.querySelector('a').addEventListener('click',function(e){
        const tab=document.querySelector('[data-tab="turan"]');
        if(tab){e.preventDefault();tab.click();}
      });
    }
    // Don't silently turn missing data into success or rename simulated balance as real.
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();