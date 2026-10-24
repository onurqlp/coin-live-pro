# UZAYX 4.09 evidence implementation plan

Goal: complete forward attribution and isolated equal-condition TURAN experiments under the user's 25 October GO specification.
Architecture: preserve existing cash rules and archives. Add source-linked identity fields at signal birth, copy them to new paper tickets, conservatively audit historical attribution, and maintain a separate prospective experiment ledger. Unknown funding and liquidation prevent complete-net-profit claims. Existing shared OHLCV metrics remain shared.

- [x] Test and implement strategy/signal/evaluation/snapshot/time lineage; retain historical born-rule attribution separately from full-chain proof.
- [x] Test and implement immutable per-closed-bar episodes, all four research arms and 200-family summaries. Independent modeled fills only on subsequently closed 5m bars; stop-first ambiguity and missing intervals fail closed. Separate modeled cost-adjusted result from unknown complete net PnL.
- [x] Integrate experiment and attribution evidence into the same-scan TURAN learning panel and automated workflow. No cash, Google, real-order or research-policy promotion changes.
- [ ] Run narrow accounting, identity, idempotency, timing and UI regressions; inspect diff; publish 4.09 to existing GitHub Pages production and verify actual source SHA, release and data.

Review focus: repeated cycles on the same pump; future/unclosed or missing candles; duplicate ledger credit; unsupported historical reconstruction; unknown execution costs. The attached GO authorizes implementation and production release without another approval step.

Independent review: one Important finding fixed with RED→GREEN regression: midnight retry now buckets cycles by immutable source day. Targeted validation: 31 TURAN, 5 PnL, 17 spark-paper, 10 strategy-cash and 6 JS checks pass. Original 200 rule hashes match the published source registry. Deployment remains pending until verified.
