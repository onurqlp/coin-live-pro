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
import swing

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web'/'data'
MODEL='3.0.0-mtf-swing'
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

def derivatives(inst):
    """Optional public OKX funding/current OI observations, never imply OI change."""
    out={'funding_rate':None,'open_interest_usd':None,'book_bid_ask_top5_ratio':None}
    endpoints=[('funding_rate','/api/v5/public/funding-rate',{'instId':inst},'fundingRate'),
               ('open_interest_usd','/api/v5/public/open-interest',{'instType':'SWAP','instId':inst},'oiUsd')]
    for key,path,params,field in endpoints:
        try:
            url='https://www.okx.com'+path+'?'+urllib.parse.urlencode(params)
            req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/json'})
            with urllib.request.urlopen(req,timeout=4) as response:
                d=json.load(response)
            if d.get('code')!='0' or not d.get('data'):continue
            item=d['data'][0]
            n=swing.num(item.get(field))
            if n is None:continue
            ts=item.get('ts')
            if ts is not None:
                age=NOWMS-int(ts)
                if age< -180000 or age>1800000:continue
            out[key]=n
        except (OSError,ValueError,TypeError,KeyError):
            pass
    # Top-five public book is one snapshot, not a persistent wall/spoofing
    # detector. Contract units cancel in bid/ask size ratio on same swap.
    try:
        url='https://www.okx.com/api/v5/market/books5?'+urllib.parse.urlencode({'instId':inst})
        req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/json'})
        with urllib.request.urlopen(req,timeout=4) as response:
            b=json.load(response)
        if b.get('code')=='0' and b.get('data'):
            book=b['data'][0]
            ts=int(book.get('ts') or 0)
            if -180000<=NOWMS-ts<=120000:
                bid=sum(float(level[1]) for level in book.get('bids',[])[:5])
                ask=sum(float(level[1]) for level in book.get('asks',[])[:5])
                if bid>0 and ask>0 and math.isfinite(bid/ask):
                    out['book_bid_ask_top5_ratio']=round(bid/ask,3)
    except (OSError,ValueError,TypeError,KeyError,IndexError):
        pass
    return out

def ema(values,n):
    if not values:return None
    out=values[0];k=2/(n+1)
    for x in values[1:]:out+=k*(x-out)
    return out

def ema_path(values,n):
    """EMA sequence using closed values only (no partial-candle input)."""
    if not values:return []
    out=[float(values[0])]
    alpha=2/(n+1)
    for value in values[1:]:out.append(out[-1]+alpha*(value-out[-1]))
    return out

def rsi14(closes):
    """Wilder RSI(14) on closed bars; neutral 50 for fully flat markets."""
    if len(closes)<16:return None
    gains=[max(0,closes[i]-closes[i-1]) for i in range(1,len(closes))]
    losses=[max(0,closes[i-1]-closes[i]) for i in range(1,len(closes))]
    up=sum(gains[:14])/14
    down=sum(losses[:14])/14
    for g,l in zip(gains[14:],losses[14:]):
        up=(up*13+g)/14
        down=(down*13+l)/14
    if up==down==0:return 50.
    if down==0:return 100.
    return 100-100/(1+up/down)

def macd_closed(closes):
    if len(closes)<35:return None
    a=ema_path(closes,12);b=ema_path(closes,26)
    line=[x-y for x,y in zip(a,b)]
    sig=ema_path(line,9)
    # Normalize as % of price for cross-coin comparability.
    return {'line_pct':round(line[-1]/closes[-1]*100,4),
            'signal_pct':round(sig[-1]/closes[-1]*100,4),
            'hist_pct':round((line[-1]-sig[-1])/closes[-1]*100,4),
            'hist_prev_pct':round((line[-2]-sig[-2])/closes[-2]*100,4)}

def adx14(bars):
    """Wilder ADX(14), reflecting trend strength, not its direction."""
    if len(bars)<29:return None
    tr=[];pd=[];md=[]
    for previous,current in zip(bars[:-1],bars[1:]):
        up=current['h']-previous['h'];down=previous['l']-current['l']
        pd.append(up if up>down and up>0 else 0)
        md.append(down if down>up and down>0 else 0)
        tr.append(max(current['h']-current['l'],abs(current['h']-previous['c']),
                      abs(current['l']-previous['c'])))
    atrv=sum(tr[:14]);p=sum(pd[:14]);m=sum(md[:14]);dx=[]
    for i in range(13,len(tr)):
        if i>13:
            atrv=atrv-atrv/14+tr[i];p=p-p/14+pd[i];m=m-m/14+md[i]
        if atrv<=0:dx.append(0);continue
        plus=100*p/atrv;minus=100*m/atrv
        dx.append(100*abs(plus-minus)/(plus+minus) if plus+minus>0 else 0)
    if len(dx)<14:return None
    v=sum(dx[:14])/14
    for x in dx[14:]:v=(v*13+x)/14
    return v

