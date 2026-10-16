import copy
import datetime as dt
import pathlib
import sys
import unittest

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'engine'))
import v4_lifecycle as life
import v4_strategies as strat

NOW=int(dt.datetime(2026,10,16,18,30,tzinfo=dt.timezone.utc).timestamp()*1000)
def when(ms):return life.iso(ms)
P={'policy_version':'4.0.0-research-20261016','discovery_min_score':50,
   'motion_min_score':65,'spotlight_min_score':78,'max_spotlight':5,
   'max_motion':12,'max_watch':28,'watch_hours':36,'motion_hours':72,
   'spotlight_hours':168}
def proposal(strategy='TREND_BREAKOUT',side='LONG',motion=False,spotlight=False,entry=False,evidence=None):
    return {'strategy_id':strategy,'strategy_version':'4.0.0-strategies-a1',
      'symbol':'BTCUSDT','side':side,'score':84,'risk_score':10,'discovery':True,
      'motion':motion,'spotlight':spotlight,'entry_eligible':entry,
      'reason_codes':['TEST_CLOSED_BAR'],'metrics_used':{'rsi':55},
      'source_candle_closed_at_utc':when(evidence or NOW-60000),
      'h4_candle_closed_at_utc':when(NOW-3600000),
      'price':100.,'stop':98.,'targets':[102.,104.,106.],
      'market_quality':'VERIFIED_CLOSED_OHLC'}

class TestV4Lifecycle(unittest.TestCase):
    def test_watch_cannot_jump_directly_to_spotlight(self):
        x=proposal(motion=True,spotlight=True,entry=True)
        state=life.evolve({},[x],'a',NOW,P)
        self.assertEqual(state['items'][0]['lifecycle_stage'],'WATCH')
        self.assertEqual(state['items'][0]['paper_entry_state'],'NOT_ELIGIBLE')

    def test_motion_then_spotlight_requires_new_closed_bar(self):
        a=life.evolve({},[proposal()],'scan1',NOW,P)
        repeated=life.evolve(a,[proposal(motion=True,spotlight=True,entry=True)],
                             'scan2',NOW+30000,P)
        self.assertEqual(repeated['items'][0]['lifecycle_stage'],'WATCH')
        b=life.evolve(repeated,[proposal(motion=True,evidence=NOW+900000)],
                       'scan3',NOW+920000,P)
        self.assertEqual(b['items'][0]['lifecycle_stage'],'MOTION')
        c=life.evolve(b,[proposal(motion=True,spotlight=True,entry=True,evidence=NOW+1800000)],
                       'scan4',NOW+1810000,P)
        self.assertEqual(c['items'][0]['lifecycle_stage'],'SPOTLIGHT')
        self.assertEqual(c['items'][0]['paper_entry_state'],'ELIGIBLE')
        self.assertEqual(sum(e['type']=='ENTRY_ELIGIBLE' for e in c['events']),1)
        d=life.evolve(c,[proposal(motion=True,spotlight=True,entry=True,evidence=NOW+1800000)],
                       'scan4',NOW+1810000,P)
        self.assertEqual(len(d['events']),len(c['events']))

    def test_pending_review_cannot_qualify_paper(self):
        state=life.evolve({},[proposal()],'scan1',NOW,P)
        pending=life.evolve(state,[],'scan2',NOW+300000,P)
        row=pending['items'][0]
        self.assertEqual(row['review_state'],'RECHECK_PENDING')
        self.assertEqual(row['paper_entry_state'],'NOT_ELIGIBLE')
        self.assertEqual(row['lifecycle_stage'],'WATCH')

    def test_strategy_side_and_identity_are_independent(self):
        d=life.evolve({},[proposal(side='LONG'),proposal(side='SHORT')],
                      'scan1',NOW,P)
        self.assertEqual(len(d['items']),2)
        self.assertEqual(len({x['setup_id'] for x in d['items']}),2)
        other=life.evolve(d,[proposal(strategy='SHORT_BREAKDOWN',side='SHORT')],
                          'scan2',NOW+30000,P)
        self.assertEqual(len(other['items']),3)

    def test_stale_retired_but_not_traded_as_loss(self):
        a=life.evolve({},[proposal()],'a',NOW,P)
        b=life.evolve(a,[],'b',NOW+37*3600000,P)
        self.assertEqual(b['archived_count'],1)
        self.assertEqual(b['items'],[])
        self.assertTrue(any(e['type']=='ARCHIVED' and
                            e['reason_codes']==['STALE_UNVERIFIED'] for e in b['events']))
        self.assertFalse(any(e['type'] in ('PAPER_FILLED','ADVERSE_1R') for e in b['events']))

    def test_policy_cannot_promote_using_source_error(self):
        a=life.evolve({},[proposal()],'a',NOW,P)
        b=life.evolve(a,[proposal(motion=True,evidence=NOW+600000)],
                      'b',NOW+610000,P,source_ok=False)
        self.assertEqual(b['items'][0]['review_state'],'SOURCE_ERROR')
        self.assertEqual(b['items'][0]['lifecycle_stage'],'WATCH')

    def test_public_spotlight_is_top_five(self):
        a=life.evolve({},[proposal()],'a',NOW,P)
        view=life.project_view(a,'scan',{'mtf':when(NOW),'spark':when(NOW)},P)
        self.assertEqual(view['counts']['watch'],1)
        self.assertEqual(view['counts']['spotlight'],0)
        self.assertTrue(view['no_real_orders'])

