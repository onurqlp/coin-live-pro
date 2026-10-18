# UzayX — AI Development Contract

## Identity and responsibilities
- Public product name: **UzayX**. Previous COIN.LIVE labels are legacy identifiers, not the user-facing brand.
- Main source repository: `onurqlp/coin-live-pro`. Preserve the repository and existing GitHub Pages publishing path `web/`.
- Research support repositories: `onurqlp/makine-core` (UzayX Research Core) and `onurqlp/alti-quant-lab` (UzayX Quant Lab).
- Vercel project ID `prj_5H5XrY687BCIzPaQFX0kHWL9MIET`, renamed `uzayx`. Its V5 preview is currently an independent deployment; do **not** assume Git integration is configured.

## Operator workflow
1. Interpret natural-language user commands as implementation tasks within connected tool permissions.
2. Inspect the latest remote code and data before editing, because automated data commits are frequent.
3. Make minimal, reviewable source changes; use current file SHAs to avoid overwriting concurrent updates.
4. Validate affected functionality and source compatibility; do not claim a deployment is complete until the published endpoint responds.
5. Report actual commit/deployment references, what changed, and anything blocked.
6. Prefer existing repositories and automation over asking the user to upload ZIP files or manually copy code.

## Non-negotiable data contracts
- Retain the historical paper ledger, forward events, versioned manifests and origin timestamps unless a specific migration with a verified backup is executed.
- Use real observed data; never fabricate candles, fills, execution PnL, or past forward evidence.
- MAKINE/ALTI output is read-only and never becomes a live trading signal merely because it is displayed in UzayX.
- No live order credentials or real-money execution are enabled by interface-brand changes.
- Keep public JSON schemas, API paths, source commit references, and recorded timestamps compatible unless the user asks for a versioned migration.

## Release hygiene
- Optimize for mobile and desktop, with clear small-screen layouts and status/age indicators.
- Run targeted functional/syntax checks for changed logic. Do not introduce invasive security-audit work unless separately requested.
- Respect GitHub Actions 5-minute scheduling as best-effort, not guaranteed wall-clock collection.
- A Vercel project rename does not rewrite the deployed HTML; verify the actual page branding independently.

## UzayX live application (2026-10-18)
- New mobile-first site source: `web/uzayx/index.html`, `styles.css`, `app.js`, `learning.js`; GitHub Pages route `/coin-live-pro/uzayx/`.
- The V4.03 legacy site remains at `web/index.html` with a direct link into the new site; do not break historical bookmarks.
- Never rely on GitHub Pages copies of `web/data/*.json` being real-time: market commits often use `[skip ci]`. The UzayX UI obtains a main HEAD SHA then fetches JSON files from `raw.githubusercontent.com` pinned to **the same immutable commit** and compares matching `scan_id` values.
- If source age >25 minutes, source validation fails, or radar scan IDs mismatch, render a visibly stale/unavailable status rather than an actionable opportunity.
- Read MAKİNE's `site/data/support.json` as optional independent context. A missing context source never authorizes a replacement trade.
- `web/uzayx/learning.js` proposes research hypotheses from observed cohort outcomes, **not** mirrored paper profits. A losing historical original does not imply a profitable inverted trade. Mark inverse PnL as null until sequential closed-candle replay with separate fill, stop/TP, fee, slippage, funding and out-of-sample controls exists.
- `scripts/uzayx_learning_archive.py` and `.github/workflows/uzayx-learning.yml` manage an isolated append-only UTC daily lesson archive at `web/data/uzayx-lessons-history.json`. Never overwrite an earlier UTC day or change original V4 strategy policy.
- `.github/workflows/uzayx-validate.yml` runs targeted source/learning functionality checks, not an invasive security scanning program.
- The linked Google Sheet is `17xCk7i_F3XRGzyts1EF89vfrPiAUPbnEqATAM4fj9nA`. It had only a 2026-10-17 V4 sync when checked on 2026-10-18; Apps Script must be authorized by the account holder. Source `integrations/google-v4-sync.gs`, setup entry `installCoinLiveV4Sync()`.
- Vercel project's rename to `uzayx` does NOT change old V5 HTML. Existing Vercel staging currently still has the COIN.LIVE-branded HTML, and linking GitHub to Vercel remains unresolved; do not falsely claim full Vercel cutover.
