import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "engine"))
from uzayx_evaluation import cycle_evaluations


class CycleEvaluationTests(unittest.TestCase):
    def test_every_catalog_id_gets_a_stable_status_and_references(self):
        bank = [
            {"id": f"T{i:03}", "role": "SOURCE_DEPENDENT_HYPOTHESIS",
             "required_source": "VERIFIED_SOURCE", "strategy_config_hash": f"cfg-{i}"}
            for i in range(1, 201)
        ]
        bank[0].update(role="ENTRY_HYPOTHESIS", conditions=[["z", ">=", 2.5]])
        bank[19].update(role="CONTROL_OR_RESEARCH", control="SPREAD_VETO")
        bank[0]["required_source"] = "CLOSED_OKX_OHLCV_1D_4H_1H"

        rows, summary = cycle_evaluations(
            run_id="fixture-run",
            registry=bank,
            evaluated_candidates={"T001": 2},
            blocked_candidates={"T001": 0},
            matched_event_ids={"T001": ["event-a"]},
            signal_ids={"T001": ["signal-a"]},
        )

        self.assertEqual(len(rows), 200)
        self.assertEqual(summary["checked_count"], 200)
        self.assertEqual(summary["missing_ids"], [])
        by_id = {row["strategy_id"]: row for row in rows}
        self.assertEqual(by_id["T001"]["status"], "SIGNAL")
        self.assertEqual(by_id["T001"]["event_ids"], ["event-a"])
        self.assertEqual(by_id["T001"]["signal_ids"], ["signal-a"])
        self.assertEqual(by_id["T002"]["status"], "BLOCKED_SOURCE")
        self.assertEqual(by_id["T020"]["status"], "CONTROL_RESEARCH_ONLY")
        self.assertEqual(by_id["T021"]["status"], "BLOCKED_SOURCE")
        self.assertEqual(
            by_id["T001"]["evaluation_id"],
            cycle_evaluations(
                "fixture-run", bank, {"T001": 2}, {"T001": 0},
                {"T001": ["event-a"]}, {"T001": ["signal-a"]}
            )[0][0]["evaluation_id"],
        )


if __name__ == "__main__":
    unittest.main()
