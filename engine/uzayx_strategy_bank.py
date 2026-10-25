#!/usr/bin/env python3
"""T001-T200 decision bank: explicit entry rules, controls and blocked sources.

The supplied catalogue contains hypotheses, execution controls and NO_TRADE,
not 200 interchangeable entry signals. No missing source is proxied by OHLC.
All implemented rules are forward paper experiments, never proven profits.
"""
import datetime as dt
import hashlib
import json
import math
import os
import pathlib
import statistics as st
from collections import Counter, defaultdict

import v4_early as early
import v4_paper
from uzayx_strategy_tournament import contest
from uzayx_research import closed_rows
from uzayx_evaluation import cycle_evaluations

ROOT=pathlib.Path(__file__).resolve().parents[1]
from turan_rules import VERSION, RULES, metrics, matches, change
import turan_rules
H=3600000
# Canonical v2 source digest is shared by forward observations and replay.
# Behavior changes require a new VERSION; source bytes make lineage reproducible.
RULE_IMPLEMENTATION_SHA256=hashlib.sha256(pathlib.Path(turan_rules.__file__).read_bytes()).hexdigest()
# Each threshold is frozen in a fingerprint; no random parameter search.
# Conditions are ANDed. A missing metric blocks evaluation, never becomes zero.

CONTROLS={20:'LOW_PARTICIPATION_VETO',25:'SPREAD_VETO',100:'BTC_SHOCK_VETO',158:'LIQUIDITY_GATE',
 159:'OPPOSING_STRATEGY_NO_TRADE',163:'24H_TIME_EXIT',165:'50_30_20_PARTIAL_TP',166:'CLOSED_ATR_STOP',
 167:'COIN_REENTRY_COOLDOWN',168:'LIQUIDITY_ENTRY_VETO',170:'MODELED_COST_TO_TARGET_GATE',
 172:'FAMILY_VOTING_RESEARCH',173:'PURGED_ANALOGUE_RESEARCH',174:'DIRECTION_CONFLICT_VETO',
 175:'1D_4H_REGIME_GATE',176:'EVIDENCE_PRIORITY_WITH_DETERMINISTIC_FALLBACK',178:'FUTURE_CLOSED_5M_FILL_GATE',
 179:'ONE_FAMILY_ONE_VOTE',181:'BIRTH_FEATURE_HISTORY_RESEARCH',182:'PURGED_EVENT_ANALOGUES',
 187:'ALL_OUTCOME_CONTEXT_LEARNING',188:'FIRST_EPISODE_SURVIVORSHIP_GUARD',
 189:'THREE_FOLD_TIME_VALIDATION',190:'RULE_AND_TRAINING_FINGERPRINT_LINEAGE',
 191:'ONE_COIN_TOTAL_POSITION',192:'EQUITY_AND_STOP_RISK_BUDGET',194:'DUPLICATE_SIGNAL_RISK_GATE',
 195:'FIVE_LOSS_FOUR_HOUR_PAUSE',196:'MODELED_COST_GATE',197:'PROSPECTIVE_ERROR_MONITOR',
 198:'STOP_LOSS_BUDGET_VETO',199:'NO_AUTO_ADAPTATION_BEFORE_FORWARD_VALIDATION',200:'NO_EDGE_NO_TRADE'}


def number(v):return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
def fingerprint(x):return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def policy():return json.loads((ROOT/'config/uzayx-strategy-policy.json').read_text())
def enabled():return policy().get('mode')=='TURAN200_ONLY'


def registry():
    source=json.loads((ROOT/'web/uzayx/turan-families-v1.json').read_text())['families']
    if len(source)!=200 or {x['id'] for x in source}!={f'T{i:03}' for i in range(1,201)}:raise ValueError('CATALOG_200_ID_CONTRACT')
    code=RULE_IMPLEMENTATION_SHA256;out=[]
    for x in source:
        i=int(x['id'][1:]);row={**x,'strategy_version':VERSION,'category':x['category']}
        if i in RULES:row.update(role='ENTRY_HYPOTHESIS',state='IMPLEMENTED_FORWARD_PAPER',conditions=RULES[i],required_source='CLOSED_OKX_OHLCV_1D_4H_1H')
        elif i in CONTROLS:row.update(role='CONTROL_OR_RESEARCH',state='IMPLEMENTED_CONTROL',control=CONTROLS[i])
        else:
            need=('TRADE_TAPE' if 11<=i<=19 else 'ORDER_BOOK_HISTORY' if 21<=i<=30 or i in (131,134,135,161,162,164,169,193) else
                  'VERIFIED_LIQUIDATION_STREAM' if 61<=i<=70 else 'ALIGNED_OI_FUNDING_HISTORY' if 71<=i<=80 else
                  'SYNCHRONIZED_SPOT_FUTURES_MARKETS' if 81<=i<=90 else 'POINT_IN_TIME_SECTOR_MEMBERSHIP' if 101<=i<=110 else
                  'VERIFIED_EVENT_CALENDAR' if 111<=i<=120 or i==137 else 'POINT_IN_TIME_ONCHAIN_DATA' if 121<=i<=130 else
                  'INDEPENDENT_FORWARD_OR_LONG_HISTORY')
            row.update(role='SOURCE_DEPENDENT_HYPOTHESIS',state='BLOCKED_REQUIRED_EVIDENCE',required_source=need)
        row['equivalence_group']='FAILED_BREAKOUT_REVERSAL' if i in (60,154) else x['id']
        row['strategy_config_hash']=fingerprint({'version':VERSION,'code':code,'rule':row})
        out.append(row)
    return out


