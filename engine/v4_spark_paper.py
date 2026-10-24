#!/usr/bin/env python3
"""Every NEW early spark gets an auditable virtual ticket, never a real order.

No historical backfills. Fills are inferred ONLY from a *later fully closed*
OKX 5-minute candle's open (estimated; never an exchange execution).
Each event is kept permanently. Costs and slippage are explicit assumptions.
The strict 10k V4 account remains independent and unmodified.
"""
import datetime as dt
import math
import json
import pathlib
import mtf
import v4_paper
import v4_early

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web'/'data'
ARCH=ROOT/'archive'/'v4-spark-paper-ledger.json'
VERSION='4.0.3-spark-paper-a1'
BAR=300000
DAY=86400000
MIN_MARGIN_USDT=30.0
BASE_LEVERAGE=10
MAX_LEVERAGE=20
NOTIONAL=MIN_MARGIN_USDT*BASE_LEVERAGE  # baseline 300 USDT nominal / 30 USDT margin
START_CASH=10000.0
FEE=0.0006
SLIPPAGE=0.0003
MAX_HOLD=24*3600000
TIER_STAGE={'KIVILCIM':1,'ERKEN_SINYAL':2,'ISIK_GUCLENIYOR':3}
def stamp(ms):return dt.datetime.fromtimestamp(ms/1000,dt.timezone.utc).isoformat()
def valid(x):return isinstance(x,(float,int)) and not isinstance(x,bool) and math.isfinite(x) and x>0
def choose_leverage(candidate, source):
    """Conservative qualitative confirmation tiers, NOT calibrated success odds."""
    if candidate.get('strategy_policy')=='TURAN200_ONLY':return BASE_LEVERAGE
    rank=candidate.get('research_rank')
    rank=float(rank) if isinstance(rank,(int,float)) and not isinstance(rank,bool) and math.isfinite(rank) else 0
    h=(source.get('frames') or {}).get('4H') or {}
    d=(source.get('frames') or {}).get('1D') or {}
    adx=h.get('adx_14'); vol=h.get('volume_ratio_20')
    adx=adx if valid(adx) else 0
    vol=vol if valid(vol) else 0
    stage=candidate.get('paper_stage_number',TIER_STAGE.get(candidate.get('research_tier'),1))
    stage=stage if isinstance(stage,int) and not isinstance(stage,bool) else 1
    side=candidate.get('side')
    hist=((h.get('macd_12_26_9') or {}).get('hist_pct'))
    aligned= isinstance(hist,(float,int)) and math.isfinite(hist) and (
        (side=='LONG' and hist>0) or (side=='SHORT' and hist<0))
    daily=d.get('trend')
    # None/missing evidence always stays at 10x. These are research heuristics.
    leverage=10
    if rank>=65 and adx>=22 and vol>=1.0:leverage=15
    if rank>=80 and stage>=2 and adx>=28 and vol>=1.2 and aligned:leverage=20
    return min(MAX_LEVERAGE,max(BASE_LEVERAGE,leverage))

RISK_POLICY='prospective-stop-budget-v1-20261020'
def identity(early,event,kind,now_ms):
    """Exact native rule at birth; never infer a TURAN ID for old tickets."""
    import hashlib,json
    config={'source_model':early.get('model_version'),'paper_model':VERSION,
            'kind':kind,'fee':FEE,'slippage':SLIPPAGE,'max_hold':MAX_HOLD,
            'min_margin':MIN_MARGIN_USDT,'max_leverage':MAX_LEVERAGE,
            'risk_policy':RISK_POLICY}
    native={'strategy_id':'SPARK_'+kind,'strategy_version':VERSION,
            'strategy_config_hash':hashlib.sha256(json.dumps(config,sort_keys=True).encode()).hexdigest(),
            'parent_event_id':event.get('event_id'),'source_scan_id':early.get('scan_id'),
            'decision_at_utc':stamp(now_ms),'risk_policy_version':RISK_POLICY,
            'attribution_kind':'EXACT_NATIVE_RULE','turan_strategy_id':None}
    if event.get('strategy_policy')=='TURAN200_ONLY':
        native.update(strategy_id=event['strategy_id'],strategy_version=event['strategy_version'],
            strategy_config_hash=event['strategy_config_hash'],strategy_ids=list(event['strategy_ids']),
            strategy_family=event['strategy_family'],strategy_evidence=event['strategy_evidence'],
            strategy_policy='TURAN200_ONLY',turan_strategy_id=event['strategy_id'],
            attribution_kind='EXACT_TURAN_RULE_AT_BIRTH',control_strategy_ids=[
                'T163','T165','T166','T167','T170','T174','T175','T178','T179',
                'T191','T192','T194','T195','T196','T198','T200'])
        for field in ('signal_id','evaluation_id','cycle_id','snapshot_id','strategy_signal_ids',
                      'strategy_evaluation_ids','source_available_at','decision_at','observed_at',
                      'bar_close_at','exchange','contract_type','direction'):
            if field in event:native[field]=event[field]
        native['strategy_event_id']=event.get('strategy_event_id',event.get('event_id'))
        native['ledger_id']='UZAYX_SHARED_SPARK_PAPER'
    return native

