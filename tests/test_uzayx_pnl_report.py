import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import uzayx_pnl_report as pnl

NOW='2026-10-21T09:00:00+00:00'
def fixture():
    registry=[dict(id=f'T{i:03}', name=f'Strategy {i}', role='ENTRY_HYPOTHESIS' if i<=53 else 'CONTROL_OR_RESEARCH' if i<=86 else 'SOURCE_DEPENDENT_HYPOTHESIS',state='IMPLEMENTED_FORWARD_PAPER' if i<=53 else 'IMPLEMENTED_CONTROL' if i<=86 else 'BLOCKED_REQUIRED_EVIDENCE') for i in range(1,201)]
    rows=[
      {'event_id':'a','symbol':'BTCUSDT','side':'LONG','status':'CLOSED','is_real_trade':False,
       'strategy_id':'T001','turan_strategy_id':'T001','strategy_ids':['T001','T002'],
       'attribution_kind':'EXACT_TURAN_RULE_AT_BIRTH','signal_at_utc':'2026-10-19T06:00:00Z',
       'strategy_version':'v1','strategy_config_hash':'frozen-rule',
       'decision_at_utc':'2026-10-19T06:00:00Z','source_1h_candle':'2026-10-19T05:00:00Z',
       'strategy_evidence':{'matched_conditions':[['z','>=',2.5]],'observed':{'z':3}},
       'features_at_birth':{'1H':{'atr_pct':1}},
       'realized_net_usdt':10.,'unrealized_net_usdt':0.,'fees_estimated_usdt':1.,
       'exits':[{'closed_at_utc':'2026-10-20T08:00:00+00:00','net_usdt':10.}]},
      {'event_id':'b','symbol':'ETHUSDT','side':'SHORT','status':'OPEN','is_real_trade':False,
       'strategy_id':None,'realized_net_usdt':2.,'unrealized_net_usdt':-3.,'fees_estimated_usdt':1.,
       'exits':[{'closed_at_utc':'2026-10-21T08:00:00Z','net_usdt':2.}]}
    ]
    return ({'last_scan_id':'s','tickets':rows},
            {'scan_id':'s','no_real_orders':True,'all_events_count':2,'starting_balance_usdt':1000.,
             'summary':{'counts':{'CLOSED':1,'OPEN':1},'realized_net_usdt':12.,
                        'unrealized_net_usdt':-3.,'virtual_equity_usdt':1009.,
                        'estimated_fees_usdt':2.}},
            {'scan_id':'s','publication_valid':True,'no_real_orders':True,'finished_at_utc':NOW},
            {'no_real_orders':True,'registry_count':200,'registry':registry})

class PNLReportTest(unittest.TestCase):
    def test_independent_strategy_cash_and_legacy(self):
        inputs=fixture();x=pnl.build(*inputs)
        self.assertEqual(x['ledger_count'],2)
        self.assertEqual(x['total_pnl_usdt'],9)
        self.assertEqual(x['strategy_activation'],{'paper_active':53,'blocked_source':114,'controls_active':33,'real_live':0})
        self.assertEqual(x['strategies'][0]['realized'],10)
        self.assertEqual(x['strategies'][1]['realized'],0)
        self.assertEqual(x['strategies'][1]['supporting_matches'],1)
        self.assertEqual(x['legacy_unassigned'][0]['realized'],2)
        self.assertEqual(x['daily_realized_usdt'][1],2)
        self.assertEqual(x['daily_realized_usdt'][7],12)
        self.assertEqual(x['rolling_48h']['realized_net_usdt'],12)
        self.assertEqual(x['rolling_48h']['exit_count'],2)
        self.assertEqual(x['rolling_48h']['positive_exits'],2)
        self.assertEqual(x['rolling_48h']['negative_exits'],0)
    def test_rolling_48h_has_descriptive_groups_and_excludes_boundary(self):
        a,b,c,d=fixture()
        ticket=a['tickets'][1]
        ticket['realized_net_usdt']=-2.
        ticket['exits'][0].update(net_usdt=-2.,kind='STOP',closed_at_utc='2026-10-21T09:00:00Z')
        a['tickets'][0]['exits'].append({'closed_at_utc':'2026-10-19T09:00:00Z','net_usdt':0.,'kind':'TP2'})
        b['summary']['realized_net_usdt']=8.
        b['summary']['virtual_equity_usdt']=1005.
        report=pnl.build(a,b,c,d)['rolling_48h']
        self.assertEqual(report['exit_count'],2)
        self.assertEqual(report['realized_net_usdt'],8.)
        self.assertIn('causal_conclusion', report)
        self.assertFalse(report['causal_conclusion'])
        self.assertEqual({x['key']:x['realized_net_usdt'] for x in report['by_side']},
                         {'LONG':10.,'SHORT':-2.})
        self.assertEqual(report['by_symbol'][0]['key'],'ETHUSDT')
        self.assertEqual(report['by_exit_kind'][0]['key'],'STOP')
        self.assertEqual(report['by_strategy'][0]['key'],'UNATTRIBUTED')

    def test_cash_drift_fails_closed(self):
        a,b,c,d=fixture();b['summary']['virtual_equity_usdt']+=10
        with self.assertRaisesRegex(ValueError,'PNL_CASH_RECONCILIATION_FAILED'):
            pnl.build(a,b,c,d)
    def test_no_credit_for_strat_id_without_birth_proof(self):
        a,b,c,d=fixture();a['tickets'][0]['attribution_kind']='LEGACY';x=pnl.build(a,b,c,d)
        self.assertEqual(x['strategies'][0]['primary_ticket_count'],0)
        self.assertEqual(sum(g['realized'] for g in x['legacy_unassigned']),12)
    def test_exit_reconciliation_fails_closed(self):
        a,b,c,d=fixture();a['tickets'][1]['exits'][0]['net_usdt']=20
        with self.assertRaisesRegex(ValueError,'PNL_EXIT_LEDGER_MISMATCH'):
            pnl.build(a,b,c,d)
    def test_birth_flag_without_frozen_rule_cannot_receive_strategy_pnl(self):
        a,b,c,d=fixture();a['tickets'][0].pop('strategy_evidence')
        x=pnl.build(a,b,c,d)
        self.assertEqual(x['strategies'][0]['realized'],0)
        self.assertEqual(x['attribution']['counts']['CANDIDATE'],1)

if __name__=='__main__':unittest.main()
