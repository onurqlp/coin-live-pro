import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from scripts.quant_report import build_report, markdown


class OpsReportTest(unittest.TestCase):
    def test_small_cohort_never_reports_win_probability(self):
        with tempfile.TemporaryDirectory() as rootname:
            root = Path(rootname)
            target = root / "web/data"
            target.mkdir(parents=True)
            data = {
                "v4-manifest": {"scan_id": "fixture", "publication_valid": True, "candidate_counts": {"verified": 3}},
                "health": {"updated_at": "2026-10-17T12:00:00+00:00", "status": "OK"},
                "v4-spark-paper": {"all_events_count": 32, "geldi_intent_total": 10, "summary": {"counts": {"OPEN": 25}, "virtual_equity_usdt": 10000}, "daily": {"days": []}},
                "v4-spark-review": {"cohorts": {"TÜMÜ": {"closed": 7, "positive": 5, "negative": 2}}},
                "v4-paper": {"starting_balance_usdt": 10000, "equity_usdt": 10000, "funding_state": "UNKNOWN_NOT_MODELED"},
                "v4-lab": {"periods": [{"days": 7, "strategies": {"TEST": {"discovered": 3, "signal_success_rate": "INSUFFICIENT_SAMPLE"}}, "sample_quality": "INSUFFICIENT_SAMPLE"}]},
            }
            for key, val in data.items():
                (target / (key + ".json")).write_text(json.dumps(val))
            out = build_report(root, dt.datetime(2026, 10, 17, 12, 1, tzinfo=dt.timezone.utc))
            self.assertEqual(out["source_scan_id"], "fixture")
            self.assertIsNone(out["experimental_spark"]["observed_positive_share"])
            self.assertIn("7", out["windows"])
            self.assertFalse(out["real_orders"])
            self.assertIn("Insufficient", markdown(out))


if __name__ == "__main__":
    unittest.main()
