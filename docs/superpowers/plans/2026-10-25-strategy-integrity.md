# TURAN Strategy Integrity and Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the approved Ar-Ge report, seek reproducible modeled PnL across original/inverse/wait hypotheses, and publish the verified site without fabricating results.

**Architecture:** One canonical versioned OHLC rule engine feeds live research and historical replay. Persistent experiment candle recovery and paired cohort reports close the evidence loop. Existing cash policies and ledgers remain intact; the UI reports learning versus baseline and distinguishes research from shared capital.

**Tech Stack:** Python stdlib, existing JS/CSS/HTML, GitHub Actions/Pages.

**Spec:** docs/audits/2026-10-25-strategy-arge.md (user approved implementation and live publication in current turn).

## Global Constraints
- Preserve historical IDs, rule versions, timestamps, cash ledgers and previous experiments; no retrospective relabeling.
- No fabricated OHLC, fills, predictions, probability, funding, liquidation or PnL. Unknown complete net remains null.
- Keep TURAN200_ONLY and 200 catalog records; blocked 114 hypotheses stay blocked until their required source exists.
- No real orders, credential changes, leverage increase or Google changes. Historical tests do not earn automatic cash promotion.
- Keep existing public paths and schemas compatible through additive fields; new rule behavior gets a new version/hash.
- Publish source, then observe successful data refresh/deployment and HTTP endpoints. Preserve concurrent automated commits.

## Review Focus
- Two directions from one coin must retain the same complete source frames and unique identities.
- Legacy v1 observations cannot be counted as v2 results even when strategy IDs match.
- Candle recovery must only accept closed chronological bars and never jump missing intervals.
- Paired comparisons must exclude unavailable arms without deleting them from coverage denominators, and must not sum research arms as cash equity.
- Historical replay must compute features using only fully closed bars available at decision time and leave outcomes unknown when future coverage is absent.

### Task 1: Canonical versioned rules and two-direction evaluation
Files: engine/turan_rules.py (new), uzayx_strategy_bank.py, uzayx_research.py, turan_core.py, config/uzayx-strategy-policy.json; tests/test_turan_rule_integrity.py.
Interfaces: canonical metrics(candidate, rows, btc, market_moves, side), matches(conditions, metrics); bank build retains existing output, adds direction_evaluation and semantic hashes. research observe accepts optional bank_feed and records canonical signals with exact version/hash. core filters current observations and exposes legacy cohorts separately.
- [ ] Write and run failing tests for T154 failed-up -> SHORT and failed-down -> LONG, both-side evaluation with shared frames, and legacy-version isolation.
- [ ] Extract canonical implementation, fix reversal semantics, version to turan200-20261025-v2; mark duplicate rule equivalence rather than independent votes.
- [ ] Route prospective research through the canonical bank feed, preserve old detector for historical compatibility, fix native-only account grouping.
- [ ] Run affected suites, commit task.

### Task 2: Persistent experiment sources and fair paired/versioned results
Files: engine/turan_candles.py (new), turan_experiments.py, .github/workflows/market.yml; tests/test_turan_candle_recovery.py and test_turan_paired_results.py.
Interfaces: collect(prior, pack, now, root, fetch=None, budget=24) returns closed candle pack plus recovery diagnostics; report_results(experiments) returns per-version paired original/inverse/wait/no-trade cohorts, coverage, clusters and candidate-only rankings.
- [ ] Failing tests for a rotated-out coin recovering a missing closed bar without replacing birth data, rejecting conflicting/unclosed candles, and paired totals excluding a missing arm while preserving denominators.
- [ ] Cache verified candles per coin, prioritize unresolved experiments, bounded OKX history-candles recovery from each arm cursor, persist provenance and gaps. Preserve legacy source only when missing, never synthesize candles.
- [ ] Add paired original/inverse and original/wait results grouped by immutable version/rules/exchange/policy; keep totals explicitly non-portfolio and unknown full net null.
- [ ] Integrate source recovery before advance, persist cache with market workflow; run tests and commit.

### Task 3: Measure learning against reference forecasts
Files: engine/uzayx_adaptive.py, turan_core.py; tests/test_turan_learning_baseline.py.
Interfaces: forecast_quality(forecasts) returns paired count, model MAE, zero baseline MAE, MAE skill, per-version cohorts, unavailable count; all additive.
- [ ] Fail on model worse than zero being reported without comparison; missing forecasts not silently added to valid denominator; version/policy cohorts separated.
- [ ] Publish paired baseline and forecast quality, carry into core; do not automatically promote on the new diagnostic.
- [ ] Run tests and commit.

### Task 4: Canonical historical OHLC replay and bounded automatic research
Files: engine/turan_replay.py (new), .github/workflows/uzayx-binance-research.yml, tests/test_turan_replay.py.
Interfaces: replay_symbol(rows, symbol, market, source_hash) uses canonical rules and closed H1/H4/D1 features; report emits all 200 strategy roles with explicit unavailable sources, original/inverse/wait modeled costs and split discovery/holdout, source gaps and drawdown diagnostics. No live cash writes.
- [ ] Fail on future candle leakage, reversal direction mismatch, absent exit data, duplicate canonical rules counted as independent votes and failed source checksum.
- [ ] Use verified Binance archived USDT perpetual hourly data; bounded deterministic subset per run plus checkpoint, separate exchange and split. Share rule engine and execution assumptions, retain unavailable cross-market features as blocked.
- [ ] Persist public replay report and provenance, schedule alongside archive collection. Run against available verified files and publish actual results, not artificial trades.
- [ ] Run tests and commit.

### Task 5: Dynamic UI, integration, review and live publication
Files: web/uzayx/turan/turan.js/css/index.html, existing release/service-worker, tests/turan*.cjs, workflow files as necessary.
Interfaces: core adds learning_quality, replay summary and paired experiment cohorts consumed in progressive UI cards/table; absent optional reports display unavailable rather than zero.
- [ ] Add behavior tests for baseline comparison and original/inverse paired view; implement responsive rendered report including evidence age, version and source gaps.
- [ ] Bump product to 4.10, keep paths/logo/navigation. Include new data in immutable pinned fetch flow.
- [ ] Run Python suite, JS suites, browser desktop/mobile; refresh actual reports with source provenance.
- [ ] Obtain one fresh whole-diff review, resolve significant findings, merge/publish user-authorized change and observe fresh data/deploy/HTTP results.
