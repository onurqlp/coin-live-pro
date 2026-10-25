import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'engine'))
from turan_attribution import summarize
from test_turan_attribution import born as ticket

class CohortTests(unittest.TestCase):
    def test_same_id_different_rules_keep_distinct_cash_cohorts(self):
        a=ticket();a.update(status='CLOSED',realized_net_usdt=10,unrealized_net_usdt=0);b=dict(a);b.update(event_id='other',position_id='other',strategy_version='v2',strategy_config_hash='new')
        report=summarize([a,b])
        self.assertIn('cohorts',report)
        self.assertEqual(len(report['cohorts']),2)
        self.assertEqual({x['strategy_version'] for x in report['cohorts']},{a['strategy_version'],'v2'})
