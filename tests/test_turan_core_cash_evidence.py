import unittest

from engine.turan_core import paper_cash_evidence


class TuranPaperCashEvidenceTests(unittest.TestCase):
    def test_exposes_same_scan_reconciled_paper_cash_with_model_limits(self):
        pnl = {
            "schema": "uzayx.pnl.ledger.v1",
            "scan_id": "scan-a",
            "source_at_utc": "2026-10-22T20:29:31Z",
            "source": "OKX_MODELLED_PAPER_LEDGER",
            "not_realized_exchange_pnl": True,
            "historical_research_is_not_executed_cash": True,
            "no_real_orders": True,
            "reconciled": True,
            "starting_usdt": 10000.0,
            "equity_usdt": 9613.950908,
            "realized_usdt": -394.110202,
            "unrealized_usdt": 8.061111,
            "total_pnl_usdt": -386.049092,
            "fees_estimated_usdt": 92.816551,
            "open_count": 15,
            "closed_count": 240,
            "funding": "UNMODELED",
            "liquidation": "UNVERIFIED",
        }
        evidence = paper_cash_evidence(pnl, "scan-a")
        self.assertEqual(evidence["total_pnl_usdt"], -386.049092)
        self.assertEqual(evidence["source"], "OKX_MODELLED_PAPER_LEDGER")
        self.assertEqual(evidence["funding"], "UNMODELED")
        self.assertEqual(evidence["liquidation"], "UNVERIFIED")
        self.assertTrue(evidence["no_real_orders"])
        self.assertFalse(evidence["independent_profit_verified"])

    def test_rejects_mismatched_or_non_paper_sources(self):
        base = {
            "schema": "uzayx.pnl.ledger.v1", "scan_id": "scan-a",
            "source": "OKX_MODELLED_PAPER_LEDGER", "not_realized_exchange_pnl": True,
            "historical_research_is_not_executed_cash": True, "no_real_orders": True,
            "reconciled": True, "starting_usdt": 10000, "equity_usdt": 1,
            "realized_usdt": 0, "unrealized_usdt": 0, "total_pnl_usdt": 0,
            "fees_estimated_usdt": 0, "open_count": 0, "closed_count": 0,
            "funding": "UNMODELED", "liquidation": "UNVERIFIED",
        }
        self.assertIsNone(paper_cash_evidence(base, "scan-b"))
        self.assertIsNone(paper_cash_evidence({**base, "no_real_orders": False}, "scan-a"))
        self.assertIsNone(paper_cash_evidence({**base, "reconciled": False}, "scan-a"))
        self.assertIsNone(paper_cash_evidence({**base, "source": "EXCHANGE_REALIZED"}, "scan-a"))


if __name__ == "__main__":
    unittest.main()
