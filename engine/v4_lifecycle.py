#!/usr/bin/env python3
"""COIN.LIVE PRO V4 lifecycle: new forward-only event sourcing, not legacy backfill.

Separate axes: review_state, lifecycle_stage, confirmation_state, paper_entry_state.
Only a fresh, fully stamped NEW source observation can promote a setup.
All entry-eligible events must arise *after* V4 account start and must be
rechecked by the independent virtual-account engine before paper filling.
"""
import datetime as dt
import hashlib
import json
import pathlib
import v4_strategies as strat

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web'/'data'
ARCH=ROOT/'archive'/'v4-lifecycle-ledger.json'
POLICY=ROOT/'config'/'v4-policy.json'
VERSION='4.0.0-lifecycle-a1'
DAY_MS=86400000

def digest(value):
    return hashlib.sha256(str(value).encode()).hexdigest()[:24]

def timestamp(iso):
    if not isinstance(iso,str):return None
    try:
        d=dt.datetime.fromisoformat(iso.replace('Z','+00:00'))
        if d.tzinfo is None:return None
        return int(d.timestamp()*1000)
    except (ValueError,TypeError,AttributeError):return None

def iso(ms):
    return dt.datetime.fromtimestamp(ms/1000,dt.timezone.utc).isoformat()

def load(path,default):
    try:return json.loads(path.read_text(encoding='utf8'))
    except (OSError,ValueError):return default

def write(path,doc):
    path.parent.mkdir(exist_ok=True,parents=True)
    temp=path.with_suffix(path.suffix+'.tmp')
    temp.write_text(json.dumps(doc,ensure_ascii=False,allow_nan=False,separators=(',',':')),encoding='utf8')
    temp.replace(path)

def append_event(state,setup,kind,now_ms,scan_id,reason_codes,previous,next_stage,
                 source_closed,metrics,price):
    raw='|'.join((setup['setup_id'],kind,previous or '',
                  next_stage or '',str(source_closed),scan_id))
    event_id=(digest('ENTRY_ELIGIBLE|'+setup['trade_intent_id'])
              if kind=='ENTRY_ELIGIBLE' and setup.get('trade_intent_id') else digest(raw))
    if event_id in state['_event_ids']:return False
    event={'event_id':event_id,'setup_id':setup['setup_id'],'type':kind,
           'previous_stage':previous,'next_stage':next_stage,
           'event_time_utc':iso(now_ms),'observation_time_utc':iso(now_ms),
           'source_candle_closed_at_utc':source_closed,
           'snapshot_id':scan_id,'model_version':'4.0.0',
           'policy_version':state['policy_version'],'symbol':setup['symbol'],
           'side':setup['side'],'strategy_id':setup['strategy_id'],
           'reason_codes':list(reason_codes),'metrics_used':metrics,
           'price_at_transition':price,'data_quality':setup['review_state'],
           'trade_intent_id':setup.get('trade_intent_id'),
           'stop':setup.get('stop'),'targets':setup.get('targets'),
           'risk_score':setup.get('risk_score')}
    state['events'].append(event)
    state['_event_ids'].add(event_id)
    return True

