#!/usr/bin/env python3
"""COIN.LIVE PRO 3.0 forward-only paper pilot: auditable observation, no live orders.

Paper fills are estimates at the NEXT fully closed 5-minute candle's opening
quote, after signal creation. No retroactive fill. Never claim a real trade.
"""
import datetime as dt
import hashlib
import json
import math
import pathlib
import time
import urllib.parse
import urllib.request

BASE=pathlib.Path(__file__).resolve().parents[1]
DATA=BASE/'web'/'data'
ARCH=BASE/'archive'/'pilot-ledger.json'
NOW=dt.datetime.now(dt.timezone.utc)
NOWMS=int(NOW.timestamp()*1000)
UTC=NOW.isoformat(timespec='seconds')
MODEL='3.0.0-paper-swing'
BAR5=300000;BAR1=60000
FEE_AND_SLIP=.0015   # Illustrative two-sided round-trip; funding not modeled.
RISK=.01
DAILY_CAP=.03
MAX_OPEN=2
MAX_HOLD=7*86400000

def read(path,default):
    try:return json.loads(path.read_text(encoding='utf8'))
    except (OSError,ValueError):return default

def write(path,doc):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(json.dumps(doc,ensure_ascii=False,allow_nan=False,separators=(',',':')),encoding='utf8')
    tmp.replace(path)

def bars(inst,frame,limit=100):
    # Critical 1m calls are made ONLY for stop/TP conflicts, not for all coins.
    q=urllib.parse.urlencode({'instId':inst,'bar':frame,'limit':str(limit)})
    url='https://www.okx.com/api/v5/market/candles?'+q
    req=urllib.request.Request(url,headers={'User-Agent':'CoinLive-PaperPilot/3.0','Accept':'application/json'})
    with urllib.request.urlopen(req,timeout=10) as resp:payload=json.load(resp)
    if payload.get('code')!='0':raise RuntimeError('OKX '+str(payload.get('code')))
    period=BAR1 if frame=='1m' else BAR5
    unique={}
    for row in payload.get('data',[]):
        if len(row)<9 or str(row[8])!='1':continue
        t=int(row[0])
        if t+period>NOWMS-1500:continue
        b={'t':t,'o':float(row[1]),'h':float(row[2]),'l':float(row[3]),'c':float(row[4])}
        if min(b['o'],b['h'],b['l'],b['c'])>0:unique[t]=b
    return [unique[k] for k in sorted(unique)]

def append(log,order,kind,details=None,at=None):
    stamp=at or UTC
    seq=len(log['journal'])
    log['journal'].append({'seq':seq,'event_id':str(order['id'])+'|'+kind+'|'+str(seq),
                           'signal_id':order['id'],'type':kind,'at':stamp,'model_version':MODEL,
                           'details':details or {}})

def stop_and_tp(bar,o):
    s=o['side'];stop=o['stop'];tp=o['tp1']
    if s=='LONG':return bar['l']<=stop,bar['h']>=tp
    return bar['h']>=stop,bar['l']<=tp

def resolve_1m(o,bar5):
    # When 5m high/low hits both, only fully closed 1m candles may order events.
    # If both were touched in the SAME minute, ordering remains ambiguous.
    try:
        small=bars(o['inst'],'1m',100)
    except Exception:return None
    minute=[x for x in small if bar5['t']<=x['t']<bar5['t']+BAR5]
    if len(minute)!=5:return None
    for x in minute:
        stop,tp=stop_and_tp(x,o)
        if stop and tp:return None
        if stop:return 'STOP'
        if tp:return 'TP1'
    return None

def current_balance(log):
    return 100.0+sum(float(o.get('pnl_usdt') or 0) for o in log['orders'].values() if o['status'] in ('TP1','STOP','TIME_EXIT'))

def record_equity(log):
    fills=[o for o in log['orders'].values() if o['status'] in ('TP1','STOP','TIME_EXIT') and o.get('exit_at')]
    fills.sort(key=lambda x:x['exit_at'])
    eq=100.0;peak=eq;dd=0.0
    for o in fills:
        eq+=o.get('pnl_usdt',0.0);peak=max(peak,eq);dd=max(dd,(peak-eq)/peak*100)
    return round(eq,4),round(dd,3)

