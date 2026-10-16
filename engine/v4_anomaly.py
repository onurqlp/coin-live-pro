#!/usr/bin/env python3
"""Parallel UTC anomaly/market-clock research; never a trade or spoofing proof.

Only verified closed 5m/15m/1H/4H features, observed OI windows and quotes.
Existing V4 score, lifecycle transitions, and 10k paper policy stay unchanged.
"""
import datetime as dt
import math
from zoneinfo import ZoneInfo

VERSION='4.0.0-utc-anomaly-a1'
PERIOD={'5m':300000,'15m':900000,'1H':3600000,'4H':14400000}
DAY=86400000
def ms(x):
    if not isinstance(x,str):return None
    try:
        t=dt.datetime.fromisoformat(x.replace('Z','+00:00'))
        return int(t.timestamp()*1000) if t.tzinfo else None
    except (ValueError,TypeError,OverflowError):return None
def iso(x):return dt.datetime.fromtimestamp(x/1000,dt.timezone.utc).isoformat()
def num(x):
    if x is None or isinstance(x,bool):return None
    try:
        v=float(x)
        return v if math.isfinite(v) else None
    except (ValueError,TypeError):return None
def clock(now):
    d=dt.datetime.fromtimestamp(now/1000,dt.timezone.utc)
    regions=(('Tokyo','Asia/Tokyo',9,17),('London','Europe/London',8,17),
             ('New York','America/New_York',8,17))
    windows=[name for name,zone,open_,close in regions
             if open_<=d.astimezone(ZoneInfo(zone)).hour<close]
    return {'utc_at':iso(now),'utc_hour':d.hour,'utc_4h_block':d.hour//4*4,
            'regional_activity_windows':windows,
            'market':'24/7 UTC: regional windows approximate and DST-aware',
            'window_is_not_manipulation_evidence':True}
def frame(c,tf,now):
    f=(c.get('frames') or {}).get(tf) or {}
    start=ms(f.get('last_candle_utc'))
    if f.get('quality')!='CLOSED_CONFIRMED' or start is None:return None
    end=start+PERIOD[tf]
    if end>now-1500 or now-end>PERIOD[tf]+15*60000:return None
    return f
def oi_change(x,k):
    p=(x.get('delta') or {}).get(k) or {}
    return num(p.get('change_pct')) if p.get('status')=='VERIFIED_SNAPSHOT_DELTA' else None
def assess(c,market,oi,now):
    frames={k:frame(c,k,now) for k in PERIOD}
    if c.get('quality')!='COMPLETE' or c.get('side') not in ('LONG','SHORT') or not all(frames.values()):
        return {'state':'UNKNOWN','index':None,'not_proof':True,
                'reason':['MISSING_FRESH_CLOSED_MICRO_CANDLES']}
    f5,f15,f1,f4=(frames[k] for k in ('5m','15m','1H','4H'))
    # Correlated false-break/wick evidence is a single evidence bucket.
    fake=sum(bool(f.get('fakeout_up_on_close') or f.get('fakeout_down_on_close'))
             for f in (f5,f15,f1))
    wick=max(num(f.get('wick_rejections_8')) or 0 for f in (f5,f15,f1))
    rejection=30 if fake>=2 else 17 if fake else 10 if wick>=3 else 6 if wick>=2 else 0
    v5=num(f5.get('volume_ratio_20'));v15=num(f15.get('volume_ratio_20'))
    vmax=max([v for v in (v5,v15,0) if v is not None])
    volume=25 if vmax>=4 else 16 if vmax>=2.5 else 8 if vmax>=1.8 else 0
    atr5=num(f5.get('atr_pct'));atr15=num(f15.get('atr_pct'))
    volatility=15 if (atr5 is not None and atr5>=.85) or (atr15 is not None and atr15>=1.9) else 7 if (atr5 is not None and atr5>=.35) or (atr15 is not None and atr15>=.8) else 0
    o5=oi_change(oi,'5m');o1=oi_change(oi,'1h')
    maxoi=max([abs(x) for x in (o5,o1) if x is not None],default=None)
    oi_bucket=20 if maxoi is not None and maxoi>=8 else 12 if maxoi is not None and maxoi>=4 else 0
    spread=num(market.get('spread_bps'))
    spread_bucket=10 if spread is not None and spread>20 else 5 if spread is not None and spread>12 else 0
    factors={'rejection':rejection,'volume':volume,'volatility':volatility,
             'open_interest':oi_bucket,'spread':spread_bucket}
    score=sum(factors.values())
    return {'state':'OBSERVED_HEURISTIC','index':score,
            'level':'HIGH' if score>=50 else 'ELEVATED' if score>=30 else 'LOW',
            'factors':factors,'candle_5m_open_at_utc':f5['last_candle_utc'],
            'metrics':{'rv5':v5,'rv15':v15,'atr5_pct':atr5,'atr15_pct':atr15,
                       'oi5_pct':o5,'oi1h_pct':o1,'spread_bps':spread,
                       'fakeout_frames':fake,'wick_rejections':wick},
            'unknown':{'spoofing':True,'historical_orderbook':True,
                       'liquidation_clusters':True},
            'not_proof':True,'not_trade_entry':True,'not_used_in_core_score':True}
