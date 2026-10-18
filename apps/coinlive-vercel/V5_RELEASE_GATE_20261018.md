# COIN.LIVE PRO 5.0 — Preview release gate (2026-10-18)

## Contract and protected production
- **Existing GitHub Pages**: https://onurqlp.github.io/coin-live-pro/ (not changed).
- **Existing product version**: `4.03` (not changed in `main`).
- **V5 code**: isolated `apps/coinlive-vercel` on feature branch `preview/coinlive-v5-vercel-20261018`; draft PR #29, **not merged**.
- **New staging**: https://coinlive-v5-preview-d6v8cetce-onurqlp-7179.vercel.app/ deployment `dpl_3pG8MzfXrDbzBNqFVmgdRGJAnmWi`, status **READY**, target **staging** (not the existing site's production).
- **Fallback staging**: `dpl_s6TTQ5qcMXPTVtXcpqqTdQmMppP9` (before CSP additions).
- No Python engine or V4 10k portfolio mutation; no Spark account merge, ledger backfill, strategy rewrite or real-order route.

## Actual tests (source: GitHub Actions run 39109853462)
- GitHub Python source validation and tests: PASS.
- V5 Node unit/contract tests: **23 passed, 0 failed**.
- V5 syntax lint and CSP/Permissions Policy checks: PASS.
- Chromium headless UI: **360/390/768/1366 px**, radar, chart canvas, stage navigation, result windows, account labels, MAKINE stale state, horizontal overflow: PASS using **synthetic** API fixture.
- PWA PNG 192/512 decode, cached shell offline and fail-closed signals while offline: PASS under Chromium locally in CI, not evidence of an Android installed-PWA prompt.
- **Real source API smoke (not synthetic; runs handlers in GitHub Actions, NOT inside Vercel)**:
  - Snapshot `200`, ~884 ms in CI. Source commit `492c03a0eafd4f2964a19f9d17b56d54de9c9f4c`; scan ID `b15988225889bb083af7cada`; OKX scan 2026-10-18 07:59:41.619 UTC, **23 / 23 verified**, `VERIFIED`.
  - BTCUSDT 1H chart `200`, ~316 ms in CI, **60 closed bars**, matching same source scan ID, blob+manifest verified.
  - MAKINE read-only overlay `200`, ~295 ms in CI but `STALE` (1047 minutes old); **does not create trading signals**.
  - Illegal POST to snapshot `405`; no exchange order available.
- Underlying Spark cohort observed in preceding audit: 649 tickets, 465 closed, 162 positive, 303 negative, **-16.74531 USDT** paper-cohort realized; NOT the strict account profit, not an actual investment return.
- 7/14/30/90 day research is sample-insufficient; no verified 3D/7D outcomes.

## Still blocked / unverified
1. **Vercel protected hosted HTTP**: deployment-protection/connection checks returned **403** for the requested staging scope `onurqlp-7179`; runtime log and hosted `/api/snapshot`, `/api/chart`, `/api/overlay` round-trip/latency and cross-device actual Android installation remain **UNVERIFIED**. Vercel `READY` means build, not successful hosted HTTP.
2. **Actual push notifications**: backend VAPID/subscription storage and delivery are **not connected**. App does not claim to deliver background pushes.
3. **MAKINE refresh**: deliberately manual and independently governed; its old handoff is safely marked stale and never used as a fresh signal.
4. No production promotion or removal of SSO; require user's explicit production approval.

## To finish protected hosted tests
User must authorize the correct Vercel connected scope `onurqlp-7179` for the `coinlive-v5-preview` project. Do not disable deployment protection or request access tokens in chat. Then run GET checks against the *exact* staging URL using `vercel curl` or connected Vercel authenticated fetch, inspect actual API responses/logs, verify Android installation on-device, and only then consider approval for any production cutover.

## Rollback
If staging has a runtime defect, stop using `dpl_3pG8MzfXrDbzBNqFVmgdRGJAnmWi` and return to `dpl_s6TTQ5qcMXPTVtXcpqqTdQmMppP9` **only within the independent preview project**. Never alter the GitHub Pages domain, original release.json, Python motors, or historical cash/ledger records.
