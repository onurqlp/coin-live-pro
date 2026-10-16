#!/usr/bin/env python3
"""COIN.LIVE PRO 2.0: real, CLOSED, UTC-aligned multi-timeframe market context.

Research context only. Scores are *not* calibrated win probabilities. Daily /
weekly candles are NOT replaced with partial-candle prices.
"""
import concurrent.futures
import datetime as dt
import hashlib
import json
import math
import pathlib
import statistics
import time
import urllib.parse
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web'/'data'
MODEL='2.0.0-mtf-pilot'
PERIOD={'1W':604800000,'1D':86400000,'12H':43200000,'4H':14400000,'1H':3600000,'15m':900000,'5m':300000,'1m':60000}
OKX={'1W':'1Wutc','1D':'1Dutc','12H':'12Hutc','4H':'4H','1H':'1H','15m':'15m','5m':'5m','1m':'1m'}
MIN={'1W':14,'1D':25,'12H':34,'4H':40,'1H':40,'15m':50,'5m':40,'1m':20}
NOW=dt.datetime.now(dt.timezone.utc)
NOWMS=int(NOW.timestamp()*1000)
STAMP=NOW.isoformat(timespec='seconds')
UA='CoinLive-Pro-Research/2.0'

def read(path,default):
    try:return json.loads(path.read_text(encoding='utf8'))
    except (OSError,ValueError):return default

def write(path,payload):
    path.parent.mkdir(exist_ok=True,parents=True)
    temp=path.with_suffix(path.suffix+'.tmp')
    temp.write_text(json.dumps(payload,ensure_ascii=False,allow_nan=False,separators=(',',':')),encoding='utf8')
    temp.replace(path)

def request(inst,frame):
    q=urllib.parse.urlencode({'instId':inst,'bar':OKX[frame],'limit':'95'})
    url='https://www.okx.com/api/v5/market/candles?'+q
    last=None
    for retry in range(2):
        try:
            req=urllib.request.Request(url,headers={'Accept':'application/json','User-Agent':UA})
            with urllib.request.urlopen(req,timeout=10) as response:
                body=json.load(response)
            if body.get('code')!='0':raise ValueError('OKX '+str(body.get('code')))
            unique={}
            for c in body.get('data',[]):
                if len(c)<9 or str(c[8])!='1':continue
                ts=int(c[0])
                if ts+PERIOD[frame]>NOWMS-1500:continue
                b={'t':ts,'o':float(c[1]),'h':float(c[2]),'l':float(c[3]),'c':float(c[4]),'v':float(c[5])}
                if b['c']>0 and b['l']>0 and b['h']>0:unique[ts]=b
            return [unique[t] for t in sorted(unique)]
        except Exception as exc:
            last=exc
            if retry==0:time.sleep(.55)
    raise RuntimeError(str(last)[:100])

def ema(values,n):
    if not values:return None
    out=values[0];k=2/(n+1)
    for x in values[1:]:out+=k*(x-out)
    return out

def atr(bars):
    if len(bars)<15:return None
    recent=bars[-15:]
    tr=[max(a['h']-a['l'],abs(a['h']-b['c']),abs(a['l']-b['c'])) for a,b in zip(recent[1:],recent[:-1])]
    return statistics.mean(tr)

def state(bars,frame):
    required=MIN[frame]
    if len(bars)<required:
        return {'quality':'NO_HISTORY','count':len(bars),'needed':required,'trend':'UNKNOWN','bar':OKX[frame]}
    c=[x['c'] for x in bars]
    short=ema(c[-55:],12);long=ema(c[-55:],26)
    v=atr(bars)
    if not v or not math.isfinite(v):
        return {'quality':'INVALID_ATR','count':len(bars),'trend':'UNKNOWN','bar':OKX[frame]}
    delta=(short/long-1)*100
    bias='UP' if short>long and c[-1]>short else 'DOWN' if short<long and c[-1]<short else 'SIDEWAYS'
    sample=c[-20:]
    width=4*statistics.pstdev(sample)/statistics.mean(sample)*100
    earlier=c[max(0,len(c)-8)]
    return {'quality':'CLOSED_CONFIRMED','count':len(bars),'trend':bias,'bar':OKX[frame],
            'close':c[-1],'last_candle_utc':dt.datetime.fromtimestamp(bars[-1]['t']/1000,dt.timezone.utc).isoformat(),
            'ema_delta_pct':round(delta,3),'atr_pct':round(v/c[-1]*100,3),
            'bb_width_pct':round(width,3),'move_7bars_pct':round((c[-1]/earlier-1)*100,3)}

def score_part(st,side):
    if st['quality']!='CLOSED_CONFIRMED':return None
    direction='UP' if side=='LONG' else 'DOWN'
    if st['trend']==direction:return 85
    if st['trend']=='SIDEWAYS':return 53
    return 22

