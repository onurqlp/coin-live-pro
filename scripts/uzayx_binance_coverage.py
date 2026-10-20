#!/usr/bin/env python3
"""Publish a small, source-stamped snapshot of VERIFIED Binance archive coverage.

The snapshot describes retrospective research only, not backtest results,
executable signals, current futures listings, or real-money trading.
"""
import datetime as dt
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'research/binance-history/index.json'
TARGET = ROOT / 'web/data/uzayx-binance-coverage.json'
SCHEMA = 'uzayx.binance.coverage.v1'


def summarize(index):
    if index.get('version') != 'uzayx.binance.archive.v1':
        raise ValueError('UNRECOGNIZED_BINANCE_INDEX')
    instruments, archives = index.get('instruments'), index.get('archives')
    health = index.get('source_health')
    if not isinstance(instruments, list) or not isinstance(archives, dict) or not isinstance(health, dict):
        raise ValueError('INVALID_BINANCE_INDEX')
    verified = [v for v in archives.values() if isinstance(v, dict)
                and v.get('status') == 'VERIFIED_CLOSED_OHLCV'
                and isinstance(v.get('rows'), int) and v['rows'] > 0
                and isinstance(v.get('first_ms'), int) and isinstance(v.get('last_ms'), int)
                and v['last_ms'] >= v['first_ms']]
    unique = {tuple(key.split('/')[:2]) for key, value in archives.items()
              if value in verified and len(key.split('/')) == 3}
    bounds = ([min(x['first_ms'] for x in verified), max(x['last_ms'] for x in verified)]
              if verified else None)
    def iso(ms):
        return dt.datetime.fromtimestamp(ms/1000, tz=dt.timezone.utc).isoformat()
    live = sum(x.get('status') == 'TRADING' and health.get(x.get('market')) == 'OK'
               for x in instruments if isinstance(x, dict))
    return {
        'schema': SCHEMA,
        'source_index_version': index['version'],
        'source_updated_at_utc': index.get('updated_at_utc'),
        'first_census_at_utc': index.get('first_census_at_utc'),
        'research_state': 'PARTIAL_ARCHIVE' if verified else 'NO_VERIFIED_OHLCV',
        'catalogue_observed_count': len(instruments),
        'current_trading_verified_count': live,
        'archived_symbol_count': len(unique),
        'verified_1h_months': len(verified),
        'verified_1h_bars': sum(x['rows'] for x in verified),
        'first_bar_utc': iso(bounds[0]) if bounds else None,
        'last_bar_utc': iso(bounds[1]) if bounds else None,
        'source_health': health,
        'ohlcv_scope': index.get('ohlcv_scope', 'UNKNOWN'),
        'funding': index.get('funding', 'UNKNOWN'),
        'open_interest': index.get('open_interest', 'UNKNOWN'),
        'orderbook_history': index.get('book_history', 'UNKNOWN'),
        'historical_universe_complete': False,
        'net_strategy_pnl_verified': False,
        'real_orders': False,
        'not_trade_advice': True
    }


def main():
    data = summarize(json.loads(SOURCE.read_text(encoding='utf-8')))
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    temporary = TARGET.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(',', ':'))+'\n', encoding='utf-8')
    temporary.replace(TARGET)
    print('BINANCE_COVERAGE', data['catalogue_observed_count'],
          'symbols_with_bars', data['archived_symbol_count'],
          'verified_1h_months', data['verified_1h_months'])


if __name__ == '__main__':
    main()