def feature_snap(c):
    f=c.get('frames',{})
    features={}
    for tf in ('1H','4H','1D'):
        x=f.get(tf) or {}
        macd=x.get('macd_12_26_9') or {}
        features[tf]={'rsi':x.get('rsi_14'),'macd_hist_pct':macd.get('hist_pct'),
            'bb_width_pct':x.get('bb_width_pct'),'bb_compression_percentile':x.get('bb_compression_percentile_30'),
            'adx':x.get('adx_14'),'relative_volume':x.get('volume_ratio_20'),
            'atr_pct':x.get('atr_pct'),'trend':x.get('trend'),
            'source_closed_at_utc':x.get('last_candle_utc')}
    return features
def initial(now_ms):
    return {'model_version':VERSION,'started_at':stamp(now_ms),'started_ms':now_ms,
      'last_scan_id':None,'last_run_ms':now_ms,'tickets':[],
      'starting_balance_usdt':START_CASH,'ticket_notional_usdt':NOTIONAL,
      'no_real_orders':True,'no_historical_backfill':True}
def ledger_stats(tickets):
    totals={'WAITING_FUTURE_BAR':0,'OPEN':0,'CLOSED':0,
            'DATA_GAP':0,'INVALID_LEVEL':0,'CAPACITY_BLOCKED':0,'OPPOSITE_CANCELLED':0}
    realized=0.0;floating=0.0;exposure=0.0;fees=0.0
    for t in tickets:
        state=t['status']
        totals[state]=totals.get(state,0)+1
        realized+=float(t.get('realized_net_usdt') or 0)
        if state=='OPEN':floating+=float(t.get('unrealized_net_usdt') or 0)
        fees+=float(t.get('fees_estimated_usdt') or 0)
        if state=='OPEN':exposure+=float(t.get('remaining_notional_usdt') or 0)
    return {'counts':totals,'virtual_equity_usdt':round(START_CASH+realized+floating,5),
            'realized_net_usdt':round(realized,5),'unrealized_net_usdt':round(floating,5),
            'open_reference_exposure_usdt':round(exposure,4),
            'estimated_fees_usdt':round(fees,5)}
def utc_day(value):
    try:
        ts=dt.datetime.fromisoformat(str(value).replace('Z','+00:00'))
        return ts.astimezone(dt.timezone.utc).date().isoformat() if ts.tzinfo else None
    except (ValueError,TypeError,OverflowError):return None

def compute_daily(tickets,now_ms):
    """UTC cohort and cash results from immutable events, never price backfill.

    Realized PnL is booked on exit dates, including partial TPs. Open mark PnL
    is separate and may be stale. No daily profit is invented for missing data.
    """
    today=dt.datetime.fromtimestamp(now_ms/1000,dt.timezone.utc).date().isoformat()
    groups={}
    def day(k):
        if k not in groups:
            groups[k]={'date_utc':k,'geldi':0,'all_sparks':0,'new_opened':0,
                'new_geldi_opened':0,'closed':0,'geldi_closed':0,
                'positive_closures':0,'negative_closures':0,
                'realized_net_usdt':0.0,'geldi_realized_net_usdt':0.0,
                'unrealized_geldi_usdt':0.0,'unrealized_all_usdt':0.0,
                'waiting_geldi':0,'blocked_geldi':0}
        return groups[k]
    for t in tickets:
        is_geldi=t.get('entry_class')=='GELDI'
        first=utc_day(t.get('signal_at_utc'))
        if first:
            a=day(first)
            if is_geldi:
                a['geldi']+=1
                if t['status']=='WAITING_FUTURE_BAR':a['waiting_geldi']+=1
                if t['status'] in ('INVALID_LEVEL','CAPACITY_BLOCKED','DATA_GAP'):
                    a['blocked_geldi']+=1
            else:a['all_sparks']+=1
        opened=utc_day(t.get('filled_at_utc'))
        if opened:
            a=day(opened);a['new_opened']+=1
            if is_geldi:a['new_geldi_opened']+=1
        if t['status']=='OPEN':
            u=float(t.get('unrealized_net_usdt') or 0)
            day(today)['unrealized_all_usdt']+=u
            if is_geldi:day(today)['unrealized_geldi_usdt']+=u
        for e in t.get('exits',[]):
            exit_day=utc_day(e.get('closed_at_utc'))
            if exit_day:
                a=day(exit_day);net=float(e.get('net_usdt') or 0)
                a['realized_net_usdt']+=net
                if is_geldi:a['geldi_realized_net_usdt']+=net
        if t['status']=='CLOSED':
            key=utc_day(t.get('closed_at_utc'))
            if key:
                a=day(key);a['closed']+=1
                if is_geldi:a['geldi_closed']+=1
                net=float(t.get('realized_net_usdt') or 0)
                a['positive_closures']+=int(net>0);a['negative_closures']+=int(net<0)
    day(today)
    for a in groups.values():
        for k in ('realized_net_usdt','geldi_realized_net_usdt','unrealized_all_usdt','unrealized_geldi_usdt'):
            a[k]=round(a[k],7)
    days=sorted(groups.values(),key=lambda x:x['date_utc'],reverse=True)
    return {'timezone':'UTC','today_utc':today,'today':groups[today],
            'days':days[:90],'all_time_days':len(days),'per_event_deduplicated':True,
            'realized_assigned_to_exit_day':True,'funding_state':'UNMODELED',
            'paper_intent_not_guaranteed_fill':True}