def compression_percentile(closes):
    """BB(20) relative width percentile in latest 30 CLOSED windows."""
    if len(closes)<50:return None
    widths=[]
    for idx in range(len(closes)-30,len(closes)+1):
        sample=closes[idx-20:idx]
        if len(sample)<20 or statistics.mean(sample)<=0:continue
        widths.append(4*statistics.pstdev(sample)/statistics.mean(sample)*100)
    if len(widths)<20:return None
    latest=widths[-1]
    return round(100*sum(w<=latest for w in widths)/len(widths),1)

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
    # Breakout levels are from bars preceding the most recent CLOSED bar.
    # Do not use a still-forming or future bar as a resistance/support level.
    previous_eight=bars[-9:-1]
    breakout_high=round(max(x['h'] for x in previous_eight),12)
    breakout_low=round(min(x['l'] for x in previous_eight),12)
    last=bars[-1]
    # Potential liquidity grabs: prior 8-bar support/resistance briefly pierced,
    # then 4H/1H candle closed back inside. Suspicion, not manipulation proof.
    false_up=last['h']>breakout_high and last['c']<breakout_high
    false_down=last['l']<breakout_low and last['c']>breakout_low
    previous=[float(x.get('v',0)) for x in bars[-21:-1]]
    average_volume=statistics.mean(previous) if previous else 0
    relative_volume=round(float(bars[-1].get('v',0))/average_volume,3) if average_volume>0 else None
    rejection=0
    for x in bars[-8:]:
        extent=max(1e-12,x['h']-x['l'])
        upper=x['h']-max(x['o'],x['c'])
        lower=min(x['o'],x['c'])-x['l']
        body=abs(x['c']-x['o'])
        if max(upper,lower)/extent>=.62 and body/extent<=.34:
            rejection+=1
    macd=macd_closed(c)
    rsi=rsi14(c)
    adx=adx14(bars)
    comp=compression_percentile(c)
    return {'quality':'CLOSED_CONFIRMED','count':len(bars),'trend':bias,'bar':OKX[frame],
            'close':c[-1],'last_candle_utc':dt.datetime.fromtimestamp(bars[-1]['t']/1000,dt.timezone.utc).isoformat(),
            'ema_delta_pct':round(delta,3),'atr_pct':round(v/c[-1]*100,3),
            'bb_width_pct':round(width,3),'move_7bars_pct':round((c[-1]/earlier-1)*100,3),
            'volume_ratio_20':relative_volume,'wick_rejections_8':rejection,
            'rsi_14':round(rsi,2) if rsi is not None else None,
            'macd_12_26_9':macd,
            'adx_14':round(adx,2) if adx is not None else None,
            'bb_compression_percentile_30':comp,
            'breakout_high_prev8':breakout_high,'breakout_low_prev8':breakout_low,
            'fakeout_up_on_close':bool(false_up),
            'fakeout_down_on_close':bool(false_down)}

def score_part(st,side):
    if st['quality']!='CLOSED_CONFIRMED':return None
    direction='UP' if side=='LONG' else 'DOWN'
    if st['trend']==direction:return 85
    if st['trend']=='SIDEWAYS':return 53
    return 22

