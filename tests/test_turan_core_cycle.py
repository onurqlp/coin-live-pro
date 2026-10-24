import unittest
from pathlib import Path

from engine.turan_core import build, validate_cycle_evaluations


def valid_cycle():
    rows = []
    for number in range(1, 201):
        rows.append({
            "strategy_id": f"T{number:03}",
            "evaluation_id": f"EVAL-{number}",
            "run_id": "run-a",
            "status": "NO_SIGNAL",
        })
    summary = {
        "expected_count": 200,
        "checked_count": 200,
        "record_count": 200,
        "missing_count": 0,
        "missing_ids": [],
        "all_ids_present": True,
        "no_real_orders": True,
        "status_counts": {"NO_SIGNAL": 200},
    }
    return rows, summary


class TuranCycleIntegrityTests(unittest.TestCase):
    def test_accepts_exact_unique_t001_to_t200_cycle(self):
        rows, summary = valid_cycle()
        result = validate_cycle_evaluations(rows, summary)
        self.assertTrue(result["verified"])
        self.assertEqual(result["checked_count"], 200)

    def test_rejects_duplicate_id_even_when_row_count_is_200(self):
        rows, summary = valid_cycle()
        rows[-1] = {**rows[-1], "strategy_id": "T001"}
        with self.assertRaisesRegex(ValueError, "TURAN_CYCLE_COVERAGE_INVALID"):
            validate_cycle_evaluations(rows, summary)

    def test_rejects_summary_that_disagrees_with_rows(self):
        rows, summary = valid_cycle()
        summary["status_counts"] = {"NO_SIGNAL": 199, "SIGNAL": 1}
        with self.assertRaisesRegex(ValueError, "TURAN_CYCLE_COVERAGE_INVALID"):
            validate_cycle_evaluations(rows, summary)

    def test_current_published_snapshot_has_valid_full_coverage(self):
        report = build(root=Path(__file__).resolve().parents[1])
        self.assertTrue(report["cycle_evaluation"]["verified"])
        self.assertEqual(report["cycle_evaluation"]["checked_count"], 200)
        self.assertEqual(report["cycle_evaluation"]["missing_count"], 0)


if __name__ == "__main__":
    unittest.main()
