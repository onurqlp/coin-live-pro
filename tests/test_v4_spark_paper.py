"""Forward-only spark ticket audit; no fabricated intrabar success or real order."""
import datetime as dt
import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'engine'))
import v4_spark_paper as paper
NOW=int(dt.datetime(2026,10,17,12,30,tzinfo=dt.timezone.utc).timestamp()*1000)
def stamp(ms):return paper.stamp(ms)
def docs(ts=NOW):
    candle=((ts//300000)-1)*300000
    return ({'scan_id':'case-1','source_mtf_at':stamp(ts-15000),
     'research_only':True,'no_paper_entries':True,'candidates':[{
       'event_id':'ticket-unique-1','symbol':'BTCUSDT','side':'LONG',
       'first_seen_at_utc':stamp(ts-15000),'first_seen_price':100.,
       'research_tier':'KIVILCIM','research_rank':42,'paper_eligible':False,
       'real_order_eligible':False,'reasons':['4H_TREND'],'hourly_level':101,
       'source_closed_1h_at_utc':stamp(ts-3600000)}]},
      {'fetched_at':stamp(ts-15000),'candidates':[{
       'symbol':'BTCUSDT','side':'LONG','frames':{'1H':{
       'atr_pct':1.,'rsi_14':48,'macd_12_26_9':{'hist_pct':0.004},
       'bb_width_pct':3.,'bb_compression_percentile_30':12},
       '4H':{'rsi_14':51,'macd_12_26_9':{'hist_pct':0.002}},
       '1D':{'rsi_14':56}}}]})
def bar(t,o=100.,h=100.3,l=99.8,c=100.1):
    return {'t':t,'o':o,'h':h,'l':l,'c':c}
class TestSparkPaper(unittest.TestCase):
    def test_new_ticket_pending_no_retrofill_and_features(self):
        e,m=docs();ledger,pub=paper.advance({},e,m,NOW,{})
        self.assertEqual(pub['summary']['counts']['WAITING_FUTURE_BAR'],1)
        self.assertEqual(ledger['tickets'][0]['fill_price'],None)
        self.assertEqual(ledger['tickets'][0]['features_at_birth']['1H']['rsi'],48)
        self.assertTrue(pub['no_real_orders'])
        self.assertEqual(pub['starting_balance_usdt'],10000)
        self.assertEqual(pub['reference_ticket_notional_usdt'],300)
        self.assertEqual(ledger['tickets'][0]['reference_notional_usdt'],300)
    def test_forward_fills_then_stop_net_negative(self):
        e,m=docs();ledger,_=paper.advance({},e,m,NOW,{})
        first=((NOW//paper.BAR)+1)*paper.BAR
        entry=bar(first,100.,100.5,99.9,100.2)
        ledger,pub=paper.advance(ledger,{**e,'scan_id':'case-2','candidates':[]},m,first+paper.BAR+5000,{'BTCUSDT':[entry]})
        t=ledger['tickets'][0]
        self.assertEqual(t['status'],'OPEN')
        self.assertGreater(t['fill_price'],100)
        self.assertEqual(t['reference_notional_usdt'],300)
        self.assertAlmostEqual(t['total_qty']*t['fill_price'],300)
        self.assertAlmostEqual(t['entry_fee_usdt'],300*paper.FEE)
        self.assertTrue(isinstance(pub['summary']['virtual_equity_usdt'],float))
        stop=bar(first+paper.BAR,100.,100.2,98.8,99.7)
        ledger,pub=paper.advance(ledger,{**e,'scan_id':'case-3','candidates':[]},m,first+2*paper.BAR+5000,{'BTCUSDT':[entry,stop]})
        self.assertEqual(ledger['tickets'][0]['status'],'CLOSED')
        self.assertEqual(ledger['tickets'][0]['outcome'],'STOP')
        self.assertLess(pub['summary']['realized_net_usdt'],0)
        self.assertEqual(pub['summary']['unrealized_net_usdt'],0)
    def test_stop_tp_same_candle_is_not_a_win(self):
        e,m=docs();l,_=paper.advance({},e,m,NOW,{})
        first=((NOW//paper.BAR)+1)*paper.BAR
        x=bar(first,o=100,h=101.2,l=98.5,c=100)
        l,_=paper.advance(l,{**e,'scan_id':'s2','candidates':[]},m,first+paper.BAR+2000,{'BTCUSDT':[x]})
        self.assertEqual(l['tickets'][0]['status'],'CLOSED')
        self.assertEqual(l['tickets'][0]['outcome'],'STOP_AMBIGUOUS_SAME_5M')
    def test_missing_first_future_bar_not_fabricated(self):
        e,m=docs();l,_=paper.advance({},e,m,NOW,{})
        first=((NOW//paper.BAR)+1)*paper.BAR
        l,_=paper.advance(l,{**e,'scan_id':'s2','candidates':[]},m,first+2*paper.BAR+3000,{'BTCUSDT':[bar(first+paper.BAR)]})
        self.assertEqual(l['tickets'][0]['status'],'DATA_GAP')
        self.assertIsNone(l['tickets'][0]['fill_price'])
    def test_replay_idempotency(self):
        e,m=docs();l,p=paper.advance({},e,m,NOW,{})
        l2,p2=paper.advance(l,e,m,NOW,{})
        self.assertEqual(len(l2['tickets']),1)
        self.assertEqual(p2['summary']['counts'],p['summary']['counts'])
    def test_only_new_events_no_old_backfilled_fills(self):
        e,m=docs();e['candidates'][0]['first_seen_at_utc']=stamp(NOW-4*3600000)
        l,_=paper.advance({},e,m,NOW,{})
        self.assertEqual(l['tickets'],[])
    def test_geldi_generates_automatic_distinct_intent_from_scan_not_history(self):
        e,m=docs()
        e['candidates'][0].update(paper_stage_number=3,
             hourly_level_state='CLOSED_1H_LEVEL_BREACHED',
             price_at_scan=102.,first_seen_at_utc=stamp(NOW-3*3600000))
        ledger,pub=paper.advance({},e,m,NOW,{})
        self.assertEqual(pub['geldi_intent_total'],1)
        self.assertEqual(pub['daily']['today']['geldi'],1)
        self.assertEqual(pub['daily']['today']['new_geldi_opened'],0)
        self.assertEqual(len(ledger['tickets']),1)
        order=ledger['tickets'][0]
        self.assertEqual(order['event_id'],'GELDI:ticket-unique-1')
        self.assertEqual(order['signal_price'],102.)
        self.assertEqual(order['status'],'WAITING_FUTURE_BAR')
        self.assertIsNone(order['fill_price'])
        self.assertTrue(order['paper_intent_created'])
        self.assertFalse(order['is_real_trade'])
        replay,_=paper.advance(ledger,e,m,NOW+1000,{})
        self.assertEqual(len(replay['tickets']),1)

    def test_existing_early_ticket_promotion_also_creates_one_geldi_intent(self):
        e,m=docs()
        first,_=paper.advance({},e,m,NOW,{})
        self.assertEqual(len(first['tickets']),1)
        upgrade={**e,'scan_id':'case-promotion','candidates':[
            {**e['candidates'][0],'paper_stage_number':3,
             'hourly_level_state':'CLOSED_1H_LEVEL_BREACHED',
             'price_at_scan':101.5}]}
        second,pub=paper.advance(first,upgrade,m,NOW+1000,{})
        self.assertEqual(len(second['tickets']),2)
        self.assertEqual(pub['geldi_intent_total'],1)
        self.assertEqual([t for t in second['tickets'] if t.get('entry_class')=='GELDI'][0]['signal_price'],101.5)

    def test_geldi_forward_fill_and_daily_realized_loss(self):
        e,m=docs()
        e['candidates'][0].update(paper_stage_number=3,
            hourly_level_state='CLOSED_1H_LEVEL_BREACHED',price_at_scan=100.)
        ledger,_=paper.advance({},e,m,NOW,{})
        start=((NOW//paper.BAR)+1)*paper.BAR
        fill=bar(start,100,100.3,99.7,100.2)
        ledger,pub=paper.advance(ledger,{**e,'scan_id':'next','candidates':[]},m,
            start+paper.BAR+4000,{'BTCUSDT':[fill]})
        geldi=[t for t in ledger['tickets'] if t.get('entry_class')=='GELDI'][0]
        self.assertEqual(geldi['status'],'OPEN')
        self.assertEqual(pub['daily']['today']['new_geldi_opened'],1)
        self.assertEqual(pub['daily']['today']['geldi'],1)
        close=bar(start+paper.BAR,100.,100.2,98.7,99.2)
        ledger,pub=paper.advance(ledger,{**e,'scan_id':'next2','candidates':[]},m,
            start+2*paper.BAR+4000,{'BTCUSDT':[fill,close]})
        geldi=[t for t in ledger['tickets'] if t.get('entry_class')=='GELDI'][0]
        self.assertEqual(geldi['status'],'CLOSED')
        self.assertLess(geldi['realized_net_usdt'],0)
        self.assertEqual(pub['daily']['today']['geldi_closed'],1)
        self.assertLess(pub['daily']['today']['geldi_realized_net_usdt'],0)
        self.assertTrue(pub['daily']['paper_intent_not_guaranteed_fill'])

    def test_migration_preserves_all_402_tickets_without_backfill(self):
        e,m=docs()
        old,_=paper.advance({},e,m,NOW,{})
        old['model_version']='4.0.2-spark-paper-a1'
        previous=old['tickets'][0].copy()
        new,pub=paper.advance(old,{**e,'scan_id':'migration','candidates':[]},m,NOW+1000,{})
        self.assertEqual(new['model_version'],'4.0.3-spark-paper-a1')
        self.assertEqual(new['tickets'][0]['event_id'],previous['event_id'])
        self.assertEqual(new['tickets'][0]['signal_price'],previous['signal_price'])
        self.assertEqual(len(new['tickets']),1)
        self.assertEqual(pub['geldi_intent_total'],0)

    def test_no_geldi_trigger_without_closed_break(self):
        e,m=docs()
        e['candidates'][0].update(paper_stage_number=3,
            hourly_level_state='WAIT_FOR_NEW_1H_CLOSE',price_at_scan=100.)
        ledger,pub=paper.advance({},e,m,NOW,{})
        self.assertEqual(pub['geldi_intent_total'],0)

    def test_confirmed_opposite_closes_only_on_next_future_closed_bar(self):
        e,m=docs()
        ledger,_=paper.advance({},e,m,NOW,{})
        first=((NOW//paper.BAR)+1)*paper.BAR
        base=bar(first,o=100.,h=100.3,l=99.8,c=100.1)
        ledger,_=paper.advance(ledger,{**e,'scan_id':'old-open','candidates':[]},
                               m,first+paper.BAR+5000,{'BTCUSDT':[base]})
        original=ledger['tickets'][0]
        self.assertEqual(original['status'],'OPEN')
        signal_at=first+paper.BAR+10000
        reverse={**e['candidates'][0],
                 'event_id':'verified-opposite','side':'SHORT',
                 'first_seen_at_utc':stamp(signal_at-1000),
                 'first_seen_price':100.,
                 'price_at_scan':100.,
                 'paper_stage_number':3,
                 'hourly_level_state':'CLOSED_1H_LEVEL_BREACHED'}
        short={**m['candidates'][0], 'side':'SHORT'}
        next_m={**m,'candidates':m['candidates']+[short]}
        reversal={**e,'scan_id':'opposite-scan','candidates':[reverse]}
        ledger,pub=paper.advance(ledger,reversal,next_m,signal_at,{'BTCUSDT':[base]})
        original=next(x for x in ledger['tickets'] if x['event_id']=='ticket-unique-1')
        self.assertEqual(original['status'],'OPEN')
        self.assertEqual(original['realized_net_usdt'],0)
        self.assertIn('opposition_close_after_ms',original)
        self.assertEqual(pub['opposite_pending_count'],1)
        future=original['opposition_close_after_ms']
        first_intermediate=bar(first+paper.BAR,o=100.1,h=100.4,l=99.8,c=100.2)
        exit_candle=bar(future,o=100.5,h=100.7,l=100.3,c=100.6)
        ledger,pub=paper.advance(ledger,{**reversal,'scan_id':'after-opposite','candidates':[]},
                                 next_m,future+paper.BAR+5000,
                                 {'BTCUSDT':[base,first_intermediate,exit_candle]})
        t=next(x for x in ledger['tickets'] if x['event_id']=='ticket-unique-1')
        self.assertEqual(t['status'],'CLOSED')
        self.assertEqual(t['outcome'],'OPPOSITE_SIGNAL_EXIT')
        self.assertEqual(t['exits'][-1]['closed_at_utc'],stamp(future+paper.BAR))
        self.assertEqual(t['unrealized_net_usdt'],0.0)
        self.assertEqual(pub['opposite_closed_total'],1)
        self.assertEqual(pub['summary']['counts']['CLOSED']>=1,True)
        self.assertTrue(pub['no_real_orders'])
        self.assertEqual(len(pub['open_positions']),
                         pub['summary']['counts']['OPEN'])

    def test_opposite_pending_cancellation_has_no_imaginary_fill(self):
        e,m=docs();l,_=paper.advance({},e,m,NOW,{})
        reverse={**e['candidates'][0],'event_id':'opp2','side':'SHORT',
                 'first_seen_at_utc':stamp(NOW+1000),
                 'first_seen_price':100.,'price_at_scan':100.,
                 'paper_stage_number':3,'hourly_level_state':'CLOSED_1H_LEVEL_BREACHED'}
        m2={**m,'candidates':m['candidates']+[{**m['candidates'][0],'side':'SHORT'}]}
        l,p=paper.advance(l,{**e,'scan_id':'s2','candidates':[reverse]},
                          m2,NOW+2000,{})
        old=next(x for x in l['tickets'] if x['event_id']=='ticket-unique-1')
        self.assertEqual(old['status'],'OPPOSITE_CANCELLED')
        self.assertIsNone(old['fill_price'])
        self.assertEqual(old['realized_net_usdt'],0)
        self.assertEqual(p['opposite_cancelled_total'],1)
        self.assertEqual(p['summary']['counts']['OPPOSITE_CANCELLED'],1)
    def test_legacy_pending_ticket_keeps_original_10_usdt_when_filled(self):
        e,m=docs();ledger,_=paper.advance({},e,m,NOW,{})
        legacy=ledger['tickets'][0]
        legacy['reference_notional_usdt']=10.0
        first=((NOW//paper.BAR)+1)*paper.BAR
        entry=bar(first,100.,100.5,99.9,100.2)
        ledger,pub=paper.advance(ledger,{**e,'scan_id':'legacy-next','candidates':[]},m,first+paper.BAR+5000,{'BTCUSDT':[entry]})
        t=ledger['tickets'][0]
        self.assertEqual(t['status'],'OPEN')
        self.assertAlmostEqual(t['total_qty']*t['fill_price'],10)
        self.assertAlmostEqual(t['entry_fee_usdt'],10*paper.FEE)
        self.assertEqual(pub['reference_ticket_notional_usdt'],300)

    def test_evidence_tiers_choose_10_to_30_never_claim_probability(self):
        candle_data={'frames':{'4H':{'adx_14':35,'volume_ratio_20':1.6,
            'macd_12_26_9':{'hist_pct':0.2}},'1D':{'trend':'UP'}}}
        self.assertEqual(paper.choose_leverage({'side':'LONG','research_rank':42},candle_data),10)
        self.assertEqual(paper.choose_leverage({'side':'LONG','research_rank':70},candle_data),15)
        self.assertEqual(paper.choose_leverage({'side':'LONG','research_rank':83,'paper_stage_number':2},candle_data),20)
        self.assertEqual(paper.choose_leverage({'side':'LONG','research_rank':95,'paper_stage_number':3},candle_data),30)
        self.assertEqual(paper.choose_leverage({'side':'SHORT','research_rank':95,'paper_stage_number':3},candle_data),15)
        self.assertEqual(paper.choose_leverage({'side':'LONG','research_rank':95,'paper_stage_number':3},{}),10)

    def test_new_epoch_rejects_all_old_discoveries_without_fake_closures(self):
        e,m=docs()
        ledger=paper.initial(NOW)
        ledger['epoch_id']='uzayx-new'
        ledger['epoch_cutoff_ms']=NOW
        output,pub=paper.advance(ledger,e,m,NOW,{})
        self.assertEqual(output['tickets'],[])
        self.assertEqual(pub['all_events_count'],0)
        self.assertEqual(pub['epoch_id'],'uzayx-new')
        # Only a truly first-observed event AFTER the cutover may enter new cash.
        fresh={**e['candidates'][0], 'event_id':'new-epoch-ticket',
               'first_seen_at_utc':stamp(NOW+1000)}
        output,pub=paper.advance(output,{**e,'scan_id':'second','candidates':[fresh]},
            m,NOW+2000,{})
        self.assertEqual(len(output['tickets']),1)
        self.assertEqual(output['tickets'][0]['reference_notional_usdt'],300)
        self.assertEqual(output['tickets'][0]['leverage'],10)
        self.assertEqual(output['tickets'][0]['initial_margin_usdt'],30)

    def test_corrupted_mixed_snapshot_fails(self):
        e,m=docs();m['fetched_at']='2001-01-01T00:00:00Z'
        with self.assertRaisesRegex(RuntimeError,'mixed'):
            paper.advance({},e,m,NOW,{})
if __name__=='__main__':unittest.main()
