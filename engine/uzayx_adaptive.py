#!/usr/bin/env python3
"""Versioned, purged analogue research; immutable prospective forecasts.

No account mutation, automatic leverage increase or calibrated probability.
Archive transfer describes estimated paper outcomes, including modeled fees and
slippage but excluding unknown funding/liquidation. NO_TRADE is a real benchmark.
"""
import copy
import datetime as dt
import hashlib
import json
import math
import pathlib
import statistics as stats
from collections import Counter, defaultdict

from v4_early import epoch
from v4_spark_paper import stamp
import v4_paper

ROOT=pathlib.Path(__file__).resolve().parents[1]
H=3600000
VERSION='uzayx.adaptive.v1'
CONFIG={'neighbors':40,'minimum_neighbors':12,'embargo_hours':1,
        'extra_roundtrip_cost_pct':.1,'minimum_days':7,'minimum_selected':30,
        'minimum_market_hours':12,'shrinkage_zero_observations':8,
        'leave_target_coin_out':True,'half_life_days':7}
POLICIES=('ANALOG_POSITIVE','TREND_VOLUME','COMPRESSED_MOMENTUM')


def digest(x):return hashlib.sha256(json.dumps(x,sort_keys=True,allow_nan=False,separators=(',',':')).encode()).hexdigest()
def num(x):return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)


def context(t):
    decision=epoch(t.get('decision_at_utc')) or t.get('entry_at_ms')
    if not num(decision) or t.get('side') not in ('LONG','SHORT'):return None
    sign=1 if t['side']=='LONG' else -1
    vector=[];feats=t.get('features_at_birth') or {}
    for tf,step in [('1H',H),('4H',4*H),('1D',24*H)]:
        f=feats.get(tf) or {};source=epoch(f.get('source_closed_at_utc'))
        if source is None or source+step>decision:return None
        if any(not num(f.get(k)) for k in ('rsi','macd_hist_pct','adx','bb_compression_percentile','relative_volume','atr_pct')):return None
        if f['atr_pct']<=0 or f['relative_volume']<0 or not 0<=f['rsi']<=100:return None
        if f.get('trend') not in ('UP','DOWN','SIDEWAYS'):return None
        vector += [sign*(f['rsi']-50)/50,
                   max(-2,min(2,sign*f['macd_hist_pct']/f['atr_pct'])),
                   min(2,max(0,f['adx']/50)),f['bb_compression_percentile']/100,
                   min(2,math.log1p(f['relative_volume'])/math.log(3)),
                   sign*{'UP':1,'DOWN':-1,'SIDEWAYS':0}[f['trend']]]
    stage=t.get('stage_at_birth_number',1)
    if not num(stage):return None
    vector += [min(2,math.log1p(feats['1H']['atr_pct'])/math.log(11)),stage/3,
               int(t.get('entry_class')=='GELDI')]
    return {'vector':vector,'symbol':t.get('symbol'),'side':t['side'],'decision_ms':int(decision),
            'features':copy.deepcopy(feats),'policy':t.get('risk_policy_version') or 'LEGACY_UNKNOWN'}


def label(t,cutoff):
    end=epoch(t.get('closed_at_utc'));start=t.get('fill_at_ms')
    net=t.get('realized_net_usdt');notional=t.get('reference_notional_usdt')
    if (t.get('status')!='CLOSED' or not num(end) or end>cutoff or not num(start) or end<start
        or not num(net) or not num(notional) or notional<=0 or t.get('valuation_status')!='SETTLED'
        or t.get('is_real_trade') is not False or t.get('no_backfilled_fill') is not True):return None
    return net/notional*100


