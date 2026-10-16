#!/usr/bin/env python3
"""COIN.LIVE PRO: public read-only forward-only observation engine.
Version 3: quote-universe collector ONLY. Older event functions retained as inert test helpers; no 15m signals are produced.
"""
import datetime as dt, json, math, os, pathlib, statistics, time, urllib.parse, urllib.request, urllib.error, threading, random
from concurrent.futures import ThreadPoolExecutor
BASE=pathlib.Path(__file__).resolve().parent.parent
DATA=BASE/'web'/'data'; DATA.mkdir(parents=True, exist_ok=True)
NOW=dt.datetime.now(dt.timezone.utc)
NOW_MS=int(NOW.timestamp()*1000)
UTC=NOW.isoformat(timespec='seconds')
API='https://www.okx.com/api/v5'
HORIZON_DAYS=14
WATCH_MAX=48
TIMEOUT=11
# Shared process-wide limiter: five OHLC workers must NOT burst requests
# through the same Actions egress IP and hit OKX public API HTTP 429.
_REQUEST_LOCK=threading.Lock()
_NEXT_REQUEST_AT=0.0
def pace():
    global _NEXT_REQUEST_AT
    with _REQUEST_LOCK:
        now=time.monotonic()
        delay=max(0.0,_NEXT_REQUEST_AT-now)
        _NEXT_REQUEST_AT=max(_NEXT_REQUEST_AT,now)+0.22  # ~4.5 requests/second
    if delay:time.sleep(delay)
# Known stock/ETF/commodity references listed as OKX USDT swaps; these are
# not cryptocurrency projects. Keep historical records for audit but exclude
# new non-crypto contracts from forward crypto-only research.
NONCRYPTO_BASES=frozenset({
    'AAPL','AMD','AAOI','CHIP','CRCL','CRWV','DRAM','EWY','INTC','MRVL',
    'MSTR','MU','NBIS','NVDA','QQQ','SAMSUNG','SKHY','SKHYNIX','SNDK',
    'SOXL','SOXS','SPCX','TSLA','UNITREE','XAG','XAU','ZHIPU'
})
def eligible_crypto(inst_id):
    if not inst_id.endswith('-USDT-SWAP'):return False
    return inst_id[:-10] not in NONCRYPTO_BASES

def read_json(name, fallback):
    try:return json.loads((DATA/name).read_text(encoding='utf8'))
    except (ValueError,FileNotFoundError):return fallback

def save(name,payload):
    fn=DATA/name
    tmp=fn.with_suffix('.tmp')
    tmp.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf8')
    tmp.replace(fn)

def get(endpoint,params=None):
    qs=('?'+urllib.parse.urlencode(params)) if params else ''
    url=API+endpoint+qs
    req=urllib.request.Request(url,headers={'Accept':'application/json','User-Agent':'CoinLive-Pro/2.2 (read-only research)'})
    for attempt in range(4):
        pace()
        try:
            with urllib.request.urlopen(req,timeout=TIMEOUT) as res:response=json.load(res)
            if response.get('code')=='50011':
                raise urllib.error.HTTPError(url,429,'OKX rate limited',{},None)
            if response.get('code')!='0':raise ValueError('OKX response code '+str(response.get('code')))
            return response.get('data',[])
        except urllib.error.HTTPError as err:
            if err.code not in (429,500) or attempt==3:raise
            header=err.headers.get('Retry-After') if err.headers else None
            try:wait=float(header) if header else 0.0
            except (TypeError,ValueError):wait=0.0
            time.sleep(max(wait,(attempt+1)*1.4)+random.uniform(0.05,.55))
        except (TimeoutError,ConnectionError,OSError):
            if attempt==3:raise
            time.sleep((attempt+1)*.8+random.uniform(0.05,.3))
    raise RuntimeError('OKX provider unavailable after retries')

