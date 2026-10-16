import datetime as dt
import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'engine'))
import v4_anomaly as a

NOW=int(dt.datetime(2026,10,17,2,6,tzinfo=dt.timezone.utc).timestamp()*1000)
def when(ms):return a.iso(ms)
def fixture():
    f={}
    for tf,period in a.PERIOD.items():
        start=NOW//period*period-period
        f[tf]={'quality':'CLOSED_CONFIRMED','last_candle_utc':when(start),
            'fakeout_up_on_close':tf=='5m','fakeout_down_on_close':tf=='15m',
            'wick_rejections_8':2,'volume_ratio_20':4.2,
            'atr_pct':2.1}
    c={'symbol':'BTCUSDT','side':'LONG','quality':'COMPLETE','frames':f}
    m={'symbol':'BTCUSDT','spread_bps':25}
    o={'delta':{'5m':{'status':'VERIFIED_SNAPSHOT_DELTA','change_pct':9.2},
                '1h':{'status':'VERIFIED_SNAPSHOT_DELTA','change_pct':4.1}}}
    return c,m,o
class TestUtcAnomaly(unittest.TestCase):
    def test_global_windows_respect_london_new_york_dst(self):
        summer=a.clock(int(dt.datetime(2026,7,1,12,tzinfo=dt.timezone.utc).timestamp()*1000))
        winter=a.clock(int(dt.datetime(2026,1,1,12,tzinfo=dt.timezone.utc).timestamp()*1000))
        self.assertIn('New York',summer['regional_activity_windows'])
        self.assertNotIn('New York',winter['regional_activity_windows'])
        self.assertTrue(summer['window_is_not_manipulation_evidence'])
    def test_weekend_does_not_invent_equity_market_overlap(self):
        saturday=a.clock(int(dt.datetime(2026,10,17,14,tzinfo=dt.timezone.utc).timestamp()*1000))
        self.assertEqual(saturday['regional_activity_windows'],[])
        self.assertTrue(saturday['weekend_equity_windows_closed'])
    def test_confirmed_only_and_stale_candles_fail_closed(self):
        c,m,o=fixture()
        f=c['frames']['5m'];f['quality']='OPEN'
        self.assertEqual(a.assess(c,m,o,NOW)['state'],'UNKNOWN')
        c,m,o=fixture();c['frames']['15m']['last_candle_utc']=when(NOW)
        self.assertIsNone(a.assess(c,m,o,NOW)['index'])
    def test_independent_buckets_and_no_trade_claim(self):
        c,m,o=fixture()
        r=a.assess(c,m,o,NOW)
        self.assertEqual(r['state'],'OBSERVED_HEURISTIC')
        self.assertEqual(r['index'],100)
        self.assertTrue(r['not_proof'])
        self.assertTrue(r['not_trade_entry'])
        self.assertTrue(r['not_used_in_core_score'])
        self.assertTrue(r['unknown']['liquidation_clusters'])
    def test_missing_oi_does_not_become_zero_verified(self):
        c,m,o=fixture();o['delta']['5m']['status']='UNKNOWN';o['delta']['1h']['status']='UNKNOWN'
        r=a.assess(c,m,o,NOW)
        self.assertIsNone(r['metrics']['oi5_pct'])
        self.assertEqual(r['factors']['open_interest'],0)
    def test_each_closed_5m_counted_once_across_scans(self):
        c,m,o=fixture()
        source={'fetched_at':when(NOW),'candidates':[c]}
        market={'rows':[m]}
        oi={'source_mtf_at':when(NOW),'deltas':{'BTCUSDT':o}}
        ledger,report=a.collect(source,market,oi,{},NOW)
        count=lambda x:sum(v['n'] for hours in x['daily_hours'].values() for v in hours.values())
        self.assertEqual(count(ledger),1)
        new,report2=a.collect(source,market,oi,ledger,NOW+60000)
        self.assertEqual(count(new),1)
        self.assertEqual(report2['hourly']['state'],'INSUFFICIENT_SAMPLE')
        self.assertEqual(report2['hourly']['time_basis'],'UTC')
    def test_different_source_time_is_rejected(self):
        c,m,o=fixture()
        with self.assertRaises(RuntimeError):
            a.collect({'fetched_at':when(NOW),'candidates':[c]},
                      {'rows':[m]},{'source_mtf_at':when(NOW-20000)}, {},NOW)
    def test_hour_report_requires_multiple_distinct_days(self):
        c,m,o=fixture()
        src={'fetched_at':when(NOW),'candidates':[c]}
        market={'rows':[m]};oi={'source_mtf_at':when(NOW),'deltas':{'BTCUSDT':o}}
        prior={'daily_hours':{'2026-10-16':{'2':{'n':100,'elevated':100,'high':100}}},
               'recent_dedup':[]}
        _,report=a.collect(src,market,oi,prior,NOW)
        self.assertEqual(report['hourly']['state'],'INSUFFICIENT_SAMPLE')
if __name__=='__main__':unittest.main()
