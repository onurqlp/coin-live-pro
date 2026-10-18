/**
 * UzayX | Google Kontrol Merkezi Senkronu
 *
 * Kurulum (bir kez): Yeni UzayX Google Sheet -> Uzantılar -> Apps Script ->
 * bu dosyayı yapıştır -> installUzayXSync fonksiyonunu çalıştır ve izinleri onayla.
 * Kaynak: https://github.com/onurqlp/coin-live-pro
 * Gerçek emir göndermez. Eski Google Sheet'e dokunmaz.
 */
const UZAYX_GOOGLE = Object.freeze({
  workbookId: '1Il41PLFFpJtXXDwfRx4F7cgXboCNBRON-0jvgLnsUMo',
  repository: 'onurqlp/coin-live-pro',
  dailyRefreshMinutes: 10
});

function uzxJson_(url) {
  const reply = UrlFetchApp.fetch(url, {muteHttpExceptions: true, followRedirects: true});
  if (reply.getResponseCode() !== 200) {
    throw new Error('SOURCE_HTTP_' + reply.getResponseCode());
  }
  return JSON.parse(reply.getContentText('UTF-8'));
}

function uzxSnapshot_() {
  const repo = UZAYX_GOOGLE.repository;
  const commit = uzxJson_('https://api.github.com/repos/' + repo + '/commits/main');
  const sha = String(commit.sha || '');
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('INVALID_SOURCE_COMMIT');
  const base = 'https://raw.githubusercontent.com/' + repo + '/' + sha + '/web/data/';
  const names = ['v4-manifest','v4-radar','v4-paper','v4-spark-paper','v4-spark-review','health'];
  const values = names.map(name => uzxJson_(base + name + '.json'));
  const [manifest,radar,paper,spark,review,health] = values;
  const sid = manifest.scan_id;
  if (!sid || manifest.publication_valid !== true || manifest.no_real_orders !== true ||
      [radar,paper,spark,review].some(item => !item || item.scan_id !== sid)) {
    throw new Error('SOURCE_SCAN_MISMATCH');
  }
  const observed = new Date(manifest.finished_at_utc).getTime();
  const age = (Date.now() - observed) / 60000;
  if (!isFinite(age) || age < -3 || age > 35) throw new Error('SOURCE_NOT_FRESH');
  return {sha,manifest,radar,paper,spark,review,health};
}

function uzxSheet_(book,name) {
  const tab=book.getSheetByName(name);
  if(!tab) throw new Error('MISSING_TAB_' + name);
  return tab;
}

function uzxSafe_(value) {
  if (value === null || value === undefined) return '';
  const s=String(value);
  return /^[=+@\-]/.test(s) && typeof value === 'string' ? "'" + s : value;
}

