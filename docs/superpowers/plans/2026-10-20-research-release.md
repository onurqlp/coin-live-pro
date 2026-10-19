# UzayX research release implementation plan

**Goal:** Implement the approved research report's measurement, risk visibility and refresh priorities without rewriting any historical outcome.
**Architecture:** New native Spark tickets get their true rule identity, never a guessed TURAN label. An isolated research ledger observes seven explicitly versioned TURAN hypotheses and 1H/4H/24H/3D/7D future price outcomes. A single source-pinned dashboard shows attribution, portfolio concentration and unknown costs.
**Spec:** Approved `UZAYX_Ileri_ARGE_ve_Gelisim_Plani_2026-10-20.pdf`, sections 3-11.
**Execution:** Inline; user explicitly prohibits subagents and authorizes implementation/publication without another approval.
**Tech stack:** Existing Python standard library and vanilla JS/CSS; no new product dependencies or paid service.

## Constraints and rulings
- Preserve ledger IDs, birth features, old sizes, old risk policy and cash history. New identities apply only at creation.
- Spark native rules and T001-T200 are different systems. Unknown historical attribution stays unknown.
- New leverage ceiling is 20x; new entry stop-distance plus modeled costs cannot exceed initial margin. Exact liquidation and funding remain unknown.
- Research hypotheses are observations, never executed trades or cash profits. Existing 24H cash policy stays separate from 3D/7D observations.
- Binance environment returns 451: preserve OKX provenance, never pretend Binance execution.
- Test only affected functionality and critical persistence; do not add broad security scans.

## Review focus
- Idempotent replay, source scan mismatch, incomplete OHLC, stale/future timestamps and interrupted network.
- New families must have frozen version/config and immutable birth events; same source candle must not duplicate.
- Portfolio totals must come from the complete ledger, not a truncated recent sample.
- Missing evidence must be null/blocked, never zero profit or a guessed rule ID.
- Public source commit must preserve concurrent automated data commits.

## Tasks
- [x] Add failing tests for prospective identity, 20x ceiling, invalid stop budget and historical preservation; implement in `engine/v4_spark_paper.py`.
- [x] Add failing tests for isolated, idempotent seven-family research observations, future horizons, scan validation and complete-ledger reconciliation; implement `engine/uzayx_research.py` and wire existing market workflow.
- [x] Add dashboard `web/uzayx/research-desk.js` / CSS, source-pinned feed, provenance, attribution and portfolio panels; repair timeout/recovery/foreground refresh in `app.js`.
- [x] Run targeted Python/Node tests and browser checks at phone/desktop sizes, including offline expiry/recovery. Review diff inline.
- [ ] Publish one lease-protected commit based on latest main, verify Actions and public page/assets/feed. Mark unavailable long horizons honestly.
