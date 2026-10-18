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

## Hosted production-like preview verification — 2026-10-18 08:25 UTC (11:25 Türkiye)
**SSO access restored through the connected Vercel team; no protection was disabled.** Verified against immutable staging deployment `dpl_3pG8MzfXrDbzBNqFVmgdRGJAnmWi`.
- Live protected HTML `GET /` = HTTP **200**; page title identifies **V5.0 Preview**.
- Hosted `GET /api/snapshot` = HTTP **200** with source product version **4.03**, source integrity `VERIFIED`, source manifest verified, mandatory dataset payload SHA verified. A latest check at **08:24:53.222 UTC** pinned scan `33881f0fc9508309d6db048b`, **23/23** OKX pairs. **28 WATCH/research candidates, 0 paper-eligible**; no confirmed trade entries.
- Hosted `GET /api/chart?symbol=BTCUSDT&tf=1H&commit=<current-pinned-sha>` = HTTP **200**, **60** immutable-source verified closed bars. **4H XPLUSDT** = HTTP **200**, **60** verified closed bars, **2** archive markers. Source matches snapshot.
- Hosted chart wrong-but-well-formed SHA = HTTP **409** `SCAN_REFRESH_REQUIRED`; invalid symbol = HTTP **400** `BAD_CHART_PARAMETERS`; commit omitted = HTTP **400** `INVALID_COMMIT`. No fraudulent chart fallback.
- Hosted `GET /api/overlay` = HTTP **200**, `STALE`, read-only, empty recommendations, cannot mutate strategy or ledger; MAKINE manual source is not fresh market confirmation.
- Hosted `GET /manifest.webmanifest`, `/sw.js`, `/icon-192.png`, `/style.css` = HTTP **200**; `icon-512.png` and `app.js` are present in the ready Vercel deployment file tree and validated in Chromium CI, but the authenticated fetch gateway refused to return their bodies (gateway restriction, **not** a proven HTTP failure).
- API `cache-control: no-store`, CSP self-only, strict transport/security headers and SSO confirmed.
- Runtime logs became accessible: observed one **Node 24 DEP0169 url.parse deprecation warning** on `/api/chart` (runtime-level warning, not evidence of an application 5xx). No claim of an exhaustive zero-error period.
- Snapshot strict paper account remains **10,000 USDT, strict realized 0**, experiment equity observed **9,994.59234 USDT**, experiment accounting realized **-8.51272 USDT**. Spark review cohort `674 tickets / 470 closed / 163 positive / 307 negative / -17.52563 USDT` is a separate cohort metric. **No real orders and no ledger writes**.
- All V5 tests passed in GitHub Actions run `39110032410`: 23 Node contract tests, responsive synthetic Chromium, offline PWA, live external source test in Actions. Hosted authenticated GET tests above are additional independent evidence, **not** full Android-on-device testing or a full hosted browser E2E sweep.

## Remaining nonblocking scope / release gates
1. Android physical-device **installation prompt and notification permission** have not been manually tested; Chromium synthetic fixtures exercised PWA shell, offline cache and safe no-signal fallback.
2. Real background push **delivery** is not wired to a VAPID/subscription store; no claim of push alerts.
3. MAKINE CORE independently published research is old, correctly labeled `STALE` and ignored for actionable candidates.
4. GitHub market workflow reports `DEGRADED_SCHEDULE_GAP`; observed recent market executions were successful `workflow_dispatch`, which does **not** prove a guaranteed unattended five-minute cadence.
5. Production promotion needs **explicit user approval**. Do not merge draft PR #29 or change original GitHub Pages, product 4.03, engines, strategies, ledgers or original 10,000 USDT account.

## Rollback
If staging has a runtime defect, stop using `dpl_3pG8MzfXrDbzBNqFVmgdRGJAnmWi` and return to `dpl_s6TTQ5qcMXPTVtXcpqqTdQmMppP9` **only within the independent preview project**. Never alter the GitHub Pages domain, original release.json, Python motors, or historical cash/ledger records.
