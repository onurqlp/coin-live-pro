import datetime as dt
import unittest
from scripts.watchdog import diagnose, recovery_decision


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


    def test_recovery_requires_real_stall_and_skips_active_scan(self):
        degraded = {"unhealthy": True, "age_minutes": 31, "consecutive_failed_runs": 0}
        stale_run = {"status": "completed", "conclusion": "success",
                     "created_at": "2026-10-17T15:55:00Z"}
        self.assertTrue(recovery_decision(degraded, [stale_run], self.now)["dispatch"])
        active = {"status": "in_progress", "created_at": "2026-10-17T16:29:00Z"}
        self.assertEqual(recovery_decision(degraded, [active], self.now)["reason"],
                         "SCAN_ALREADY_RUNNING_OR_QUEUED")
        recent = {"status": "completed", "conclusion": "failure",
                  "created_at": "2026-10-17T16:25:00Z"}
        self.assertEqual(recovery_decision(degraded, [recent], self.now)["reason"],
                         "RECENT_RUN_COOLDOWN")

    def test_fresh_manual_scan_does_not_hide_missing_schedule(self):
        health = {"updated_at": "2026-10-17T16:29:00Z", "status": "DEGRADED_SCHEDULE_GAP"}
        manual = [{"status": "completed", "conclusion": "success",
                   "event": "workflow_dispatch", "created_at": "2026-10-17T16:29:00Z"}]
        scheduled = [{"status": "completed", "conclusion": "success",
                      "event": "schedule", "created_at": "2026-10-17T15:30:00Z"}]
        result = diagnose(health, manual, self.now, scheduled_runs=scheduled)
        self.assertTrue(result["unhealthy"])
        self.assertFalse(result["data_unhealthy"])
        self.assertTrue(result["schedule_gap"])
        self.assertEqual(result["schedule_age_minutes"], 60)
        self.assertEqual(recovery_decision(result, manual, self.now)["reason"],
                         "SCHEDULE_GAP_ONLY")

    def test_fresh_schedule_clears_schedule_gap(self):
        health = {"updated_at": "2026-10-17T16:29:00Z", "status": "OK"}
        scheduled = [{"status": "completed", "conclusion": "success",
                      "event": "schedule", "created_at": "2026-10-17T16:20:00Z"}]
        result = diagnose(health, [], self.now, scheduled_runs=scheduled)
        self.assertFalse(result["unhealthy"])
        self.assertFalse(result["schedule_gap"])

    def test_recovery_never_dispatches_when_fresh_and_healthy(self):
        good = {"unhealthy": False, "age_minutes": 2, "consecutive_failed_runs": 0}
        self.assertFalse(recovery_decision(good, [], self.now)["dispatch"])


if __name__ == "__main__":
    unittest.main()
