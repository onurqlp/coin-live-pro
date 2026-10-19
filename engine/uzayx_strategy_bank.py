#!/usr/bin/env python3
"""T001-T200 decision bank: explicit entry rules, controls and blocked sources.

The supplied catalogue contains hypotheses, execution controls and NO_TRADE,
not 200 interchangeable entry signals. No missing source is proxied by OHLC.
All implemented rules are forward paper experiments, never proven profits.
"""
import datetime as dt
import hashlib
import json
import math
import pathlib
import statistics as st
from collections import Counter

import v4_early as early
import v4_paper
from uzayx_research import closed_rows

ROOT=pathlib.Path(__file__).resolve().parents[1]
VERSION='turan200-20261020-v1'
H=3600000
# Each threshold is frozen in a fingerprint; no random parameter search.
# Conditions are ANDed. A missing metric blocks evaluation, never becomes zero.
RULES={
 1:[('z', '>=',2.5),('macro','==',True)],
 2:[('acceptance','==',True)],3:[('range_escape','==',True)],
 4:[('staircase','==',True),('macro','==',True)],
 5:[('compression','<=',20),('micro_accumulation','==',True)],
 6:[('compression','<=',25),('breakout','==',True)],
 7:[('z','>=',3.0)],8:[('rejection','>=',.6),('body','>',0)],
 9:[('retested_zone','==',True)],10:[('delayed_impulse','==',True)],
 11:[('relative_volume','>=',2),('move_atr','>=',.5)],
 17:[('post_impulse_volume','==',True)],
 31:[('range_escape','==',True),('relative_volume','>=',1)],
 32:[('retest_breakout','==',True)],33:[('second_wave','==',True)],
 34:[('acceleration','==',True),('macro','==',True)],
 36:[('trend_pullback','==',True)],37:[('flag_breakout','==',True)],
 38:[('h1_h4_aligned','==',True),('breakout','==',True)],
 39:[('macro','==',True),('hour_aligned','==',True),('relative_volume','>=',1)],
 41:[('compression','<=',20),('range_atr','>=',1.5),('breakout','==',True)],
 42:[('range_atr','>=',2),('move_atr','>=',.5)],
 43:[('vol_cluster','==',True),('macro','==',True)],
 44:[('nested_breakout','==',True)],45:[('vol_transition','==',True),('move_atr','>',0)],
 47:[('tail_cluster','==',True),('move_atr','>',0)],
 48:[('range_expansion','==',True),('breakout','==',True)],
 49:[('vol_asymmetry','>=',2),('macro','==',True)],
 50:[('compression','<=',20),('compression_1h','<=',20),('breakout','==',True)],
 51:[('side','==','SHORT'),('demand_exhaustion','==',True)],
 52:[('side','==','LONG'),('absorption','==',True)],
 53:[('side','==','SHORT'),('failed_high','==',True)],
 54:[('side','==','LONG'),('failed_low','==',True)],
 55:[('side','==','SHORT'),('parabolic_failure','==',True)],
 56:[('side','==','SHORT'),('distribution','==',True)],
 57:[('side','==','LONG'),('capitulation_reclaim','==',True)],
 58:[('v_recovery','==',True)],59:[('rounded_turn','==',True)],
 60:[('failed_breakout','==',True)],
 92:[('beta_residual_z','>=',2),('macro','==',True)],
 93:[('btc_flat','==',True),('relative_4h','>=',2)],
 94:[('btc_delayed_shock','==',True)],
 95:[('adx_4h','>=',25),('macro','==',True),('breakout','==',True)],
 96:[('breadth','>=',.7),('macro','==',True),('move_atr','>=',.5)],
 97:[('correlation_break','==',True),('relative_4h','>=',2)],
 98:[('side','==','SHORT'),('btc_4h','>=',1),('coin_4h','<=',-1)],
 99:[('side','==','LONG'),('btc_recovery','==',True),('move_atr','>',0)],
 107:[('side','==','LONG'),('market_mean_4h','<=',-1),('coin_4h','>=',1)],
 108:[('side','==','SHORT'),('market_mean_4h','>=',1),('coin_4h','<=',-1)],
 141:[('z','>=',2.5)],142:[('empirical_tail','==',True)],
 143:[('cusum','>=',3)],154:[('failed_breakout','==',True)]}

