#!/usr/bin/env python3
"""Versioned, independent research discovery modules. ONLY closed candle states.

No predictor is called a calibrated probability or a manipulation detector.
Only TREND_BREAKOUT can initially open V4 paper-eligible intents, and only
when the independently computed V3.1 strict confirmation is freshly present.
All other strategies are separately measured research hypotheses.
"""
import datetime as dt
import math

VERSION='4.0.0-strategies-a1'
IDS=('TREND_BREAKOUT','VOLUME_EXPANSION','BREAKOUT_RETEST',
     'REVERSAL_SETUP','VOLATILITY_SQUEEZE','OI_FUNDING_PRESSURE','SHORT_BREAKDOWN')
PERIOD={'1D':86400000,'4H':14400000,'1H':3600000,'15m':900000,'5m':300000}

def n(value):
    if value is None or isinstance(value,bool):return None
    try:
        value=float(value)
        return value if math.isfinite(value) else None
    except (ValueError,TypeError):return None

def closed(frame):
    return isinstance(frame,dict) and frame.get('quality')=='CLOSED_CONFIRMED'

def bar_end(frame,name):
    if not closed(frame):return None
    try:
        t=dt.datetime.fromisoformat(frame['last_candle_utc'].replace('Z','+00:00'))
        if t.tzinfo is None:return None
        return int(t.timestamp()*1000)+PERIOD[name]
    except (ValueError,TypeError,KeyError,AttributeError):return None

def oriented(side,metric):
    return None if metric is None else metric*(1 if side=='LONG' else -1)

