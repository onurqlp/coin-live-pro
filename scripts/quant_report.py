#!/usr/bin/env python3
"""Read-only 4.03 ops/quant report. No strategy mutation, orders or backfill."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WINDOWS = (7, 14, 30, 90)


def load(root, name):
    with (root / "web" / "data" / (name + ".json")).open(encoding="utf-8") as f:
        return json.load(f)


def as_utc(value):
    if not value:
        return None
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(dt.timezone.utc)
    except (TypeError, ValueError):
        return None


def build_report(root=ROOT, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    manifest = load(root, "v4-manifest")
    health = load(root, "health")
    spark = load(root, "v4-spark-paper")
    review = load(root, "v4-spark-review")
    strict = load(root, "v4-paper")
    lab = load(root, "v4-lab")
    windows = {}
    for record in lab.get("periods", []):
        days = record.get("days")
        if days in WINDOWS:
            strategies = record.get("strategies", {})
            windows[str(days)] = {
                "strategies": {name: {
                    "discovered": row.get("discovered", 0),
                    "entry_eligible": row.get("entry_eligible", 0),
                    "signal_success_rate": row.get("signal_success_rate", "INSUFFICIENT_SAMPLE"),
                    "forward_horizons": row.get("forward_horizons", {}),
                } for name, row in strategies.items()},
                "sample_quality": record.get("sample_quality", "INSUFFICIENT_SAMPLE")
            }
    by_cohort = review.get("cohorts", {})
    total = by_cohort.get("TÜMÜ", {})
    closed = int(total.get("closed", 0))
    positive = int(total.get("positive", 0))
    negative = int(total.get("negative", 0))
    health_time = as_utc(health.get("updated_at"))
    age = round((now - health_time).total_seconds() / 60, 2) if health_time else None
    warnings = ["Only forward-observed hypothetical fills; not real trading performance.",
                "Funding, exact orderbook execution, liquidation and gaps are not fully modeled.",
                "Overlapping cohort categories must never be summed as distinct tickets."]
    if closed < 30:
        warnings.append("Insufficient closed-ticket sample: do not rank model profitability.")
    if age is None or age > 25 or age < -3:
        warnings.append("Source health timestamp is stale or invalid; never treat this as live advice.")
    if manifest.get("publication_valid") is not True:
        warnings.append("Source publication integrity is not verified.")
    return {
        "schema_version": 1,
        "generated_at_utc": now.isoformat(),
        "source_scan_id": manifest.get("scan_id"),
        "source_health_at": health.get("updated_at"),
        "source_age_minutes": age,
        "source_publication_valid": manifest.get("publication_valid") is True,
        "source_trigger": health.get("last_trigger"),
        "schedule_observed_count": health.get("observed_real_scheduled_runs", 0),
        "missed_slots_latest": health.get("missed_slots_latest"),
        "market_pairs": manifest.get("candidate_counts", {}).get("market_pairs"),
        "verified_this_scan": manifest.get("candidate_counts", {}).get("verified"),
        "strict_v4_account": {
            "starting_usdt": strict.get("starting_balance_usdt"),
            "equity_usdt": strict.get("equity_usdt"),
            "closed_orders": len([x for x in strict.get("recent_orders", []) if x.get("status") == "CLOSED"]),
            "funding_state": strict.get("funding_state"),
            "independent_from_experimental": True,
        },
        "experimental_spark": {
            "total_intents": spark.get("all_events_count"),
            "geldi_intents": spark.get("geldi_intent_total"),
            "ticket_counts": spark.get("summary", {}).get("counts", {}),
            "virtual_equity_usdt": spark.get("summary", {}).get("virtual_equity_usdt"),
            "realized_net_usdt": spark.get("summary", {}).get("realized_net_usdt"),
            "unrealized_net_usdt": spark.get("summary", {}).get("unrealized_net_usdt"),
            "closed_cohort_count": closed,
            "positive_closed": positive,
            "negative_closed": negative,
            "observed_positive_share": round(positive / closed, 4) if closed >= 30 else None,
            "is_real_money": False,
            "account_is_separate": True,
        },
        "daily": spark.get("daily", {}).get("days", []),
        "cohorts": by_cohort,
        "windows": windows,
        "min_closed_for_comparison": 30,
        "automated_strategy_changes": False,
        "real_orders": False,
        "warnings": warnings,
    }


def markdown(report):
    exp = report["experimental_spark"]
    rows = [
        "# COIN.LIVE 4.03 — Quant evidence (UTC)",
        "",
        "Scan: " + str(report["source_scan_id"]),
        "Health age: " + str(report["source_age_minutes"]) + " minutes; trigger: " + str(report["source_trigger"]),
        "Strict V4 account: " + str(report["strict_v4_account"]["equity_usdt"]) + " USDT (independent)",
        "Experimental tickets: " + str(exp["total_intents"]) + ", closed " +
            str(exp["closed_cohort_count"]) + " (" + str(exp["positive_closed"]) +
            " positive / " + str(exp["negative_closed"]) + " negative)",
        "Experimental estimated equity: " + str(exp["virtual_equity_usdt"]) + " USDT",
        "Do not infer a win probability or model superiority from small samples.",
        "",
        "| Lookback | Strategies tracked | Sample quality |",
        "|---|---:|---|",
    ]
    for days in WINDOWS:
        window = report["windows"].get(str(days), {})
        rows.append("| " + str(days) + "d | " + str(len(window.get("strategies", {}))) +
                    " | " + window.get("sample_quality", "UNAVAILABLE") + " |")
    rows.extend(["", "### Caveats"] + ["- " + w for w in report["warnings"]])
    return "\n".join(rows) + "\n"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--summary-only", action="store_true")
    args = p.parse_args()
    report = build_report()
    md = markdown(report)
    if not args.summary_only:
        dest = ROOT / "web/data/ops-report.json"
        tmp = dest.with_suffix(".tmp")
        tmp.write_text(json.dumps(report, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        os.replace(tmp, dest)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(md)
    print(md)


if __name__ == "__main__":
    main()
