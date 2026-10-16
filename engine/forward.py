#!/usr/bin/env python3
"""COIN.LIVE PRO 3.0: auditable forward-only 4H directional outcome tracking.

No historical backfill: 3.0 observations are registered when first seen.
Outcomes use ONLY fully closed 4H candles starting strictly after observation.
Intrabar target/stop collisions are AMBIGUOUS; no simulated fills or PnL.
"""
import datetime as dt
import json
import pathlib
import math
import concurrent.futures
import mtf

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web'/'data'
ARCH=ROOT/'archive'/'swing-outcomes-ledger.json'
MODEL='3.0.0-forward-observation'
BAR4=14400000
DAY=86400000
TERMINAL={'FAVORABLE_1R','ADVERSE_1R','AMBIGUOUS','EXPIRED'}

def load(path,default):
    try:return json.loads(path.read_text(encoding='utf8'))
    except (OSError,ValueError):return default

def save(path,value):
    path.parent.mkdir(exist_ok=True,parents=True)
    tmp=path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(json.dumps(value,ensure_ascii=False,allow_nan=False,separators=(',',':')),encoding='utf8')
    tmp.replace(path)

def register(events,existing):
    """Never infer a historical entry or re-label 2.x observations as 3.0."""
    by_id={x['event_id']:dict(x) for x in existing}
    added=0
    for e in events:
        if e.get('model_version')!='3.0.0-htf-sparks':continue
        if e.get('event_id') in by_id:continue
        price=mtf.swing.num(e.get('price'))
        stop=mtf.swing.num(e.get('stop'))
        target=mtf.swing.num(e.get('target_1r'))
        side=e.get('side')
        when=e.get('at_ms')
        if side not in ('LONG','SHORT') or not price or not stop or not target or not isinstance(when,int):continue
        if side=='LONG' and not (stop<price<target):continue
        if side=='SHORT' and not (target<price<stop):continue
        by_id[e['event_id']]={
            'event_id':e['event_id'],'symbol':e['symbol'],'side':side,'stage':e['stage'],
            'model_version':'3.0.0-htf-sparks','at_ms':when,'price':price,
            'stop':stop,'target_1r':target,'risk_score':e.get('risk_score'),
            'score':e.get('score'),'primary_tf':e.get('primary_tf'),
            'horizon_days':7 if e.get('primary_tf')=='1D' else 3,
            'status':'TRACKING','mfe_pct':None,'mae_pct':None,'checked_bars':0,
            'last_candle_end_ms':None,'is_executed_trade':False,'realized_R':None
        }
        added+=1
    return list(by_id.values()),added

