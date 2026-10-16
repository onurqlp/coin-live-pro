import copy
import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'engine'))
import spark

class TestMacroSwingSparks(unittest.TestCase):
    def state(self,trend='UP'):
        return {'quality':'CLOSED_CONFIRMED','trend':trend,
                'last_candle_utc':'2026-10-16T08:00:00+00:00',
                'atr_pct':1.4,'breakout_high_prev8':105.2,
                'breakout_low_prev8':94.4}
    def record(self,side='LONG',weekly='UP',daily='UP',h4='UP',status='SWING_CANDIDATE',risk=14):
        frames={tf:self.state() for tf in ['1W','1D','4H','1H','15m','5m']}
        frames['1W']['trend']=weekly
        frames['1D']['trend']=daily
        frames['4H']['trend']=h4
        return {'symbol':'BTCUSDT','side':side,'swing_status':status,
                'quality':'COMPLETE','score':82,'structure_risk_score':risk,
                'structure_risk_label':'DÜŞÜK','setup_type':'TREND_CONTINUATION',
                'frames':frames,'reason_codes':[],'structure_flags':[]}
    def market(self):
        return {'symbol':'BTCUSDT','price':100.,'volume':200_000_000}
    def micro(self,trend='UP'):
        return self.state(trend)

    def test_weekly_daily_4h_candidate_shows_daily_3_to_7_day_chart(self):
        x=spark.spark_from_mtf(self.record(),self.market())
        self.assertIsNotNone(x)
        self.assertEqual(x['primary_tf'],'1D')
        self.assertEqual(x['expected_holding'],'3–7 gün')
        self.assertEqual(x['stage'],'WATCH')
        self.assertEqual(x['confirmation']['1m'],False)
        self.assertFalse(x['confirmation']['1m_available'])
    def test_weekly_opposition_gives_4h_chart_without_vetoing_daily_4h(self):
        x=spark.spark_from_mtf(self.record(weekly='DOWN'),self.market())
        self.assertEqual(x['primary_tf'],'4H')
        self.assertEqual(x['expected_holding'],'1–3 gün')
        self.assertEqual(x['side'],'LONG')
    def test_short_symmetry_with_all_confirmations(self):
        x=self.record(side='SHORT',weekly='DOWN',daily='DOWN',h4='DOWN')
        for tf in ('1H','15m','5m'):x['frames'][tf]['trend']='DOWN'
        y=spark.spark_from_mtf(x,self.market(),self.micro('DOWN'))
        self.assertEqual(y['stage'],'CONFIRMED')
        self.assertEqual(y['side'],'SHORT')
        self.assertEqual(y['primary_tf'],'1D')
        self.assertTrue(all(y['confirmation'][key] for key in ('1H','15m','5m','1m')))
    def test_micro_candles_can_never_invent_spark_without_macro(self):
        bad=self.record(daily='DOWN',h4='UP')
        self.assertIsNone(spark.spark_from_mtf(bad,self.market(),self.micro()))
        bad=self.record(status='WAIT_4H_1D')
        self.assertIsNone(spark.spark_from_mtf(bad,self.market(),self.micro()))
        bad=self.record(status='SWING_WATCH',risk=57)
        self.assertIsNone(spark.spark_from_mtf(bad,self.market(),self.micro()))
    def test_one_minute_alone_does_not_confirm(self):
        x=self.record()
        x['frames']['1H']['trend']='DOWN'
        self.assertEqual(spark.spark_from_mtf(x,self.market(),self.micro())['stage'],'WATCH')
        x['frames']['1H']['trend']='UP'
        x['frames']['15m']['trend']='DOWN'
        self.assertEqual(spark.spark_from_mtf(x,self.market(),self.micro())['stage'],'WATCH')
    def test_risk_block_and_low_confidence(self):
        self.assertIsNone(spark.spark_from_mtf(self.record(risk=47),self.market(),self.micro()))
        low=self.record()
        low['score']=52
        self.assertIsNone(spark.spark_from_mtf(low,self.market(),self.micro()))
    def test_forward_history_no_lookahead_no_fake_win(self):
        x=spark.spark_from_mtf(self.record(),self.market())
        d,count=spark.accumulate({'events':[]},[x])
        self.assertEqual(count,1)
        self.assertEqual(len(d['events']),1)
        self.assertIsNone(d['events'][0]['realized_R'])
        self.assertFalse(d['events'][0]['is_executed_trade'])
        d,again=spark.accumulate(d,[x])
        self.assertEqual(again,0)
        y=copy.deepcopy(x);y['stage']='CONFIRMED'
        d,count=spark.accumulate(d,[y])
        self.assertEqual(count,1)
        self.assertEqual(len(d['events']),2)
        self.assertEqual(len(set(e['event_id'] for e in d['events'])),2)

if __name__=='__main__':unittest.main()
