"""Generous EARLY research is not V4 motion, fills or calibrated probability."""
import datetime as dt
import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'engine'))
import v4_early as early

NOW=int(dt.datetime(2026,10,17,12,16,tzinfo=dt.timezone.utc).timestamp()*1000)
def iso(ms):return early.stamp(ms)
def make_frame(tf,trend):
    period={'1W':604800000,'1D':86400000,'4H':14400000,
            '1H':3600000,'15m':900000,'5m':300000}[tf]
    if tf=='1W':start=NOW-8*86400000
    else:start=((NOW//period)-1)*period
    return {'quality':'CLOSED_CONFIRMED','last_candle_utc':iso(start),
            'trend':trend,'volume_ratio_20':.35,
            'close':105,'breakout_high_prev8':104,'breakout_low_prev8':106,
            'macd_12_26_9':{'hist_pct':.02},
            'fakeout_up_on_close':False,'fakeout_down_on_close':False}
def candidate(side='LONG',trend='UP',risk=10):
    frames={tf:make_frame(tf,trend) for tf in ('1W','1D','4H','1H','15m','5m')}
    for frame in frames.values():
        frame['macd_12_26_9']['hist_pct']=-.02 if side=='SHORT' else .02
    return {'symbol':'BTCUSDT','side':side,'quality':'COMPLETE',
            'structure_risk_score':risk,'observed_at_utc':iso(NOW-1000),
            'frames':frames}
def quote():
    return {'symbol':'BTCUSDT','volume':100_000_000,'price':100.,
            'spread_bps':1.,'listing_age_days':500,'instrument_state':'live'}
def sources(x):
    t=iso(NOW-1000)
    return ({'model_version':'3.0.0-mtf-swing','fetched_at':t,'candidates':[x]},
            {'provider':'OKX','rows':[quote()]},
            {'scan_id':'scan-alpha','source_mtf_at':t},
            {'scan_id':'scan-alpha','records':[]})
class TestEarlyResearch(unittest.TestCase):
    def test_weak_volume_but_aligned_candles_still_alert(self):
        x=early.detect(candidate(),quote(),NOW)
        self.assertIsNotNone(x)
        self.assertIn(x['research_tier'],('ERKEN_SINYAL','ISIK_GUCLENIYOR'))
        self.assertIn('WEAK_RELATIVE_VOLUME',x['reasons'])
        self.assertFalse(x['paper_eligible'])
        self.assertFalse(x['verified_technical_entry'])
        self.assertFalse(x['real_order_eligible'])
        self.assertLessEqual(x['research_rank'],100)
    def test_long_and_short_are_symmetric(self):
        long=early.detect(candidate('LONG','UP'),quote(),NOW)
        short=early.detect(candidate('SHORT','DOWN'),quote(),NOW)
        self.assertEqual(long['research_tier'],short['research_tier'])
        self.assertEqual(long['research_rank'],short['research_rank'])
    def test_one_primary_and_one_hour_support_is_enough(self):
        x=candidate()
        x['frames']['1D']['trend']='SIDEWAYS'
        x['frames']['15m']['trend']='SIDEWAYS'
        x['frames']['5m']['trend']='SIDEWAYS'
        result=early.detect(x,quote(),NOW)
        self.assertIsNotNone(result)
        self.assertEqual(result['research_tier'],'KIVILCIM')
    def test_all_candles_opposite_direction_is_not_a_signal(self):
        self.assertIsNone(early.detect(candidate('LONG','DOWN'),quote(),NOW))
    def test_high_structure_risk_and_bad_liquidity_rejected(self):
        self.assertIsNone(early.detect(candidate(risk=75),quote(),NOW))
        q=quote();q['spread_bps']=70
        self.assertIsNone(early.detect(candidate(),q,NOW))
    def test_unclosed_or_future_candle_rejected(self):
        x=candidate()
        x['frames']['4H']['last_candle_utc']=iso(NOW)
        self.assertIsNone(early.detect(x,quote(),NOW))
    def test_repeated_scan_does_not_invent_another_first_price(self):
        args=sources(candidate())
        first,pub=early.build(*args[:3],{},args[3],NOW)
        self.assertEqual(pub['total_fresh_candidates'],1)
        self.assertTrue(pub['no_paper_entries'])
        self.assertEqual(pub['archive_total_discoveries'],1)
        second,pub2=early.build(*args[:3],first,args[3],NOW+1000)
        self.assertEqual(pub2['archive_total_discoveries'],1)
        self.assertEqual(second['events'][0]['first_seen_price'],100)
        self.assertEqual(second['events'][0]['observation_count'],1)
    def test_mixed_scan_blocked(self):
        mtf,market,radar,watch=sources(candidate())
        watch['scan_id']='from-other-scan'
        with self.assertRaisesRegex(RuntimeError,'archive-scan-mismatch'):
            early.build(mtf,market,radar,{},watch,NOW)
    def test_historical_observations_are_not_win_probability(self):
        h=early.reported_result({'records':[
            {'checkpoints':{'1H':{'state':'OBSERVED','close_direction_pct':1.5}}},
            {'checkpoints':{'1H':{'state':'OBSERVED','close_direction_pct':-2.5}}},
            {'checkpoints':{'1H':{'state':'DATA_GAP'}}}]})
        self.assertEqual(h['1H']['observed'],2)
        self.assertEqual(h['1H']['positive_direction'],1)
        self.assertEqual(h['1H']['negative_direction'],1)
        self.assertTrue(h['1H']['not_a_win_rate'])
if __name__=='__main__':unittest.main()
