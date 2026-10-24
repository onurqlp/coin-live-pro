import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'engine'))
import turan_experiments as exp

H = 3600000
B = 300000
NOW = 1792800000000 // H * H + 120000


def fixture(now=NOW):
    stamp = exp.iso(now)
    signal = dict(event_id='event', signal_id='sig-1', evaluation_id='eval-1',
        strategy_id='T001', strategy_ids=['T001', 'T002'], strategy_version='v1',
        strategy_config_hash='rule-1', strategy_signal_ids={'T001':'sig-1','T002':'sig-2'},
        strategy_evaluation_ids={'T001':'eval-1','T002':'eval-2'},
        cycle_id='cycle', snapshot_id='snapshot', symbol='BTCUSDT', side='LONG',
        price_at_scan=100., atr_pct_at_decision=1., decision_at=stamp,
        source_available_at=stamp, source_closed_1h_at_utc=exp.iso((now//H-1)*H),
        spread_bps=2., exchange='OKX', contract_type='USDT-SWAP')
    bank = dict(registry=[dict(id=f'T{i:03}', role='ENTRY_HYPOTHESIS' if i<3 else 'SOURCE_DEPENDENT_HYPOTHESIS',
                strategy_version='v1', strategy_config_hash=f'rule-{i}') for i in range(1,201)],
        signals=[signal], evaluation_cycle_id='cycle', source_mtf_at=stamp, no_real_orders=True)
    manifest = dict(scan_id='scan', publication_valid=True, no_real_orders=True, started_at_utc=stamp)
    pack = dict(source='OKX_CLOSED_CANDLES', source_mtf_at=stamp, candles_by_symbol={})
    return bank, manifest, pack


def run(prior=None, now=NOW, bars=None):
    bank, manifest, pack = fixture(now)
    if prior:
        bank['signals']=[]
    pack['candles_by_symbol']={'BTCUSDT':{'5m':bars or []}}
    return exp.advance(prior or {}, bank, manifest, pack, now)


class ExperimentTests(unittest.TestCase):
    def test_extreme_real_atr_is_recorded_as_risk_block_without_stopping_cycle(self):
        bank,manifest,pack=fixture()
        bank['signals'][0]['atr_pct_at_decision']=53.013
        ledger,report=exp.advance({},bank,manifest,pack,NOW)
        self.assertEqual(report['experiment_count'],2)
        self.assertEqual(report['strategies'][0]['risk_blocked_count'],1)
        for item in ledger['experiments']:
            for key in ('ORIGINAL','INVERSE','WAIT'):
                self.assertEqual(item['arms'][key]['status'],'BLOCKED_RISK')
                self.assertIsNone(item['arms'][key]['modeled_net_usdt'])

    def test_four_independent_arms_and_200_families_without_cash_credit(self):
        ledger, report = run()
        self.assertEqual(len(ledger['experiments']), 2)
        self.assertEqual(len(report['strategies']), 200)
        episode = ledger['experiments'][0]
        self.assertEqual(set(episode['arms']), {'ORIGINAL','INVERSE','WAIT','NO_TRADE'})
        self.assertEqual(episode['arms']['NO_TRADE']['modeled_net_usdt'], 0)
        self.assertTrue(report['separate_from_shared_cash'])
        self.assertIsNone(episode['arms']['ORIGINAL']['complete_net_usdt'])
        self.assertEqual(report['strategies'][2]['learning_state'], 'BLOCKED_SOURCE')

    def test_same_closed_bar_across_cycles_is_one_immutable_experiment(self):
        ledger, _ = run()
        original = copy.deepcopy(ledger['experiments'])
        bank, manifest, pack = fixture(NOW+60000)
        bank['signals'][0].update(signal_id='new-cycle-signal', price_at_scan=140.)
        again, report = exp.advance(ledger, bank, manifest, pack, NOW+60000)
        self.assertEqual(len(again['experiments']), 2)
        self.assertEqual(again['experiments'], original)
        self.assertEqual(report['new_evidence_count'], 0)
        self.assertEqual(report['no_new_evidence_count'], 200)

    def test_inverse_fill_is_independent_and_both_can_lose_after_costs(self):
        ledger, _ = run()
        t=(NOW//B+1)*B
        bars=[[t,100,100.01,99.99,100,1], [t+B,100,100.01,99.99,100,1]]
        ledger, _ = run(ledger, t+2*B+1, bars)
        a=ledger['experiments'][0]['arms']
        self.assertGreater(a['ORIGINAL']['entry_fill'], 100)
        self.assertLess(a['INVERSE']['entry_fill'], 100)
        self.assertLess(a['ORIGINAL']['modeled_unrealized_usdt'], 0)
        self.assertLess(a['INVERSE']['modeled_unrealized_usdt'], 0)
        self.assertIsNone(a['ORIGINAL']['complete_net_usdt'])

    def test_no_unclosed_fill_and_stop_first_when_same_bar_hits_both(self):
        ledger, _=run();t=(NOW//B+1)*B
        bars=[[t,100,104,96,101,1]]
        unfinished,_=run(ledger,t+B-1,bars)
        self.assertEqual(unfinished['experiments'][0]['arms']['ORIGINAL']['status'],'WAITING_FUTURE_BAR')
        finished,_=run(ledger,t+B+1,bars)
        for arm in ('ORIGINAL','INVERSE'):
            a=finished['experiments'][0]['arms'][arm]
            self.assertEqual(a['outcome'],'AMBIGUOUS_STOP_FIRST')
            self.assertLess(a['modeled_net_usdt'],0)

    def test_missing_first_or_intermediate_bar_cannot_create_profit(self):
        ledger,_=run();t=(NOW//B+1)*B
        missing,report=run(ledger,t+2*B+1,[[t+B,100,105,99,104,1]])
        self.assertEqual(missing['experiments'][0]['arms']['ORIGINAL']['status'],'SOURCE_GAP')
        self.assertIsNone(missing['experiments'][0]['arms']['ORIGINAL']['modeled_net_usdt'])
        self.assertEqual(report['new_evidence_count'],0)
        self.assertEqual(missing['last_learning_at_utc'],ledger['last_learning_at_utc'])

    def test_future_decision_and_mixed_pack_are_rejected(self):
        bank,manifest,pack=fixture()
        bank['signals'][0]['decision_at']=exp.iso(NOW+1)
        with self.assertRaises(ValueError):exp.advance({},bank,manifest,pack,NOW)
        bank,manifest,pack=fixture();pack['source_mtf_at']='old'
        with self.assertRaises(ValueError):exp.advance({},bank,manifest,pack,NOW)

    def test_original_prediction_and_input_are_preserved(self):
        bank,manifest,pack=fixture();before=copy.deepcopy(bank)
        ledger,_=exp.advance({},bank,manifest,pack,NOW)
        frozen=copy.deepcopy(ledger)
        run(ledger,NOW+1000)
        self.assertEqual(ledger,frozen)
        self.assertEqual(bank,before)
