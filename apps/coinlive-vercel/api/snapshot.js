import { loadSnapshot, SourceError } from '../lib/snapshot.mjs';
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', 'null');
  if (req.method !== 'GET') return res.status(405).json({state:'NO_VERIFIED_DATA',error:'METHOD_NOT_ALLOWED'});
  try { return res.status(200).json(await loadSnapshot()); }
  catch (error) { return res.status(error instanceof SourceError ? error.status : 503).json({
    schema:'coinlive.v5.readonly.v1', state:'NO_VERIFIED_DATA',
    error: error instanceof SourceError ? error.code : 'UNEXPECTED_ERROR',
    detail: error instanceof SourceError ? error.message : 'Kaynak doğrulanamadı',
    radar:{count:0,candidates:[]}, noTradingSignals:true
  }); }
}
