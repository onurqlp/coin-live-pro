import copy
import io
import json
import sys
import unittest
import urllib.parse
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'engine'))
import turan_candles as candles
import turan_experiments as exp
import uzayx_strategy_bank as bank
import uzayx_adaptive as learn
import test_uzayx_strategy_cash as cash_fixture
import test_turan_experiments as exp_fixture
import test_uzayx_adaptive as learn_fixture

class ReviewRegressions(unittest.TestCase):
    def failed_breakout(self):
        m,q,p,now=cash_fixture.StrategyCashTests().fixture()
        rows=p['candles_by_symbol']['BTCUSDT']['1H']
        rows[-2]=[rows[-2][0],100,105,99,104,100]
        rows[-1]=[rows[-1][0],104,104.5,99.5,100,100]
        return m,q,p,now

    def test_real_pagination_adapter_includes_first_of_full_hundred_bar_window(self):
        B=300000;start=2*B;end=start+100*B
        def endpoint(req,timeout):
            after=int(urllib.parse.parse_qs(urllib.parse.urlsplit(req.full_url).query)['after'][0])
            times=sorted((t for t in range(0,200*B,B) if t<after),reverse=True)[:100]
            return io.BytesIO(json.dumps({'code':'0','data':[[str(t),'100','101','99','100','1','0','0','1'] for t in times]}).encode())
        with patch('urllib.request.urlopen',side_effect=endpoint):
            rows=candles.request('BTCUSDT','5m',start,end)
        self.assertEqual(min(r[0] for r in rows),start)
        self.assertEqual(len(rows),100)

    def test_opposite_direction_reaches_lifecycle_with_same_source(self):
        m,q,p,now=self.failed_breakout();feed=bank.build(m,q,p,now)
        self.assertIn('SHORT',{s['side'] for s in feed['signals']})
        proposals=bank.lifecycle_proposals(feed,m['candidates'])
        self.assertEqual({x['side'] for x in proposals},{x['side'] for x in feed['signals']})

    def test_equivalent_rule_cannot_increase_independent_support_or_rank(self):
        m,q,p,now=self.failed_breakout();condition=bank.RULES[60]
        with patch.dict(bank.RULES,{60:condition},clear=True):one=bank.build(m,q,p,now)
        with patch.dict(bank.RULES,{60:condition,154:condition},clear=True):two=bank.build(m,q,p,now)
        a=next(s for s in one['signals'] if s['side']=='SHORT');b=next(s for s in two['signals'] if s['side']=='SHORT')
        self.assertEqual(a['family_vote_count'],b['family_vote_count'])
        self.assertEqual(a['supporting_factor_count'],b['supporting_factor_count'])
        self.assertEqual(a['research_rank'],b['research_rank'])
        self.assertEqual(b['matched_strategy_id_count'],2)

    def test_v1_experiments_remain_historical_under_v2_registry(self):
        bank_doc,manifest,pack=exp_fixture.fixture()
        ledger,_=exp.advance({},bank_doc,manifest,pack,exp_fixture.NOW)
        ledger['experiments'][0]['arms']['ORIGINAL'].update(status='CLOSED',modeled_net_usdt=12,outcome='TAKE_PROFIT')
        for r in bank_doc['registry']:r.update(strategy_version='v2',strategy_config_hash='new')
        bank_doc['signals']=[]
        _,report=exp.advance(ledger,bank_doc,manifest,pack,exp_fixture.NOW)
        row=report['strategies'][0]
        self.assertEqual(row['experiment_count'],0)
        self.assertEqual(row['historical_experiment_count'],1)
        self.assertTrue(any(c['strategy_version']=='v1' for c in report['paired_results']['cohorts']))

    def test_new_predictor_gets_new_model_identity_preserving_old_records(self):
        before={'model_version':learn.VERSION,'last_scan_id':'scan','models':{'old':{'validation':{'shadow_champion':'old'}}},'forecasts':[],'current_model_id':'old'}
        books=[learn_fixture.book([learn_fixture.ticket()])]
        ledger,_=learn.run(before,books,'scan',learn_fixture.NOW)
        self.assertNotEqual(ledger['current_model_id'],'old')
        self.assertEqual(ledger['models']['old'],before['models']['old'])
        changed=copy.deepcopy(books);changed[0]['last_scan_id']='new';changed[0]['tickets'][0]['exchange']='BINANCE'
        newer,_=learn.run(ledger,changed,'new',learn_fixture.NOW)
        self.assertNotEqual(newer['current_model_id'],ledger['current_model_id'])
