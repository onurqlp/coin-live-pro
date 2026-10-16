/** COIN.LIVE PRO — Google Sheets readonly public archive mirror.
 * Target: COIN.LIVE PRO | Kıvılcım Geçmişi ve 7-14 Gün Raporları
 * IMPORTANT: The GitHub repository must be created as onurqlp/coin-live-pro.
 * Install once: Apps Script > installCoinLivePro > Run / grant access.
 */
const CLPRO = {
  root:'https://raw.githubusercontent.com/onurqlp/coin-live-pro/main/web/data/',
  history:'KIVILCIM_GECMIS', report:'HAFTALIK_RAPOR',daily:'GUNLUK_IZLEME',settings:'AYARLAR',maxAgeMinutes:25
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
    const day=String(hist.updated_at).slice(0,10);
    const today=events.filter(e=>String(e.time).startsWith(day));
    const spot=(sym)=>((market.rows||[]).find(x=>x.symbol===sym)||{}).price||'';
    const line=[day,spot('BTCUSDT'),spot('ETHUSDT'),market.provider||'OKX',market.analyzed||0,
      today.filter(e=>e.side==='LONG'&&e.stage==='WATCH').length,
      today.filter(e=>e.side==='SHORT'&&e.stage==='WATCH').length,
      today.filter(e=>e.side==='LONG'&&e.stage==='CONFIRMED').length,
      today.filter(e=>e.side==='SHORT'&&e.stage==='CONFIRMED').length,
      today.filter(e=>['OPEN','WATCHING'].includes(e.state)).length,
      'Gün sonunda değişebilir; sadece gözlenen olaylar'];
    const days=daily.getLastRow()>1?daily.getRange(2,1,daily.getLastRow()-1,1).getValues().flat().map(String):[];
    const found=days.indexOf(day);
    daily.getRange(found>=0?found+2:daily.getLastRow()+1,1,1,11).setValues([line]);
    settings.getRange('A2:C5').setValues([
      ['Son başarılı senkronizasyon',new Date(),'Google 10 dakika aralıkla denetler'],
      ['Durum','AKTİF','GitHub verisi '+Math.floor(age)+' dk eski'],
      ['Yeni kıvılcım kaydı',insert.length,'Gerçek zamanlı kayıttan; geriye dönük başarı yok'],
      ['Sonuç güncellemesi',updates,'Stop/TP/Belirsiz/DATA_GAP']]);
    SpreadsheetApp.flush();console.log('COIN.LIVE PRO OK | yeni '+insert.length+' | sonuç güncellemesi '+updates);
  }catch(e){
    if(settings)settings.getRange('A2:C4').setValues([
      ['Son kontrol',new Date(),'Bağlantı denendi'],['Durum','HATA',String(e.message).slice(0,160)],['Kaynak','GitHub','Değişiklik yapılmadı']]);
    console.log('COIN.LIVE PRO HATA: '+e.message);
  }finally{lock.releaseLock();}
}