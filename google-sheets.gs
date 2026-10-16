/** COIN.LIVE PRO — Google Sheets readonly public archive mirror.
 * Target: COIN.LIVE PRO | Kıvılcım Geçmişi ve 7-14 Gün Raporları
 * IMPORTANT: The GitHub repository must be created as onurqlp/coin-live-pro.
 * Install once: Apps Script > installCoinLivePro > Run / grant access.
 */
const CLPRO = {
  root:'https://raw.githubusercontent.com/onurqlp/coin-live-pro/main/web/data/',
  archive:'https://raw.githubusercontent.com/onurqlp/coin-live-pro/main/archive/',
  history:'KIVILCIM_GECMIS', report:'HAFTALIK_RAPOR',daily:'GUNLUK_IZLEME',settings:'AYARLAR',maxAgeMinutes:35
};
function installCoinLivePro(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  [CLPRO.history,CLPRO.report,CLPRO.daily,CLPRO.settings].forEach(n=>{if(!ss.getSheetByName(n))throw Error('Sekme yok: '+n);});
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='syncCoinLivePro').forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncCoinLivePro').timeBased().everyMinutes(10).create();
  syncCoinLivePro();
}
function clFetch(file){
  const r=UrlFetchApp.fetch(CLPRO.root+file+'?t='+Date.now(),{muteHttpExceptions:true});
  if(r.getResponseCode()!==200)throw Error(file+' HTTP '+r.getResponseCode());
  return JSON.parse(r.getContentText());
}
function syncCoinLivePro(){
  const lock=LockService.getScriptLock();if(!lock.tryLock(15000))return;
  const ss=SpreadsheetApp.getActiveSpreadsheet(),history=ss.getSheetByName(CLPRO.history),rep=ss.getSheetByName(CLPRO.report),settings=ss.getSheetByName(CLPRO.settings);
  try{
    const [hist,reports,market]=[clFetch('history.json'),clFetch('reports.json'),clFetch('market.json')];
    const stamp=Date.parse(hist.updated_at),age=(Date.now()-stamp)/60000;
    if(!Number.isFinite(stamp)||age>CLPRO.maxAgeMinutes||age< -3){
      settings.getRange('A2:C4').setValues([
        ['Son kontrol',new Date(),'GitHub verisi okunabildi'],
        ['Durum','VERİ ESKİ','Yaş: '+Math.round(age)+' dk. Arşiv değiştirilmedi.'],
        ['Kaynak','OKX','Bir sonraki otomatik kontrol bekleniyor']]);return;
    }
    const events=Array.isArray(hist.events)?hist.events:[];
    const old=history.getLastRow()>1?history.getRange(2,1,history.getLastRow()-1,1).getValues().flat():[];
    const indexes=new Map(old.map((id,i)=>[String(id),i+2]).filter(x=>x[0]));
    const make=e=>[
      e.id||'',e.time||'',e.symbol||'',e.venue||'',e.side||'',e.stage||'',e.price||'',e.threshold||'',e.stop||'',
      (e.targets||[])[0]||'',(e.targets||[])[1]||'',(e.targets||[])[2]||'',e.volume_ratio||'',e.score||'',e.state||'',
      e.closed_at||'',e.exit_price||'',e.net_R??'',e.mfe_pct??'',e.mae_pct??'',e.quality||''
    ];
    let updates=0,insert=[];
    // Only mirror current 14-day archive. Retain older rows already in Google Sheets for longer-term audits.
    events.forEach(e=>{
      if(!e.id)return;const cells=make(e),row=indexes.get(String(e.id));
      if(row){
        const before=history.getRange(row,15,1,7).getValues()[0];
        const after=cells.slice(14,21);
        if(JSON.stringify(before)!==JSON.stringify(after)){
          history.getRange(row,15,1,7).setValues([after]);updates++;
        }
      }else{insert.push(cells);}
    });
    if(insert.length)history.getRange(history.getLastRow()+1,1,insert.length,21).setValues(insert);
    const reportsArr=reports.reports||[];
    const reportRows=[7,14].map(days=>{
      const r=reportsArr.find(x=>x.days===days)||{};
      return [days+' gün',r.total??0,r.closed??0,r.wins??0,r.losses??0,r.ambiguous??0,
        r.win_rate??'',r.avg_net_R??'',r.sum_net_R??'',r.sample_ok?'30+ kapanmış':'Örnek yetersiz',reports.updated_at||''];
    });
    rep.getRange(2,1,2,11).setValues(reportRows);
    const daily=ss.getSheetByName(CLPRO.daily);
    // Force date key to TEXT, not date serial. Apps Script Date at midnight Istanbul
    // resolves to the PREVIOUS UTC day and historically caused duplicate rows.
    daily.getRange('A2:A').setNumberFormat('@');
    const day=String(hist.updated_at).slice(0,10);
    const today=events.filter(e=>String(e.time).startsWith(day));
    const spot=(sym)=>((market.rows||[]).find(x=>x.symbol===sym)||{}).price||'';
    const line=[day,spot('BTCUSDT'),spot('ETHUSDT'),market.provider||'OKX',market.analysis_ok??market.analyzed??0,
      today.filter(e=>e.side==='LONG'&&e.stage==='WATCH').length,
      today.filter(e=>e.side==='SHORT'&&e.stage==='WATCH').length,
      today.filter(e=>e.side==='LONG'&&e.stage==='CONFIRMED').length,
      today.filter(e=>e.side==='SHORT'&&e.stage==='CONFIRMED').length,
      today.filter(e=>['OPEN','WATCHING'].includes(e.state)).length,
      'Gün sonunda değişebilir; sadece gözlenen olaylar'];
    // Sheets may deserialize a yyyy-MM-dd cell as a native Date; String(Date)
    // does not equal yyyy-MM-dd. Normalise before matching to avoid duplicates.
    // Existing Sheets dates can arrive as strings, Date objects or serial day values.
    // Match by UTC day; update the newest matching row, never append duplicate days.
    const normaliseDay=value=>{
      if(value instanceof Date&&!isNaN(value.getTime()))return Utilities.formatDate(value,ss.getSpreadsheetTimeZone(),'yyyy-MM-dd');
      if(typeof value==='number'&&Number.isFinite(value)){
        const date=new Date(Math.round((value-25569)*86400000));
        return Utilities.formatDate(date,'UTC','yyyy-MM-dd');
      }
      const str=String(value==null?'':value).trim();
      if(/^\d{4}-\d{2}-\d{2}/.test(str))return str.slice(0,10);
      const tr=str.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
      if(tr)return tr[3]+'-'+tr[2]+'-'+tr[1];
      return str;
    };
    const days=daily.getLastRow()>1?
      daily.getRange(2,1,daily.getLastRow()-1,1).getValues().flat().map(normaliseDay):[];
    const found=days.lastIndexOf(day);
    daily.getRange(found>=0?found+2:daily.getLastRow()+1,1,1,11).setValues([line]);
    settings.getRange('A2:C5').setValues([
      ['Son başarılı senkronizasyon',new Date(),'Google 10 dakika aralıkla denetler'],
      ['Durum','AKTİF','GitHub verisi '+Math.floor(age)+' dk eski'],
      ['Yeni kıvılcım kaydı',insert.length,'Gerçek zamanlı kayıttan; geriye dönük başarı yok'],
      ['Sonuç güncellemesi',updates,'Stop/TP/Belirsiz/DATA_GAP']]);
    const v2Result=clSyncPilotV2(ss);
    settings.getRange('A6:C7').setValues([
      ['Pilot V2',v2Result,'Merkezi sinyal zinciri ve sanal portföy yedeklendi'],
      ['Cron kanıtı',v2Result.includes('CRON KANITLANDI')?'VAR':'HENÜZ YOK','Başarılı push, 24/7 schedule kanıtı değildir']]);
    SpreadsheetApp.flush();console.log('COIN.LIVE PRO V2 OK | yeni '+insert.length+' | sonuç güncellemesi '+updates+' | '+v2Result);
  }catch(e){
    if(settings)settings.getRange('A2:C4').setValues([
      ['Son kontrol',new Date(),'Bağlantı denendi'],['Durum','HATA',String(e.message).slice(0,160)],['Kaynak','GitHub','Değişiklik yapılmadı']]);
    console.log('COIN.LIVE PRO HATA: '+e.message);
  }finally{lock.releaseLock();}
}

