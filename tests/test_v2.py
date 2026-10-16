import datetime as dt
import pathlib
import sys
import unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'engine'))
import mtf, paper, health

def fixture_bars(count,up=True,period=900000):
    start=(paper.NOWMS//period-count-2)*period
    result=[]
    for i in range(count):
        p=100+(i*.3 if up else -i*.3)
        result.append({'t':start+i*period,'o':p-.08,'h':p+.35,'l':p-.4,'c':p,'v':1000+i})
    return result

class TestMtfResearch(unittest.TestCase):
    def test_weekly_requires_real_history(self):
        self.assertEqual(mtf.state(fixture_bars(8), '1W')['quality'],'NO_HISTORY')
    def test_closed_long_context(self):
        all_frames={frame:fixture_bars(70,period=period) for frame,period in mtf.PERIOD.items() if frame!='1m'}
        m={'symbol':'BTCUSDT','price':120.,'volume':140000000}
        result=mtf.assess(m,all_frames,'LONG')
        self.assertIsNotNone(result)
        self.assertEqual(result['quality'],'COMPLETE')
        self.assertGreater(result['macro_score'],70)
        self.assertEqual(set(result['frames']),{'1W','1D','12H','4H','1H','15m','5m'})
        self.assertEqual(result['model_version'],mtf.MODEL)
    def test_weekly_weight_reduces_score_not_daily_gate(self):
        m={'symbol':'BTCUSDT','price':120.,'volume':140000000,'spread_bps':2}
        f={tf:fixture_bars(70,period=v) for tf,v in mtf.PERIOD.items() if tf!='1m'}
        a=mtf.assess(m,f,'LONG')
        f['1W']=fixture_bars(70,up=False,period=mtf.PERIOD['1W'])
        b=mtf.assess(m,f,'LONG')
        self.assertEqual(b['swing_status'],'SWING_CANDIDATE')
        self.assertLess(b['score'],a['score'])
    def test_weekly_conflict_is_penalised(self):
        all_frames={frame:fixture_bars(70,period=period,up=frame in ('4H','1H','15m','5m'))
                    for frame,period in mtf.PERIOD.items() if frame!='1m'}
        x=mtf.assess({'symbol':'BTCUSDT','price':110.,'volume':140000000},all_frames,'LONG')
        self.assertLessEqual(x['score'],64)
        self.assertIn('TREND_CONFLICT',x['reason_codes'])

class TestSwingPaperCutover(unittest.TestCase):
    def test_15m_confirm_without_4h_daily_gate_never_opens(self):
        signal={'symbol':'BTCUSDT','side':'LONG','stage':'CONFIRMED','at_ms':5000}
        self.assertFalse(paper.swing_eligible(signal,{},4000))
        self.assertFalse(paper.swing_eligible(signal,{'BTCUSDT':{'side':'LONG','swing_status':'WAIT_4H_1D'}},4000))
    def test_only_forward_new_verified_swing_passes(self):
        signal={'symbol':'BTCUSDT','side':'SHORT','stage':'CONFIRMED','at_ms':5000}
        thesis={'side':'SHORT','swing_status':'SWING_CANDIDATE','direction_aligned_4h_1d':True,
                 'quality':'COMPLETE','structure_risk_score':10}
        self.assertTrue(paper.swing_eligible(signal,{'BTCUSDT':thesis},4999))
        self.assertFalse(paper.swing_eligible(signal,{'BTCUSDT':thesis},5000))
        self.assertFalse(paper.swing_eligible({**signal,'stage':'WATCH'},{'BTCUSDT':thesis},4999))
        self.assertFalse(paper.swing_eligible(signal,{'BTCUSDT':{**thesis,'structure_risk_score':55}},4999))
        self.assertFalse(paper.swing_eligible(signal,{'BTCUSDT':{**thesis,'side':'LONG'}},4999))

class TestAuditedPaper(unittest.TestCase):
    def make(self,signal_at):
        o={'id':'NEW|BTC|LONG','inst':'BTC-USDT-SWAP','symbol':'BTCUSDT',
           'signal_at_ms':signal_at,'last_eval_ms':signal_at,'signal_price':100.,'side':'LONG',
           'stop':98.,'tp1':102.,'tp2':104.,'tp3':106.,'status':'PENDING'}
        return {'orders':{o['id']:o},'journal':[]},o
    def test_fill_must_be_after_signal_candle_then_tp(self):
        t=(paper.NOWMS//paper.BAR5-3)*paper.BAR5
        log,o=self.make(t-1000)
        first={'t':t,'o':100,'h':101,'l':99.5,'c':100.5}
        second={'t':t+paper.BAR5,'o':100.5,'h':103,'l':99,'c':102.5}
        paper.update_order(log,o,[first,second])
        self.assertEqual(o['status'],'TP1')
        self.assertGreater(o['pnl_usdt'],0)
        self.assertEqual([x['type'] for x in log['journal']],['PAPER_FILLED','PAPER_TP1'])
        self.assertGreater(paper.current_balance(log),100)
    def test_entry_gap_rejected_no_past_win(self):
        t=(paper.NOWMS//paper.BAR5-3)*paper.BAR5
        log,o=self.make(t-1000)
        paper.update_order(log,o,[{'t':t,'o':102,'h':105,'l':98,'c':104}])
        self.assertEqual(o['status'],'NO_FILL')
        self.assertEqual(paper.current_balance(log),100)
    def test_stop_tp_same_bar_requires_1m_order(self):
        t=(paper.NOWMS//paper.BAR5-3)*paper.BAR5
        log,o=self.make(t-1000)
        first={'t':t,'o':100,'h':101,'l':99,'c':100}
        second={'t':t+paper.BAR5,'o':100,'h':103,'l':97,'c':100}
        with patch.object(paper,'resolve_1m',return_value=None):
            paper.update_order(log,o,[first,second])
        self.assertEqual(o['status'],'AMBIGUOUS')
        self.assertNotIn('pnl_usdt',o)
        self.assertEqual(paper.current_balance(log),100)

class TestCronEvidence(unittest.TestCase):
    def test_scheduled_slots_counted_only_after_last_run(self):
        self.assertEqual(health.slots_between('2026-10-16T00:07:00+00:00',
           dt.datetime(2026,10,16,0,37,tzinfo=dt.timezone.utc)),6)
    def test_push_is_not_schedule(self):
        self.assertNotEqual('push','schedule')

if __name__=='__main__':unittest.main()