def news_research_snapshot(now):
    """Editorial first sightings are context, never trade confirmations."""
    path=ROOT/'web/data/v4-context.json'
    try:
        doc=json.loads(path.read_text())
        seen=early.epoch(doc.get('updated_at'))
        if seen is None or not 0<=now-seen<=480000:return {'state':'STALE_OR_UNAVAILABLE','used_for_entry':False}
        return {'state':'OBSERVED_CONTEXT','source_at_utc':doc['updated_at'],
                'source_status':doc.get('source_status',{}),
                'headline_count':len(doc.get('latest_items',[])),
                'used_for_entry':False}
    except (OSError,ValueError,KeyError,TypeError):
        return {'state':'STALE_OR_UNAVAILABLE','used_for_entry':False}


def strategy_priority(book,now):
    """Only exact, forward-born primary attribution may earn a future weight.

    Legacy winners are never relabelled as a T-strategy's performance.
    """
    from uzayx_adaptive import samples
    rows,_=samples([book],now-H);groups={}
    for r in rows:
        sid=r.get('strategy_id')
        if sid and sid.startswith('T'):groups.setdefault(sid,[]).append(r)
    scores={}
    for sid,rs in groups.items():
        hours={}
        for r in rs:hours.setdefault(r['decision_ms']//H,[]).append(r['return_pct']-.1)
        if len(rs)<60 or len(hours)<24 or max(hours)-min(hours)<7*24:continue
        split=sorted(hours)[len(hours)//2]
        discovery=[r for r in rs if r['closed_ms']<split*H-H]
        holdout=[r for r in rs if r['decision_ms']>=split*H]
        if len(discovery)<30 or len(holdout)<30 or st.mean(r['return_pct'] for r in discovery)<=0:continue
        test_hours={}
        for r in holdout:test_hours.setdefault(r['decision_ms']//H,[]).append(r['return_pct']-.1)
        if len(test_hours)<12:continue
        ys=[st.mean(v) for v in test_hours.values()]
        # Conservative heuristic across many candidates; not a calibrated CI.
        lower=st.mean(ys)-3.5*st.stdev(ys)/math.sqrt(len(ys))
        if lower>0:scores[sid]=round(lower,6)
    return scores


def build(mtf,market,pack,now,prior_cash=None):
    source=early.epoch(mtf.get('fetched_at'));qtime=early.epoch(market.get('fetched_at'))
    if (mtf.get('provider')!='OKX' or market.get('provider')!='OKX' or
        pack.get('source')!='OKX_CLOSED_CANDLES' or pack.get('source_mtf_at')!=mtf.get('fetched_at') or
        source is None or qtime is None or not 0<=now-source<=480000 or not 0<=now-qtime<=480000):raise ValueError('STRATEGY_MIXED_OR_STALE_SOURCE')
    rows_by={}
    for s,f in pack['candles_by_symbol'].items():
        packed=f.get('1H',[]);rows=closed_rows(packed,H,now)
        volumes={int(r[0]):r[5] for r in packed if len(r)==6 and number(r[5]) and r[5]>=0}
        if any(r['t'] not in volumes for r in rows):raise ValueError('INVALID_STRATEGY_VOLUME')
        rows_by[s]=[{**r,'v':volumes[r['t']]} for r in rows]
    for s,rows in list(rows_by.items()):
        if len(rows)<30 or any(b['t']-a['t']!=H for a,b in zip(rows,rows[1:])):rows_by[s]=[]
    btc=rows_by.get('BTCUSDT',[]);moves=[change(r,4) for r in rows_by.values() if len(r)>4]
    bank=registry();index={r['id']:r for r in bank};quotes={x['symbol']:x for x in market['rows']};signals=[];evaluated=Counter();blocked=Counter()
    candidate_events=defaultdict(list);matched_events=defaultdict(list);strategy_signals=defaultdict(list)
    evaluation_cycle_id=fingerprint({'model':VERSION,'mtf':mtf['fetched_at'],'market':market['fetched_at'],
        'chart_pack':pack.get('fetched_at'),'candidate_symbols':sorted(c.get('symbol','') for c in mtf.get('candidates',[]))})[:24]
    workflow_run_id=os.environ.get('GITHUB_RUN_ID')
    tournament=contest([prior_cash]+[json.loads(p.read_text()) for p in sorted((ROOT/'archive/epochs').glob('*/spark-ledger.json'))],now,strategy_version=VERSION) if prior_cash else None
    priority=tournament['promoted'] if tournament else {};paused=tournament['quarantine'] if tournament else {};seen=set()
    directional=[]
    for original in mtf.get('candidates',[]):
        directional.extend({**original,'side':side} for side in ('LONG','SHORT'))
    for c in directional:
        sym=c.get('symbol');side=c.get('side');q=quotes.get(sym,{})
        if (sym,side) in seen or side not in ('LONG','SHORT'):continue
        seen.add((sym,side));f=c.get('frames') or {}
        if c.get('quality')!='COMPLETE' or not all(early.closed(f.get(tf),tf,now) for tf in ('1D','4H','1H')):continue
        if not rows_by.get(sym) or rows_by[sym][-1]['t']!=early.epoch(f['1H']['last_candle_utc']):continue
        if q.get('instrument_state')!='live' or not number(q.get('price')) or q['price']<=0:continue
        event_id='EVT-'+fingerprint({'cycle':evaluation_cycle_id,'symbol':sym,'side':side,
            'closed_1h':f['1H'].get('last_candle_utc'),'closed_4h':f['4H'].get('last_candle_utc'),
            'closed_1d':f['1D'].get('last_candle_utc')})[:24]
        m=metrics(c,rows_by.get(sym,[]),btc,moves,side)
        if not m:
            for i in RULES:
                sid=f'T{i:03}';blocked[sid]+=1;candidate_events[sid].append(event_id)
            continue
        triggered=[]
        for i,conditions in RULES.items():
            sid=f'T{i:03}';candidate_events[sid].append(event_id)
            if any(m.get(k) is None for k,_,_ in conditions):blocked[sid]+=1;continue
            evaluated[sid]+=1
            if matches(conditions,m):
                triggered.append(sid);matched_events[sid].append(event_id)
        if not triggered:continue
        triggered.sort(key=lambda sid:(sid in paused,-priority.get(sid,0),sid))
        costs=.18+(q['spread_bps'] if number(q.get('spread_bps')) else 1000)/100
        liquid=number(q.get('volume')) and q['volume']>=10000000 and number(q.get('spread_bps')) and q['spread_bps']<=20 and number(q.get('listing_age_days')) and q['listing_age_days']>=7
        no_btc_shock=bool(len(btc)>4 and abs(change(btc,1))<3)
        cash=bool(m['macro'] and liquid and no_btc_shock and f['1H']['atr_pct']>costs*3 and
                  (not m['breakout'] or (m.get('relative_volume') or 0)>=.6))
        representatives={}
        for sid in sorted(triggered):representatives.setdefault(index[sid]['equivalence_group'],sid)
        independent=list(representatives.values())
        primary=triggered[0]
        per_strategy_signal_ids={sid:'SIG-'+fingerprint({'event_id':event_id,'strategy_id':sid,
            'strategy_version':VERSION,'strategy_config_hash':index[sid]['strategy_config_hash']})[:24] for sid in triggered}
        for sid,sigid in per_strategy_signal_ids.items():strategy_signals[sid].append(sigid)
        if primary in paused:cash=False
        stage=3 if cash else 2 if m['macro'] else 1
        level=f['1H'].get('breakout_high_prev8' if side=='LONG' else 'breakout_low_prev8') or q['price']
        signals.append({'event_id':event_id,'signal_id':per_strategy_signal_ids[primary],
            'strategy_signal_ids':per_strategy_signal_ids,'symbol':sym,'side':side,'strategy_id':primary,'strategy_ids':triggered,
            'strategy_version':VERSION,'strategy_config_hash':index[primary]['strategy_config_hash'],
            'strategy_family':index[primary]['category'],'strategy_policy':'TURAN200_ONLY',
            'selection_basis':'FORWARD_IDENTIFIED_STRESS_EVIDENCE' if primary in priority else 'FIXED_ID_NO_VALIDATED_WINNER',
            'family_vote_count':len({index[t]['category'] for t in independent}),
            'strategy_evidence':{'matched_conditions':index[primary]['conditions'],'observed':{k:m[k] for k,_,_ in index[primary]['conditions']}},
            'research_tier':{1:'KIVILCIM',2:'ERKEN_SINYAL',3:'ISIK_GUCLENIYOR'}[stage],
            'research_rank':min(90,50+5*len({index[t]['category'] for t in independent})+10*int(cash)),
            'paper_stage_number':stage,'paper_stage_name':{1:'İZLENEN',2:'GELMEKTE OLAN',3:'GELDİ'}[stage],
            'hourly_level_state':'CLOSED_1H_LEVEL_BREACHED' if cash else 'WAIT_FOR_NEW_1H_CLOSE',
            'stage_confirmation':'VERSIONED_STRATEGY_TRIGGER_AND_COST_REGIME_GATE',
            'hourly_level':level,'price_at_scan':q['price'],
            'source_closed_1h_at_utc':f['1H']['last_candle_utc'],'source_closed_4h_at_utc':f['4H']['last_candle_utc'],
            'source_closed_1d_at_utc':f['1D']['last_candle_utc'],'source_observed_at_utc':mtf['fetched_at'],
            'relative_volume_4h':f['4H'].get('volume_ratio_20'),'relative_volume_1h':f['1H'].get('volume_ratio_20'),
            'trend_1d':f['1D']['trend'],'trend_4h':f['4H']['trend'],'trend_1h':f['1H']['trend'],
            'trend_1w':(f.get('1W') or {}).get('trend','UNKNOWN'),
            'aligned_main_count':int(m['macro'])*2,'supporting_factor_count':len(independent),'matched_strategy_id_count':len(triggered),
            'structure_risk_score':c.get('structure_risk_score'),'spread_bps':q.get('spread_bps'),'volume_24h_usdt':q.get('volume'),
            'reasons':[primary,'T175_REGIME','T170_MODELED_COSTS'] if cash else [primary,'FORWARD_LOSS_PAUSE' if primary in paused else 'WAIT_CASH_GATES'],
            'paper_eligible':False,'real_order_eligible':False,'source_quality':'VERIFIED_CLOSED_OHLC',
            'probability_calibrated':False,'verified_technical_entry':cash,
            'modeled_roundtrip_cost_pct':costs,'funding':'UNMODELED'})
    conflicts={s['symbol'] for s in signals if any(t['symbol']==s['symbol'] and t['side']!=s['side'] and t['paper_stage_number']==3 for t in signals) and s['paper_stage_number']==3}
    for s in signals:
        if s['symbol'] in conflicts:
            s.update(paper_stage_number=2,paper_stage_name='GELMEKTE OLAN',hourly_level_state='WAIT_FOR_NEW_1H_CLOSE',verified_technical_entry=False)
            s['reasons'].append('T174_DIRECTION_CONFLICT_NO_TRADE')
    for r in bank:r.update(evaluated_candidates=evaluated[r['id']],source_blocked_candidates=blocked[r['id']])
    evaluations,evaluation_summary=cycle_evaluations(evaluation_cycle_id,bank,evaluated,blocked,
        matched_events,strategy_signals,candidate_events,workflow_run_id)
    # One shared immutable source identity; every strategy links to the same data.
    snapshot_id='SNAP-'+fingerprint({'mtf':mtf,'market':market,'chart_pack':pack})[:24]
    available_at=early.stamp(max(source,qtime))
    evaluation_by_id={row['strategy_id']:row for row in evaluations}
    for row in evaluations:
        row.update(snapshot_id=snapshot_id,cycle_id=evaluation_cycle_id,
            evaluated_at_utc=early.stamp(now),source_available_at=available_at,
            data_quality='VERIFIED_CLOSED_OHLC' if row['candidate_count'] else
                         'CONTROL_RESEARCH_ONLY' if row['role']=='CONTROL_OR_RESEARCH' else 'BLOCKED_SOURCE')
    for signal in signals:
        signal.update(evaluation_id=evaluation_by_id[signal['strategy_id']]['evaluation_id'],
            strategy_evaluation_ids={sid:evaluation_by_id[sid]['evaluation_id'] for sid in signal['strategy_ids']},
            snapshot_id=snapshot_id,cycle_id=evaluation_cycle_id,decision_at=early.stamp(now),
            source_available_at=available_at,observed_at=mtf['fetched_at'],
            bar_close_at=early.stamp(max(early.epoch(signal['source_closed_1h_at_utc'])+H,
                early.epoch(signal['source_closed_4h_at_utc'])+4*H,
                early.epoch(signal['source_closed_1d_at_utc'])+24*H)),
            exchange='OKX',contract_type='USDT-SWAP',direction=signal['side'],
            atr_pct_at_decision=(next(c for c in mtf['candidates'] if c['symbol']==signal['symbol'])['frames']['1H']['atr_pct']))
    return {'model_version':VERSION,'updated_at':early.stamp(now),'source_mtf_at':mtf['fetched_at'],
            'snapshot_id':snapshot_id,
            'evaluation_cycle_id':evaluation_cycle_id,'workflow_run_id':workflow_run_id,
            'cycle_evaluations':evaluations,'evaluation_summary':evaluation_summary,
            'source_market_at':market['fetched_at'],'policy':'TURAN200_ONLY','registry':bank,'registry_count':200,
            'registry_hash':fingerprint(bank),'direction_evaluation':{'mode':'BOTH_DIRECTIONS_SAME_CLOSED_SOURCE','evaluated_coin_directions':len(seen),'cash_regime_gate_unchanged':True},'signals':signals,'role_counts':dict(Counter(r['role'] for r in bank)),
            'state_counts':dict(Counter(r['state'] for r in bank)),
            'no_trade':not any(s['paper_stage_number']==3 for s in signals),'no_real_orders':True,
            'forward_validated_priority':priority,'news_research':news_research_snapshot(now),
            'strategy_contest':{'board':tournament['board'],'source_audit':tournament['source_audit'],
                'paused_primary_ids':sorted(paused),'provisional_winners':sorted(priority),
                'selection_requires_days':7,'selection_requires_primary_closed':60,
                'supporting_matches_share_the_same_position':True,'inverse_pnl_pct':None} if tournament else None,
            'hypotheses_are_not_validated_profits':True,'funding':'UNMODELED','liquidation':'UNVERIFIED'}


def read_feed(mtf_at):
    d=json.loads((ROOT/'web/data/uzayx-strategy-bank.json').read_text())
    if d.get('policy')!='TURAN200_ONLY' or d.get('source_mtf_at')!=mtf_at or d.get('registry_count')!=200:raise ValueError('STRATEGY_FEED_MISMATCH')
    return d


def lifecycle_proposals(feed,candidates):
    by={c['symbol']:c for c in candidates};out=[]
    for s in feed['signals']:
        c=by.get(s['symbol'],{});f=c.get('frames') or {};atr=(f.get('1H') or {}).get('atr_pct')
        if not number(atr) or atr<=0:continue
        sign=1 if s['side']=='LONG' else -1;gap=s['price_at_scan']*atr/100
        out.append({'symbol':s['symbol'],'side':s['side'],'strategy_id':s['strategy_id'],
            'strategy_version':s['strategy_version'],'market_quality':'VERIFIED_CLOSED_OHLC',
            'source_candle_closed_at_utc':early.stamp(early.epoch(s['source_closed_1h_at_utc'])+H),
            'h4_candle_closed_at_utc':early.stamp(early.epoch(s['source_closed_4h_at_utc'])+4*H),
            'discovery':True,'motion':s['paper_stage_number']>=2,'spotlight':s['paper_stage_number']==3,
            'entry_eligible':False,'score':s['research_rank'],'risk_score':s['structure_risk_score'] or 0,
            'reason_codes':s['reasons'],'metrics_used':{'strategy_config_hash':s['strategy_config_hash'],'strategy_ids':s['strategy_ids'],**s['strategy_evidence']},
            'price':s['price_at_scan'],'stop':s['price_at_scan']-sign*gap,
            'targets':[s['price_at_scan']+sign*gap*i for i in (1,2,3)],'factor_groups':{'strategy':s['strategy_id']}})
    return out


def main():
    read=lambda p:json.loads((ROOT/p).read_text())
    now=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    report=build(read('web/data/mtf.json'),read('web/data/market.json'),read('web/data/chart-pack.json'),now,
                 read('archive/v4-spark-paper-ledger.json'))
    v4_paper.save(ROOT/'web/data/uzayx-strategy-bank.json',report)
    print('TURAN200',report['state_counts'],'signals',len(report['signals']),'NO_TRADE',report['no_trade'])


if __name__=='__main__':main()
