# COIN.LIVE PRO V4 BETA — implementation evidence (2026-10-16)

Production URL remains https://onurqlp.github.io/coin-live-pro/
GitHub feature branch: v4-lifecycle-desk-20261016 (created from main 6efa60ae84515a2cd10b9e5be7fa27c6324a5b0f)
Legacy 100 USDT paper ledger remains independent; 10,000 USDT starts fresh.

## Implemented and unit tested

- Phase 0/1: PR #2 verified fair hot-pool recheck and main-only workflow push guard, without rewriting live Git data archives.
- Phase 2: event sourced WATCH/MOTION/SPOTLIGHT with no same-tick jump, stable setup and event IDs, separate lifecycle/review/confirmation/paper states; fail closed on missing source.
- Phase 3: seven named closed-data *research detectors*. IMPORTANT: BREAKOUT_RETEST is discovery-only until a true consecutive-bar retest sequence is implemented; REVERSAL, OI and SHORT_BREAKDOWN are research-only for paper purposes. Strict TREND_BREAKOUT is the only initial V4 entry-capable strategy. Do not market these as seven fully performance-validated trading systems.
- Phase 4: OI 5-minute/1-hour/4-hour timestamped delta windows, actual snapshot checks. A single observation is UNKNOWN. Top-5 orderbook in V3.1 remains only an indicative risk snapshot, NOT spoof proof.
- Phase 5: new V4 isolated 10,000-USDT cash/margin ledger, market-intent → next full closed 5m hypothetical fill, verified contract lot spec, example fees/slip and partial 1R/2R/3R exits. Reverse sign, gap, no-fill and ambiguous stops tested. Historical funding and actual liquidation mark/margin schedules remain unknown and are labelled so. The V3 100-USDT pilot continues in a separate archive.
- Phase 5 (shadow): separate attempts and results, never a total V4 cash account.
- Phase 6 (initial): three separate radar sections and paper positions + SAME native OHLC chart with stop/TP overlay; responsive CSS and 320/390/1366 Chromium screenshots. Legacy V3 six tabs preserved.
- Phase 7 (initial): forward-only 7/14/30/90 per-strategy event counts, separate paper/shadow stats with 'insufficient sample'. V4 dedicated MFE/MAE time horizon comparisons are NOT implemented yet.
- Data: 9 source JSON SHA-256 hashes in v4-manifest, one scan_id, stale checks, fail closed, private exchange keys not used.
- Pipeline: branch-only read-only live rehearsal; main-only production trigger; GitHub cron remains best effort.

## Evidence

- Main branch original baseline before first feature branch: 6efa60ae84515a2cd10b9e5be7fa27c6324a5b0f (rolling data commits after this point can and will advance main).
- Successful integration/unit tests on feature branch: https://github.com/onurqlp/coin-live-pro/actions/runs/38951401514
- Real OKX isolated preview successful: https://github.com/onurqlp/coin-live-pro/actions/runs/38951635193
- Desktop/mobile captured artifact: https://github.com/onurqlp/coin-live-pro/actions/runs/38951635193/artifacts/12067843591
- Source factual rehearsal: 100 quote pairs, 23 OI snapshots, 2 initial WATCH research observations, 0 MOTION, 0 SPOTLIGHT, V4 10,000 USDT equity, 0 fills. These observations are *NOT* actual financial performance.

## Remaining blockers before V4 final (not a PASS)

1. Consecutive-candle BREAKOUT_RETEST and verifiable RSI divergence reconstruction for dedicated advanced engines. Current explicitly labelled early research detectors must not be represented as complete.
2. A fully audited funding-at-settlement replay, maintenance/liquidation assumptions, normalized instrument precision and mark-price backfill. Current 10k PnL is fee/slip-adjusted but funding UNKNOWN.
3. 1H/4H/24H/3d/7d forward MFE/MAE, transition latency, missed entry, strategy walk-forward holdout and real closed results. A 0-signal lab cannot claim win rates.
4. Full 320/360/390/430/768/1024/1366/1920 visual acceptance and accessible interaction/overflow metrics. Preview artifacts cover 320, 390, 1366 only.
5. 5-minute unattended clock over a 24h uninterrupted period not yet independently proven. Neither GitHub schedule nor Google heartbeat is a hard SLA.
6. Full real-account risk/correlation/volatility-shock stress comparison. No real order execution, no alerts.

## Rollback
The feature branch never force-pushes main. Before production merge, record the then-current main commit (rolling data commits make the baseline above stale). Revert the code merge commit to disable V4 additions while keeping the current data archives. Never revert/force-push entire main to an earlier historical data commit, which would erase forward observations.
