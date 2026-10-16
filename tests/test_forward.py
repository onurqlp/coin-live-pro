import copy
import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'engine'))
import forward

H=forward.BAR4
DAY=forward.DAY

def observation(t,side='LONG',stage='WATCH'):
    return {'event_id':'v3|'+side+'|'+stage,'symbol':'BTCUSDT','side':side,'stage':stage,
      'price':100,'stop':98 if side=='LONG' else 102,
      'target_1r':102 if side=='LONG' else 98,
      'primary_tf':'4H','model_version':'3.0.0-htf-sparks','at_ms':t,
      'risk_score':5,'score':80}

def bar(t,hi=101,lo=99):
    return {'t':t,'o':100,'h':hi,'l':lo,'c':100}

class TestForwardOnly(unittest.TestCase):
    def test_do_not_backfill_old_events_or_fabricate_pnl(self):
        t=H*100+500
        ev=observation(t)
        older={**ev,'event_id':'legacy','model_version':'2.4.0-htf-sparks'}
        rows,added=forward.register([older,ev],[])
        self.assertEqual(added,1)
        self.assertEqual(rows[0]['status'],'TRACKING')
        self.assertIsNone(rows[0]['realized_R'])
        self.assertFalse(rows[0]['is_executed_trade'])
        rows,count=forward.register([ev],rows)
        self.assertEqual(count,0)
    def test_pre_observation_candle_never_counts(self):
        t=H*100+500;start=H*101
        ev=forward.register([observation(t)],[])[0][0]
        result=forward.evaluate(ev,[bar(H*100,hi=105),bar(start,hi=101)],start+H+2000)
        self.assertEqual(result['status'],'TRACKING')
        self.assertLess(result['mfe_pct'],2)
    def test_long_and_short_symmetric(self):
        t=H*100+500;start=H*101
        for side,high,low in [('LONG',103,99),('SHORT',101,97)]:
            ev=forward.register([observation(t,side)],[])[0][0]
            result=forward.evaluate(ev,[bar(start,high,low)],start+H+2000)
            self.assertEqual(result['status'],'FAVORABLE_1R')
        ev=forward.register([observation(t,'SHORT')],[])[0][0]
        self.assertEqual(forward.evaluate(ev,[bar(start,103,99)],start+H+2000)['status'],'ADVERSE_1R')
    def test_same_candle_collision_never_counts_as_win(self):
        t=H*100+500;start=H*101
        ev=forward.register([observation(t)],[])[0][0]
        r=forward.evaluate(ev,[bar(start,103,97)],start+H+2000)
        self.assertEqual(r['status'],'AMBIGUOUS')
        self.assertIsNone(r['realized_R'])
    def test_missing_middle_candle_is_gap(self):
        t=H*100+500;start=H*101
        ev=forward.register([observation(t)],[])[0][0]
        r=forward.evaluate(ev,[bar(start),bar(start+H*2,hi=103)],start+H*3+2000)
        self.assertEqual(r['status'],'DATA_GAP')
    def test_no_wins_from_small_sample(self):
        now=100*DAY+2000
        result=forward.build({'events':[]},{'events':[observation(now-H*2)]},
                             lambda inst,tf:[bar(((now-H*2)//H+1)*H,103,99)],now)
        rep=result['reports'][0]
        self.assertEqual(rep['favorable_1r'],1)
        self.assertIsNone(rep['observed_direction_rate_pct'])
        self.assertTrue(rep['rate_is_not_win_probability'])
    def test_expired_does_not_become_loss_or_success(self):
        t=H*100+500;start=H*101
        ev=forward.register([observation(t)],[])[0][0]
        expiry=t+3*DAY
        bars=[bar(start+i*H) for i in range(18)]
        r=forward.evaluate(ev,bars,expiry+2000)
        self.assertEqual(r['status'],'EXPIRED')
    def test_fetch_failure_never_changes_old_good_state(self):
        now=100*DAY
        ev=forward.register([observation(now-3*H)],[])[0][0]
        doc=forward.build({'events':[ev]},{'events':[]},
                          lambda *_: (_ for _ in ()).throw(OSError('timeout')),now)
        self.assertEqual(doc['events'][0]['status'],'TRACKING')
        self.assertFalse(doc['events'][0]['data_fresh'])

if __name__=='__main__':unittest.main()
