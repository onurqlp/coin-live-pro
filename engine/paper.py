#!/usr/bin/env python3
"""COIN.LIVE PRO 2.0 forward-only paper pilot: auditable observation, no live orders.

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
MODEL='2.2.0-paper-swing'
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
    req=urllib.request.Request(url,headers={'User-Agent':'CoinLive-PaperPilot/2.0','Accept':'application/json'})
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
    history=read(DATA/'history.json',{})
    market=read(DATA/'market.json',{})
    mtf=read(DATA/'mtf.json',{})
    if not history.get('updated_at') or len(market.get('rows',[]))<20:raise RuntimeError('Cannot run paper simulation without healthy authoritative scanner')
    hstamp=dt.datetime.fromisoformat(history['updated_at'])
    mtf_stamp=dt.datetime.fromisoformat(mtf['fetched_at']) if mtf.get('fetched_at') else None
    if (NOW-hstamp).total_seconds()>360 or not mtf_stamp or (NOW-mtf_stamp).total_seconds()>360:
        raise RuntimeError('Stale central 4H/1D confirmation; refusing new virtual entries')
    if mtf.get('model_version') not in ('2.2.0-mtf-swing','2.4.0-mtf-swing','3.0.0-mtf-swing'):
        raise RuntimeError('4H/1D swing model not ready; legacy 15m-only paper trades disabled')
    log=read(ARCH,None)
    if log is None:
        log={'schema_version':2,'pilot_started_at':UTC,'pilot_started_ms':NOWMS,
             'starting_balance':100.,'model_version':MODEL,'orders':{},'journal':[]}
    started=log['pilot_started_ms']
    # First deployment after this change is the honest forward-only strategy
    # cutover. Continue to evaluate legacy positions, never reclassify them.
    if 'swing_cutover_ms' not in log:
        log['swing_cutover_ms']=NOWMS
        log['swing_cutover_at']=UTC
        append(log,{'id':'SWING_V2_CUTOVER'},'STRATEGY_CUTOVER',
               {'strategy':'4H+1D_GATE','legacy_orders_preserved':len(log.get('orders',{})),
                'new_entries_only_after':UTC})
    cutover_ms=log['swing_cutover_ms']
    swing_pool={x['symbol']:x for x in mtf.get('candidates',[])}

    latest={m['symbol']:m for m in market.get('rows',[])}
    records=history.get('events',[])
    chains=log.setdefault('chains',{})
    # Maintain immutable first observations and append-only stage transitions.
    # Every confirmed record links to a prior WATCH when it is the same
    # symbol+side within three hours; otherwise it starts a new chain.
    forward=sorted((e for e in records if int(e.get('at_ms',0))>started),key=lambda e:int(e['at_ms']))
    for e in forward:
        id=e.get('id')
        if not id or id in chains or e.get('stage') not in ('WATCH','CONFIRMED'):continue
        prior=[v for v in chains.values() if v['symbol']==e['symbol'] and v['side']==e['side'] and
               v['stage']=='WATCH' and 0<=int(e['at_ms'])-v['at_ms']<=3*3600000]
        parent=max(prior,key=lambda x:x['at_ms']) if prior and e['stage']=='CONFIRMED' else None
        chain_id=parent['chain_id'] if parent else id
        evidence={'id':id,'time':e.get('time'),'price':e.get('price'),'side':e.get('side'),
                  'stop':e.get('stop'),'targets':e.get('targets'),'stage':e.get('stage')}
        sha=hashlib.sha256(json.dumps(evidence,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        chains[id]={'signal_id':id,'chain_id':chain_id,'parent_signal_id':parent['signal_id'] if parent else None,
                    'symbol':e['symbol'],'side':e['side'],'stage':e['stage'],'at_ms':int(e['at_ms']),
                    'created_at':e['time'],'model_version':MODEL,'evidence_sha256':sha}
        append(log,{'id':id},'WATCH_CREATED' if e['stage']=='WATCH' else 'CONFIRMED',
               {'chain_id':chain_id,'parent_signal_id':parent['signal_id'] if parent else None,
                'original_time_immutable':e['time'],'evidence_sha256':sha},e['time'])
    # Only NEW primary CONFIRMED records after model cutover.
    for e in records:
        if not swing_eligible(e,swing_pool,max(started,cutover_ms)) or e.get('id') in log['orders']:
            continue
        price=float(e['price']);stop=float(e['stop'])
        if min(price,stop)<=0 or not e.get('targets'):continue
        id=e['id']
        quoted_spread=latest.get(e['symbol'],{}).get('spread_bps')
        o={'id':id,'chain_id':chains.get(id,{}).get('chain_id',id),'model_version':MODEL,'inst':e['symbol'][:-4]+'-USDT-SWAP',
           'symbol':e['symbol'],'side':e['side'],'source':'CENTRAL_FORWARD_4H_1D_SWING',
           'signal_at_ms':int(e['at_ms']),'signal_at':e['time'],'signal_price':price,'stop':stop,
           'tp1':float(e['targets'][0]),'tp2':float(e['targets'][1]),'tp3':float(e['targets'][2]),
           'status':'PENDING','last_eval_ms':int(e['at_ms']),'estimated_only':True,
           'spread_bps_initial':quoted_spread,
           'swing_model':'2.2.0-swing-4h-1d','swing_horizon':swing_pool[e['symbol']].get('expected_holding','1-7 gün'),
           'structure_risk_score_at_signal':swing_pool[e['symbol']].get('structure_risk_score')}
        log['orders'][id]=o
        if quoted_spread is not None and quoted_spread>35:
            o['status']='NO_FILL'
            append(log,o,'NO_FILL',{'reason':'SPREAD_TOO_WIDE','quoted_spread_bps':quoted_spread},e['time'])
    # On each runner invocation only active symbols get 5m candles; critical
    # 1m requests happen exclusively for ambiguous stop/TP ordering.
    groups={}
    for o in log['orders'].values():
        if o['status'] in ('PENDING','FILLED'):groups.setdefault(o['inst'],[]).append(o)
    for inst,orders in list(groups.items())[:12]:
        try:
            recent=bars(inst,'5m',100)
            for o in orders:update_order(log,o,recent)
        except Exception as exc:
            log.setdefault('errors',[]).append({'at':UTC,'inst':inst,'error':str(exc)[:80]})
    equity,dd=record_equity(log)
    orders=list(log['orders'].values())
    open_=[x for x in orders if x['status']=='FILLED']
    closed=[x for x in orders if x['status'] in ('TP1','STOP','TIME_EXIT')]
    result={'model_version':MODEL,'updated_at':UTC,'pilot_started_at':log['pilot_started_at'],
        'starting_usdt':100.,'estimated_equity_usdt':equity,'max_drawdown_pct_est':dd,
        'swing_cutover_at':log.get('swing_cutover_at'),'new_entry_rule':'4H+1D ALIGNED VERIFIED SWING_CANDIDATE ONLY',
        'legacy_micro_positions_preserved':sum(x.get('source')!='CENTRAL_FORWARD_4H_1D_SWING' for x in orders),
        'open_paper_positions':len(open_),'max_concurrent_positions':MAX_OPEN,
        'risk_per_trade_target_pct':1,'daily_risk_budget_pct':3,
        'closed_paper_orders':len(closed),'wins':sum(x['status']=='TP1' for x in closed),
        'losses':sum(x['status']=='STOP' for x in closed),'ambiguous':sum(x['status']=='AMBIGUOUS' for x in orders),
        'no_fill':sum(x['status']=='NO_FILL' for x in orders),'pending':sum(x['status']=='PENDING' for x in orders),
        'open_positions':[x for x in open_], 'recent_orders':sorted(orders,key=lambda x:x['signal_at_ms'],reverse=True)[:30],
        'chain_count':len(chains),'audit_journal_events':len(log['journal']),
        'leverage_comparison':{'10x':'Margin = position notional / 10; estimated PnL same if position notional same',
            '15x':'Margin = position notional / 15; liquidation proximity higher, not modeled'},
        'fee_slippage_assumption':'ESTIMATED total 0.15% of position notional; funding excluded',
        'notes':['Only central NEW confirmed events after pilot cutover','Orders inferred from closed 5m OHLC, not live fills',
                 'Same-bar unresolved stop and TP excluded from win rate','Liquidation, spread and funding are NOT verified']}
    write(ARCH,log)
    write(DATA/'paper.json',result)
    print(f'PAPER PILOT {UTC} pending={result["pending"]} open={len(open_)} closed={len(closed)} journal={len(log["journal"])}',flush=True)

if __name__=='__main__':main()
