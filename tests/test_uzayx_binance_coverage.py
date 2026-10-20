import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from uzayx_binance_coverage import summarize


class CoverageTest(unittest.TestCase):
    def test_partial_counts_keep_unknown_sources_unknown(self):
        sample = {'version':'uzayx.binance.archive.v1',
          'updated_at_utc':'2026-10-20T00:00:00+00:00',
          'instruments':[{'market':'um','symbol':'BTCUSDT','status':'TRADING'},
                         {'market':'cm','symbol':'BTCUSD_PERP','status':'TRADING'}],
          'source_health':{'um':'OK','cm':'SOURCE_UNAVAILABLE'},
          'archives':{'um/BTCUSDT/2020-01':{'status':'VERIFIED_CLOSED_OHLCV',
                       'rows':744,'first_ms':1577836800000,'last_ms':1580511600000}},
          'funding':'NOT_COLLECTED','open_interest':'NOT_COLLECTED',
          'book_history':'NOT_COLLECTED','ohlcv_scope':'CLOSED_1H_MONTHLY_ONLY'}
        output=summarize(sample)
        self.assertEqual(output['catalogue_observed_count'],2)
        self.assertEqual(output['current_trading_verified_count'],1)
        self.assertEqual(output['archived_symbol_count'],1)
        self.assertEqual(output['verified_1h_months'],1)
        self.assertEqual(output['verified_1h_bars'],744)
        self.assertFalse(output['net_strategy_pnl_verified'])
        self.assertEqual(output['funding'],'NOT_COLLECTED')

    def test_bad_input_refuses_publication(self):
        with self.assertRaises(ValueError):
            summarize({'version':'old','instruments':[]})
        with self.assertRaises(ValueError):
            summarize({'version':'uzayx.binance.archive.v1','instruments':[], 'archives':None,'source_health':{}})


if __name__=='__main__':
    unittest.main()
