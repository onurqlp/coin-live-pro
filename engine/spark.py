#!/usr/bin/env python3
"""COIN.LIVE PRO 2.3: forward-only, higher-timeframe swing sparks.

Source: OKX fully closed 1W/1D/4H/1H/15m/5m candle states produced by mtf.py.
A spark can only START from 1D+4H direction agreement and a safe structure
gate. 1H/15m and optional CLOSED 1m only upgrade WATCH to CONFIRMED.
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
MODEL='2.3.0-htf-sparks'
UTC=dt.datetime.now(dt.timezone.utc)
MS=int(UTC.timestamp()*1000)
DIRECTIONS={'LONG':'UP','SHORT':'DOWN'}

def load(path,fallback):
    try:return json.loads(path.read_text(encoding='utf8'))
    except (OSError,ValueError):return fallback

def write(path,obj):
    path.parent.mkdir(exist_ok=True,parents=True)
    temp=path.with_suffix(path.suffix+'.tmp')
    temp.write_text(json.dumps(obj,ensure_ascii=False,allow_nan=False,separators=(',',':'),encoding='utf8')
    temp.replace(path)

def fresh(ts,limit_seconds=540):
    try:
        t=dt.datetime.fromisoformat(ts.replace('Z','+00:00'))
        difference=(UTC-t).total_seconds()
        return -120<=difference<=limit_seconds
    except (TypeError,ValueError,AttributeError):return False

def spark_from_mtf(x,market,one_minute=None):
    """Pure deterministic high-timeframe primary gate; no single 1m/15m spark."""
    if x.get('swing_status')!='SWING_CANDIDATE' or x.get('quality')!='COMPLETE':
        return None
    side=x.get('side')
    if side not in DIRECTIONS:return None
    frame=x.get('frames') or {}
    day,h4,week,h1,m15,m5=[frame.get(k) or {} for k in ('1D','4H','1W','1H','15m','5m')]
    aligned=DIRECTIONS[side]
    if any(s.get('quality')!='CLOSED_CONFIRMED' for s in (day,h4)):return None
    if day.get('trend')!=aligned or h4.get('trend')!=aligned:return None
    risk=int(x.get('structure_risk_score') or 0)
    if risk>=45:return None
    score=int(x.get('score') or 0)
    if score<58:return None

    weekly=week.get('quality')=='CLOSED_CONFIRMED' and week.get('trend')==aligned
    # Weekly candle establishes the 3–7 day background; the daily chart is
    # the actionable chart for a 3–7 day thesis, not 1-minute candles.
    primary='1D' if weekly else '4H'
    horizon='3–7 gün' if weekly else '1–3 gün'
    h1ok=h1.get('quality')=='CLOSED_CONFIRMED' and h1.get('trend')==aligned
    m15ok=m15.get('quality')=='CLOSED_CONFIRMED' and m15.get('trend')==aligned
    m5ok=m5.get('quality')=='CLOSED_CONFIRMED' and m5.get('trend')==aligned
    micro=one_minute or {}
    one_ok=micro.get('quality')=='CLOSED_CONFIRMED' and micro.get('trend')==aligned
    # Micro candles have zero authority to create a swing candidate. They
    # only raise its timing stage when all macro gates already passed.
    confirmed=h1ok and m15ok and one_ok and m5ok and risk<35 and score>=67
    stage='CONFIRMED' if confirmed else 'WATCH'
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
    if threshold is None:threshold=price
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
        'model_version':MODEL,'observed_at_utc':UTC.isoformat(timespec='seconds'),
        'main_candle_at':last4,'market_structure_flags':x.get('structure_flags',[])[:9],
        'confirmation':{'1W':bool(weekly),'1D':True,'4H':True,
                        '1H':h1ok,'15m':m15ok,'5m':m5ok,'1m':one_ok,
                        '1m_available':micro.get('quality')=='CLOSED_CONFIRMED'},
        'confirmation_note':'1D+4H core; 1W background; 1H/15m/5m/closed-1m timing only',
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
    return sorted(result,key=lambda x:(x['stage']!='CONFIRMED',-x['score'],x['risk_score']))[:20]

def accumulate(old,items):
    """Append only new forward observed 4H setups / stage transitions."""
    history=list(old.get('events',[]))
    existing={e['event_id'] for e in history}
    changes=0
    for spark in items:
        event_id=spark['id']+'|'+spark['stage']
        if event_id in existing:continue
        event={
            'event_id':event_id,'id':spark['id'],'time':spark['observed_at_utc'],
            'at_ms':MS,'symbol':spark['symbol'],'side':spark['side'],
            'stage':spark['stage'],'primary_tf':spark['primary_tf'],
            'expected_holding':spark['expected_holding'],'price':spark['price'],
            'score':spark['score'],'risk_score':spark['risk_score'],
            'confirmation':spark['confirmation'],
            'main_candle_at':spark['main_candle_at'],'model_version':MODEL,
            'state':'OBSERVED_ONLY','realized_R':None,'win_rate':None,
            'is_executed_trade':False
        }
        history.append(event);existing.add(event_id);changes+=1
    history=[e for e in history if MS-int(e.get('at_ms',0))<90*86400000]
    return {'model_version':MODEL,'updated_at':UTC.isoformat(timespec='seconds'),
            'events':history,'retention_days':90,'no_backfill':True},changes

def main():
    macro=load(DATA/'mtf.json',{})
    market=load(DATA/'market.json',{})
    if macro.get('model_version')!='2.2.0-mtf-swing':
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
    archive=load(ARCH,{'events':[]})
    ledger,changes=accumulate(archive,sparks)
    now14=MS-14*86400000
    public={**ledger,'events':[e for e in ledger['events'] if int(e['at_ms'])>=now14]}
    live={'provider':'OKX','model_version':MODEL,'fetched_at':UTC.isoformat(timespec='seconds'),
          'source_mtf_at':macro['fetched_at'],'timeframes_primary':['1D','4H'],
          'timeframes_macro':['1W','1D','4H'],'timeframes_confirmation':['1H','15m','5m','1m'],
          'items':sparks,'long':sum(s['side']=='LONG' for s in sparks),
          'short':sum(s['side']=='SHORT' for s in sparks),
          'confirmed':sum(s['stage']=='CONFIRMED' for s in sparks),
          'attempted':macro.get('attempted'),'analyzed':macro.get('analyzed'),
          'note':'Only central closed 1D+4H swing observations; low TF never generates a spark.',
          'no_live_orders':True}
    write(ARCH,ledger)
    write(DATA/'swing-history.json',public)
    write(DATA/'swing-radar.json',live)
    print(f'HTF-SPARKS {live["fetched_at"]}={len(sparks)} LONG={live["long"]} SHORT={live["short"]} CONFIRMED={live["confirmed"]} newly_observed={changes}',flush=True)

if __name__=='__main__':main()
