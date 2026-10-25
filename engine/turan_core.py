#!/usr/bin/env python3
"""TURAN CORE: independent, read-only evidence index and persistent learning journal.

Consumes existing UZAYX research and paper reports. Never creates orders, alters
cash, rewrites model policy, or touches Google integrations.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import gzip
import json
import pathlib
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "data"
OUTPUT = DATA / "turan-core.json"
JOURNAL = ROOT / "archive" / "turan-core-journal.jsonl"
EXPECTED_TURAN_IDS = {f"T{i:03}" for i in range(1, 201)}
CYCLE_STATUSES = {"SIGNAL", "NO_SIGNAL", "BLOCKED_SOURCE", "CONTROL_RESEARCH_ONLY"}


def load(path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def atomic_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    target = path.with_suffix(path.suffix + ".tmp")
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")
    target.replace(path)


def valid_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and float("-inf") < value < float("inf")


def paper_cash_evidence(pnl, scan_id):
    """Return a reconciled, same-scan research ledger summary; never real PnL."""
    if not isinstance(pnl, dict) or not isinstance(scan_id, str):
        return None
    if (pnl.get("schema") != "uzayx.pnl.ledger.v1" or pnl.get("scan_id") != scan_id or
            pnl.get("source") != "OKX_MODELLED_PAPER_LEDGER" or
            pnl.get("not_realized_exchange_pnl") is not True or
            pnl.get("historical_research_is_not_executed_cash") is not True or
            pnl.get("no_real_orders") is not True or pnl.get("reconciled") is not True):
        return None
    numeric = ("starting_usdt", "equity_usdt", "realized_usdt", "unrealized_usdt", "total_pnl_usdt")
    if not all(valid_number(pnl.get(key)) for key in numeric):
        return None
    counts = ("open_count", "closed_count")
    if not all(isinstance(pnl.get(key), int) and not isinstance(pnl.get(key), bool) and pnl[key] >= 0 for key in counts):
        return None
    fees = pnl.get("fees_estimated_usdt")
    if fees is not None and not valid_number(fees):
        return None
    return {
        "scan_id": scan_id,
        "source": pnl["source"],
        "source_at_utc": pnl.get("source_at_utc"),
        "reconciled": True,
        "no_real_orders": True,
        "starting_usdt": pnl["starting_usdt"],
        "equity_usdt": pnl["equity_usdt"],
        "realized_usdt": pnl["realized_usdt"],
        "unrealized_usdt": pnl["unrealized_usdt"],
        "total_pnl_usdt": pnl["total_pnl_usdt"],
        "fees_estimated_usdt": fees,
        "open_count": pnl["open_count"],
        "closed_count": pnl["closed_count"],
        "funding": pnl.get("funding", "UNKNOWN"),
        "liquidation": pnl.get("liquidation", "UNKNOWN"),
        "independent_profit_verified": False,
    }


def source_age(reference, now):
    if not reference:
        return None
    try:
        stamp = dt.datetime.fromisoformat(str(reference).replace("Z", "+00:00"))
        return round((now - stamp).total_seconds() / 60, 1)
    except (ValueError, TypeError):
        return None


def summarize_observations(events, registry=None):
    by_strategy = defaultdict(lambda: {"events": 0, "observed_1h": 0, "positive_1h": 0, "negative_1h": 0, "sum_direction_pct": 0.0})
    for event in events:
        if not isinstance(event, dict):
            continue
        sid = event.get("strategy_id")
        if not isinstance(sid, str) or not sid.startswith("T"):
            continue
        if registry is not None:
            rule=registry.get(sid,{})
            if (event.get('strategy_version')!=rule.get('strategy_version') or
                event.get('config_hash')!=rule.get('strategy_config_hash') or
                event.get('source_venue')!='OKX'):
                continue
        record = by_strategy[sid]
        record["events"] += 1
        horizon = event.get("horizons", {}).get("1H", {})
        change = horizon.get("close_direction_pct")
        if horizon.get("state") == "OBSERVED" and valid_number(change):
            record["observed_1h"] += 1
            record["positive_1h"] += int(change > 0)
            record["negative_1h"] += int(change < 0)
            record["sum_direction_pct"] += change
    return {sid: {**{k: v for k, v in values.items() if k != "sum_direction_pct"},
                  "mean_direction_1h_pct": round(values["sum_direction_pct"] / values["observed_1h"], 4)
                  if values["observed_1h"] else None}
            for sid, values in by_strategy.items()}


def read_journal(path):
    if not path.exists():
        return [], set()
    entries = []
    ids = set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        try:
            entry = json.loads(raw)
            if isinstance(entry, dict) and isinstance(entry.get("scan_id"), str):
                entries.append(entry)
                ids.add(entry["scan_id"])
        except ValueError:
            pass
    return entries, ids


def validate_cycle_evaluations(rows, summary):
    """Fail closed unless this cycle contains one valid record for every T001-T200."""
    if not isinstance(rows, list) or not isinstance(summary, dict):
        raise ValueError("TURAN_CYCLE_COVERAGE_INVALID: missing rows or summary")
    ids = [row.get("strategy_id") for row in rows if isinstance(row, dict)]
    counts = defaultdict(int)
    for sid in ids:
        if isinstance(sid, str):
            counts[sid] += 1
    duplicates = sorted(sid for sid, count in counts.items() if count > 1)
    observed = set(counts)
    missing = sorted(EXPECTED_TURAN_IDS - observed)
    unexpected = sorted(str(sid) for sid in observed - EXPECTED_TURAN_IDS)
    status_counts = defaultdict(int)
    invalid_rows = []
    for row in rows:
        if not isinstance(row, dict):
            invalid_rows.append("NON_OBJECT_ROW")
            continue
        sid = row.get("strategy_id")
        status = row.get("status")
        if (not isinstance(sid, str) or not isinstance(status, str) or status not in CYCLE_STATUSES
                or not row.get("evaluation_id") or not row.get("run_id")):
            invalid_rows.append(str(sid or "UNKNOWN"))
        if isinstance(status, str) and status in CYCLE_STATUSES:
            status_counts[status] += 1
    summary_ok = (
        summary.get("expected_count") == 200 and
        summary.get("checked_count") == 200 and
        summary.get("record_count") == 200 and
        summary.get("missing_count") == 0 and
        summary.get("missing_ids") == [] and
        summary.get("all_ids_present") is True and
        summary.get("no_real_orders") is True and
        summary.get("status_counts") == dict(status_counts)
    )
    if len(rows) != 200 or duplicates or missing or unexpected or invalid_rows or not summary_ok:
        raise ValueError("TURAN_CYCLE_COVERAGE_INVALID: " + repr({
            "records": len(rows), "duplicates": duplicates, "missing": missing,
            "unexpected": unexpected, "invalid_rows": invalid_rows,
            "summary_consistent": summary_ok,
        }))
    return {"verified": True, "expected_count": 200, "checked_count": 200,
            "missing_count": 0, "status_counts": dict(status_counts)}


def build(root=ROOT, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    data = root / "web" / "data"
    manifest = load(data / "v4-manifest.json", {})
    bank = load(data / "uzayx-strategy-bank.json", {})
    research = load(data / "uzayx-research.json", {})
    adaptive = load(data / "uzayx-adaptive.json", {})
    pnl = load(data / "uzayx-pnl-report.json", {})
    coverage = load(data / "uzayx-binance-coverage.json", {})
    replay = load(data / "turan-replay.json", {})
    experiments = load(data / "turan-experiments.json", {})
    registry = load(root / "web" / "uzayx" / "turan-registry.json", {})
    ledger = load(root / "archive" / "uzayx-research-ledger.json", {})
    source_events = ledger.get("events", []) if isinstance(ledger, dict) else []
    if not isinstance(source_events, list):
        source_events = []
    if not manifest.get("scan_id") or manifest.get("publication_valid") is not True:
        raise ValueError("TURAN_SOURCE_MANIFEST_UNVERIFIED")
    scan_id = manifest["scan_id"]
    aligned = {
        "research": research.get("scan_id") == scan_id,
        "adaptive": adaptive.get("scan_id") == scan_id,
        "pnl": pnl.get("scan_id") == scan_id,
        "bank": bank.get("no_real_orders") is True and bank.get("registry_count") == 200,
    }
    if not all(aligned.values()):
        raise ValueError("TURAN_SOURCE_SCAN_MISMATCH: " + repr(aligned))
    if experiments and (experiments.get('scan_id')!=scan_id or
            experiments.get('no_real_orders') is not True or
            experiments.get('separate_from_shared_cash') is not True):
        raise ValueError('TURAN_EXPERIMENT_SCAN_MISMATCH')
    experiment_by_id={s['strategy_id']:s for s in experiments.get('strategies',[])}
    if registry.get("schema") != "turan.unified_registry.v1" or len(registry.get("entries", [])) != 230:
        raise ValueError("TURAN_REGISTRY_INVALID")

    cycle_summary = bank.get("evaluation_summary", {})
    cycle_rows = bank.get("cycle_evaluations", [])
    if not isinstance(cycle_rows, list):
        cycle_rows = []
    cycle_integrity = validate_cycle_evaluations(cycle_rows, cycle_summary)
    cycle_by_id = {x.get("strategy_id"): x for x in cycle_rows if isinstance(x, dict)}
    active_rules={s['id']:s for s in bank.get('registry',[])}
    metrics = summarize_observations(source_events, active_rules)
    paper = {s["id"]: s for s in pnl.get("strategies", []) if isinstance(s, dict) and isinstance(s.get("id"), str)}
    details = {s["id"]: s for s in bank.get("registry", []) if isinstance(s, dict) and isinstance(s.get("id"), str)}
    strategies = []
    for item in registry["entries"]:
        sid = item["id"]
        source = details.get(sid, {})
        historical_cash = paper.get(sid, {})
        cash_cohorts=[c for c in pnl.get('attribution',{}).get('cohorts',[]) if
            c.get('strategy_id')==sid and c.get('strategy_version')==source.get('strategy_version') and
            c.get('strategy_config_hash')==source.get('strategy_config_hash') and c.get('exchange')=='OKX']
        cash={'closed':sum(c['closed'] for c in cash_cohorts),'open':sum(c['open'] for c in cash_cohorts),
            'realized':sum(c['realized_usdt'] for c in cash_cohorts) if cash_cohorts else None,
            'unrealized':sum(c['unrealized_usdt'] for c in cash_cohorts) if cash_cohorts else None}
        m = metrics.get(sid, {})
        strategies.append({
            "id": sid,
            "name": item.get("name", sid),
            "family": source.get("category") or item.get("family") or "ÖNCEKİ ARAŞTIRMA",
            "role": source.get("role") or "LEGACY_RESEARCH",
            "state": source.get("state") or "RESEARCH_ONLY",
            "required_source": source.get("required_source") or cash.get("required_source"),
            "evaluated_candidates": source.get("evaluated_candidates", 0),
            "historical_paper": historical_cash,
            "cash_cohorts": cash_cohorts,
            "attribution": pnl.get('attribution',{}).get('by_strategy',{}).get(sid),
            "experiment": experiment_by_id.get(sid),
            "last_cycle_evaluation": ({
                "status": cycle_by_id[sid].get("status"),
                "evaluation_id": cycle_by_id[sid].get("evaluation_id"),
                "run_id": cycle_by_id[sid].get("run_id"),
                "workflow_run_id": cycle_by_id[sid].get("workflow_run_id"),
                "candidate_count": cycle_by_id[sid].get("candidate_count", 0),
                "signal_count": len(cycle_by_id[sid].get("signal_ids", [])),
                "block_reason": cycle_by_id[sid].get("block_reason"),
                "evaluated_at_utc": cycle_by_id[sid].get("evaluated_at_utc"),
                "snapshot_id": cycle_by_id[sid].get("snapshot_id"),
                "source_available_at": cycle_by_id[sid].get("source_available_at"),
            } if sid in cycle_by_id else None),
            "strategy_version": source.get("strategy_version"),
            "rules_hash": source.get("strategy_config_hash"),
            "observation_scope": "CURRENT_RULE_VERSION_ONLY",
            "research_events": m.get("events", 0),
            "observed_1h": m.get("observed_1h", 0),
            "positive_1h": m.get("positive_1h", 0),
            "negative_1h": m.get("negative_1h", 0),
            "mean_direction_1h_pct": m.get("mean_direction_1h_pct"),
            "paper_closed": cash.get("closed", 0),
            "paper_open": cash.get("open", 0),
            "paper_realized_usdt": cash.get("realized") if valid_number(cash.get("realized")) else None,
            "paper_unrealized_usdt": cash.get("unrealized") if valid_number(cash.get("unrealized")) else None,
            "independent_profit_verified": cash.get("positive_expectancy_verified") is True,
        })
    ranked = sorted(strategies, key=lambda x: (x["paper_closed"] > 0,
                                                  x["observed_1h"], x["research_events"]), reverse=True)
    validation = adaptive.get("current_model", {}).get("validation", {})
    case_list = []
    for event in sorted(source_events, key=lambda x: x.get("observed_at_utc", ""), reverse=True)[:90]:
        h = event.get("horizons", {}).get("1H", {})
        case_list.append({
            "event_id": event.get("event_id"),
            "parent_event_id": event.get("parent_event_id"),
            "symbol": event.get("symbol"),
            "side": event.get("side"),
            "strategy_id": event.get("strategy_id"),
            "observed_at_utc": event.get("observed_at_utc"),
            "horizon_1h_state": h.get("state", "UNAVAILABLE"),
            "direction_1h_pct": h.get("close_direction_pct") if h.get("state") == "OBSERVED" else None,
        })
    sources = [
        {"id": "okx_market", "name": "OKX piyasa taraması", "status": "SCANNED", "observed_at": bank.get("source_market_at"),
         "age_minutes": source_age(bank.get("source_market_at"), now)},
        {"id": "binance_history", "name": "Binance geçmiş arşivi",
         "status": coverage.get("research_state", "UNAVAILABLE"), "observed_at": coverage.get("source_updated_at_utc"),
         "age_minutes": source_age(coverage.get("source_updated_at_utc"), now)},
        {"id": "orderbook_history", "name": "Emir defteri geçmişi", "status": coverage.get("orderbook_history", "NOT_COLLECTED")},
        {"id": "open_interest_history", "name": "OI geçmiş arşivi", "status": coverage.get("open_interest", "NOT_COLLECTED")},
        {"id": "funding_history", "name": "Funding geçmiş arşivi", "status": coverage.get("funding", "NOT_COLLECTED")},
    ]
    report = {
        "schema": "turan.core.v1",
        "generated_at_utc": now.isoformat(),
        "source_scan_id": scan_id,
        "source_alignment": aligned,
        "cycle_evaluation": {
            **cycle_integrity,
            "run_id": cycle_summary.get("run_id"),
            "workflow_run_id": cycle_summary.get("workflow_run_id"),
            "checked_count": cycle_summary.get("checked_count"),
            "expected_count": cycle_summary.get("expected_count"),
            "missing_count": cycle_summary.get("missing_count"),
            "missing_ids": cycle_summary.get("missing_ids", []),
            "data_ready_count": cycle_summary.get("data_ready_count"),
            "rule_evaluated_count": cycle_summary.get("rule_evaluated_count"),
            "status_counts": cycle_summary.get("status_counts", {}),
            "last_cycle_evaluation_present": len(cycle_rows) == 200,
        },
        "rule_version": bank.get("model_version"),
        "replay": replay if replay.get("schema")=="turan.replay.v1" and replay.get("no_real_orders") is True else None,
        "paper_evidence": paper_cash_evidence(pnl, scan_id),
        "attribution": pnl.get('attribution'),
        "experiments": {k:v for k,v in experiments.items() if k not in ('strategies','recent_experiments')},
        "research_only": True,
        "observation_version_policy": "CURRENT_EXACT_VERSION_HASH_VENUE_ONLY",
        "historical_observations_preserved": len(source_events),
        "no_real_orders": True,
        "no_cash_policy_change": True,
        "google_untouched": True,
        "totals": {
            "registered": len(strategies),
            "bank": bank.get("registry_count"),
            "cycle_checked_count": cycle_summary.get("checked_count"),
            "cycle_missing_count": cycle_summary.get("missing_count"),
            "cycle_missing_ids": cycle_summary.get("missing_ids", []),
            "cycle_data_ready_count": cycle_summary.get("data_ready_count"),
            "cycle_rule_evaluated_count": cycle_summary.get("rule_evaluated_count"),
            "cycle_status_counts": cycle_summary.get("status_counts", {}),
            "roles": bank.get("role_counts", {}),
            "states": bank.get("state_counts", {}),
            "research_events": len(source_events),
            "paper_with_closed": sum(s["paper_closed"] > 0 for s in strategies),
            "verified_profitable": sum(s["independent_profit_verified"] for s in strategies),
            "prospective_predictions": adaptive.get("prospective_predictions"),
            "settled_predictions": adaptive.get("settled_predictions"),
            "independent_episodes": adaptive.get("source_audit", {}).get("independent_coin_episodes"),
            "binance_verified_1h_bars": coverage.get("verified_1h_bars"),
        },
        "learning_quality": adaptive.get("forecast_quality"),
        "direction_evaluation": bank.get("direction_evaluation"),
        "learning": {
            "model_id": adaptive.get("current_model_id"),
            "trained_at_utc": adaptive.get("current_model", {}).get("trained_at_utc"),
            "prospective_mae_pct": adaptive.get("prospective_mean_absolute_error_pct"),
            "validation_span_days": validation.get("span_days"),
            "validation_blocks": validation.get("blocks", []),
            "shadow_champion": validation.get("shadow_champion"),
            "requires_forward_validation": True,
            "auto_trade_policy_mutation": False,
        },
        "contest": {
            "provisional_winners": bank.get("strategy_contest", {}).get("provisional_winners", []),
            "selection_requires_days": bank.get("strategy_contest", {}).get("selection_requires_days"),
            "selection_requires_primary_closed": bank.get("strategy_contest", {}).get("selection_requires_primary_closed"),
            "net_real_money_pnl": None,
            "inverse_net_pnl": bank.get("strategy_contest", {}).get("inverse_pnl_pct"),
        },
        "sources": sources,
        "strategies": strategies,
        "priority_strategy_ids": [s["id"] for s in ranked[:30]],
        "recent_cases": case_list,
        "notes": [
            "200 bank entries + 30 legacy entries are not 230 independently profitable strategies.",
            "1H directional observations are not executable fill PNL.",
            "Forward shadow tests and missing funding/orderbook costs restrict profit claims.",
            "Historical source coverage is partial and must not be presented as complete."
        ],
    }
    return report


def archive_cycle(root, record):
    # A retry may run after UTC midnight. Bucket by immutable source time,
    # never by retry/observation time, so the same scan keeps one archive.
    source_time=record.get('source_mtf_at')
    try:
        stamp=dt.datetime.fromisoformat(str(source_time).replace('Z','+00:00'))
        day=stamp.astimezone(dt.timezone.utc).date().isoformat() if stamp.tzinfo else 'undated'
    except ValueError:
        day='undated'
    relative='archive/turan-cycles/'+day+'.jsonl.gz'
    path=root/relative
    immutable={k:v for k,v in record.items() if k!='at_utc'}
    if path.exists():
        with gzip.open(path,'rt',encoding='utf8') as archive:
            for raw in archive:
                old=json.loads(raw)
                if old.get('scan_id')==record['scan_id']:
                    if {k:v for k,v in old.items() if k!='at_utc'}!=immutable:
                        raise ValueError('TURAN_IMMUTABLE_CYCLE_CONFLICT')
                    return dict(path=relative,sha256=hashlib.sha256(raw.encode()).hexdigest())
    raw=json.dumps(record,ensure_ascii=False,separators=(',',':')).encode()+b'\n'
    path.parent.mkdir(parents=True,exist_ok=True)
    with gzip.open(path,'ab') as archive:archive.write(raw)
    return dict(path=relative,sha256=hashlib.sha256(raw).hexdigest())


def run(root=ROOT, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    out = root / "web" / "data" / "turan-core.json"
    journal = root / "archive" / "turan-core-journal.jsonl"
    report = build(root=root, now=now)
    entries, ids = read_journal(journal)
    prior_count = entries[-1].get("source_event_count", 0) if entries else report["totals"]["research_events"]
    event_count = report["totals"]["research_events"]
    report["journal"] = {
        "first_recorded_at_utc": entries[0]["at_utc"] if entries else now.isoformat(),
        "recorded_scans": len(entries) + (report["source_scan_id"] not in ids),
        "previous_source_event_count": prior_count,
        "new_source_events_since_last_scan": max(0, event_count - prior_count),
        "source_event_regression": event_count < prior_count,
        "journal_append_only": True,
    }
    atomic_json(out, report)
    if report["source_scan_id"] not in ids:
        journal.parent.mkdir(parents=True, exist_ok=True)
        # Preserve all 200 evaluation records without duplicating OHLC snapshots.
        bank=load(root/'web/data/uzayx-strategy-bank.json',{})
        cycle_record=dict(scan_id=report['source_scan_id'],at_utc=now.isoformat(),
            snapshot_id=bank.get('snapshot_id'),source_mtf_at=bank.get('source_mtf_at'),
            evaluations=bank.get('cycle_evaluations',[]))
        archived=archive_cycle(root,cycle_record)
        item = {
            "scan_id": report["source_scan_id"], "at_utc": now.isoformat(),
            "source_event_count": event_count,
            "new_source_events": report["journal"]["new_source_events_since_last_scan"],
            "paper_with_closed": report["totals"]["paper_with_closed"],
            "settled_predictions": report["totals"]["settled_predictions"],
            "cycle_archive":archived['path'],"cycle_sha256":archived['sha256'],
            "new_strategy_evidence_count":report['experiments'].get('new_evidence_count'),
            "last_real_learning_at_utc":report['experiments'].get('last_learning_at_utc'),
            "source_hash": hashlib.sha256(json.dumps(report["source_alignment"], sort_keys=True).encode()).hexdigest(),
        }
        with journal.open("a", encoding="utf-8") as f:
            f.write(json.dumps(item, ensure_ascii=False, separators=(",", ":")) + "\n")
    print("TURAN CORE", report["source_scan_id"], "strategies", report["totals"]["registered"],
          "archive_events", event_count, "forward_predictions", report["totals"]["prospective_predictions"])
    return report


if __name__ == "__main__":
    run()
