import unittest
from scripts.uzayx_inverse_watch import compute


class InverseWatchTests(unittest.TestCase):
    def fixture(self):
        sid, sha, scan = "T001", "abcd", "scan1"
        selection = dict(schema="turan.inverse.watch.selection.v1", paper_only=True,
                         auto_promote=False, selection_asof_utc="2026-11-01T00:50:00+00:00",
                         selection_scan_id="oldscan",
                         candidates=[dict(strategy_id=sid, name="Demo", rules_hash=sha,
                                          strategy_version="v1", baseline={"paired_count": 66})])
        manifest = dict(scan_id=scan, publication_valid=True, no_real_orders=True)
        bank = dict(policy="TURAN200_ONLY", registry_count=200, no_real_orders=True,
                    registry=[dict(id=f"T{i:03}", strategy_version="v1",
                                   strategy_config_hash=sha) for i in range(1, 201)])
        report = dict(scan_id=scan, no_real_orders=True, separate_from_shared_cash=True,
                      experiment_policy="test", generated_at_utc="2026-11-01T02:00:00+00:00",
                      paired_results=dict(auto_promote=False,
                           pairing="SAME_EXPERIMENT_ID_AND_IMMUTABLE_RULE_VERSION"))
        pnl = dict(scan_id=scan, no_real_orders=True, reconciled=True)
        ledger = dict(last_scan_id=scan, no_real_orders=True, separate_from_shared_cash=True,
                      experiments=[
                        dict(experiment_id="before", strategy_id=sid, rules_hash=sha,
                             strategy_version="v1", experiment_policy="test", exchange="OKX",
                             contract_type="USDT-SWAP", episode_id="before",
                             decision_at="2026-11-01T00:49:00+00:00",
                             source_available_at="2026-11-01T00:48:00+00:00", direction="LONG",
                             arms={"ORIGINAL": dict(status="CLOSED", modeled_net_usdt=-1000),
                                   "INVERSE": dict(status="CLOSED", modeled_net_usdt=1000)}),
                        dict(experiment_id="after", strategy_id=sid, rules_hash=sha,
                             strategy_version="v1", experiment_policy="test", exchange="OKX",
                             contract_type="USDT-SWAP", episode_id="post",
                             decision_at="2026-11-01T00:51:00+00:00",
                             source_available_at="2026-11-01T00:50:30+00:00", direction="SHORT",
                             arms={"ORIGINAL": dict(status="CLOSED", modeled_net_usdt=-5),
                                   "INVERSE": dict(status="CLOSED", modeled_net_usdt=3)})])
        return selection, manifest, bank, report, ledger, pnl

    def test_no_past_results_enter_forward(self):
        r = compute(*self.fixture())
        self.assertEqual(r["items"][0]["forward"]["paired_count"], 1)
        self.assertEqual(r["items"][0]["forward"]["original_modeled_usdt"], -5)
        self.assertEqual(r["items"][0]["forward"]["inverse_modeled_usdt"], 3)
        self.assertEqual(r["items"][0]["forward"]["last_inverse_side"], "LONG")
        self.assertEqual(r["items"][0]["forward"]["state"], "WAITING_FORWARD_HOLDOUT")

    def test_mismatched_source_fails_closed(self):
        data = list(self.fixture())
        data[3]["scan_id"] = "other"
        with self.assertRaisesRegex(ValueError, "SOURCE_MISMATCH"):
            compute(*data)

    def test_duplicates_fail_closed(self):
        data = list(self.fixture())
        data[4]["experiments"].append(data[4]["experiments"][1])
        with self.assertRaisesRegex(ValueError, "DUPLICATE_EXPERIMENT"):
            compute(*data)


if __name__ == "__main__":
    unittest.main()
