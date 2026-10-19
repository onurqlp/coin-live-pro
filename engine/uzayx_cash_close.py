#!/usr/bin/env python3
"""One-shot, audited reduce-only PAPER close. No exchange order API exists here.

Use observed executable-side quotes, adverse slippage and each book's existing
fee model. Never reset starting cash or invent a zero-price/flat-PnL close.
"""
import copy
import datetime as dt
import hashlib
import json
import os
import pathlib
import sys

import v4_paper as strict
import v4_spark_paper as spark
import paper as pilot
import collector
from v4_early import epoch

ROOT = pathlib.Path(__file__).resolve().parents[1]
BOOKS = {'spark': 'archive/v4-spark-paper-ledger.json',
         'strict': 'archive/v4-paper-ledger.json', 'pilot': 'archive/pilot-ledger.json'}


def close_books(books, market, now, request):
    if market.get('provider') != 'OKX' or not 0 <= now-(epoch(market.get('fetched_at')) or 0) <= 180000:
        raise ValueError('CLOSE_REQUIRES_FRESH_OBSERVED_QUOTES')
    if books['spark'].get('no_real_orders') is not True or books['strict'].get('no_real_orders') is not True:
        raise ValueError('NON_PAPER_BOOK')
    quotes = {q['symbol']: q for q in market['rows']}
    result = copy.deepcopy(books)
    report = {'request_id': request, 'closed_at_utc': spark.stamp(now),
              'quote_observed_at_utc': market['fetched_at'], 'source': 'OKX_USDT_SWAP_BID_ASK',
              'execution': 'ESTIMATED_REDUCE_ONLY_MARKET', 'real_orders': False,
              'funding': 'UNMODELED', 'liquidation': 'UNVERIFIED', 'positions': [], 'cancelled': []}

    def quote(o):
        q = quotes.get(o['symbol'], {})
        bid, ask = q.get('bid'), q.get('ask')
        if not spark.valid(bid) or not spark.valid(ask) or bid > ask or q.get('instrument_state') != 'live':
            raise ValueError('MISSING_EXECUTABLE_CLOSE_QUOTE:'+o['symbol'])
        return bid if o['side'] == 'LONG' else ask

    for t in result['spark']['tickets']:
        if t.get('remaining_qty', 0) > 0 and spark.valid(t.get('fill_price')):
            raw = quote(t); before = float(t['realized_net_usdt'])
            spark.settle(t, raw, 1., 'USER_CLOSE_ALL', now)
            t.update(unrealized_net_usdt=0., valuation_status='SETTLED',
                     close_request_id=request, close_quote_source=report['source'])
            report['positions'].append({'book': 'spark', 'id': t['event_id'],
                'symbol': t['symbol'], 'side': t['side'], 'quote': raw,
                'exit_price': t['exits'][-1]['price'], 'net_closed_usdt': t['realized_net_usdt']-before})
        elif t['status'] == 'WAITING_FUTURE_BAR':
            t.update(status='OPPOSITE_CANCELLED', valuation_status='USER_CLOSE_ALL_UNFILLED',close_request_id=request)
            report['cancelled'].append('spark:'+t['event_id'])
    log = result['strict']; log['_ids'] = {e['event_id'] for e in log.get('events', [])}
    policy = json.loads((ROOT/'config/v4-policy.json').read_text())['paper']
    for o in log['orders'].values():
        if o.get('remaining_qty', 0) > 0 and spark.valid(o.get('fill_price')):
            raw = quote(o); before = float(o['realized_pnl_usdt'])
            strict.exit_part(log,o,raw,1.,'USER_CLOSE_ALL',now,policy)
            o.update(unrealized_pnl_usdt=0.,close_request_id=request)
            report['positions'].append({'book':'strict','id':o['paper_order_id'],
                'symbol':o['symbol'],'side':o['side'],'quote':raw,
                'exit_price':o['partial_exits'][-1]['price'], 'net_closed_usdt':o['realized_pnl_usdt']-before})
        elif o['status'] == 'PENDING':
            o.update(status='CANCELLED',close_request_id=request)
            report['cancelled'].append('strict:'+o['paper_order_id'])
    log.pop('_ids', None)
    for o in result['pilot']['orders'].values():
        if o['status'] in ('FILLED','DATA_GAP') and spark.valid(o.get('fill_price')) and not o.get('exit_at'):
            raw = quote(o); o['status'] = 'FILLED'
            # Pilot's declared round-trip fee/slippage estimate is kept intact.
            pilot.settle(result['pilot'],o,'TIME_EXIT',raw,spark.stamp(now),'USER_CLOSE_ALL')
            o.update(close_request_id=request,quality='ESTIMATED_CURRENT_BID_ASK')
            report['positions'].append({'book':'pilot','id':o['id'],'symbol':o['symbol'],
                'side':o['side'],'quote':raw,'exit_price':o['exit_price'],'net_closed_usdt':o['pnl_usdt']})
        elif o['status']=='PENDING':
            o.update(status='NO_FILL',reason='USER_CLOSE_ALL',close_request_id=request)
            report['cancelled'].append('pilot:'+o['id'])
    equity = spark.ledger_stats(result['spark']['tickets'])
    report.update(spark_equity_after_usdt=equity['virtual_equity_usdt'],
                  new_cash_after_ms=(now//3600000+1)*3600000,
                  all_active_positions_closed=True, historical_cash_not_reset=True)
    result['spark']['strategy_cash_started_ms']=report['new_cash_after_ms']
    result['spark']['close_request_id']=request
    return result,report


def complete_quotes(books,market,now):
    """A held contract may have left the top-100 scan; it still needs a quote."""
    needed={t['symbol'] for t in books['spark']['tickets'] if t.get('remaining_qty',0)>0}
    needed.update(o['symbol'] for o in books['strict']['orders'].values() if o.get('remaining_qty',0)>0)
    needed.update(o['symbol'] for o in books['pilot']['orders'].values() if o['status'] in ('FILLED','DATA_GAP') and not o.get('exit_at'))
    have={q['symbol'] for q in market['rows']}
    if not needed-have:return market
    tickers={x['instId']:x for x in collector.get('/market/tickers',{'instType':'SWAP'})}
    instruments={x['instId']:x for x in collector.get('/public/instruments',{'instType':'SWAP'})}
    out=copy.deepcopy(market)
    for sym in sorted(needed-have):
        inst=sym[:-4]+'-USDT-SWAP';q=tickers.get(inst,{})
        observed=int(q.get('ts') or 0)
        if not -1000<=now-observed<=60000:raise ValueError('HELD_CONTRACT_QUOTE_UNAVAILABLE:'+sym)
        out['rows'].append({'symbol':sym,'bid':float(q['bidPx']),'ask':float(q['askPx']),
            'instrument_state':instruments.get(inst,{}).get('state','UNKNOWN'),
            'quote_observed_at_utc':spark.stamp(observed)})
    return out


def request_id(config,environ=None):
    environ=os.environ if environ is None else environ
    override=environ.get('UZAYX_CLOSE_REQUEST_ID','')
    if override and (not override.startswith('uzayx-manual-') or not override[13:].isdigit()):
        raise ValueError('INVALID_MANUAL_CLOSE_REQUEST')
    request=override or config['close_request_id']
    if not request.startswith('uzayx-') or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in request):
        raise ValueError('INVALID_CLOSE_REQUEST')
    return request


