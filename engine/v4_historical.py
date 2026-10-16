#!/usr/bin/env python3
"""OKX public historical OHLC capture for independent 90-day research.

This module intentionally NEVER touches the live V4 paper/lifecycle/forward
ledgers or strategy thresholds. Retrospective candles may support descriptive
research but cannot retroactively generate a verified forward-only signal.

Fixed major-universe + contemporaneously selected additional coins introduce
survivorship/selection bias; they are explicitly tagged, not hidden.
"""
import argparse
import datetime as dt
import gzip
import hashlib
import json
import math
import os
import pathlib
import statistics
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]
BASE=ROOT/'research'/'okx-history'
DATA=ROOT/'web'/'data'
API='https://www.okx.com/api/v5/market/history-candles'
MODEL='4.0.0-historical-ohlc-a1'
BARS={
  '4H':('4H',14400000,90),
  '1D':('1Dutc',86400000,210),
  '1H':('1H',3600000,14)
}
# Ex-ante core is held fixed over time. Others are selected from currently
# active candidates and cannot be used to claim historical universe performance.
CORE=('BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','LINKUSDT','BNBUSDT')
MAX_SYMBOLS=12
MIN_ROWS={'4H':60,'1D':100,'1H':48}
HEADERS={'User-Agent':'CoinLive-V4-Historical-Research/1.0','Accept':'application/json'}
def iso(ms):
    return dt.datetime.fromtimestamp(ms/1000,dt.timezone.utc).isoformat()
def json_load(path,default):
    try:return json.loads(path.read_text(encoding='utf8'))
    except (OSError,ValueError):return default
def write_bytes(path,payload):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_name(path.name+'.tmp')
    tmp.write_bytes(payload);tmp.replace(path)
def save_json(path,value):
    write_bytes(path,(json.dumps(value,ensure_ascii=False,separators=(',',':'),
                  allow_nan=False,sort_keys=True)+'\n').encode('utf8'))
def choose_symbols(market,lifecycle,max_symbols=MAX_SYMBOLS):
    available={x.get('symbol') for x in market.get('rows',[])
               if x.get('symbol') and x.get('instrument_state','live')=='live'}
    core=[s for s in CORE if s in available]
    history=lifecycle.get('items',[])
    watched=sorted({x.get('symbol') for x in history if x.get('symbol') in available})
    # Always keep a predictable core; deterministic secondary list, not by
    # profit or return. Current-market inclusion is a documented selection bias.
    ordered=core+[s for s in watched if s not in core]
    if len(ordered)<max_symbols:
        ordered+=sorted(available-set(ordered))[:max_symbols-len(ordered)]
    return ordered[:max_symbols]

def validate_bar(row,period_ms,now_ms):
    if not isinstance(row,list) or len(row)<9 or str(row[8])!='1':
        return None
    try:
        t=int(row[0]);o,h,l,c,v=[float(row[i]) for i in (1,2,3,4,5)]
    except (ValueError,TypeError,OverflowError):
        return None
    if t%period_ms!=0 or t+period_ms>now_ms-1500:
        return None
    if not all(math.isfinite(x) for x in (o,h,l,c,v)):
        return None
    if min(o,h,l,c)<=0 or l>min(o,c,h) or h<max(o,c,l) or v<0:
        return None
    return [t,o,h,l,c,v]

def request_page(symbol,bar,after=None,sleep=time.sleep,opener=urllib.request.urlopen):
    inst=symbol[:-4]+'-USDT-SWAP'
    params={'instId':inst,'bar':bar,'limit':100}
    if after is not None:params['after']=str(after)
    url=API+'?'+urllib.parse.urlencode(params)
    last=None
    for attempt in range(3):
        try:
            req=urllib.request.Request(url,headers=HEADERS)
            with opener(req,timeout=11) as response:
                result=json.load(response)
            if result.get('code')!='0':
                raise RuntimeError('OKX response '+str(result.get('code')))
            if not isinstance(result.get('data'),list):
                raise RuntimeError('Malformed OKX historical response')
            sleep(.14)
            return result['data']
        except (OSError,ValueError,RuntimeError) as e:
            last=e
            if attempt<2:sleep(1.0*(attempt+1))
    raise RuntimeError('OKX historical source failed: '+str(last)[:130])

def fetch_history(symbol,frame,now_ms,fetch=request_page):
    api_bar,period,days=BARS[frame]
    start=now_ms-days*86400000
    found={};cursor=None;error=None;pages=0
    max_pages=math.ceil(days*86400000/period/100)+3
    for _ in range(max_pages):
        try:
            page=fetch(symbol,api_bar,cursor)
        except Exception as exc:
            error=str(exc)[:155];break
        pages+=1
        if not page:break
        times=[]
        for row in page:
            try:times.append(int(row[0]))
            except (ValueError,TypeError,IndexError):continue
            b=validate_bar(row,period,now_ms)
            if b is not None and b[0]>=start:found[b[0]]=b
        if not times:
            error='INVALID_PAGE_NO_TIMESTAMPS';break
        minimum=min(times)
        if cursor is not None and minimum>=cursor:
            error='PAGINATION_NOT_MOVING_OLDER';break
        cursor=minimum
        if minimum<=start:break
        if len(page)<5:break
    bars=[found[k] for k in sorted(found)]
    gaps=sum((bars[i][0]-bars[i-1][0])//period-1 for i in range(1,len(bars))
             if bars[i][0]>bars[i-1][0]+period)
    target=max(1,math.floor(days*86400000/period))
    coverage=min(1.0,len(bars)/target)
    status='OK' if not error and len(bars)>=MIN_ROWS[frame] else 'INSUFFICIENT'
    if not bars:status='SOURCE_UNAVAILABLE'
    meta={'frame':frame,'api_bar':api_bar,'days_requested':days,
          'requested_after_utc':iso(start),'received':len(bars),
          'expected_approx':target,'coverage_pct':round(100*coverage,2),
          'gaps':gaps,'pages':pages,'status':status,'error':error,
          'first_bar_at':iso(bars[0][0]) if bars else None,
          'last_bar_closed_at':iso(bars[-1][0]+period) if bars else None}
    return bars,meta

