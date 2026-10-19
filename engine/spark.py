#!/usr/bin/env python3
"""COIN.LIVE PRO 3.0: forward-only, higher-timeframe swing sparks.

Source: OKX fully closed 1W/1D/4H/1H/15m/5m candle states produced by mtf.py.
A spark can only START from 1D+4H direction agreement and a safe structure
gate. 1H/15m closed candles corroborate; 5m/1m offer optional micro timing.
It is research, not a trade, manipulation diagnosis, probability or fill.
"""
import datetime as dt
import hashlib
import json
import math
import pathlib

import mtf

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web'/'data'
ARCH=ROOT/'archive'/'swing-sparks-ledger.json'
ACTIVE=ROOT/'archive'/'swing-active-ledger.json'
MODEL='3.0.0-htf-sparks'
UTC=dt.datetime.now(dt.timezone.utc)
MS=int(UTC.timestamp()*1000)
DIRECTIONS={'LONG':'UP','SHORT':'DOWN'}
POLICY='3.1-persistent-quant-20261016'
WATCH_MS=24*3600000
CONFIRMED_MS=48*3600000
INVALIDATED_MS=6*3600000
# Last fully closed candle cannot be arbitrarily old when a research
# candidate is labelled "CONFIRMED". 1m is never an entry gate.
CANDLE_LAG={'1W':2*3600,'1D':1800,'4H':1200,'1H':600,'15m':180,'5m':120}

def fresh_closed(st,frame):
    if st.get('quality')!='CLOSED_CONFIRMED':return False
    try:
        t=dt.datetime.fromisoformat(st['last_candle_utc'].replace('Z','+00:00'))
        close=t+dt.timedelta(milliseconds=mtf.PERIOD[frame])
        lag=(UTC-close).total_seconds()
        return -120<=lag<=mtf.PERIOD[frame]/1000+CANDLE_LAG[frame]
    except (TypeError,ValueError,KeyError,AttributeError):return False


def load(path,fallback):
    try:return json.loads(path.read_text(encoding='utf8'))
    except (OSError,ValueError):return fallback

def write(path,obj):
    path.parent.mkdir(exist_ok=True,parents=True)
    temp=path.with_suffix(path.suffix+'.tmp')
    temp.write_text(json.dumps(obj,ensure_ascii=False,allow_nan=False,separators=(',',':')),encoding='utf8')
    temp.replace(path)

def fresh(ts,limit_seconds=540):
    try:
        t=dt.datetime.fromisoformat(ts.replace('Z','+00:00'))
        difference=(UTC-t).total_seconds()
        return -120<=difference<=limit_seconds
    except (TypeError,ValueError,AttributeError):return False

def confirmation_state(frame,wanted):
    if frame.get('quality')!='CLOSED_CONFIRMED':return 'NO_HISTORY'
    return 'ALIGNED' if frame.get('trend')==wanted else 'NOT_ALIGNED'

def quant_check(day,h4,h1,m15,side):
    """Closed-candle momentum and abnormal activity: cautious veto, not success probability."""
    sign=1 if side=='LONG' else -1
    d_rsi=mtf.swing.num(day.get('rsi_14'))
    h4_rsi=mtf.swing.num(h4.get('rsi_14'))
    h1_rsi=mtf.swing.num(h1.get('rsi_14'))
    macd4=(h4.get('macd_12_26_9') or {})
    macd1=(h1.get('macd_12_26_9') or {})
    h4_hist=mtf.swing.num(macd4.get('hist_pct'))
    h1_hist=mtf.swing.num(macd1.get('hist_pct'))
    adx=mtf.swing.num(h4.get('adx_14'))
    vol4=mtf.swing.num(h4.get('volume_ratio_20'))
    vol1=mtf.swing.num(h1.get('volume_ratio_20'))
    vol15=mtf.swing.num(m15.get('volume_ratio_20'))
    compression=mtf.swing.num(h4.get('bb_compression_percentile_30'))
    # Extremes reject chase; neutral readings must line up with the side.
    rsi_ok=all(v is not None for v in (d_rsi,h4_rsi,h1_rsi)) and (
        (48<=d_rsi<=78 and 47<=h4_rsi<=76 and 46<=h1_rsi<=79) if sign>0
        else (22<=d_rsi<=52 and 24<=h4_rsi<=53 and 21<=h1_rsi<=54))
    macd_ok=h4_hist is not None and h1_hist is not None and (
        h4_hist>0 and h1_hist>0 if sign>0 else h4_hist<0 and h1_hist<0)
    trend_ok=adx is not None and adx>=18
    volume_ok=all(v is not None for v in (vol4,vol1,vol15)) and (
        vol4>=.65 and vol1>=.6 and vol15>=.6)
    gate=[]
    if not rsi_ok:gate.append('RSI_DIRECTION_OR_EXTREME')
    if not macd_ok:gate.append('MACD_MOMENTUM_MISSING')
    if not trend_ok:gate.append('ADX_TREND_TOO_WEAK')
    if not volume_ok:gate.append('CLOSED_VOLUME_INSUFFICIENT')
    return not gate,gate,{
        'rsi_daily':d_rsi,'rsi_4h':h4_rsi,'rsi_1h':h1_rsi,
        'macd_hist_4h_pct':h4_hist,'macd_hist_1h_pct':h1_hist,
        'adx_4h':adx,'volume_ratio_4h':vol4,'volume_ratio_1h':vol1,
        'volume_ratio_15m':vol15,'bb_compression_percentile_4h':compression,
        'verified_closed_only':True,
        'manipulation_proven':False
    }