def settle(log,o,kind,exit_price,stamp,reason=''):
    if o['status']!='FILLED':return
    sign=1 if o['side']=='LONG' else -1
    entry=o['fill_price']
    gross=(exit_price/entry-1)*sign*o['notional']
    fee=o['notional']*FEE_AND_SLIP
    pnl=gross-fee
    o.update(status=kind,exit_price=round(exit_price,10),exit_at=stamp,
             pnl_usdt=round(pnl,5),net_R=round(pnl/o['risk_budget'],4) if o['risk_budget'] else None,
             fee_slippage_est_usdt=round(fee,5),quality='ESTIMATED_5M_OHLC',reason=reason)
    append(log,o,'PAPER_'+kind,{'exit_price':exit_price,'pnl_estimated_usdt':o['pnl_usdt'],'reason':reason},stamp)

def update_order(log,o,raw):
    if o['status'] not in ('PENDING','FILLED'):return
    since=int(o.get('last_eval_ms',o['signal_at_ms']))
    if o['status']=='PENDING' and NOWMS-o['signal_at_ms']>75*60000:
        o['status']='NO_FILL';append(log,o,'NO_FILL',{'reason':'ENTRY_TIMEOUT'});return
    if o['status']=='FILLED' and NOWMS-int(o.get('last_eval_ms',o['filled_at_ms']))>10*3600000:
        o['status']='DATA_GAP';append(log,o,'DATA_GAP',{'reason':'MISSING_5M_CONTINUITY'});return
    first=max(((o['signal_at_ms']//BAR5)+1)*BAR5,since)
    follow=[b for b in raw if b['t']>=first]
    if not follow:return
    for b in follow:
        if o['status']=='PENDING':
            ref=o['signal_price']
            if abs(b['o']/ref-1)>.01:
                o['status']='NO_FILL';append(log,o,'NO_FILL',{'reason':'ENTRY_TOO_LATE','gap_pct':round(abs(b['o']/ref-1)*100,3)});break
            # Earliest fully observable 5m candle begins AFTER the signal.
            day=dt.datetime.fromtimestamp(b['t']/1000,dt.timezone.utc).strftime('%Y-%m-%d')
            active=[q for q in log['orders'].values() if q['status']=='FILLED']
            spent=sum(q['risk_budget'] for q in log['orders'].values() if q.get('filled_day')==day)
            balance=current_balance(log)
            if len(active)>=MAX_OPEN or spent>=balance*DAILY_CAP:
                o['status']='NO_FILL';append(log,o,'NO_FILL',{'reason':'PORTFOLIO_RISK_LIMIT'});break
            direction=1 if o['side']=='LONG' else -1
            entry=b['o']*(1+.00075*direction)
            stop_gap=abs(entry-o['stop'])/entry
            if stop_gap<.003 or stop_gap>.055 or (o['side']=='LONG' and entry<=o['stop']) or (o['side']=='SHORT' and entry>=o['stop']):
                o['status']='NO_FILL';append(log,o,'NO_FILL',{'reason':'INVALID_STOP_AT_FILL'});break
            per_trade=min(balance*RISK,max(0,balance*DAILY_CAP-spent))
            nominal=min(per_trade/(stop_gap+FEE_AND_SLIP),balance*10*.2)
            if nominal<1:
                o['status']='NO_FILL';append(log,o,'NO_FILL',{'reason':'CAPITAL_INSUFFICIENT'});break
            o.update(status='FILLED',fill_price=round(entry,10),filled_at_ms=b['t'],filled_day=day,
                     filled_at=dt.datetime.fromtimestamp(b['t']/1000,dt.timezone.utc).isoformat(),
                     notional=round(nominal,4),risk_budget=round(per_trade,4),
                     margin_10x=round(nominal/10,4),margin_15x=round(nominal/15,4),
                     estimates=['ROUND_TRIP_FEE_SLIPPAGE_0.15PCT','FUNDING_NOT_MODELED','LIQUIDATION_NOT_MODELED'])
            append(log,o,'PAPER_FILLED',{'price':o['fill_price'],'notional':o['notional'],'risk_budget':o['risk_budget']},o['filled_at'])
            # This candle's high/low might have occurred BEFORE its opening was
            # observed by a 15-minute scanner. Do not infer a same-bar exit.
            o['last_eval_ms']=b['t']+BAR5
            continue
        if o['status']!='FILLED':break
        sign=1 if o['side']=='LONG' else -1
        fav=(b['h']/o['fill_price']-1)*100 if sign==1 else (1-b['l']/o['fill_price'])*100
        adv=(1-b['l']/o['fill_price'])*100 if sign==1 else (b['h']/o['fill_price']-1)*100
        o['mfe_pct']=round(max(o.get('mfe_pct',0),fav),4)
        o['mae_pct']=round(max(o.get('mae_pct',0),adv),4)
        stop,tp=stop_and_tp(b,o)
        at=dt.datetime.fromtimestamp((b['t']+BAR5)/1000,dt.timezone.utc).isoformat()
        if stop and tp:
            outcome=resolve_1m(o,b)
            if outcome is None:
                o['status']='AMBIGUOUS';o['exit_at']=at;o['quality']='SAME_5M_STOP_TP_NO_DETERMINISTIC_1M_ORDER'
                append(log,o,'AMBIGUOUS',{'reason':'STOP_AND_TP_SAME_BAR'},at);break
        elif stop:outcome='STOP'
        elif tp:outcome='TP1'
        else:outcome=None
        if outcome:
            price=(min(o['stop'],b['o']) if sign==1 else max(o['stop'],b['o'])) if outcome=='STOP' else o['tp1']
            settle(log,o,outcome,price,at)
            break
        o['last_eval_ms']=b['t']+BAR5
        if o['last_eval_ms']-o['signal_at_ms']>=MAX_HOLD:
            settle(log,o,'TIME_EXIT',b['c'],at,'7D_TIME_EXIT')
            break

def swing_eligible(event,assessed,cutover_ms):
    """Virtual entries require a NEW verified 4H + daily swing thesis."""
    if int(event.get('at_ms',0))<=cutover_ms:return False
    if event.get('stage')!='CONFIRMED':return False
    thesis=assessed.get(event.get('symbol'))
    return bool(thesis and thesis.get('side')==event.get('side')
        and thesis.get('swing_status')=='SWING_CANDIDATE'
        and thesis.get('direction_aligned_4h_1d') is True
        and thesis.get('quality')=='COMPLETE'
        and (thesis.get('structure_risk_score') or 0)<45)

def main():
    """Fresh 3.0 paper-only pilot. NEVER ingest legacy 15m signals/orders."""
    sparks=read(DATA/'swing-history.json',{})
    mtf=read(DATA/'mtf.json',{})
    market=read(DATA/'market.json',{})
    if sparks.get('model_version')!='3.0.0-htf-sparks' or mtf.get('model_version')!='3.0.0-mtf-swing':
        raise RuntimeError('V3 verified source unavailable; no virtual entries')
    if not sparks.get('updated_at') or not mtf.get('fetched_at') or not market.get('fetched_at'):
        raise RuntimeError('Missing 3.0 market timestamps')
    for timestamp in (sparks['updated_at'],mtf['fetched_at'],market['fetched_at']):
        delta=(NOW-dt.datetime.fromisoformat(timestamp)).total_seconds()
        if not -120<=delta<=480:raise RuntimeError('Stale V3 data: refuse new paper decisions')
    log=read(ARCH,None)
    if not isinstance(log,dict) or log.get('model_version')!=MODEL:
        log={'schema_version':3,'pilot_started_at':UTC,'pilot_started_ms':NOWMS,
             'starting_balance':100.,'model_version':MODEL,'orders':{},'journal':[]}
    started=int(log['pilot_started_ms'])
    records=sparks.get('events',[])
    for e in sorted(records,key=lambda x:int(x.get('at_ms',0))):
        if e.get('model_version')!='3.0.0-htf-sparks' or e.get('stage')!='CONFIRMED':continue
        # Only observations admitted under the CURRENT conservative gate can
        # start a new paper position. Never count older 3.0 confirmations as
        # freshly vetted 5-minute signals or retroactively claim an entry.
        if e.get('filter_policy')!='3.0-strict-5min-20261016':continue
        if e.get('entry_timing')!='STRICT_CONFIRMED':continue
        if e.get('entry_timing')=='EXTENDED_WAIT' or int(e.get('risk_score',100))>=35:continue
        at=int(e.get('at_ms',0))
        if at<=started or e.get('event_id') in log['orders']:continue
        side=e.get('side')
        price=float(e.get('price') or 0);stop=float(e.get('stop') or 0)
        tp=float(e.get('target_1r') or 0)
        if side not in ('LONG','SHORT') or min(price,stop,tp)<=0:continue
        if (side=='LONG' and not(stop<price<tp)) or (side=='SHORT' and not(tp<price<stop)):continue
        key=e['event_id']
        log['orders'][key]={
            'id':key,'model_version':MODEL,'inst':e['symbol'][:-4]+'-USDT-SWAP',
            'symbol':e['symbol'],'side':side,'source':'V3_CLOSED_1D_4H_CONFIRMED',
            'signal_at_ms':at,'signal_at':e['time'],'signal_price':price,
            'stop':stop,'tp1':tp,'tp2':tp,'tp3':tp,'status':'PENDING',
            'last_eval_ms':at,'estimated_only':True,'risk_score_at_signal':e.get('risk_score')
        }
        append(log,log['orders'][key],'V3_CONFIRMED_PAPER_CREATED',{'not_executed':True},e['time'])
    groups={}
    for o in log['orders'].values():
        if o['status'] in ('PENDING','FILLED'):groups.setdefault(o['inst'],[]).append(o)
    for inst,orders in list(groups.items())[:12]:
        try:
            recent=bars(inst,'5m',100)
            for order in orders:update_order(log,order,recent)
        except Exception as exc:
            log.setdefault('errors',[]).append({'at':UTC,'inst':inst,'error':str(exc)[:90]})
    equity,drawdown=record_equity(log)
    orders=list(log['orders'].values())
    closed=[o for o in orders if o['status'] in ('TP1','STOP','TIME_EXIT')]
    result={
      'model_version':MODEL,'updated_at':UTC,'pilot_started_at':log['pilot_started_at'],
      'starting_usdt':100.,'estimated_equity_usdt':equity,'max_drawdown_pct_est':drawdown,
      'swing_cutover_at':log['pilot_started_at'],
      'new_entry_rule':'ONLY V3 CONFIRMED 1D+4H FROM V3 START; NO 15M SIGNALS',
      'legacy_micro_positions_preserved':0,
      'open_paper_positions':sum(o['status']=='FILLED' for o in orders),
      'max_concurrent_positions':MAX_OPEN,'risk_per_trade_target_pct':1,'daily_risk_budget_pct':3,
      'closed_paper_orders':len(closed),'wins':sum(o['status']=='TP1' for o in closed),
      'losses':sum(o['status']=='STOP' for o in closed),
      'ambiguous':sum(o['status']=='AMBIGUOUS' for o in orders),
      'no_fill':sum(o['status']=='NO_FILL' for o in orders),
      'pending':sum(o['status']=='PENDING' for o in orders),
      'open_positions':[o for o in orders if o['status']=='FILLED'],
      'recent_orders':sorted(orders,key=lambda o:o['signal_at_ms'],reverse=True)[:30],
      'chain_count':len(orders),'audit_journal_events':len(log['journal']),
      'no_real_trades':True,'historical_reset':True,
      'notes':['V3-only confirmed swing virtual fills after reset',
               '5m candle-based estimated fills, NEVER exchange executions',
               'Funding and liquidation unverified; fee/slip 0.15% nominal']
    }
    write(ARCH,log);write(DATA/'paper.json',result)
    print(f'PAPER V3 {UTC} orders={len(orders)} equity_est={equity:.4f}',flush=True)
if __name__=='__main__':main()