def assess(m,all_frames,prior):
    tf={frame:state(bars,frame) for frame,bars in all_frames.items()}
    last_quote=float(m['price'])
    htf=['1W','1D','12H']
    tactical=['4H','1H','15m']
    macro_available=[score_part(tf[x],prior) for x in htf]
    momentum_available=[score_part(tf[x],prior) for x in tactical]
    macro=[v for v in macro_available if v is not None]
    momentum=[v for v in momentum_available if v is not None]
    macro_score=round(statistics.mean(macro)) if macro else None
    mom_score=round(statistics.mean(momentum)) if momentum else None
    entry_score=score_part(tf['5m'],prior)
    # Missing macro history reduces confidence; does not manufacture weekly data
    if mom_score is None:return None
    weights=[(macro_score,0.35),(mom_score,0.50),(entry_score,0.15)]
    denom=sum(w for v,w in weights if v is not None)
    total=round(sum(v*w for v,w in weights if v is not None)/denom)
    if len(macro)<3:total=min(total,72)
    disagreement=macro_score is not None and macro_score<47 and mom_score>66
    if disagreement:total=min(total,64)
    mode='REVERSAL_CANDIDATE' if disagreement else (
         'TREND_CONTINUATION' if macro_score and macro_score>=70 and mom_score>=66 else
         'SWING_7D' if macro_score and macro_score>=59 and mom_score>=55 else
         'BREAKOUT_EARLY' if mom_score>=65 else 'INTRADAY')
    quality='COMPLETE' if len(macro)==3 and all(tf[x]['quality']=='CLOSED_CONFIRMED' for x in tactical+['5m']) else 'PARTIAL_HISTORY'
    expected='1-7 gün' if mode in ('SWING_7D','TREND_CONTINUATION','REVERSAL_CANDIDATE') else '15 dakika-12 saat'
    reason=['CLOSED_UTC_CANDLES']
    if disagreement:reason.append('TREND_CONFLICT')
    if quality!='COMPLETE':reason.append('NO_HISTORY')
    if tf['15m'].get('atr_pct',0)>4:reason.append('VOLATILITY_SPIKE')
    spread=m.get('spread_bps')
    if spread is None:
        reason.append('SPREAD_UNKNOWN')
        total=min(total,73)
    elif spread>35:
        reason.append('SPREAD_TOO_WIDE')
        total=min(total,45)
    elif spread>18:
        reason.append('SPREAD_ELEVATED')
        total=min(total,66)
    return {'symbol':m['symbol'],'side':prior,'setup_type':mode,'score':max(0,min(100,total)),
        'macro_score':macro_score,'momentum_score':mom_score,'entry_quality_score':entry_score,
        'frames':tf,'quality':quality,'reason_codes':reason,'expected_holding':expected,
        'price_reference':last_quote,'volume_24h':m['volume'],'spread_bps':spread,'model_version':MODEL,
        'observed_at_utc':STAMP,'source':'OKX read-only'}

def main():
    market=read(DATA/'market.json',{})
    radar=read(DATA/'radar.json',{})
    history=read(DATA/'history.json',{})
    if len(market.get('rows',[]))<30 or not radar.get('items'):raise RuntimeError('No verified current candidate universe')
    time_market=dt.datetime.fromisoformat(market['fetched_at'])
    if (NOW-time_market).total_seconds()>360:raise RuntimeError('Stale underlying scanner; MTF will not publish')
    rows={x['symbol']:x for x in market['rows']}
    candidates={x['symbol']:x['side'] for x in radar.get('items',[])[:12] if x.get('side') in ('LONG','SHORT')}
    for e in history.get('events',[]):
        if e.get('state') in ('OPEN','WATCHING') and e.get('stage')=='CONFIRMED' and e['symbol'] in rows:
            candidates.setdefault(e['symbol'],e['side'])
            if len(candidates)>=15:break
    # BTC & ETH always measured, even if not in current watchlist.
    for sym in ('BTCUSDT','ETHUSDT'):
        if sym not in candidates and sym in rows:
            candidates[sym]='LONG' if (rows[sym].get('change') or 0)>=0 else 'SHORT'
    candidates=dict(list(candidates.items())[:18])
    errors=[];out=[]
    def work(pair):
        symbol,side=pair;m=rows[symbol]
        inst=m.get('instrument',symbol[:-4]+'-USDT-SWAP')
        frames={}
        try:
            for tf in PERIOD:
                if tf=='1m':continue # 1m is reserved for critical paper exit ordering
                frames[tf]=request(inst,tf)
            return assess(m,frames,side)
        except Exception as exc:
            errors.append(symbol+': '+str(exc)[:110])
            return None
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for x in pool.map(work,candidates.items()):
            if x:out.append(x)
    if len(out)<max(3,len(candidates)//3):raise RuntimeError('Insufficient multi-timeframe coverage; keeping last verified output')
    output={'model_version':MODEL,'provider':'OKX','fetched_at':STAMP,'attempted':len(candidates),
        'analyzed':len(out),'candidates':sorted(out,key=lambda x:x['score'],reverse=True),
        'regime':{sym:next((x for x in out if x['symbol']==sym),None) for sym in ('BTCUSDT','ETHUSDT')},
        'warnings':errors[:15], 'paper_trade_status':'SEPARATE_EXPERIMENT'}
    write(DATA/'mtf.json',output)
    print(f'MTF {STAMP} attempted={len(candidates)} verified={len(out)} model={MODEL}',flush=True)
if __name__=='__main__':main()
