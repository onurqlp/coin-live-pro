import datetime as dt
import unittest
from unittest.mock import patch

from uzayx_strategy_tournament import H, contest


class TournamentTest(unittest.TestCase):
    def test_only_birth_identified_independent_outcomes_can_pause_cash(self):
        now=40*H
        rows=[];tickets=[]
        for i in range(4):
            key=f'epoch:loss{i}'
            rows.append({'key':key,'strategy_id':'T039','decision_ms':(10+i)*H,
                         'closed_ms':(11+i)*H,'return_pct':-1.0})
            tickets.append({'event_id':f'loss{i}','attribution_kind':'EXACT_TURAN_RULE_AT_BIRTH',
                            'strategy_ids':['T039','T004']})
        book={'epoch_id':'epoch','tickets':tickets}
        with patch('uzayx_strategy_tournament.samples',return_value=(rows,{'independent_coin_episodes':4})):
            report=contest([book],now)
        # Older losing streak has expired; secondary matches cannot be paused.
        self.assertEqual(report['quarantine'],{})
        self.assertEqual(report['board']['T004']['independent_primary_closed'],0)
        self.assertEqual(report['board']['T004']['shared_supporting_closed'],4)
        self.assertIsNone(report['board']['T039']['inverse_pnl_pct'])
        with patch('uzayx_strategy_tournament.samples',return_value=(rows,{})):
            current=contest([book],16*H)
        self.assertIn('T039',current['quarantine'])
        self.assertNotIn('T004',current['quarantine'])
        self.assertEqual(current['promoted'],{})


if __name__=='__main__':unittest.main()
