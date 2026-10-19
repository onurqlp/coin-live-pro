#!/usr/bin/env python3
"""V4 isolated 10,000-USDT PAPER ONLY desk. No exchange trading endpoints.

Cash/equity/margin are separate; future closed 5m bars alone can demonstrate
hypothetical fills. This is NOT an executed account, no real position exists.
Funding and liquidation cannot be stated as exact without exchange-specific
historical schedules, maintenance margins, and mark data.
"""
import datetime as dt
import json
import math
import pathlib
import urllib.parse
import urllib.request
import mtf

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web'/'data'
ARCH=ROOT/'archive'/'v4-paper-ledger.json'
POLICY=ROOT/'config'/'v4-policy.json'
DAY=86400000
BAR=300000
VERSION='4.0.0-paper-a1'

def read(path,default):
    try:return json.loads(path.read_text(encoding='utf8'))
    except (OSError,ValueError):return default

def save(path,doc):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(json.dumps(doc,ensure_ascii=False,allow_nan=False,separators=(',',':')),encoding='utf8')
    tmp.replace(path)

def event(log,kind,key,ms,info):
    eid=f'{key}|{kind}|{ms}'
    if eid in log['_ids']:return
    log['_ids'].add(eid)
    log['events'].append({'event_id':eid,'type':kind,'order_id':key,
                          'time_utc':dt.datetime.fromtimestamp(ms/1000,dt.timezone.utc).isoformat(),
                          'details':info})

def new_account(now_ms,policy):
    return {'model_version':VERSION,'account_id':'COINLIVE-V4-PAPER-10K',
      'policy_version':policy['policy_version'],
      'pilot_started_at':dt.datetime.fromtimestamp(now_ms/1000,dt.timezone.utc).isoformat(),
      'pilot_started_ms':now_ms,'starting_balance_usdt':10000.,
      'cash_balance_usdt':10000.,'realized_pnl_usdt':0.,
      'fees_paid_usdt':0.,'funding_usdt':None,
      'funding_state':'UNKNOWN_NOT_MODELED',
      'orders':{},'events':[],'equity_curve':[],
      'high_watermark_usdt':10000.,'no_real_orders':True}

def spec_valid(spec,symbol):
    if not isinstance(spec,dict) or str(spec.get('ctType','')).lower()!='linear':return None
    try:
        cv=float(spec['ctVal']);lot=float(spec['lotSz'])
        if not all(math.isfinite(x) and x>0 for x in (cv,lot)):return None
        if spec.get('state')!='live':return None
        if str(spec.get('ctValCcy',''))!=symbol[:-4]:return None
        return cv,lot
    except (ValueError,TypeError,KeyError):return None

def quantity_for(notional,price,spec,symbol):
    from decimal import Decimal,ROUND_DOWN
    vals=spec_valid(spec,symbol)
    if not vals or notional<=0 or price<=0:return None
    val,lot=vals
    n=(Decimal(str(notional))/(Decimal(str(price))*Decimal(str(val)))/Decimal(str(lot)))
    contracts=n.to_integral_value(rounding=ROUND_DOWN)*Decimal(str(lot))
    if contracts<=0:return None
    return {'contracts':float(contracts),'base_qty':float(contracts*Decimal(str(val))),
            'ctVal':val,'lot_step':lot}

def equity(log):
    floating=sum(float(p.get('unrealized_pnl_usdt') or 0) for p in log['orders'].values()
                 if p['status']=='FILLED')
    return float(log['cash_balance_usdt'])+floating

def margin_used(log):
    return sum(p['remaining_qty']*p['fill_price']/p['leverage']
               for p in log['orders'].values() if p['status']=='FILLED')

def risk_open(log):
    return sum(p.get('initial_risk_usdt',0)*p.get('remaining_fraction',0)
               for p in log['orders'].values() if p['status']=='FILLED')

