/**
 * COIN.LIVE 4.03 V4 companion mirror for the existing Google Sheets workbook.
 * Paste this file into the EXISTING Apps Script project and run installCoinLiveV4Sync()
 * once, then verify the returned status. GitHub pushes DO NOT deploy Apps Script.
 * No trading API keys or Apps Script web app deployment required.
 */
const CLV4 = Object.freeze({
  repo: 'https://raw.githubusercontent.com/onurqlp/coin-live-pro/main/',
  headers: Object.freeze({
    V4_GUNLUK: ['UTC GÜN','SCAN ID','KAYNAK UTC','TÜM KIVILCIM','GELDİ','AÇIK','KAPALI','KÂRLI','ZARARLI','REALIZE USDT','AÇIK PNL USDT','DENEY BAKİYE','V4 KASA BAKİYE','FUNDING','AÇIKLAMA'],
    V4_STRATEJILER: ['PENCERE|STRATEJİ','GÜN','STRATEJİ','KEŞFEDİLEN','HAREKET','TEYİT','GEÇERSİZ','GİRİŞE UYGUN','1H ÖRNEK','1H MFE %','1H MAE %','4H ÖRNEK','4H MFE %','4H MAE %','ÖRNEK DURUMU','KAYNAK UTC'],
    V4_TICKETLER: ['EVENT ID','SİNYAL UTC','PARİTE','YÖN','SINIF','AŞAMA','DURUM','DOLUM UTC','GİRİŞ FİYATI','STOP','TP1','TP2','TP3','REALIZE USDT','AÇIK PNL USDT','GERÇEK İŞLEM','SCAN ID','FUNDING'],
    V4_SISTEM: ['SCAN ID','GÜNCELLEME UTC','TETİK','DURUM','TARANAN','DOĞRULANAN','KAÇAN PERİYOT','KANITLI SCHEDULE','YAYIN BÜTÜNLÜĞÜ','MARKET EVRENİ','SPOTLIGHT','MOTION','WATCH','KAYNAK','GERÇEK EMİR']
  })
});

function clv4FetchJson_(path) {
  const url = CLV4.repo + path + '?at=' + Date.now();
  const r = UrlFetchApp.fetch(url, {muteHttpExceptions:true, followRedirects:true});
  if (r.getResponseCode() !== 200) throw Error('V4 source ' + path + ': HTTP ' + r.getResponseCode());
  return JSON.parse(r.getContentText('UTF-8'));
}

function clv4Sheet_(name) {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sh=ss.getSheetByName(name);
  if (!sh) {
    sh=ss.insertSheet(name);
    sh.setFrozenRows(1);
  }
  const headers=CLV4.headers[name];
  if(sh.getMaxColumns()<headers.length)sh.insertColumnsAfter(sh.getMaxColumns(),headers.length-sh.getMaxColumns());
  const first=sh.getRange(1,1,1,headers.length).getDisplayValues()[0];
  if(first.every(x=>!x)) sh.getRange(1,1,1,headers.length).setValues([headers]);
  else if(first.some((x,i)=>x!==headers[i]))throw Error('Do not overwrite schema: '+name);
  return sh;
}

function clv4Upsert_(name, rows) {
  if(!rows.length)return 0;
  const sheet=clv4Sheet_(name);
  const width=CLV4.headers[name].length;
  const last=sheet.getLastRow();
  const existing=last>1?sheet.getRange(2,1,last-1,1).getDisplayValues().flat():[];
  const idx=new Map();
  existing.forEach((id,i)=>{ if(id)idx.set(String(id),i+2); });
  const updates=[],adds=[],seen=new Set();
  rows.forEach(row=>{
    if(row.length!==width)throw Error('Bad width on '+name);
    const key=String(row[0]);
    if(!key||seen.has(key))return;
    seen.add(key);
    const normalized=row.map(x=>x===undefined||x===null?'':(typeof x==='object'?JSON.stringify(x):x));
    if(idx.has(key))updates.push({index:idx.get(key),value:normalized});
    else adds.push(normalized);
  });
  // Cluster adjacent updates to avoid hundreds of individual API calls.
  updates.sort((a,b)=>a.index-b.index);
  let group=[];
  function flush(){
    if(!group.length)return;
    const start=group[0].index;
    sheet.getRange(start,1,group.length,width).setValues(group.map(x=>x.value));
    group=[];
  }
  updates.forEach(row=>{
    if(group.length && row.index!==group[group.length-1].index+1)flush();
    group.push(row);
  });
  flush();
  if(adds.length){
    const dest=sheet.getLastRow()+1;
    if(sheet.getMaxRows()<dest+adds.length-1)sheet.insertRowsAfter(sheet.getMaxRows(),dest+adds.length-1-sheet.getMaxRows());
    sheet.getRange(dest,1,adds.length,width).setValues(adds);
  }
  return adds.length;
}

