# COIN.LIVE PRO 5.0 — isolated preview

Source of truth: `onurqlp/coin-live-pro` production branch, **read only**. The production product release remains `4.03`; the independent UI is `5.0.0-preview`.

## Architecture

- `/api/snapshot`: Pin one Git commit; verify `v4-manifest.json`, mandatory SHA-256 and byte counts for nine JSON datasets; reject mixed scan ids and inconsistent account separation. At >20 min, keep historical account labels but suppress active opportunities.
- `/api/overlay`: optional, explicitly disconnected MAKİNE CORE placeholder. Never changes original signal rankings or ledger, never invents pricing.
- `public/`: touch-friendly PWA shell, Radar, Chart/source explanation, two separate virtual accounts, 7/14/30/90-day observations and System provenance.
- Chart candle rendering intentionally stays blocked pending manifest integrity coverage for `web/data/chart-pack.json`. No unverifiable OHLC chart is depicted as verified; no external trading orders.
- Original Python engine and GitHub workflows are not touched. The only planned remote change is adding a new path on an isolated feature branch.

## Local verification

`npm test` and `npm run lint`; Node.js >=20. Browser responsive smoke checks use synthetic fixtures, not live trading data.

## Deployment

Target a **new independent Vercel project** with Project Root `apps/coinlive-vercel` (for Git branch) or package root (for ZIP). Choose deployment **preview**, never production or GitHub Pages. Review SSO and preview visibility before sharing.

## Risks

- The original experiment's cohort sums do not equal accounting realized P&L; no automatic reconciliation is attempted.
- Funding remains unknown/unmodeled; no numeric zero substituted.
- `health.last_scan_id` belongs to a legacy scan identity; its difference from V4 manifest scan_id is labeled, not force-coerced.
- Historical forward windows only reflect data genuinely observed since start; insufficient 3D/7D samples remain empty.
- Vercel API route availability, remote latency, PWA install prompt, genuine device testing and external MAKİNE integration require a deployed Vercel preview.
