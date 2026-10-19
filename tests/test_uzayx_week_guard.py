import unittest

from scripts.uzayx_week_guard import validate, verify_counters


def sample(all_count=3, closed=1, open_count=1, watch_total=2):
    spark = {
        "archive_is_persistent": True,
        "no_real_orders": True,
        "open_positions_complete": True,
        "all_events_count": all_count,
        "scan_id": "abc",
        "summary": {"counts": {
            "OPEN": open_count, "CLOSED": closed,
            "WAITING_FUTURE_BAR": all_count-open_count-closed}},
        "open_positions": [{"event_id": "e1", "status": "OPEN",
                            "is_real_trade": False}][:open_count],
        "recent_tickets": [{"event_id": "e1", "is_real_trade": False}],
    }
    watch = {"total": watch_total, "records": [{} for _ in range(watch_total)],
             "scan_id": "abc", "archive_is_persistent": True, "no_real_orders": True}
    manifest = {"scan_id": "abc", "publication_valid": True, "no_real_orders": True}
    paper = {"scan_id": "abc", "no_real_orders": True}
    return spark, manifest, paper, watch


class SevenDayGuardTest(unittest.TestCase):
    def test_unchanged_verified_snapshot(self):
        self.assertEqual(validate(*sample()), {"all": 3, "closed": 1, "watch": 2})
        self.assertTrue(verify_counters({"all": 3, "closed": 1, "watch": 2},
                                        {"all": 4, "closed": 2, "watch": 3}))

    def test_refuse_history_regression(self):
        with self.assertRaisesRegex(ValueError, "HISTORICAL_DATA_REGRESSION"):
            verify_counters({"all": 12, "closed": 8, "watch": 10},
                            {"all": 11, "closed": 9, "watch": 10})

    def test_refuse_incomplete_open_positions(self):
        spark, manifest, paper, watch = sample()
        spark["open_positions_complete"] = False
        with self.assertRaisesRegex(ValueError, "Full open"):
            validate(spark, manifest, paper, watch)

    def test_refuse_duplicate_virtual_id(self):
        spark, manifest, paper, watch = sample(4, 1, 1)
        spark["summary"]["counts"]["OPEN"] = 2
        spark["summary"]["counts"]["WAITING_FUTURE_BAR"] -= 1
        spark["open_positions"].append(spark["open_positions"][0].copy())
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            validate(spark, manifest, paper, watch)

    def test_refuse_mixed_scans(self):
        spark, manifest, paper, watch = sample()
        paper["scan_id"] = "other"
        with self.assertRaisesRegex(ValueError, "Mixed"):
            validate(spark, manifest, paper, watch)


if __name__ == "__main__":
    unittest.main()