CONTROLS={20:'LOW_PARTICIPATION_VETO',25:'SPREAD_VETO',100:'BTC_SHOCK_VETO',158:'LIQUIDITY_GATE',
 159:'OPPOSING_STRATEGY_NO_TRADE',163:'24H_TIME_EXIT',165:'50_30_20_PARTIAL_TP',166:'CLOSED_ATR_STOP',
 167:'COIN_REENTRY_COOLDOWN',168:'LIQUIDITY_ENTRY_VETO',170:'MODELED_COST_TO_TARGET_GATE',
 172:'FAMILY_VOTING_RESEARCH',173:'PURGED_ANALOGUE_RESEARCH',174:'DIRECTION_CONFLICT_VETO',
 175:'1D_4H_REGIME_GATE',176:'EVIDENCE_PRIORITY_WITH_DETERMINISTIC_FALLBACK',178:'FUTURE_CLOSED_5M_FILL_GATE',
 179:'ONE_FAMILY_ONE_VOTE',181:'BIRTH_FEATURE_HISTORY_RESEARCH',182:'PURGED_EVENT_ANALOGUES',
 187:'ALL_OUTCOME_CONTEXT_LEARNING',188:'FIRST_EPISODE_SURVIVORSHIP_GUARD',
 189:'THREE_FOLD_TIME_VALIDATION',190:'RULE_AND_TRAINING_FINGERPRINT_LINEAGE',
 191:'ONE_COIN_TOTAL_POSITION',192:'EQUITY_AND_STOP_RISK_BUDGET',194:'DUPLICATE_SIGNAL_RISK_GATE',
 195:'FIVE_LOSS_FOUR_HOUR_PAUSE',196:'MODELED_COST_GATE',197:'PROSPECTIVE_ERROR_MONITOR',
 198:'STOP_LOSS_BUDGET_VETO',199:'NO_AUTO_ADAPTATION_BEFORE_FORWARD_VALIDATION',200:'NO_EDGE_NO_TRADE'}


def number(v):return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
def fingerprint(x):return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def policy():return json.loads((ROOT/'config/uzayx-strategy-policy.json').read_text())
def enabled():return policy().get('mode')=='TURAN200_ONLY'


def registry():
    source=json.loads((ROOT/'web/uzayx/turan-families-v1.json').read_text())['families']
    if len(source)!=200 or {x['id'] for x in source}!={f'T{i:03}' for i in range(1,201)}:raise ValueError('CATALOG_200_ID_CONTRACT')
    code=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest();out=[]
    for x in source:
        i=int(x['id'][1:]);row={**x,'strategy_version':VERSION,'category':x['category']}
        if i in RULES:row.update(role='ENTRY_HYPOTHESIS',state='IMPLEMENTED_FORWARD_PAPER',conditions=RULES[i],required_source='CLOSED_OKX_OHLCV_1D_4H_1H')
        elif i in CONTROLS:row.update(role='CONTROL_OR_RESEARCH',state='IMPLEMENTED_CONTROL',control=CONTROLS[i])
        else:
            need=('TRADE_TAPE' if 11<=i<=19 else 'ORDER_BOOK_HISTORY' if 21<=i<=30 or i in (131,134,135,161,162,164,169,193) else
                  'VERIFIED_LIQUIDATION_STREAM' if 61<=i<=70 else 'ALIGNED_OI_FUNDING_HISTORY' if 71<=i<=80 else
                  'SYNCHRONIZED_SPOT_FUTURES_MARKETS' if 81<=i<=90 else 'POINT_IN_TIME_SECTOR_MEMBERSHIP' if 101<=i<=110 else
                  'VERIFIED_EVENT_CALENDAR' if 111<=i<=120 or i==137 else 'POINT_IN_TIME_ONCHAIN_DATA' if 121<=i<=130 else
                  'INDEPENDENT_FORWARD_OR_LONG_HISTORY')
            row.update(role='SOURCE_DEPENDENT_HYPOTHESIS',state='BLOCKED_REQUIRED_EVIDENCE',required_source=need)
        row['strategy_config_hash']=fingerprint({'version':VERSION,'code':code,'rule':row})
        out.append(row)
    return out


