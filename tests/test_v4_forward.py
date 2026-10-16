"""V4 forward-only bar ordering, horizon completeness and no lookahead."""
import datetime as dt
import pathlib
import sys
import unittest

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'engine'))
import v4_forward as f
T=int(dt.datetime(2026,10,16,18,10,tzinfo=dt.timezone.utc).timestamp()*1000)
P=300000
START=T
def evidence(side='LONG',price=100.):
    return {'setup_id':'setup1','symbol':'BTCUSDT','side':side,
            'strategy_id':'TREND_BREAKOUT','event_ms':START,
            'first_seen_price':price,'horizons':{}}
def candle(t,o=100,h=101,l=99,c=100):
    return {'t':t,'o':o,'h':h,'l':l,'c':c}

class TestV4Forward(unittest.TestCase):
    def test_only_post_observation_closed_bars_count(self):
        bars=[candle(START-P,o=100,h=999,l=1,c=100)]+[
           candle(START+i*P,o=100,h=104 if i==7 else 101,
                  l=97 if i==5 else 99,c=102 if i==11 else 100) for i in range(12)]
        result=f.horizon_result(evidence(),START+3600000+2000,bars,3600000,P)
        self.assertEqual(result['state'],'OBSERVED')
        self.assertAlmostEqual(result['mfe_pct'],4)
        self.assertAlmostEqual(result['mae_pct'],3)
        self.assertEqual(result['verified_bars'],12)
        self.assertAlmostEqual(result['close_direction_pct'],2)

    def test_short_direction_is_symmetric(self):
        bars=[candle(START+i*P,o=100,h=103 if i==4 else 101,
              l=96 if i==7 else 99,c=98 if i==11 else 100) for i in range(12)]
        r=f.horizon_result(evidence('SHORT'),START+3600000+2000,bars,3600000,P)
        self.assertEqual((r['mfe_pct'],r['mae_pct'],r['close_direction_pct']),(4,3,2))

    def test_missing_middle_bar_never_makes_successful_metric(self):
        bars=[candle(START+i*P) for i in range(12) if i!=6]
        r=f.horizon_result(evidence(),START+3600000+2000,bars,3600000,P)
        self.assertEqual(r['state'],'DATA_GAP')
        self.assertIsNone(r.get('mfe_pct'))

    def test_open_horizon_is_tracking_not_win(self):
        r=f.horizon_result(evidence(),START+3500000,[candle(START+i*P) for i in range(11)],3600000,P)
        self.assertEqual(r['state'],'TRACKING')

    def test_old_immutable_observed_state_survives_api_errors(self):
        item=evidence()
        old={'model_version':f.VERSION,'started_at':'2026-10-16T18:00:00+00:00',
             'observations':{'setup1':item}}
        first=f.rebuild(old,[],START+3600000+2000,
                        {'BTCUSDT':{'5m':[candle(START+i*P) for i in range(12)]}})
        self.assertEqual(first['observations']['setup1']['horizons']['1H']['state'],'OBSERVED')
        result=f.rebuild(first,[],START+7200000,{})
        self.assertEqual(result['observations']['setup1']['horizons']['1H']['state'],'OBSERVED')

    def test_historical_v3_is_not_seeding_v4_archive(self):
        event={'type':'WATCH_STARTED','event_time_utc':f.view({},'x',T)['updated_at'],
               'symbol':'ETHUSDT','side':'LONG','setup_id':'legacy',
               'price_at_transition':100}
        result=f.rebuild({},[event],T,{'ETHUSDT':{'5m':[]}})
        self.assertFalse(result['observations'])

if __name__=='__main__':unittest.main()
