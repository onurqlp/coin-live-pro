#!/usr/bin/env python3
"""Prospective, isolated equal-condition experiments; never write a cashbook.

One frozen prediction per strategy version/rule/symbol/direction/closed hour.
Repeated scans cannot inflate evidence. ORIGINAL and INVERSE have independent
fills/stops/costs. WAIT requires a later closed hour; NO_TRADE is an exposure
benchmark. OHLC fills are estimates, funding/liquidation remain unknown.
"""
import copy
import datetime as dt
import hashlib
import json
import pathlib
from collections import Counter,defaultdict

from uzayx_research import closed_rows, number
from v4_early import epoch

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCHEMA = 'turan.experiments.v1'
POLICY = 'T-vNext-CHALLENGER-equal-conditions-v1'
B = 300000
H = 3600000
IDS = tuple(f'T{i:03}' for i in range(1, 201))
ARMS = ('ORIGINAL', 'INVERSE', 'WAIT', 'NO_TRADE')
# Fixed research assumptions, not a proposed promotion into the shared account.
FEE = .0006
SLIPPAGE = .0003
NOTIONAL = 300.
MAX_HOLD = 24*H
HORIZONS = {'15m':(3*B,'5m',B), '1h':(H,'5m',B), '4h':(4*H,'5m',B),
    '12h':(12*H,'1H',H), '24h':(24*H,'1H',H), '3g':(72*H,'4H',4*H),
    '7g':(168*H,'4H',4*H), '14g':(336*H,'4H',4*H)}


def iso(ms):
    return dt.datetime.fromtimestamp(ms/1000, dt.timezone.utc).isoformat()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',',':')).encode()).hexdigest()[:24]


def evidence_signature(item):
    # Missing-source status changes are diagnostics, never new learning evidence.
    return digest({'arms':{key:{k:arm.get(k) for k in ('last_bar_ms','exit_at','outcome')}
        for key,arm in item['arms'].items()},
        'horizons':{key:value for key,value in item['horizons'].items() if value.get('state')=='OBSERVED'}})


def new_experiment(signal, strategy, scan):
    sid = strategy['id']
    sign = 1 if signal['side']=='LONG' else -1
    identity = dict(strategy_id=sid, strategy_version=strategy['strategy_version'],
        rules_hash=strategy['strategy_config_hash'], symbol=signal['symbol'],
        direction=signal['side'], closed_hour=signal['source_closed_1h_at_utc'])
    decision = epoch(signal.get('decision_at'))
    available = epoch(signal.get('source_available_at'))
    price, atr, spread = (signal.get(k) for k in ('price_at_scan','atr_pct_at_decision','spread_bps'))
    if (decision is None or available is None or available>decision or
        not number(price) or price<=0 or not number(atr) or atr<=0):
        raise ValueError('TURAN_EXPERIMENT_INVALID_BIRTH')
    arms = {}
    for arm in ARMS:
        arms[arm] = dict(status='BENCHMARK' if arm=='NO_TRADE' else 'WAITING_FUTURE_BAR',
            side='SHORT' if arm=='INVERSE' and sign==1 else 'LONG' if arm=='INVERSE' else signal['side'],
            modeled_net_usdt=0. if arm=='NO_TRADE' else None,
            complete_net_usdt=0. if arm=='NO_TRADE' else None)
        if atr>=35 and arm!='NO_TRADE':
            arms[arm].update(status='BLOCKED_RISK',block_reason='ATR_OUTSIDE_REPLAY_DOMAIN')
    return dict(**identity, experiment_id='EXP-'+digest(identity), episode_id='EP-'+digest({
        'symbol':signal['symbol'], 'direction':signal['side'], 'utc_day':iso(decision)[:10]}),
        experiment_policy=POLICY, challenger_version=sid+'-vNext-CHALLENGER-1',
        event_id=signal['event_id'], signal_id=signal['strategy_signal_ids'][sid],
        evaluation_id=signal['strategy_evaluation_ids'][sid], cycle_id=signal['cycle_id'],
        snapshot_id=signal['snapshot_id'], source_scan_id=scan,
        exchange=signal.get('exchange','OKX'), contract_type=signal.get('contract_type','USDT-SWAP'),
        decision_at=iso(decision), source_available_at=iso(available), decision_ms=decision,
        reference_price=price, atr_pct=atr,
        spread_bps=spread if number(spread) and spread>=0 else None,
        notional_usdt=NOTIONAL, margin_usdt=30., leverage=10,
        funding='UNKNOWN', liquidation='UNKNOWN', arms=arms, horizons={})


