#!/usr/bin/env python3
"""Read-only verified OI observations across actual scan times; no invented 4h OI.

Store 5-minute samples for 6 hours plus hourly samples for 90 days. Only real
observations within stated timestamp tolerances produce 5m/1h/4h changes.
An isolated snapshot always gives UNKNOWN. Contract units are oiUsd from OKX.
"""
import datetime as dt
import pathlib
import v4_paper

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web'/'data'
ARCH=ROOT/'archive'/'v4-oi-timeseries.json'
VERSION='4.0.0-oi-a1'
WINDOWS={'5m':(300000,120000),'1h':(3600000,480000),'4h':(14400000,900000)}

def merge(previous,mtf,now_ms):
    if mtf.get('provider')!='OKX' or mtf.get('model_version')!='3.0.0-mtf-swing':
        raise RuntimeError('Cannot seed OI from unverified exchange')
    # Snapshot is observed_at_utc of research, not the timestamp of a phantom OI trade.
    recent=dict(previous.get('recent') or {})
    hourly=dict(previous.get('hourly') or {})
    seen=0
    for x in mtf.get('candidates',[]):
        symbol=x.get('symbol')
        oi=x.get('open_interest_usd')
        stamp=x.get('observed_at_utc')
        if not symbol or not symbol.endswith('USDT'):continue
        try:
            value=float(oi);t=int(dt.datetime.fromisoformat(stamp).timestamp()*1000)
        except (ValueError,TypeError,KeyError):continue
        if not (value>0 and abs(now_ms-t)<=120000):continue
        bucket=t//300000
        data=recent.get(symbol,[])
        if all(row[0]//300000!=bucket for row in data):
            data.append([t,round(value,4)]);seen+=1
        data.sort(key=lambda a:a[0])
        recent[symbol]=[row for row in data if row[0]>=now_ms-6*3600000][-75:]
        day=hourly.get(symbol,[])
        if all(row[0]//3600000!=t//3600000 for row in day):
            day.append([t,round(value,4)])
        day.sort(key=lambda a:a[0])
        hourly[symbol]=[row for row in day if row[0]>=now_ms-90*86400000][-2200:]
    deltas={}
    for symbol,samples in recent.items():
        all_samples=sorted({row[0]:row for row in samples+(hourly.get(symbol,[]))}.values(),key=lambda x:x[0])
        if not samples:continue
        current=samples[-1]
        delta={}
        for window,(span,tolerance) in WINDOWS.items():
            near=[x for x in all_samples[:-1] if abs(current[0]-x[0]-span)<=tolerance]
            if not near:
                delta[window]={'status':'UNKNOWN','change_pct':None,'observed_minutes':None}
                continue
            base=min(near,key=lambda x:abs(current[0]-x[0]-span))
            d=(current[1]/base[1]-1)*100 if base[1]>0 else None
            delta[window]={'status':'VERIFIED_SNAPSHOT_DELTA' if d is not None else 'UNKNOWN',
                          'change_pct':round(d,4) if d is not None else None,
                          'observed_minutes':round((current[0]-base[0])/60000,2)}
        deltas[symbol]={'oi_usd':current[1],'observed_at_utc':
                         dt.datetime.fromtimestamp(current[0]/1000,dt.timezone.utc).isoformat(),
                         'delta':delta}
    return {'model_version':VERSION,'updated_at':dt.datetime.fromtimestamp(now_ms/1000,dt.timezone.utc).isoformat(),
            'source_mtf_at':mtf['fetched_at'],'recent':recent,'hourly':hourly,
            'deltas':deltas,'new_samples':seen,'unit':'USD_NOTIONAL',
            'no_liquidation_inference':True}

def main():
    now_ms=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    mtf=v4_paper.read(DATA/'mtf.json',{})
    old=v4_paper.read(ARCH,{})
    ledger=merge(old,mtf,now_ms)
    v4_paper.save(ARCH,ledger)
    public={k:v for k,v in ledger.items() if k not in ('recent','hourly')}
    v4_paper.save(DATA/'v4-oi.json',public)
    print('V4 OI',ledger['new_samples'],'new real snapshots',flush=True)

if __name__=='__main__':main()
