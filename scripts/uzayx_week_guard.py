#!/usr/bin/env python3
"""Seven-day data continuity guard for UzayX read-only research archives.

Run baseline before an OKX collection and verify after all JSONs are produced.
Fail the publication if paper counters regress or ledger/public scan IDs diverge.
Never write a market, archive, trade or strategy file.
"""
import hashlib
import json
import os
import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "data"
BASE = pathlib.Path(os.environ.get("RUNNER_TEMP", tempfile.gettempdir())) / "uzayx-week-baseline.json"


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def positive_count(value, name):
    if type(value) is not int or value < 0:
        raise ValueError("Invalid nonnegative counter: " + name)
    return value


def validate(spark, manifest=None, paper=None, watch=None):
    if spark.get("no_real_orders") is not True or spark.get("archive_is_persistent") is not True:
        raise ValueError("Virtual ledger or persistence contract is missing")
    if spark.get("open_positions_complete") is not True:
        raise ValueError("Full open position ledger missing; refuse partial publication")
    counts = spark.get("summary", {}).get("counts", {})
    if not isinstance(counts, dict) or not {"OPEN", "CLOSED", "WAITING_FUTURE_BAR"} <= counts.keys():
        raise ValueError("Missing paper state counters")
    total = positive_count(spark.get("all_events_count"), "all_events_count")
    if sum(positive_count(n, k) for k, n in counts.items()) != total:
        raise ValueError("Paper state totals do not equal event count")
    opens = spark.get("open_positions")
    if not isinstance(opens, list) or len(opens) != counts["OPEN"]:
        raise ValueError("Open position count or complete-list proof mismatched")
    ids = [row.get("event_id") for row in opens]
    if not all(isinstance(i, str) and i for i in ids) or len(set(ids)) != len(ids):
        raise ValueError("Duplicate/invalid open position IDs")
    if any(row.get("status") != "OPEN" or row.get("is_real_trade") is True for row in opens):
        raise ValueError("Open positions contain invalid states or real trades")
    for row in spark.get("recent_tickets", []):
        if row.get("is_real_trade") is True:
            raise ValueError("Real trade record entered virtual ticket feed")
    if manifest is not None:
        scan = manifest.get("scan_id")
        if (not scan or manifest.get("publication_valid") is not True
                or manifest.get("no_real_orders") is not True
                or spark.get("scan_id") != scan
                or not paper or paper.get("scan_id") != scan
                or paper.get("no_real_orders") is not True):
            raise ValueError("Mixed or unverified market/paper scan")
    if watch is not None:
        if watch.get("archive_is_persistent") is not True or watch.get("no_real_orders") is not True:
            raise ValueError("Watch-history persistence contract missing")
        if watch.get("total") != len(watch.get("records", [])):
            raise ValueError("Watch archive count disagrees with records")
        if manifest is not None and watch.get("scan_id") != manifest.get("scan_id"):
            raise ValueError("Watch archive scan mismatch")
    return {"all": total, "closed": counts["CLOSED"], "watch": watch.get("total") if watch else None}


def verify_counters(before, after):
    for key in ("all", "closed", "watch"):
        if before.get(key) is not None and after.get(key) is not None and after[key] < before[key]:
            raise ValueError("HISTORICAL_DATA_REGRESSION: %s %s -> %s" %
                             (key, before[key], after[key]))
    if after["closed"] > after["all"]:
        raise ValueError("Closed events exceed all events")
    return True


def run(mode):
    if mode == "baseline":
        spark = load("v4-spark-paper.json")
        result = validate(spark, watch=load("v4-watch-archive.json"))
        result['epoch_id'] = spark.get('epoch_id')
        BASE.write_text(json.dumps(result), encoding="utf-8")
        print("UZAYX_WEEK_BASELINE", result)
    elif mode == "verify":
        before = json.loads(BASE.read_text(encoding="utf-8"))
        manifest, paper = load("v4-manifest.json"), load("v4-paper.json")
        spark = load("v4-spark-paper.json")
        after = validate(spark, manifest, paper, load("v4-watch-archive.json"))
        after['epoch_id'] = spark.get('epoch_id')
        if before.get('epoch_id') != after['epoch_id']:
            # Allow one explicit epoch rollover ONLY after all prior cashbooks
            # have been byte-perfect archived in the same publication commit.
            name = after['epoch_id']
            config = json.loads((ROOT / 'config/uzayx-paper-epoch.json').read_text())
            if not name or name != config['epoch_id'] or paper.get('epoch_id') != name:
                raise ValueError('UNAUTHORIZED_PAPER_EPOCH_RESET')
            folder = ROOT / 'archive/epochs' / name
            cp = json.loads((folder / 'checkpoint.json').read_text())
            if cp.get('epoch_id') != name or cp.get('previous_all_events_count') != before['all'] or cp.get('previous_ledger_epoch') != before.get('epoch_id'):
                raise ValueError('PAPER_RESET_ARCHIVE_COUNTER_MISMATCH')
            for key in ('spark-ledger', 'v4-ledger', 'spark-public', 'v4-public'):
                raw = (folder / (key + '.json')).read_bytes()
                if hashlib.sha256(raw).hexdigest() != cp['archived_sha256'][key]:
                    raise ValueError('PAPER_RESET_ARCHIVE_SHA_MISMATCH: '+key)
            old = json.loads((folder / 'spark-public.json').read_text())
            if old.get('all_events_count') != before['all'] or old.get('summary',{}).get('counts',{}).get('CLOSED') != before['closed']:
                raise ValueError('PAPER_RESET_OLD_BOOK_MISMATCH')
            if after['watch'] is not None and before.get('watch') is not None and after['watch'] < before['watch']:
                raise ValueError('WATCH_RESEARCH_ARCHIVE_REGRESSION')
            print('UZAYX_AUDITED_NEW_CASH_EPOCH', name, 'archived prior count', before['all'])
        else:
            verify_counters(before, after)
        print("UZAYX_WEEK_CONTINUITY_OK", after)
    else:
        raise ValueError("Expected baseline or verify")


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else "")