def change(rows,n):return (rows[-1]['c']/rows[-n-1]['c']-1)*100 if len(rows)>n else None
def returns(rows):return [(b['c']/a['c']-1)*100 for a,b in zip(rows,rows[1:])]
def correlation(a,b):
    if len(a)!=len(b) or len(a)<8 or not st.pstdev(a) or not st.pstdev(b):return None
    am,bm=st.mean(a),st.mean(b)
    return sum((x-am)*(y-bm) for x,y in zip(a,b))/(len(a)*st.pstdev(a)*st.pstdev(b))


def metrics(candidate,rows,btc,market_moves,side):
    f=candidate['frames'];h=f['1H'];h4=f['4H'];day=f['1D'];sign=1 if side=='LONG' else -1
    target='UP' if sign>0 else 'DOWN';atr=h.get('atr_pct')
    if not number(atr) or atr<=0 or len(rows)<30:return {}
    a=rows[-1];prev=rows[-2];rs=returns(rows);baseline=rs[-21:-1]
    sd=st.pstdev(baseline);z=(rs[-1]-st.mean(baseline))/sd if sd else None
    high=max(r['h'] for r in rows[-9:-1]);low=min(r['l'] for r in rows[-9:-1]);body=sign*(a['c']-a['o'])/a['o']*100
    orient=lambda v:sign*v
    broken=(a['c']>high if sign>0 else a['c']<low)
    failed_high=a['h']>high and a['c']<high and a['c']<a['o']
    failed_low=a['l']<low and a['c']>low and a['c']>a['o']
    width=a['h']-a['l'];rejection=(min(a['o'],a['c'])-a['l'] if sign>0 else a['h']-max(a['o'],a['c']))/width if width else 0
    ranges=[(r['h']-r['l'])/r['o']*100 for r in rows]
    old_level=max(r['h'] for r in rows[-10:-2]) if sign>0 else min(r['l'] for r in rows[-10:-2])
    old_break=prev['c']>old_level if sign>0 else prev['c']<old_level
    aligned=h4.get('trend')==target and day.get('trend')==target
    rr=[orient(r) for r in rs];coin4=change(rows,4)
    vols=[r['v'] for r in rows]
    recent_sd=st.pstdev(rs[-4:]);past_sd=st.pstdev(rs[-16:-4])
    stair=all(sign*(b['l' if sign>0 else 'h']-a0['l' if sign>0 else 'h'])>0 for a0,b in zip(rows[-5:-1],rows[-4:]))
    retest=False;second=False
    for j in range(max(8,len(rows)-7),len(rows)-2):
        level=max(r['h'] for r in rows[j-8:j]) if sign>0 else min(r['l'] for r in rows[j-8:j])
        first=rows[j];touch=rows[j+1]
        if sign*(first['c']-level)>0 and (touch['l']<=level*1.002 and touch['c']>=level if sign>0 else touch['h']>=level*.998 and touch['c']<=level) and sign*(a['c']-first['c'])>0:retest=True
    if len(rows)>=8:
        impulse=orient((rows[-5]['c']/rows[-8]['o']-1)*100)
        second=impulse>=2 and (min(r['l'] for r in rows[-4:-1])>rows[-8]['o'] if sign>0 else max(r['h'] for r in rows[-4:-1])<rows[-8]['o']) and sign*(a['c']-rows[-5]['c'])>0
    m={'side':side,'z':orient(z) if z is not None else None,'macro':aligned,'hour_aligned':h.get('trend')==target,
       'h1_h4_aligned':h.get('trend')==h4.get('trend')==target,'compression':h4.get('bb_compression_percentile_30'),
       'compression_1h':h.get('bb_compression_percentile_30'),'relative_volume':h.get('volume_ratio_20'),
       'adx_4h':h4.get('adx_14'),'body':body,'range_atr':ranges[-1]/atr,'move_atr':orient(rs[-1])/atr,
       'rejection':rejection,'breakout':broken,'failed_high':failed_high,'failed_low':failed_low,
       'acceptance':old_break and sign*(a['c']-old_level)>0,
       'range_escape':h4.get('trend')=='SIDEWAYS' and broken,
       'staircase':stair,'micro_accumulation':all(x>0 for x in rr[-3:]),
       'retested_zone':(a['l']<=low*1.002 and a['c']>low and body>0) if sign>0 else (a['h']>=high*.998 and a['c']<high and body>0),
       'delayed_impulse':rr[-4]>2*atr and sum(rr[-3:-1])<=atr and rr[-1]>.5*atr,
       'post_impulse_volume':rr[-3]>atr and vols[-1]>2*st.mean(vols[-21:-1]) and rr[-1]>0,
       'retest_breakout':retest,'second_wave':second,'acceleration':0<rr[-3]<rr[-2]<rr[-1],
       'trend_pullback':aligned and rr[-2]<0 and rr[-1]>0 and sign*(a['c']-rows[-3]['c'])>0,
       'flag_breakout':rr[-5]>2*atr and max(r['h'] for r in rows[-4:-1])-min(r['l'] for r in rows[-4:-1])<a['c']*atr/100 and broken,
       'vol_cluster':min(ranges[-3:])>1.3*st.mean(ranges[-15:-3]),
       'nested_breakout':rows[-2]['h']<rows[-3]['h']<rows[-4]['h'] and rows[-2]['l']>rows[-3]['l']>rows[-4]['l'] and sign*(a['c']-prev['h' if sign>0 else 'l'])>0,
       'vol_transition':past_sd>0 and recent_sd>2*past_sd,
       'tail_cluster':sd>0 and sum(abs(x-st.mean(baseline))>2*sd for x in rs[-10:])>=3,
       'range_expansion':sum(ranges[-6:])>1.8*sum(ranges[-12:-6]),
       'vol_asymmetry':sum(x*x for x in rr[-20:] if x>0)/max(1e-12,sum(x*x for x in rr[-20:] if x<0)),
       'demand_exhaustion':a['h']>=high*.998 and st.mean(vols[-3:])<.7*st.mean(vols[-6:-3]) and rs[-1]<0,
       'absorption':a['l']<=low*1.002 and vols[-1]>2*st.mean(vols[-21:-1]) and abs(a['c']/a['o']-1)*100<atr*.3 and a['c']>a['o'],
       'parabolic_failure':rs[-4]>0 and rs[-3]>rs[-4] and rs[-2]>rs[-3] and rs[-1]<-atr,
       'distribution':st.mean(vols[-3:])>2*st.mean(vols[-23:-3]) and abs(change(rows,3))<atr and rs[-1]<0,
       'capitulation_reclaim':rs[-2]<-2*atr and vols[-2]>2*st.mean(vols[-22:-2]) and a['c']>prev['o'],
       'v_recovery':rr[-2]<-2*atr and rr[-1]>abs(rr[-2])*.75,
       'rounded_turn':orient(st.mean(r['c'] for r in rows[-3:])-st.mean(r['c'] for r in rows[-6:-3]))>0 and orient(st.mean(r['c'] for r in rows[-6:-3])-st.mean(r['c'] for r in rows[-9:-6]))<0,
       'failed_breakout':(old_break and sign*(a['c']-old_level)<0),
       'empirical_tail':orient(rs[-1])>max(orient(x) for x in baseline),
       'cusum':max(0,sum((orient(x-st.mean(baseline))/sd-.25) for x in rs[-5:])) if sd else None,
       'coin_4h':coin4,'relative_4h':orient(coin4),
       'breadth':sum(sign*x>0 for x in market_moves)/len(market_moves) if market_moves else None,
       'market_mean_4h':st.mean(market_moves) if market_moves else None}
    bytime={r['t']:r for r in btc};pairs=[(r,bytime[r['t']]) for r in rows if r['t'] in bytime]
    if len(pairs)>=25 and all(pairs[i+1][0]['t']-pairs[i][0]['t']==H for i in range(len(pairs)-1)):
        cr=returns([r[0] for r in pairs]);br=returns([r[1] for r in pairs]);basec=cr[-21:-1];baseb=br[-21:-1]
        covariance=st.mean((x-st.mean(basec))*(y-st.mean(baseb)) for x,y in zip(basec,baseb));variance=st.pvariance(baseb)
        beta=covariance/variance if variance else 0
        residuals=[x-beta*y for x,y in zip(basec,baseb)];res_sd=st.pstdev(residuals)
        btc4=change([r[1] for r in pairs],4)
        oldcorr=correlation(cr[-21:-1],br[-21:-1]);newcorr=correlation(cr[-8:],br[-8:])
        m.update(btc_4h=btc4,btc_flat=abs(btc4)<.5,
                 beta_residual_z=sign*(cr[-1]-beta*br[-1]-st.mean(residuals))/res_sd if res_sd else None,
                 correlation_break=oldcorr is not None and newcorr is not None and oldcorr>.7 and newcorr<.1,
                 btc_delayed_shock=sign*sum(br[-5:-1])>2 and sign*br[-1]>0 and orient(cr[-1])>.5*atr,
                 btc_recovery=sum(br[-5:-1])<-2 and br[-1]>0)
    return m


