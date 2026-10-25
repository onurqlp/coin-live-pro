import unittest
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'engine'))
import turan_experiments as exp

class PairedTests(unittest.TestCase):
    def test_missing_arm_excluded_from_pair_but_retained_in_coverage(self):
        def item(key,original,inverse,version='v2'):
            return dict(experiment_id=key,strategy_id='T001',strategy_version=version,rules_hash=version,
                symbol='BTCUSDT',exchange='OKX',contract_type='USDT-SWAP',episode_id='same-market-event',
                experiment_policy='fixed',decision_ms=3600000,
                arms={'ORIGINAL':{'status':'CLOSED','modeled_net_usdt':original},
                    'INVERSE':{'status':'SOURCE_GAP' if inverse is None else 'CLOSED','modeled_net_usdt':inverse},
                    'WAIT':{'status':'NO_CONFIRMATION','modeled_net_usdt':0},'NO_TRADE':{'status':'BENCHMARK','modeled_net_usdt':0}})
        self.assertTrue(hasattr(exp,'report_results'),'paired versioned comparisons are missing')
        result=exp.report_results([item('a',-1,2),item('b',10,None),item('c',1,-2,'v1')])
        group=next(x for x in result['cohorts'] if x['strategy_version']=='v2')
        self.assertEqual(group['experiments'],2)
        self.assertEqual(group['original_inverse']['paired_count'],1)
        self.assertEqual(group['original_inverse']['original_modeled_usdt'],-1)
        self.assertEqual(group['original_inverse']['inverse_modeled_usdt'],2)
        self.assertEqual(group['original_inverse']['excluded_count'],1)
        self.assertEqual(group['episode_clusters'],1)
        self.assertIsNone(group['complete_net_usdt'])
        self.assertFalse(result['portfolio_return'])