def spark_from_mtf(x,market,one_minute=None):
    """Pure deterministic high-timeframe primary gate; no single 1m/15m spark."""
    if x.get('swing_status')!='SWING_CANDIDATE' or x.get('quality')!='COMPLETE':
        return None
    side=x.get('side')
    if side not in DIRECTIONS:return None
    frame=x.get('frames') or {}
    day,h4,week,h1,m15,m5=[frame.get(k) or {} for k in ('1D','4H','1W','1H','15m','5m')]
    aligned=DIRECTIONS[side]
    if not fresh_closed(day,'1D') or not fresh_closed(h4,'4H'):return None
    if day.get('trend')!=aligned or h4.get('trend')!=aligned:return None
    risk=int(x.get('structure_risk_score') or 0)
    if risk>=45:return None
    score=int(x.get('score') or 0)
    if score<58:return None

    weekly=fresh_closed(week,'1W') and week.get('trend')==aligned
    # Weekly candle establishes the 3–7 day background; the daily chart is
    # the actionable chart for a 3–7 day thesis, not 1-minute candles.
    primary='1D' if weekly else '4H'
    horizon='3–7 gün' if weekly else '1–3 gün'
    h1ok=fresh_closed(h1,'1H') and h1.get('trend')==aligned
    m15ok=fresh_closed(m15,'15m') and m15.get('trend')==aligned
    m5ok=fresh_closed(m5,'5m') and m5.get('trend')==aligned
    micro=one_minute or {}
    one_ok=micro.get('quality')=='CLOSED_CONFIRMED' and micro.get('trend')==aligned
    # Strict confirmation requires weekly trend, ALL closed timing candles,
    # verified liquidity, spread and contract state. 1m remains optional.
    spread=mtf.swing.num(market.get('spread_bps'))
    volume=mtf.swing.num(market.get('volume'))
    listed=mtf.swing.num(market.get('listing_age_days'))
    instrument_live=str(market.get('instrument_state') or '').lower()=='live'
    market_ok=(volume is not None and volume>=40_000_000 and spread is not None
               and 0<=spread<=12 and instrument_live and listed is not None
               and listed>=30)
    technical_ok,technical_gates,technicals=quant_check(day,h4,h1,m15,side)
    technicals.update({
        'funding_rate':x.get('funding_rate'),
        'open_interest_usd':x.get('open_interest_usd'),
        'open_interest_change_pct':x.get('open_interest_change_pct'),
        'open_interest_delta_minutes':x.get('open_interest_delta_minutes'),
        'book_bid_ask_top5_ratio':x.get('book_bid_ask_top5_ratio')
    })
    confirmed=(weekly and h1ok and m15ok and m5ok and technical_ok and
               market_ok and risk<=24 and score>=76)
    price=mtf.swing.num(market.get('price'))
    if price is None or price<=0:return None
    atr=mtf.swing.num(h4.get('atr_pct'))
    distance=max(price*.014,price*(atr or 0)*.015)
    if not math.isfinite(distance) or distance<=0:return None
    sign=1 if side=='LONG' else -1
    # These levels are purely indicative research lines derived from a
    # current quote and 4H ATR. Stop/TP are NOT executable order proposals.
    stop=round(price-sign*distance,12)
    targets=[round(price+sign*distance*mult,12) for mult in (1,2,3)]
    threshold=mtf.swing.num(h4.get('breakout_high_prev8' if side=='LONG' else 'breakout_low_prev8'))
    # Absent resistance/support is an unknown setup, never "confirmed".
    # A trend is NOT a breakout until the current quote crosses the 4H
    # pre-existing 8-bar threshold in its OWN directional sense.
    if threshold is None or threshold<=0:return None
    beyond_pct=sign*(price/threshold-1)*100
    breakout=beyond_pct>0
    last_closed_price=mtf.swing.num(h4.get('close'))
    closed_breakout=(last_closed_price is not None and last_closed_price>0 and
                     sign*(last_closed_price/threshold-1)*100>0)
    extended=beyond_pct>max(2.0,0.9*(atr or 0))
    if not breakout or not closed_breakout or extended:confirmed=False
    stage='CONFIRMED' if confirmed else 'WATCH'
    gating=[]
    if not weekly:gating.append('WEEKLY_NOT_ALIGNED')
    if not breakout:gating.append('BREAKOUT_NOT_CROSSED')
    if not closed_breakout:gating.append('4H_CLOSED_BREAKOUT_MISSING')
    if extended:gating.append('BREAKOUT_OVEREXTENDED')
    if not market_ok:gating.append('LIQUIDITY_OR_SPREAD_UNVERIFIED')
    if not (h1ok and m15ok and m5ok):gating.append('TIMING_NOT_CONFIRMED')
    if risk>24:gating.append('STRUCTURE_RISK_ELEVATED')
    if score<76:gating.append('SCORE_BELOW_STRICT_GATE')
    gating+=technical_gates
    # "Volcano" is a volatility-compression/watch heuristic, NEVER a trigger
    # to bypass closed daily+4H agreement, liquidity or spoof-risk gates.
    pressure=(technicals['bb_compression_percentile_4h'] is not None
              and technicals['bb_compression_percentile_4h']<=30
              and technicals['volume_ratio_15m'] is not None
              and technicals['volume_ratio_15m']>=1.1
              and technicals['macd_hist_1h_pct'] is not None
              and sign*technicals['macd_hist_1h_pct']>0
              and not breakout and risk<=24
              and abs(beyond_pct)<=max(1.0,atr or 0))
    anomaly_flags=list(x.get('structure_flags') or [])
    # Closed-candle risk evidence: no assertion that manipulation occurred.
    if (mtf.swing.num(h4.get('volume_ratio_20')) or 0)>=3 and (h4.get('wick_rejections_8') or 0)>=2:
        anomaly_flags.append('4H_VOLUME_WICK_SPIKE')
    if (mtf.swing.num(m15.get('volume_ratio_20')) or 0)>=4:
        anomaly_flags.append('15M_EXTREME_CLOSED_VOLUME')
    if h4.get('fakeout_up_on_close') or h4.get('fakeout_down_on_close'):
        anomaly_flags.append('4H_FALSE_BREAKOUT_CLOSED_BACK_INSIDE')
    if (h4.get('wick_rejections_8') or 0)>=3:
        anomaly_flags.append('4H_FAKEOUT_WICK_RISK')
    symbol=x['symbol']
    last4=h4.get('last_candle_utc')
    # last 4H candle time, NOT the fetch timestamp, is setup identity.
    signature='|'.join((MODEL,symbol,side,primary,str(last4)))
    uid=hashlib.sha256(signature.encode()).hexdigest()[:20]
    return {
        'id':uid,'symbol':symbol,'venue':'OKX','side':side,'stage':stage,
        'primary_tf':primary,'macro_tf':['1W','1D','4H'],
        'confirm_tf':['1H','15m','5m','1m'],'expected_holding':horizon,
        'score':score,'risk_score':risk,'risk_label':x.get('structure_risk_label'),
        'reason_codes':x.get('reason_codes',[])[:12],
        'quality':'VERIFIED_CLOSED_1D_4H','setup_type':x.get('setup_type'),
        'price':price,'threshold':threshold,'stop':stop,'targets':targets,
        'entry_timing':'EXTENDED_WAIT' if extended else 'PRESSURE_WATCH' if pressure else 'BREAKOUT_WAIT' if not breakout else 'WAIT_4H_CLOSE' if not closed_breakout else
                       'STRICT_CONFIRMED' if confirmed else 'STANDARD_WATCH',
        'strict_gate_reasons':gating,'filter_policy':POLICY,
        'technicals':technicals,'pressure_watch':bool(pressure),
        'anomaly_flags':list(dict.fromkeys(anomaly_flags))[:14],
        'extended_from_4h_breakout_pct':round(beyond_pct,3),
        'closed_4h_breakout':bool(closed_breakout),
        'model_version':MODEL,'observed_at_utc':UTC.isoformat(timespec='seconds'),
        'main_candle_at':last4,'market_structure_flags':x.get('structure_flags',[])[:9],
        'confirmation':{'1W':bool(weekly),'1D':True,'4H':True,
                        '1H':h1ok,'15m':m15ok,'5m':m5ok,'1m':one_ok,
                        '1m_available':micro.get('quality')=='CLOSED_CONFIRMED'},
        'confirmation_state':{tf:confirmation_state(st,aligned) for tf,st in
            (('1W',week),('1D',day),('4H',h4),('1H',h1),('15m',m15),('5m',m5),('1m',micro))},
        'confirmation_note':'1D+4H setup; strict TEYIT requires weekly agreement, closed 1H/15m/5m, real 4H breakout, verified liquidity/spread; 1m optional',
        'levels_note':'Estimated from current quote and 4H ATR; not an actual fill or stop guarantee.'
    }

