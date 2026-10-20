# TURAN CORE — Operator handoff (2026-10-21)

## Published
- Dedicated UI: https://onurqlp.github.io/coin-live-pro/uzayx/turan/
- UzayX entry: https://onurqlp.github.io/coin-live-pro/uzayx/
- Repository: onurqlp/coin-live-pro (unchanged)
- Google Sheets and Apps Script: not modified

## Pipeline
1. The pre-existing .github/workflows/market.yml runs a 5-minute best-effort market scan, no guaranteed uptime.
2. engine/uzayx_strategy_bank.py evaluates 200 roles; unavailable sources remain blocked.
3. Forward research and paper reports are produced by existing independent engines.
4. engine/turan_core.py checks the aligned V4 scan, indexes archive evidence and writes web/data/turan-core.json.
5. The same worker appends one immutable journal record per scan ID in archive/turan-core-journal.jsonl.
6. The existing market workflow commits those files and deploys the web directory to GitHub Pages.
7. Dedicated UI shows command center, 230 strategy identities, evidence cases, learning summary and source coverage.

## Evidence boundaries
- 53 implemented entry experiments are not independently profitable validated strategies.
- 114 source-dependent hypotheses remain blocked; 33 controls do not represent entry signals.
- 30 legacy identities are separate historical/research entries, not additional validated winners.
- Historical directional moves are NOT executable net cash PNL.
- Paper cash figures only show ledger-attributable virtual results; funding/liquidation gaps remain disclosed.
- Learning model remains shadow research; it does not mutate the live trade policy.
- Binance historical coverage is partial and clearly labeled.

## Verification paths
- CI: .github/workflows/uzayx-site-smoke.yml
- Browser test: tests/turan-browser-smoke.cjs (mobile 390px and desktop 1440px)
- Market: .github/workflows/market.yml
- Journal: archive/turan-core-journal.jsonl
- Sources: web/data/uzayx-strategy-bank.json, web/data/uzayx-adaptive.json, web/data/uzayx-pnl-report.json, archive/uzayx-research-ledger.json

## Future optional infrastructure
- Continuous sub-minute orderbook/trade streaming requires an always-on process beyond GitHub Actions.
- Expand durable source coverage for tick/LOB, funding, OI and delisted contracts.
- Add independently audited fill replay and chronological OOS testing before policy promotion.
- Expand events with as-of timestamps and durable time-series storage.

## Unchanged by this release
- Google Apps Script, Google Sheets, existing triggers.
- All legacy paper/cash ledgers, cash balances, trade rights, and strategy execution controls.
- MAKINE and ALTI research repositories.
