import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'engine'))
import uzayx_strategy_bank as bank
from turan_core import summarize_observations
import uzayx_research as research
from test_uzayx_strategy_cash import StrategyCashTests

class RuleIntegrityTests(unittest.TestCase):
    def scenario(self, failed_up):
        rows=[dict(t=i*bank.H,o=100,h=101,l=99,c=100,v=10) for i in range(30)]
        if failed_up:
            rows[-2].update(h=105,c=104);rows[-1].update(o=104,h=104.5,l=99.5,c=100)
        else:
            rows[-2].update(l=95,c=96);rows[-1].update(o=96,h=100.5,l=95.5,c=100)
        c={'frames':{'1H':{'atr_pct':1,'trend':'UP'},'4H':{'trend':'UP'},'1D':{'trend':'UP'}}}
        return rows,c

    def test_failed_breakout_enters_against_failed_impulse(self):
        for failed_up,want in [(True,'SHORT'),(False,'LONG')]:
            rows,c=self.scenario(failed_up)
            got=[side for side in ['LONG','SHORT'] if bank.matches(bank.RULES[154],bank.metrics(c,rows,[],[],side))]
            self.assertEqual(got,[want])

    def test_bank_evaluates_both_directions_from_same_snapshot(self):
        m,q,p,now=StrategyCashTests().fixture()
        report=bank.build(m,q,p,now)
        self.assertEqual(report['direction_evaluation']['evaluated_coin_directions'],2)
        self.assertEqual(report['registry'][0]['evaluated_candidates'],2)
        self.assertTrue(all(s['bar_close_at']<=s['decision_at'] for s in report['signals']))

    def test_legacy_rule_observations_do_not_count_as_current_rule(self):
        e={'strategy_id':'T154','strategy_version':'v1','config_hash':'old','source_venue':'OKX','horizons':{}}
        self.assertEqual(summarize_observations([e],{'T154':{'strategy_version':'v2','strategy_config_hash':'new'}}),{})

    def test_new_research_observations_use_bank_version_and_direction(self):
        m,q,p,now=StrategyCashTests().fixture()
        feed=bank.build(m,q,p,now)
        ledger=research.observe({},m,p,'s',now,bank_feed=feed)
        self.assertGreater(len(ledger['events']),0)
        for event in ledger['events']:
            self.assertEqual(event['strategy_version'],bank.VERSION)
            self.assertEqual(event['config_hash'],next(r['strategy_config_hash'] for r in feed['registry'] if r['id']==event['strategy_id']))