def samples(books,cutoff):
    audit=Counter();pool=[];keys=set()
    for i,book in enumerate(books):
        namespace=book.get('epoch_id') or book.get('started_at') or str(i)
        for t in book.get('tickets',[]):
            key=str(namespace)+':'+str(t.get('event_id'))
            if key in keys:raise ValueError('DUPLICATE_TRAINING_ID')
            keys.add(key);at=epoch(t.get('decision_at_utc')) or t.get('entry_at_ms')
            if not num(at) or at>cutoff:continue
            pool.append((int(at),key,t))
    blocked={};rows=[]
    for at,key,t in sorted(pool,key=lambda x:(x[0],x[1])):
        sym=t.get('symbol');audit['raw_intentions']+=1
        if at<blocked.get(sym,0):audit['overlapping_intentions']+=1;continue
        end=epoch(t.get('closed_at_utc'))
        # Select the first intention including unfinished/invalid episodes.
        # Never replace an unfinished episode with a later fast winner.
        blocked[sym]=max(at+H,(end if end and end<=cutoff else at+24*H)+H)
        c=context(t);y=label(t,cutoff)
        if c is None or y is None or t.get('stage_definition') not in (
            'CLOSED_1H_BREAKOUT_REQUIRED','VERSIONED_STRATEGY_TRIGGER_AND_COST_REGIME_GATE'):
            audit['unavailable_or_invalid']+=1;continue
        rows.append({**c,'key':key,'event_id':t['event_id'],'strategy_id':t.get('strategy_id'),'closed_ms':end,'return_pct':y})
    audit['independent_coin_episodes']=len(rows)
    audit['market_hours']=len({r['decision_ms']//H for r in rows})
    for k in ('overlapping_intentions','unavailable_or_invalid'):audit.setdefault(k,0)
    return rows,dict(audit)


def predict(rows,target,at):
    none={'expected_paper_return_pct':None,'stressed_lower_heuristic_pct':None,
          'neighbor_count':0,'neighbor_symbols':[],'win_probability':None,
          'state':'INSUFFICIENT_COMPARABLE_EPISODES'}
    if target is None:return none
    pool=[]
    for r in rows:
        if r['closed_ms']>=at-H or r['symbol']==target['symbol'] or r['side']!=target['side']:continue
        distance=sum((a-b)**2 for a,b in zip(r['vector'],target['vector']))/len(target['vector'])
        if distance>.5:continue
        pool.append((distance,r['key'],r))
    near=sorted(pool,key=lambda x:(x[0],x[1]))[:CONFIG['neighbors']]
    symbols=sorted({r['symbol'] for _,_,r in near})
    hours=len({r['decision_ms']//H for _,_,r in near})
    if len(near)<12 or len(symbols)<4 or hours<6:return none
    weights=[2**(-(at-r['closed_ms'])/(7*24*H))/(.15+d) for d,_,r in near]
    ys=[r['return_pct'] for _,_,r in near];total=sum(weights)
    mean=sum(w*y for w,y in zip(weights,ys))/total
    mean*=len(near)/(len(near)+CONFIG['shrinkage_zero_observations'])
    variance=sum(w*(y-mean)**2 for w,y in zip(weights,ys))/total
    effective=min(total**2/sum(w*w for w in weights),hours)
    lower=mean-2*math.sqrt(variance/max(1,effective))-CONFIG['extra_roundtrip_cost_pct']
    return {'expected_paper_return_pct':round(mean,6),'stressed_lower_heuristic_pct':round(lower,6),
            'neighbor_count':len(near),'neighbor_symbols':symbols,'neighbor_market_hours':hours,
            'neighbor_policy_counts':dict(Counter(r['policy'] for _,_,r in near)),
            'neighbor_outcome_range_pct':[round(min(ys),6),round(max(ys),6)],
            'win_probability':None,'state':'DISCOVERY_ESTIMATE',
            'uncertainty_is_heuristic_not_calibrated':True}


def take(policy,c,pred):
    f=c['features'];target='UP' if c['side']=='LONG' else 'DOWN';sign=1 if c['side']=='LONG' else -1
    if policy=='ANALOG_POSITIVE':return (pred.get('stressed_lower_heuristic_pct') or 0)>0
    aligned=all(f[tf]['trend']==target for tf in ('1D','4H','1H'))
    if policy=='TREND_VOLUME':return aligned and f['4H']['relative_volume']>=.8 and f['4H']['adx']>=22
    if policy=='COMPRESSED_MOMENTUM':return aligned and f['4H']['bb_compression_percentile']<=30 and sign*f['1H']['macd_hist_pct']>0
    return False


def metrics(records):
    if not records:return {'opportunities':0,'selected':0,'folds':3,'mean_stressed_per_opportunity_pct':None,'stressed_lower_hour_heuristic_pct':None}
    selected=[r for r in records if r['taken']];hours=defaultdict(list)
    for r in records:hours[r['decision_ms']//H].append(r['return_pct']-.1 if r['taken'] else 0.)
    means=[stats.mean(v) for v in hours.values()]
    mean=stats.mean(means);err=2*stats.stdev(means)/math.sqrt(len(means)) if len(means)>1 else math.inf
    return {'opportunities':len(records),'selected':len(selected),'folds':3,
            'selected_by_fold':[sum(r['taken'] and r['fold']==i for r in records) for i in range(3)],
            'market_hours':len(hours),'selected_market_hours':len({r['decision_ms']//H for r in selected}),
            'mean_stressed_per_opportunity_pct':round(stats.mean([r['return_pct']-.1 if r['taken'] else 0 for r in records]),6),
            'mean_selected_paper_return_pct':round(stats.mean(r['return_pct'] for r in selected),6) if selected else None,
            'mean_hour_stressed_pct':round(mean,6),
            'stressed_lower_hour_heuristic_pct':round(mean-err,6) if math.isfinite(err) else None,
            'not_a_portfolio_return':True}


def validate(rows,now):
    times=sorted({r['decision_ms']//H*H for r in rows});results={p:[] for p in POLICIES};baseline=[]
    val_times=times[max(1,int(len(times)*.4)):]
    for fold in range(3):
        hours=val_times[len(val_times)*fold//3:len(val_times)*(fold+1)//3]
        if not hours:continue
        start=min(hours);train=[r for r in rows if r['closed_ms']<start-H];allowed=set(hours)
        for r in rows:
            if r['decision_ms']//H*H not in allowed:continue
            pred=predict(train,r,start)
            baseline.append(r['return_pct'])
            for p in POLICIES:results[p].append({'taken':take(p,r,pred),'return_pct':r['return_pct'],'decision_ms':r['decision_ms'],'fold':fold})
    blocks=[];span=(max(times)-min(times))/H/24 if times else 0
    if span<7:blocks.append('LESS_THAN_SEVEN_DAYS')
    measured={p:metrics(r) for p,r in results.items()};qualified=[]
    base=stats.mean(baseline) if baseline else None
    for p,m in measured.items():
        lower=m.get('stressed_lower_hour_heuristic_pct')
        m['qualified_for_shadow']=bool(not blocks and m['selected']>=30 and m.get('selected_market_hours',0)>=12
            and min(m.get('selected_by_fold',[0]))>=5 and lower is not None and lower>0
            and base is not None and m['mean_stressed_per_opportunity_pct']>max(0,base))
        if m['qualified_for_shadow']:qualified.append(p)
    return {'type':'THREE_CHRONOLOGICAL_FROZEN_FOLDS_WITH_LABEL_EMBARGO','span_days':round(span,3),
            'blocks':blocks,'policies':measured,'baseline_all_mean_paper_return_pct':base,
            'no_trade_return_pct':0,'shadow_champion':max(qualified,key=lambda p:measured[p]['mean_hour_stressed_pct']) if qualified else None,
            'original_cash_auto_adaptation':False,'uncertainty_is_heuristic':True}


def run(prior,books,scan,now):
    if prior and prior.get('model_version')!=VERSION:raise ValueError('UNKNOWN_LEARNING_ARCHIVE')
    current=books[0]
    if current.get('last_scan_id')!=scan:raise ValueError('LEARNING_SCAN_MISMATCH')
    rows,audit=samples(books,now-H)
    if prior.get('last_scan_id')==scan:return copy.deepcopy(prior),public(prior,audit,scan,now)
    ledger=copy.deepcopy(prior) if prior else {'model_version':VERSION,'started_at':stamp(now),'models':{},'forecasts':[]}
    model_id=digest({'version':VERSION,'config':CONFIG,'samples':[{k:r[k] for k in ('key','strategy_id','decision_ms','closed_ms','return_pct','vector','policy')} for r in rows]})
    if model_id not in ledger['models']:
        ledger['models'][model_id]={'trained_at_utc':stamp(now),'config':CONFIG,'sample_keys':[r['key'] for r in rows],
            'latest_label_at_utc':stamp(max(r['closed_ms'] for r in rows)) if rows else None,
            'validation':validate(rows,now),'audit':audit}
    model=ledger['models'][model_id];epoch_id=current.get('epoch_id') or 'current'
    known={str(epoch_id)+':'+t['event_id']:t for t in current['tickets']}
    seen={f['key'] for f in ledger['forecasts']}
    for f in ledger['forecasts']:
        if f.get('outcome') is not None:continue
        t=known.get(f['key'])
        if not t:continue
        y=label(t,now)
        if y is not None:
            f['outcome']={'settled_at_utc':stamp(now),'trade_closed_at_utc':t['closed_at_utc'],
                'baseline_return_pct':y,'selected_stressed_return_pct':y-.1 if f['take_in_shadow'] else 0.,
                'realized_trade_pnl_usdt':t['realized_net_usdt'],'is_estimated_paper':True}
        elif t['status'] not in ('OPEN','WAITING_FUTURE_BAR'):
            f['outcome']={'state':'UNAVAILABLE_NO_VALID_CLOSED_LABEL','settled_at_utc':stamp(now)}
    for key,t in known.items():
        if key in seen or t['status']!='WAITING_FUTURE_BAR' or t.get('fill_price') is not None:continue
        c=context(t)
        if c is None or not 0<=now-c['decision_ms']<=180000:continue
        if (c['decision_ms']//300000+1)*300000<=now:continue
        pred=predict(rows,c,now);champ=model['validation']['shadow_champion']
        ledger['forecasts'].append({'key':key,'event_id':t['event_id'],'strategy_id':t.get('strategy_id'),
            'predicted_at_utc':stamp(now),'model_id':model_id,'input_hash':digest(c),
            'prediction':pred,'shadow_policy':champ,'take_in_shadow':take(champ,c,pred) if champ else False,
            'outcome':None,'no_backfilled_prediction':True})
    ledger.update(last_scan_id=scan,updated_at=stamp(now),current_model_id=model_id)
    return ledger,public(ledger,audit,scan,now)


def public(ledger,audit,scan,now):
    fs=ledger['forecasts'];settled=[f for f in fs if f.get('outcome',{} ) and 'baseline_return_pct' in f['outcome']]
    errors=[abs(f['prediction']['expected_paper_return_pct']-f['outcome']['baseline_return_pct']) for f in settled if f['prediction']['expected_paper_return_pct'] is not None]
    return {'model_version':VERSION,'scan_id':scan,'updated_at':stamp(now),'source_audit':audit,
            'current_model_id':ledger['current_model_id'],'current_model':ledger['models'][ledger['current_model_id']],
            'prospective_predictions':len(fs),'settled_predictions':len(settled),
            'prospective_mean_absolute_error_pct':stats.mean(errors) if errors else None,
            'recent_forecasts':fs[-40:],'original_cash_untouched':True,'no_real_orders':True,
            'win_probability':None,'funding':'UNMODELED','liquidation':'UNVERIFIED',
            'no_profit_claim':True,'archive_transfer_is_discovery_only':True}


def main():
    def read(p):return json.loads(p.read_text())
    path=ROOT/'archive/uzayx-adaptive-ledger.json'
    books=[read(ROOT/'archive/v4-spark-paper-ledger.json')]+[read(p) for p in sorted((ROOT/'archive/epochs').glob('*/spark-ledger.json'))]
    prior=read(path) if path.exists() else {}
    now=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    ledger,report=run(prior,books,books[0]['last_scan_id'],now)
    v4_paper.save(path,ledger);v4_paper.save(ROOT/'web/data/uzayx-adaptive.json',report)
    print('ADAPTIVE',report['source_audit'],'forecasts',report['prospective_predictions'])


if __name__=='__main__':main()
