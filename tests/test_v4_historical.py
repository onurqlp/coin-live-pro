import datetime as dt
import gzip
import hashlib
import json
import pathlib
import sys
import unittest

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'engine'))
import v4_historical as h

T=int(dt.datetime(2026,10,17,1,0,tzinfo=dt.timezone.utc).timestamp()*1000)

def make_bar(start,period,up=0):
    price=100+up
    return [str(start),str(price),str(price+1),str(price-1),
            str(price+.2),'300','30000','30000','1']

class TestHistoricalArchive(unittest.TestCase):
    def test_unclosed_and_false_confirm_are_excluded(self):
        period=h.BARS['4H'][1]
        recent=(T//period)*period
        old=recent-period
        good=h.validate_bar(make_bar(old,period),period,T)
        self.assertIsNotNone(good)
        self.assertIsNone(h.validate_bar(make_bar(recent,period),period,T))
        false=make_bar(old,period);false[8]='0'
        self.assertIsNone(h.validate_bar(false,period,T))

    def test_bad_ohlc_and_nan_fail_closed(self):
        period=h.BARS['4H'][1]
        old=(T//period-1)*period
        bad=make_bar(old,period);bad[2]='10'
        self.assertIsNone(h.validate_bar(bad,period,T))
        bad=make_bar(old,period);bad[3]='nan'
        self.assertIsNone(h.validate_bar(bad,period,T))
        bad=make_bar(old,period);bad[5]='-1'
        self.assertIsNone(h.validate_bar(bad,period,T))

    def test_pagination_only_moves_older_and_dedupes(self):
        period=h.BARS['4H'][1]
        recent=(T//period-1)*period
        calls=[]
        def fetch(symbol,bar,after=None):
            calls.append(after)
            if after is None:
                return [make_bar(recent-i*period,period,up=i) for i in range(100)]
            if len(calls)==2:
                return [make_bar(recent-i*period,period,up=i) for i in range(100,200)]
            return []
        bars,meta=h.fetch_history('BTCUSDT','4H',T,fetch)
        self.assertEqual(meta['pages'],3)
        self.assertEqual(len(bars),200)
        self.assertTrue(all(bars[i][0]<bars[i+1][0] for i in range(len(bars)-1)))
        self.assertEqual(meta['status'],'OK')

    def test_duplicate_pagination_stops_instead_of_looping(self):
        period=h.BARS['4H'][1]
        recent=(T//period-1)*period
        def fetch(symbol,bar,after=None):
            return [make_bar(recent-i*period,period) for i in range(10)]
        bars,meta=h.fetch_history('BTCUSDT','4H',T,fetch)
        self.assertEqual(meta['error'],'PAGINATION_NOT_MOVING_OLDER')
        self.assertEqual(meta['status'],'INSUFFICIENT')

    def test_gaps_are_recorded_and_not_fabricated(self):
        period=h.BARS['4H'][1]
        recent=(T//period-1)*period
        def fetch(symbol,bar,after=None):
            return [make_bar(recent,period),make_bar(recent-3*period,period)]
        bars,meta=h.fetch_history('BTCUSDT','4H',T,fetch)
        self.assertEqual(len(bars),2)
        self.assertEqual(meta['gaps'],2)
        self.assertEqual(meta['status'],'INSUFFICIENT')

    def test_one_snapshot_cannot_claim_forward_win(self):
        meta={'frame':'4H','status':'OK'}
        period=h.BARS['4H'][1];b=[h.validate_bar(make_bar((T//period-1)*period,period),period,T)]
        data,sha=h.build_snapshot('BTCUSDT','4H',b,meta,T)
        self.assertEqual(hashlib.sha256(data).hexdigest(),sha)
        parsed=json.loads(gzip.decompress(data))
        self.assertTrue(parsed['training_only'])
        self.assertFalse(parsed['is_forward_verified_signal'])
        self.assertEqual(parsed['bars'][0],b[0])
        self.assertTrue(parsed['selection_bias_warning'])

    def test_deterministic_current_universe_selection_not_hindsight(self):
        market={'rows':[{'symbol':s} for s in ('BTCUSDT','ETHUSDT','XRPUSDT','SOLUSDT','TIAUSDT','BZUSDT')]}
        life={'items':[{'symbol':'BZUSDT'},{'symbol':'TIAUSDT'},{'symbol':'BZUSDT'}]}
        chosen=h.choose_symbols(market,life,5)
        self.assertEqual(chosen,['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BZUSDT'])

    def test_descriptive_rate_does_not_masquerade_as_success(self):
        period=h.BARS['4H'][1]
        bars=[[(T//period-50+i)*period,100,101,99,100+i*.1,300] for i in range(40)]
        result=h.descriptive(bars)
        self.assertTrue(result['not_a_win_rate'])
        self.assertNotIn('profit',result)
        self.assertNotIn('win_rate',result)

    def test_no_old_signal_ledgers_accessed_by_capture(self):
        self.assertTrue(str(h.BASE).endswith('research/okx-history'))
        self.assertTrue(h.API.endswith('/market/history-candles'))

if __name__=='__main__':unittest.main()
