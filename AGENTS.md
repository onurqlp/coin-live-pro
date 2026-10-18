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
