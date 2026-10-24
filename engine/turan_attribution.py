"""Conservative birth-record attribution, without relabeling or rewriting tickets."""
import datetime as dt
import math

LEVELS=('EXACT','RECONSTRUCTED','CANDIDATE','UNATTRIBUTED')
IDS={f'T{i:03}' for i in range(1,201)}


def number(x):
    return isinstance(x,(float,int)) and not isinstance(x,bool) and math.isfinite(x)


def epoch(value):
    try:
        stamp=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
        return stamp.timestamp() if stamp.tzinfo else None
    except (ValueError,TypeError,AttributeError):
        return None


def classify(ticket):
    sid=ticket.get('turan_strategy_id') or ticket.get('strategy_id')
    result=dict(strategy_id=sid if sid in IDS else None,level='UNATTRIBUTED',
        eligible_for_strategy_pnl=False,reason='NO_TURAN_BIRTH_RECORD')
    if sid not in IDS:return result
    result.update(level='CANDIDATE',reason='INSUFFICIENT_BIRTH_EVIDENCE')
    proof=ticket.get('strategy_evidence') or {}
    conditions=proof.get('matched_conditions')
    observed=proof.get('observed')
    birth=epoch(ticket.get('decision_at_utc'))
    candle=epoch(ticket.get('source_1h_candle'))
    if (ticket.get('attribution_kind')!='EXACT_TURAN_RULE_AT_BIRTH' or
        ticket.get('strategy_id')!=sid or ticket.get('turan_strategy_id')!=sid or
        not ticket.get('strategy_version') or not ticket.get('strategy_config_hash') or
        not ticket.get('symbol') or ticket.get('side') not in ('LONG','SHORT') or
        birth is None or candle is None or candle+3600>birth or
        not ticket.get('features_at_birth') or not isinstance(conditions,list) or
        not conditions or not isinstance(observed,dict)):
        return result
    for condition in conditions:
        if not isinstance(condition,(list,tuple)) or len(condition)!=3:return result
        key,op,expected=condition
        actual=observed.get(key)
        if actual is None:return result
        if op=='==':passed=actual==expected
        elif op in ('>','>=','<=') and number(actual) and number(expected):
            passed=actual>expected if op=='>' else actual>=expected if op=='>=' else actual<=expected
        else:passed=False
        if not passed:return result
    # Explicit contradictory provenance cannot be upgraded to reconstructed.
    available=epoch(ticket.get('source_available_at'))
    decision=epoch(ticket.get('decision_at'))
    if (available is not None and (decision is None or available>decision or decision>birth)):
        result['reason']='SOURCE_AFTER_DECISION';return result
    result.update(level='RECONSTRUCTED',eligible_for_strategy_pnl=True,
        reason='CONTEMPORANEOUS_FROZEN_RULE_AND_CLOSED_BAR_BIRTH_RECORD')
    chain=('signal_id','evaluation_id','cycle_id','snapshot_id','strategy_event_id',
        'source_scan_id','position_id','ledger_id','exchange','contract_type')
    if (all(isinstance(ticket.get(k),str) and ticket[k] for k in chain) and
        available is not None and decision is not None and candle+3600<=available<=decision<=birth and
        ticket['position_id']==ticket.get('event_id')):
        result.update(level='EXACT',reason='COMPLETE_FORWARD_SIGNAL_EVALUATION_TICKET_CHAIN')
    return result


def summarize(tickets):
    counts=dict.fromkeys(LEVELS,0);by_strategy={};seen=set();rows=[]
    attributed=unattributed=0.;filled=attributed_filled=0
    for ticket in tickets:
        key=ticket.get('event_id')
        if not key or key in seen:raise ValueError('ATTRIBUTION_DUPLICATE_TICKET')
        seen.add(key)
        proof=classify(ticket);counts[proof['level']]+=1
        r,u=ticket.get('realized_net_usdt'),ticket.get('unrealized_net_usdt')
        if not number(r) or not number(u):raise ValueError('ATTRIBUTION_INVALID_PNL')
        pnl=r+u;is_filled=ticket.get('status') in ('OPEN','CLOSED')
        filled+=int(is_filled)
        if proof['eligible_for_strategy_pnl']:
            attributed+=pnl;attributed_filled+=int(is_filled)
            group=by_strategy.setdefault(proof['strategy_id'],dict(counts=dict.fromkeys(LEVELS,0),
                modeled_pnl_usdt=0.,closed=0,open=0,filled=0))
            group['counts'][proof['level']]+=1
            group['modeled_pnl_usdt']+=pnl
            group['closed']+=int(ticket.get('status')=='CLOSED')
            group['open']+=int(ticket.get('status')=='OPEN')
            group['filled']+=int(is_filled)
        else:unattributed+=pnl
        rows.append(dict(ticket_id=key,**proof,status=ticket.get('status'),
            signal_id=ticket.get('signal_id'),evaluation_id=ticket.get('evaluation_id'),
            snapshot_id=ticket.get('snapshot_id'),modeled_pnl_usdt=round(pnl,6)))
    for group in by_strategy.values():group['modeled_pnl_usdt']=round(group['modeled_pnl_usdt'],6)
    return dict(schema='turan.attribution.v1',counts=counts,ticket_count=len(seen),
        filled_count=filled,attributed_filled_count=attributed_filled,
        attribution_rate_pct=round(attributed_filled/filled*100,2) if filled else None,
        attributed_modeled_pnl_usdt=round(attributed,6),unattributed_modeled_pnl_usdt=round(unattributed,6),
        complete_net_pnl_usdt=None,funding='UNKNOWN',liquidation='UNKNOWN',
        by_strategy=by_strategy,recent_tickets=rows[:30],
        reconstruction='FROZEN_BIRTH_RULE_RECORD_ONLY_NO_CURRENT_SIGNAL_MATCHING',
        shared_cash_counted_once=True,source='UZAYX_SHARED_SPARK_PAPER')