def update_arm(arm, experiment, bars, hours, now, kind):
    if arm['status'] in ('CLOSED','NO_CONFIRMATION','BENCHMARK','BLOCKED_RISK'):
        return
    birth = experiment['decision_ms']
    eligible = birth
    if kind=='WAIT':
        # The confirmation is the first FULL hourly bar starting after decision.
        confirm_start = (birth//H+1)*H
        eligible = confirm_start+H
        if now<eligible:
            return
        confirm = next((x for x in hours if x['t']==confirm_start),None)
        if confirm is None:
            arm.update(status='SOURCE_GAP', block_reason='WAIT_CONFIRMATION_BAR_MISSING')
            return
        sign = 1 if arm['side']=='LONG' else -1
        if sign*(confirm['c']-experiment['reference_price'])<=0:
            arm.update(status='NO_CONFIRMATION', modeled_net_usdt=0., complete_net_usdt=0.)
            return
    first = (eligible//B+1)*B
    sign = 1 if arm['side']=='LONG' else -1
    by_time = {x['t']:x for x in bars}
    if 'entry_fill' not in arm:
        if now<first+B:
            return
        if experiment['spread_bps'] is None:
            arm.update(status='BLOCKED_SOURCE', block_reason='SPREAD_UNKNOWN')
            return
        bar = by_time.get(first)
        if bar is None:
            arm.update(status='SOURCE_GAP', block_reason='FIRST_FUTURE_BAR_MISSING')
            return
        half_spread=experiment['spread_bps']/20000
        entry=bar['o']*(1+sign*(SLIPPAGE+half_spread))
        distance=entry*experiment['atr_pct']/100
        arm.update(status='OPEN', entry_fill=entry, entry_at=iso(first), entry_ms=first,
            qty=NOTIONAL/entry, stop=entry-sign*distance, target=entry+sign*2*distance,
            entry_fee_usdt=NOTIONAL*FEE, last_bar_ms=first-B,
            mfe_pct=0., mae_pct=0., complete_net_usdt=None)
    cursor=arm['last_bar_ms']+B
    # Process each new closed interval exactly once; never jump a missing bar.
    while cursor+B<=now:
        bar=by_time.get(cursor)
        if bar is None:
            arm.update(status='SOURCE_GAP', block_reason='CONTIGUOUS_FUTURE_BAR_MISSING',
                modeled_unrealized_usdt=None)
            return
        arm['status']='OPEN'
        arm.pop('block_reason',None)
        entry=arm['entry_fill']
        arm['mfe_pct']=max(arm['mfe_pct'],sign*((bar['h'] if sign==1 else bar['l'])/entry-1)*100)
        arm['mae_pct']=max(arm['mae_pct'],-sign*((bar['l'] if sign==1 else bar['h'])/entry-1)*100)
        stop=bar['l']<=arm['stop'] if sign==1 else bar['h']>=arm['stop']
        target=bar['h']>=arm['target'] if sign==1 else bar['l']<=arm['target']
        raw=None
        if stop:
            # A gap through the stop gets the worse open, never the stale stop.
            raw=min(bar['o'],arm['stop']) if sign==1 else max(bar['o'],arm['stop'])
            outcome='AMBIGUOUS_STOP_FIRST' if target else 'STOP'
        elif target:
            raw=arm['target'];outcome='TAKE_PROFIT'
        elif cursor+B>=arm['entry_ms']+MAX_HOLD:
            raw=bar['c'];outcome='TIME_EXIT'
        close=(raw if raw is not None else bar['c'])*(1-sign*(SLIPPAGE+experiment['spread_bps']/20000))
        fee=close*arm['qty']*FEE
        modeled=sign*(close-entry)*arm['qty']-arm['entry_fee_usdt']-fee
        arm.update(last_bar_ms=cursor, modeled_unrealized_usdt=round(modeled,8),
            mark_at=iso(cursor+B))
        if raw is not None:
            arm.update(status='CLOSED', exit_fill=close, exit_at=iso(cursor+B),
                outcome=outcome, modeled_net_usdt=round(modeled,8), modeled_unrealized_usdt=0.,
                fees_usdt=round(arm['entry_fee_usdt']+fee,8),
                leverage_sensitivity={str(leverage):dict(modeled_net_usdt=round(modeled*leverage/10,8),
                    complete_net_usdt=None, liquidation='UNKNOWN') for leverage in (5,10,15,20)})
            return
        cursor+=B


def advance(prior, bank, manifest, pack, now):
    if (manifest.get('publication_valid') is not True or manifest.get('no_real_orders') is not True or
        bank.get('no_real_orders') is not True or not manifest.get('scan_id') or
        pack.get('source')!='OKX_CLOSED_CANDLES' or pack.get('source_mtf_at')!=bank.get('source_mtf_at') or
        manifest.get('started_at_utc')!=bank.get('source_mtf_at')):
        raise ValueError('TURAN_EXPERIMENT_SOURCE_MISMATCH')
    registry={x['id']:x for x in bank['registry']}
    if set(registry)!=set(IDS) or len(bank['registry'])!=200:
        raise ValueError('TURAN_EXPERIMENT_REGISTRY_MISMATCH')
    if prior and (prior.get('schema')!=SCHEMA or not isinstance(prior.get('experiments'),list)):
        raise ValueError('TURAN_EXPERIMENT_UNKNOWN_LEDGER')
    ledger=copy.deepcopy(prior) if prior else dict(schema=SCHEMA, started_at_utc=iso(now), experiments=[])
    by_id={x['experiment_id']:x for x in ledger['experiments']}
    if len(by_id)!=len(ledger['experiments']):
        raise ValueError('TURAN_EXPERIMENT_DUPLICATE_ID')
    changed=set();new_count=settled=0
    for signal in bank.get('signals',[]):
        decision=epoch(signal.get('decision_at'))
        if decision is None or decision>now or now-decision>480000:
            raise ValueError('TURAN_EXPERIMENT_NONPROSPECTIVE_DECISION')
        for sid in signal['strategy_ids']:
            if sid not in registry or registry[sid].get('role')!='ENTRY_HYPOTHESIS':
                raise ValueError('TURAN_EXPERIMENT_NON_ENTRY_STRATEGY')
            item=new_experiment(signal,registry[sid],manifest['scan_id'])
            if item['experiment_id'] not in by_id:
                by_id[item['experiment_id']]=item
                ledger['experiments'].append(item)
                new_count+=1;changed.add(sid)
    frames=pack.get('candles_by_symbol',{})
    # Shared closed candles once per symbol/timeframe, not once per strategy.
    cache={}
    for item in ledger['experiments']:
        symbol=item['symbol']
        if symbol not in cache:
            cache[symbol]={tf:closed_rows(frames.get(symbol,{}).get(tf,[]),step,now)
                for tf,step in (('5m',B),('1H',H),('4H',4*H))}
        bars=cache[symbol]
        before=evidence_signature(item)
        for kind in ARMS:
            was=item['arms'][kind]['status']
            update_arm(item['arms'][kind],item,bars['5m'],bars['1H'],now,kind)
            settled+=int(was!='CLOSED' and item['arms'][kind]['status']=='CLOSED')
        for name,(span,tf,step) in HORIZONS.items():
            if item['horizons'].get(name,{}).get('state')=='OBSERVED':continue
            due=item['decision_ms']+span
            if now<due:
                continue  # TRACKING is implicit until new evidence matures.
            target=((due+step-1)//step)*step-step
            bar=next((b for b in bars[tf] if b['t']==target and b['t']+step>=due),None)
            if bar:
                sign=1 if item['direction']=='LONG' else -1
                item['horizons'][name]=dict(state='OBSERVED', observed_at=iso(now),
                    bar_close_at=iso(bar['t']+step), direction_pct=round(sign*(bar['c']/item['reference_price']-1)*100,6),
                    cash_pnl_usdt=None)
            else:
                item['horizons'][name]=dict(state='SOURCE_UNAVAILABLE')
        if before!=evidence_signature(item):
            changed.add(item['strategy_id'])
    if changed:ledger['last_learning_at_utc']=iso(now)
    ledger.update(last_scan_id=manifest['scan_id'],no_real_orders=True,separate_from_shared_cash=True)
    strategies=[]
    by_strategy=defaultdict(list)
    for item in ledger['experiments']:by_strategy[item['strategy_id']].append(item)
    for sid in IDS:
        items=by_strategy[sid]
        original=[x['arms']['ORIGINAL'] for x in items]
        original_closed=[x for x in original if x['status']=='CLOSED']
        arms={kind:dict(closed=sum(x['arms'][kind]['status']=='CLOSED' for x in items),
            modeled_net_usdt=round(sum(x['arms'][kind]['modeled_net_usdt'] or 0 for x in items if x['arms'][kind]['status']=='CLOSED'),6),
            complete_net_usdt=None) for kind in ARMS}
        strategies.append(dict(strategy_id=sid, challenger_version=sid+'-vNext-CHALLENGER-1',
            experiment_count=len(items), episode_count=len({x['episode_id'] for x in items}),
            learning_state='NEW_EVIDENCE' if sid in changed else 'BLOCKED_SOURCE' if registry[sid]['role']=='SOURCE_DEPENDENT_HYPOTHESIS' else 'NO_NEW_EVIDENCE',
            evidence_state='NEW_EVIDENCE' if sid in changed else 'NO_NEW_EVIDENCE',
            arm_status_counts={kind:dict(Counter(x['arms'][kind]['status'] for x in items)) for kind in ARMS},
            risk_blocked_count=sum(x['status']=='BLOCKED_RISK' for x in original),
            source_gap_count=sum(x['status']=='SOURCE_GAP' for x in original),
            arms=arms, original_outcomes=dict(Counter(x['outcome'] for x in original_closed)),
            horizon_counts={h:sum(x['horizons'].get(h,{}).get('state')=='OBSERVED' for x in items) for h in HORIZONS}))
    report=dict(schema=SCHEMA,scan_id=manifest['scan_id'],generated_at_utc=iso(now),
        no_real_orders=True,separate_from_shared_cash=True,experiment_policy=POLICY,
        started_at_utc=ledger['started_at_utc'], last_learning_at_utc=ledger.get('last_learning_at_utc'),
        new_experiments=new_count, settled_arms=settled, experiment_count=len(by_id),
        new_evidence_count=len(changed), no_new_evidence_count=200-len(changed),
        funding='UNKNOWN',liquidation='UNKNOWN',complete_net_usdt=None,
        episode_definition='COIN_DIRECTION_UTC_DAY_CLUSTER_NOT_PROVEN_INDEPENDENT',
        strategies=strategies,recent_experiments=ledger['experiments'][-20:],
        cost_model=dict(fee_per_side=FEE,slippage_per_side=SLIPPAGE,spread='BIRTH_HALF_SPREAD_PER_SIDE_ESTIMATE',
            notional_usdt=NOTIONAL,leverage=10,mark='LAST_CLOSED_5M_NOT_EXCHANGE_MARK',
            max_hold_hours=24,stop_atr=1,target_atr=2,ambiguity='STOP_FIRST',
            wait='FIRST_FULL_LATER_1H_DIRECTION_CONFIRMATION_THEN_NEXT_5M',
            inverse_is_independent=True, auto_promote=False))
    return ledger,report


def main():
    from v4_paper import save
    read=lambda p:json.loads((ROOT/p).read_text())
    archive=ROOT/'archive/turan-experiments-ledger.json'
    now=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    ledger,report=advance(read('archive/turan-experiments-ledger.json') if archive.exists() else {},
        read('web/data/uzayx-strategy-bank.json'),read('web/data/v4-manifest.json'),
        read('web/data/chart-pack.json'),now)
    save(archive,ledger);save(ROOT/'web/data/turan-experiments.json',report)
    print('TURAN_EXPERIMENTS',report['experiment_count'],'new',report['new_experiments'],
        'settled arms',report['settled_arms'],'NO_NEW_EVIDENCE',report['no_new_evidence_count'])


if __name__=='__main__':main()