def settle(t,raw,share,label,ts):
    side=1 if t['side']=='LONG' else -1
    qty=min(t['remaining_qty'],t['total_qty']*share)
    if qty<=0:return
    exit_price=raw*(1-side*SLIPPAGE)
    fee=qty*exit_price*FEE
    entry_share=t['entry_fee_usdt']*qty/t['total_qty']
    net=side*(exit_price-t['fill_price'])*qty-fee-entry_share
    t['remaining_qty']=max(0,t['remaining_qty']-qty)
    t['realized_net_usdt']=round(t['realized_net_usdt']+net,9)
    t['fees_estimated_usdt']=round(t['fees_estimated_usdt']+fee,9)
    t.setdefault('exits',[]).append({'kind':label,'closed_at_utc':stamp(ts),
        'price':exit_price,'qty':qty,'net_usdt':round(net,8)})
    t['remaining_notional_usdt']=t['remaining_qty']*t['fill_price']
    if t['remaining_qty']<=t['total_qty']*1e-8:
        t['remaining_qty']=0.0;t['remaining_notional_usdt']=0.0
        t['status']='CLOSED';t['closed_at_utc']=stamp(ts)
        t['outcome']=label
def mark(t,close):
    sign=1 if t['side']=='LONG' else -1
    t['mark_price']=close
    remaining_entry_fee=t['entry_fee_usdt']*t['remaining_qty']/t['total_qty']
    t['unrealized_net_usdt']=round(sign*(close-t['fill_price'])*t['remaining_qty']-
       remaining_entry_fee-t['remaining_qty']*close*FEE,9)
