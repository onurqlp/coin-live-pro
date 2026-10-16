import datetime as dt
import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'engine'))
import v4_oi
T=int(dt.datetime(2026,10,16,18,30,tzinfo=dt.timezone.utc).timestamp()*1000)
def snap(t,usd=1000):
    return {'model_version':'3.0.0-mtf-swing','provider':'OKX',
            'fetched_at':dt.datetime.fromtimestamp(t/1000,dt.timezone.utc).isoformat(),
            'candidates':[{'symbol':'BTCUSDT','observed_at_utc':
                dt.datetime.fromtimestamp(t/1000,dt.timezone.utc).isoformat(),
                'open_interest_usd':usd}]}

class TestV4OI(unittest.TestCase):
 def test_single_snapshot_means_unknown_not_zero(self):
    d=v4_oi.merge({},snap(T),T)
    for key in ('5m','1h','4h'):
        self.assertEqual(d['deltas']['BTCUSDT']['delta'][key]['status'],'UNKNOWN')
        self.assertIsNone(d['deltas']['BTCUSDT']['delta'][key]['change_pct'])

 def test_exact_five_minute_delta_not_wrong_one_hour(self):
    a=v4_oi.merge({},snap(T),T)
    b=v4_oi.merge(a,snap(T+300000,1100),T+300000)
    self.assertAlmostEqual(b['deltas']['BTCUSDT']['delta']['5m']['change_pct'],10,places=4)
    self.assertIsNone(b['deltas']['BTCUSDT']['delta']['1h']['change_pct'])
    self.assertIsNone(b['deltas']['BTCUSDT']['delta']['4h']['change_pct'])

 def test_hour_and_four_hour_need_separate_observed_history(self):
    first=v4_oi.merge({},snap(T),T)
    second=v4_oi.merge(first,snap(T+3600000,1120),T+3600000)
    self.assertAlmostEqual(second['deltas']['BTCUSDT']['delta']['1h']['change_pct'],12,places=4)
    third=v4_oi.merge(second,snap(T+14400000,1400),T+14400000)
    self.assertAlmostEqual(third['deltas']['BTCUSDT']['delta']['4h']['change_pct'],40,places=4)

 def test_duplicate_bucket_does_not_manufacture_growth(self):
    a=v4_oi.merge({},snap(T),T)
    b=v4_oi.merge(a,snap(T+30000,1500),T+30000)
    self.assertEqual(b['new_samples'],0)
    self.assertEqual(len(b['recent']['BTCUSDT']),1)

 def test_missing_or_invalid_oi_is_not_accumulated(self):
    a=v4_oi.merge({},snap(T,0),T)
    self.assertEqual(a['new_samples'],0)
    self.assertFalse(a['deltas'])
if __name__=='__main__':unittest.main()
