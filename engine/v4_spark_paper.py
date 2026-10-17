#!/usr/bin/env python3
"""Every NEW early spark gets an auditable virtual ticket, never a real order.

No historical backfills. Fills are inferred ONLY from a *later fully closed*
OKX 5-minute candle's open (estimated; never an exchange execution).
Each event is kept permanently. Costs and slippage are explicit assumptions.
The strict 10k V4 account remains independent and unmodified.
"""
import datetime as dt
import math
import pathlib
import mtf
import v4_paper
import v4_early

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web'/'data'
ARCH=ROOT/'archive'/'v4-spark-paper-ledger.json'
VERSION='4.0.2-spark-paper-a1'
BAR=300000
DAY=86400000
NOTIONAL=10.0
START_CASH=10000.0
FEE=0.0006
SLIPPAGE=0.0003
MAX_HOLD=24*3600000
TIER_STAGE={'KIVILCIM':1,'ERKEN_SINYAL':2,'ISIK_GUCLENIYOR':3}
def stamp(ms):return dt.datetime.fromtimestamp(ms/1000,dt.timezone.utc).isoformat()
def valid(x):return isinstance(x,(float,int)) and not isinstance(x,bool) and math.isfinite(x) and x>0
def feature_snap(c):
    f=c.get('frames',{})
    features={}
    for tf in ('1H','4H','1D'):
        x=f.get(tf) or {}
        macd=x.get('macd_12_26_9') or {}
        features[tf]={'rsi':x.get('rsi_14'),'macd_hist_pct':macd.get('hist_pct'),
            'bb_width_pct':x.get('bb_width_pct'),'bb_compression_percentile':x.get('bb_compression_percentile_30'),
            'adx':x.get('adx_14'),'relative_volume':x.get('volume_ratio_20'),
            'atr_pct':x.get('atr_pct'),'trend':x.get('trend'),
            'source_closed_at_utc':x.get('last_candle_utc')}
    return features
def initial(now_ms):
    return {'model_version':VERSION,'started_at':stamp(now_ms),'started_ms':now_ms,
      'last_scan_id':None,'last_run_ms':now_ms,'tickets':[],
      'starting_balance_usdt':START_CASH,'ticket_notional_usdt':NOTIONAL,
      'no_real_orders':True,'no_historical_backfill':True}
def symbol_bars(t,bars):
    items=bars.get(t['symbol']) or []
    return sorted([x for x in items if isinstance(x,dict) and
      all(valid(x.get(k)) for k in ('o','h','l','c')) and
      isinstance(x.get('t'),int) and x['l']<=x['h'] and
      x['t']+BAR<=t],key=lambda x:x['t'])
def ledger_stats(tickets):
    totals={'WAITING_FUTURE_BAR':0,'OPEN':0,'CLOSED':0,
            'DATA_GAP':0,'INVALID_LEVEL':0,'CAPACITY_BLOCKED':0}
    realized=0.0;floating=0.0;exposure=0.0;fees=0.0
    for t in tickets:
        state=t['status']
        totals[state]=totals.get(state,0)+1
        realized+=float(t.get('realized_net_usdt') or 0)
        floating+=float(t.get('unrealized_net_usdt') or 0)
        fees+=float(t.get('fees_estimated_usdt') or 0)
        if state=='OPEN':exposure+=float(t.get('remaining_notional_usdt') or 0)
    return {'counts':totals,'virtual_equity_usdt':round(START_CASH+realized+floating,5),
            'realized_net_usdt':round(realized,5),'unrealized_net_usdt':round(floating,5),
            'open_reference_exposure_usdt':round(exposure,4),
            'estimated_fees_usdt':round(fees,5)}