def initialize(log,now_ms,config):
    a=dict(log) if log and log.get('model_version')==VERSION else new_account(now_ms,config)
    a['_ids']={e['event_id'] for e in a.get('events',[])}
    if not any(e['type']=='PAPER_ACCOUNT_STARTED' for e in a.get('events',[])):
        event(a,'PAPER_ACCOUNT_STARTED','ACCOUNT',a['pilot_started_ms'],
              {'starting_usdt':10000.,'legacy_v3_copied':False})
    return a

def queue_intents(log,lifecycle,now_ms):
    started=log['pilot_started_ms']
    for e in lifecycle.get('events',[]):
        if e.get('type')!='ENTRY_ELIGIBLE' or not e.get('trade_intent_id'):continue
        try:when=int(dt.datetime.fromisoformat(e['event_time_utc']).timestamp()*1000)
        except (ValueError,TypeError,KeyError):continue
        if when<=started or when>now_ms:continue
        intent=e['trade_intent_id']
        if intent in log['orders']:continue
        price=e.get('price_at_transition');stop=e.get('stop');targets=e.get('targets') or []
        if (e.get('strategy_id')!='TREND_BREAKOUT' or
            e.get('data_quality')!='FRESH' or not isinstance(price,(int,float)) or
            not isinstance(stop,(int,float)) or len(targets)<3):
            continue
        side=e['side'];direction=1 if side=='LONG' else -1
        if (price<=0 or stop<=0 or not all(isinstance(z,(int,float)) and z>0 for z in targets)
            or direction*(price-stop)<=0 or
            any(direction*(v-price)<=0 for v in targets[:3])):
            continue
        order={'paper_order_id':intent,'setup_id':e['setup_id'],
               'signal_event_id':e['event_id'],'strategy_id':e['strategy_id'],
               'symbol':e['symbol'],'side':side,'status':'PENDING',
               'created_at_ms':when,'created_at':e['event_time_utc'],
               'signal_price':price,'stop':stop,'tp1':targets[0],
               'tp2':targets[1],'tp3':targets[2],
               'fill_price':None,'leverage':None,'fees_paid_usdt':0.,
               'remaining_fraction':0.,'remaining_qty':0.,
               'realized_pnl_usdt':0.,'unrealized_pnl_usdt':0.,
               'funding_state':'UNKNOWN_NOT_MODELED',
               'is_executed_trade':False}
        log['orders'][intent]=order
        event(log,'PAPER_ORDER_CREATED',intent,when,{'paper_market_only':True})

RISK_BLOCK_REASONS={
    'MAX_CONCURRENT_POSITIONS','SAME_SYMBOL_CONCENTRATION',
    'TOTAL_RISK_BUDGET','DAILY_NEW_RISK_BUDGET',
    'DAILY_REALIZED_LOSS_LIMIT','INSUFFICIENT_MARGIN',
    'LOT_ROUNDING_RISK_EXCEEDED','MIN_LOT_OR_MARGIN_BLOCKED'
}
def reject(log,o,why,ms):
    blocked=why in RISK_BLOCK_REASONS
    o['status']='RISK_BLOCKED' if blocked else 'NO_FILL'
    o['no_fill_reason']=why
    o['finished_at_ms']=ms
    event(log,'PAPER_RISK_BLOCKED' if blocked else 'PAPER_NO_FILL',
          o['paper_order_id'],ms,{'reason':why})

