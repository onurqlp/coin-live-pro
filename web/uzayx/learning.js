/* UzayX — adaptive research hypotheses, NOT automatic trading policy.
 * Compatibility: browser global + CommonJS Node unit tests.
 * No inferred inverse PnL is reported without independent bar-by-bar replay. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.UzayXLessonEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const val=x=>(x===null||x===undefined||x==='')?null:(Number.isFinite(Number(x))?Number(x):null);
  function analyze(review, spark, nowIso) {
    const cohorts=review?.cohorts||{}, results=[];
    const today=new Date(nowIso||Date.now());
    const start=new Date(spark?.started_at||'');
    const days=Number.isFinite(+start)?Math.max(0,(+today-(+start))/86400000):null;
    const keyset=['GELDI_OTOMATIK_GIRIS','LONG','SHORT','AŞAMA_1','AŞAMA_2','AŞAMA_3','RSI_4H_50_70','RSI_4H_30_50','BB_4H_SIKIŞMA','MACD_4H_ZAYIF'];
    for(const id of keyset) {
      const c=cohorts[id];if(!c)continue;
      const n=val(c.closed), net=val(c.realized_total_usdt), mean=val(c.mean_net_per_closed_ticket_usdt);
      const good=val(c.positive),bad=val(c.negative);
      if(n===null||n<0||good===null||bad===null||n<good+bad)continue;
      const negative=mean!==null&&mean<0;
      const reason=negative?'Tarihsel kapanmış örneklerde net ortalama negatif.':'Tarihsel kapanmış örnekler tek başına sürdürülebilir avantajı kanıtlamaz.';
      const sufficient=n>=30 && days!==null && days>=30 && review?.needs_out_of_sample_validation===false;
      // even sufficient historical evidence is NOT proof of mirrored execution without new forward OHLC replay
      results.push({
        id, closed:n, net, mean, positiveShare:n?good/n:null, originalState:negative?'NEGATIVE_OBSERVED':'UNPROVEN',
        suggestedExperiment:negative?'MIRROR_AND_SKIP_CHALLENGER':'OUT_OF_SAMPLE_CONTROL',
        mirrorState:'REPLAY_REQUIRED', mirrorPnL:null, mirrorWinRate:null, tradeAction:'NO_TRADE_CHANGE',
        sampleDays:days, historyEnough:sufficient, reason,
        nextTest:'Aynı giriş anından itibaren kapanan ileri 5m mumlar; ters yönde ayrı stop/TP, 2 taraflı ücret, kayma, fonlama ve zaman sıralı OOS.'
      });
    }
    results.sort((a,b)=>Math.abs(b.mean||0)*Math.sqrt(Math.min(200,b.closed||0))-Math.abs(a.mean||0)*Math.sqrt(Math.min(200,a.closed||0)));
    return {
      schema:'uzayx.research.lessons.v1',generatedAt:today.toISOString(),
      observationStart:Number.isFinite(+start)?start.toISOString():null,daysObserved:days,
      totalClosed:val(cohorts['TÜMÜ']?.closed),strictPaperSeparate:true,autoReverseEnabled:false,
      realOrdersEnabled:false,mirrorOutcomeValid:false,
      verdict:'NO_VERIFIED_MIRROR_EDGE',
      warnings:['İşlem kohortları örtüşebilir; bağımsız gözlem sayısı değildir.',
        'Kısa süreli veri geçmişi farklı piyasa rejimlerinde doğrulama yerine geçmez.',
        'Bir pozisyonun tersinin aynı çıkışta kazanacağı varsayılamaz.'],
      hypotheses:results
    };
  }
  return {analyze};
});