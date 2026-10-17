# COIN.LIVE 4.03 — Operational hardening

## What is active

- The original OKX 5-minute best-effort market workflow remains the sole producer of live market ledgers, V4 paper and published web data. No trade keys and no live orders.
- `scripts/quant_report.py` creates a separate read-only `web/data/ops-report.json` after the market data is validated. Daily/weekly scheduled runs publish an Actions summary and a 30-day evidence artifact. This does NOT reclassify retrospective training as forward outcomes.
- `scripts/watchdog.py` checks GitHub's published `health.json` and actual market workflow run conclusions every hour; opens **one** tracked GitHub Issue for stale (>25 minutes) or three consecutive failed jobs, and closes it after recovery. Trigger frequency is best-effort. It does not submit orders.
- Optional private Telegram alerts require repository secrets `COINLIVE_TELEGRAM_BOT_TOKEN` and `COINLIVE_TELEGRAM_CHAT_ID`; absent either secret, the default alert remains GitHub Issues only. Never put bot credentials in public source, logs or chat.
- A daily archive/checksum snapshot is retained as a GitHub Actions artifact for up to 90 days. Downloading a verified copy to independent durable object storage still requires an external destination and credentials. GitHub Actions artifacts are **not permanent off-site backups**.
- CodeQL and weekly Dependabot checks are separate from the strategy decision pipeline. The MAKINE presentation remains in its existing path; its redundant standalone Pages deployment was removed, while normal `pages.yml` still publishes the full `web/` tree.

## Known boundaries

1. Scheduled Actions and optional Google heartbeat are best-effort; measure runs over an uninterrupted 24-hour interval before describing them as reliable. For SLA-level collection, migrate *only* the scheduler/collector to a persistent worker with a database and leave Pages/CD on GitHub.
2. The 5-minute market job still saves current research ledgers into Git history at its current cadence. Do **not** throttle or delete those commits until durable external storage with tested restore is configured: doing so could lose real forward events.
3. GitHub repository code changes do **not** deploy any Google Apps Script source already installed in a spreadsheet. The V4 Sheets integration must be installed/updated separately and then checked against real sheet row counts.
4. Product release stays `4.03`; no automatic real-money mode, strategy threshold change, or retroactive success attribution.

## Runbook

- Check [Actions](https://github.com/onurqlp/coin-live-pro/actions) and `web/data/health.json` for freshness.
- Resolve `[COIN.LIVE-WATCHDOG]` Issues by restoring the market pipeline; watchdog will close the issue automatically when healthy.
- For backups, download the latest `COIN.LIVE — Verified 90-Day Archive Snapshots` artifact and validate `sha256sum -c ARCHIVE_CHECKSUMS.sha256` and `SOURCE_CHECKSUMS.sha256` after extraction.
- Risk/fees/funding and unclosed tickets remain simulated. Only forward-observed closed tickets are counted for model comparison, with a minimum 30 closed-ticket threshold.