def price_rows():
    result=[]
    # The instrument directory gives contract lifecycle state/listing timestamps.
    # Ticker feeds alone may still show contracts at preopen/suspension/delisting.
    try:
        metadata={x.get('instId'):x for x in get('/public/instruments',{'instType':'SWAP'})}
    except (OSError,ValueError,KeyError,TimeoutError) as exc:
        print('Instrument lifecycle directory unavailable: '+str(exc)[:100],flush=True)
        metadata={}
    for x in get('/market/tickers',{'instType':'SWAP'}):
        name=x.get('instId','')
        if not eligible_crypto(name):continue
        detail=metadata.get(name)
        state=detail.get('state','UNKNOWN') if detail else 'UNKNOWN'
        if detail and state.lower()!='live':continue
        listed=int(detail.get('listTime') or 0) if detail else 0
        list_age_days=round((NOW_MS-listed)/86400000,2) if listed>0 and listed<=NOW_MS else None
        p=float(x.get('last') or 0);op=float(x.get('open24h') or 0)
        q=float(x.get('volCcyQuote24h') or 0)
        if q<=0:q=float(x.get('volCcy24h') or 0)*p
        if p<=0 or q<5_000_000:continue
        bid=float(x.get('bidPx') or 0);ask=float(x.get('askPx') or 0)
        spread_bps=round((ask-bid)/((ask+bid)/2)*10000,3) if bid>0 and ask>=bid else None
        result.append({'symbol':name[:-10]+'USDT','instrument':name,'price':p,'change':(p/op-1)*100 if op>0 else None,
                       'volume':q,'quote':'USDT','bid':bid or None,'ask':ask or None,'spread_bps':spread_bps,
                       'instrument_state':state,'listing_age_days':list_age_days})
    return sorted(result,key=lambda x:x['volume'],reverse=True)[:100]

def klines(inst,tf,limit=100):
    period={'15m':900000,'1H':3600000,'4H':14400000}[tf]
    raw=get('/market/candles',{'instId':inst,'bar':tf,'limit':str(limit)})
    out=[]
    for c in raw:
        try:
            t=int(c[0]);bar={'t':t,'o':float(c[1]),'h':float(c[2]),'l':float(c[3]),'c':float(c[4]),'v':float(c[5])}
            # OKX completion flag is authoritative; opening 15m bar must not be used.
            if len(c)>=9 and str(c[8])!='1':continue
            if t+period<=NOW_MS-1500:out.append(bar)
        except (IndexError,ValueError,TypeError):continue
    return [bar for _,bar in sorted({x['t']:x for x in out}.items())]

def ema(a,n):
    e=a[0];k=2/(n+1)
    for v in a[1:]:e+=k*(v-e)
    return e

def atr(a):
    x=a[-15:]
    return sum(max(z['h']-z['l'],abs(z['h']-old['c']),abs(z['l']-old['c'])) for z,old in zip(x[1:],x[:-1]))/14

