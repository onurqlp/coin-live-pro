import crypto from 'node:crypto';
import { SourceError, fetchText } from './snapshot.mjs';

export const MAKINE_REPO = 'onurqlp/makine-core';
export const OVERLAY_TTL_MINUTES = 45;
const COMMIT_RE = /^[a-f0-9]{40}$/;

function parseJSON(raw, label) {
  try { return JSON.parse(raw); }
  catch { throw new SourceError('INVALID_OVERLAY_JSON', `${label} JSON olarak okunamadı`); }
}

export async function loadOverlay({ fetcher = fetch, now = Date.now() } = {}) {
  // Hardcoded read-only origin; request parameters cannot redirect network access.
  const head = parseJSON(await fetchText(`https://api.github.com/repos/${MAKINE_REPO}/commits/main`, fetcher), 'MAKINE commit');
  if (!COMMIT_RE.test(head.sha ?? '')) throw new SourceError('INVALID_OVERLAY_COMMIT', 'MAKINE commit doğrulanmadı');
  const raw = await fetchText(`https://raw.githubusercontent.com/${MAKINE_REPO}/${head.sha}/site/data/coinlive-handoff.json`, fetcher);
  const handoff = parseJSON(raw, 'MAKINE handoff');
  if (handoff.schema !== 'makine-coinlive-research-handoff-v1' || handoff.generator !== 'MAKINE_CORE' ||
      handoff.can_execute_orders !== false || handoff.can_modify_coins_live_ledger !== false ||
      handoff.can_modify_live_policy !== false || handoff.can_promote_to_live_signal !== false ||
      !Array.isArray(handoff.new_trade_candidates) || handoff.new_trade_candidates.length !== 0 ||
      handoff.source_integrity !== 'VERIFIED' || !COMMIT_RE.test(handoff.source_commit_sha ?? ''))
    throw new SourceError('UNSAFE_OVERLAY', 'MAKINE salt-okunur kaynak sözleşmesine uymuyor');
  const generatedAt = Date.parse(handoff.generated_at_utc);
  if (!Number.isFinite(generatedAt) || generatedAt > now + 120_000)
    throw new SourceError('INVALID_OVERLAY_TIMESTAMP', 'MAKINE tarih doğrulanmadı');
  const ageMinutes = Math.max(0, (now - generatedAt) / 60_000);
  const stale = ageMinutes > OVERLAY_TTL_MINUTES;
  const recommendations = !stale && Array.isArray(handoff.recommendations)
    ? handoff.recommendations.filter(x => x && x.recommendation === 'RESEARCH_ONLY' && x.not_executable === true)
      .slice(0, 8).map(x => ({ id: String(x.id ?? ''), idea: String(x.idea ?? '').slice(0, 140), priority: String(x.priority ?? '') }))
    : [];
  return {
    schema: 'coinlive.v5.overlay.readonly.v1', source: 'MAKINE_CORE',
    state: stale ? 'STALE' : 'READ_ONLY_RESEARCH', readOnly: true, changesCoreSignals: false,
    canExecuteOrders: false, canWriteLedger: false, sameScanAsCoinlive: null,
    evidence: { repo: MAKINE_REPO, commit: head.sha, handoffSha256: crypto.createHash('sha256').update(raw).digest('hex'),
      basedOnCoinliveCommit: handoff.source_commit_sha, basedOnCoinliveScanId: handoff.source_scan_id ?? null,
      generatedAtUtc: handoff.generated_at_utc, ageMinutes: Number(ageMinutes.toFixed(2)),
      reportedSourceIntegrity: handoff.source_integrity, stateExplanation: stale ? 'MAKINE manuel raporu eski; yeni sinyale uygulanmaz' : 'Bağımsız araştırma; sinyale uygulanmaz' },
    recommendations, observations: [], noNewTradeCandidates: true
  };
}
