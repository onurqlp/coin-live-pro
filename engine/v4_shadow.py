#!/usr/bin/env python3
"""Shadow all-eligible intent study: independent of 10k cash/margin entirely.

Only time-forward closed 5m OHLC can fill a hypothetical $1000 notional
research attempt. STOP and TP in one candle => AMBIGUOUS, not a shadow win.
Funding remains UNKNOWN. This is not the V4 portfolio's performance.
"""
import datetime as dt
import json
import pathlib
import mtf
import v4_paper

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web'/'data'
ARCH=ROOT/'archive'/'v4-shadow-ledger.json'
VERSION='4.0.0-shadow-a1'
BAR=300000

def start(now):
    return {'model_version':VERSION,'started_at':v4_paper.new_account(now,{'policy_version':'4.0.0-research-20261016'})['pilot_started_at'],
            'started_ms':now,'attempts':{},'no_real_orders':True}

def build(old,events,now,bars,specs,config):
    doc=dict(old) if old and old.get('model_version')==VERSION else start(now)
    attempts=doc['attempts']
    for e in events:
        if e.get('type')!='ENTRY_ELIGIBLE' or not e.get('trade_intent_id'):continue
        key=e['trade_intent_id']
        if key in attempts:continue
        try:ms=int(dt.datetime.fromisoformat(e['event_time_utc']).timestamp()*1000)
        except (ValueError,TypeError,KeyError):continue
        if ms<=doc['started_ms'] or ms>now:continue
        if e.get('strategy_id')!='TREND_BREAKOUT' or e.get('data_quality')!='FRESH':continue
        price=e.get('price_at_transition');stop=e.get('stop');targets=e.get('targets') or []
        if not isinstance(price,(int,float)) or not isinstance(stop,(int,float)) or len(targets)<1:continue
        sign=1 if e.get('side')=='LONG' else -1
        if sign*(price-stop)<=0 or sign*(targets[0]-price)<=0:continue
        attempts[key]={'intent_id':key,'symbol':e['symbol'],'side':e['side'],'status':'PENDING',
              'signal_at_ms':ms,'signal_price':price,'stop':stop,'target_1r':targets[0],
              'reference_notional_usdt':1000.,'funding_state':'UNKNOWN_NOT_MODELED',
              'fee_side_pct':config['paper']['example_fee_side_pct'],
              'slip_side_pct':config['paper']['example_slippage_side_pct']}
    for a in attempts.values():
        candles=sorted(bars.get(a['symbol']) or [],key=lambda b:b['t'])
        if a['status']=='PENDING':
            first=((a['signal_at_ms']//BAR)+1)*BAR
            eligible=[b for b in candles if b['t']>=first and b['t']+BAR<=now-1500]
            if not eligible:
                if now-a['signal_at_ms']>config['paper']['max_entry_delay_minutes']*60000:
                    a['status']='DATA_GAP';a['reason']='MISSING_FIRST_FUTURE_BAR'
                continue
            bar=eligible[0]
            if bar['t']!=first:
                a['status']='NO_FILL';a['reason']='FIRST_FUTURE_BAR_MISSING';continue
            spec=specs.get(a['symbol'])
            sign=1 if a['side']=='LONG' else -1
            slip=config['paper']['example_slippage_side_pct']/100
            fill=bar['o']*(1+sign*slip)
            if abs(fill/a['signal_price']-1)>.025:
                a['status']='NO_FILL';a['reason']='EXCESSIVE_GAP';continue
            sizing=v4_paper.quantity_for(1000.,fill,spec,a['symbol'])
            if not sizing:
                a['status']='NO_FILL';a['reason']='CONTRACT_LOT_UNVERIFIED';continue
            a.update(status='FILLED',fill_at_ms=first,fill_price=fill,quantity=sizing['base_qty'],
                     last_bar_ms=first)
        if a['status']!='FILLED':continue
        sign=1 if a['side']=='LONG' else -1
        fee=config['paper']['example_fee_side_pct']/100
        slip=config['paper']['example_slippage_side_pct']/100
        for b in candles:
            if b['t']<=a['last_bar_ms'] or b['t']+BAR>now-1500:continue
            if b['t']!=a['last_bar_ms']+BAR:
                a['status']='DATA_GAP';a['reason']='MISSING_SEQUENTIAL_BAR';break
            a['last_bar_ms']=b['t']
            hit_tp=b['h']>=a['target_1r'] if sign>0 else b['l']<=a['target_1r']
            hit_stop=b['l']<=a['stop'] if sign>0 else b['h']>=a['stop']
            if not(hit_tp or hit_stop):continue
            if hit_tp and hit_stop:
                a['status']='AMBIGUOUS';a['reason']='STOP_AND_TP_SAME_5M_NO_ORDERING';break
            raw=a['target_1r'] if hit_tp else (
                  b['o'] if (b['o']<a['stop'] if sign>0 else b['o']>a['stop']) else a['stop'])
            exit_price=raw*(1-sign*slip)
            qty=a['quantity']
            costs=qty*(a['fill_price']+exit_price)*fee
            net=sign*qty*(exit_price-a['fill_price'])-costs
            initial_risk=qty*abs(a['fill_price']-a['stop'])+costs
            a.update(status='FAVORABLE_1R' if hit_tp else 'ADVERSE_1R',
                     closed_at_ms=b['t']+BAR,exit_price=exit_price,
                     net_pnl_usdt=round(net,4),net_R=round(net/initial_risk,4) if initial_risk>0 else None,
                     estimated_only=True)
            break
    cutoff=now-90*86400000
    doc['attempts']={k:v for k,v in attempts.items() if v['signal_at_ms']>=cutoff}
    return doc

def main():
    now=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    config=v4_paper.read(ROOT/'config'/'v4-policy.json',{})
    state=v4_paper.read(ROOT/'archive'/'v4-lifecycle-ledger.json',{})
    market=v4_paper.read(DATA/'market.json',{})
    old=v4_paper.read(ARCH,{})
    symbols={v['symbol'] for v in old.get('attempts',{}).values()
             if v.get('status') in ('FILLED','PENDING')}
    for e in state.get('events',[]):
        if e.get('type')=='ENTRY_ELIGIBLE':symbols.add(e['symbol'])
    candles={};specs={}
    for symbol in sorted(symbols):
        inst=symbol[:-4]+'-USDT-SWAP'
        try:candles[symbol]=mtf.request(inst,'5m')
        except Exception:candles[symbol]=[]
        specs[symbol]=v4_paper.fetch_instrument(symbol)
    ledger=build(old,state.get('events',[]),now,candles,specs,config)
    v4_paper.save(ARCH,ledger)
    v4=v4_paper.read(DATA/'v4-radar.json',{})
    items=list(ledger['attempts'].values())
    public={'model_version':VERSION,'updated_at':dt.datetime.fromtimestamp(now/1000,dt.timezone.utc).isoformat(),
            'scan_id':v4.get('scan_id'),'attempted':len(items),
            'results':items[-80:],'starting_balance_usdt':None,
            'combined_with_main_cash':False,'no_real_orders':True,
            'note':'Independent shadow what-if entries, not an account. Funding unknown, only closed future bars.'}
    v4_paper.save(DATA/'v4-shadow.json',public)
    print('SHADOW',len(items),'hypotheses, no account equity',flush=True)

if __name__=='__main__':main()
