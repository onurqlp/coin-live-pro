import copy
import datetime as dt
import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'engine'))
import spark

class TestMacroSwingSparks(unittest.TestCase):
    def state(self,trend='UP',frame='4H'):
        length=spark.mtf.PERIOD[frame]
        last=((spark.MS//length)-1)*length
        return {'quality':'CLOSED_CONFIRMED','trend':trend,
                'last_candle_utc':dt.datetime.fromtimestamp(last/1000,dt.timezone.utc).isoformat(),
                'atr_pct':1.4,'breakout_high_prev8':99.5,
                'breakout_low_prev8':100.5,
                'rsi_14':64 if trend=='UP' else 37,
                'macd_12_26_9':{'hist_pct':.2 if trend=='UP' else -.2},
                'adx_14':28,'volume_ratio_20':1.25,
                'bb_compression_percentile_30':40}
    def record(self,side='LONG',weekly='UP',daily='UP',h4='UP',status='SWING_CANDIDATE',risk=14):
        frames={tf:self.state(frame=tf) for tf in ['1W','1D','4H','1H','15m','5m']}
        frames['1W']['trend']=weekly
        frames['1D']['trend']=daily
        frames['4H']['trend']=h4
        frames['1H']['trend']='SIDEWAYS' # observed, awaiting hourly timing
        return {'symbol':'BTCUSDT','side':side,'swing_status':status,
                'quality':'COMPLETE','score':82,'structure_risk_score':risk,
                'structure_risk_label':'DÜŞÜK','setup_type':'TREND_CONTINUATION',
                'frames':frames,'reason_codes':[],'structure_flags':[]}
    def market(self):
        return {'symbol':'BTCUSDT','price':100.,'volume':200_000_000,'spread_bps':2,'instrument_state':'live','listing_age_days':250}
    def micro(self,trend='UP'):
        return self.state(trend,'1m')

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
    def test_hour_and_15m_confirm_without_1m(self):
        x=self.record();x['frames']['1H']['trend']='UP'
        y=spark.spark_from_mtf(x,self.market())
        self.assertEqual(y['stage'],'CONFIRMED')
        self.assertEqual(y['confirmation_state']['1m'],'NO_HISTORY')
        self.assertEqual(spark.spark_from_mtf(x,self.market(),self.micro('DOWN'))['stage'],'CONFIRMED')
    def test_weekly_opposed_not_mislabeled_missing(self):
        y=spark.spark_from_mtf(self.record(weekly='DOWN'),self.market())
        self.assertEqual(y['confirmation_state']['1W'],'NOT_ALIGNED')
        self.assertEqual(y['primary_tf'],'4H')
    def test_unbroken_levels_cannot_be_confirmed(self):
        x=self.record();x['frames']['1H']['trend']='UP'
        x['frames']['4H']['breakout_high_prev8']=105
        y=spark.spark_from_mtf(x,self.market())
        self.assertEqual(y['stage'],'WATCH')
        self.assertEqual(y['entry_timing'],'BREAKOUT_WAIT')
        self.assertIn('BREAKOUT_NOT_CROSSED',y['strict_gate_reasons'])
    def test_weekly_disagreement_never_strict_confirmed(self):
        x=self.record(weekly='DOWN');x['frames']['1H']['trend']='UP'
        y=spark.spark_from_mtf(x,self.market())
        self.assertEqual(y['stage'],'WATCH')
    def test_spread_and_liquidity_must_be_verified_for_confirmed(self):
        x=self.record();x['frames']['1H']['trend']='UP'
        for bad in ({'spread_bps':None},{'volume':10000000},{'listing_age_days':None},
                    {'instrument_state':'suspend'},{'spread_bps':25}):
            self.assertEqual(spark.spark_from_mtf(x,{**self.market(),**bad})['stage'],'WATCH')
    def test_5m_confirmation_must_be_fresh_and_aligned(self):
        x=self.record();x['frames']['1H']['trend']='UP'
        x['frames']['5m']['trend']='DOWN'
        self.assertEqual(spark.spark_from_mtf(x,self.market())['stage'],'WATCH')
        x['frames']['5m']['trend']='UP'
        x['frames']['15m']['last_candle_utc']='2020-01-01T00:00:00+00:00'
        self.assertEqual(spark.spark_from_mtf(x,self.market())['stage'],'WATCH')
    def test_stale_macro_candle_blocks_candidate(self):
        x=self.record()
        x['frames']['4H']['last_candle_utc']='2020-01-01T00:00:00+00:00'
        self.assertIsNone(spark.spark_from_mtf(x,self.market()))
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
    def test_extended_breakout_is_watch_not_fake_confirmed_entry(self):
        x=self.record();x['frames']['1H']['trend']='UP'
        x['frames']['4H']['breakout_high_prev8']=90
        y=spark.spark_from_mtf(x,self.market())
        self.assertEqual(y['stage'],'WATCH')
        self.assertEqual(y['entry_timing'],'EXTENDED_WAIT')
    def test_missing_closed_technical_never_confirms(self):
        x=self.record();x['frames']['1H']['trend']='UP'
        for bad in (
            ('4H','rsi_14',None),('4H','macd_12_26_9',None),
            ('4H','adx_14',None),('15m','volume_ratio_20',None)
        ):
            y=copy.deepcopy(x)
            y['frames'][bad[0]][bad[1]]=bad[2]
            z=spark.spark_from_mtf(y,self.market())
            self.assertEqual(z['stage'],'WATCH')
            self.assertTrue(any(a in z['strict_gate_reasons'] for a in (
                'RSI_DIRECTION_OR_EXTREME','MACD_MOMENTUM_MISSING',
                'ADX_TREND_TOO_WEAK','CLOSED_VOLUME_INSUFFICIENT')))

    def test_quant_volcano_pressure_is_watch_only(self):
        x=self.record();x['frames']['1H']['trend']='UP'
        x['frames']['4H']['bb_compression_percentile_30']=10
        x['frames']['15m']['volume_ratio_20']=2
        x['frames']['4H']['breakout_high_prev8']=100.7
        y=spark.spark_from_mtf(x,self.market())
        self.assertEqual(y['stage'],'WATCH')
        self.assertTrue(y['pressure_watch'])
        self.assertEqual(y['entry_timing'],'PRESSURE_WATCH')

    def test_persistent_spark_survives_unscanned_cycle(self):
        a=spark.spark_from_mtf(self.record(),self.market())
        initial,_=spark.reconcile_active({},[a],[self.record()],spark.MS)
        retained,_=spark.reconcile_active(initial,[],[],spark.MS+5*60000)
        self.assertEqual(len(retained['items']),1)
        self.assertEqual(retained['items'][0]['review_state'],'RECHECK_PENDING')
        self.assertEqual(retained['items'][0]['stage'],'WATCH')
        self.assertEqual(retained['items'][0]['first_seen_at'],initial['items'][0]['first_seen_at'])

    def test_previous_confirmation_cannot_be_carried_as_current(self):
        x=self.record();x['frames']['1H']['trend']='UP'
        signal=spark.spark_from_mtf(x,self.market())
        self.assertEqual(signal['stage'],'CONFIRMED')
        initial,_=spark.reconcile_active({},[signal],[x],spark.MS)
        retained,_=spark.reconcile_active(initial,[],[],spark.MS+5*60000)
        self.assertEqual(retained['items'][0]['stage'],'WATCH')
        self.assertTrue(retained['items'][0]['confirmation_lost'])
        self.assertEqual(retained['items'][0]['peak_stage'],'CONFIRMED')

    def test_macro_reversal_invalidates_but_does_not_instantly_erase(self):
        first=spark.spark_from_mtf(self.record(),self.market())
        initial,_=spark.reconcile_active({},[first],[],spark.MS)
        contradictory={**self.record(),'side':'SHORT','direction_aligned_4h_1d':False,
                       'swing_status':'WAIT_4H_1D'}
        next_doc,_=spark.reconcile_active(initial,[],[contradictory],spark.MS+300000)
        self.assertEqual(next_doc['items'][0]['review_state'],'INVALIDATED')
        self.assertEqual(next_doc['items'][0]['stage'],'WATCH')
        again,_=spark.reconcile_active(next_doc,[],[],spark.MS+spark.INVALIDATED_MS+300000)
        self.assertEqual(again['items'],[])
        self.assertGreaterEqual(len(again['retired']),1)

    def test_watch_lifetime_is_not_endless(self):
        signal=spark.spark_from_mtf(self.record(),self.market())
        doc,_=spark.reconcile_active({},[signal],[],spark.MS)
        later,_=spark.reconcile_active(doc,[],[],spark.MS+spark.WATCH_MS+60000)
        self.assertEqual(later['items'],[])
        self.assertGreaterEqual(len(later['retired']),1)

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
