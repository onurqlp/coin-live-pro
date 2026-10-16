import unittest, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'engine'))
import collector

class TestReporting(unittest.TestCase):
    def test_empty_7d(self):
        r=collector.summary([],7)
        self.assertEqual(r['total'],0)
        self.assertIsNone(r['win_rate'])
        self.assertIsNone(r['illustrative_100_usdt_delta'])
    def test_watch_is_not_counted_as_a_trade(self):
        now=collector.NOW_MS
        sample={'time':collector.UTC,'at_ms':now,'symbol':'BTCUSDT','side':'LONG','stage':'WATCH','state':'TP1','net_R':.92}
        r=collector.summary([sample],7)
        self.assertEqual(r['total'],1)
        self.assertEqual(r['closed'],0)
    def test_conflict_has_no_successful_exit(self):
        now=(collector.NOW_MS//900000)*900000
        event={'id':'sample','symbol':'BTCUSDT','side':'LONG','stage':'CONFIRMED','state':'OPEN','price':100,'stop':98,'targets':[102,104,106],'at_ms':now-1800000,'last_observed_ms':now-1800000,'mfe_pct':0,'mae_pct':0}
        candle={'t':now-900000,'o':100,'h':103,'l':97,'c':101}
        collector.update_existing([event],{'BTCUSDT':[candle]})
        self.assertEqual(event['state'],'AMBIGUOUS')
        self.assertNotIn('net_R',event)
    def test_no_lookahead_inside_alert_candle(self):
        now=(collector.NOW_MS//900000)*900000
        event={'id':'no_lookahead','symbol':'BTCUSDT','side':'LONG','stage':'CONFIRMED','state':'OPEN','price':100,'stop':98,'targets':[102,104,106],
               'at_ms':now-450000,'last_observed_ms':now-450000,'mfe_pct':0,'mae_pct':0}
        # This completed candle started *before* alert time; its high cannot
        # be credited to a strategy that was not yet observing the market.
        pre={'t':now-900000,'o':100,'h':103,'l':99,'c':101}
        collector.update_existing([event],{'BTCUSDT':[pre]})
        self.assertEqual(event['state'],'OPEN')
        self.assertEqual(event['mfe_pct'],0)
    def test_stop_short_after_complete_event_candle(self):
        now=(collector.NOW_MS//900000)*900000
        event={'id':'short','symbol':'ETHUSDT','side':'SHORT','stage':'CONFIRMED','state':'OPEN','price':100,'stop':102,'targets':[98,96,94],
               'at_ms':now-1800000,'last_observed_ms':now-1800000,'mfe_pct':0,'mae_pct':0}
        bar={'t':now-900000,'o':100,'h':103,'l':99,'c':102.5}
        collector.update_existing([event],{'ETHUSDT':[bar]})
        self.assertEqual(event['state'],'STOP')
        self.assertLess(event['net_R'],0)
    def test_long_short_symmetry(self):
        now=(collector.NOW_MS//900000)*900000
        event={'symbol':'ETHUSDT','side':'SHORT','stage':'CONFIRMED','state':'OPEN','price':100,'stop':102,'targets':[98,96,94],'at_ms':now-1800000,'last_observed_ms':now-1800000,'mfe_pct':0,'mae_pct':0}
        candle={'t':now-900000,'o':99,'h':100,'l':97.9,'c':98.1}
        collector.update_existing([event],{'ETHUSDT':[candle]})
        self.assertEqual(event['state'],'TP1')
        self.assertGreater(event['net_R'],0)
if __name__=='__main__':unittest.main()