function syncCoinLiveV4() {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))return 'SYNC_ALREADY_RUNNING';
  try{
    const manifest=clv4FetchJson_('web/data/v4-manifest.json');
    const spark=clv4FetchJson_('web/data/v4-spark-paper.json');
    const review=clv4FetchJson_('web/data/v4-spark-review.json');
    const strict=clv4FetchJson_('web/data/v4-paper.json');
    const health=clv4FetchJson_('web/data/health.json');
    const lab=clv4FetchJson_('web/data/v4-lab.json');
    if(!manifest.publication_valid || manifest.no_real_orders!==true ||
       [spark,review,strict,lab].some(x=>x.scan_id!==manifest.scan_id))
      throw Error('V4 mismatch: publication integrity / scan_id');
    const age=(Date.now()-Date.parse(health.updated_at))/60000;
    if(!isFinite(age)||age< -3||age>35)throw Error('V4 source stale: '+Math.round(age)+' minutes');
    const d=spark.daily||{}, todays=d.today||{}, total=review.cohorts?.['TÜMÜ']||{};
    const date=d.today_utc||String(spark.updated_at).slice(0,10);
    const daily=[date,manifest.scan_id,health.updated_at,todays.all_sparks||0,todays.geldi||0,
      spark.summary?.counts?.OPEN||0,spark.summary?.counts?.CLOSED||0,
      total.positive||0,total.negative||0,todays.realized_net_usdt||0,
      spark.summary?.unrealized_net_usdt||0,spark.summary?.virtual_equity_usdt||0,
      strict.equity_usdt||0,strict.funding_state||'UNKNOWN','SIMULATED_ONLY'];
    const strategy=(lab.periods||[]).flatMap(p=>Object.entries(p.strategies||{}).map(([name,x])=>{
      const h1=x.forward_horizons?.['1H']||{},h4=x.forward_horizons?.['4H']||{};
      return [date+'|'+p.days+'|'+name,p.days,name,x.discovered||0,x.motion||0,
        x.spotlight||0,x.invalidated||0,x.entry_eligible||0,h1.observed||0,
        h1.median_mfe_pct??'',h1.median_mae_pct??'',h4.observed||0,
        h4.median_mfe_pct??'',h4.median_mae_pct??'',p.sample_quality||'INSUFFICIENT_SAMPLE',lab.updated_at];
    }));
    // Bootstrap all historical tickets only while the archive remains reasonably sized.
    // When it grows large, the last 220 live tickets are still incrementally upserted.
    let tickets=spark.recent_tickets||[];
    try {
      const archive=clv4FetchJson_('archive/v4-spark-paper-ledger.json');
      if(Array.isArray(archive.tickets)&&archive.tickets.length<20000)tickets=archive.tickets;
    } catch (ex) { console.warn('Archive unavailable, recent tickets used: '+String(ex).slice(0,120)); }
    const ticketRows=tickets.map(x=>[
      x.event_id,x.signal_at_utc,x.symbol,x.side,x.entry_class||'ERKEN_ARASTIRMA',
      x.stage_at_birth,x.status,x.filled_at_utc||'',x.fill_price??'',
      x.stop??'',x.tp1??'',x.tp2??'',x.tp3??'',x.realized_net_usdt||0,
      x.unrealized_net_usdt||0,String(!!x.is_real_trade),manifest.scan_id,x.funding||'UNMODELED'
    ]);
    const counts={
      daily:clv4Upsert_('V4_GUNLUK',[daily]),
      strategies:clv4Upsert_('V4_STRATEJILER',strategy),
      tickets:clv4Upsert_('V4_TICKETLER',ticketRows),
      health:clv4Upsert_('V4_SISTEM',[[manifest.scan_id,health.updated_at,health.last_trigger,health.status,
        health.mtf_attempted,health.mtf_verified,health.missed_slots_latest,
        health.observed_real_scheduled_runs,manifest.publication_valid,
        manifest.candidate_counts?.market_pairs,manifest.candidate_counts?.v4?.spotlight,
        manifest.candidate_counts?.v4?.motion,manifest.candidate_counts?.v4?.watch,
        manifest.provider,'NONE']])
    };
    console.log('V4 SYNC OK '+JSON.stringify({date,scan:manifest.scan_id,age_minutes:Math.round(age),inserted:counts}));
    return counts;
  } finally{lock.releaseLock();}
}

function installCoinLiveV4Sync(){
  Object.keys(CLV4.headers).forEach(clv4Sheet_);
  // Preserve all other existing triggers and V3 processes.
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='syncCoinLiveV4')
    .forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncCoinLiveV4').timeBased().everyMinutes(10).create();
  return syncCoinLiveV4();
}