function syncUzayX() {
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(15000)) return 'ALREADY_RUNNING';
  try {
    const s=uzxSnapshot_();
    const book=SpreadsheetApp.openById(UZAYX_GOOGLE.workbookId);
    const c=s.manifest.candidate_counts || {}, stage=s.radar.counts || {};
    const all=[...(s.radar.spotlight||[]),...(s.radar.motion||[]),...(s.radar.watch||[])];
    const active=all.filter(p=>p.paper_entry_state==='ELIGIBLE' || p.paper_entry_state==='ENTRY_ELIGIBLE');
    const passed=s.health.status==='OK';
    const summary=[
      [passed?'GİRİŞ TEYİDİ YOK':'TARAMA UYARISI'],
      [c.market_pairs??''],
      [stage.watch??0],
      [stage.motion??0],
      [active.length],
      [s.paper.equity_usdt??''],
      [s.spark.summary?.virtual_equity_usdt??''],
      [s.manifest.finished_at_utc],
      [s.manifest.provider||'OKX'],
      ['Yalnız kullanıcı tarafından manuel']
    ];
    if(active.length>0)summary[0][0]='KOŞUL OLUŞAN PARİTE VAR · BINANCE TEYİDİ GEREKİR';
    uzxSheet_(book,'DURUM').getRange(4,2,summary.length,1).setValues(summary);
    const matched=new Set(),uniq=[];
    for(const item of all.sort((a,b)=>(b.score||0)-(a.score||0))) {
      const token=item.symbol+'_'+item.side;
      if(matched.has(token))continue;
      matched.add(token);uniq.push(item);
    }
    const rows=uniq.slice(0,60).map(p=>[
      uzxSafe_(p.symbol),p.side,({WATCH:'İzle',MOTION:'Hareket',SPOTLIGHT:'Öne çıkan'})[p.lifecycle_stage]||'İzle',
      (p.paper_entry_state==='ELIGIBLE'||p.paper_entry_state==='ENTRY_ELIGIBLE')?'KOŞUL VAR · MANUEL TEYİT':'GİRİŞ YOK',
      p.price??'',p.stop??'',Array.isArray(p.targets)?(p.targets[0]??''):'',
      p.score??'',uzxSafe_(p.strategy_id||''),s.manifest.finished_at_utc
    ]);
    const grid=uzxSheet_(book,'PARITELER');
    grid.getRange(5,1,80,10).clearContent();
    if(rows.length)grid.getRange(5,1,rows.length,10).setValues(rows);
    const source=s.review.cohorts||{};
    const groups=[['TÜMÜ','TÜMÜ'],['SHORT','SHORT'],['AŞAMA_2','AŞAMA 2'],['AŞAMA_3','AŞAMA 3'],['AŞAMA_1','AŞAMA 1'],['LONG','LONG'],['GELDI_OTOMATIK_GIRIS','GELDİ / OTOMATİK']];
    const outcomes=groups.map(([id,label])=>{
      const v=source[id]||{};
      const closed=Number(v.closed)||0,positive=Number(v.positive)||0;
      return [label,closed,positive,Number(v.negative)||0,
        v.realized_total_usdt??'',v.mean_net_per_closed_ticket_usdt??'',closed>0?positive/closed:''];
    });
    uzxSheet_(book,'SONUCLAR').getRange(5,1,7,7).setValues(outcomes);
    const system=[
      ['Veri sağlayıcı',s.manifest.provider||'OKX'],
      ['Kaynak zamanı UTC',s.manifest.finished_at_utc],
      ['Doğrulanan',(c.verified??'')+' / '+(c.attempted??'')],
      ['Kaynak sağlık',s.health.status||'UNKNOWN'],
      ['Veri kimliği',s.manifest.scan_id],
      ['Kayıt commit',s.sha],
      ['Gerçek emir','YOK'],
      ['Binance bağlantısı','Manuel kullanım'],
      ['Google veri yenilemesi','10 dakikada bir (best-effort Google tetikleyicisi)'],
      ['Eski Google raporu','https://docs.google.com/spreadsheets/d/17xCk7i_F3XRGzyts1EF89vfrPiAUPbnEqATAM4fj9nA/edit'],
      ['Kod devri / talimat','https://github.com/onurqlp/coin-live-pro/blob/main/AGENTS.md'],
      ['UzayX terminal','https://onurqlp.github.io/coin-live-pro/uzayx/'],
      ['Google Apps Script',new Date().toISOString()+' · senkron başarılı']
    ];
    uzxSheet_(book,'SISTEM').getRange(4,1,system.length,2).setValues(system);
    console.log('UZAYX_SYNC_OK '+JSON.stringify({scan:s.manifest.scan_id,commit:s.sha,marketPairs:c.market_pairs,eligibles:active.length}));
    return {scan:s.manifest.scan_id,commit:s.sha,marketPairs:c.market_pairs,eligibles:active.length};
  } finally {lock.releaseLock();}
}

function installUzayXSync() {
  const book=SpreadsheetApp.openById(UZAYX_GOOGLE.workbookId);
  for(const name of ['DURUM','PARITELER','SONUCLAR','SISTEM'])uzxSheet_(book,name);
  const result=syncUzayX();
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='syncUzayX')
    .forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncUzayX').timeBased().everyMinutes(UZAYX_GOOGLE.dailyRefreshMinutes).create();
  return result;
}
