# COIN.LIVE PRO V5 — Child-simple mobile UX refresh, 2026-10-18

## Deployment
- **Current independently protected staging preview**: https://coinlive-v5-preview-qyx7usyri-onurqlp-7179.vercel.app/
- Vercel deployment: `dpl_EpxEdpHEXkKChz9owqPC9hYmq4cg` **READY**, target **staging**, project `coinlive-v5-preview`.
- Immediate previous staging: `dpl_6F9B65SKwDx5hBtSivSB3dWZK9T3` (does not include latest archive paging); earlier `dpl_3pG8MzfXrDbzBNqFVmgdRGJAnmWi`.
- GitHub source: `onurqlp/coin-live-pro`, branch `preview/coinlive-v5-vercel-20261018`, PR #29 **draft and unmerged**.
- **Production main web/release.json product_version remains 4.03.** Original https://onurqlp.github.io/coin-live-pro/ unchanged.

## Applied UI, accessibility and information architecture
1. Mobile fixed bottom navigation with 6 clearly named views: **Fırsatlar / Grafik / Kasa / Geçmiş / Sonuçlar / Sistem**. Desktop adapts to a wider top navigation.
2. Compact top brand + refresh; immediate source freshness badge. Important text first; raw commit, scan ID and developer terms moved into expandible System details.
3. Radar starts with **3 cards**, with "Diğer coinleri göster" for remaining current candidates. Every card has coin, LONG/SHORT, stage, price, plain-language state ("Teyit bekleniyor") and one large "Grafiği gör" tap target.
4. Filters for **Göz önünde, Hareket, İzle** stages, **LONG/SHORT** direction and text search. Stage and score are never presented as win probabilities or executed trades.
5. Home has a small source-verified 1H mini chart, shared with the large chart using the **same commit-pinned** 1H/4H/1D chart endpoint. Tapping a candidate opens its chart with conditional price, stop and TP1-3 if published; missing values remain labeled unknown. Past markers are events, not executions.
6. Added real **Geçmiş** timeline via new read-only `/api/history?commit=<sha>`; validates immutable commit, manifest source SHA-256, byte size and scan ID. Covers up to 250 source events; latest source had **140 events, 35 INVALIDATED**. UI shows 15 at a time with "Diğerlerini göster", plus filters for progressed/invalidated. Historical data never become new signals.
7. Kasa screen keeps **main 10,000 USDT V4 paper** separate from **experimental Spark 10,000 USDT**; cohort accounting and cash accounting stay separate. Funding unmodeled is still unknown.
8. Sonuçlar shows 7/14/30/90-day research; insufficient sample displayed explicitly. Sistem contains full provenance and separate, stale-aware read-only MAKİNE.

## Tests
- GitHub Actions run **39112747877**: **27/27** V5 Node contract tests passed; Python and JS validation and real pinned-source API tests passed; Chromium interaction runs PASS on 360, 390, 768 and 1366px.
- Chromium interaction fixture explicitly checks only 3 visible cards, expand-all, LONG/SHORT filters, coin search, chart canvas, 15-at-a-time history timeline, invalidated-history filter, no horizontal scrolling, and offline/stale safety.
- On the exact deployed staging URL: HTML/CSS/JS HTTP 200; verified real snapshot HTTP 200 with production source product 4.03, OKX **23/23** and 23 researched candidates at the check. Authenticated history HTTP 200 with 140 immutable, SHA-256-verified events; BTCUSDT 1H closed-candle chart HTTP 200, 60 bars; same scan ID across responses.
- Read-only, no real order; API routes never write historical JSON or paper ledgers.
- This confirms source-backed server responses and synthetic-browser UI, **not a physical-Android-device screenshot/install audit**.

## Remaining restrictions, explicit release gate
- Original GitHub Pages 4.03 / Python engines / 7 strategies / old ledgers are untouched; **do not merge PR #29 or promote to production without user's approval**.
- Background push notifications require a separate delivery service and user permission; not claimed operational.
- MAKİNE manual research may be STALE and does not affect rankings or paper trade entry.
- GitHub scheduled market runs may be delayed; historical published candles only, and stale source means no active candidates.
- Separate Vercel SSO protection retained. No secret/real-order key in client.

## Rollback
Use the previous known READY preview deployment `dpl_6F9B65SKwDx5hBtSivSB3dWZK9T3` or older `dpl_3pG8MzfXrDbzBNqFVmgdRGJAnmWi` in **the independent Vercel project only**. The original GitHub Pages domain was not redirected, so no DNS/main-code rollback needed. Do not rewrite the main V4 10k paper or Spark history.
