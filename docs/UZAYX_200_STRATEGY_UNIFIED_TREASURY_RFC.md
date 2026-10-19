# UZAYX — 200+ Strategy / Unified Virtual Treasury RFC
Status: STAGING ONLY — no main merge, deployment, APK release or live orders. Date: 2026-10-20.

## Product contract
One shared strategy outcome bus powers radar, bubble/map, signals, virtual fills, open positions, cash and mobile web/PWA/APK. TURAN Top30 and existing V4/MAKINE/ALTI strategy streams are adapters, not replaced wholesale. Support 200+ registry rows, but do not report 200 verified strategies without source evidence. Strategy registration requires id/version, data dependencies, venue/symbol/timeframe, directions, lookback, fee assumptions, validation windows, confidence diagnostics and eligibility.

## Required outcomes for every candidate
candidate_id, strategy_id, version, symbol, venue, decision_at_utc, observed_at_utc, evidence_refs, features_snapshot, side, entry_rule, intended_entry, fill_rule, stop, target, expiry, rejection_reason, status.
Status: DETECTED -> ELIGIBLE -> VIRTUAL_PENDING -> FILLED -> PARTIALLY_CLOSED/CLOSED, or REJECTED/EXPIRED/NO_DATA.
Store historical retrospective simulations separately from forward-observed real-time virtual trades. No hindsight-based fills, signals or profitable trade attribution. For historical events with no published signal, create retrospective candidate with retrospective=true; it must never be included in forward performance.

## Strategy scoring (not just gross win rate)
Walk-forward test, fixed point-in-time universe, realistic delistings, stale quote checks, out-of-sample partitions, opportunity cost, max drawdown, downside tail, liquidity/slippage, correlation overlap, fee+funding net expectancy and risk capacity. Use conservative ordering on tie/conflicts. Label estimates; no guaranteed profit.
Before qualifying strategy for allocation: verified point-in-time data, 30+ independently closed forward virtual tickets for performance claims, calibration and evidence for expected edge. For small sample report UNPROVEN.

## Shared treasury
Double-entry append-only ledger with dedup key (venue,symbol,side,decision_at,strategy_version), position lifecycle, audit timestamp, quote timestamp, mark-price age, reconciled cash.
Dashboard fields: total_equity, available_balance, locked_margin, gross_notional_exposure, realized_pnl_net, unrealized_pnl_net, fees_paid, funding_net, open_order_reserves, open_positions_count, liquidation_estimate_when_valid.
Position fields: position_id, venue, symbol, side, leverage, entry_vwap, mark_price, contract_size, quantity, isolated_or_cross, margin, notional, liquidation_estimate, open_at, holding_duration, stop, take_profit, trailing_stop, fees_open, fees_est_close, funding_pnl, slippage, pnl_unrealized, roi_on_margin, confidence, strategies_supporting, data_quality, next_action. Explain estimated liquidation depends on venue risk tiers/maintenance rules.
No cash investment decisions from raw bubble size; bubble encodes opportunity rank and net risk-adjusted strategy support. Global budget, per-symbol cap, correlated exposure cap, drawdown circuit breaker, kill switch, margin reserve. No exchange trading permissions by default.

## Historical counterfactual engine
For any timestamped event, reconstruct ONLY candles/order-book snapshots that were available at that timestamp. Use subsequent bars only for replay exits, never for entry decision. Define entry time, latency, maker/taker fill assumptions, fee tier, funding settlement, slippage and stop-first policy for same-bar hit ambiguity. Keep cases where entry never filled, trade stayed open, or source lacked proof.
Report (separately): issued signals, eligible setups with no signal, simulated fills, unfilled orders, realized net historical PNL, open-position mark-to-market, maximum adverse/favorable excursion, exposure and drawdown, survivors/delistings. Do not collapse historical backtests, shadow forward paper and actual exchange fills into one number.

## Manipulation intelligence
Event-scoped indicators: abnormal volume/turnover, open-interest acceleration, funding skew, liquidations, spot-perp basis, order-book imbalance/spoof-risk proxy, abrupt social/news mentions, exchange announcements, listing/delisting, large transfers (when provenance available), rapid spikes and retraces. Never definitively allege manipulation from price movements alone. Tag source, timestamp and confidence.
Ingestion: exchange market data, curated news/RSS and provenance-aware external signals. Each source has received_at and effective_at, TTL, status, lag and fallback. Archive raw event IDs and URL metadata for reproducibility; avoid claims of exhaustive real-time coverage.

## Interface
Mobile-first primary navigation: RADAR, STRATEJİLER, KASA, İŞLEMLER, ARŞİV. Home always shows available cash, margin in use, gross notional, open trades, unrealized and realized PNL, warning on stale marks; live and replay data never visually confused. Position details Binance-style expandable card. Full open positions on home with filters and drilldown. No horizontal overflow at 360px.
Use shared responsive web data/PWA/API for Android APK wrapper, not a separate business logic fork. APK updates content and strategies from versioned API automatically, but native shell changes may require distributing a new APK. Cache with offline stale badges.

## Incremental delivery acceptance tests
1. Ledger conservation and restart/restore replay; duplicate signal no double debit; deterministic order fills.
2. Historical backtest point-in-time leakage checks and backtest/forward segregation.
3. Exposure, collateral, drawdown, stop/funding/fee and liquidation model tests.
4. Mobile snapshots 360/390/768/1440, accessibility, positions always visible.
5. Ingestion timestamps/source freshness and no-data fail-closed.
6. End-to-end web-PWA-APK same ids/positions; no hidden local-only balances.
7. Existing V4/MAKINE/ALTI integrations continue working; no modification to live ledger without migration and restore.
8. A release only after explicit user GO; stage preview before GO.

## Delivery order
Phase A: inventory current 30/7 strategies and data contracts, sample ledger snapshot and backups.
Phase B: evidence-driven 200+ strategy registry + historical research replay (no future leakage).
Phase C: shared virtual treasury, open positions and unified signal/bubble ranking.
Phase D: news/manipulation freshness pipeline and monitoring.
Phase E: responsive mobile/PWA/APK shared logic and smoke tests.
Phase F: user GO -> reviewed merge/deploy. Never silently enable real orders.