def assess(m,all_frames,prior,derivatives_data=None):
    tf={frame:state(bars,frame) for frame,bars in all_frames.items()}
    last_quote=float(m['price'])
    # A radar's 15m direction is never allowed to override the 4H + 1D trend.
    # AUTO means a coin was found by volume/rotation rather than the micro radar.
    d,h=tf['1D'],tf['4H']
    aligned_core=(d.get('quality')=='CLOSED_CONFIRMED' and h.get('quality')=='CLOSED_CONFIRMED'
                  and d.get('trend')==h.get('trend') and d.get('trend') in ('UP','DOWN'))
    if aligned_core:
        # A 15m legacy radar suggestion cannot veto or reverse the DAILY/4H thesis.
        prior='LONG' if d['trend']=='UP' else 'SHORT'
    elif prior=='AUTO':
        if d['quality']=='CLOSED_CONFIRMED' and d['trend'] in ('UP','DOWN'):
            prior='LONG' if d['trend']=='UP' else 'SHORT'
        elif h['quality']=='CLOSED_CONFIRMED' and h['trend'] in ('UP','DOWN'):
            prior='LONG' if h['trend']=='UP' else 'SHORT'
        else:prior='LONG'
    def weighted(frames):
        existing=[(score_part(tf[k],prior),w) for k,w in frames]
        existing=[(score,w) for score,w in existing if score is not None]
        return round(sum(score*w for score,w in existing)/sum(w for _,w in existing)) if existing else None

    # Closed UTC trend: daily 36.4%, 4h 36.55%, weekly 15.6%, hourly 6.45%; micro timing 5%.
    macro_score=weighted([('1D',.70),('1W',.30)])
    mom_score=weighted([('4H',.85),('1H',.15)])
    entry_score=weighted([('15m',.7),('5m',.3)])
    if macro_score is None or mom_score is None:return None
    weights=[(macro_score,.52),(mom_score,.43),(entry_score,.05)]
    valid=[(score,w) for score,w in weights if score is not None]
    total=round(sum(score*w for score,w in valid)/sum(w for _,w in valid))

    quality='COMPLETE' if all(tf[x]['quality']=='CLOSED_CONFIRMED'
                              for x in ('1W','1D','12H','4H','1H','15m','5m')) else 'PARTIAL_HISTORY'
    risk=swing.swing_context(m,tf,prior,derivatives_data)
    total=swing.gate_score(total,risk)
    if quality!='COMPLETE':total=min(total,72)
    disagreement=risk['swing_status']=='WAIT_4H_1D'
    mode=('SWING_7D' if risk['swing_horizon']=='3-7 gün'
          else 'TREND_CONTINUATION' if risk['swing_status']=='SWING_CANDIDATE'
          else 'REVERSAL_CANDIDATE' if disagreement
          else 'BREAKOUT_EARLY' if risk['swing_status']=='SWING_WATCH'
          else 'INTRADAY')
    reason=['CLOSED_UTC_CANDLES','1D_4H_PRIMARY_73PCT']
    if disagreement:reason.append('TREND_CONFLICT')
    if quality!='COMPLETE':reason.append('NO_HISTORY')
    if tf['15m'].get('atr_pct',0)>4:reason.append('VOLATILITY_SPIKE')
    if risk['structure_risk_score']>=45:reason.append('SUSPICIOUS_STRUCTURE_NOT_PROOF')
    reason+=risk['structure_flags']
    spread=m.get('spread_bps')
    if spread is None:
        reason.append('SPREAD_UNKNOWN');total=min(total,73)
    elif spread>35:
        reason.append('SPREAD_TOO_WIDE');total=min(total,39)
    elif spread>18:
        reason.append('SPREAD_ELEVATED');total=min(total,64)
    return {'symbol':m['symbol'],'side':prior,'setup_type':mode,'score':max(0,min(100,total)),
        'macro_score':macro_score,'momentum_score':mom_score,'entry_quality_score':entry_score,
        'frames':tf,'quality':quality,'reason_codes':list(dict.fromkeys(reason)),
        'expected_holding':risk['swing_horizon'],'price_reference':last_quote,
        'volume_24h':m['volume'],'spread_bps':spread,'model_version':MODEL,
        'observed_at_utc':STAMP,'source':'OKX read-only',
        'swing_model':swing.MODEL,'score_weight_note':'1D 36.4%,4H 36.55%,1W 15.6%,1H 6.45%,15m 3.5%,5m 1.5%; 12H context only',
        **risk}

