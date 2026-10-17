"""Forward-only spark ticket audit; no fabricated intrabar success or real order."""
import datetime as dt
import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'engine'))
import v4_spark_paper as paper
NOW=int(dt.datetime(2026,10,17,12,30,tzinfo=dt.timezone.utc).timestamp()*1000)
def stamp(ms):return paper.stamp(ms)
def docs(ts=NOW):
    candle=((ts//300000)-1)*300000
    return ({'scan_id':'case-1','source_mtf_at':stamp(ts-15000),
     'research_only':True,'no_paper_entries':True,'candidates':[{
       'event_id':'ticket-unique-1','symbol':'BTCUSDT','side':'LONG',
       'first_seen_at_utc':stamp(ts-15000),'first_seen_price':100.,
       'research_tier':'KIVILCIM','research_rank':42,'paper_eligible':False,
       'real_order_eligible':False,'reasons':['4H_TREND'],'hourly_level':101,
       'source_closed_1h_at_utc':stamp(ts-3600000)}]},
      {'fetched_at':stamp(ts-15000),'candidates':[{
       'symbol':'BTCUSDT','side':'LONG','frames':{'1H':{
       'atr_pct':1.,'rsi_14':48,'macd_12_26_9':{'hist_pct':0.004},
       'bb_width_pct':3.,'bb_compression_percentile_30':12},
       '4H':{'rsi_14':51,'macd_12_26_9':{'hist_pct':0.002}},
       '1D':{'rsi_14':56}}}]})
def bar(t,o=100.,h=100.3,l=99.8,c=100.1):
    return {'t':t,'o':o,'h':h,'l':l,'c':c}
class TestSparkPaper(unittest.TestCase):
    def test_new_ticket_pending_no_retrofill_and_features(self):
        e,m=docs();ledger,pub=paper.advance({},e,m,NOW,{})
        self.assertEqual(pub['summary']['counts']['WAITING_FUTURE_BAR'],1)
        self.assertEqual(ledger['tickets'][0]['fill_price'],None)
        self.assertEqual(ledger['tickets'][0]['features_at_birth']['1H']['rsi'],48)
        self.assertTrue(pub['no_real_orders'])
        self.assertEqual(pub['starting_balance_usdt'],10000)
    def test_forward_fills_then_stop_net_negative(self):
        e,m=docs();ledger,_=paper.advance({},e,m,NOW,{})
        first=((NOW//paper.BAR)+1)*paper.BAR
        entry=bar(first,100.,100.5,99.9,100.2)
        ledger,pub=paper.advance(ledger,{**e,'scan_id':'case-2','candidates':[]},m,first+paper.BAR+5000,{'BTCUSDT':[entry]})
        t=ledger['tickets'][0]
        self.assertEqual(t['status'],'OPEN')
        self.assertGreater(t['fill_price'],100)
        self.assertTrue(isinstance(pub['summary']['virtual_equity_usdt'],float))
        stop=bar(first+paper.BAR,100.,100.2,98.8,99.7)
        ledger,pub=paper.advance(ledger,{**e,'scan_id':'case-3','candidates':[]},m,first+2*paper.BAR+5000,{'BTCUSDT':[entry,stop]})
        self.assertEqual(ledger['tickets'][0]['status'],'CLOSED')
        self.assertEqual(ledger['tickets'][0]['outcome'],'STOP')
        self.assertLess(pub['summary']['realized_net_usdt'],0)
        self.assertEqual(pub['summary']['unrealized_net_usdt'],0)
    def test_stop_tp_same_candle_is_not_a_win(self):
        e,m=docs();l,_=paper.advance({},e,m,NOW,{})
        first=((NOW//paper.BAR)+1)*paper.BAR
        x=bar(first,o=100,h=101.2,l=98.5,c=100)
        l,_=paper.advance(l,{**e,'scan_id':'s2','candidates':[]},m,first+paper.BAR+2000,{'BTCUSDT':[x]})
        self.assertEqual(l['tickets'][0]['status'],'CLOSED')
        self.assertEqual(l['tickets'][0]['outcome'],'STOP_AMBIGUOUS_SAME_5M')
    def test_missing_first_future_bar_not_fabricated(self):
        e,m=docs();l,_=paper.advance({},e,m,NOW,{})
        first=((NOW//paper.BAR)+1)*paper.BAR
        l,_=paper.advance(l,{**e,'scan_id':'s2','candidates':[]},m,first+2*paper.BAR+3000,{'BTCUSDT':[bar(first+paper.BAR)]})
        self.assertEqual(l['tickets'][0]['status'],'DATA_GAP')
        self.assertIsNone(l['tickets'][0]['fill_price'])
    def test_replay_idempotency(self):
        e,m=docs();l,p=paper.advance({},e,m,NOW,{})
        l2,p2=paper.advance(l,e,m,NOW,{})
        self.assertEqual(len(l2['tickets']),1)
        self.assertEqual(p2['summary']['counts'],p['summary']['counts'])
    def test_only_new_events_no_old_backfilled_fills(self):
        e,m=docs();e['candidates'][0]['first_seen_at_utc']=stamp(NOW-4*3600000)
        l,_=paper.advance({},e,m,NOW,{})
        self.assertEqual(l['tickets'],[])
    def test_corrupted_mixed_snapshot_fails(self):
        e,m=docs();m['fetched_at']='2001-01-01T00:00:00Z'
        with self.assertRaisesRegex(RuntimeError,'mixed'):
            paper.advance({},e,m,NOW,{})
if __name__=='__main__':unittest.main()