def evolve(previous,proposals,scan_id,now_ms,policy,source_ok=True):
    """Deterministic replay with a stable setup_id for each active hypothesis."""
    state={'model_version':VERSION,'policy_version':policy['policy_version'],
           'started_at':previous.get('started_at') or iso(now_ms),
           'events':list(previous.get('events',[])), '_event_ids':set(),
           'items':[], 'archived_count':int(previous.get('archived_count') or 0)}
    state['_event_ids']={e['event_id'] for e in state['events'] if e.get('event_id')}
    before=[dict(x) for x in previous.get('items',[])]
    old={(x['symbol'],x['side'],x['strategy_id']):x for x in before
         if x.get('lifecycle_stage')!='ARCHIVED'}
    # No duplicate proposals across detector retries.
    candidates={(x['symbol'],x['side'],x['strategy_id']):x for x in proposals
                if x.get('discovery') and x.get('market_quality')=='VERIFIED_CLOSED_OHLC'}
    for key in sorted(candidates):
        p=candidates[key]
        evidence_time=timestamp(p.get('source_candle_closed_at_utc'))
        if not source_ok or evidence_time is None or evidence_time>now_ms+120000:
            continue
        if now_ms-evidence_time>3600000+900000:continue
        prev=old.pop(key,None)
        # New V4 record always starts WATCH; never promotes in same scan.
        if prev is None:
            first4=p.get('h4_candle_closed_at_utc')
            setup_id=digest('|'.join(('OKX','SWAP',key[0],key[1],key[2],str(first4))))
            obj={'setup_id':setup_id,'symbol':key[0],'side':key[1],
                 'venue':'OKX','market_type':'USDT-SWAP',
                 'strategy_id':key[2],'strategy_version':p['strategy_version'],
                 'lifecycle_stage':'WATCH','review_state':'FRESH',
                 'confirmation_state':'UNCONFIRMED','paper_entry_state':'NOT_ELIGIBLE',
                 'first_seen_at':iso(now_ms),'entered_stage_at':iso(now_ms),
                 'last_evaluated_at':iso(now_ms),'last_evidence_at':p['source_candle_closed_at_utc'],
                 'score':p['score'],'risk_score':p['risk_score'],
                 'reasons':p['reason_codes'],'metrics':p['metrics_used'],'price':p['price'],
                 'stop':p.get('stop'),'targets':p.get('targets') or [],
                 'source_snapshot_id':scan_id,'source_price':p['price'],
                 'transition_count':0}
            append_event(state,obj,'DISCOVERED',now_ms,scan_id,p['reason_codes'],None,'WATCH',
                         p['source_candle_closed_at_utc'],p['metrics_used'],p['price'])
            append_event(state,obj,'WATCH_STARTED',now_ms,scan_id,p['reason_codes'],None,'WATCH',
                         p['source_candle_closed_at_utc'],p['metrics_used'],p['price'])
            state['items'].append(obj);continue
        obj=dict(prev)
        before_stage=obj['lifecycle_stage']
        prev_evidence=timestamp(obj.get('last_evidence_at')) or 0
        # Do not claim a fresh new 1H close if source closed at the SAME time.
        has_new=evidence_time>prev_evidence
        obj.update(review_state='FRESH',last_evaluated_at=iso(now_ms),
                   source_snapshot_id=scan_id,score=p['score'],risk_score=p['risk_score'],
                   reasons=p['reason_codes'],metrics=p['metrics_used'],price=p['price'],
                   strategy_version=p['strategy_version'],
                   stop=p.get('stop'),targets=p.get('targets') or [])
        # Evidence provenance updated only for a newer fully closed candle.
        if has_new:obj['last_evidence_at']=p['source_candle_closed_at_utc']
        stage=before_stage
        prior_stage_since=timestamp(obj.get('entered_stage_at')) or now_ms
        if p['risk_score']>=40 or p['score']<policy['discovery_min_score']:
            stage='ARCHIVED'
            reason='RISK_OR_SCORE_INVALIDATED'
        elif stage=='WATCH' and p['motion'] and has_new and p['score']>=policy['motion_min_score']:
            stage='MOTION';reason='MOTION_CLOSED_BAR_VERIFIED'
        elif stage=='MOTION' and p['spotlight'] and has_new and evidence_time>prior_stage_since and p['score']>=policy['spotlight_min_score']:
            stage='SPOTLIGHT';reason='MULTI_FACTOR_SPOTLIGHT_PROMOTED'
        elif stage=='SPOTLIGHT' and (not p['spotlight'] or p['risk_score']>24):
            stage='MOTION' if p['motion'] else 'WATCH';reason='SPOTLIGHT_GATE_LOST'
        elif stage=='MOTION' and not p['motion']:
            stage='WATCH';reason='MOTION_GATE_LOST'
        else:reason=None
        if stage!=before_stage:
            obj['lifecycle_stage']=stage
            obj['entered_stage_at']=iso(now_ms)
            obj['transition_count']=int(obj.get('transition_count') or 0)+1
            if stage=='ARCHIVED':
                obj['retired_at']=iso(now_ms);obj['retired_reason']=reason
                state['archived_count']+=1
            kind={'MOTION':'MOTION_STARTED','SPOTLIGHT':'SPOTLIGHT_PROMOTED',
                  'WATCH':'DOWNGRADED','ARCHIVED':'INVALIDATED'}[stage]
            append_event(state,obj,kind,now_ms,scan_id,[reason],before_stage,stage,
                         p['source_candle_closed_at_utc'],p['metrics_used'],p['price'])
        strict_entry=bool(stage=='SPOTLIGHT' and p['entry_eligible'] and has_new)
        obj['paper_entry_state']='ELIGIBLE' if strict_entry else 'NOT_ELIGIBLE'
        obj['confirmation_state']='CONFIRMED' if strict_entry else (
            'LOST_CONFIRMATION' if prev.get('confirmation_state')=='CONFIRMED' else
            'WAIT_4H_CLOSE' if stage in ('MOTION','SPOTLIGHT') else 'UNCONFIRMED')
        if strict_entry:
            # Unique intent ID, never created from legacy V3 events.
            obj['trade_intent_id']=digest(obj['setup_id']+'|'+p['h4_candle_closed_at_utc']+'|'+policy['policy_version'])
            append_event(state,obj,'ENTRY_ELIGIBLE',now_ms,scan_id,p['reason_codes'],
                         stage,stage,p['source_candle_closed_at_utc'],p['metrics_used'],p['price'])
        if stage=='ARCHIVED':
            continue
        state['items'].append(obj)
    for key,obj in old.items():
        obj=dict(obj)
        if not source_ok:
            obj['review_state']='SOURCE_ERROR'
        else:
            obj['review_state']='RECHECK_PENDING'
        obj['paper_entry_state']='NOT_ELIGIBLE'
        if obj.get('confirmation_state')=='CONFIRMED':
            obj['confirmation_state']='LOST_CONFIRMATION'
        obj['trade_intent_id']=None
        # No evidence for true invalidation. TTL is visibility and operational
        # stale handling, never a market loss or a successful trade.
        base=timestamp(obj.get('last_evaluated_at')) or now_ms
        ttl={'WATCH':policy['watch_hours'],'MOTION':policy['motion_hours'],
             'SPOTLIGHT':policy['spotlight_hours']}[obj['lifecycle_stage']]*3600000
        if now_ms-base>=ttl and source_ok:
            obj['lifecycle_stage']='ARCHIVED'
            obj['retired_at']=iso(now_ms)
            obj['retired_reason']='STALE_UNVERIFIED'
            append_event(state,obj,'ARCHIVED',now_ms,scan_id,['STALE_UNVERIFIED'],
                         prev_stage(obj),'ARCHIVED',
                         obj.get('last_evidence_at'),{},obj.get('price'))
            state['archived_count']+=1
            continue
        state['items'].append(obj)
    # preserve chronological immutable journal up to 90 days, with older data
    # untouched in git history; main table is bounded by setup volume.
    cutoff=now_ms-90*DAY_MS
    state['events']=[x for x in state['events']
                     if (timestamp(x.get('event_time_utc')) or now_ms)>=cutoff]
    state['items'].sort(key=lambda x:(x['review_state']!='FRESH',
                      {'SPOTLIGHT':0,'MOTION':1,'WATCH':2}.get(x['lifecycle_stage'],3),
                      -x['score'],x['first_seen_at']))
    state['items']=state['items'][:150]
    state.pop('_event_ids',None)
    return state

