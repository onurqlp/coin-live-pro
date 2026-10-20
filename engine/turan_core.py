#!/usr/bin/env python3
"""TURAN CORE: independent, read-only evidence index and persistent learning journal.

Consumes existing UZAYX research and paper reports. Never creates orders, alters
cash, rewrites model policy, or touches Google integrations.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import pathlib
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "data"
OUTPUT = DATA / "turan-core.json"
JOURNAL = ROOT / "archive" / "turan-core-journal.jsonl"


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


def source_age(reference, now):
    if not reference:
        return None
    try:
        stamp = dt.datetime.fromisoformat(str(reference).replace("Z", "+00:00"))
        return round((now - stamp).total_seconds() / 60, 1)
    except (ValueError, TypeError):
        return None


def summarize_observations(events):
    by_strategy = defaultdict(lambda: {"events": 0, "observed_1h": 0, "positive_1h": 0, "negative_1h": 0, "sum_direction_pct": 0.0})
    for event in events:
        if not isinstance(event, dict):
            continue
        sid = event.get("strategy_id")
        if not isinstance(sid, str) or not sid.startswith("T"):
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


def build(root=ROOT, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    data = root / "web" / "data"
    manifest = load(data / "v4-manifest.json", {})
    bank = load(data / "uzayx-strategy-bank.json", {})
    research = load(data / "uzayx-research.json", {})
    adaptive = load(data / "uzayx-adaptive.json", {})
    pnl = load(data / "uzayx-pnl-report.json", {})
    coverage = load(data / "uzayx-binance-coverage.json", {})
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
    if registry.get("schema") != "turan.unified_registry.v1" or len(registry.get("entries", [])) != 230:
        raise ValueError("TURAN_REGISTRY_INVALID")

    metrics = summarize_observations(source_events)
    paper = {s["id"]: s for s in pnl.get("strategies", []) if isinstance(s, dict) and isinstance(s.get("id"), str)}
    details = {s["id"]: s for s in bank.get("registry", []) if isinstance(s, dict) and isinstance(s.get("id"), str)}
    strategies = []
    for item in registry["entries"]:
        sid = item["id"]
        source = details.get(sid, {})
        cash = paper.get(sid, {})
        m = metrics.get(sid, {})
        strategies.append({
            "id": sid,
            "name": item.get("name", sid),
            "family": source.get("category") or item.get("family") or "ÖNCEKİ ARAŞTIRMA",
            "role": source.get("role") or "LEGACY_RESEARCH",
            "state": source.get("state") or "RESEARCH_ONLY",
            "required_source": source.get("required_source") or cash.get("required_source"),
            "evaluated_candidates": source.get("evaluated_candidates", 0),
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
        "research_only": True,
        "no_real_orders": True,
        "no_cash_policy_change": True,
        "google_untouched": True,
        "totals": {
            "registered": len(strategies),
            "bank": bank.get("registry_count"),
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
        item = {
            "scan_id": report["source_scan_id"], "at_utc": now.isoformat(),
            "source_event_count": event_count,
            "new_source_events": report["journal"]["new_source_events_since_last_scan"],
            "paper_with_closed": report["totals"]["paper_with_closed"],
            "settled_predictions": report["totals"]["settled_predictions"],
            "source_hash": hashlib.sha256(json.dumps(report["source_alignment"], sort_keys=True).encode()).hexdigest(),
        }
        with journal.open("a", encoding="utf-8") as f:
            f.write(json.dumps(item, ensure_ascii=False, separators=(",", ":")) + "\n")
    print("TURAN CORE", report["source_scan_id"], "strategies", report["totals"]["registered"],
          "archive_events", event_count, "forward_predictions", report["totals"]["prospective_predictions"])
    return report


if __name__ == "__main__":
    run()