def build(mtf_doc,market_doc,one_minute_states=None):
    by_symbol={r['symbol']:r for r in market_doc.get('rows',[])}
    result=[]
    for x in mtf_doc.get('candidates',[]):
        m=by_symbol.get(x.get('symbol'))
        if not m:continue
        spark=spark_from_mtf(x,m,(one_minute_states or {}).get(x['symbol']))
        if spark:result.append(spark)
    return sorted(result,key=lambda x:(x['stage']!='CONFIRMED',-x['score'],x['risk_score']))[:24]

def reconcile_active(previous,scanned,assessments,now_ms):
    """Maintain cross-scan visibility, but never freeze an old TEYIT as actionable.

    FRESH: source candle states checked this run.
    RECHECK_PENDING: carried only as a prior WATCH, NOT a current confirmation.
    INVALIDATED: retained briefly with an explicit warning, then archived.
    No old record can make a new forward-only observation/paper order.
    """
    now=dt.datetime.fromtimestamp(now_ms/1000,dt.timezone.utc).isoformat()
    before=[dict(x) for x in previous.get('items',[])]
    old={(x.get('symbol'),x.get('side')):x for x in before
         if x.get('symbol') and x.get('side')}
    latest={(x['symbol'],x['side']):x for x in scanned}
    by_symbol={x.get('symbol'):x for x in assessments if x.get('symbol')}
    out=[];retired=list(previous.get('retired',[]))[-80:]
    for key,spark in latest.items():
        prior=old.pop(key,None)
        first=(prior or {}).get('first_seen_at') or spark['observed_at_utc']
        try:
            first_ms=int(dt.datetime.fromisoformat(first).timestamp()*1000)
        except (TypeError,ValueError):
            first_ms=now_ms;first=now
        was_confirmed=(spark['stage']=='CONFIRMED' or
                       (prior or {}).get('peak_stage')=='CONFIRMED')
        ttl=CONFIRMED_MS if was_confirmed else WATCH_MS
        if now_ms-first_ms>=ttl:
            if prior:retired.append(dict(prior,retired_at=now,review_state='EXPIRED'))
            first=now
        item=dict(spark,first_seen_at=first,last_evaluated_at=now,review_state='FRESH',
                  peak_stage='CONFIRMED' if was_confirmed else 'WATCH',
                  last_confirmed_at=now if spark['stage']=='CONFIRMED'
                     else (prior or {}).get('last_confirmed_at'),
                  first_seen_price=(prior or {}).get('first_seen_price',spark['price']))
        if prior and prior.get('stage')=='CONFIRMED' and spark['stage']!='CONFIRMED':
            item['confirmation_lost']=True
        out.append(item)
    for prior in old.values():
        try:
            age=now_ms-int(dt.datetime.fromisoformat(prior.get('first_seen_at') or prior['observed_at_utc']).timestamp()*1000)
        except (ValueError,KeyError,TypeError):
            retired.append(dict(prior,retired_at=now,review_state='BAD_TIMESTAMP'))
            continue
        ttl=CONFIRMED_MS if prior.get('peak_stage')=='CONFIRMED' else WATCH_MS
        if age>=ttl:
            retired.append(dict(prior,retired_at=now,review_state='EXPIRED'))
            continue
        prior=dict(prior)
        previously_invalid=prior.get('review_state')=='INVALIDATED'
        assessed=by_symbol.get(prior['symbol'])
        reason=None
        if assessed and assessed.get('quality')=='COMPLETE':
            if assessed.get('side')!=prior['side'] or not assessed.get('direction_aligned_4h_1d'):
                reason='MACRO_DIRECTION_CHANGED'
            elif assessed.get('swing_status') in ('AVOID_RISK','WAIT_4H_1D'):
                reason='STRUCTURE_OR_TREND_INVALID'
            elif assessed.get('swing_status')=='SWING_CANDIDATE':
                reason='STRICT_SETUP_NO_LONGER_VALID'
            else:
                reason='SETUP_INVALID'
        if reason and not previously_invalid:
            prior['invalidated_at']=now
            prior['invalidated_reason']=reason
        if reason or previously_invalid:
            prior['review_state']='INVALIDATED'
            try:
                invalid_age=now_ms-int(dt.datetime.fromisoformat(prior['invalidated_at']).timestamp()*1000)
            except (ValueError,KeyError,TypeError):
                invalid_age=INVALIDATED_MS
            if invalid_age>=INVALIDATED_MS:
                retired.append(dict(prior,retired_at=now))
                continue
        else:
            prior['review_state']='RECHECK_PENDING'
        # Never carry an old CONFIRMED into the live radar as a current TEYIT.
        if prior.get('stage')=='CONFIRMED':prior['confirmation_lost']=True
        prior['stage']='WATCH'
        out.append(prior)
    # Stay bounded and deterministic; fresh, then pending, then invalidated.
    rank={'FRESH':0,'RECHECK_PENDING':1,'INVALIDATED':2}
    out.sort(key=lambda x:(rank.get(x['review_state'],3),
        x['stage']!='CONFIRMED',-float(x.get('score') or 0),x.get('first_seen_at','')))
    return {'items':out[:30],'retired':retired[-120:],
            'updated_at':now,'policy':POLICY},len([x for x in out if x['review_state']=='FRESH'])