def maybe_fill(log,o,bars,spec,policy,now_ms,volume):
    if o['status']!='PENDING':return
    first_start=((o['created_at_ms']//BAR)+1)*BAR
    earliest=[b for b in bars if b['t']>=first_start and b['t']+BAR<=now_ms-1500]
    if not earliest:
        if now_ms-o['created_at_ms']>policy['max_entry_delay_minutes']*60000:
            reject(log,o,'FIRST_FUTURE_5M_CANDLE_MISSING',now_ms)
        return
    b=min(earliest,key=lambda z:z['t'])
    if b['t']!=first_start:
        reject(log,o,'FUTURE_BAR_DATA_GAP',now_ms);return
    if b['t']-o['created_at_ms']>policy['max_entry_delay_minutes']*60000:
        reject(log,o,'ENTRY_TOO_LATE',now_ms);return
    vals=spec_valid(spec,o['symbol'])
    if not vals:
        reject(log,o,'EXCHANGE_LOT_UNVERIFIED',now_ms);return
    eq=equity(log)
    active=[x for x in log['orders'].values() if x['status']=='FILLED']
    if len(active)>=policy['max_positions']:
        reject(log,o,'MAX_CONCURRENT_POSITIONS',now_ms);return
    if any(x['symbol']==o['symbol'] for x in active):
        reject(log,o,'SAME_SYMBOL_CONCENTRATION',now_ms);return
    budget=eq*policy['risk_per_trade_pct']/100
    if risk_open(log)+budget>eq*policy['max_open_risk_pct']/100:
        reject(log,o,'TOTAL_RISK_BUDGET',now_ms);return
    # Count all orders filled TODAY, including closed orders. Otherwise
    # an intraday close would silently restore an already spent risk budget.
    today=dt.datetime.fromtimestamp(now_ms/1000,dt.timezone.utc).date().isoformat()
    daily=sum(x.get('initial_risk_usdt',0) for x in log['orders'].values()
              if x.get('filled_day')==today)
    closed_today=sum(x.get('realized_pnl_usdt',0) for x in log['orders'].values()
                     if x.get('filled_day')==today and x.get('status')=='CLOSED')
    if closed_today<=-eq*policy['max_daily_new_risk_pct']/100:
        reject(log,o,'DAILY_REALIZED_LOSS_LIMIT',now_ms);return
    if daily+budget>eq*policy['max_daily_new_risk_pct']/100:
        reject(log,o,'DAILY_NEW_RISK_BUDGET',now_ms);return
    leverage=policy['leverage']
    sign=1 if o['side']=='LONG' else -1
    slip=policy['example_slippage_side_pct']/100
    fee=policy['example_fee_side_pct']/100
    raw=float(b['o'])
    if raw<=0 or not math.isfinite(raw) or abs(raw/o['signal_price']-1)>.025:
        reject(log,o,'PRICE_GAP_OR_INVALID',now_ms);return
    fill=raw*(1+sign*slip)
    if sign*(fill-o['stop'])<=0:
        reject(log,o,'STOP_ALREADY_BREACHED',now_ms);return
    stop_distance=abs(fill-o['stop'])/fill
    notional_risk=budget/max(stop_distance+2*(fee+slip),1e-8)
    max_margin_trade=eq*policy['max_margin_trade_pct']/100
    free=eq-margin_used(log)
    available=min(max(0,free),max_margin_trade,
                  max(0,eq*policy['max_margin_total_pct']/100-margin_used(log)))
    max_n=available*leverage
    if volume is None or volume<=0:
        reject(log,o,'MARKET_LIQUIDITY_UNKNOWN',now_ms);return
    max_n=min(max_n,float(volume)*.0005)
    sizing=quantity_for(min(notional_risk,max_n),fill,spec,o['symbol'])
    if not sizing:
        reject(log,o,'MIN_LOT_OR_MARGIN_BLOCKED',now_ms);return
    qty=sizing['base_qty'];notional=qty*fill
    # Minimum new paper entry: reject undersized lots instead of increasing risk or leverage.
    if notional<30.0-1e-9:
        reject(log,o,'BELOW_30_USDT_MIN_NOTIONAL',now_ms);return
    paid=notional*fee
    eq_after_fee=eq-paid
    if eq_after_fee-margin_used(log)-notional/leverage<0:
        reject(log,o,'INSUFFICIENT_MARGIN',now_ms);return
    risk=qty*abs(fill-o['stop'])+2*notional*(fee+slip)
    if risk>budget*1.001:
        reject(log,o,'LOT_ROUNDING_RISK_EXCEEDED',now_ms);return
    o.update(status='FILLED',filled_at_ms=b['t'],fill_price=fill,
             fill_reference_open=raw,leverage=leverage,
             contracts=sizing['contracts'],contract_value_base=sizing['ctVal'],
             remaining_qty=qty,original_qty=qty,remaining_fraction=1.,
             notional_usdt=notional,initial_margin_usdt=notional/leverage,
             initial_risk_usdt=risk,filled_day=dt.datetime.fromtimestamp(b['t']/1000,dt.timezone.utc).date().isoformat(),
             stop_initial=o['stop'],initial_R_price=abs(fill-o['stop']),
             # Entry occurs at hypothetical bar OPEN; the bar's later CLOSED
             # range must still be evaluated for an immediate stop or TP.
             last_processed_bar_ms=b['t']-BAR,mark_price=fill,
             partial_exits=[],unrealized_pnl_usdt=0.,fees_paid_usdt=paid,
             entry_fee_paid_usdt=paid,entry_fee_allocated_usdt=0.,
             funding_state='UNKNOWN_NOT_MODELED')
    log['cash_balance_usdt']-=paid
    log['fees_paid_usdt']+=paid
    event(log,'PAPER_FILLED',o['paper_order_id'],b['t']+BAR,
          {'estimated_only':True,'quantity_base':qty,'contracts':sizing['contracts'],
           'price':fill,'entry_fee':paid,'margin':notional/leverage,
           'slippage_assumption_pct':policy['example_slippage_side_pct']})

def exit_part(log,o,raw,share,kind,ms,policy):
    sign=1 if o['side']=='LONG' else -1
    slip=policy['example_slippage_side_pct']/100
    fee=policy['example_fee_side_pct']/100
    price=raw*(1-sign*slip)
    qty=min(o['remaining_qty'],o['original_qty']*share)
    if qty<=1e-12:return
    gross=sign*(price-o['fill_price'])*qty
    paid=qty*price*fee
    # Entry fee was deducted from cash when filled. Allocate its fair share
    # into realized NET PnL, but never debit cash a second time.
    fee_share=float(o.get('entry_fee_paid_usdt') or 0)*qty/o['original_qty']
    net=gross-paid-fee_share
    o['entry_fee_allocated_usdt']=float(o.get('entry_fee_allocated_usdt') or 0)+fee_share
    o['remaining_qty']=max(0,o['remaining_qty']-qty)
    o['remaining_fraction']=o['remaining_qty']/o['original_qty']
    o['realized_pnl_usdt']+=net
    o['fees_paid_usdt']+=paid
    log['cash_balance_usdt']+=gross-paid
    log['realized_pnl_usdt']+=net
    log['fees_paid_usdt']+=paid
    o['partial_exits'].append({'kind':kind,'at_ms':ms,'price':price,'qty':qty,
                                'net_including_entry_fee_share_usdt':net})
    event(log,kind,o['paper_order_id'],ms,{'exit_price':price,'qty':qty,'gross_pnl':gross,
              'exit_fee':paid,'entry_fee_allocated':fee_share,'net_pnl':net})
    if o['remaining_qty']<o['original_qty']*1e-7:
        o['remaining_qty']=0.;o['remaining_fraction']=0.
        o['status']='CLOSED';o['closed_at_ms']=ms
        event(log,'POSITION_CLOSED',o['paper_order_id'],ms,{'reason':kind})

def revalue_and_exit(log,o,bars,now_ms,policy):
    if o['status']!='FILLED':return
    bars=sorted([b for b in bars if int(b['t'])>o['last_processed_bar_ms']
                 and int(b['t'])+BAR<=now_ms-1500],key=lambda x:x['t'])
    sign=1 if o['side']=='LONG' else -1
    for b in bars:
        t=int(b['t']); expected=int(o['last_processed_bar_ms'])+BAR
        if t!=expected:
            o['valuation_status']='DATA_GAP';return
        if min(b['o'],b['h'],b['l'],b['c'])<=0 or b['l']>b['h']:
            o['valuation_status']='INVALID_CANDLE';return
        o['last_processed_bar_ms']=t;o['mark_price']=b['c']
        stop=o['stop']
        stop_hit=b['l']<=stop if sign>0 else b['h']>=stop
        levels=[o['tp1'],o['tp2'],o['tp3']]
        taken=len([e for e in o['partial_exits'] if e['kind'].startswith('PAPER_TP')])
        target=levels[taken] if taken<3 else None
        tp_hit=(b['h']>=target if sign>0 else b['l']<=target) if target else False
        if stop_hit:
            # STOP and TP in same 5m is conservatively stopped, not a win.
            adverse_open=b['o']<stop if sign>0 else b['o']>stop
            raw=b['o'] if adverse_open else stop
            label='AMBIGUOUS_CONSERVATIVE_STOP' if tp_hit else 'PAPER_STOP'
            exit_part(log,o,raw,o['remaining_fraction'],label,t+BAR,policy)
        elif tp_hit:
            splits=policy['take_profit_splits']
            exit_part(log,o,target,splits[taken],'PAPER_TP'+str(taken+1),t+BAR,policy)
            # One TP per candle only: prevent unsupported same-candle ordering.
        if o['status']=='CLOSED':break
        if t+BAR-o['created_at_ms']>7*DAY:
            exit_part(log,o,b['c'],o['remaining_fraction'],'PAPER_TIME_EXIT',t+BAR,policy)
            break
    if o['status']=='FILLED':
        latest=int(o.get('last_processed_bar_ms') or 0)
        if now_ms-latest>25*60000:
            o['valuation_status']='STALE'
        else:
            o['valuation_status']='CLOSED_5M_REFERENCE'
        o['unrealized_pnl_usdt']=sign*(o['mark_price']-o['fill_price'])*o['remaining_qty']
    else:o['unrealized_pnl_usdt']=0.

def advance(previous,lifecycle,market,now_ms,bars_by_symbol,specs,policy):
    log=initialize(previous,now_ms,policy)
    queue_intents(log,lifecycle,now_ms)
    market_by={x['symbol']:x for x in market.get('rows',[])}
    for order in sorted(log['orders'].values(),key=lambda x:x['created_at_ms']):
        candles=bars_by_symbol.get(order['symbol']) or []
        if order['status']=='PENDING':
            m=market_by.get(order['symbol'],{})
            maybe_fill(log,order,candles,specs.get(order['symbol']),policy['paper'],now_ms,m.get('volume'))
        if order['status']=='FILLED':
            revalue_and_exit(log,order,candles,now_ms,policy['paper'])
    total=equity(log)
    used=margin_used(log)
    log['high_watermark_usdt']=max(float(log.get('high_watermark_usdt',10000)),total)
    snap={'time_utc':dt.datetime.fromtimestamp(now_ms/1000,dt.timezone.utc).isoformat(),
          'equity_usdt':round(total,4),'cash_balance_usdt':round(log['cash_balance_usdt'],4),
          'used_margin_usdt':round(used,4)}
    if not log['equity_curve'] or log['equity_curve'][-1]['time_utc']!=snap['time_utc']:
        log['equity_curve'].append(snap)
    log['equity_curve']=log['equity_curve'][-2500:]
    log.pop('_ids',None)
    open_pos=[x for x in log['orders'].values() if x['status']=='FILLED']
    public={'model_version':VERSION,'account_id':log['account_id'],
      'policy_version':policy['policy_version'],'updated_at':snap['time_utc'],
      'pilot_started_at':log['pilot_started_at'],'starting_balance_usdt':10000.,
      'equity_usdt':round(total,4),'cash_balance_usdt':round(log['cash_balance_usdt'],4),
      'available_margin_usdt':round(total-used,4),'used_margin_usdt':round(used,4),
      'realized_pnl_usdt':round(log['realized_pnl_usdt'],4),
      'unrealized_pnl_usdt':round(total-log['cash_balance_usdt'],4),
      'fees_paid_usdt':round(log['fees_paid_usdt'],4),
      'funding_state':log['funding_state'],'funding_usdt':None,
      'max_drawdown_pct':round(100*(1-total/log['high_watermark_usdt']),4),
      'open_positions':open_pos,'recent_orders':list(log['orders'].values())[-100:],
      'recent_events':log['events'][-100:],'equity_curve':log['equity_curve'][-300:],
      'no_real_orders':True,'paper_market_only':True,'liquidation_model':'UNVERIFIED',
      'legacy_v3_balance_included':False,
      'note':'Virtual fills use NEXT closed 5m candle open, conservative stops. Funding unknown; PnL excludes funding and precise liquidation costs.'}
    return log,public

def fetch_instrument(symbol):
    inst=symbol[:-4]+'-USDT-SWAP'
    url='https://www.okx.com/api/v5/public/instruments?'+urllib.parse.urlencode({'instType':'SWAP','instId':inst})
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'CoinLive-V4-Paper-Research','Accept':'application/json'})
        with urllib.request.urlopen(req,timeout=5) as response:
            obj=json.load(response)
        if obj.get('code')!='0':return None
        return next((x for x in obj.get('data',[]) if x.get('instId')==inst),None)
    except (OSError,ValueError,TypeError,KeyError):return None

