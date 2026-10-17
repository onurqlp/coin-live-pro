import datetime as dt
import unittest
from scripts.watchdog import diagnose


class WatchdogTest(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime(2026, 10, 17, 16, 30, tzinfo=dt.timezone.utc)

    def test_age_failure_and_recovery(self):
        bad = diagnose({"updated_at": "2026-10-17T15:59:00Z", "status": "OK"}, [], self.now)
        self.assertTrue(bad["unhealthy"])
        good = diagnose({"updated_at": "2026-10-17T16:29:00Z", "status": "OK"},
                        [{"status": "completed", "conclusion": "success"}], self.now)
        self.assertFalse(good["unhealthy"])

    def test_three_consecutive_errors(self):
        runs = [{"status": "completed", "conclusion": "failure"}]*3
        result = diagnose({"updated_at": "2026-10-17T16:29:00Z", "status": "OK"}, runs, self.now)
        self.assertTrue(result["unhealthy"])
        self.assertEqual(result["consecutive_failed_runs"], 3)


if __name__ == "__main__":
    unittest.main()