def settle(t,raw,share,label,ts):
    side=1 if t['side']=='LONG' else -1
    qty=min(t['remaining_qty'],t['total_qty']*share)
    if qty<=0:return
    exit_price=raw*(1-side*SLIPPAGE)
    fee=qty*exit_price*FEE
    entry_share=t['entry_fee_usdt']*qty/t['total_qty']
    net=side*(exit_price-t['fill_price'])*qty-fee-entry_share
    t['remaining_qty']=max(0,t['remaining_qty']-qty)
    t['realized_net_usdt']=round(t['realized_net_usdt']+net,9)
    t['fees_estimated_usdt']=round(t['fees_estimated_usdt']+fee,9)
    t.setdefault('exits',[]).append({'kind':label,'closed_at_utc':stamp(ts),
        'price':exit_price,'qty':qty,'net_usdt':round(net,8)})
    t['remaining_notional_usdt']=t['remaining_qty']*t['fill_price']
    if t['remaining_qty']<=t['total_qty']*1e-8:
        t['remaining_qty']=0.0;t['remaining_notional_usdt']=0.0
        t['status']='CLOSED';t['closed_at_utc']=stamp(ts)
        t['outcome']=label
def mark(t,close):
    sign=1 if t['side']=='LONG' else -1
    t['mark_price']=close
    remaining_entry_fee=t['entry_fee_usdt']*t['remaining_qty']/t['total_qty']
    t['unrealized_net_usdt']=round(sign*(close-t['fill_price'])*t['remaining_qty']-
       remaining_entry_fee-t['remaining_qty']*close*FEE,9)