def main():
    config=json.loads((ROOT/'config/uzayx-strategy-policy.json').read_text())
    request=request_id(config)
    folder=ROOT/'archive/closings'/request
    checkpoint=folder/'completion.json'
    if checkpoint.exists():
        completed=json.loads(checkpoint.read_text())
        if completed.get('all_active_positions_closed') is not True:raise ValueError('PARTIAL_CLOSE')
        for name in BOOKS:
            raw=(folder/('before-'+name+'.json')).read_bytes()
            if hashlib.sha256(raw).hexdigest()!=completed['before_sha256'][name]:raise ValueError('CLOSE_ARCHIVE_CORRUPT')
        print('CLOSE_ALREADY_COMPLETED',request);return
    originals={k:(ROOT/v).read_bytes() for k,v in BOOKS.items()}
    docs={k:json.loads(v) for k,v in originals.items()}
    market=json.loads((ROOT/'web/data/market.json').read_text())
    now=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    market=complete_quotes(docs,market,now)
    now=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    closed,report=close_books(docs,market,now,request)
    folder.mkdir(parents=True,exist_ok=True)
    for k,raw in originals.items():
        p=folder/('before-'+k+'.json')
        if p.exists() and p.read_bytes()!=raw:raise ValueError('PREVIOUS_CLOSE_INCOMPLETE')
        if not p.exists():p.write_bytes(raw)
    report['before_sha256']={k:hashlib.sha256(v).hexdigest() for k,v in originals.items()}
    for k,p in BOOKS.items():strict.save(ROOT/p,closed[k])
    strict.save(checkpoint,report)
    strict.save(ROOT/'web/data/uzayx-cash-close.json',report)
    print('PAPER_CLOSE_ALL',len(report['positions']),'positions;',report['spark_equity_after_usdt'],'USDT; balances retained')


if __name__=='__main__':main()