/**
 * V2 — additive sync. Keeps every original V1 tab and row.
 * New data is sourced only from centrally published model/audit JSON.
 * Apps Script is a read-only mirror, never a trading engine.
 */
function clFetchArchive(file){
  const r=UrlFetchApp.fetch(CLPRO.archive+file+'?t='+Date.now(),{muteHttpExceptions:true});
  if(r.getResponseCode()!==200)throw Error('Arşiv HTTP '+r.getResponseCode()+': '+file);
  return JSON.parse(r.getContentText());
}
function clDay(v){
  if(v instanceof Date&&!isNaN(v.getTime()))return Utilities.formatDate(v,SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(),'yyyy-MM-dd');
  const t=String(v==null?'':v).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(t))return t.slice(0,10);
  const tr=t.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  return tr?tr[3]+'-'+tr[2]+'-'+tr[1]:t;
}
function clUpsertRows(sheet,rows,mutable,dayMode){
  if(!rows.length)return 0;
  const width=rows[0].length,last=sheet.getLastRow();
  const ids=last>1?sheet.getRange(2,1,last-1,1).getValues().flat():[];
  const index=new Map(ids.map((v,i)=>[dayMode?clDay(v):String(v),i+2]).filter(x=>x[0]));
  const newRows=[];
  rows.forEach(row=>{
    const id=dayMode?clDay(row[0]):String(row[0]||'');
    if(!id)return;
    const existing=index.get(id);
    if(existing){
      if(mutable){
        const old=sheet.getRange(existing,1,1,width).getValues()[0];
        if(JSON.stringify(old.map(String))!==JSON.stringify(row.map(String))){
          sheet.getRange(existing,1,1,width).setValues([row]);
        }
      }
    }else{
      // Prevent duplicates inside a single fetch too.
      index.set(id,last+newRows.length+1);
      newRows.push(row);
    }
  });
  if(newRows.length)sheet.getRange(sheet.getLastRow()+1,1,newRows.length,width).setValues(newRows);
  return newRows.length;
}
function clSyncPilotV2(ss){
  const mtf=clFetch('mtf.json');
  const paper=clFetch('paper.json');
  const health=clFetch('health.json');
  const ledger=clFetchArchive('pilot-ledger.json');
  const history=clFetchArchive('scan-health.json');
  const t=Date.now();
  for(const [name,iso] of [['mtf',mtf.fetched_at],['paper',paper.updated_at],['health',health.updated_at]]){
    const delta=(t-Date.parse(iso))/60000;
    if(!Number.isFinite(delta)||delta>40||delta< -3)throw Error('V2 '+name+' bayat veri: '+Math.round(delta)+' dk');
  }
  const tab=name=>{
    const sh=ss.getSheetByName(name);
    if(!sh)throw Error('Pilot tablosu eksik: '+name);
    return sh;
  };
  const chains=Object.values(ledger.chains||{}).sort((a,b)=>a.at_ms-b.at_ms);
  const newChains=clUpsertRows(tab('SINYAL_ZINCIRI'),chains.map(x=>[
    x.signal_id,x.chain_id,x.parent_signal_id||'',x.created_at,x.symbol,x.side,x.stage,
    x.model_version,x.evidence_sha256,'CENTRAL_FORWARD']
  ),false,false);
  const orders=Object.values(ledger.orders||{}).sort((a,b)=>a.signal_at_ms-b.signal_at_ms);
  const newOrders=clUpsertRows(tab('SANAL_ISLEMLER'),orders.map(x=>[
    x.id,x.chain_id||x.id,x.symbol,x.side,x.signal_at,x.filled_at||'',
    x.fill_price??'',x.stop,x.tp1,x.margin_10x??'',x.margin_15x??'',
    x.risk_budget??'',x.status,x.exit_at||'',x.exit_price??'',x.pnl_usdt??'',
    x.net_R??'',x.quality||'ESTIMATED_NOT_FILLED']
  ),true,false);
  const runs=(history.records||[]);
  const newRuns=clUpsertRows(tab('SISTEM_SAGLIGI'),runs.map(x=>[
    x.scan_id,x.completed_at,x.trigger,x.attempted,x.successful_3tf,
    x.mtf_attempted,x.mtf_verified,x.missed_cron_slots_since_previous_success??'',
    x.quality,x.model_version
  ]),false,false);
  // Daily report updates the same UTC date; never appends six identical days.
  const day=String(paper.updated_at).slice(0,10);
  tab('PERFORMANS_GUNLUK').getRange('A2:A').setNumberFormat('@');
  clUpsertRows(tab('PERFORMANS_GUNLUK'),[[day,100,paper.estimated_equity_usdt,
    paper.open_paper_positions,paper.closed_paper_orders,paper.wins,paper.losses,
    paper.ambiguous,paper.no_fill,paper.max_drawdown_pct_est,
    'ESTIMATED 5m OHLC; fee/slip %0,15 nominal; gerçek işlem değil'
  ]],true,true);
  const candidates=mtf.candidates||[];
  const frames=['1W','1D','12H','4H','1H','15m','5m'];
  tab('ZAMAN_DILIMI_ISTATISTIK').getRange(2,1,frames.length,8).setValues(
    frames.map(tf=>{
      const good=candidates.filter(x=>x.frames&&x.frames[tf]&&x.frames[tf].quality==='CLOSED_CONFIRMED');
      const avg=key=>good.length?Math.round(good.reduce((a,b)=>a+Number(b[key]||0),0)/good.length*10)/10:'';
      return [tf,good.length?good[0].frames[tf].bar:'OKX '+tf,good.length,
        avg('macro_score'),avg('momentum_score'),avg('entry_quality_score'),
        candidates.length-good.length,mtf.model_version];
    })
  );
  clUpsertRows(tab('STRATEJI_SURUMLERI'),[[
    mtf.model_version,paper.pilot_started_at,'',.35,.50,.15,'1% işlem, 3% gün, 2 eşzamanlı',
    'Pilot; model değişirse yeni sürüm ayrı takip edilecek'
  ]],false,false);
  return 'AKTİF · zincir yeni '+newChains+' · işlem yeni '+newOrders+' · sağlık yeni '+newRuns+
    (health.schedule_proven?' · CRON KANITLANDI':' · CRON HENÜZ KANITLANMADI');
}

/** Manual, read-only connector health check. No distribution or installation. */
function checkCoinLivePro(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const state=ss.getSheetByName(CLPRO.settings);
  const rows={};
  for(const name of [CLPRO.daily,'PERFORMANS_GUNLUK']){
    const sh=ss.getSheetByName(name);
    const vals=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,1).getValues().flat().map(clDay):[];
    const dupe=vals.filter((v,i)=>v&&vals.indexOf(v)!==i);
    rows[name]={count:vals.length,duplicateDays:[...new Set(dupe)]};
    if(dupe.length)console.error('TEKRAR: '+name+' '+[...new Set(dupe)].join(', '));
  }
  const triggers=ScriptApp.getProjectTriggers().filter(x=>x.getHandlerFunction()==='syncCoinLivePro');
  const h=clFetch('health.json'),delta=Math.round((Date.now()-Date.parse(h.updated_at))/60000);
  const info={triggers:triggers.length,sourceAgeMinutes:delta,lastTrigger:h.last_trigger,scheduleProven:h.schedule_proven===true,tables:rows};
  console.log('COIN.LIVE PRO GOOGLE DENETİM '+JSON.stringify(info));
  return info;
}