def advance(prior,early,mtf_doc,now_ms,candles):
    strategy_mode=early.get('strategy_policy')=='TURAN200_ONLY'
    if strategy_mode:
        import uzayx_strategy_bank as bank
        rules={r['id']:r for r in bank.registry() if r['role']=='ENTRY_HYPOTHESIS'}
        for x in early.get('candidates',[]):
            rule=rules.get(x.get('strategy_id'))
            if (rule is None or x.get('strategy_policy')!='TURAN200_ONLY' or
                x.get('strategy_config_hash')!=rule['strategy_config_hash'] or x.get('strategy_version')!=rule['strategy_version']):
                raise ValueError('UNVERIFIED_STRATEGY_CASH_INTENT')
    if early.get('source_mtf_at')!=mtf_doc.get('fetched_at'):
        raise RuntimeError('spark-mixed-mtf')
    if early.get('research_only') is not True or early.get('no_paper_entries') is not True:
        raise RuntimeError('early-research-policy-corruption')
    # Preserve every real 4.02 virtual ticket and its original first-seen
    # price/status. 4.03 is a schema upgrade, not a new/backfilled experiment.
    old=dict(prior) if prior.get('model_version') in (VERSION,'4.0.2-spark-paper-a1') else initial(now_ms)
    old['model_version']=VERSION
    old['ticket_notional_usdt']=NOTIONAL
    if old['last_scan_id']==early.get('scan_id'):
        # Idempotent replay; no second fill, fee, or duplicate event.
        pass
    index={x['event_id']:x for x in old.get('tickets',[])}
    frames={(x.get('symbol'),x.get('side')):x for x in mtf_doc.get('candidates',[])}
    # This engine observes only *new* discoveries after its initial deployment,
    # not earlier research events retroactively reclassified as paper fills.
    since=max(int(old.get('last_run_ms',now_ms))-90000,
              int(old.get('epoch_cutoff_ms') or 0))
    for x in early.get('candidates',[]):
        if strategy_mode:continue  # watch or spark alone never opens cash
        k=x.get('event_id');first=v4_early.epoch(x.get('first_seen_at_utc'))
        if (not k or k in index or x.get('paper_eligible') is not False or
            x.get('real_order_eligible') is not False or
            not first or first<since or first>now_ms or
            x.get('side') not in ('LONG','SHORT') or not valid(x.get('first_seen_price'))):
            continue
        src=frames.get((x['symbol'],x['side'])) or {}
        h=(src.get('frames') or {}).get('1H') or {}
        atr=h.get('atr_pct')
        sign=1 if x['side']=='LONG' else -1
        price=x['first_seen_price']
        gap=price*atr/100 if valid(atr) and atr<35 else None
        ok=bool(gap and gap<price)
        ticket={'event_id':k,'symbol':x['symbol'],'side':x['side'],
           'signal_at_utc':x['first_seen_at_utc'],'signal_price':price,
           'stage_at_birth':x['research_tier'],
           'stage_at_birth_number':x.get('paper_stage_number',TIER_STAGE.get(x['research_tier'],1)),
           'stage_definition':'CLOSED_1H_BREAKOUT_REQUIRED',
           'stage':x.get('paper_stage_number',TIER_STAGE.get(x['research_tier'],1)),
           'stage_transitions':[{'at_utc':stamp(now_ms),'stage':x.get('paper_stage_number',TIER_STAGE.get(x['research_tier'],1)),
                                  'tier':x['research_tier']}],
           'rank_at_birth':x['research_rank'],'source_1h_candle':x.get('source_closed_1h_at_utc'),
           'features_at_birth':feature_snap(src),'reasons_at_birth':x.get('reasons',[]),
           'hourly_threshold':x.get('hourly_level'),
           'status':'WAITING_FUTURE_BAR' if ok else 'INVALID_LEVEL',
           'stop':price-sign*gap if ok else None,
           'tp1':price+sign*gap if ok else None,
           'tp2':price+sign*2*gap if ok else None,
           'tp3':price+sign*3*gap if ok else None,
           'atr_pct_used':atr if ok else None,
           'reference_notional_usdt':MIN_MARGIN_USDT*choose_leverage(x,src),
           'initial_margin_usdt':MIN_MARGIN_USDT,
           'leverage':choose_leverage(x,src),
           'entry_at_ms':now_ms,'price_source':'FUTURE_CLOSED_5M_OPEN_ESTIMATED',
           'fill_price':None,'total_qty':0.0,'remaining_qty':0.0,
           'realized_net_usdt':0.0,'unrealized_net_usdt':0.0,
           'fees_estimated_usdt':0.0,'funding':'UNMODELED',
           'is_real_trade':False,'estimated_only':True,'exits':[],
           'last_processed_ms':None,'valuation_status':'WAITING',
           'no_backfilled_fill':True}
        ticket.update(identity(early,x,x['research_tier'],now_ms))
        index[k]=ticket
    # Existing same-hour research hypotheses may strengthen/weaken. Keep a
    # time-stamped stage transition, but preserve immutable birth stage for
    # fair performance cohorts (no future maturity leakage).
    if old['last_scan_id']!=early.get('scan_id'):
        for candidate in early.get('candidates',[]):
            ticket=index.get(candidate.get('event_id'))
            if not ticket:continue
            current=candidate.get('paper_stage_number',TIER_STAGE.get(candidate.get('research_tier'),1))
            if ticket.get('stage')!=current:
                ticket['stage']=current
                ticket.setdefault('stage_transitions',[]).append({
                    'at_utc':stamp(now_ms),'stage':current,
                    'tier':candidate['research_tier']})
    # A3 -> GELDİ ALWAYS creates its own separate, timestamped paper intent
    # from the current scan price, even when the lower-stage research ticket
    # already exists or has expired. It is NEVER an exchange fill at signal time.
    # An existing stage-3 event is first observed at 4.03 activation, not
    # retroactively filled from its earlier watch timestamp.
    newly_confirmed_opposite=[]
    for x in early.get('candidates',[]):
        if x.get('paper_stage_number')!=3 or x.get('hourly_level_state')!='CLOSED_1H_LEVEL_BREACHED':
            continue
        if x.get('paper_eligible') is not False or x.get('real_order_eligible') is not False:
            continue
        if x.get('side') not in ('LONG','SHORT') or not valid(x.get('price_at_scan')):
            continue
        original=x.get('event_id')
        if strategy_mode and (now_ms<int(old.get('strategy_cash_started_ms',now_ms+1)) or
            (v4_early.epoch(x.get('source_closed_1h_at_utc')) or 0)+3600000<int(old.get('strategy_cash_started_ms',now_ms+1))):continue
        if not original or old.get('last_scan_id')==early.get('scan_id'):
            continue
        # A pre-reset candidate cannot become a new cash event by later promotion.
        if (v4_early.epoch(x.get('first_seen_at_utc')) or 0)<int(old.get('epoch_cutoff_ms') or 0):
            continue
        key='GELDI:'+original
        if key in index:continue
        src=frames.get((x['symbol'],x['side'])) or {}
        h=(src.get('frames') or {}).get('1H') or {}
        atr=h.get('atr_pct')
        price=x['price_at_scan']
        sign=1 if x['side']=='LONG' else -1
        gap=price*atr/100 if valid(atr) and atr<35 else None
        ok=bool(gap and gap<price)
        entry={'event_id':key,'origin_event_id':original,'entry_class':'GELDI',
            'paper_intent_created':True,'paper_intent_created_at_utc':stamp(now_ms),
            'symbol':x['symbol'],'side':x['side'],'signal_at_utc':stamp(now_ms),
            'signal_price':price,'stage_at_birth':'GELDI',
            'stage_at_birth_number':3,'stage_definition':'CLOSED_1H_BREAKOUT_REQUIRED',
            'stage':3,'stage_transitions':[{'at_utc':stamp(now_ms),'stage':3,'tier':'GELDI'}],
            'rank_at_birth':x.get('research_rank'),
            'source_1h_candle':x.get('source_closed_1h_at_utc'),
            'features_at_birth':feature_snap(src),'reasons_at_birth':x.get('reasons',[]),
            'hourly_threshold':x.get('hourly_level'),
            'status':'WAITING_FUTURE_BAR' if ok else 'INVALID_LEVEL',
            'stop':price-sign*gap if ok else None,
            'tp1':price+sign*gap if ok else None,
            'tp2':price+sign*2*gap if ok else None,
            'tp3':price+sign*3*gap if ok else None,
            'atr_pct_used':atr if ok else None,
            'reference_notional_usdt':MIN_MARGIN_USDT*choose_leverage(x,src),
            'initial_margin_usdt':MIN_MARGIN_USDT,
            'leverage':choose_leverage(x,src),
            'entry_at_ms':now_ms,'price_source':'FUTURE_CLOSED_5M_OPEN_ESTIMATED',
            'fill_price':None,'total_qty':0.0,'remaining_qty':0.0,
            'realized_net_usdt':0.0,'unrealized_net_usdt':0.0,
            'fees_estimated_usdt':0.0,'funding':'UNMODELED',
            'is_real_trade':False,'estimated_only':True,'exits':[],
            'last_processed_ms':None,
            'valuation_status':'WAITING_FUTURE_OHLC' if ok else 'ATR_LEVEL_UNAVAILABLE',
            'no_backfilled_fill':True}
        entry.update(identity(early,x,'GELDI',now_ms))
        entry['position_id']=key
        if strategy_mode:entry['stage_definition']='VERSIONED_STRATEGY_TRIGGER_AND_COST_REGIME_GATE'
        index[key]=entry
        newly_confirmed_opposite.append(entry)
    # Independent, confirmed opposite GELDI intentions supersede an older paper
    # exposure in the SAME symbol. Do not manufacture an exchange fill. Existing
    # OPEN exposure remains open until the first qualifying NEW closed 5m bar.
    # Pending opposite tickets have no fill and may be cancelled immediately.
    for challenger in newly_confirmed_opposite:
        for older in index.values():
            if (older['event_id']==challenger['event_id'] or
                older['symbol']!=challenger['symbol'] or
                older['side']==challenger['side'] or
                older.get('entry_at_ms',now_ms)>=challenger['entry_at_ms']):
                continue
            if older['status']=='WAITING_FUTURE_BAR':
                older['status']='OPPOSITE_CANCELLED'
                older['valuation_status']='CANCELLED_BEFORE_FILL_OPPOSITE_GELDI'
                older['opposite_event_id']=challenger['event_id']
                older['opposition_requested_at_utc']=stamp(now_ms)
            elif older['status']=='OPEN' and not older.get('opposition_close_after_ms'):
                older['opposition_close_after_ms']=((now_ms+BAR-1)//BAR)*BAR
                older['opposition_requested_at_utc']=stamp(now_ms)
                older['opposite_event_id']=challenger['event_id']
                older['valuation_status']='OPPOSITE_EXIT_WAITING_CLOSED_5M'
    # All orders are independent *tickets* in one cost-accounted virtual study.
    # A hard funding cap prevents silently creating executable-looking exposure.
    for t in sorted(index.values(),key=lambda v:(v['entry_at_ms'],v['event_id'])):
        if t['status'] not in ('OPEN','WAITING_FUTURE_BAR'):continue
        rows=sorted([x for x in (candles.get(t['symbol']) or []) if
          isinstance(x,dict) and isinstance(x.get('t'),int) and
          x['t']+BAR<=now_ms-1500],key=lambda x:x['t'])
        if t['status']=='WAITING_FUTURE_BAR':
            start=((t['entry_at_ms']//BAR)+1)*BAR
            nextbar=next((b for b in rows if b['t']>=start),None)
            if nextbar is None:
                if now_ms-t['entry_at_ms']>20*60000:
                    t['status']='DATA_GAP';t['valuation_status']='NO_FUTURE_ENTRY_CANDLE'
                continue
            if nextbar['t']!=start or not all(valid(nextbar.get(z)) for z in ('o','h','l','c')):
                t['status']='DATA_GAP';t['valuation_status']='FIRST_5M_MISSING_OR_INVALID';continue
            if abs(nextbar['o']/t['signal_price']-1)>.04:
                t['status']='DATA_GAP';t['valuation_status']='FILL_PRICE_GAP_TOO_LARGE';continue
            # Ticket-specific size protects the historical 10 USDT ledger and pending intents.
            ticket_notional=t.get('reference_notional_usdt',10.0)
            if not valid(ticket_notional):
                t['status']='CAPACITY_BLOCKED';t['valuation_status']='INVALID_NOTIONAL';continue
            exposure=sum(v.get('remaining_notional_usdt',0) for v in index.values() if v['status']=='OPEN')
            reserved=sum(float(v.get('initial_margin_usdt') or 0)*
              (float(v.get('remaining_qty') or 0)/float(v.get('total_qty') or 1))
              for v in index.values() if v['status']=='OPEN')
            required_margin=float(t.get('initial_margin_usdt') or
                ticket_notional/float(t.get('leverage') or BASE_LEVERAGE))
            if (not valid(required_margin) or reserved+required_margin>START_CASH*.5 or
                exposure+ticket_notional>START_CASH*3):
                t['status']='CAPACITY_BLOCKED';t['valuation_status']='VIRTUAL_CAPITAL_FULL';continue
            sign=1 if t['side']=='LONG' else -1
            filled=nextbar['o']*(1+sign*SLIPPAGE)
            if sign*(filled-t['stop'])<=0:
                t['status']='INVALID_LEVEL';t['valuation_status']='STOP_BEFORE_ESTIMATED_FILL';continue
            qty=ticket_notional/filled
            # Prospective policy only. Older pending tickets retain their birth policy.
            stop_exit=t['stop']*(1-sign*SLIPPAGE)
            stop_cost=qty*abs(filled-stop_exit)+ticket_notional*FEE+qty*stop_exit*FEE
            if t.get('strategy_policy')=='TURAN200_ONLY':
                active=[v for v in index.values() if v['status']=='OPEN']
                cash=START_CASH+sum(float(v.get('realized_net_usdt') or 0) for v in index.values())
                same_coin=any(v['symbol']==t['symbol'] for v in active)
                coin_cooldown=any(v['symbol']==t['symbol'] and v['status']=='CLOSED' and
                    now_ms-(v4_early.epoch(v.get('closed_at_utc')) or 0)<3600000 for v in index.values())
                side_exposure=sum(v.get('remaining_notional_usdt',0) for v in active if v['side']==t['side'])
                risk=sum(abs(float(v.get('mark_price') or v['fill_price'])-v['stop'])*v['remaining_qty']+
                    v['remaining_qty']*float(v.get('mark_price') or v['fill_price'])*(FEE+SLIPPAGE) for v in active)
                recent=sorted([v for v in index.values() if v['status']=='CLOSED' and v.get('strategy_policy')=='TURAN200_ONLY'],
                              key=lambda v:v.get('closed_at_utc',''),reverse=True)[:5]
                losing_pause=(len(recent)==5 and all(v['realized_net_usdt']<0 for v in recent) and
                    now_ms-(v4_early.epoch(recent[0]['closed_at_utc']) or 0)<4*3600000)
                if (not valid(cash) or same_coin or coin_cooldown or exposure+ticket_notional>cash*1.5 or
                    side_exposure+ticket_notional>cash or stop_cost>cash*.005 or risk+stop_cost>cash*.02 or losing_pause):
                    t['status']='CAPACITY_BLOCKED';t['valuation_status']='T191_T192_T194_T195_T198_RISK_GATE';continue
            if t.get('risk_policy_version')==RISK_POLICY and stop_cost>=required_margin:
                t['status']='CAPACITY_BLOCKED'
                t['valuation_status']='STOP_COST_EXCEEDS_INITIAL_MARGIN'
                continue
            t.update(status='OPEN',fill_price=filled,filled_at_utc=stamp(start+BAR),
                fill_at_ms=start,entry_open_reference=nextbar['o'],
                total_qty=qty,remaining_qty=qty,remaining_notional_usdt=ticket_notional,
                entry_fee_usdt=ticket_notional*FEE,fees_estimated_usdt=ticket_notional*FEE,
                last_processed_ms=start-BAR,valuation_status='VERIFIED_FUTURE_5M',
                mark_price=filled)
        if t['status']!='OPEN':continue
        after=[b for b in rows if b['t']>t['last_processed_ms']]
        for bar in after:
            expected=t['last_processed_ms']+BAR
            if bar['t']!=expected or not all(valid(bar.get(k)) for k in ('o','h','l','c')):
                t['status']='DATA_GAP';t['valuation_status']='NON_CONTIGUOUS_FUTURE_5M';break
            t['last_processed_ms']=bar['t']
            if (t.get('opposition_close_after_ms') is not None and
                bar['t']>=t['opposition_close_after_ms']):
                # Conservative bar-open close, only after a newly VERIFIED future
                # candle has fully closed. All modeled exit/slippage fees apply.
                settle(t,bar['o'],t['remaining_qty']/t['total_qty'],
                       'OPPOSITE_SIGNAL_EXIT',bar['t']+BAR)
                t['unrealized_net_usdt']=0.0
                t['valuation_status']='OPPOSITE_SETTLED_FUTURE_CLOSED_5M'
                break
            sign=1 if t['side']=='LONG' else -1
            t['max_favorable_pct']=max(t.get('max_favorable_pct',0),
                sign*((bar['h'] if sign>0 else bar['l'])/t['fill_price']-1)*100)
            t['max_adverse_pct']=min(t.get('max_adverse_pct',0),
                sign*((bar['l'] if sign>0 else bar['h'])/t['fill_price']-1)*100)
            stop=(bar['l']<=t['stop'] if sign>0 else bar['h']>=t['stop'])
            n=sum(e['kind'].startswith('TP') for e in t['exits'])
            level=[t['tp1'],t['tp2'],t['tp3']][min(n,2)]
            hit=(bar['h']>=level if sign>0 else bar['l']<=level)
            timestamp=bar['t']+BAR
            if stop:
                raw=(min(bar['o'],t['stop']) if sign>0 else max(bar['o'],t['stop']))
                settle(t,raw,t['remaining_qty']/t['total_qty'],
                    'STOP_AMBIGUOUS_SAME_5M' if hit else 'STOP',timestamp)
            elif hit:
                # Never infer multiple sequential intrabar TPs from one candle.
                share=[.5,.3,.2][min(n,2)]
                settle(t,level,share,'TP'+str(n+1),timestamp)
            if t['status']=='OPEN' and timestamp-t['entry_at_ms']>=MAX_HOLD:
                settle(t,bar['c'],t['remaining_qty']/t['total_qty'],'TIME_EXIT_24H',timestamp)
            if t['status']=='CLOSED':
                t['unrealized_net_usdt']=0.0;t['valuation_status']='SETTLED';break
            mark(t,bar['c'])
        if t['status']=='OPEN' and now_ms-t['last_processed_ms']>30*60000:
            t['valuation_status']='STALE_MARK_NO_BACKFILL'
    tickets=sorted(index.values(),key=lambda x:(x['entry_at_ms'],x['event_id']),reverse=True)
    doc={**old,'tickets':tickets,'last_scan_id':early['scan_id'],
        'last_run_ms':now_ms,'updated_at':stamp(now_ms)}
    stats=ledger_stats(tickets)
    days=compute_daily(tickets,now_ms)
    published={'model_version':VERSION,'scan_id':early['scan_id'],'updated_at':stamp(now_ms),
        'source_mtf_at':mtf_doc['fetched_at'],'started_at':doc['started_at'],
        'summary':stats,'daily':days,'geldi_intent_total':sum(t.get('entry_class')=='GELDI' for t in tickets),
        'recent_tickets':tickets[:220],
        'all_events_count':len(tickets),'archive_is_persistent':True,
        'no_real_orders':True,'combined_with_strict_paper_cash':False,
        'starting_balance_usdt':START_CASH,'reference_ticket_notional_usdt':NOTIONAL,
        'minimum_new_ticket_notional_usdt':MIN_MARGIN_USDT*BASE_LEVERAGE,
        'minimum_new_margin_usdt':MIN_MARGIN_USDT,
        'leverage_min':BASE_LEVERAGE,'leverage_max':MAX_LEVERAGE,
        'leverage_policy':'CONSERVATIVE_OBSERVATION_TIERS_NOT_SUCCESS_PROBABILITIES',
        'new_intent_risk_policy':RISK_POLICY,
        'funding_model':'UNMODELED','liquidation_model':'UNVERIFIED',
        'epoch_id':doc.get('epoch_id'),
        'epoch_started_at_utc':doc.get('cutover_at_utc'),
        'notional_policy_applies_to':'NEW_INTENTS_ONLY',
        'virtual_account_is_estimated':True,'no_backfilled_outcomes':True,
        'fee_per_side_assumption':FEE,'slippage_per_side_assumption':SLIPPAGE,
        'max_hold_hours':24,
        'opposition_policy':'CONFIRMED_GELDI_SAME_SYMBOL_CLOSE_ON_NEXT_VERIFIED_5M',
        'opposite_pending_count':sum(t['status']=='OPEN' and t.get('opposition_close_after_ms') is not None for t in tickets),
        'opposite_closed_total':sum(t.get('outcome')=='OPPOSITE_SIGNAL_EXIT' for t in tickets),
        'opposite_cancelled_total':sum(t['status']=='OPPOSITE_CANCELLED' for t in tickets),
        'open_positions':[{
            'event_id':t['event_id'],'symbol':t['symbol'],'side':t['side'],
            'strategy_id':t.get('strategy_id'),'strategy_version':t.get('strategy_version'),
            **{key:t.get(key) for key in ('signal_id','evaluation_id','cycle_id','snapshot_id',
                'strategy_event_id','source_scan_id','source_available_at','decision_at',
                'exchange','contract_type','direction','position_id','ledger_id','attribution_kind')},
            'parent_event_id':t.get('parent_event_id'),'risk_policy_version':t.get('risk_policy_version'),
            'status':t['status'],'signal_at_utc':t.get('signal_at_utc'),
            'signal_price':t.get('signal_price'), 'entry_class':t.get('entry_class'),
            'filled_at_utc':t.get('filled_at_utc'),
            'fill_price':t.get('fill_price'),'mark_price':t.get('mark_price'),
            'stop':t.get('stop'),'tp1':t.get('tp1'),
            'tp2':t.get('tp2'),'tp3':t.get('tp3'),
            'remaining_qty':t.get('remaining_qty'),
            'realized_net_usdt':t.get('realized_net_usdt'),
            'unrealized_net_usdt':t.get('unrealized_net_usdt'),
            'reference_notional_usdt':t.get('reference_notional_usdt'),
            'initial_margin_usdt':t.get('initial_margin_usdt'),
            'leverage':t.get('leverage'),
            'remaining_notional_usdt':t.get('remaining_notional_usdt'),
            'fees_estimated_usdt':t.get('fees_estimated_usdt'),
            'entry_fee_usdt':t.get('entry_fee_usdt'),
            'exits':t.get('exits',[]),
            'entry_open_reference':t.get('entry_open_reference'),
            'hourly_threshold':t.get('hourly_threshold'),
            'valuation_status':t.get('valuation_status'),
            'opposition_requested_at_utc':t.get('opposition_requested_at_utc'),
        } for t in tickets if t['status']=='OPEN'],
        'open_positions_complete':True,
        'disclaimer':'Separate experimental cash-capped virtual tickets. Future closed 5m OHLC only; no real order, guarantee, or self-training. Funding/mark-to-market gap unknown.'}
    if strategy_mode:
        published.update(strategy_policy='TURAN200_ONLY',active_strategy_leverage=BASE_LEVERAGE,
            strategy_cash_started_ms=doc.get('strategy_cash_started_ms'),
            close_request_id=doc.get('close_request_id'),
            new_entries_require_exact_strategy=True)
    return doc,published
def main():
    now=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    early=v4_paper.read(DATA/'v4-early.json',{})
    import uzayx_strategy_bank as bank
    if bank.enabled() and early.get('strategy_policy')!='TURAN200_ONLY':raise ValueError('STRATEGY_ONLY_CASH_REQUIRED')
    mtf_doc=v4_paper.read(DATA/'mtf.json',{})
    prior=json.loads(ARCH.read_text(encoding='utf8'))
    if prior.get('model_version') not in (VERSION,'4.0.2-spark-paper-a1'):
        raise ValueError('UNRECOGNIZED_PERSISTENT_CASHBOOK_NO_RESET')
    pending=[t['symbol'] for t in prior.get('tickets',[]) if t['status'] in ('OPEN','WAITING_FUTURE_BAR')]
    fresh=[t['symbol'] for t in early.get('candidates',[]) if
        (v4_early.epoch(t.get('first_seen_at_utc')) or 0)>=now-90000]
    # Promotions to GELDİ are not necessarily newly discovered events:
    # always fetch their prospective candles this cycle as well.
    promoted=[x['symbol'] for x in early.get('candidates',[])
              if x.get('paper_stage_number')==3 and
                 x.get('hourly_level_state')=='CLOSED_1H_LEVEL_BREACHED']
    symbols=sorted(set(pending+fresh+promoted))
    candles={}
    for symbol in symbols:
        try:
            candles[symbol]=mtf.request(symbol[:-4]+'-USDT-SWAP','5m')
        except Exception:
            candles[symbol]=[]
    doc,public=advance(prior,early,mtf_doc,now,candles)
    v4_paper.save(ARCH,doc)
    v4_paper.save(DATA/'v4-spark-paper.json',public)
    print('SPARK PAPER',len(doc['tickets']),public['summary']['counts'],
          'scan',public['scan_id'],flush=True)
if __name__=='__main__':main()