def select_candidates(rows,held,cycle,limit=23):
    """Select hot opportunities fairly while reserving fresh-market coverage.

    Always include available BTC/ETH benchmarks. Eight overdue active
    opportunities are checked before new discovery; selection order uses the
    *oldest actual evaluation*, not the most recently evaluated record. Each
    successful check refreshes its last_evaluated_at in the active ledger, so
    previously skipped opportunities move to the front next cycle.

    Market movers and rotating symbols retain dedicated slots. This function
    chooses symbols only; it never changes a signal's review state or claims a
    scan happened. Actual verified/attempted counters come from mtf.main().
    """
    if limit<=0:return {}
    selected={}
    def add(symbol):
        if symbol in rows and symbol not in selected and len(selected)<limit:
            selected[symbol]='AUTO'
            return True
        return False

    for symbol in ('BTCUSDT','ETHUSDT'):add(symbol)
    eligible=(x for x in held if
              x.get('symbol') in rows and
              x.get('review_state') in ('FRESH','RECHECK_PENDING') and
              x.get('model_version')=='3.0.0-htf-sparks')
    oldest_first=sorted(eligible,key=lambda x:(
        x.get('last_evaluated_at') or x.get('first_seen_at') or '',
        x.get('symbol') or ''))
    hot_count=0
    for x in oldest_first:
        if hot_count>=min(8,max(0,limit-2)):break
        if add(x['symbol']):hot_count+=1

    liquid=sorted(rows.values(),key=lambda x:x.get('volume') or 0,reverse=True)
    movers=sorted(rows.values(),key=lambda x:
                  abs(x.get('change') or 0)*math.sqrt(max(0,x.get('volume') or 0)),
                  reverse=True)
    for x in liquid[:4]+movers[:3]:add(x['symbol'])
    universe=[x['symbol'] for x in liquid if x['symbol'] not in selected]
    if universe:
        offset=(int(cycle)*6)%len(universe)
        for symbol in (universe[offset:]+universe[:offset]):
            if len(selected)>=limit:break
            add(symbol)
    return selected


def main():
    market=read(DATA/'market.json',{})
    if len(market.get('rows',[]))<30:raise RuntimeError('No verified current market universe')
    time_market=dt.datetime.fromisoformat(market['fetched_at'])
    if (NOW-time_market).total_seconds()>360:raise RuntimeError('Stale underlying scanner; MTF will not publish')
    rows={x['symbol']:x for x in market['rows']}
    # Preserve active opportunities with a fair, oldest-first hot-pool budget.
    # Benchmarks, liquidity, momentum and rotating coverage remain distinct.
    tracked=read(ROOT/'archive'/'swing-active-ledger.json',{})
    held=tracked.get('items',[])
    if not held:
        older=read(DATA/'swing-radar.json',{})
        held=older.get('items',[]) if older.get('model_version')=='3.0.0-htf-sparks' else []
    cycle=int(market.get('scan_cycle',0))
    candidates=select_candidates(rows,held,cycle)
    # Compare actual fresh OI snapshots only; a missing historical sample
    # never becomes a fabricated zero or inferred liquidation.
    previous=read(DATA/'mtf.json',{})
    prev_by_symbol={x.get('symbol'):x for x in previous.get('candidates',[])}
    errors=[];out=[]
    def work(pair):
        symbol,side=pair;m=rows[symbol]
        inst=m.get('instrument',symbol[:-4]+'-USDT-SWAP')
        frames={}
        try:
            for tf in PERIOD:
                if tf=='1m':continue # 1m is reserved for critical paper exit ordering
                frames[tf]=request(inst,tf)
            deriv=derivatives(inst)
            older=prev_by_symbol.get(symbol) or {}
            current_oi=deriv.get('open_interest_usd')
            old_oi=swing.num(older.get('open_interest_usd'))
            if old_oi and current_oi and old_oi>0:
                try:
                    age=(NOW-dt.datetime.fromisoformat(older['observed_at_utc'])).total_seconds()
                    if 60<=age<=3600:
                        deriv['oi_change_pct']=round((current_oi/old_oi-1)*100,3)
                        deriv['oi_change_interval_minutes']=round(age/60,2)
                except (ValueError,TypeError,KeyError):
                    pass
            return assess(m,frames,side,deriv)
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
        'warnings':errors[:15], 'paper_trade_status':'V3_FORWARD_ONLY',
        'swing_model':swing.MODEL,'swing_primary_timeframes':['4H','1D'],
        'swing_horizon':'1-7 gün','micro_candles_role':'confirmation_and_entry_only',
        'risk_note':'Structure flags are heuristics, not manipulation proof or calibrated win probabilities.'}
    write(DATA/'mtf.json',output)
    print(f'MTF {STAMP} attempted={len(candidates)} verified={len(out)} model={MODEL}',flush=True)
if __name__=='__main__':main()
