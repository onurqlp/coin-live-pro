#!/usr/bin/env python3
"""Reconcile the complete immutable UzayX PAPER ledger into a source-linked PNL report.

Historical direction and research matches are NEVER treated as fills or cash PNL.
No exchange client, trades, credentials or strategy-policy mutation.
"""
import collections
import datetime as dt
import json
import math
import pathlib
import sys

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'engine'))
from turan_attribution import summarize as attribution_summary, classify as classify_attribution

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'web/data/uzayx-pnl-report.json'
VERSION = 'uzayx.pnl.ledger.v1'
DAY = dt.timedelta(days=1)
VALID = {'OPEN', 'CLOSED'}
LABELS = {'LEGACY_UNASSIGNED': 'Önceki / strateji kimliği doğrulanmayan',
          'SPARK_KIVILCIM': 'Kıvılcım',
          'SPARK_ERKEN_SINYAL': 'Erken sinyal',
          'SPARK_ISIK_GUCLENIYOR': 'Güçlenen ışık',
          'SPARK_GELDI': 'GELDİ'}
NATIVE = set(LABELS) - {'LEGACY_UNASSIGNED'}


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def parse(value):
    try:
        timestamp = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        if timestamp.tzinfo is None:
            return None
        return timestamp.astimezone(dt.timezone.utc)
    except (TypeError, ValueError, AttributeError):
        return None


def rounded(value):
    return round(value, 6)


