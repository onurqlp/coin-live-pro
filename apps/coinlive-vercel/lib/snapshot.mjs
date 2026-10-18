import crypto from 'node:crypto';

export const REPO = 'onurqlp/coin-live-pro';
export const APP_VERSION = '5.0.0-preview';
export const MAX_SCAN_AGE_MINUTES = 20;
const required = ['v4-radar', 'v4-paper', 'v4-spark-paper', 'v4-spark-review', 'v4-forward', 'v4-lab', 'v4-early', 'v4-history-index', 'health'];
const sha40 = /^[a-f0-9]{40}$/;
const sha64 = /^[a-f0-9]{64}$/;
const headers = { 'user-agent': 'CoinLive-V5-ReadOnly-Preview', accept: 'application/vnd.github+json' };
export class SourceError extends Error {
  constructor(code, message, status = 503) { super(message); this.name = 'SourceError'; this.code = code; this.status = status; }
}
export async function fetchText(url, fetcher = fetch, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { cache: 'no-store', headers, signal: controller.signal });
    if (!response.ok) throw new SourceError('SOURCE_UNAVAILABLE', `Kaynak HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError('SOURCE_UNAVAILABLE', `Kaynak erişilemedi: ${error.name || 'NETWORK'}`);
  } finally { clearTimeout(timeout); }
}
function parse(text, name) {
  try { return JSON.parse(text); } catch { throw new SourceError('INVALID_JSON', `${name} geçersiz JSON`); }
}
function digest(raw) { return crypto.createHash('sha256').update(Buffer.from(raw, 'utf8')).digest('hex'); }
const number = x => typeof x === 'number' && Number.isFinite(x) ? x : null;
const dateMs = x => typeof x === 'string' && Number.isFinite(Date.parse(x)) ? Date.parse(x) : null;

export function normalizeCandidate(x, stage) {
  const review = x.review_state ?? 'UNKNOWN';
  return {
    id: x.setup_id ?? null, symbol: x.symbol ?? null, side: x.side ?? null,
    stage, strategy: x.strategy_id ?? null, score: number(x.score), riskScore: number(x.risk_score),
    reviewState: review, confirmation: x.confirmation_state ?? 'UNKNOWN',
    observedAtUtc: x.last_evaluated_at ?? null, evidenceAtUtc: x.last_evidence_at ?? null,
    price: number(x.price), stop: number(x.stop), targets: Array.isArray(x.targets) ? x.targets.filter(y => Number.isFinite(y)).slice(0, 3) : [],
    reasons: Array.isArray(x.reasons) ? x.reasons.slice(0, 5).map(String) : [],
    paperEligible: review === 'FRESH' && x.paper_entry_state === 'ELIGIBLE'
  };
}

export async function loadSnapshot({ fetcher = fetch, now = Date.now() } = {}) {
  const commitResult = parse(await fetchText(`https://api.github.com/repos/${REPO}/commits/main`, fetcher), 'commit');
  const commit = commitResult.sha;
  if (typeof commit !== 'string' || !sha40.test(commit)) throw new SourceError('INVALID_COMMIT', 'Git commit doğrulanamadı');
  const base = `https://raw.githubusercontent.com/${REPO}/${commit}/web/data`;
  const manifest = parse(await fetchText(`${base}/v4-manifest.json`, fetcher), 'manifest');
  if (manifest.publication_valid !== true || manifest.no_real_orders !== true || !manifest.scan_id || !manifest.sources)
    throw new SourceError('INVALID_MANIFEST', 'Geçersiz yayın manifesti');
  for (const name of required) {
    const entry = manifest.sources[name];
    if (!entry || !sha64.test(entry.sha256 ?? '') || !Number.isSafeInteger(entry.bytes) || entry.bytes < 2)
      throw new SourceError('INVALID_MANIFEST', `${name} manifest kanıtı bulunamadı`);
  }
  const data = Object.fromEntries(await Promise.all(required.map(async name => {
    const raw = await fetchText(`${base}/${name}.json`, fetcher);
    const entry = manifest.sources[name];
    if (Buffer.byteLength(raw, 'utf8') !== entry.bytes || digest(raw) !== entry.sha256)
      throw new SourceError('SOURCE_HASH_MISMATCH', `${name} kaynak hash uyuşmuyor`);
    const value = parse(raw, name);
    if (value.scan_id && value.scan_id !== manifest.scan_id)
      throw new SourceError('MIXED_SCAN_ID', `${name} farklı scan_id içeriyor`);
    return [name, value];
  })));
  const finished = dateMs(manifest.finished_at_utc);
  if (finished === null || finished > now + 120_000) throw new SourceError('INVALID_TIMESTAMP', 'İleri tarihli veya bozuk UTC tarama zamanı');
  const ageMinutes = (now - finished) / 60_000;
  const stale = ageMinutes > MAX_SCAN_AGE_MINUTES;
  const radar = data['v4-radar'];
  const paper = data['v4-paper'];
  const spark = data['v4-spark-paper'];
  const review = data['v4-spark-review'];
  const forward = data['v4-forward'];
  const lab = data['v4-lab'];
  const early = data['v4-early'];
  const history = data['v4-history-index'];
  const health = data.health;
  if (paper.starting_balance_usdt !== 10000 || paper.account_id !== 'COINLIVE-V4-PAPER-10K' ||
      spark.starting_balance_usdt !== 10000 || spark.combined_with_strict_paper_cash !== false ||
      paper.no_real_orders !== true || spark.no_real_orders !== true)
    throw new SourceError('ACCOUNT_INVARIANT_FAILED', 'Ana ve deneysel sanal kasalar ayrı doğrulanamadı');
  const groups = [['spotlight','SPOTLIGHT'],['motion','MOTION'],['watch','WATCH']];
  const allCandidates = groups.flatMap(([key, label]) => (Array.isArray(radar[key]) ? radar[key] : []).map(x => normalizeCandidate(x, label)));
  const current = stale ? [] : allCandidates.filter(x => x.reviewState === 'FRESH' && x.symbol && x.id);
  const pending = allCandidates.filter(x => x.reviewState !== 'FRESH').length;
  const all = review.cohorts?.['TÜMÜ'] ?? null;
  const geldi = review.cohorts?.['GELDI_OTOMATIK_GIRIS'] ?? null;
  const nums = obj => obj ? Object.fromEntries(Object.entries(obj).filter(([k])=> ['all','open','closed','positive','negative','realized_total_usdt','evidence_sufficient_for_comparison'].includes(k))) : null;
  const periods = Array.isArray(lab.periods) ? lab.periods.filter(x => [7,14,30,90].includes(x.days)).map(x => ({
    days: x.days, quality: x.sample_quality ?? 'UNKNOWN', paper: x.paper || null,
    strategies: Object.fromEntries(Object.entries(x.strategies ?? {}).map(([id, y]) => [id, {
      discovered: y.discovered, entryEligible: y.entry_eligible,
      signalSuccessRate: y.signal_success_rate,
      horizons: Object.fromEntries(['1H','4H','24H','3D','7D'].map(tf => [tf, y.forward_horizons?.[tf] ?? null]))
    }]))
  })) : [];
  return {
    schema: 'coinlive.v5.readonly.v1', appVersion: APP_VERSION, sourceProductVersion: '4.03',
    source: { repo: REPO, commit, scanId: manifest.scan_id, observedAtUtc: manifest.finished_at_utc,
      trigger: manifest.trigger ?? 'UNKNOWN', provider: manifest.provider ?? 'UNKNOWN',
      ageMinutes: Number(ageMinutes.toFixed(2)), status: stale ? 'STALE' : 'VERIFIED',
      healthStatus: health.status ?? 'UNKNOWN', scheduledRunsObserved: number(health.observed_real_scheduled_runs),
      testedPairs: number(manifest.candidate_counts?.verified), attemptedPairs: number(manifest.candidate_counts?.attempted),
      healthLegacyScanId: health.last_scan_id ?? null, manifestVerified: true, payloadShaVerified: true,
      unscopedSources: required.filter(name => !data[name].scan_id) },
    safety: { noRealOrders: true, noTradingAdvice: true, notWinProbability: true, paperNotRealMoney: true, stale,
      fundingState: paper.funding_state ?? 'UNKNOWN', strictPaperSeparated: true, noBackfill: true },
    radar: { count: current.length, candidates: current.slice(0, 100), pendingCount: pending,
      unconfirmedCount: allCandidates.length - pending, counts: radar.counts ?? {},
      early: stale ? [] : (Array.isArray(early.candidates) ? early.candidates.slice(0, 12).map(x => ({
        symbol: x.symbol, side: x.side, tier: x.research_tier, rank: x.research_rank,
        price: number(x.price_at_scan), observedAtUtc: x.source_observed_at_utc,
        notPaperEntry: true
      })) : []), archiveCount: number(history.archived_total) },
    paper: { accountId: paper.account_id, startingBalanceUsdt: number(paper.starting_balance_usdt),
      equityUsdt: number(paper.equity_usdt), realizedUsdt: number(paper.realized_pnl_usdt),
      unrealizedUsdt: number(paper.unrealized_pnl_usdt), feesUsdt: number(paper.fees_paid_usdt),
      openCount: Array.isArray(paper.open_positions) ? paper.open_positions.length : null, fundingState: paper.funding_state ?? 'UNKNOWN' },
    experimental: { startingBalanceUsdt: number(spark.starting_balance_usdt),
      estimatedEquityUsdt: number(spark.summary?.virtual_equity_usdt),
      accountingRealizedUsdt: number(spark.summary?.realized_net_usdt),
      accountingUnrealizedUsdt: number(spark.summary?.unrealized_net_usdt),
      feesUsdt: number(spark.summary?.estimated_fees_usdt), countByStatus: spark.summary?.counts || {},
      reviewAll: nums(all), reviewGeldi: nums(geldi),
      note: 'Kohort toplamı ile deneysel muhasebe P&L farklı metriklerdir; birleştirilmez.',
      fundingState: spark.daily?.funding_state ?? 'UNMODELED' },
    forward: { observations: number(forward.observations), results: Array.isArray(forward.results) ? forward.results.slice(0, 25).map(x => ({
      id: x.setup_id, symbol: x.symbol, side: x.side, observedAtUtc: x.observed_at_utc,
      horizons: Object.fromEntries(['1H','4H','24H','3D','7D'].map(tf => [tf, x.horizons?.[tf] ?? null]))
    })) : [], periods },
    system: { archivePreserved: true, sourceScanDiscrepancyExpected: !!health.last_scan_id && health.last_scan_id !== manifest.scan_id,
      noCredentialsIncluded: true }
  };
}
