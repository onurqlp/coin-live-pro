#!/usr/bin/env python3
"""UzayX: archive observed research lessons only. Not a trading engine.
Runs daily against the existing V4 outputs and never modifies the original ledgers.
"""
import datetime as dt
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'web' / 'data'
DEST = DATA / 'uzayx-lessons-history.json'
WATCH = ('TÜMÜ','GELDI_OTOMATIK_GIRIS','LONG','SHORT','AŞAMA_1','AŞAMA_2','AŞAMA_3','RSI_4H_50_70','RSI_4H_30_50','BB_4H_SIKIŞMA')

def read(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))

def decimal(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
        return value
    return None

def summarize(manifest, review, spark, now):
    scan = manifest.get('scan_id')
    if not isinstance(scan, str) or scan != review.get('scan_id') or scan != spark.get('scan_id'):
        raise ValueError('SCAN_ID_MISMATCH: refuse to mix different snapshots')
    if manifest.get('publication_valid') is not True or manifest.get('no_real_orders') is not True:
        raise ValueError('UNVERIFIED_SOURCE: no learning publish')
    cohorts = review.get('cohorts') or {}
    stats = {}
    lessons = []
    for name in WATCH:
        c = cohorts.get(name)
        if not isinstance(c, dict):
            continue
        closed, pos, neg = (decimal(c.get(x)) for x in ('closed','positive','negative'))
        mean, net = (decimal(c.get(x)) for x in ('mean_net_per_closed_ticket_usdt','realized_total_usdt'))
        if closed is None or pos is None or neg is None or closed < 0 or pos + neg > closed:
            continue
        stats[name] = {
            'closed': closed, 'positive': pos, 'negative': neg,
            'positive_share_observed': round(pos / closed, 6) if closed else None,
            'mean_net_per_closed_ticket_usdt': mean, 'net_usdt': net,
            'independent_observations': False
        }
        if closed >= 30 and mean is not None and mean < 0:
            lessons.append({
                'cohort': name,
                'finding': 'NEGATIVE_HISTORICAL_AVERAGE',
                'proposal': 'COMPARE_ORIGINAL_MIRROR_AND_SKIP',
                'mirror_result': 'NO_FORWARD_BAR_REPLAY',
                'mirror_pnl_usdt': None,
                'auto_strategy_change': False
            })
    return {
        'day_utc': now.date().isoformat(),
        'recorded_at_utc': now.isoformat(),
        'source_scan_id': scan,
        'source_timestamp_utc': manifest.get('finished_at_utc'),
        'source_provider': manifest.get('provider'),
        'paper_live_orders': False,
        'sample_independence_verified': False,
        'inverse_replay_verified': False,
        'old_policy_modified': False,
        'cohort_statistics': stats,
        'research_lessons': lessons,
        'not_a_win_probability': True
    }

def main():
    now = dt.datetime.now(dt.timezone.utc)
    new = summarize(read('v4-manifest.json'),read('v4-spark-review.json'),read('v4-spark-paper.json'),now)
    archive = {'schema':'uzayx.lessons.archive.v1','records':[]}
    if DEST.exists():
        archive = json.loads(DEST.read_text(encoding='utf-8'))
        if archive.get('schema') != 'uzayx.lessons.archive.v1' or not isinstance(archive.get('records'), list):
            raise ValueError('UNRECOGNIZED_ARCHIVE: do not overwrite historical research')
    old = archive['records']
    if old and old[-1].get('day_utc') == new['day_utc']:
        # Keep the first complete daily record; no look-ahead rewriting.
        print('Lesson for this UTC day already archived; nothing to overwrite.')
        return
    if old and old[-1].get('day_utc','') > new['day_utc']:
        raise ValueError('CLOCK_REGRESSION: newer archived day exists')
    old.append(new)
    archive['records'] = old
    DEST.write_text(json.dumps(archive,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(f'UzayX archived UTC {new["day_utc"]}: {len(new["research_lessons"])} research hypotheses, '
          f'{len(new["cohort_statistics"])} cohorts. Live trading remains off.')

if __name__ == '__main__':
    main()
