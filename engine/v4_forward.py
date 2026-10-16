#!/usr/bin/env python3
"""Time-forward V4 observational horizons, NEVER paper fills or executed trades.

For each DISCOVERED setup, measure 1h, 4h, 24h, 3d and 7d from the actual
event timestamp, using only complete future OHLC bars. A missed candle yields
DATA_GAP, not a fabricated return. Metrics are directional maximum favorable
and adverse excursions, never cash PnL, and UNKNOWN remains distinct from 0.
"""
import datetime as dt
import pathlib
import math
import mtf
import v4_paper

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web'/'data'
ARCH=ROOT/'archive'/'v4-forward-ledger.json'
VERSION='4.0.0-forward-a1'
HORIZONS={'1H':(3600000,'5m',300000),
          '4H':(14400000,'5m',300000),
          '24H':(86400000,'1H',3600000),
          '3D':(3*86400000,'1H',3600000),
          '7D':(7*86400000,'4H',14400000)}
MS_DAY=86400000

def parse(x):
    try:
        value=dt.datetime.fromisoformat(x.replace('Z','+00:00'))
        return int(value.timestamp()*1000) if value.tzinfo else None
    except (ValueError,TypeError,AttributeError):return None

def horizon_result(e,now_ms,bars,span,step):
    when=e.get('event_ms');price=e.get('first_seen_price')
    if not when or not price or price<=0:
        return {'state':'UNKNOWN','reason':'INVALID_OBSERVATION'}
    end=when+span
    # Candles that started before the observation could already contain
    # the eventual high/low. Even if close later, DO NOT count that bar.
    first=((when+step-1)//step)*step
    last=((end-step)//step)*step
    if last<first:
        return {'state':'UNKNOWN','reason':'NO_FULL_POST_SIGNAL_BAR'}
    if now_ms<end+1500:
        return {'state':'TRACKING','reason':'HORIZON_NOT_YET_CLOSED'}
    allowed={int(b['t']):b for b in bars if isinstance(b,dict) and
             first<=int(b.get('t',-1))<=last and
             int(b['t'])+step<=end and int(b['t'])+step<=now_ms-1500}
    needed=list(range(first,last+1,step))
    if not needed or any(t not in allowed for t in needed):
        return {'state':'DATA_GAP','reason':'MISSING_FUTURE_CLOSED_CANDLE',
                'verified_bars':len(allowed),'required_bars':len(needed)}
    chosen=[allowed[t] for t in needed]
    if any(not all(isinstance(b.get(k),(int,float)) and math.isfinite(b[k]) for k in ('o','h','l','c'))
           or b['h']<max(b['o'],b['c'],b['l']) or
           b['l']>min(b['o'],b['c'],b['h']) or b['l']<=0 for b in chosen):
        return {'state':'DATA_GAP','reason':'INVALID_FUTURE_CANDLE'}
    side=e['side']
    favorable=(max(b['h'] for b in chosen)/price-1)*100 if side=='LONG' else (1-min(b['l'] for b in chosen)/price)*100
    adverse=(1-min(b['l'] for b in chosen)/price)*100 if side=='LONG' else (max(b['h'] for b in chosen)/price-1)*100
    closing=(chosen[-1]['c']/price-1)*100*(1 if side=='LONG' else -1)
    return {'state':'OBSERVED','mfe_pct':round(max(0,favorable),4),
            'mae_pct':round(max(0,adverse),4),
            'close_direction_pct':round(closing,4),
            'verified_bars':len(needed),'expected_bar_span_minutes':step//60000,
            'measurement_start_utc':dt.datetime.fromtimestamp(first/1000,dt.timezone.utc).isoformat(),
            'measurement_end_utc':dt.datetime.fromtimestamp((last+step)/1000,dt.timezone.utc).isoformat()}

def rebuild(previous,events,now_ms,bars_by_symbol):
    state={'model_version':VERSION,'started_at':previous.get('started_at') or
           dt.datetime.fromtimestamp(now_ms/1000,dt.timezone.utc).isoformat(),
           'observations':dict(previous.get('observations',{}))}
    observations=state['observations']
    cutoff=now_ms-90*MS_DAY
    for event in events:
        if event.get('type')!='DISCOVERED':continue
        start=parse(event.get('event_time_utc'))
        price=event.get('price_at_transition')
        if start is None or start>now_ms or start<cutoff or not isinstance(price,(int,float)) or price<=0:
            continue
        setup=event.get('setup_id');side=event.get('side')
        if not setup or side not in ('LONG','SHORT'):continue
        if setup not in observations:
            observations[setup]={'setup_id':setup,'strategy_id':event.get('strategy_id'),
                 'symbol':event.get('symbol'),'side':side,'event_ms':start,
                 'observed_at_utc':event['event_time_utc'],
                 'first_seen_price':float(price),
                 'horizons':{},'not_executed_trade':True}
    for setup,x in list(observations.items()):
        if x.get('event_ms',0)<cutoff:
            del observations[setup];continue
        source=bars_by_symbol.get(x['symbol'])
        for horizon,(duration,tf,step) in HORIZONS.items():
            old=x['horizons'].get(horizon,{})
            if old.get('state')=='OBSERVED':continue  # immutable verified result
            if source is None:
                if now_ms>=x['event_ms']+duration:
                    x['horizons'][horizon]={'state':'SOURCE_UNAVAILABLE'}
                continue
            bars=source.get(tf)
            if bars is None:
                if now_ms>=x['event_ms']+duration:
                    x['horizons'][horizon]={'state':'SOURCE_UNAVAILABLE'}
                continue
            result=horizon_result(x,now_ms,bars,duration,step)
            x['horizons'][horizon]=result
    return state

def view(state,scan_id,now_ms):
    values=list(state['observations'].values())
    return {'model_version':VERSION,'scan_id':scan_id,
        'updated_at':dt.datetime.fromtimestamp(now_ms/1000,dt.timezone.utc).isoformat(),
        'observations':len(values),
        'results':sorted(values,key=lambda x:x['event_ms'],reverse=True)[:90],
        'no_real_trades':True,'no_probability_claims':True,
        'notes':['MFE/MAE measures directional closed-candle excursions from first observation.',
                 'Not paper fills or net cash PnL. Missing future candles are DATA_GAP.',
                 'Historical results never backfilled from pre-V4 events.']}

def main():
    now_ms=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    life=v4_paper.read(ROOT/'archive'/'v4-lifecycle-ledger.json',{})
    market=v4_paper.read(DATA/'v4-radar.json',{})
    prior=v4_paper.read(ARCH,{})
    if not life.get('model_version','').startswith('4.0.0-') or not market.get('scan_id'):
        raise RuntimeError('V4 forward source missing')
    events=life.get('events',[])
    existing=prior.get('observations',{})
    symbols={e['symbol'] for e in events if e.get('type')=='DISCOVERED' and
             e.get('symbol','').endswith('USDT')}
    symbols.update(x['symbol'] for x in existing.values() if
                   x.get('symbol','').endswith('USDT'))
    # Budget 8 instruments per cycle; older unresolved cases before new ones
    # but always rotate across all observed symbols.
    unresolved={}
    for x in existing.values():
        if any(x.get('horizons',{}).get(k,{}).get('state') not in ('OBSERVED','DATA_GAP')
               for k in HORIZONS):
            unresolved[x['symbol']]=min(unresolved.get(x['symbol'],now_ms),
                                        x.get('event_ms',now_ms))
    cycle=int(v4_paper.read(DATA/'market.json',{}).get('scan_cycle',0))
    selected=sorted(unresolved,key=lambda k:unresolved[k])[:5]
    remaining=sorted(symbols-set(selected))
    if remaining:
        start=(cycle*3)%len(remaining)
        selected+=(remaining[start:]+remaining[:start])[:max(0,8-len(selected))]
    candles={}
    for symbol in selected:
        inst=symbol[:-4]+'-USDT-SWAP'
        candles[symbol]={}
        for tf in ('5m','1H','4H'):
            try:candles[symbol][tf]=mtf.request(inst,tf)
            except Exception:pass
    ledger=rebuild(prior,events,now_ms,candles)
    public=view(ledger,market['scan_id'],now_ms)
    v4_paper.save(ARCH,ledger)
    v4_paper.save(DATA/'v4-forward.json',public)
    print('V4 FORWARD observed',len(ledger['observations']),'source symbols',len(candles),flush=True)

if __name__=='__main__':main()
