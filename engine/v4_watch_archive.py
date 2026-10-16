#!/usr/bin/env python3
"""Persistent, read-only V4 WATCH discovery ledger: no imaginary backfilled trades.

Each discovered setup is a distinct hypothesis. Never discard an older record
simply because the 90-day on-screen performance window has elapsed.
"""
import datetime as dt
import pathlib
import v4_paper

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web'/'data'
ARCH=ROOT/'archive'/'v4-watch-ledger.json'
VERSION='4.0.0-watch-archive-a1'
HORIZONS=('1M','5M','15M','1H','4H','24H','3D','1W','7D')
def stamp(ms):
    return dt.datetime.fromtimestamp(ms/1000,dt.timezone.utc).isoformat()
def epoch(value):
    try:
        date=dt.datetime.fromisoformat(str(value).replace('Z','+00:00'))
        return int(date.timestamp()*1000) if date.tzinfo else 0
    except (TypeError,ValueError,OverflowError):
        return 0

def merge(prior,lifecycle,forward,now_ms,scan_id):
    records={x['setup_id']:dict(x) for x in prior.get('records',[])
             if isinstance(x,dict) and x.get('setup_id')}
    for e in lifecycle.get('events',[]):
        key=e.get('setup_id')
        if not key or not str(e.get('symbol','')).endswith('USDT'):continue
        if e.get('type')=='DISCOVERED' and key not in records:
            records[key]={'setup_id':key,'symbol':e['symbol'],'side':e['side'],
               'strategy_id':e.get('strategy_id'),'first_seen_at':e.get('event_time_utc'),
               'first_seen_price':e.get('price_at_transition'),
               'source_candle_closed_at_utc':e.get('source_candle_closed_at_utc'),
               'first_event_id':e.get('event_id'),'initial_source':'DISCOVERED_EVENT',
               'last_seen_at':e.get('event_time_utc'),'last_stage':'WATCH',
               'checkpoints':{},'no_real_orders':True}
        x=records.get(key)
        if x and e.get('type') not in ('WATCH_STARTED','DISCOVERED') and (
          epoch(e.get('event_time_utc'))>=epoch(x.get('last_seen_at'))):
            x['last_seen_at']=e.get('event_time_utc')
            x['last_stage']=e.get('next_stage') or x.get('last_stage')
    # Recover still-active earlier WATCH items from their original creation
    # fields, never from the current quote as an invented historical entry.
    for s in lifecycle.get('items',[]):
        key=s.get('setup_id')
        if not key or not str(s.get('symbol','')).endswith('USDT'):continue
        if key not in records:
            records[key]={'setup_id':key,'symbol':s['symbol'],'side':s['side'],
                'strategy_id':s.get('strategy_id'),'first_seen_at':s.get('first_seen_at'),
                'first_seen_price':s.get('source_price'),
                'source_candle_closed_at_utc':None,'first_event_id':None,
                'initial_source':'RECOVERED_ORIGINAL_ACTIVE_FIELDS',
                'last_seen_at':s.get('first_seen_at'),'last_stage':'WATCH',
                'checkpoints':{},'no_real_orders':True}
        x=records[key]
        last=epoch(s.get('last_evaluated_at'))
        if last>=epoch(x.get('last_seen_at')):
            x['last_seen_at']=s.get('last_evaluated_at')
            x['last_stage']=s.get('lifecycle_stage','WATCH')
            x['review_state']=s.get('review_state','RECHECK_PENDING')
            x['last_scanned_at']=s.get('last_evaluated_at')
    for key,x in records.items():
        obs=(forward.get('observations') or {}).get(key)
        if not obs or epoch(obs.get('observed_at_utc'))!=epoch(x.get('first_seen_at')):
            continue
        for period in HORIZONS:
            result=(obs.get('horizons') or {}).get(period)
            previous=x.get('checkpoints',{}).get(period)
            if result and (not previous or previous.get('state')!='OBSERVED'):
                x.setdefault('checkpoints',{})[period]=result
        x['last_followup_at']=stamp(now_ms)
    values=sorted(records.values(),key=lambda x:(epoch(x.get('first_seen_at')),x['setup_id']),reverse=True)
    out={'model_version':VERSION,'scan_id':scan_id,'updated_at':stamp(now_ms),
         'records':values,'total':len(values),'no_real_orders':True,
         'no_probability_claims':True,'archive_is_persistent':True,
         'source_note':'Forward-only observations of V4 WATCH candidates. 1M measures the first fully closed post-event minute, not an exact 60-second trade.',
         'refresh_note':'Manual browser refresh reloads this server-authored archive; only verified GitHub scans can append records.'}
    ledger={**out,'started_at':prior.get('started_at') or stamp(now_ms)}
    return ledger,out

def main():
    now_ms=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    life=v4_paper.read(ROOT/'archive'/'v4-lifecycle-ledger.json',{})
    forward=v4_paper.read(ROOT/'archive'/'v4-forward-ledger.json',{})
    board=v4_paper.read(DATA/'v4-radar.json',{})
    if not life.get('model_version','').startswith('4.0.0-') or not board.get('scan_id'):
        raise RuntimeError('V4 source absent: WATCH archive will not overwrite previous data')
    ledger,out=merge(v4_paper.read(ARCH,{}),life,forward,now_ms,board['scan_id'])
    v4_paper.save(ARCH,ledger)
    v4_paper.save(DATA/'v4-watch-archive.json',out)
    print('WATCH_ARCHIVE',out['total'],'scan',out['scan_id'],flush=True)
if __name__=='__main__':main()