def accumulate(old,items):
    """Append only new forward observed 4H setups / stage transitions."""
    history=[e for e in old.get('events',[]) if e.get('model_version')==MODEL]
    existing={e['event_id'] for e in history}
    changes=0
    for spark in items:
        event_id=spark['id']+'|'+spark['stage']
        if event_id in existing:continue
        # Suppress near-duplicate 4H setup observations within 12 hours.
        # Stage upgrades remain distinct. Old 2.x history is not rewritten.
        if any(e.get('model_version')==MODEL and e.get('symbol')==spark['symbol']
               and e.get('side')==spark['side'] and e.get('stage')==spark['stage']
               and 0<=MS-int(e.get('at_ms',0))<12*3600000 for e in history):continue
        event={
            'event_id':event_id,'id':spark['id'],'time':spark['observed_at_utc'],
            'at_ms':MS,'symbol':spark['symbol'],'side':spark['side'],
            'stage':spark['stage'],'primary_tf':spark['primary_tf'],
            'expected_holding':spark['expected_holding'],'price':spark['price'],
            'stop':spark['stop'],'target_1r':spark['targets'][0],
            'entry_timing':spark['entry_timing'],'filter_policy':spark.get('filter_policy',POLICY),
            'score':spark['score'],'risk_score':spark['risk_score'],
            'confirmation':spark['confirmation'],
            'main_candle_at':spark['main_candle_at'],'model_version':MODEL,
            'state':'OBSERVED_ONLY','realized_R':None,'win_rate':None,
            'is_executed_trade':False
        }
        for key in ('strategy_id','strategy_ids','strategy_version','strategy_config_hash'):
            if key in spark:event[key]=spark[key]
        history.append(event);existing.add(event_id);changes+=1
    history=[e for e in history if MS-int(e.get('at_ms',0))<90*86400000]
    return {'model_version':MODEL,'updated_at':UTC.isoformat(timespec='seconds'),
            'events':history,'retention_days':90,'no_backfill':True},changes