def collect(mtf,market,oi,previous,now):
    if oi.get('source_mtf_at')!=mtf.get('fetched_at'):
        raise RuntimeError('Anomaly OI/MFT scan mismatch; refuse to mix sources')
    rows={x.get('symbol'):x for x in market.get('rows',[])}
    data={};seen=set(previous.get('recent_dedup',[]));new=[]
    for c in mtf.get('candidates',[]):
        sym=c.get('symbol');side=c.get('side')
        if sym not in rows or side not in ('LONG','SHORT'):continue
        item=assess(c,rows[sym],(oi.get('deltas') or {}).get(sym) or {},now)
        key=sym+'|'+side;data[key]=item
        if item['state']!='OBSERVED_HEURISTIC':continue
        opened=item['candle_5m_open_at_utc'];id_=key+'|'+opened
        if id_ in seen:continue
        seen.add(id_)
        closed=ms(opened)+PERIOD['5m']
        d=dt.datetime.fromtimestamp(closed/1000,dt.timezone.utc)
        new.append((d.strftime('%Y-%m-%d'),str(d.hour),item['index']))
    cutoff=(dt.datetime.fromtimestamp(now/1000,dt.timezone.utc)-
            dt.timedelta(days=90)).strftime('%Y-%m-%d')
    days={d:hours for d,hours in (previous.get('daily_hours') or {}).items() if d>=cutoff}
    for day,hour,score in new:
        count=days.setdefault(day,{}).setdefault(hour,{'n':0,'elevated':0,'high':0})
        count['n']+=1;count['elevated']+=int(score>=30);count['high']+=int(score>=50)
    hist={}
    for day,hours in days.items():
        for hour,c in hours.items():
            a=hist.setdefault(hour,{'n':0,'elevated':0,'days':0})
            a['n']+=c['n'];a['elevated']+=c['elevated'];a['days']+=int(c['n']>0)
    eligible=[(int(h),d) for h,d in hist.items() if d['n']>=40 and d['days']>=3]
    top=sorted(eligible,key=lambda x:(-x[1]['elevated']/x[1]['n'],-x[1]['n']))
    leader=[{'utc_hour':h,'sample_n':x['n'],'days':x['days'],
             'elevated_pct':round(100*x['elevated']/x['n'],1)} for h,x in top[:3]]
    keep=now-8*3600000
    dedup=sorted(k for k in seen if (ms(k.rsplit('|',1)[-1]) or 0)+PERIOD['5m']>=keep)
    study={'model_version':VERSION,'created_utc':previous.get('created_utc') or iso(now),
           'updated_utc':iso(now),'daily_hours':days,'recent_dedup':dedup}
    report={'clock':clock(now),'pairs':data,
            'hourly':{'state':'EXPLORATORY' if leader else 'INSUFFICIENT_SAMPLE',
                      'top_utc_hours':leader,'min_n':40,'min_days':3,
                      'denominator':'distinct rotating scanned pair/side/closed 5m; NOT entire OKX market',
                      'time_basis':'UTC',
                      'selection_bias':True,'not_an_empirical_manipulation_probability':True},
            'not_used_in_v4_score':True,'no_real_orders':True}
    return study,report
