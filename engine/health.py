#!/usr/bin/env python3
"""Forward-only scan audit; schedule evidence is read from actual GitHub event."""
import datetime as dt
import hashlib
import json
import os
import pathlib

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web'/'data'
ARCH=ROOT/'archive'/'scan-health.json'
NOW=dt.datetime.now(dt.timezone.utc)
UTC=NOW.isoformat(timespec='seconds')
def load(p,default):
    try:return json.loads(p.read_text(encoding='utf8'))
    except (OSError,ValueError):return default
def dump(p,doc):
    p.parent.mkdir(exist_ok=True,parents=True)
    tmp=p.with_suffix(p.suffix+'.tmp')
    tmp.write_text(json.dumps(doc,ensure_ascii=False,allow_nan=False,separators=(',',':')),encoding='utf8')
    tmp.replace(p)
def slots_between(start,stop):
    if not start:return 0
    a=dt.datetime.fromisoformat(start)
    t=a.replace(minute=0,second=0,microsecond=0)
    count=0
    while t<stop:
        for minute in (7,22,37,52):
            when=t+dt.timedelta(minutes=minute)
            if a<when<=stop:count+=1
        t+=dt.timedelta(hours=1)
        if count>10000:break
    return count
def main():
    market=load(DATA/'market.json',{})
    mtf=load(DATA/'mtf.json',{})
    paper=load(DATA/'paper.json',{})
    if not market.get('fetched_at') or not paper.get('updated_at') or not mtf.get('fetched_at'):
        raise RuntimeError('Incomplete central pilot modules')
    h=load(ARCH,{'schema_version':2,'records':[]})
    previous=h['records'][-1] if h['records'] else None
    last=previous['completed_at'] if previous else None
    missed=max(0,slots_between(last,NOW)-1) if last else None
    event=os.getenv('GITHUB_EVENT_NAME','UNKNOWN')
    run_id=os.getenv('GITHUB_RUN_ID','LOCAL')
    quality= 'OK'
    failed=max(0,int(market.get('analysis_attempted',0))-int(market.get('analysis_ok',0)))
    if failed>int(market.get('analysis_attempted',0))*.40:quality='DEGRADED_COVERAGE'
    if missed is not None and missed>=1:quality='DEGRADED_SCHEDULE_GAP'
    record={'completed_at':UTC,'trigger':event,'run_id':run_id,
       'scan_id':hashlib.sha256((UTC+'|'+run_id+'|'+market.get('fetched_at','')).encode()).hexdigest()[:20],
       'model_version':mtf.get('model_version'),
       'attempted':market.get('analysis_attempted',market.get('analyzed')),
       'successful_3tf':market.get('analysis_ok',market.get('analyzed')),
       'mtf_attempted':mtf.get('attempted'),'mtf_verified':mtf.get('analyzed'),
       'missed_cron_slots_since_previous_success':missed,'quality':quality}
    h['records'].append(record)
    h['records']=[r for r in h['records'] if (NOW-dt.datetime.fromisoformat(r['completed_at'])).days<=90]
    schedules=sum(r['trigger']=='schedule' for r in h['records'])
    report={'updated_at':UTC,'status':quality,'last_trigger':event,'last_scan_id':record['scan_id'],
       'records_total':len(h['records']),'observed_real_scheduled_runs':schedules,
       'schedule_proven':schedules>=2,
       'attempted':record['attempted'],'successful_3tf':record['successful_3tf'],
       'mtf_attempted':record['mtf_attempted'],'mtf_verified':record['mtf_verified'],
       'missed_slots_latest':missed,'cron_utc_minutes':[7,22,37,52],
       'note':'GitHub schedule is best effort: no guaranteed 24/7 exact-time execution. Browser reading never starts server scans.',
       'pilot_started_at':paper.get('pilot_started_at'),'models':{'macro':mtf.get('model_version'),'paper':paper.get('model_version')},
       'recent_runs':h['records'][-24:]}
    dump(ARCH,h);dump(DATA/'health.json',report)
    print(f'HEALTH utc={UTC} trigger={event} scheduled_runs={schedules} missed={missed} status={quality}',flush=True)
if __name__=='__main__':main()
