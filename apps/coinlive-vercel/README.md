# COIN.LIVE PRO 5.0 — isolated preview

Source of truth: `onurqlp/coin-live-pro` production branch, **read only**. The production product release remains `4.03`; the independent UI is `5.0.0-preview`.

## Architecture

- `/api/snapshot`: Pin one Git commit; verify `v4-manifest.json`, mandatory SHA-256 and byte counts for nine JSON datasets; reject mixed scan ids and inconsistent account separation. At >20 min, keep historical account labels but suppress active opportunities.
- `/api/overlay`: optional MAKİNE CORE read-only handoff from pinned immutable source Git commit. Enforces no-order/no-ledger/no-policy-mutation flags and a 45-minute source TTL. Old reports are labeled STALE and cannot create current recommendations. Never changes original signal rankings or ledger, never invents pricing.
- `public/`: touch-friendly PWA shell, Radar, Chart/source explanation, two separate virtual accounts, 7/14/30/90-day observations and System provenance.
- Verified 1H/4H/1D OHLC chart endpoint: Git SHA-1 blob object checksum anchors `chart-pack.json` in immutable commit tree, while published V4 manifest SHA-256 anchors same-scan event history. Only completed bars allowed; no unverifiable price or external orders. Markers are archive events, NOT trades.
- Original Python engine and GitHub workflows are not touched. The only planned remote change is adding a new path on an isolated feature branch.

## Local verification

`npm test` and `npm run lint`; Node.js >=20. Browser responsive smoke checks use synthetic fixtures, not live trading data.

## Deployment

Target a **new independent Vercel project** with Project Root `apps/coinlive-vercel` (for Git branch) or package root (for ZIP). Choose isolated **staging/preview**, never repoint existing GitHub Pages. First-build default production happened only in independently SSO-protected Vercel project; this was disclosed, not cutover. Review SSO and preview visibility before sharing.

## Risks

- The original experiment's cohort sums do not equal accounting realized P&L; no automatic reconciliation is attempted.
- Funding remains unknown/unmodeled; no numeric zero substituted.
- `health.last_scan_id` belongs to a legacy scan identity; its difference from V4 manifest scan_id is labeled, not force-coerced.
- Historical forward windows only reflect data genuinely observed since start; insufficient 3D/7D samples remain empty.
- Vercel API route availability, remote latency, PWA install prompt, device/browser HTTP smoke tests and external MAKİNE integration still require separately authorized testing; build READY is not API success.

### Verified deployment status (2026-10-18)

Independent SSO-protected Vercel staging target is READY at https://coinlive-v5-preview-11xshbnbr-onurqlp-7179.vercel.app (deployment dpl_3LqY3pgEEjrFYH2qHQSwqoa2mrxu). A first-build default production target was automatically created *within this isolated protected Vercel project only*, without affecting original GitHub Pages. No cutover is approved. Hosted HTTP API response and Vercel logs are unverified because network access/log API was denied.

- Latest local validation: 16/16 Node unit tests and 4/4 Chromium chart/radar responsive checks.


## Continuation — 18 October 2026

- New isolated staging READY: https://coinlive-v5-preview-p3zhjlh5d-onurqlp-7179.vercel.app/ (`dpl_HJ5ta3j8eSRe8PWSUvyBaQJk3hnB`), deployed from verified feature branch source via 14 inline source files after `git_info_fail` with Git deployment.
- Three API lambdas are present in Vercel deployment tree. Vercel Authentication SSO currently blocks actual page/API fetch and logs (403), so no endpoint latency or public accessibility is claimed.
- MAKİNE source generated 17 October, which is stale under 45-minute policy as of today. Overlay returns STALE, not fresh verification.
- Local original starter ZIP: 6/6 tests. Local new MAKİNE safety tests: 5/5. Previous revision baseline had 16/16 tests and Chromium synthetic responsive tests; entire current revision has not passed a unified remote CI suite.
- Main production `product_version` stays 4.03; no automatic upgrade, merge, live orders or ledger writes. See CHANGES_20261018.txt, TESTS_20261018.txt, ROLLBACK.txt.
