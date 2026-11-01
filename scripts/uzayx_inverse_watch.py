#!/usr/bin/env python3
"""Frozen TURAN inverse shadow cohort. Never changes orders, entries or original ledger.

Selection is fixed by config/turan-inverse-watch-v1.json before forward holdout.
Only same-experiment ORIGINAL / INVERSE closed 5m-bar replays after cutoff count.
"""
from __future__ import annotations

import datetime as dt
import json
import pathlib
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/turan-inverse-watch-v1.json"
OUTPUT = ROOT / "web/data/turan-inverse-watch.json"
VERSION = "turan.inverse.watch.v1"


def utc(value):
    if not isinstance(value, str):
        return None
    try:
        result = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        return result.astimezone(dt.timezone.utc) if result.tzinfo else None
    except ValueError:
        return None


def is_number(value):
    return isinstance(value, (float, int)) and not isinstance(value, bool) and float("-inf") < value < float("inf")


def compute(selection, manifest, bank, report, ledger, pnl):
    """Fail closed on source mismatch; don't reselect winners using forward data."""
    if (selection.get("schema") != "turan.inverse.watch.selection.v1"
            or selection.get("paper_only") is not True or selection.get("auto_promote") is not False
            or manifest.get("publication_valid") is not True
            or manifest.get("no_real_orders") is not True
            or not manifest.get("scan_id")
            or any(x.get("scan_id") != manifest["scan_id"] for x in (report, pnl))
            or pnl.get("no_real_orders") is not True or pnl.get("reconciled") is not True
            or report.get("no_real_orders") is not True
            or report.get("separate_from_shared_cash") is not True
            or report.get("paired_results", {}).get("auto_promote") is not False
            or report.get("paired_results", {}).get("pairing") != "SAME_EXPERIMENT_ID_AND_IMMUTABLE_RULE_VERSION"
            or ledger.get("last_scan_id") != manifest["scan_id"]
            or ledger.get("no_real_orders") is not True
            or ledger.get("separate_from_shared_cash") is not True
            or bank.get("policy") != "TURAN200_ONLY" or bank.get("registry_count") != 200
            or bank.get("no_real_orders") is not True):
        raise ValueError("INVERSE_WATCH_SOURCE_MISMATCH")
    cutoff = utc(selection.get("selection_asof_utc"))
    if cutoff is None or not isinstance(selection.get("candidates"), list):
        raise ValueError("INVERSE_WATCH_INVALID_SELECTION")
    registry = {s["id"]: s for s in bank.get("registry", [])}
    if len(registry) != 200:
        raise ValueError("INVERSE_WATCH_INVALID_REGISTRY")
    selected = selection["candidates"]
    frozen_ids = [s.get("strategy_id") for s in selected]
    if len(frozen_ids) != len(set(frozen_ids)) or not frozen_ids:
        raise ValueError("INVERSE_WATCH_DUPLICATE_OR_EMPTY_SELECTION")

    by_strategy = defaultdict(list)
    seen = set()
    for item in ledger.get("experiments", []):
        experiment_id = item.get("experiment_id")
        if not experiment_id or experiment_id in seen:
            raise ValueError("INVERSE_WATCH_DUPLICATE_EXPERIMENT")
        seen.add(experiment_id)
        if item.get("strategy_id") not in frozen_ids:
            continue
        decision = utc(item.get("decision_at"))
        available = utc(item.get("source_available_at"))
        if decision is None or decision <= cutoff or available is None or available > decision:
            continue
        if item.get("exchange") != "OKX" or item.get("contract_type") != "USDT-SWAP":
            continue
        if item.get("experiment_policy") != report.get("experiment_policy"):
            continue
        by_strategy[item["strategy_id"]].append(item)

    rows = []
    for candidate in selected:
        sid = candidate["strategy_id"]
        rule = registry.get(sid)
        if not rule or candidate.get("rules_hash") is None:
            raise ValueError("INVERSE_WATCH_SELECTION_NOT_IN_REGISTRY")
        version_ok = (rule.get("strategy_config_hash") == candidate["rules_hash"]
                      and rule.get("strategy_version") == candidate["strategy_version"])
        eligible = [x for x in by_strategy[sid]
                    if x.get("strategy_version") == candidate["strategy_version"]
                    and x.get("rules_hash") == candidate["rules_hash"]]
        paired, pending = [], 0
        for x in eligible:
            arms = x.get("arms") or {}
            a, b = arms.get("ORIGINAL") or {}, arms.get("INVERSE") or {}
            if (a.get("status") == "CLOSED" and b.get("status") == "CLOSED"
                    and is_number(a.get("modeled_net_usdt")) and is_number(b.get("modeled_net_usdt"))):
                paired.append(x)
            else:
                pending += 1
        orig = round(sum(x["arms"]["ORIGINAL"]["modeled_net_usdt"] for x in paired), 6)
        inv = round(sum(x["arms"]["INVERSE"]["modeled_net_usdt"] for x in paired), 6)
        dates = {utc(x["decision_at"]).date().isoformat() for x in paired}
        clusters = {x.get("episode_id") for x in paired if x.get("episode_id")}
        sufficient = len(paired) >= 60 and len(dates) >= 7 and len(clusters) >= 50
        state = ("RULE_CHANGED_REVIEW_ONLY" if not version_ok
                 else "WAITING_FORWARD_HOLDOUT" if not sufficient
                 else "FORWARD_MODEL_EDGE_OBSERVED" if inv > 0 and inv > orig
                 else "FORWARD_MODEL_EDGE_NOT_ESTABLISHED")
        last = max(eligible, key=lambda x: utc(x.get("decision_at")) or cutoff) if eligible else None
        last_origin = last.get("direction") if last else None
        rows.append({
            "strategy_id": sid, "name": candidate["name"],
            "strategy_version": candidate["strategy_version"],
            "rules_hash": candidate["rules_hash"], "current_rule_matches": version_ok,
            "selection_baseline": candidate["baseline"],
            "forward": {
                "state": state, "paired_count": len(paired),
                "pending_or_blocked_count": pending,
                "event_count": len(eligible), "market_days": len(dates),
                "episode_clusters": len(clusters), "original_modeled_usdt": orig,
                "inverse_modeled_usdt": inv,
                "inverse_minus_original_modeled_usdt": round(inv - orig, 6),
                "complete_net_usdt": None, "has_separate_holdout": True,
                "funding": "UNKNOWN", "liquidation": "UNKNOWN",
                "last_decision_at_utc": last.get("decision_at") if last else None,
                "last_original_side": last_origin if last_origin in ("LONG", "SHORT") else None,
                "last_inverse_side": ("SHORT" if last_origin == "LONG" else "LONG"
                                      if last_origin == "SHORT" else None)
            }})
    return {
        "schema": VERSION, "source_scan_id": manifest["scan_id"],
        "generated_at_utc": report.get("generated_at_utc"),
        "source_selection_scan_id": selection["selection_scan_id"],
        "selection_asof_utc": selection["selection_asof_utc"],
        "selection_is_frozen": True, "selection_count": len(rows),
        "no_real_orders": True, "paper_only": True,
        "auto_promote": False, "changes_shared_cash": False,
        "funding": "UNKNOWN", "liquidation": "UNKNOWN",
        "complete_net_usdt": None, "modeled_pnl_not_account_equity": True,
        "overlapping_experiments_not_portfolio": True,
        "selection_is_in_sample": True,
        "forward_only_after_cutoff": True, "items": rows
    }


def main():
    read = lambda path: json.loads((ROOT / path).read_text(encoding="utf-8"))
    report = compute(
        read("config/turan-inverse-watch-v1.json"),
        read("web/data/v4-manifest.json"),
        read("web/data/uzayx-strategy-bank.json"),
        read("web/data/turan-experiments.json"),
        read("archive/turan-experiments-ledger.json"),
        read("web/data/uzayx-pnl-report.json"))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, separators=(",", ":")) + "\n",
                      encoding="utf-8")
    print("TURAN_INVERSE_WATCH", report["source_scan_id"], "candidates",
          report["selection_count"], "forward paired",
          sum(x["forward"]["paired_count"] for x in report["items"]))


if __name__ == "__main__":
    main()
