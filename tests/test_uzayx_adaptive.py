import copy
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'engine'))
import uzayx_adaptive as learn

H = 3600000
NOW = 1800000000000 // H * H + 120000


def ticket(i=0, decision=NOW-20*H, symbol='BTCUSDT', net=2, notional=100):
    frames = {tf: {'rsi': 60, 'macd_hist_pct': .3, 'adx': 25,
                      'bb_compression_percentile': 20, 'relative_volume': 1.2,
                      'atr_pct': 2, 'trend': 'UP',
                      'source_closed_at_utc': learn.stamp(decision-step)}
              for tf, step in [('1H', H), ('4H', 4*H), ('1D', 24*H)]}
    return {'event_id': str(i), 'symbol': symbol, 'side': 'LONG',
            'entry_at_ms': decision, 'signal_at_utc': learn.stamp(decision),
            'features_at_birth': frames, 'stage_at_birth_number': 3,
            'stage_definition': 'CLOSED_1H_BREAKOUT_REQUIRED',
            'status': 'CLOSED', 'closed_at_utc': learn.stamp(decision+H),
            'fill_at_ms': decision+300000, 'fill_price': 100.,
            'realized_net_usdt': net, 'reference_notional_usdt': notional,
            'remaining_qty': 0., 'valuation_status': 'SETTLED',
            'no_backfilled_fill': True, 'is_real_trade': False,
            'estimated_only': True, 'risk_policy_version': 'current'}


def book(tickets, epoch='current'):
    return {'epoch_id': epoch, 'tickets': tickets, 'last_scan_id': 'scan',
            'updated_at': learn.stamp(NOW)}


