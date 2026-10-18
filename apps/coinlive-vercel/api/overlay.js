import { loadOverlay } from '../lib/overlay.mjs';
import { SourceError } from '../lib/snapshot.mjs';
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ state: 'UNAVAILABLE', error: 'METHOD_NOT_ALLOWED' });
  try { return res.status(200).json(await loadOverlay()); }
  catch (error) {
    // A failed optional research overlay must never be treated as a COIN.LIVE signal failure.
    return res.status(200).json({ schema: 'coinlive.v5.overlay.readonly.v1', source: 'MAKINE_CORE',
      state: 'UNAVAILABLE', readOnly: true, changesCoreSignals: false, noNewTradeCandidates: true,
      error: error instanceof SourceError ? error.code : 'OVERLAY_UNAVAILABLE', recommendations: [], observations: [] });
  }
}
