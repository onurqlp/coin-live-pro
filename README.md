# COIN.LIVE PRO — Early Edge (v1.0)

Independent research dashboard for read-only OKX USDT perpetual market data. Alerts for potential LONG **and** SHORT setups, switchable candles for observed coins, auditable forward-only 14-day event history, 7-/14-day follow-up performance and Google Sheets mirroring. No trade execution or guarantees.

## New GitHub repository needed

GitHub connector cannot create repositories directly; create a **public** repository `onurqlp/coin-live-pro`, initialize it with README (branch `main`), and allow Actions/Pages. This package is ready to upload. Final public site: `https://onurqlp.github.io/coin-live-pro/` *after enabling Settings → Pages → Deploy from branch → main → /web* (GitHub Pages may not offer `/web` as a Pages root; use the included Pages workflow below instead, deploying `/web` through Actions).

## Launch

1. Push all files to the new repository's `main` (ChatGPT can write via the GitHub connector once you create the repo).
2. In **Settings → Actions → General**, allow Actions execution and workflow write permission if the repository requires it. In **Settings → Pages**, choose **GitHub Actions** as source.
3. Visit **Actions → COIN.LIVE PRO — Public Market & Forward Archive → Run workflow** once. Workflow will produce real `web/data/*.json` snapshots and forward-only event archive. Github cron is best-effort: **5-minute intervals are not guaranteed**. If no scheduled runs, inspect Actions settings.
4. Pages deployment workflow will publish the `web` directory as site root.
5. Google Sheet [COIN.LIVE PRO](https://docs.google.com/spreadsheets/d/17xCk7i_F3XRGzyts1EF89vfrPiAUPbnEqATAM4fj9nA/edit) → Extensions → Apps Script. Replace template with `google-sheets.gs`, run `installCoinLivePro` once and authorize. An Apps Script trigger checks roughly every 10 minutes. Sheet copies events by unique ID, updates their outcomes, and records daily BTC/ETH plus LONG/SHORT event counts. Older rows remain permanently in Sheets.

## Scientific limits (important)

* An early **WATCH** event is not a trade recommendation and is never counted in historical trade win rate.
* A **CONFIRMED** event is a conditional paper scenario; no real trades are opened.
* Outcomes use 15-minute OHLC after the event. When stop and TP are both within a single 15-minute candle, the result is `AMBIGUOUS`, excluded from win rate.
* Data gaps over ~25 h cannot be reliably reconstructed with the available recent-candle API; mark `DATA_GAP`, never invent an outcome.
* The first archive starts empty. There are no retroactive wins or fabricated signal timestamps.
* 1R describes a hypothetical fixed risk-unit. `net_R` subtracts an **illustrative** total of 0.15% of notional. Funding, actual spread/slippage, liquidations and unfilled orders are not fully modeled. No 100x claim.
* Hypothetical $100 base means $1/R at constant 1% base risk. This is **not** a compounded portfolio backtest and ignores concurrent position limits.
* Browser refresh re-reads JSON and attempts an independent live quote; **cannot force a GitHub Actions job**.
* GitHub Pages does not run a 24/7 browser; scanner works only when scheduled Actions execute.

## Developer tests

```bash
node --check web/app.js
python3 -m unittest discover -s tests -v
python3 -m py_compile engine/collector.py
```