def evaluate(e,bars,now_ms):
    """Process strictly chronological, contiguous, post-observation closed 4H bars."""
    out=dict(e)
    if out.get('status') in TERMINAL:return out
    start=((int(e['at_ms'])//BAR4)+1)*BAR4
    expiry=int(e['at_ms'])+int(e['horizon_days'])*DAY
    latest_start=min(now_ms-1500-BAR4,expiry-BAR4)
    eligible=sorted((b for b in bars if start<=int(b['t'])<=latest_start),key=lambda b:b['t'])
    seen=set()
    good=[];expected=start
    for b in eligible:
        t=int(b['t'])
        if t in seen:continue
        seen.add(t)
        if t!=expected:
            out['status']='DATA_GAP'
            return out
        values=[mtf.swing.num(b.get(k)) for k in ('o','h','l','c')]
        if any(v is None or v<=0 for v in values) or values[2]>values[1]:
            out['status']='DATA_GAP';return out
        good.append(b);expected+=BAR4
    if not good:
        if latest_start>=start:out['status']='DATA_GAP'
        elif now_ms>=expiry:out['status']='EXPIRED'
        else:out['status']='TRACKING'
        return out
    price=float(e['price']);sign=1 if e['side']=='LONG' else -1
    favorable=0.0;adverse=0.0
    out['status']='TRACKING'
    for b in good:
        high=float(b['h']);low=float(b['l'])
        fav=high if sign>0 else low
        adv=low if sign>0 else high
        favorable=max(favorable,sign*(fav/price-1)*100)
        adverse=min(adverse,sign*(adv/price-1)*100)
        target_hit=high>=e['target_1r'] if sign>0 else low<=e['target_1r']
        adverse_hit=low<=e['stop'] if sign>0 else high>=e['stop']
        out['checked_bars']+=1 if False else 0
        if target_hit or adverse_hit:
            out['status']='AMBIGUOUS' if target_hit and adverse_hit else ('FAVORABLE_1R' if target_hit else 'ADVERSE_1R')
            out['event_candle_start_ms']=int(b['t'])
            break
    out['checked_bars']=good.index(b)+1 if out['status'] in TERMINAL and out['status']!='EXPIRED' else len(good)
    out['last_candle_end_ms']=int(good[out['checked_bars']-1]['t'])+BAR4
    out['mfe_pct']=round(favorable,3)
    out['mae_pct']=round(adverse,3)
    if out['status']=='TRACKING' and now_ms>=expiry:
        out['status']='EXPIRED'
    return out

def report(events,days,now_ms):
    subset=[e for e in events if now_ms-int(e['at_ms'])<=days*DAY]
    counts={status:sum(x.get('status')==status for x in subset)
            for status in ('FAVORABLE_1R','ADVERSE_1R','AMBIGUOUS','EXPIRED','TRACKING','DATA_GAP')}
    resolved=counts['FAVORABLE_1R']+counts['ADVERSE_1R']
    return {'days':days,'observations':len(subset),'confirmed':sum(e['stage']=='CONFIRMED' for e in subset),
       'watch':sum(e['stage']=='WATCH' for e in subset),
       'favorable_1r':counts['FAVORABLE_1R'],'adverse_1r':counts['ADVERSE_1R'],
       'ambiguous':counts['AMBIGUOUS'],'expired':counts['EXPIRED'],
       'tracking':counts['TRACKING'],'data_gap':counts['DATA_GAP'],
       'resolved':resolved,'observed_direction_rate_pct':round(100*counts['FAVORABLE_1R']/resolved,2) if resolved>=30 else None,
       'minimum_resolved_for_rate':30,'rate_is_not_win_probability':True}

def build(archive,event_doc,fetch,now_ms):
    records,added=register(event_doc.get('events',[]),archive.get('events',[]))
    active=[e for e in records if e.get('status') not in TERMINAL and
            now_ms-int(e['at_ms'])<=15*DAY]
    symbols=sorted({e['symbol'] for e in active})[:32]
    def one(symbol):
        inst=symbol[:-4]+'-USDT-SWAP'
        try:return symbol,fetch(inst,'4H')
        except Exception:return symbol,None
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        candles=dict(pool.map(one,symbols))
    result=[]
    for e in records:
        if e.get('event_id') is None:continue
        if e.get('status') in TERMINAL or e['symbol'] not in candles:
            result.append(e);continue
        c=candles[e['symbol']]
        if c is None:
            stale=dict(e);stale['data_fresh']=False
            result.append(stale)
        else:
            measured=evaluate(e,c,now_ms);measured['data_fresh']=True
            result.append(measured)
    result=[e for e in result if now_ms-int(e['at_ms'])<=90*DAY]
    result.sort(key=lambda e:e['at_ms'])
    return {
      'model_version':MODEL,'updated_at':dt.datetime.fromtimestamp(now_ms/1000,dt.timezone.utc).isoformat(),
      'events':result,'new_observations':added,'reports':[report(result,days,now_ms) for days in (7,14)],
      'source':'OKX 4H closed candles','observation_only':True,'no_legacy_backfill':True,
      'no_executed_orders':True,'notes':'Forward observation only. Ambiguous same-candle threshold crossings, unknown data and expired observations are not wins.'
    }

def main():
    now_ms=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    source=load(DATA/'swing-history.json',{})
    if source.get('model_version')!='3.0.0-htf-sparks':
        raise RuntimeError('Forward evaluation requires v3 closed-candle source')
    if not source.get('updated_at'):
        raise RuntimeError('Missing source timestamp')
    age=now_ms-int(dt.datetime.fromisoformat(source['updated_at']).timestamp()*1000)
    if not -120000<=age<=540000:raise RuntimeError('Stale source observations')
    archive=load(ARCH,{'events':[]})
    result=build(archive,source,mtf.request,now_ms)
    save(ARCH,result)
    public={**result,'events':[e for e in result['events'] if now_ms-e['at_ms']<=14*DAY][-120:]}
    save(DATA/'swing-outcomes.json',public)
    print('FORWARD3',len(result['events']),'new',result['new_observations'],
          '7d',result['reports'][0],flush=True)
if __name__=='__main__':main()
