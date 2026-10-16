import datetime as dt
import pathlib
import sys
import unittest

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'engine'))
import v4_paper as paper

T=int(dt.datetime(2026,10,16,18,20,tzinfo=dt.timezone.utc).timestamp()*1000)
POL={'policy_version':'4.0.0-research-20261016','paper':{
 'starting_balance_usdt':10000.,'risk_per_trade_pct':.5,
 'max_open_risk_pct':2.,'max_daily_new_risk_pct':2.,'max_positions':3,
 'leverage':3,'max_margin_trade_pct':25,'max_margin_total_pct':50,
 'example_fee_side_pct':.05,'example_slippage_side_pct':.05,
 'max_entry_delay_minutes':15,
 'take_profit_splits':[.4,.35,.25],'take_profit_r':[1,2,3]}}
SPEC={'ctType':'linear','ctVal':'.01','lotSz':'1','ctValCcy':'BTC','state':'live'}
MARKET={'rows':[{'symbol':'BTCUSDT','volume':1000000000.}]}

def intent(when=T,identifier='A',side='LONG'):
    return {'type':'ENTRY_ELIGIBLE','trade_intent_id':identifier,'setup_id':'S'+identifier,
      'event_id':'E'+identifier,'event_time_utc':dt.datetime.fromtimestamp(when/1000,dt.timezone.utc).isoformat(),
      'strategy_id':'TREND_BREAKOUT','symbol':'BTCUSDT','side':side,
      'data_quality':'FRESH','price_at_transition':100.,'stop':98. if side=='LONG' else 102.,
      'targets':[102.,104.,106.] if side=='LONG' else [98.,96.,94.]}
def candle(t,o=100,h=101,l=99,c=100):
    return {'t':t,'o':o,'h':h,'l':l,'c':c}