class AdaptiveTests(unittest.TestCase):
    def test_normalizes_sizes_and_never_mutates_books(self):
        books = [book([ticket(net=2, notional=100)]),
                 book([ticket(net=20, notional=1000)], 'old')]
        before = copy.deepcopy(books)
        rows, audit = learn.samples(books, NOW)
        self.assertEqual([r['return_pct'] for r in rows], [2.0])
        self.assertEqual(audit['overlapping_intentions'], 1)
        self.assertEqual(books, before)

    def test_overlap_opposite_and_geldi_are_not_independent(self):
        a = ticket('a'); b = ticket('GELDI:a', decision=a['entry_at_ms']+1000)
        b['side'] = 'SHORT'
        c = ticket('c', decision=a['entry_at_ms']+3*H)
        rows, audit = learn.samples([book([c,b,a])], NOW)
        self.assertEqual([r['event_id'] for r in rows], ['a','c'])
        self.assertEqual(audit['overlapping_intentions'], 1)

    def test_open_first_episode_cannot_be_replaced_by_quick_winner(self):
        a = ticket('a'); a.update(status='OPEN',closed_at_utc=None)
        b = ticket('b', decision=a['entry_at_ms']+H)
        rows, audit = learn.samples([book([a,b])], NOW)
        self.assertEqual(rows, [])
        self.assertEqual(audit['overlapping_intentions'], 1)

    def test_future_label_and_unclosed_birth_features_rejected(self):
        a = ticket('a',decision=NOW-H)
        b = ticket('b',symbol='ETHUSDT')
        b['features_at_birth']['4H']['source_closed_at_utc'] = learn.stamp(b['entry_at_ms'])
        rows, audit = learn.samples([book([a,b])], NOW-H)
        self.assertEqual(rows, [])
        self.assertGreater(audit['unavailable_or_invalid'], 0)

    def test_bad_net_gap_and_unknown_schema_fail_closed(self):
        for change in [dict(realized_net_usdt=float('nan')), dict(status='DATA_GAP'),
                       dict(reference_notional_usdt=0), dict(is_real_trade=True)]:
            a = ticket(); a.update(change)
            self.assertEqual(learn.samples([book([a])],NOW)[0], [])
        with self.assertRaises(ValueError):
            learn.run({'model_version':'unexpected'},[book([])],'scan',NOW)

    def test_analogue_prediction_is_purged_and_excludes_target_coin(self):
        ts = [ticket(i, decision=NOW-(100-i*2)*H,symbol=f'C{i%5}USDT') for i in range(35)]
        rows,_ = learn.samples([book(ts)], NOW)
        target = learn.context(ticket('target',decision=NOW,symbol='C0USDT'))
        pred = learn.predict(rows,target,NOW)
        self.assertGreaterEqual(pred['neighbor_count'],12)
        self.assertIsNone(pred['win_probability'])
        self.assertNotIn('C0USDT',pred['neighbor_symbols'])
        later=copy.deepcopy(rows[0]);later.update(key='later',closed_ms=NOW,return_pct=1000)
        self.assertEqual(learn.predict(rows+[later],target,NOW),pred)

    def test_short_history_never_promotes_even_profitable(self):
        ts=[ticket(i,decision=NOW-(90-i)*H,symbol=f'C{i%5}USDT') for i in range(85)]
        rows,_=learn.samples([book(ts)],NOW)
        result=learn.validate(rows,NOW)
        self.assertIsNone(result['shadow_champion'])
        self.assertIn('LESS_THAN_SEVEN_DAYS',result['blocks'])
        for p in result['policies'].values():
            self.assertEqual(p['folds'],3)

    def test_no_forecast_backfill_and_idempotent_immutable_prediction(self):
        old=ticket('old'); fresh=ticket('fresh',decision=NOW-1000)
        fresh.update(status='WAITING_FUTURE_BAR',closed_at_utc=None,fill_price=None,fill_at_ms=None)
        books=[book([old,fresh])]; before=copy.deepcopy(books)
        ledger,public=learn.run({},books,'scan',NOW)
        self.assertEqual(len(ledger['forecasts']),1)
        self.assertEqual(ledger['forecasts'][0]['event_id'],'fresh')
        frozen=copy.deepcopy(ledger['forecasts'][0]['prediction'])
        replay,_=learn.run(ledger,books,'scan',NOW)
        self.assertEqual(replay,ledger)
        settled=copy.deepcopy(fresh);settled.update(status='CLOSED',fill_price=100,
            fill_at_ms=NOW+300000,closed_at_utc=learn.stamp(NOW+2*H),
            realized_net_usdt=-2,valuation_status='SETTLED')
        next_book=book([old,settled]);next_book['last_scan_id']='scan2'
        final,_=learn.run(ledger,[next_book],'scan2',NOW+3*H)
        row=final['forecasts'][0]
        self.assertEqual(row['prediction'],frozen)
        self.assertEqual(row['outcome']['baseline_return_pct'],-2)
        self.assertEqual(books,before)
        self.assertTrue(public['original_cash_untouched'])

    def test_pending_bar_already_started_cannot_get_a_forecast(self):
        t=ticket('too-late',decision=NOW-180000)
        t.update(status='WAITING_FUTURE_BAR',closed_at_utc=None,fill_price=None)
        ledger,_=learn.run({},[book([t])],'scan',NOW)
        self.assertEqual(ledger['forecasts'],[])

    def test_scan_mismatch_and_duplicate_ids_stop_persistence(self):
        with self.assertRaises(ValueError):
            learn.run({},[book([])],'wrong-scan',NOW)
        with self.assertRaises(ValueError):
            learn.run({},[book([ticket(),ticket()])],'scan',NOW)

    def test_no_trade_has_zero_exposure_and_stress_charges_selected_only(self):
        rows=[dict(taken=False,return_pct=-10,decision_ms=NOW,fold=0),
              dict(taken=True,return_pct=1,decision_ms=NOW+H,fold=1)]
        m=learn.metrics(rows)
        self.assertEqual(m['selected'],1)
        self.assertAlmostEqual(m['mean_stressed_per_opportunity_pct'],.45)
        self.assertEqual(learn.metrics([rows[0]])['mean_stressed_per_opportunity_pct'],0)


if __name__ == '__main__':
    unittest.main()