def main():
    macro=load(DATA/'mtf.json',{})
    market=load(DATA/'market.json',{})
    if macro.get('model_version')!='3.0.0-mtf-swing':
        raise RuntimeError('Expected verified 4H+daily model, no fallback to old 15m alerts')
    if not fresh(macro.get('fetched_at')) or not fresh(market.get('fetched_at')):
        raise RuntimeError('Stale higher-timeframe assessment; no fresh swing sparks')
    if macro.get('provider')!='OKX' or market.get('provider')!='OKX':
        raise RuntimeError('Mismatched exchange provider')
    if int(macro.get('analyzed',0))<5:raise RuntimeError('Insufficient verified HTF coverage')

    one={}
    for candidate in macro.get('candidates',[]):
        if candidate.get('swing_status')!='SWING_CANDIDATE':continue
        if (candidate.get('structure_risk_score') or 0)>=35:continue
        tf=candidate.get('frames') or {}
        side=candidate.get('side')
        if side not in DIRECTIONS:continue
        if tf.get('1H',{}).get('trend')!=DIRECTIONS[side] or tf.get('15m',{}).get('trend')!=DIRECTIONS[side]:
            continue
        symbol=candidate['symbol']
        try:
            inst=symbol[:-4]+'-USDT-SWAP'
            one[symbol]=mtf.state(mtf.request(inst,'1m'),'1m')
        except Exception:
            one[symbol]={'quality':'NO_1M_CONFIRMATION','trend':'UNKNOWN'}
        if len(one)>=9:break

    sparks=build(macro,market,one)
    import uzayx_strategy_bank as bank
    if bank.enabled():
        feed=bank.read_feed(macro['fetched_at'])
        matches={(x['symbol'],x['side']):x for x in feed['signals']}
        sparks=[s for s in sparks if (s['symbol'],s['side']) in matches]
        for s in sparks:
            match=matches[(s['symbol'],s['side'])]
            for key in ('strategy_id','strategy_ids','strategy_version','strategy_config_hash'):
                s[key]=match[key]
    previous=load(ACTIVE,{})
    # First migration seeds recent v3 radar only; never fabricate historical
    # observations from old archive entries with no raw candidate evidence.
    if not previous.get('items'):
        snapshot=load(DATA/'swing-radar.json',{})
        if snapshot.get('model_version')==MODEL and fresh(snapshot.get('fetched_at'),1500):
            previous={'items':[x for x in snapshot.get('items',[])
                               if x.get('filter_policy') in (POLICY,'3.0-strict-5min-20261016')]}
    board,fresh_count=reconcile_active(previous,sparks,macro.get('candidates',[]),MS)
    archive=load(ARCH,{'events':[]})
    ledger,changes=accumulate(archive,sparks)
    now14=MS-14*86400000
    public={**ledger,'events':[e for e in ledger['events'] if int(e['at_ms'])>=now14 and e.get('model_version')==MODEL]}
    live={'provider':'OKX','model_version':MODEL,'fetched_at':UTC.isoformat(timespec='seconds'),
          'source_mtf_at':macro['fetched_at'],'timeframes_primary':['1D','4H'],
          'timeframes_macro':['1W','1D','4H'],'timeframes_confirmation':['1H','15m','5m','1m'],
          'items':board['items'],
          'retired_recent':board['retired'][-12:],
          'fresh_count':fresh_count,'retained_count':len(board['items'])-fresh_count,
          'long':sum(s['side']=='LONG' and s['review_state']=='FRESH' for s in board['items']),
          'short':sum(s['side']=='SHORT' and s['review_state']=='FRESH' for s in board['items']),
          'confirmed':sum(s['stage']=='CONFIRMED' and s['review_state']=='FRESH' for s in board['items']),
          'attempted':macro.get('attempted'),'analyzed':macro.get('analyzed'),
          'filter_policy':POLICY,
          'note':'Closed 1D/4H setup, strict closed 1W/1H/15m/5m confirmation, breakout crossed and not extended, verified liquid OKX swap; 1m optional.',
          'no_live_orders':True}
    write(ARCH,ledger)
    write(ACTIVE,board)
    write(DATA/'swing-history.json',public)
    write(DATA/'swing-radar.json',live)
    print(f'HTF-SPARKS {live["fetched_at"]} observed={len(sparks)} retained={live["retained_count"]} LONG={live["long"]} SHORT={live["short"]} CONFIRMED={live["confirmed"]} newly_observed={changes}',flush=True)

if __name__=='__main__':main()
