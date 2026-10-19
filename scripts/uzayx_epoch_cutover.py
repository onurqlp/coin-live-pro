#!/usr/bin/env python3
"""One-time, forward-only UzayX paper-cash epoch transition.

The previous COMPLETE virtual books are copied byte-for-byte to an immutable
epoch directory before either current book is reset. The market workflow
commits the old snapshots and new books TOGETHER, or publishes neither.
Market research archives and lifecycle discovery journals are untouched.
"""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EPOCH = ROOT / 'config' / 'uzayx-paper-epoch.json'
SOURCES = {
    'spark-ledger': ROOT / 'archive' / 'v4-spark-paper-ledger.json',
    'v4-ledger': ROOT / 'archive' / 'v4-paper-ledger.json',
    'spark-public': ROOT / 'web' / 'data' / 'v4-spark-paper.json',
    'v4-public': ROOT / 'web' / 'data' / 'v4-paper.json',
}

def sha256(raw):
    return hashlib.sha256(raw).hexdigest()

def atomic(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.epoch-tmp')
    tmp.write_bytes(raw)
    os.replace(tmp, path)

def main(now=None):
    policy = json.loads(EPOCH.read_text(encoding='utf-8'))
    name = policy['epoch_id']
    if not name.startswith('uzayx-') or not all(c.isalnum() or c in '-_' for c in name):
        raise ValueError('Invalid epoch identifier')
    now = now or dt.datetime.now(dt.timezone.utc)
    now_ms = int(now.timestamp() * 1000)
    original = {key: path.read_bytes() for key, path in SOURCES.items()}
    docs = {key: json.loads(raw) for key, raw in original.items()}
    if docs['spark-ledger'].get('epoch_id') == name and docs['v4-ledger'].get('epoch_id') == name:
        print('UZAYX_EPOCH_ALREADY_ACTIVE', name)
        return False
    if docs['spark-ledger'].get('epoch_id') == name or docs['v4-ledger'].get('epoch_id') == name:
        raise RuntimeError('PARTIAL_EPOCH_CUTOVER: refuse')
    for key in ('spark-ledger', 'v4-ledger', 'spark-public', 'v4-public'):
        if not isinstance(docs[key], dict):
            raise RuntimeError('Unrecognized previous paper ledger')
    if docs['spark-ledger'].get('no_real_orders') is not True or docs['v4-ledger'].get('no_real_orders') is not True:
        raise RuntimeError('Refusing non-paper migration')
    tickets = docs['spark-ledger'].get('tickets')
    if not isinstance(tickets, list) or len(tickets) != docs['spark-public'].get('all_events_count'):
        raise RuntimeError('Old ledger/public count mismatch')
    archive_dir = ROOT / 'archive' / 'epochs' / name
    checkpoint_path = archive_dir / 'checkpoint.json'
    if checkpoint_path.exists():
        raise RuntimeError('Epoch snapshot already exists but live books were not both advanced')
    archive_dir.mkdir(parents=True, exist_ok=False)
    digests = {}
    for key, raw in original.items():
        dest = archive_dir / (key + '.json')
        # Never replace a checkpointed historical book.
        with dest.open('xb') as stream:
            stream.write(raw)
        if dest.read_bytes() != raw:
            raise RuntimeError('Epoch archive write verification failed: ' + key)
        digests[key] = sha256(raw)
    checkpoint = {
        'schema': 'uzayx.paper.cutover.v1', 'epoch_id': name,
        'cutover_at_utc': now.isoformat(), 'cutover_ms': now_ms,
        'archived_sha256': digests,
        'previous_all_events_count': len(tickets),
        'previous_v4_order_count': len(docs['v4-ledger'].get('orders', {})),
        'previous_ledger_epoch': docs['spark-ledger'].get('epoch_id'),
        'new_entries_forward_only': True,
        'previous_positions_not_claimed_closed': True,
        'real_orders': False,
    }
    atomic(checkpoint_path, (json.dumps(checkpoint, indent=2, ensure_ascii=False) + '\n').encode())
    # Only now touch active books. Both are atomically replaced within this job.
    import sys
    sys.path.insert(0, str(ROOT / 'engine'))
    import v4_spark_paper as spark
    import v4_paper
    main_policy = v4_paper.read(ROOT / 'config' / 'v4-policy.json', {})
    sp = spark.initial(now_ms)
    sp.update(epoch_id=name, epoch_cutoff_ms=now_ms, cutover_at_utc=now.isoformat(),
              archive_checkpoint='archive/epochs/' + name + '/checkpoint.json')
    v4 = v4_paper.new_account(now_ms, main_policy)
    v4.update(epoch_id=name, epoch_cutoff_ms=now_ms, cutover_at_utc=now.isoformat(),
              archive_checkpoint=sp['archive_checkpoint'])
    v4_paper.save(SOURCES['spark-ledger'], sp)
    v4_paper.save(SOURCES['v4-ledger'], v4)
    print('UZAYX_EPOCH_STARTED', name, 'archived', len(tickets), 'old spark events,',
          len(docs['v4-ledger'].get('orders', {})), 'old V4 orders; active cash zeroed')
    return True

if __name__ == '__main__':
    main()
