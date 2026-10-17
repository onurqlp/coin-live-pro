#!/usr/bin/env python3
"""Verified single-scan V4 manifest, with sha256 of every published JSON.

The JS reader must check scan-id equality and stale age before presenting live
lifecycle stages. Browser real-time quotes NEVER modify this server manifest.
"""
import datetime as dt
import hashlib
import json
import pathlib
import v4_paper

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web'/'data'
SOURCES=['market','mtf','swing-radar','v4-oi','v4-radar','v4-history-index','v4-paper','v4-shadow','v4-forward','v4-watch-archive','v4-early','v4-context','v4-lab','health']
VERSION='4.0.0-manifest-a1'

def produce(now_ms=None):
    now_ms=now_ms or int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    files={}
    data={}
    for name in SOURCES:
        path=DATA/(name+'.json')
        raw=path.read_bytes()
        obj=json.loads(raw)
        data[name]=obj
        files[name]={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),
                     'model_version':obj.get('model_version')}
    m=data['mtf'];s=data['swing-radar'];v=data['v4-radar']
    if m.get('fetched_at')!=s.get('source_mtf_at') or v.get('source_mtf_at')!=m.get('fetched_at'):
        raise RuntimeError('Mixed market round. Refuse V4 publication.')
    if any(data[key].get('scan_id')!=v.get('scan_id') for key in ('v4-history-index','v4-paper','v4-shadow','v4-forward','v4-watch-archive','v4-early','v4-lab')):
        raise RuntimeError('V4 producer scan ids differ: NO PUBLISH')
    if data['v4-oi'].get('source_mtf_at')!=m.get('fetched_at'):
        raise RuntimeError('OI timestamp is from another scan')
    for k in ('market','mtf','swing-radar','v4-oi','v4-radar','v4-history-index','v4-paper','v4-shadow','v4-forward','v4-watch-archive','v4-early','v4-context','v4-lab','health'):
        obj=data[k]
        field='fetched_at' if k in ('market','mtf','swing-radar') else 'updated_at'
        try:ms=int(dt.datetime.fromisoformat(obj[field]).timestamp()*1000)
        except (TypeError,ValueError,KeyError):raise RuntimeError(k+' missing timestamp')
        if not -120000<=now_ms-ms<=480000:
            raise RuntimeError(k+' stale '+str(now_ms-ms))
    if not data['v4-watch-archive'].get('archive_is_persistent'):
        raise RuntimeError('WATCH archive missing or incomplete')
    if (data['v4-early'].get('research_only') is not True or
        data['v4-early'].get('no_paper_entries') is not True or
        data['v4-early'].get('no_real_orders') is not True):
        raise RuntimeError('Unverified early research became a trade signal')
    if data['v4-context'].get('score_not_used_for_paper_or_v4_stage') is not True:
        raise RuntimeError('Unverified news affected V4 trading policy')
    if data['v4-paper'].get('starting_balance_usdt')!=10000 or not data['v4-paper'].get('no_real_orders'):
        raise RuntimeError('Invalid isolated V4 paper account')
    if data['v4-shadow'].get('combined_with_main_cash') is not False:
        raise RuntimeError('Shadow is incorrectly mixed into the paper account')
    return {'model_version':VERSION,'scan_id':v['scan_id'],
        'policy_version':v['policy_version'],
        'started_at_utc':m['fetched_at'],
        'finished_at_utc':dt.datetime.fromtimestamp(now_ms/1000,dt.timezone.utc).isoformat(),
        'trigger':data['health'].get('last_trigger'),'sources':files,
        'candidate_counts':{'market_pairs':len(data['market'].get('rows',[])),'attempted':m.get('attempted'),'verified':m.get('analyzed'),
                            'v4':v.get('counts')},
        'provider':'OKX','publication_valid':True,
        'no_real_orders':True,
        'note':'Hash provenance of individual JSON. GitHub cron is best-effort; no guarantee of continuous 5m schedule.'}

def main():
    result=produce()
    v4_paper.save(DATA/'v4-manifest.json',result)
    print('V4 MANIFEST',result['scan_id'],'files',len(result['sources']),flush=True)

if __name__=='__main__':main()