def descriptive(bars):
    """Only historical descriptive statistics, NO signal/backtest hit rate."""
    if len(bars)<30:return {'state':'INSUFFICIENT_HISTORY'}
    returns=[(bars[i][4]/bars[i-1][4]-1)*100
             for i in range(1,len(bars)) if bars[i-1][4]>0]
    if len(returns)<20:return {'state':'INSUFFICIENT_HISTORY'}
    return {'state':'DESCRIPTIVE_HISTORY_ONLY','sample_returns':len(returns),
            'median_abs_bar_change_pct':round(statistics.median(map(abs,returns)),4),
            'historical_up_candles':sum(x>0 for x in returns),
            'historical_down_candles':sum(x<0 for x in returns),
            'max_abs_bar_change_pct':round(max(map(abs,returns)),4),
            'historical_last_change_pct':round(returns[-1],4),
            'not_a_win_rate':True}

def build_snapshot(symbol,frame,bars,meta,now_ms):
    doc={'model_version':MODEL,'provider':'OKX',
         'instrument':symbol[:-4]+'-USDT-SWAP','symbol':symbol,
         'market_type':'USDT-SWAP','timeframe':frame,
         'captured_at_utc':iso(now_ms),
         'period_ms':BARS[frame][1],
         'lookahead_prevention':'closed_only_confirm_1',
         'provenance':'OKX market/history-candles public REST',
         'training_only':True,'is_forward_verified_signal':False,
         'selection_bias_warning':True,
         'metadata':meta,'bars':bars}
    raw=(json.dumps(doc,ensure_ascii=False,separators=(',',':'),
                    allow_nan=False,sort_keys=True)+'\n').encode('utf8')
    compressed=gzip.compress(raw,compresslevel=7,mtime=0)
    return compressed,hashlib.sha256(compressed).hexdigest()

def run(now_ms,max_symbols=MAX_SYMBOLS,fetch=request_page,save=True):
    market=json_load(DATA/'market.json',{})
    lifecycle=json_load(ROOT/'archive'/'v4-lifecycle-ledger.json',{})
    names=choose_symbols(market,lifecycle,max_symbols)
    if not names:raise RuntimeError('Live OKX universe unavailable; historical ingest halted')
    jobs=[];success=0
    for symbol in names:
        for frame in BARS:
            candles,meta=fetch_history(symbol,frame,now_ms,fetch)
            entry=dict(meta,symbol=symbol,
                statistics=descriptive(candles),
                artifact='research/okx-history/'+symbol+'-'+frame+'.json.gz')
            if candles and meta['status']=='OK':
                payload,sha=build_snapshot(symbol,frame,candles,meta,now_ms)
                entry['sha256']=sha;entry['bytes_gz']=len(payload)
                if save:write_bytes(BASE/(symbol+'-'+frame+'.json.gz'),payload)
                success+=1
            else:
                entry['sha256']=None
                entry['artifact']=None
            jobs.append(entry)
    accepted=[x for x in jobs if x['status']=='OK']
    status='COMPLETE' if len(accepted)==len(jobs) else 'PARTIAL'
    report={'model_version':MODEL,'provider':'OKX','source_endpoint':'market/history-candles',
      'capture_utc':iso(now_ms),'capture_kind':'RETROSPECTIVE_TRAINING',
      'out_of_sample_forward_starts_utc':lifecycle.get('started_at'),
      'historical_signals_fabricated':False,
      'historical_candle_used_as_forward_event':False,
      'no_exchange_orders':True,'no_google_action':True,
      'selection_bias':'FIXED_CURRENT_MAJOR_COINS_AND_CURRENT_LIVE_WATCHLIST; not historical universe',
      'sample_size_symbols':len(names),
      'instruments':names,'frame_jobs':len(jobs),'successful_frame_jobs':success,
      'capture_status':status,'series':jobs,
      'warnings':['OHLC historic data does not contain exact order-book/funding/OI execution history.',
                  'No past candle may be relabelled as a forward V4 signal.',
                  'Data gaps, listings and current-coin selection can bias historical comparisons.',
                  'Historical descriptive statistics are not a calibrated win probability.']}
    if save:save_json(BASE/'index.json',report)
    if not accepted:raise RuntimeError('All historical OHLC fetches failed; no capture')
    print('HISTORICAL',len(names),'symbols',success,'/',len(jobs),
          'frames accepted, status',status,flush=True)
    return report

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--preview',action='store_true',
                        help='Only first two available coins; feature-branch preview')
    args=parser.parse_args()
    now_ms=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    report=run(now_ms,max_symbols=2 if args.preview else MAX_SYMBOLS)
    if args.preview and report['successful_frame_jobs']<2:
        raise SystemExit('Preview lacks two verified historical frame series')
    if not args.preview and report['successful_frame_jobs']<6:
        raise SystemExit('Low historical baseline coverage: keep last trusted capture')

if __name__=='__main__':main()
