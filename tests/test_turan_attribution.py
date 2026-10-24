import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'engine'))
import turan_attribution as a


def born():
    return dict(event_id='ticket',strategy_id='T001',turan_strategy_id='T001',
        strategy_version='v1',strategy_config_hash='hash',symbol='BTCUSDT',side='LONG',
        attribution_kind='EXACT_TURAN_RULE_AT_BIRTH',
        decision_at_utc='2026-10-24T08:05:00Z',source_1h_candle='2026-10-24T07:00:00Z',
        strategy_evidence={'matched_conditions':[['z','>=',2.5]],'observed':{'z':3}},
        features_at_birth={'1H':{'atr_pct':1}})


class AttributionTests(unittest.TestCase):
    def test_flags_or_current_matches_are_not_historical_evidence(self):
        self.assertEqual(a.classify({'strategy_id':'T001','turan_strategy_id':'T001',
            'attribution_kind':'EXACT_TURAN_RULE_AT_BIRTH'})['level'],'CANDIDATE')
        self.assertEqual(a.classify({})['level'],'UNATTRIBUTED')

    def test_birth_record_reconstruction_requires_time_and_frozen_rule(self):
        self.assertEqual(a.classify(born())['level'],'RECONSTRUCTED')
        x=born();x['decision_at_utc']='2026-10-24T07:59:59Z'
        self.assertEqual(a.classify(x)['level'],'CANDIDATE')
        x=born();x['strategy_evidence']['observed']['z']=0
        self.assertEqual(a.classify(x)['level'],'CANDIDATE')

    def test_full_chain_requires_availability_before_decision(self):
        x=born();x.update(signal_id='sig',evaluation_id='eval',cycle_id='cycle',snapshot_id='snap',
            strategy_event_id='source-event',source_scan_id='s',position_id='ticket',
            ledger_id='UZAYX_SHARED_SPARK_PAPER',source_available_at='2026-10-24T08:04:00Z',
            decision_at='2026-10-24T08:04:30Z',exchange='OKX',contract_type='USDT-SWAP')
        self.assertEqual(a.classify(x)['level'],'EXACT')
        x['source_available_at']='2026-10-24T08:05:01Z'
        self.assertEqual(a.classify(x)['level'],'CANDIDATE')

    def test_primary_only_pnl_and_duplicate_ticket_rejected(self):
        x=born();x.update(status='CLOSED',realized_net_usdt=10,unrealized_net_usdt=0,
            strategy_ids=['T001','T002'],fees_estimated_usdt=1)
        result=a.summarize([x])
        self.assertEqual(result['counts']['RECONSTRUCTED'],1)
        self.assertEqual(result['attributed_modeled_pnl_usdt'],10)
        self.assertEqual(result['by_strategy']['T001']['modeled_pnl_usdt'],10)
        self.assertNotIn('T002',result['by_strategy'])
        with self.assertRaises(ValueError):a.summarize([x,x])
