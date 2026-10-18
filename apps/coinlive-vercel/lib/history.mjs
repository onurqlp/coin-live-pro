import crypto from 'node:crypto';
import { REPO, SourceError, fetchText } from './snapshot.mjs';

const SHA = /^[a-f0-9]{40}$/;
const SUM = /^[a-f0-9]{64}$/;
const clean = (x, limit = 100) => typeof x === 'string' ? x.slice(0,limit) : null;
const hash = raw => crypto.createHash('sha256').update(Buffer.from(raw,'utf8')).digest('hex');
const read = (raw,label) => {try{return JSON.parse(raw)}catch{throw new SourceError('INVALID_HISTORY_JSON',label+' okunamadı')}};

export async function loadHistory({ commit, fetcher = fetch, now = Date.now() } = {}) {
 if(!SHA.test(commit||'')) throw new SourceError('INVALID_COMMIT','Kaynak commit eksik',400);
 const tip=read(await fetchText(`https://api.github.com/repos/${REPO}/commits/main`,fetcher),'commit');
 if(tip.sha !== commit)throw new SourceError('SCAN_REFRESH_REQUIRED','Önce güncel taramayı yenileyin',409);
 const base=`https://raw.githubusercontent.com/${REPO}/${commit}/web/data/`;
 const [manifestRaw,raw]=await Promise.all([
  fetchText(base+'v4-manifest.json',fetcher),
  fetchText(base+'v4-history-index.json',fetcher)
 ]);
 const manifest=read(manifestRaw,'manifest');
 const proof=manifest.sources?.['v4-history-index'];
 if(manifest.publication_valid!==true||manifest.no_real_orders!==true||
    !proof||!SUM.test(proof.sha256)||!Number.isInteger(proof.bytes))
   throw new SourceError('INVALID_HISTORY_MANIFEST','Geçmiş kaynak kanıtı eksik');
 if(proof.sha256!==hash(raw)||proof.bytes!==Buffer.byteLength(raw,'utf8'))
   throw new SourceError('SOURCE_HASH_MISMATCH','Geçmiş dosyası SHA-256 doğrulanmadı');
 const index=read(raw,'history');
 if(index.scan_id!==manifest.scan_id||!Array.isArray(index.events))
   throw new SourceError('MIXED_SCAN_ID','Geçmiş ve tarama eşleşmiyor');
 const stamp=Date.parse(manifest.finished_at_utc);
 if(!Number.isFinite(stamp)||stamp>now+120000)throw new SourceError('INVALID_TIMESTAMP','Zaman uygun değil');
 const events=index.events.filter(x=>x && x.event_id && x.type && x.symbol && Number.isFinite(Date.parse(x.event_time_utc)))
   .map(x=>({id:clean(x.event_id,80),symbol:clean(x.symbol,32),
      side:clean(x.side,12),type:clean(x.type,70),prev:clean(x.previous_stage,50),
      next:clean(x.next_stage,50),strategy:clean(x.strategy_id,75),
      timeUtc:x.event_time_utc,price:typeof x.price_at_transition==='number'&&Number.isFinite(x.price_at_transition)?x.price_at_transition:null,
      reasons:Array.isArray(x.reason_codes)?x.reason_codes.slice(0,4).map(s=>clean(s,70)):[]}))
   .sort((a,b)=>Date.parse(b.timeUtc)-Date.parse(a.timeUtc)).slice(0,100);
 return {schema:'coinlive.v5.history.readonly.v1',repo:REPO,commit,scanId:manifest.scan_id,
   sourceStatus:(now-stamp)>20*60000?'STALE_HISTORY':'VERIFIED',sourceVerified:true,
   sha256:proof.sha256,archivedTotal:index.archived_total??null,
   events,noRealOrders:true,notTrades:true};
}
