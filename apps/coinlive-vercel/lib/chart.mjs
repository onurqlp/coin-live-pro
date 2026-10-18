import crypto from 'node:crypto';
import { REPO, MAX_SCAN_AGE_MINUTES, SourceError, fetchText } from './snapshot.mjs';

const VALID_FRAMES = Object.freeze({ '1H': 3600000, '4H': 14400000, '1D': 86400000 });
const sha40 = /^[a-f0-9]{40}$/;
function parse(raw, name) { try { return JSON.parse(raw); } catch { throw new SourceError('INVALID_JSON', `${name} JSON bozuk`); } }
function gitBlobSha(raw) { const body=Buffer.from(raw,'utf8'); return crypto.createHash('sha1').update(`blob ${body.length}\0`).update(body).digest('hex'); }
function sha256(raw) { return crypto.createHash('sha256').update(Buffer.from(raw,'utf8')).digest('hex'); }
const okNumber = x => typeof x==='number' && Number.isFinite(x);

// Pure read-only chart overlay. Git commit SHA anchors the chart-pack blob;
// the V4 publication manifest anchors history and scan timestamps.
export async function loadChart({ symbol='BTCUSDT', timeframe='1H', commit, fetcher=fetch, now=Date.now() }={}) {
  if (!/^[A-Z0-9]{2,18}USDT$/.test(symbol) || !Object.hasOwn(VALID_FRAMES,timeframe))
    throw new SourceError('BAD_CHART_PARAMETERS','Geçersiz coin veya zaman dilimi',400);
  if (!sha40.test(commit || '')) throw new SourceError('INVALID_COMMIT','Kaynak SHA eksik',400);
  const tip=parse(await fetchText(`https://api.github.com/repos/${REPO}/commits/main`,fetcher),'commit');
  if(tip.sha!==commit) throw new SourceError('SCAN_REFRESH_REQUIRED','Yeni tarama geldi; önce radarı yenileyin',409);
  const [manifestRaw, treeRaw] = await Promise.all([
    fetchText(`https://raw.githubusercontent.com/${REPO}/${commit}/web/data/v4-manifest.json`,fetcher),
    fetchText(`https://api.github.com/repos/${REPO}/git/trees/${commit}?recursive=1`,fetcher)
  ]);
  const manifest=parse(manifestRaw,'manifest'), tree=parse(treeRaw,'tree');
  const finished=Date.parse(manifest.finished_at_utc || '');
  if (!manifest.publication_valid || !manifest.no_real_orders || !Number.isFinite(finished) || finished>now+120000)
    throw new SourceError('INVALID_MANIFEST','Kaynak manifesti uygun değil');
  if ((now-finished)/60000>MAX_SCAN_AGE_MINUTES) throw new SourceError('STALE_DATA','Veri eski; grafik güncelmiş gibi çizilmeyecek');
  const blob=tree.tree?.find(x=>x.path==='web/data/chart-pack.json'&&x.type==='blob');
  if (!blob || !sha40.test(blob.sha)) throw new SourceError('CHART_NOT_VERIFIABLE','Commit altında grafik blob kaydı yok');
  const rawBase=`https://raw.githubusercontent.com/${REPO}/${commit}/web/data`;
  const [chartRaw, historyRaw]=await Promise.all([
    fetchText(`${rawBase}/chart-pack.json`,fetcher),
    fetchText(`${rawBase}/v4-history-index.json`,fetcher)
  ]);
  if(gitBlobSha(chartRaw)!==blob.sha) throw new SourceError('CHART_HASH_MISMATCH','Grafik Git blob SHA uyuşmuyor');
  const historyProof=manifest.sources?.['v4-history-index'];
  if(!historyProof || historyProof.bytes!==Buffer.byteLength(historyRaw,'utf8') || historyProof.sha256!==sha256(historyRaw))
    throw new SourceError('HISTORY_HASH_MISMATCH','Geçmiş manifest SHA doğrulanamadı');
  const pack=parse(chartRaw,'chart-pack'), history=parse(historyRaw,'history');
  if(pack.source!=='OKX_CLOSED_CANDLES' || pack.chart_only!==true || pack.no_real_orders!==true ||
     pack.source_mtf_at!==manifest.started_at_utc || history.scan_id!==manifest.scan_id)
    throw new SourceError('CHART_SCAN_MISMATCH','Grafik taramayla eşleşmiyor');
  const rows=pack.candles_by_symbol?.[symbol]?.[timeframe];
  if(!Array.isArray(rows) || !rows.length)throw new SourceError('NO_VERIFIED_CHART','Bu coin ve dilim için onaylı mum yok',422);
  const interval=VALID_FRAMES[timeframe];
  const candles=[]; let last=-Infinity;
  for(const row of rows){
    if (!Array.isArray(row) || row.length<5 || !row.slice(0,5).every(okNumber) || row[0]<=last ||
        row[1]<=0 || row[2]<Math.max(row[1],row[4]) || row[3]>Math.min(row[1],row[4]) || row[3]<=0 || row[2]<row[3])
      throw new SourceError('INVALID_CANDLE','OHLC kanıtında bozuk veya sırasız mum var');
    last=row[0];
    if(row[0]+interval<=finished && row[0]+interval<=now)
      candles.push({ t:row[0],open:row[1],high:row[2],low:row[3],close:row[4] });
  }
  if(candles.length<8)throw new SourceError('INSUFFICIENT_CLOSED_BARS','Doğrulanmış kapanmış mum sayısı yetersiz');
  const slice=candles.slice(-90),first=slice[0].t,lastEnd=slice.at(-1).t+interval;
  const markers=(history.events||[]).filter(x=>x.symbol===symbol && x.event_time_utc &&
        Date.parse(x.event_time_utc)>=first && Date.parse(x.event_time_utc)<lastEnd)
      .slice(-30).map(x=>({type:x.type,atUtc:x.event_time_utc,side:x.side??null,notExecution:true}));
  return {
    schema:'coinlive.v5.chart.readonly.v1',symbol,timeframe,commit,scanId:manifest.scan_id,
    observedAtUtc:manifest.finished_at_utc,provider:'OKX',candleState:'CLOSED_ONLY',
    sourceValidation:'GIT_COMMIT_BLOB_SHA1_PLUS_HISTORY_MANIFEST_SHA256',
    sourceBlobSha:blob.sha, historySourceVerified:true, noRealOrders:true,
    chartIsNotTradeSignal:true, excludedUnclosedCount:rows.length-candles.length,
    candles:slice,markers
  };
}