def prev_stage(obj):
    return obj.get('lifecycle_stage') or 'WATCH'

def project_view(ledger,scan_id,source_times,policy):
    fresh=[x for x in ledger['items'] if x['review_state']=='FRESH']
    # Public spotlight/motion must never show carried-over stale decisions.
    spotlight=[x for x in fresh if x['lifecycle_stage']=='SPOTLIGHT'][:policy['max_spotlight']]
    motion=[x for x in fresh if x['lifecycle_stage']=='MOTION'][:policy['max_motion']]
    watch=[x for x in ledger['items'] if x['lifecycle_stage']=='WATCH'][:policy['max_watch']]
    waiting=[x for x in ledger['items'] if x['review_state']!='FRESH']
    return {'model_version':ledger['model_version'],'policy_version':ledger['policy_version'],
            'scan_id':scan_id,'updated_at':source_times['mtf'],
            'source_mtf_at':source_times['mtf'],'source_spark_at':source_times['spark'],
            'counts':{'spotlight':len(spotlight),'motion':len(motion),
                      'watch':len(watch),'recheck_pending':len(waiting),
                      'active_total':len(ledger['items']),
                      'archived_total':ledger['archived_count']},
            'spotlight':spotlight,'motion':motion,'watch':watch,
            'recheck':waiting[:20], 'no_real_orders':True,'probability_calibrated':False,
            'note':'A stage is an evidence-based research priority, not an entry or return guarantee.'}

