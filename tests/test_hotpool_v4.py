"""V4 opportunity hot-pool selection regression tests (no network calls)."""
import datetime as dt
import pathlib
import sys
import unittest

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'engine'))
import mtf


class TestHotPoolSelection(unittest.TestCase):
    def universe(self):
        rows={}
        for i in range(80):
            symbol=f'C{i:03d}USDT'
            rows[symbol]={'symbol':symbol,'volume':100_000_000-i*100_000,
                          'change':i/100}
        rows['BTCUSDT']={'symbol':'BTCUSDT','volume':1_000_000_000,'change':.1}
        rows['ETHUSDT']={'symbol':'ETHUSDT','volume':900_000_000,'change':.1}
        return rows

    def hot(self,n=20):
        start=dt.datetime(2026,10,16,12,tzinfo=dt.timezone.utc)
        return [{
            'symbol':f'C{i+50:03d}USDT','model_version':'3.0.0-htf-sparks',
            'review_state':'RECHECK_PENDING' if i%2 else 'FRESH',
            'last_evaluated_at':(start+dt.timedelta(minutes=i)).isoformat(),
        } for i in range(n)]

    def test_oldest_active_checked_first_and_benchmarks_always_present(self):
        selected=mtf.select_candidates(self.universe(),self.hot(),cycle=0)
        names=list(selected)
        self.assertEqual(names[:2],['BTCUSDT','ETHUSDT'])
        self.assertEqual(names[2:10],[f'C{i:03d}USDT' for i in range(50,58)])
        self.assertEqual(len(names),23)
        self.assertEqual(len(names),len(set(names)))

    def test_old_hot_opportunities_not_starved_by_recently_refreshed_ones(self):
        rows=self.universe()
        hot=self.hot(20)
        seen=set()
        for cycle in range(4):
            selected=mtf.select_candidates(rows,hot,cycle)
            checked=set(selected).intersection(x['symbol'] for x in hot)
            seen.update(checked)
            # Central scanner would update only successfully checked hot records.
            for item in hot:
                if item['symbol'] in checked:
                    item['last_evaluated_at']=(
                        dt.datetime(2026,10,16,13,tzinfo=dt.timezone.utc)+
                        dt.timedelta(minutes=cycle)).isoformat()
        self.assertEqual(len(seen),20,'All 20 hot setups must be revisited within four successful rounds')

    def test_rotating_market_coverage_survives_full_hot_pool(self):
        selected=mtf.select_candidates(self.universe(),self.hot(),cycle=5)
        self.assertEqual(len(selected),23)
        pinned={'BTCUSDT','ETHUSDT'} | {x['symbol'] for x in self.hot()}
        # At least four symbols must come from discovery beyond pinned/hot.
        self.assertGreaterEqual(len([s for s in selected if s not in pinned]),4)
        following=mtf.select_candidates(self.universe(),self.hot(),cycle=6)
        self.assertNotEqual(set(selected),set(following),
                            'Rotating discovery must change across cycles')
        self.assertTrue(all(s.endswith('USDT') for s in selected))

    def test_invalidated_and_foreign_version_not_prioritized_as_hot(self):
        old=self.hot(12)
        old[0]['review_state']='INVALIDATED'
        old[1]['model_version']='2.2.0-legacy'
        selected=mtf.select_candidates(self.universe(),old,cycle=0)
        self.assertEqual(list(selected)[:10],
                         ['BTCUSDT','ETHUSDT']+
                         [f'C{i:03d}USDT' for i in range(52,60)])

    def test_limit_and_empty_universe_fail_closed(self):
        self.assertEqual(mtf.select_candidates({},self.hot(),0),{})
        self.assertEqual(mtf.select_candidates(self.universe(),self.hot(),0,limit=0),{})
        self.assertLessEqual(len(mtf.select_candidates(self.universe(),self.hot(),0,limit=5)),5)


if __name__=='__main__':
    unittest.main()
