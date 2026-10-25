import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'engine'))
import uzayx_adaptive as adaptive

class BaselineTests(unittest.TestCase):
    def test_worse_model_is_reported_against_same_zero_reference(self):
        self.assertTrue(hasattr(adaptive,'forecast_quality'),'paired forecast baseline is missing')
        rows=[{'strategy_version':'v2','prediction':{'expected_paper_return_pct':2},'outcome':{'baseline_return_pct':-1}},
              {'strategy_version':'v2','prediction':{'expected_paper_return_pct':None},'outcome':{'baseline_return_pct':20}},
              {'strategy_version':'v1','prediction':{'expected_paper_return_pct':1},'outcome':{'baseline_return_pct':1}}]
        q=adaptive.forecast_quality(rows)
        current=next(c for c in q['cohorts'] if c['strategy_version']=='v2')
        self.assertEqual(q['paired_count'],2)
        self.assertEqual(q['excluded_count'],1)
        self.assertEqual(current['paired_count'],1)
        self.assertEqual(current['model_mae_pct'],3)
        self.assertEqual(current['zero_baseline_mae_pct'],1)
        self.assertFalse(current['beats_zero_baseline'])
        self.assertEqual(current['mae_skill_pct'],-200)

    def test_empty_forecasts_do_not_imply_perfect_model(self):
        self.assertTrue(hasattr(adaptive,'forecast_quality'),'paired forecast baseline is missing')
        q=adaptive.forecast_quality([])
        self.assertIsNone(q['model_mae_pct'])
        self.assertIsNone(q['mae_skill_pct'])
        self.assertFalse(q['beats_zero_baseline'])
