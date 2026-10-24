import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'engine'))
from test_uzayx_strategy_cash import StrategyCashTests
import uzayx_strategy_bank as bank
import v4_spark_paper as paper


class LineageTests(unittest.TestCase):
    def test_bank_freezes_signal_evaluation_snapshot_and_available_time(self):
        m, q, p, now = StrategyCashTests().fixture()
        feed = bank.build(m, q, p, now)
        rows = {x['strategy_id']: x for x in feed['cycle_evaluations']}
        self.assertEqual(len(rows), 200)
        for signal in feed['signals']:
            self.assertEqual(signal['evaluation_id'], rows[signal['strategy_id']]['evaluation_id'])
            self.assertEqual(signal['cycle_id'], feed['evaluation_cycle_id'])
            self.assertEqual(signal['snapshot_id'], feed['snapshot_id'])
            self.assertLessEqual(bank.early.epoch(signal['bar_close_at']), bank.early.epoch(signal['source_available_at']))
            self.assertLessEqual(bank.early.epoch(signal['source_available_at']), now)
            self.assertEqual(signal['decision_at'], paper.stamp(now))
            born = paper.identity({'scan_id': 's'}, signal, 'GELDI', now)
            for field in ('signal_id', 'evaluation_id', 'cycle_id', 'snapshot_id', 'source_available_at', 'decision_at'):
                self.assertEqual(born[field], signal[field])

    def test_future_observation_does_not_enter_bank(self):
        m, q, p, now = StrategyCashTests().fixture()
        m['fetched_at'] = p['source_mtf_at'] = paper.stamp(now + 1)
        with self.assertRaises(ValueError):
            bank.build(m, q, p, now)