def analyze(m):
    a=klines(m['instrument'],'15m',90);b=klines(m['instrument'],'1H',90);c=klines(m['instrument'],'4H',90)
    if min(map(len,(a,b,c)))<55:return None
    m['_ohlc_ok']=True  # A valid analysis even if no candidate passed the signal gates
    p=m['price'];close1=[x['c'] for x in b];close4=[x['c'] for x in c]
    ema20=ema(close1[-60:],20);ema50=ema(close1[-60:],50);ema4=ema(close4[-60:],20)
    alignment='LONG' if ema20>ema50 and c[-1]['c']>ema4 else 'SHORT' if ema20<ema50 and c[-1]['c']<ema4 else None
    look=a[-15:-1];high=max(z['h'] for z in look);low=min(z['l'] for z in look)
    vol_base=statistics.mean(z['v'] for z in a[-21:-1]);rel_vol=a[-1]['v']/vol_base if vol_base>0 else 0
    width=(4*statistics.pstdev([x['c'] for x in a[-20:]])/statistics.mean(x['c'] for x in a[-20:]))*100
    dist=(high-p)/p*100 if alignment=='LONG' else (p-low)/p*100 if alignment=='SHORT' else None
    proximity=dist is not None and -.25<=dist<=1.0
    atr_v=atr(a);atr_pct=atr_v/p*100
    score=(22 if alignment else 0)+(25 if proximity else 0)+min(19,max(0,(rel_vol-.65)*24))+(15 if width<3 else 10 if width<5 else 4 if width<8 else 0)+(10 if m['volume']>=1e8 else 6 if m['volume']>=2e7 else 0)
    if m['change'] is not None and abs(m['change'])>18:score-=20
    score=int(min(100,max(0,round(score))))
    # Avoid extreme volatility and thin books even when early movement looks exciting.
    if not (.08<atr_pct<6.5) or m['volume']<15e6 or not alignment:score=0
    if m.get('spread_bps') is not None and m['spread_bps']>35:score=0  # Too wide for conservative pilot
    # Confirmed breakout must use a completed 15-minute candle, and not be too extended.
    resistance=max(z['h'] for z in a[-10:-2]);support=min(z['l'] for z in a[-10:-2]);last=a[-1]
    breakout=(last['c']>resistance and last['c']>last['o']) if alignment=='LONG' else (last['c']<support and last['c']<last['o'])
    # Require price near trigger; prior candle can have closed just before collection.
    close_gap=abs(p-last['c'])/p
    confirmed=bool(breakout and rel_vol>=1.4 and close_gap<.018 and score>=62)
    if not proximity and not confirmed:score=max(0,score-35)
    stage='CONFIRMED' if confirmed else 'WATCH'
    if stage=='WATCH' and (not proximity or rel_vol<.95 or score<58):return None
    if stage=='CONFIRMED' and score<62:return None
    stopdist=max(.009*p,1.7*atr_v)
    if not .3<stopdist/p*100<5.5:return None
    side=1 if alignment=='LONG' else -1
    # WATCH levels are plans for follow-up, NOT actionable trade entries.
    entry=p;stop=round(entry-side*stopdist,10)
    targets=[round(entry+side*stopdist*k,10) for k in (1,2,3)]
    return {'symbol':m['symbol'],'venue':'OKX','side':alignment,'stage':stage,'time':UTC,'at_ms':NOW_MS,'price':entry,
      'threshold':round(high if alignment=='LONG' else low,10),'stop':stop,'targets':targets,'score':score,
      'volume_ratio':round(rel_vol,3),'bb_width_pct':round(width,3),'atr_pct':round(atr_pct,3),
      'volume_24h':m['volume'],'candle_time':a[-1]['t'],'why':'1H/4H trend + 15m level proximity / relative volume',
      'ohlc15':[[v['t'],v['o'],v['h'],v['l'],v['c'],v['v']] for v in a[-70:]]}

