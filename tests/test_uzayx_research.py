import copy
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'engine'))
import v4_spark_paper as spark
from test_v4_spark_paper import docs, NOW, bar


class ProspectiveIdentity(unittest.TestCase):
    def test_new_native_identity_is_not_a_guessed_turan_family(self):
        early, mtf = docs()
        ledger, public = spark.advance({}, early, mtf, NOW, {})
        ticket = ledger['tickets'][0]
        self.assertEqual(ticket.get('strategy_id'), 'SPARK_KIVILCIM')
        self.assertIsNone(ticket.get('turan_strategy_id'))
        self.assertEqual(ticket['source_scan_id'], early['scan_id'])
        self.assertEqual(ticket['parent_event_id'], ticket['event_id'])
        self.assertEqual(len(ticket['strategy_config_hash']), 64)
        replay, _ = spark.advance(copy.deepcopy(ledger), early, mtf, NOW, {})
        self.assertEqual(replay['tickets'], ledger['tickets'])

    def test_historical_identity_is_not_backfilled(self):
        early, mtf = docs()
        ledger, _ = spark.advance({}, early, mtf, NOW, {})
        for key in list(ledger['tickets'][0]):
            if key.startswith(('strategy_', 'source_scan_', 'parent_event_', 'risk_policy_')):
                del ledger['tickets'][0][key]
        before = copy.deepcopy(ledger['tickets'])
        replay, _ = spark.advance(ledger, early, mtf, NOW, {})
        self.assertEqual(replay['tickets'], before)

    def test_new_leverage_never_exceeds_twenty(self):
        candidate = {'research_rank': 99, 'paper_stage_number': 3, 'side': 'LONG'}
        source = {'frames': {'4H': {'adx_14': 50, 'volume_ratio_20': 3,
                                   'macd_12_26_9': {'hist_pct': 1}}, '1D': {'trend': 'UP'}}}
        self.assertLessEqual(spark.choose_leverage(candidate, source), 20)

    def test_new_fill_blocks_stop_loss_larger_than_margin(self):
        early, mtf = docs()
        mtf['candidates'][0]['frames']['1H']['atr_pct'] = 15
        ledger, _ = spark.advance({}, early, mtf, NOW, {})
        first = ((NOW // spark.BAR) + 1) * spark.BAR
        ledger, _ = spark.advance(ledger, {**early, 'scan_id': 'next', 'candidates': []},
                                  mtf, first + spark.BAR + 5000, {'BTCUSDT': [bar(first)]})
        ticket = ledger['tickets'][0]
        self.assertEqual(ticket['status'], 'CAPACITY_BLOCKED')
        self.assertEqual(ticket['valuation_status'], 'STOP_COST_EXCEEDS_INITIAL_MARGIN')
        self.assertIsNone(ticket['fill_price'])


class ResearchLedger(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import uzayx_research
        cls.lab = uzayx_research

    def inputs(self):
        now = 1792450800000
        hour = 3600000
        rows = [[now - (40-i)*hour, 100, 101, 99, 100, 10] for i in range(40)]
        rows[-1] = [now-hour, 100, 104, 99.5, 103, 30]
        candidate = {'symbol': 'BTCUSDT', 'quality': 'COMPLETE', 'price_reference': 103,
                     'observed_at_utc': self.lab.iso(now), 'frames': {
                         '4H': {'quality': 'CLOSED_CONFIRMED', 'bb_compression_percentile_30': 10,
                                'atr_pct': 2, 'trend': 'UP'},
                         '1D': {'quality': 'CLOSED_CONFIRMED', 'trend': 'UP'}}}
        mtf = {'provider': 'OKX', 'fetched_at': self.lab.iso(now), 'candidates': [candidate]}
        pack = {'source': 'OKX_CLOSED_CANDLES', 'source_mtf_at': mtf['fetched_at'],
                'candles_by_symbol': {'BTCUSDT': {'1H': rows}}}
        return now, mtf, pack

    def test_seven_families_freeze_new_events_without_cash_claims(self):
        now, mtf, pack = self.inputs()
        ledger = self.lab.observe({}, mtf, pack, 's1', now)
        self.assertEqual(len(self.lab.FAMILIES), 7)
        events = ledger['events']
        self.assertTrue(any(e['strategy_id'] == 'T006' for e in events))
        for e in events:
            self.assertIsNone(e['net_pnl_usdt'])
            self.assertFalse(e['is_executed_trade'])
            self.assertEqual(e['observed_at_utc'], self.lab.iso(now))
            self.assertEqual(len(e['config_hash']), 64)
        again = self.lab.observe(copy.deepcopy(ledger), mtf, pack, 's2', now+1000)
        self.assertEqual(len(again['events']), len(events))
        self.assertEqual([e['event_id'] for e in again['events']], [e['event_id'] for e in events])
        self.assertEqual([e['birth'] for e in again['events']], [e['birth'] for e in events])

    def test_registered_patterns_distinguish_retest_second_wave_reclaim_and_failed_break(self):
        now, mtf, pack = self.inputs()
        context=mtf['candidates'][0]
        flat=copy.deepcopy(pack['candles_by_symbol']['BTCUSDT']['1H'])
        flat[-1]=[flat[-1][0],100,101,99,100,10]
        rows=self.lab.closed_rows(flat,3600000,now)
        self.assertEqual(self.lab.detect(rows,context,rows),[])
        def changed(changes):
            sample=copy.deepcopy(rows)
            for index,ohlc in changes.items():sample[index].update(zip(('o','h','l','c'),ohlc))
            return sample
        retest=changed({-3:(100,104,99,103),-2:(103,103.5,101,102),-1:(102,105,102,104)})
        self.assertIn(('T032','LONG'),self.lab.detect(retest,context,rows))
        second=changed({-6:(100,105,99,104),-5:(104,104,102,103),
                        -4:(103,103.5,102,103),-3:(103,103.5,102,103),
                        -2:(103,103.5,102,103),-1:(103,106,103,105)})
        self.assertIn(('T033','LONG'),self.lab.detect(second,context,rows))
        reclaim=changed({-1:(100,101,98,100)})
        self.assertIn(('T054','LONG'),self.lab.detect(reclaim,context,rows))
        divergence=changed({-1:(100,104,99,103)})
        self.assertIn(('T093','LONG'),self.lab.detect(divergence,context,rows))
        failed=changed({-2:(100,104,99,103),-1:(103,104,99,100)})
        self.assertIn(('T154','SHORT'),self.lab.detect(failed,context,rows))

    def test_stale_or_wrong_source_cannot_seed_research(self):
        now, mtf, pack = self.inputs()
        self.assertRaises(ValueError, self.lab.observe, {}, mtf, {**pack, 'source_mtf_at': 'wrong'}, 's', now)
        self.assertRaises(ValueError, self.lab.observe, {}, mtf, pack, 's', now+30*60000)

    def test_horizons_wait_for_real_future_bars_and_missing_is_unknown(self):
        now, mtf, pack = self.inputs()
        ledger = self.lab.observe({}, mtf, pack, 's', now)
        event = ledger['events'][0]
        self.assertEqual(event['horizons']['7D']['state'], 'TRACKING')
        out = self.lab.measure(event, now+8*86400000, {})
        self.assertNotEqual(out['7D']['state'], 'OBSERVED')
        self.assertNotIn('net_pnl_usdt', out['7D'])

    def test_account_uses_complete_ledger_with_unassigned_history(self):
        ledger = {'tickets': [
            {'event_id': 'a', 'symbol': 'BTCUSDT', 'side': 'SHORT', 'status': 'OPEN',
             'realized_net_usdt': 2, 'unrealized_net_usdt': -3, 'remaining_notional_usdt': 300,
             'initial_margin_usdt': 30, 'remaining_qty': 1, 'total_qty': 1},
            {'event_id': 'b', 'symbol': 'BTCUSDT', 'side': 'SHORT', 'status': 'CLOSED',
             'strategy_id': 'SPARK_GELDI', 'realized_net_usdt': -4, 'unrealized_net_usdt': 0}]}
        public = {'no_real_orders': True, 'all_events_count': 2,
                  'summary': {'virtual_equity_usdt': 9995}}
        account = self.lab.account(ledger, public)
        self.assertEqual(account['realized_all_usdt'], -2)
        self.assertEqual(account['closed_realized_usdt'], -4)
        self.assertEqual(account['partial_realized_usdt'], 2)
        self.assertEqual(account['unknown_attribution_count'], 1)
        self.assertEqual(account['groups'][0]['id'], 'SPARK_GELDI')
        self.assertTrue(account['reconciled'])
        bad = copy.deepcopy(ledger);bad['tickets'].append(bad['tickets'][0])
        self.assertRaises(ValueError, self.lab.account, bad, public)

    def test_observed_future_direction_is_not_opposite_cash_profit(self):
        now, mtf, pack = self.inputs()
        ledger = self.lab.observe({}, mtf, pack, 's', now)
        event = ledger['events'][0]
        bars = [[now+i*300000, 103, 106, 102, 105, 10] for i in range(12)]
        result = self.lab.measure(event, now+3600000+2000, {'5m': bars})['1H']
        self.assertEqual(result['state'], 'OBSERVED')
        self.assertGreater(result['close_direction_pct'], 0)
        self.assertLess(result['inverse_direction_pct'], 0)
        self.assertIsNone(result['cash_pnl_usdt'])
        missing = self.lab.measure(event, now+3600000+2000, {'5m': bars[1:]})['1H']
        self.assertEqual(missing['state'], 'DATA_GAP')


if __name__ == '__main__':
    unittest.main()
