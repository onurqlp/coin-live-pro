import copy
import json
import pathlib
import sys
import unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'engine'))
import uzayx_cash_close as close
import uzayx_strategy_bank as bank
import v4_spark_paper as paper
import v4_early
from test_v4_spark_paper import docs,bar,NOW


class StrategyCashTests(unittest.TestCase):
    def books(self):
        e,m=docs();l,_=paper.advance({},e,m,NOW,{})
        first=(NOW//paper.BAR+1)*paper.BAR
        l,_=paper.advance(l,{**e,'scan_id':'filled','candidates':[]},m,
            first+paper.BAR+3000,{'BTCUSDT':[bar(first,100,100.2,99.8,100)]})
        return {'spark':l,'strict':{'no_real_orders':True,'orders':{},'events':[]},
                'pilot':{'model_version':close.pilot.MODEL,'orders':{},'journal':[]}},first+paper.BAR+4000

    def market(self,now,bid=102,ask=102.1):
        return {'provider':'OKX','fetched_at':paper.stamp(now),'rows':[
            {'symbol':'BTCUSDT','bid':bid,'ask':ask,'instrument_state':'live'}]}

    def test_close_uses_correct_side_actual_profit_loss_costs_and_no_reset(self):
        for side,bid,ask in [('LONG',102,102.1),('SHORT',102,102.1),('LONG',98,98.1)]:
            books,now=self.books();t=books['spark']['tickets'][0];t['side']=side
            before=copy.deepcopy(books);qty=t['remaining_qty'];filled=t['fill_price'];fee=t['entry_fee_usdt']
            out,report=close.close_books(books,self.market(now,bid,ask),now,'request')
            closed=out['spark']['tickets'][0];raw=bid if side=='LONG' else ask;sign=1 if side=='LONG' else -1
            expected_exit=raw*(1-sign*paper.SLIPPAGE)
            expected=sign*(expected_exit-filled)*qty-expected_exit*qty*paper.FEE-fee
            self.assertAlmostEqual(closed['realized_net_usdt'],expected,7)
            self.assertEqual(closed['status'],'CLOSED');self.assertEqual(closed['remaining_qty'],0)
            self.assertAlmostEqual(report['spark_equity_after_usdt'],10000+expected,4)
            self.assertEqual(books,before)

    def test_no_fake_close_on_stale_or_missing_quote(self):
        books,now=self.books()
        for q in [self.market(now-181000),self.market(now,bid=0),self.market(now,bid=103,ask=102)]:
            with self.assertRaises(ValueError):close.close_books(books,q,now,'request')
        self.assertEqual(books['spark']['tickets'][0]['status'],'OPEN')

    def test_outside_universe_held_coin_gets_fresh_verified_quote(self):
        books,now=self.books();books['spark']['tickets'][0]['symbol']='OUTUSDT'
        ticker=[{'instId':'OUT-USDT-SWAP','bidPx':'95','askPx':'95.1','ts':str(now-1000)}]
        instruments=[{'instId':'OUT-USDT-SWAP','state':'live'}]
        with patch.object(close.collector,'get',side_effect=[ticker,instruments]):
            market=close.complete_quotes(books,self.market(now),now)
        result,_=close.close_books(books,market,now,'request')
        self.assertEqual(result['spark']['tickets'][0]['status'],'CLOSED')

    def test_partial_position_and_other_cashbooks_are_closed_without_double_fees(self):
        books,now=self.books();t=books['spark']['tickets'][0]
        paper.settle(t,101,.5,'TP1',now-1000);earlier=t['realized_net_usdt']
        books['strict'].update(cash_balance_usdt=9999.94,realized_pnl_usdt=0,fees_paid_usdt=.06)
        books['strict']['orders']['strict']={'paper_order_id':'strict','symbol':'BTCUSDT','side':'LONG',
            'status':'FILLED','fill_price':100.,'original_qty':1.,'remaining_qty':.5,'remaining_fraction':.5,
            'entry_fee_paid_usdt':.06,'entry_fee_allocated_usdt':.03,'realized_pnl_usdt':0.,
            'fees_paid_usdt':.06,'partial_exits':[]}
        books['pilot']['orders']['pilot']={'id':'pilot','symbol':'BTCUSDT','side':'SHORT',
            'status':'FILLED','fill_price':100.,'notional':100.,'risk_budget':1.}
        out,report=close.close_books(books,self.market(now),now,'request')
        self.assertEqual(len(report['positions']),3)
        self.assertEqual(out['strict']['orders']['strict']['status'],'CLOSED')
        self.assertAlmostEqual(out['strict']['orders']['strict']['entry_fee_allocated_usdt'],.06)
        self.assertEqual(out['pilot']['orders']['pilot']['status'],'TIME_EXIT')
        self.assertEqual(out['spark']['tickets'][0]['exits'][0],t['exits'][0])
        self.assertGreater(out['spark']['tickets'][0]['realized_net_usdt'],earlier)

    def test_same_coin_cannot_fill_multiple_strategy_intentions(self):
        m,q,p,now=self.fixture();feed=bank.build(m,q,p,now)
        _,e=v4_early.build(m,q,{'scan_id':'s','source_mtf_at':m['fetched_at']},{},{'scan_id':'s'},now,feed)
        second=copy.deepcopy(e['candidates'][0]);second['event_id']='second-strategy-event'
        e['candidates'].append(second)
        prior=paper.initial(now);prior['strategy_cash_started_ms']=now-2*bank.H
        queued,_=paper.advance(prior,e,m,now,{})
        first=(now//paper.BAR+1)*paper.BAR
        for t in queued['tickets']:t.update(signal_price=100,stop=99,tp1=101,tp2=102,tp3=103)
        ledger,_=paper.advance(queued,{**e,'scan_id':'next','candidates':[]},m,first+paper.BAR+2000,
            {'BTCUSDT':[bar(first,100,100.1,99.9,100)]})
        self.assertEqual(sum(t['status']=='OPEN' for t in ledger['tickets']),1)
        self.assertEqual(sum(t['status']=='CAPACITY_BLOCKED' for t in ledger['tickets']),1)

    def fixture(self):
        now=1800000000000//bank.H*bank.H+120000
        frames={tf:{'quality':'CLOSED_CONFIRMED','last_candle_utc':paper.stamp((now//step-1)*step),
            'atr_pct':1.,'trend':'UP','rsi_14':60,'macd_12_26_9':{'hist_pct':.5},
            'adx_14':30,'volume_ratio_20':2.,'bb_compression_percentile_30':10,
            'breakout_high_prev8':101,'breakout_low_prev8':99} for tf,step in [('1H',bank.H),('4H',4*bank.H),('1D',24*bank.H)]}
        candidate={'symbol':'BTCUSDT','side':'LONG','quality':'COMPLETE','frames':frames,'structure_risk_score':10}
        rows=[];start=(now//bank.H-60)*bank.H
        for i in range(60):
            c=100+(i%4)*.01
            rows.append([start+i*bank.H,c,c+.1,c-.1,c,100])
        rows[-1]=[rows[-1][0],100.1,102.7,100,102.5,300]
        mtf={'provider':'OKX','model_version':'3.0.0-mtf-swing','fetched_at':paper.stamp(now-1000),'candidates':[candidate]}
        market={'provider':'OKX','fetched_at':paper.stamp(now-2000),'rows':[{'symbol':'BTCUSDT','price':104,
            'bid':104,'ask':104.01,'volume':50000000,'spread_bps':1.,'instrument_state':'live','listing_age_days':100}]}
        pack={'source':'OKX_CLOSED_CANDLES','source_mtf_at':mtf['fetched_at'],'candles_by_symbol':{'BTCUSDT':{'1H':rows}}}
        return mtf,market,pack,now

    def test_full_catalog_and_missing_microstructure_is_blocked(self):
        r=bank.registry();self.assertEqual(len(r),200);self.assertEqual(len({x['id'] for x in r}),200)
        self.assertEqual(next(x for x in r if x['id']=='T013')['state'],'BLOCKED_REQUIRED_EVIDENCE')
        self.assertEqual(next(x for x in r if x['id']=='T200')['control'],'NO_EDGE_NO_TRADE')
        self.assertTrue(all(len(x['strategy_config_hash'])==64 for x in r))

    def test_strategy_signal_birth_identity_one_cash_intent_and_no_watch_fill(self):
        m,q,p,now=self.fixture();feed=bank.build(m,q,p,now)
        self.assertTrue(feed['signals']);self.assertEqual(feed['signals'][0]['paper_stage_number'],3)
        radar={'scan_id':'s','source_mtf_at':m['fetched_at']};watch={'scan_id':'s','records':[]}
        _,early=v4_early.build(m,q,radar,{},watch,now,feed)
        prior=paper.initial(now-1000);prior['strategy_cash_started_ms']=now-2*bank.H
        ledger,pub=paper.advance(prior,early,m,now,{})
        self.assertEqual(len(ledger['tickets']),1)
        t=ledger['tickets'][0];self.assertTrue(t['strategy_id'].startswith('T'))
        self.assertEqual(t['strategy_id'],t['turan_strategy_id']);self.assertEqual(t['entry_class'],'GELDI')
        self.assertEqual(t['leverage'],10);self.assertEqual(t['initial_margin_usdt'],30)
        replay,_=paper.advance(ledger,early,m,now,{})
        self.assertEqual(len(replay['tickets']),1)
        watch_only=copy.deepcopy(early);watch_only['scan_id']='watch';watch_only['candidates'][0].update(paper_stage_number=1,hourly_level_state='WAIT_FOR_NEW_1H_CLOSE')
        empty,_=paper.advance(prior,watch_only,m,now,{})
        self.assertEqual(empty['tickets'],[])

    def test_anonymous_or_spoofed_strategy_cannot_enter(self):
        m,q,p,now=self.fixture();feed=bank.build(m,q,p,now)
        _,e=v4_early.build(m,q,{'scan_id':'s','source_mtf_at':m['fetched_at']},{},{'scan_id':'s'},now,feed)
        e['candidates'][0]['strategy_id']='T013'
        with self.assertRaises(ValueError):paper.advance({},e,m,now,{})

    def test_cutover_waits_for_new_closed_hour_and_flat_history_gives_no_signal(self):
        m,q,p,now=self.fixture();feed=bank.build(m,q,p,now)
        _,e=v4_early.build(m,q,{'scan_id':'s','source_mtf_at':m['fetched_at']},{},{'scan_id':'s'},now,feed)
        prior=paper.initial(now);prior['strategy_cash_started_ms']=now+bank.H
        ledger,_=paper.advance(prior,e,m,now,{})
        self.assertEqual(ledger['tickets'],[])
        for row in p['candles_by_symbol']['BTCUSDT']['1H']:row[1:]=[100,100,100,100,100]
        for f in m['candidates'][0]['frames'].values():f.update(trend='SIDEWAYS',volume_ratio_20=.3,adx_14=5,bb_compression_percentile_30=80)
        flat=bank.build(m,q,p,now)
        self.assertTrue(flat['no_trade']);self.assertEqual(flat['signals'],[])

    def test_strategy_source_gap_and_missing_volume_do_not_create_signals(self):
        m,q,p,now=self.fixture()
        p['source_mtf_at']='old'
        with self.assertRaises(ValueError):bank.build(m,q,p,now)
        p['source_mtf_at']=m['fetched_at'];p['candles_by_symbol']['BTCUSDT']['1H'][4][5]=None
        with self.assertRaises(ValueError):bank.build(m,q,p,now)


if __name__=='__main__':unittest.main()