def update_existing(events,candles):
    """Forward-only: use bars after observation, never pretend missed periods were tracked."""
    for e in events:
        if e.get('state') not in ('OPEN','WATCHING'):continue
        if NOW_MS-int(e['at_ms'])>=7*86400000:
            e['state']='EXPIRED';e['closed_at']=UTC;continue
        bars=candles.get(e['symbol'])
        if bars is None:continue
        observed=e.get('last_observed_ms',e['at_ms'])
        # A >25 hour data gap is not safely reconstructable with our rolling 100-bar OHLC window.
        if NOW_MS-observed>25*3600000:
            e['state']='DATA_GAP';e['closed_at']=UTC;e['quality']='INSUFFICIENT_CONTINUITY';continue
        first_complete_start=((int(e['at_ms'])+900000-1)//900000)*900000
        # Exclude the partially elapsed candle at the event timestamp. Its high/low
        # may have occurred before the alert and would manufacture a past TP/STOP.
        newly=[x for x in bars if x['t']>=first_complete_start and x['t']+900000>observed]
        if not newly:continue
        e['last_observed_ms']=newly[-1]['t']+900000
        side=1 if e['side']=='LONG' else -1
        entry=e['price'];stop=e['stop'];tp=e['targets'][0]
        dist=abs(entry-stop)
        for b in newly:
            fav=(b['h']-entry)/entry*100 if side==1 else (entry-b['l'])/entry*100
            adv=(entry-b['l'])/entry*100 if side==1 else (b['h']-entry)/entry*100
            e['mfe_pct']=round(max(e.get('mfe_pct',0),fav),4)
            e['mae_pct']=round(max(e.get('mae_pct',0),adv),4)
            stop_hit=b['l']<=stop if side==1 else b['h']>=stop
            tp_hit=b['h']>=tp if side==1 else b['l']<=tp
            if stop_hit and tp_hit:
                e['state']='AMBIGUOUS';e['closed_at']=dt.datetime.fromtimestamp(b['t']/1000,dt.timezone.utc).isoformat();e['quality']='BOTH_STOP_AND_TP_IN_ONE_CANDLE';break
            if stop_hit or tp_hit:
                e['state']='STOP' if stop_hit else 'TP1';e['exit_price']=stop if stop_hit else tp
                e['closed_at']=dt.datetime.fromtimestamp(b['t']/1000,dt.timezone.utc).isoformat()
                e['quality']='15M_OHLC_FIRST_TOUCH';e['gross_R']=round(((e['exit_price']-entry)*side)/dist,4)
                # Fixed illustrative total 0.15% notional fee+slippage assumption.
                e['net_R']=round(e['gross_R']-.0015*entry/dist,4)
                break

def summary(events,days):
    start=NOW-dt.timedelta(days=days)
    relevant=[e for e in events if dt.datetime.fromisoformat(e['time'])>=start]
    done=[e for e in relevant if e['stage']=='CONFIRMED' and e['state'] in ('TP1','STOP')]
    ambiguous=sum(e['stage']=='CONFIRMED' and e['state'] in ('AMBIGUOUS','DATA_GAP') for e in relevant)
    wins=sum(e['state']=='TP1' for e in done)
    longs=sum(e['side']=='LONG' for e in relevant);shorts=len(relevant)-longs
    watch_resolved=[e for e in relevant if e['stage']=='WATCH' and e['state'] not in ('WATCHING','OPEN','DATA_GAP','AMBIGUOUS')]
    watch_hit1=sum(e.get('mfe_pct',0)>=1 for e in watch_resolved)
    net=sum(e.get('net_R',0) for e in done)
    # Don't interpret sparse event counts as a statistical edge.
    # Expiration is a separate outcome, not a win or an identified loss.
    return {'days':days,'total':len(relevant),'longs':longs,'shorts':shorts,'confirmed':sum(e['stage']=='CONFIRMED' for e in relevant),
      'watch':sum(e['stage']=='WATCH' for e in relevant),'closed':len(done),'wins':wins,'losses':len(done)-wins,'ambiguous':ambiguous,
      'open':sum(e['state'] in ('OPEN','WATCHING') for e in relevant),'win_rate':round(wins/len(done)*100,2) if done else None,
      'sum_net_R':round(net,4) if done else None,'avg_net_R':round(net/len(done),4) if done else None,
      'illustrative_100_usdt_delta':round(net,2) if done else None, 'notional_risk_model':'$100 hypothetical constant base; 1%=$1 per confirmed outcome; concurrent trades ignored; NOT portfolio PnL',
      'sample_ok':len(done)>=30,'watch_1pct_observed':watch_hit1,'watch_observed':len(watch_resolved),
      'watch_1pct_observed_rate':round(watch_hit1/len(watch_resolved)*100,2) if watch_resolved else None,
      'note':'Observed events only; no backfilled trades, no verified predictive edge. Net R illustrative 0.15% notional friction.'}

def main():
    """3.0 quotes + rotating symbol universe only; NO 15m event generation."""
    rows=price_rows()
    if len(rows)<30:raise RuntimeError('Verified market quote coverage too small')
    old=read_json('market.json',{})
    cycle=int(old.get('scan_cycle',-1))+1
    save('market.json',{
        'provider':'OKX','fetched_at':UTC,'rows':rows,'analyzed':len(rows),
        'analysis_attempted':0,'analysis_ok':0,'model_version':'3.0.0-market-quotes',
        'scan_cycle':cycle,'scan_rotation':5,'errors':[],
        'note':'3.0 quote universe ONLY. Legacy 15m signal source retired; closed 1D+4H analysis is in mtf.json.'
    })
    print(f'V3 MARKET {UTC} OKX crypto quotes={len(rows)} scan_cycle={cycle} (legacy 15m signals OFF)',flush=True)
if __name__=='__main__':main()
