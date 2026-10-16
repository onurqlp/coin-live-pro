"""Archive contract: immutable first-sighting, no duplicated fake returns, safe 1m."""
import datetime as dt
import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'engine'))
import v4_watch_archive as a
import v4_forward as f

T=int(dt.datetime(2026,10,16,18,1,30,tzinfo=dt.timezone.utc).timestamp()*1000)
def iso(ms):return dt.datetime.fromtimestamp(ms/1000,dt.timezone.utc).isoformat()
def event(key,price):
    return {'event_id':key+'-start','setup_id':key,'symbol':'BTCUSDT',
            'side':'LONG','strategy_id':'TREND_BREAKOUT','type':'DISCOVERED',
            'event_time_utc':iso(T),'source_candle_closed_at_utc':iso(T-90000),
            'price_at_transition':price,'next_stage':'WATCH'}
class WatchArchive(unittest.TestCase):
    def test_every_discovery_kept_without_overwriting_first_price(self):
        prior={}
        life={'events':[event('one',100),event('two',102)],'items':[]}
        old,view=a.merge(prior,life,{},T,'scan-a')
        self.assertEqual(view['total'],2)
        self.assertTrue(view['archive_is_persistent'])
        newer={'events':[],'items':[{
            'setup_id':'one','symbol':'BTCUSDT','side':'LONG','first_seen_at':iso(T),
            'source_price':100,'price':180,'last_evaluated_at':iso(T+100000),
            'lifecycle_stage':'WATCH','review_state':'FRESH'}]}
        merged,public=a.merge(old,newer,{},T+100000,'scan-b')
        self.assertEqual(public['total'],2)
        self.assertEqual(next(x for x in public['records'] if x['setup_id']=='one')['first_seen_price'],100)
    def test_first_full_minute_does_not_use_pre_observation_high(self):
        row={'event_ms':T,'first_seen_price':100,'side':'LONG'}
        bar_start=((T+59999)//60000)*60000
        before={'t':bar_start-60000,'o':100,'h':900,'l':1,'c':120}
        after={'t':bar_start,'o':100,'h':104,'l':99,'c':102}
        r=f.first_post_event_minute(row,bar_start+70000,[before,after])
        self.assertEqual(r['state'],'OBSERVED')
        self.assertAlmostEqual(r['close_direction_pct'],2)
        self.assertEqual(r['measurement_kind'],'FIRST_FULL_POST_EVENT_1M_NOT_EXACT_1M_RETURN')
        self.assertGreater(r['measurement_delay_seconds'],60)
    def test_missing_1m_is_not_a_win(self):
        r=f.first_post_event_minute({'event_ms':T,'first_seen_price':100,'side':'SHORT'},T+120000,[])
        self.assertEqual(r['state'],'DATA_GAP')
        self.assertNotIn('close_direction_pct',r)
    def test_repeated_same_discovery_deduplicated(self):
        life={'events':[event('one',100),event('one',102)],'items':[]}
        _,pub=a.merge({},life,{},T,'scan')
        self.assertEqual(pub['total'],1)
if __name__=='__main__':unittest.main()
