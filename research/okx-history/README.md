# Historical OKX OHLC research baseline — independent from live V4

Daily GitHub workflow captures public read-only OKX USDⓈ-M swap history from
`/api/v5/market/history-candles`. No private API, no Google script change.

- 4H: last 90 days; 1Dutc: last 210 days for indicator lookback;
  1H: last 14 days. **Only `confirm=1` and actually closed bars.**
- Fixed eight currently listed major coins + up to four currently active V4
  research symbols. Current-coin sampling creates **survivorship/selection
  bias**; coverage is not representative of delisted/nonselected coins.
- Each `*.json.gz` is compressed immutable-as-captured OHLC plus sample
  count, source, timestamp, quality, and hash. The daily job refreshes the
  last window. The index contains auditable coverage, gaps and honest
  "INSUFFICIENT"/"SOURCE_UNAVAILABLE" instead of invented zeros.
- These retrospective candles can be used for exploratory *training and
  descriptive regime research only*. They are **never** inserted into
  `archive/v4-lifecycle-ledger.json`, `archive/v4-forward-ledger.json`,
  the live 10,000-USDT paper account, or the V4 signal performance rates.
- A valid retrospective strategy experiment requires train/test time splits,
  rolling closed-only feature windows, same-market live listing filtering,
  fees/slippage/funding constraints and a separately labelled historical
  result. This collector alone makes **no** performance or win-rate claims.
- The existing five-minute scan, website, and Google heartbeat are
  untouched. The independent daily GitHub Action can fail without stopping
  trading research data collection. Git history retains prior captures.