def build(mtf,radar,market,archive,now_ms,policy):
    # Same snapshot, same venue; fail-closed instead of mixing unequal rounds.
    if (mtf.get('model_version')!='3.0.0-mtf-swing' or
        radar.get('filter_policy')!='3.1-persistent-quant-20261016' or
        market.get('provider')!='OKX' or
        mtf.get('fetched_at')!=radar.get('source_mtf_at')):
        raise RuntimeError('V4 sources are not synchronized verified V3.1 market assessments')
    times=[timestamp(x) for x in (mtf.get('fetched_at'),radar.get('fetched_at'),market.get('fetched_at'))]
    if any(x is None or abs(now_ms-x)>policy['source_stale_minutes']*60000 for x in times):
        raise RuntimeError('V4 stale or future source timestamp')
    scan_id=digest('|'.join(str(x) for x in times))
    active={(x['symbol'],x['side']):x for x in radar.get('items',[])
            if x.get('review_state')=='FRESH'}
    market_by={x['symbol']:x for x in market.get('rows',[])}
    propositions=[]
    for item in mtf.get('candidates',[]):
        symbol=item.get('symbol')
        if symbol not in market_by:continue
        spark=active.get((symbol,item.get('side')))
        propositions.extend(strat.evaluator(item,market_by[symbol],spark,now_ms))
    ledger=evolve(archive,propositions,scan_id,now_ms,policy)
    board=project_view(ledger,scan_id,{'mtf':mtf['fetched_at'],'spark':radar['fetched_at']},policy)
    return ledger,board

def main():
    now_ms=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    policy=load(POLICY,{})
    if policy.get('model_version')!='4.0.0':raise RuntimeError('Missing approved V4 policy')
    m=load(DATA/'mtf.json',{})
    r=load(DATA/'swing-radar.json',{})
    market=load(DATA/'market.json',{})
    prior=load(ARCH,{})
    ledger,board=build(m,r,market,prior,now_ms,policy)
    write(ARCH,ledger)
    write(DATA/'v4-radar.json',board)
    write(DATA/'v4-history-index.json',{
        'model_version':'4.0.0','updated_at':board['updated_at'],
        'scan_id':board['scan_id'],'archive_days':90,
        'events':ledger['events'][-140:],'archived_total':ledger['archived_count']})
    print('V4-LIFECYCLE',board['counts'],len(ledger['events']),board['scan_id'],flush=True)

if __name__=='__main__':main()