class TestStrategies(unittest.TestCase):
    def frames(self,now=NOW):
        f={}
        for key,duration in strat.PERIOD.items():
            f[key]={'quality':'CLOSED_CONFIRMED','last_candle_utc':when(now-duration),
               'trend':'UP','close':101.,'breakout_high_prev8':99.,
               'breakout_low_prev8':105.,'rsi_14':61.,'adx_14':25.,
               'volume_ratio_20':1.9,
               'macd_12_26_9':{'hist_pct':0.32,'hist_prev_pct':0.15},
               'bb_compression_percentile_30':20}
        return f
    def candidate(self):
        return {'symbol':'BTCUSDT','side':'LONG','quality':'COMPLETE',
                'score':85,'structure_risk_score':10,'frames':self.frames()}
    def market(self):
        return {'price':101.,'volume':400000000.,'spread_bps':1.,
                'listing_age_days':500,'instrument_state':'live'}
    def test_factor_families_and_side_safe_motion(self):
        x=strat.evaluator(self.candidate(),self.market(),now_ms=NOW)
        self.assertTrue(x)
        self.assertIn('TREND_BREAKOUT',[z['strategy_id'] for z in x])
        self.assertIn('VOLATILITY_SQUEEZE',[z['strategy_id'] for z in x])
        self.assertEqual(len({z['strategy_id'] for z in x}),len(x))
        self.assertTrue(all('factor_groups' in z for z in x))
        self.assertFalse(any(z['entry_eligible'] for z in x))
    def test_open_candle_rejected(self):
        d=self.candidate();d['frames']['1H']['quality']='NOT_CLOSED'
        self.assertEqual(strat.evaluator(d,self.market(),now_ms=NOW),[])
    def test_missing_spread_blocks_discovery(self):
        m=self.market();m['spread_bps']=None
        self.assertEqual(strat.evaluator(self.candidate(),m,now_ms=NOW),[])
    def test_oi_snapshot_alone_cannot_invent_pressure(self):
        x=self.candidate();x['open_interest_change_pct']=None
        self.assertNotIn('OI_FUNDING_PRESSURE',
            [z['strategy_id'] for z in strat.evaluator(x,self.market(),now_ms=NOW)])
    def test_future_open_candle_cannot_make_signal(self):
        c=self.candidate()
        c['frames']['15m']['last_candle_utc']=when(NOW)
        self.assertFalse(strat.evaluator(c,self.market(),now_ms=NOW))

if __name__=='__main__':unittest.main()