def evaluator(candidate,market,spark=None,now_ms=None):
    """Each returned row names independent reason codes and true source times."""
    now_ms=now_ms or int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    f=candidate.get('frames') or {}
    d=f.get('1D') or {};h=f.get('4H') or {};hour=f.get('1H') or {};q=f.get('15m') or {};five=f.get('5m') or {}
    if candidate.get('quality')!='COMPLETE' or not all(closed(x) for x in (d,h,hour,q,five)):return []
    ends={tf:bar_end(f[tf],tf) for tf in ('1D','4H','1H','15m','5m')}
    if any(v is None or v>now_ms+120000 or now_ms-v>PERIOD[k]+600000 for k,v in ends.items()):return []
    side=candidate.get('side')
    if side not in ('LONG','SHORT'):return []
    direction='UP' if side=='LONG' else 'DOWN'
    sign=1 if side=='LONG' else -1
    volume=n(market.get('volume'));spread=n(market.get('spread_bps'))
    listed=n(market.get('listing_age_days'))
    if (volume is None or volume<10000000 or spread is None or spread>25
        or str(market.get('instrument_state','')).lower()!='live'
        or listed is None or listed<7):return []
    risk=n(candidate.get('structure_risk_score'))
    if risk is None or risk>=45:return []
    score=n(candidate.get('score'))
    if score is None or score<50:return []
    trend_4h=h.get('trend')==direction
    trend_day=d.get('trend')==direction
    h4_rsi=n(h.get('rsi_14'));d_rsi=n(d.get('rsi_14'))
    m4=(h.get('macd_12_26_9') or {})
    m1=(hour.get('macd_12_26_9') or {})
    hist4=oriented(side,n(m4.get('hist_pct')))
    hist1=oriented(side,n(m1.get('hist_pct')))
    hist4prev=oriented(side,n(m4.get('hist_prev_pct')))
    rv4=n(h.get('volume_ratio_20'));rv1=n(hour.get('volume_ratio_20'))
    rv15=n(q.get('volume_ratio_20'))
    adx=n(h.get('adx_14'));bb=n(h.get('bb_compression_percentile_30'))
    close4=n(h.get('close'));close1=n(hour.get('close'));close15=n(q.get('close'))
    threshold4=n(h.get('breakout_high_prev8' if side=='LONG' else 'breakout_low_prev8'))
    threshold1=n(hour.get('breakout_high_prev8' if side=='LONG' else 'breakout_low_prev8'))
    threshold15=n(q.get('breakout_high_prev8' if side=='LONG' else 'breakout_low_prev8'))
    local15=threshold15 is not None and close15 is not None and sign*(close15-threshold15)>0
    local1=threshold1 is not None and close1 is not None and sign*(close1-threshold1)>0
    macro_break=threshold4 is not None and close4 is not None and sign*(close4-threshold4)>0
    mild=not (h.get('fakeout_up_on_close') if side=='LONG' else h.get('fakeout_down_on_close'))
    deriv=n(candidate.get('open_interest_change_pct'))
    oi_duration=n(candidate.get('open_interest_delta_minutes'))
    funding=n(candidate.get('funding_rate'))
    evidence=ends['1H'] if local1 else ends['15m'] if local15 else ends['4H']
    quote=n(market.get('price'))
    if quote is None or quote<=0:return []
    liquidity=volume>=40000000 and spread<=12 and listed>=30
    metric={'4h_rsi':h4_rsi,'daily_rsi':d_rsi,'4h_adx':adx,
            '4h_relative_volume':rv4,'1h_relative_volume':rv1,
            '15m_relative_volume':rv15,'4h_macd_signed':hist4,
            '1h_macd_signed':hist1,'bb_compression_percentile':bb,
            'oi_change_pct':deriv,'oi_window_minutes':oi_duration,
            'funding_rate':funding,'spread_bps':spread,'volume_24h':volume,
            'risk_score':risk,'closed_4h_breakout':bool(macro_break)}
    # Every period is sourced from real, fully closed exchange OHLC.
    # Lower frames are timing evidence; 4H/1D are primary, 1W regime context.
    metric['timeframe_levels']={
      tf:{'quality':(f.get(tf) or {}).get('quality','UNKNOWN'),
          'trend':(f.get(tf) or {}).get('trend','UNKNOWN'),
          'closed_at_utc':(f.get(tf) or {}).get('last_candle_utc')}
      for tf in ('1m','5m','15m','1H','4H','12H','1D','1W')}
    proposals=[]
    def add(strategy,discovery,motion,spotlight,reasons,gate,quality=None):
        if not discovery:return
        # One factor may not be counted repeatedly as distinct evidence.
        quality=quality or {}
        motion=bool(motion and evidence and (local1 or local15))
        spotlight=bool(spotlight and motion and liquidity and risk<=24 and mild)
        components={'trend':int(trend_4h)+int(trend_day),'structure':int(bool(macro_break)),
                    'volume':int(rv4 is not None and rv4>=1.2),
                    'momentum':int(hist4 is not None and hist4>0),
                    'liquidity':int(liquidity)}
        proposals.append({'strategy_id':strategy,'strategy_version':VERSION,
            'symbol':candidate['symbol'],'side':side,'score':round(score),
            'risk_score':round(risk),'discovery':True,'motion':motion,
            'spotlight':spotlight,'entry_eligible':bool(gate and spotlight),
            'reason_codes':reasons,'metrics_used':metric,'factor_groups':components,
            'source_candle_closed_at_utc':dt.datetime.fromtimestamp(evidence/1000,dt.timezone.utc).isoformat(),
            'h4_candle_closed_at_utc':dt.datetime.fromtimestamp(ends['4H']/1000,dt.timezone.utc).isoformat(),
            'price':quote,'stop':spark.get('stop') if spark else None,
            'targets':spark.get('targets') if spark else [],
            'market_quality':'VERIFIED_CLOSED_OHLC',
            'policy_restrictions':quality})
    strict=bool(spark and spark.get('review_state')=='FRESH' and spark.get('stage')=='CONFIRMED'
                and spark.get('closed_4h_breakout') and not spark.get('strict_gate_reasons'))
    if trend_4h and trend_day:
        add('TREND_BREAKOUT',True,
            (local1 or local15) and rv1 is not None and rv1>=0.85 and hist1 is not None and hist1>0,
            strict and macro_break and score>=78 and adx is not None and adx>=18,
            ['HTF_ALIGNED','LOCAL_CLOSED_LEVEL' if local1 or local15 else 'LOCAL_LEVEL_WAIT',
             '4H_CLOSED_BREAKOUT' if macro_break else 'WAIT_4H_CLOSE'],
            strict)
    if trend_4h and rv4 is not None and rv4>=1.5:
        add('VOLUME_EXPANSION',True,
            (local1 or local15) and rv1 is not None and rv1>=1.3 and hist1 is not None and hist1>0,
            trend_day and macro_break and rv4>=2 and adx is not None and adx>=22,
            ['4H_VOLUME_EXPANSION','CLOSED_LOCAL_BREAK' if local1 or local15 else 'LOCAL_WAIT'],
            False,{'research_only':True})
    # A confirmed retest requires a *second chronological, independent* bar
    # not present in the compressed MTF state; do not invent one from a wick.
    if macro_break and trend_4h:
        add('BREAKOUT_RETEST',True,False,False,
            ['BREAKOUT_SEEN','RETEST_SEQUENCE_UNVERIFIED'],False,{'missing':'FULL_RETEST_CANDLE_SEQUENCE'})
    if h4_rsi is not None and hist4 is not None and hist4prev is not None:
        early_turn=((side=='LONG' and h4_rsi<=42) or (side=='SHORT' and h4_rsi>=58))
        if early_turn and hist4>hist4prev:
            add('REVERSAL_SETUP',True,
                (local1 or local15) and hist1 is not None and hist1>0 and rv1 is not None and rv1>=1.2,
                False,['RSI_EXTREME','MACD_HIST_TURN','COUNTERTREND_RESEARCH'],False,
                {'research_only':True,'divergence':'UNKNOWN'})
    if bb is not None and bb<=30 and rv15 is not None and rv15>=1.0:
        add('VOLATILITY_SQUEEZE',True,
            (local1 or local15) and rv15>=1.4 and hist1 is not None and hist1>0,
            trend_day and trend_4h and macro_break and rv4 is not None and rv4>=1.3,
            ['BB_COMPRESSION','CLOSED_VOLUME_EXPANSION' if rv15>=1.4 else 'WATCH_VOLUME'],
            False,{'research_only':True})
    if deriv is not None and oi_duration is not None and 3<=oi_duration<=65 and funding is not None:
        if abs(deriv)>=2 and abs(funding)>=0.0001:
            add('OI_FUNDING_PRESSURE',True,
                (local1 or local15) and abs(deriv)>=3 and hist1 is not None and hist1>0,
                False,['TIMESTAMPED_OI_DELTA','FUNDING_CROWDING','NOT_LIQUIDATION_PROOF'],
                False,{'research_only':True,'snapshot_minutes':oi_duration})
    if side=='SHORT' and trend_day and trend_4h:
        add('SHORT_BREAKDOWN',True,
            (local1 or local15) and rv1 is not None and rv1>=1.15 and hist1 is not None and hist1>0,
            strict and macro_break and rv4 is not None and rv4>=1.0,
            ['BEARISH_DAILY_4H','SUPPORT_CLOSED_BREAK' if local1 or local15 else 'SUPPORT_WATCH'],
            False,{'research_only':True})
    return proposals
