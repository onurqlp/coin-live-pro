"""Deterministic, per-cycle status records for every TURAN T001-T200 catalog ID."""
import hashlib
import json


EXPECTED_IDS = tuple(f"T{i:03}" for i in range(1, 201))


def _digest(value):
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def cycle_evaluations(run_id, registry, evaluated_candidates=None, blocked_candidates=None,
                      matched_event_ids=None, signal_ids=None, candidate_event_ids=None):
    """Create one explicit, idempotent status record for every catalog ID.

    Source-dependent hypotheses and controls stay visible without being mislabeled
    as executable trade rules. Entry hypotheses distinguish data-backed NO_SIGNAL
    from a missing-source block.
    """
    evaluated_candidates = evaluated_candidates or {}
    blocked_candidates = blocked_candidates or {}
    matched_event_ids = matched_event_ids or {}
    signal_ids = signal_ids or {}
    candidate_event_ids = candidate_event_ids or {}
    by_id = {}
    for row in registry:
        sid = row.get("id")
        if sid in by_id:
            raise ValueError("DUPLICATE_STRATEGY_ID:" + str(sid))
        by_id[sid] = row

    rows = []
    for sid in EXPECTED_IDS:
        item = by_id.get(sid)
        if item is None:
            role = "MISSING_REGISTRY_RECORD"
            status = "MISSING_REGISTRY_RECORD"
            reason = "CATALOG_ID_MISSING"
            config_hash = None
            version = None
            evaluated = blocked = 0
        else:
            role = item.get("role", "UNKNOWN")
            config_hash = item.get("strategy_config_hash")
            version = item.get("strategy_version")
            evaluated = int(evaluated_candidates.get(sid, 0) or 0)
            blocked = int(blocked_candidates.get(sid, 0) or 0)
            reason = None
            if role == "ENTRY_HYPOTHESIS":
                if evaluated:
                    status = "SIGNAL" if matched_event_ids.get(sid) else "NO_SIGNAL"
                else:
                    status = "BLOCKED_SOURCE"
                    reason = "REQUIRED_FEATURE_MISSING" if blocked else "NO_VALID_CLOSED_CANDIDATE"
            elif role == "SOURCE_DEPENDENT_HYPOTHESIS":
                status = "BLOCKED_SOURCE"
                reason = "REQUIRED_SOURCE_NOT_COLLECTED"
            elif role == "CONTROL_OR_RESEARCH":
                status = "CONTROL_RESEARCH_ONLY"
                reason = "NOT_AN_INDEPENDENT_ENTRY_RULE"
            else:
                status = "BLOCKED_SOURCE"
                reason = "UNKNOWN_STRATEGY_ROLE"

        matched = sorted(set(matched_event_ids.get(sid, [])))
        candidates = sorted(set(candidate_event_ids.get(sid, [])))
        if not candidates:
            candidates = matched
        matched_signals = sorted(set(signal_ids.get(sid, [])))
        identity = {
            "run_id": run_id,
            "strategy_id": sid,
            "strategy_version": version,
            "rules_hash": config_hash,
        }
        rows.append({
            **identity,
            "evaluation_id": "EVAL-" + _digest(identity),
            "role": role,
            "status": status,
            "decision": "MATCHED_RESEARCH_SIGNAL" if status == "SIGNAL" else
                        "NO_SIGNAL" if status == "NO_SIGNAL" else
                        "BLOCKED_SOURCE" if status == "BLOCKED_SOURCE" else
                        "CONTROL_RESEARCH_ONLY" if status == "CONTROL_RESEARCH_ONLY" else
                        "MISSING_REGISTRY_RECORD",
            "candidate_count": evaluated,
            "source_blocked_candidate_count": blocked,
            "event_ids": candidates,
            "matched_event_ids": matched,
            "signal_ids": matched_signals,
            "block_reason": reason,
            "not_a_trade": True,
        })

    counts = {}
    for row in rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    missing_ids = [row["strategy_id"] for row in rows if row["status"] == "MISSING_REGISTRY_RECORD"]
    summary = {
        "run_id": run_id,
        "expected_count": 200,
        "checked_count": 200 - len(missing_ids),
        "missing_count": len(missing_ids),
        "missing_ids": missing_ids,
        "record_count": len(rows),
        "all_ids_present": not missing_ids,
        "status_counts": counts,
        "data_ready_count": sum(row["role"] == "ENTRY_HYPOTHESIS" and row["candidate_count"] > 0 for row in rows),
        "rule_evaluated_count": sum(row["role"] == "ENTRY_HYPOTHESIS" and row["candidate_count"] > 0 for row in rows),
        "source_blocked_count": counts.get("BLOCKED_SOURCE", 0),
        "control_research_only_count": counts.get("CONTROL_RESEARCH_ONLY", 0),
        "signal_count": counts.get("SIGNAL", 0),
        "no_signal_count": counts.get("NO_SIGNAL", 0),
        "no_real_orders": True,
    }
    return rows, summary