class TestV4Paper(unittest.TestCase):
 def test_new_account_no_legacy100_and_no_trade(self):
    log,pub=paper.advance({}, {'events':[]},MARKET,T,{}, {},POL)
    self.assertEqual(log['cash_balance_usdt'],10000.)
    self.assertEqual(pub['starting_balance_usdt'],10000.)
    self.assertFalse(pub['legacy_v3_balance_included'])
    self.assertEqual(len(pub['open_positions']),0)
    self.assertEqual(pub['equity_usdt'],10000.)

 def initial(self,side='LONG',created=T):
    log=paper.initialize({},created-60000,POL)
    life={'events':[intent(created,'A',side)]}
    paper.queue_intents(log,life,created+1000)
    self.assertEqual(log['orders']['A']['status'],'PENDING')
    return log

 def test_first_closed_future_bar_required(self):
    log=self.initial()
    log,view=paper.advance(log,{'events':[]},MARKET,T+200000,
                           {'BTCUSDT':[candle(T+paper.BAR)]},{'BTCUSDT':SPEC},POL)
    self.assertEqual(log['orders']['A']['status'],'PENDING')
    self.assertEqual(view['equity_usdt'],10000.)
    log,view=paper.advance(log,{'events':[]},MARKET,T+600000,
                           {'BTCUSDT':[candle(T+paper.BAR)]},{'BTCUSDT':SPEC},POL)
    self.assertEqual(log['orders']['A']['status'],'FILLED')
    self.assertGreater(log['orders']['A']['remaining_qty'],0)
    self.assertLess(view['equity_usdt'],10000.)
    self.assertGreater(view['used_margin_usdt'],0)

 def test_unverified_lot_and_missing_candle_are_no_fill(self):
    log=self.initial()
    after=T+600000
    log,_=paper.advance(log,{'events':[]},MARKET,after,
        {'BTCUSDT':[candle(T+paper.BAR)]},{'BTCUSDT':None},POL)
    self.assertEqual(log['orders']['A']['status'],'NO_FILL')
    self.assertEqual(log['cash_balance_usdt'],10000.)
    log=self.initial()
    log,_=paper.advance(log,{'events':[]},MARKET,T+1200000,
        {'BTCUSDT':[]},{'BTCUSDT':SPEC},POL)
    self.assertEqual(log['orders']['A']['status'],'NO_FILL')

 def test_repeat_does_not_duplicate_fill_or_fee(self):
    log=self.initial()
    future=[candle(T+paper.BAR)]
    a,_=paper.advance(log,{'events':[intent(T)]},MARKET,T+600000,{'BTCUSDT':future},{'BTCUSDT':SPEC},POL)
    fee=a['fees_paid_usdt']
    b,_=paper.advance(a,{'events':[intent(T)]},MARKET,T+600000,{'BTCUSDT':future},{'BTCUSDT':SPEC},POL)
    self.assertAlmostEqual(b['fees_paid_usdt'],fee)
    self.assertEqual(len([e for e in b['events'] if e['type']=='PAPER_FILLED']),1)

 def test_long_short_symmetry_on_stop(self):
    for side,high,low in [('LONG',101,97),('SHORT',103,99)]:
        a=self.initial(side)
        a,_=paper.advance(a,{'events':[]},MARKET,T+600000,
            {'BTCUSDT':[candle(T+paper.BAR)]},{'BTCUSDT':SPEC},POL)
        stop=candle(T+2*paper.BAR,o=100,h=high,l=low,c=100)
        b,_=paper.advance(a,{'events':[]},MARKET,T+900000,
            {'BTCUSDT':[candle(T+paper.BAR),stop]},{'BTCUSDT':SPEC},POL)
        self.assertEqual(b['orders']['A']['status'],'CLOSED')
        self.assertLess(b['cash_balance_usdt'],10000.)

 def test_ambiguous_stop_tp_not_counted_as_win(self):
    a=self.initial()
    a,_=paper.advance(a,{'events':[]},MARKET,T+600000,
        {'BTCUSDT':[candle(T+paper.BAR)]},{'BTCUSDT':SPEC},POL)
    collision=candle(T+2*paper.BAR,o=100,h=104,l=97,c=101)
    b,_=paper.advance(a,{'events':[]},MARKET,T+900000,
        {'BTCUSDT':[candle(T+paper.BAR),collision]},{'BTCUSDT':SPEC},POL)
    p=b['orders']['A']
    self.assertEqual(p['status'],'CLOSED')
    self.assertTrue(any(x['kind']=='AMBIGUOUS_CONSERVATIVE_STOP' for x in p['partial_exits']))
    self.assertLess(p['realized_pnl_usdt'],0)

 def test_partial_exit_keeps_margin_consistent(self):
    a=self.initial()
    a,_=paper.advance(a,{'events':[]},MARKET,T+600000,
        {'BTCUSDT':[candle(T+paper.BAR)]},{'BTCUSDT':SPEC},POL)
    p=a['orders']['A'];used=paper.margin_used(a)
    target=candle(T+2*paper.BAR,o=100,h=103,l=99,c=102)
    b,pub=paper.advance(a,{'events':[]},MARKET,T+900000,
        {'BTCUSDT':[candle(T+paper.BAR),target]},{'BTCUSDT':SPEC},POL)
    self.assertEqual(b['orders']['A']['status'],'FILLED')
    self.assertAlmostEqual(b['orders']['A']['remaining_fraction'],.6,places=5)
    self.assertAlmostEqual(paper.margin_used(b),used*.6,delta=.1)
    self.assertGreater(pub['fees_paid_usdt'],0)

 def test_no_negative_or_invented_free_margin(self):
    self.assertIsNone(paper.quantity_for(1000,100,None,'BTCUSDT'))
    self.assertIsNone(paper.quantity_for(1000,100,{'ctType':'inverse'},'BTCUSDT'))
    p=paper.quantity_for(1000,100,SPEC,'BTCUSDT')
    self.assertGreater(p['contracts'],0)
    self.assertAlmostEqual(p['base_qty'],p['contracts']*.01)

if __name__=='__main__':unittest.main()