def build(ledger, paper, manifest, bank):
    scan = manifest.get('scan_id')
    if (not scan or manifest.get('publication_valid') is not True or
        manifest.get('no_real_orders') is not True or paper.get('scan_id') != scan or
        paper.get('no_real_orders') is not True or ledger.get('last_scan_id') != scan or
        bank.get('no_real_orders') is not True or bank.get('registry_count') != 200 or
        not parse(manifest.get('finished_at_utc'))):
        raise ValueError('PNL_SOURCE_SCAN_MISMATCH')
    tickets = ledger.get('tickets')
    if not isinstance(tickets, list) or len(tickets) != paper.get('all_events_count'):
        raise ValueError('PNL_INCOMPLETE_LEDGER')
    counts = paper.get('summary', {}).get('counts')
    if not isinstance(counts, dict) or sum(v for v in counts.values() if isinstance(v, int)) != len(tickets):
        raise ValueError('PNL_STATUS_COUNT_MISMATCH')
    registry = bank.get('registry')
    if not isinstance(registry, list) or len(registry) != 200:
        raise ValueError('PNL_REGISTRY_MISMATCH')
    ids = {x.get('id') for x in registry}
    if ids != {f'T{i:03}' for i in range(1, 201)}:
        raise ValueError('PNL_STRATEGY_IDS_MISMATCH')
    now = parse(manifest['finished_at_utc'])
    start = paper.get('starting_balance_usdt')
    if not number(start):
        raise ValueError('PNL_INVALID_STARTING_CASH')
    strategies = {}
    for strategy in registry:
        sid = strategy['id']
        role = strategy.get('role')
        state = ('PAPER_ACTIVE' if role == 'ENTRY_HYPOTHESIS' and
                 strategy.get('state') == 'IMPLEMENTED_FORWARD_PAPER' else
                 'CONTROL_ACTIVE' if role == 'CONTROL_OR_RESEARCH' else
                 'RESEARCH_SOURCE_BLOCKED')
        strategies[sid] = dict(id=sid, name=strategy.get('name', sid),
                               state=state, required_source=strategy.get('required_source'),
                               primary_ticket_count=0, closed=0, open=0, won=0, lost=0,
                               realized=0., unrealized=0., fees=0.,
                               supporting_matches=0, last_ticket_utc=None)
    legacy = {}
    coins = {}
    daily = collections.defaultdict(float)
    rolling_48h = {'from_utc': (now - dt.timedelta(hours=48)).isoformat(),
                   'to_utc': now.isoformat(), 'realized_net_usdt': 0.,
                   'exit_count': 0, 'positive_exits': 0, 'negative_exits': 0}
    seen = set()
    realized = floating = fees = 0.
    closed_count = open_count = 0
    for ticket in tickets:
        key = ticket.get('event_id')
        if not key or key in seen or ticket.get('is_real_trade') is not False:
            raise ValueError('PNL_DUPLICATE_OR_REAL_TICKET')
        seen.add(key)
        status = ticket.get('status')
        r = ticket.get('realized_net_usdt')
        u = ticket.get('unrealized_net_usdt')
        fee = ticket.get('fees_estimated_usdt')
        if not all(number(v) for v in (r, u, fee)) or fee < 0:
            raise ValueError('PNL_INVALID_LEDGER_VALUE')
        if status != 'OPEN' and abs(u) > .00001:
            raise ValueError('PNL_NONOPEN_FLOATING')
        if status == 'OPEN':
            open_count += 1
        if status == 'CLOSED':
            closed_count += 1
        realized += r
        floating += u
        fees += fee
        exits = ticket.get('exits') or []
        if not isinstance(exits, list):
            raise ValueError('PNL_INVALID_EXITS')
        exit_sum = 0.
        for exit_row in exits:
            closed_at = parse(exit_row.get('closed_at_utc'))
            value = exit_row.get('net_usdt')
            if not closed_at or closed_at > now + dt.timedelta(minutes=2) or not number(value):
                raise ValueError('PNL_INVALID_EXIT_TIMESTAMP_OR_VALUE')
            daily[closed_at.date().isoformat()] += value
            if now - dt.timedelta(hours=48) < closed_at <= now:
                rolling_48h['realized_net_usdt'] += value
                rolling_48h['exit_count'] += 1
                rolling_48h['positive_exits'] += int(value > 0)
                rolling_48h['negative_exits'] += int(value < 0)
            exit_sum += value
        if abs(exit_sum-r) > .025:
            raise ValueError('PNL_EXIT_LEDGER_MISMATCH')
        symbol = ticket.get('symbol')
        if not isinstance(symbol, str) or not symbol:
            raise ValueError('PNL_INVALID_SYMBOL')
        coin = coins.setdefault(symbol, dict(symbol=symbol, closed=0, open=0, realized=0., unrealized=0.))
        coin['realized'] += r
        coin['unrealized'] += u
        coin['closed'] += int(status == 'CLOSED')
        coin['open'] += int(status == 'OPEN')
        sid = ticket.get('turan_strategy_id')
        exact = sid in strategies and classify_attribution(ticket)['eligible_for_strategy_pnl']
        if exact:
            group = strategies[sid]
            for second in set(ticket.get('strategy_ids') or ()) - {sid}:
                if second in strategies:
                    strategies[second]['supporting_matches'] += 1
        else:
            name = ticket.get('strategy_id')
            label = name if name in NATIVE else 'LEGACY_UNASSIGNED'
            group = legacy.setdefault(label, dict(id=label, name=LABELS.get(label, label),
               state='HISTORICAL_PAPER', primary_ticket_count=0, closed=0, open=0, won=0, lost=0,
               realized=0., unrealized=0., fees=0., supporting_matches=0, last_ticket_utc=None))
        group['primary_ticket_count'] += 1
        group['realized'] += r
        group['unrealized'] += u
        group['fees'] += fee
        if status == 'CLOSED':
            group['closed'] += 1
            group['won'] += int(r > 0)
            group['lost'] += int(r < 0)
        if status == 'OPEN':
            group['open'] += 1
        born = ticket.get('signal_at_utc')
        if parse(born) and (group['last_ticket_utc'] is None or born > group['last_ticket_utc']):
            group['last_ticket_utc'] = born
    summary = paper['summary']
    if (open_count != counts.get('OPEN') or closed_count != counts.get('CLOSED') or
        abs(realized-summary.get('realized_net_usdt', float('inf'))) > .03 or
        abs(floating-summary.get('unrealized_net_usdt', float('inf'))) > .03 or
        abs(start+realized+floating-summary.get('virtual_equity_usdt', float('inf'))) > .03 or
        abs(fees-summary.get('estimated_fees_usdt', float('inf'))) > .03):
        raise ValueError('PNL_CASH_RECONCILIATION_FAILED')
    if abs(sum(daily.values())-realized) > .025:
        raise ValueError('PNL_DAILY_EXIT_RECONCILIATION_FAILED')
    def finalize(x):
        for field in ('realized', 'unrealized', 'fees'):
            x[field] = rounded(x[field])
        x['paper_win_rate_pct'] = (rounded(x['won']*100/x['closed'])
            if x['closed'] >= 30 else None)
        x['positive_expectancy_verified'] = False
        return x
    strategy_rows = [finalize(strategies[f'T{i:03}']) for i in range(1, 201)]
    legacy_rows = [finalize(legacy[key]) for key in sorted(legacy)]
    coin_rows = []
    for c in coins.values():
        c['realized'] = rounded(c['realized'])
        c['unrealized'] = rounded(c['unrealized'])
        coin_rows.append(c)
    coin_rows.sort(key=lambda c: c['realized']+c['unrealized'])
    dates = [(now.date()-dt.timedelta(days=i)).isoformat() for i in range(29, -1, -1)]
    timeline = [{'day_utc': key, 'realized_usdt': rounded(daily.get(key, 0.))}
                for key in dates]
    recent = {span: rounded(sum(v for day, v in daily.items()
                  if (now.date()-dt.timedelta(days=span-1)).isoformat() <= day <= now.date().isoformat()))
              for span in (1, 7, 30)}
    rolling_48h['realized_net_usdt'] = rounded(rolling_48h['realized_net_usdt'])
    active = sum(r['state'] == 'PAPER_ACTIVE' for r in strategy_rows)
    blocked = sum(r['state'] == 'RESEARCH_SOURCE_BLOCKED' for r in strategy_rows)
    controls = sum(r['state'] == 'CONTROL_ACTIVE' for r in strategy_rows)
    return {
      'schema': VERSION, 'scan_id': scan, 'source_at_utc': manifest['finished_at_utc'],
      'source': 'OKX_MODELLED_PAPER_LEDGER', 'not_realized_exchange_pnl': True,
      'funding': 'UNMODELED', 'liquidation': 'UNVERIFIED',
      'no_real_orders': True, 'historical_research_is_not_executed_cash': True,
      'starting_usdt': rounded(start),
      'equity_usdt': rounded(start+realized+floating),
      'realized_usdt': rounded(realized), 'unrealized_usdt': rounded(floating),
      'total_pnl_usdt': rounded(realized+floating), 'fees_estimated_usdt': rounded(fees),
      'open_count': open_count, 'closed_count': closed_count,
      'ledger_count': len(tickets), 'daily_realized_usdt': recent,
      'rolling_48h': rolling_48h,
      'attribution': attribution_summary(tickets),
      'daily_last_30': timeline, 'strategies': strategy_rows,
      'legacy_unassigned': legacy_rows, 'coins': coin_rows,
      'strategy_activation': {'paper_active': active, 'blocked_source': blocked,
                              'controls_active': controls, 'real_live': 0},
      'strategy_validation': {'verified_profitable': 0,
          'note': 'Net positive expectation needs independent out-of-sample and paper-forward evidence.'},
      'reconciled': True
    }


def main():
    load = lambda p: json.loads((ROOT/p).read_text(encoding='utf8'))
    result = build(load('archive/v4-spark-paper-ledger.json'),
                   load('web/data/v4-spark-paper.json'),
                   load('web/data/v4-manifest.json'),
                   load('web/data/uzayx-strategy-bank.json'))
    OUT.parent.mkdir(exist_ok=True, parents=True)
    import os
    import tempfile
    fd, path = tempfile.mkstemp(prefix='.uzayx-pnl-', dir=OUT.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf8') as output:
            json.dump(result, output, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
            output.write('\n')
        os.replace(path, OUT)
    finally:
        if os.path.exists(path):
            os.unlink(path)
    print('UZAYX_PNL', result['total_pnl_usdt'], 'paper strategy-enabled',
          result['strategy_activation'], 'closed', result['closed_count'])


if __name__ == '__main__':
    main()