def main():
    now_ms=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    policy=read(POLICY,{})
    life=read(ROOT/'archive'/'v4-lifecycle-ledger.json',{})
    market=read(DATA/'market.json',{})
    if life.get('policy_version')!=policy.get('policy_version'):
        raise RuntimeError('V4 paper/lifecycle policy mismatch')
    previous=read(ARCH,{})
    # Immutable one-time V3 legacy snapshot: V4 never recalculates or merges it.
    legacy=ROOT/'archive'/'v3-paper-legacy-snapshot.json'
    if not previous and not legacy.exists():
        original=ROOT/'archive'/'pilot-ledger.json'
        if original.exists():save(legacy,read(original,{}))
    started=previous.get('pilot_started_ms',now_ms)
    if abs(now_ms-int(started))>365*DAY:raise RuntimeError('Invalid V4 pilot timestamp')
    # Read-only source, don't backfill any V3 signal into this brand-new desk.
    symbols={x['symbol'] for x in previous.get('orders',{}).values()
             if x.get('status') in ('PENDING','FILLED')}
    for x in life.get('events',[]):
        if x.get('type')=='ENTRY_ELIGIBLE' and x.get('strategy_id')=='TREND_BREAKOUT':
            symbols.add(x['symbol'])
    bars={};specs={}
    for symbol in sorted(symbols):
        if not symbol.endswith('USDT'):continue
        inst=symbol[:-4]+'-USDT-SWAP'
        try:bars[symbol]=mtf.request(inst,'5m')
        except Exception:bars[symbol]=[]
        specs[symbol]=fetch_instrument(symbol)
    ledger,doc=advance(previous,life,market,now_ms,bars,specs,policy)
    radar=read(DATA/'v4-radar.json',{})
    if radar.get('policy_version')!=policy.get('policy_version'):
        raise RuntimeError('V4 lifecycle to paper scan mismatch')
    doc['scan_id']=radar.get('scan_id')
    save(ARCH,ledger);save(DATA/'v4-paper.json',doc)
    print('V4 PAPER equity',doc['equity_usdt'],'filled',len(doc['open_positions']),
          'orders',len(ledger['orders']),flush=True)

if __name__=='__main__':main()
