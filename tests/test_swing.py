import pathlib
import sys
import unittest

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'engine'))
import swing
import mtf

class TestOneToSevenDaySwing(unittest.TestCase):
    def frames(self,daily='UP',h4='UP',weekly='UP',flags=False):
        def item(trend):
            return {'quality':'CLOSED_CONFIRMED','trend':trend,'atr_pct':2.2,
                    'wick_rejections_8':3 if flags else 0,
                    'volume_ratio_20':6.5 if flags else 1.2}
        return {'1D':item(daily),'4H':item(h4),'1W':item(weekly),
                '12H':item(daily),'1H':item(h4),'15m':item(h4),'5m':item(h4)}
    def market(self,change=1,volume=100_000_000,spread=2):
        return {'symbol':'BTCUSDT','price':100,'change':change,
                'volume':volume,'spread_bps':spread}
    def test_daily_and_4h_agreement_creates_long_swing_not_trade(self):
        x=swing.swing_context(self.market(),self.frames(),'LONG')
        self.assertEqual(x['swing_status'],'SWING_CANDIDATE')
        self.assertEqual(x['swing_horizon'],'3-7 gün')
        self.assertTrue(x['direction_aligned_4h_1d'])
        self.assertIsNone(x['open_interest_change_pct'])
        self.assertLess(x['structure_risk_score'],20)
    def test_short_is_symmetric_and_daily_controls_direction(self):
        x=swing.swing_context(self.market(change=-3),self.frames('DOWN','DOWN','DOWN'),'SHORT')
        self.assertEqual(x['swing_status'],'SWING_CANDIDATE')
        self.assertEqual(x['swing_direction'],'SHORT')
        self.assertEqual(x['swing_horizon'],'3-7 gün')
    def test_daily_4h_conflict_blocks_swing_even_if_micro_positive(self):
        x=swing.swing_context(self.market(),self.frames('DOWN','UP','DOWN'),'LONG')
        self.assertEqual(x['swing_status'],'WAIT_4H_1D')
        self.assertIn('4H_1D_DIRECTION_MISMATCH',x['structure_flags'])
        self.assertLessEqual(swing.gate_score(99,x),52)
    def test_partial_daily_history_never_becomes_confirmed_swing(self):
        f=self.frames()
        f['1D']={'quality':'NO_HISTORY','trend':'UNKNOWN'}
        x=swing.swing_context(self.market(),f,'LONG')
        self.assertEqual(x['swing_status'],'NO_HISTORY')
        self.assertLessEqual(swing.gate_score(95,x),40)
    def test_unusual_wicks_spread_volume_and_funding_are_risk_not_proof(self):
        x=swing.swing_context(self.market(change=25,volume=8_000_000,spread=50),
            self.frames(flags=True),'LONG',{'funding_rate':.002,'open_interest_usd':1_000_000})
        self.assertEqual(x['swing_status'],'AVOID_RISK')
        self.assertEqual(x['structure_risk_label'],'ÇOK YÜKSEK')
        self.assertIn('WIDE_SPREAD_35BPS',x['structure_flags'])
        self.assertIn('EXTREME_FUNDING_RATE',x['structure_flags'])
        self.assertIn('4H_REPEATED_LONG_WICKS',x['structure_flags'])
        self.assertLessEqual(swing.gate_score(100,x),39)
        self.assertIn('not proof',x['risk_method'].lower())
    def test_missing_funding_and_oi_explicitly_unknown(self):
        x=swing.swing_context(self.market(),self.frames(),'LONG')
        self.assertIsNone(x['funding_rate'])
        self.assertIsNone(x['open_interest_usd'])
        self.assertIn('FUNDING_NOT_VERIFIED',x['structure_flags'])
        self.assertIn('OI_CHANGE_NOT_VERIFIED',x['structure_flags'])

if __name__=='__main__':unittest.main()