def matches(conditions,m):
    for key,op,value in conditions:
        actual=m.get(key)
        if actual is None:return False
        if op=='==' and actual!=value:return False
        if op in ('>','>=','<='):
            if not number(actual):return False
            if op=='>' and not actual>value:return False
            if op=='>=' and not actual>=value:return False
            if op=='<=' and not actual<=value:return False
    return True


def strategy_priority(book,now):
    """Only exact, forward-born primary attribution may earn a future weight.

    Legacy winners are never relabelled as a T-strategy's performance.
    """
    from uzayx_adaptive import samples
    rows,_=samples([book],now-H);groups={}
    for r in rows:
        sid=r.get('strategy_id')
        if sid and sid.startswith('T'):groups.setdefault(sid,[]).append(r)
    scores={}
    for sid,rs in groups.items():
        hours={}
        for r in rs:hours.setdefault(r['decision_ms']//H,[]).append(r['return_pct']-.1)
        if len(rs)<60 or len(hours)<24 or max(hours)-min(hours)<7*24:continue
        split=sorted(hours)[len(hours)//2]
        discovery=[r for r in rs if r['closed_ms']<split*H-H]
        holdout=[r for r in rs if r['decision_ms']>=split*H]
        if len(discovery)<30 or len(holdout)<30 or st.mean(r['return_pct'] for r in discovery)<=0:continue
        test_hours={}
        for r in holdout:test_hours.setdefault(r['decision_ms']//H,[]).append(r['return_pct']-.1)
        if len(test_hours)<12:continue
        ys=[st.mean(v) for v in test_hours.values()]
        # Conservative heuristic across many candidates; not a calibrated CI.
        lower=st.mean(ys)-3.5*st.stdev(ys)/math.sqrt(len(ys))
        if lower>0:scores[sid]=round(lower,6)
    return scores


def build(mtf,market,pack,now,prior_cash=None):
    source=early.epoch(mtf.get('fetched_at'));qtime=early.epoch(market.get('fetched_at'))
    if (mtf.get('provider')!='OKX' or market.get('provider')!='OKX' or
        pack.get('source')!='OKX_CLOSED_CANDLES' or pack.get('source_mtf_at')!=mtf.get('fetched_at') or
        source is None or qtime is None or not 0<=now-source<=480000 or not 0<=now-qtime<=480000):raise ValueError('STRATEGY_MIXED_OR_STALE_SOURCE')
    rows_by={}
    for s,f in pack['candles_by_symbol'].items():
        packed=f.get('1H',[]);rows=closed_rows(packed,H,now)
        volumes={int(r[0]):r[5] for r in packed if len(r)==6 and number(r[5]) and r[5]>=0}
        if any(r['t'] not in volumes for r in rows):raise ValueError('INVALID_STRATEGY_VOLUME')
        rows_by[s]=[{**r,'v':volumes[r['t']]} for r in rows]
    for s,rows in list(rows_by.items()):
        if len(rows)<30 or any(b['t']-a['t']!=H for a,b in zip(rows,rows[1:])):rows_by[s]=[]
    btc=rows_by.get('BTCUSDT',[]);moves=[change(r,4) for r in rows_by.values() if len(r)>4]
    bank=registry();index={r['id']:r for r in bank};quotes={x['symbol']:x for x in market['rows']};signals=[];evaluated=Counter();blocked=Counter()
    priority=strategy_priority(prior_cash,now) if prior_cash else {};seen=set()
    for c in mtf.get('candidates',[]):
        sym=c.get('symbol');side=c.get('side');q=quotes.get(sym,{})
        if (sym,side) in seen or side not in ('LONG','SHORT'):continue
        seen.add((sym,side));f=c.get('frames') or {}
        if c.get('quality')!='COMPLETE' or not all(early.closed(f.get(tf),tf,now) for tf in ('1D','4H','1H')):continue
        if not rows_by.get(sym) or rows_by[sym][-1]['t']!=early.epoch(f['1H']['last_candle_utc']):continue
        if q.get('instrument_state')!='live' or not number(q.get('price')) or q['price']<=0:continue
        m=metrics(c,rows_by.get(sym,[]),btc,moves,side)
        if not m:continue
        triggered=[]
        for i,conditions in RULES.items():
            sid=f'T{i:03}'
            if any(m.get(k) is None for k,_,_ in conditions):blocked[sid]+=1;continue
            evaluated[sid]+=1
            if matches(conditions,m):triggered.append(sid)
        if not triggered:continue
        triggered.sort(key=lambda sid:(-priority.get(sid,0),sid))
        costs=.18+(q['spread_bps'] if number(q.get('spread_bps')) else 1000)/100
        liquid=number(q.get('volume')) and q['volume']>=10000000 and number(q.get('spread_bps')) and q['spread_bps']<=20 and number(q.get('listing_age_days')) and q['listing_age_days']>=7
        no_btc_shock=bool(len(btc)>4 and abs(change(btc,1))<3)
        cash=bool(m['macro'] and liquid and no_btc_shock and f['1H']['atr_pct']>costs*3 and
                  (not m['breakout'] or (m.get('relative_volume') or 0)>=.6))
        primary=triggered[0];stage=3 if cash else 2 if m['macro'] else 1
        level=f['1H'].get('breakout_high_prev8' if side=='LONG' else 'breakout_low_prev8') or q['price']
        signals.append({'symbol':sym,'side':side,'strategy_id':primary,'strategy_ids':triggered,
            'strategy_version':VERSION,'strategy_config_hash':index[primary]['strategy_config_hash'],
            'strategy_family':index[primary]['category'],'strategy_policy':'TURAN200_ONLY',
            'selection_basis':'FORWARD_IDENTIFIED_STRESS_EVIDENCE' if primary in priority else 'FIXED_ID_NO_VALIDATED_WINNER',
            'family_vote_count':len({index[t]['category'] for t in triggered}),
            'strategy_evidence':{'matched_conditions':index[primary]['conditions'],'observed':{k:m[k] for k,_,_ in index[primary]['conditions']}},
            'research_tier':{1:'KIVILCIM',2:'ERKEN_SINYAL',3:'ISIK_GUCLENIYOR'}[stage],
            'research_rank':min(90,50+5*len({index[t]['category'] for t in triggered})+10*int(cash)),
            'paper_stage_number':stage,'paper_stage_name':{1:'İZLENEN',2:'GELMEKTE OLAN',3:'GELDİ'}[stage],
            'hourly_level_state':'CLOSED_1H_LEVEL_BREACHED' if cash else 'WAIT_FOR_NEW_1H_CLOSE',
            'stage_confirmation':'VERSIONED_STRATEGY_TRIGGER_AND_COST_REGIME_GATE',
            'hourly_level':level,'price_at_scan':q['price'],
            'source_closed_1h_at_utc':f['1H']['last_candle_utc'],'source_closed_4h_at_utc':f['4H']['last_candle_utc'],
            'source_closed_1d_at_utc':f['1D']['last_candle_utc'],'source_observed_at_utc':mtf['fetched_at'],
            'relative_volume_4h':f['4H'].get('volume_ratio_20'),'relative_volume_1h':f['1H'].get('volume_ratio_20'),
            'trend_1d':f['1D']['trend'],'trend_4h':f['4H']['trend'],'trend_1h':f['1H']['trend'],
            'trend_1w':(f.get('1W') or {}).get('trend','UNKNOWN'),
            'aligned_main_count':int(m['macro'])*2,'supporting_factor_count':len(triggered),
            'structure_risk_score':c.get('structure_risk_score'),'spread_bps':q.get('spread_bps'),'volume_24h_usdt':q.get('volume'),
            'reasons':[primary,'T175_REGIME','T170_MODELED_COSTS'] if cash else [primary,'WAIT_CASH_GATES'],
            'paper_eligible':False,'real_order_eligible':False,'source_quality':'VERIFIED_CLOSED_OHLC',
            'probability_calibrated':False,'verified_technical_entry':cash,
            'modeled_roundtrip_cost_pct':costs,'funding':'UNMODELED'})
    conflicts={s['symbol'] for s in signals if any(t['symbol']==s['symbol'] and t['side']!=s['side'] and t['paper_stage_number']==3 for t in signals) and s['paper_stage_number']==3}
    for s in signals:
        if s['symbol'] in conflicts:
            s.update(paper_stage_number=2,paper_stage_name='GELMEKTE OLAN',hourly_level_state='WAIT_FOR_NEW_1H_CLOSE',verified_technical_entry=False)
            s['reasons'].append('T174_DIRECTION_CONFLICT_NO_TRADE')
    for r in bank:r.update(evaluated_candidates=evaluated[r['id']],source_blocked_candidates=blocked[r['id']])
    return {'model_version':VERSION,'updated_at':early.stamp(now),'source_mtf_at':mtf['fetched_at'],
            'source_market_at':market['fetched_at'],'policy':'TURAN200_ONLY','registry':bank,'registry_count':200,
            'registry_hash':fingerprint(bank),'signals':signals,'role_counts':dict(Counter(r['role'] for r in bank)),
            'state_counts':dict(Counter(r['state'] for r in bank)),
            'no_trade':not any(s['paper_stage_number']==3 for s in signals),'no_real_orders':True,
            'forward_validated_priority':priority,
            'hypotheses_are_not_validated_profits':True,'funding':'UNMODELED','liquidation':'UNVERIFIED'}


def read_feed(mtf_at):
    d=json.loads((ROOT/'web/data/uzayx-strategy-bank.json').read_text())
    if d.get('policy')!='TURAN200_ONLY' or d.get('source_mtf_at')!=mtf_at or d.get('registry_count')!=200:raise ValueError('STRATEGY_FEED_MISMATCH')
    return d


def lifecycle_proposals(feed,candidates):
    by={(c['symbol'],c['side']):c for c in candidates};out=[]
    for s in feed['signals']:
        c=by.get((s['symbol'],s['side']),{});f=c.get('frames') or {};atr=(f.get('1H') or {}).get('atr_pct')
        if not number(atr) or atr<=0:continue
        sign=1 if s['side']=='LONG' else -1;gap=s['price_at_scan']*atr/100
        out.append({'symbol':s['symbol'],'side':s['side'],'strategy_id':s['strategy_id'],
            'strategy_version':s['strategy_version'],'market_quality':'VERIFIED_CLOSED_OHLC',
            'source_candle_closed_at_utc':early.stamp(early.epoch(s['source_closed_1h_at_utc'])+H),
            'h4_candle_closed_at_utc':early.stamp(early.epoch(s['source_closed_4h_at_utc'])+4*H),
            'discovery':True,'motion':s['paper_stage_number']>=2,'spotlight':s['paper_stage_number']==3,
            'entry_eligible':False,'score':s['research_rank'],'risk_score':s['structure_risk_score'] or 0,
            'reason_codes':s['reasons'],'metrics_used':{'strategy_config_hash':s['strategy_config_hash'],'strategy_ids':s['strategy_ids'],**s['strategy_evidence']},
            'price':s['price_at_scan'],'stop':s['price_at_scan']-sign*gap,
            'targets':[s['price_at_scan']+sign*gap*i for i in (1,2,3)],'factor_groups':{'strategy':s['strategy_id']}})
    return out


def main():
    read=lambda p:json.loads((ROOT/p).read_text())
    now=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    report=build(read('web/data/mtf.json'),read('web/data/market.json'),read('web/data/chart-pack.json'),now,
                 read('archive/v4-spark-paper-ledger.json'))
    v4_paper.save(ROOT/'web/data/uzayx-strategy-bank.json',report)
    print('TURAN200',report['state_counts'],'signals',len(report['signals']),'NO_TRADE',report['no_trade'])


if __name__=='__main__':main()