def advance(prior,early,mtf_doc,now_ms,candles):
    if early.get('source_mtf_at')!=mtf_doc.get('fetched_at'):
        raise RuntimeError('spark-mixed-mtf')
    if early.get('research_only') is not True or early.get('no_paper_entries') is not True:
        raise RuntimeError('early-research-policy-corruption')
    old=prior if prior.get('model_version')==VERSION else initial(now_ms)
    if old['last_scan_id']==early.get('scan_id'):
        # Idempotent replay; no second fill, fee, or duplicate event.
        pass
    index={x['event_id']:x for x in old.get('tickets',[])}
    frames={(x.get('symbol'),x.get('side')):x for x in mtf_doc.get('candidates',[])}
    # This engine observes only *new* discoveries after its initial deployment,
    # not earlier research events retroactively reclassified as paper fills.
    since=int(old.get('last_run_ms',now_ms))-90000
    for x in early.get('candidates',[]):
        k=x.get('event_id');first=v4_early.epoch(x.get('first_seen_at_utc'))
        if (not k or k in index or x.get('paper_eligible') is not False or
            x.get('real_order_eligible') is not False or
            not first or first<since or first>now_ms or
            x.get('side') not in ('LONG','SHORT') or not valid(x.get('first_seen_price'))):
            continue
        src=frames.get((x['symbol'],x['side'])) or {}
        h=(src.get('frames') or {}).get('1H') or {}
        atr=h.get('atr_pct')
        sign=1 if x['side']=='LONG' else -1
        price=x['first_seen_price']
        gap=price*atr/100 if valid(atr) and atr<35 else None
        ok=bool(gap and gap<price)
        ticket={'event_id':k,'symbol':x['symbol'],'side':x['side'],
           'signal_at_utc':x['first_seen_at_utc'],'signal_price':price,
           'stage_at_birth':x['research_tier'],'stage':TIER_STAGE.get(x['research_tier'],1),
           'rank_at_birth':x['research_rank'],'source_1h_candle':x.get('source_closed_1h_at_utc'),
           'features_at_birth':feature_snap(src),'reasons_at_birth':x.get('reasons',[]),
           'hourly_threshold':x.get('hourly_level'),
           'status':'WAITING_FUTURE_BAR' if ok else 'INVALID_LEVEL',
           'stop':price-sign*gap if ok else None,
           'tp1':price+sign*gap if ok else None,
           'tp2':price+sign*2*gap if ok else None,
           'tp3':price+sign*3*gap if ok else None,
           'atr_pct_used':atr if ok else None,
           'reference_notional_usdt':NOTIONAL,
           'entry_at_ms':now_ms,'price_source':'FUTURE_CLOSED_5M_OPEN_ESTIMATED',
           'fill_price':None,'total_qty':0.0,'remaining_qty':0.0,
           'realized_net_usdt':0.0,'unrealized_net_usdt':0.0,
           'fees_estimated_usdt':0.0,'funding':'UNMODELED',
           'is_real_trade':False,'estimated_only':True,'exits':[],
           'last_processed_ms':None,'valuation_status':'WAITING',
           'no_backfilled_fill':True}
        index[k]=ticket
    # All orders are independent *tickets* in one cost-accounted virtual study.
    # A hard funding cap prevents silently creating executable-looking exposure.
    for t in sorted(index.values(),key=lambda v:(v['entry_at_ms'],v['event_id'])):
        if t['status'] not in ('OPEN','WAITING_FUTURE_BAR'):continue
        bars=symbol_bars(now_ms,candles)
        rows=sorted([x for x in (candles.get(t['symbol']) or []) if
          isinstance(x,dict) and isinstance(x.get('t'),int) and
          x['t']+BAR<=now_ms-1500],key=lambda x:x['t'])
        if t['status']=='WAITING_FUTURE_BAR':
            start=((t['entry_at_ms']//BAR)+1)*BAR
            nextbar=next((b for b in rows if b['t']>=start),None)
            if nextbar is None:
                if now_ms-t['entry_at_ms']>20*60000:
                    t['status']='DATA_GAP';t['valuation_status']='NO_FUTURE_ENTRY_CANDLE'
                continue
            if nextbar['t']!=start or not all(valid(nextbar.get(z)) for z in ('o','h','l','c')):
                t['status']='DATA_GAP';t['valuation_status']='FIRST_5M_MISSING_OR_INVALID';continue
            if abs(nextbar['o']/t['signal_price']-1)>.04:
                t['status']='DATA_GAP';t['valuation_status']='FILL_PRICE_GAP_TOO_LARGE';continue
            exposure=sum(v.get('remaining_notional_usdt',0) for v in index.values() if v['status']=='OPEN')
            if exposure+NOTIONAL>START_CASH:
                t['status']='CAPACITY_BLOCKED';t['valuation_status']='VIRTUAL_CAPITAL_FULL';continue
            sign=1 if t['side']=='LONG' else -1
            filled=nextbar['o']*(1+sign*SLIPPAGE)
            if sign*(filled-t['stop'])<=0:
                t['status']='INVALID_LEVEL';t['valuation_status']='STOP_BEFORE_ESTIMATED_FILL';continue
            qty=NOTIONAL/filled
            t.update(status='OPEN',fill_price=filled,filled_at_utc=stamp(start+BAR),
                fill_at_ms=start,entry_open_reference=nextbar['o'],
                total_qty=qty,remaining_qty=qty,remaining_notional_usdt=NOTIONAL,
                entry_fee_usdt=NOTIONAL*FEE,fees_estimated_usdt=NOTIONAL*FEE,
                last_processed_ms=start-BAR,valuation_status='VERIFIED_FUTURE_5M',
                mark_price=filled)
        if t['status']!='OPEN':continue
        after=[b for b in rows if b['t']>t['last_processed_ms']]
        for bar in after:
            expected=t['last_processed_ms']+BAR
            if bar['t']!=expected or not all(valid(bar.get(k)) for k in ('o','h','l','c')):
                t['status']='DATA_GAP';t['valuation_status']='NON_CONTIGUOUS_FUTURE_5M';break
            t['last_processed_ms']=bar['t']
            sign=1 if t['side']=='LONG' else -1
            t['max_favorable_pct']=max(t.get('max_favorable_pct',0),
                sign*((bar['h'] if sign>0 else bar['l'])/t['fill_price']-1)*100)
            t['max_adverse_pct']=min(t.get('max_adverse_pct',0),
                sign*((bar['l'] if sign>0 else bar['h'])/t['fill_price']-1)*100)
            stop=(bar['l']<=t['stop'] if sign>0 else bar['h']>=t['stop'])
            n=sum(e['kind'].startswith('TP') for e in t['exits'])
            level=[t['tp1'],t['tp2'],t['tp3']][min(n,2)]
            hit=(bar['h']>=level if sign>0 else bar['l']<=level)
            timestamp=bar['t']+BAR
            if stop:
                raw=(min(bar['o'],t['stop']) if sign>0 else max(bar['o'],t['stop']))
                settle(t,raw,t['remaining_qty']/t['total_qty'],
                    'STOP_AMBIGUOUS_SAME_5M' if hit else 'STOP',timestamp)
            elif hit:
                # Never infer multiple sequential intrabar TPs from one candle.
                share=[.5,.3,.2][min(n,2)]
                settle(t,level,share,'TP'+str(n+1),timestamp)
            if t['status']=='OPEN' and timestamp-t['entry_at_ms']>=MAX_HOLD:
                settle(t,bar['c'],t['remaining_qty']/t['total_qty'],'TIME_EXIT_24H',timestamp)
            if t['status']=='CLOSED':
                t['unrealized_net_usdt']=0.0;t['valuation_status']='SETTLED';break
            mark(t,bar['c'])
        if t['status']=='OPEN' and now_ms-t['last_processed_ms']>30*60000:
            t['valuation_status']='STALE_MARK_NO_BACKFILL'
    tickets=sorted(index.values(),key=lambda x:(x['entry_at_ms'],x['event_id']),reverse=True)
    doc={**old,'tickets':tickets,'last_scan_id':early['scan_id'],
        'last_run_ms':now_ms,'updated_at':stamp(now_ms)}
    stats=ledger_stats(tickets)
    published={'model_version':VERSION,'scan_id':early['scan_id'],'updated_at':stamp(now_ms),
        'source_mtf_at':mtf_doc['fetched_at'],'started_at':doc['started_at'],
        'summary':stats,'recent_tickets':tickets[:220],
        'all_events_count':len(tickets),'archive_is_persistent':True,
        'no_real_orders':True,'combined_with_strict_paper_cash':False,
        'starting_balance_usdt':START_CASH,'reference_ticket_notional_usdt':NOTIONAL,
        'virtual_account_is_estimated':True,'no_backfilled_outcomes':True,
        'fee_per_side_assumption':FEE,'slippage_per_side_assumption':SLIPPAGE,
        'max_hold_hours':24,
        'disclaimer':'Separate experimental cash-capped virtual tickets. Future closed 5m OHLC only; no real order, guarantee, or self-training. Funding/mark-to-market gap unknown.'}
    return doc,published
def main():
    now=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    early=v4_paper.read(DATA/'v4-early.json',{})
    mtf_doc=v4_paper.read(DATA/'mtf.json',{})
    prior=v4_paper.read(ARCH,{})
    pending=[t['symbol'] for t in prior.get('tickets',[]) if t['status'] in ('OPEN','WAITING_FUTURE_BAR')]
    fresh=[t['symbol'] for t in early.get('candidates',[]) if
        (v4_early.epoch(t.get('first_seen_at_utc')) or 0)>=now-90000]
    symbols=sorted(set(pending+fresh))
    candles={}
    for symbol in symbols:
        try:
            candles[symbol]=mtf.request(symbol[:-4]+'-USDT-SWAP','5m')
        except Exception:
            candles[symbol]=[]
    doc,public=advance(prior,early,mtf_doc,now,candles)
    v4_paper.save(ARCH,doc)
    v4_paper.save(DATA/'v4-spark-paper.json',public)
    print('SPARK PAPER',len(doc['tickets']),public['summary']['counts'],
          'scan',public['scan_id'],flush=True)
if __name__=='__main__':main()
