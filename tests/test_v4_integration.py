"""Offline V4 pipeline rehearsal against the repository's real V3.1 snapshot.

The test uses the source snapshot's OWN time, not the runner wall-clock.
No live market API call, no browser or trading key, and no fabricated fill.
"""
import datetime as dt
import json
import pathlib
import sys
import tempfile
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'engine'))
import v4_lifecycle
import v4_oi
import v4_paper
import v4_shadow
import v4_lab
import v4_forward
import v4_publication
import v4_watch_archive
import v4_early

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web'/'data'
def read(path):
    return json.loads(path.read_text(encoding='utf8'))

class TestV4OfflineIntegrated(unittest.TestCase):
    def rehearsal(self):
        m=read(DATA/'mtf.json')
        radar=read(DATA/'swing-radar.json')
        market=read(DATA/'market.json')
        health=read(DATA/'health.json')
        policy=read(ROOT/'config'/'v4-policy.json')
        now=int(dt.datetime.fromisoformat(health['updated_at']).timestamp()*1000)+1000
        oi=v4_oi.merge({},m,now)
        oi_pub={k:v for k,v in oi.items() if k not in ('recent','hourly')}
        original_data=v4_lifecycle.DATA
        with tempfile.TemporaryDirectory() as tmp:
            path=pathlib.Path(tmp)
            (path/'v4-oi.json').write_text(json.dumps(oi_pub))
            v4_lifecycle.DATA=path
            try:life,board=v4_lifecycle.build(m,radar,market,{},now,policy)
            finally:v4_lifecycle.DATA=original_data
            wallet,account=v4_paper.advance({},life,market,now,{}, {},policy)
            account['scan_id']=board['scan_id']
            shadow=v4_shadow.build({},life['events'],now,{}, {},policy)
            shadow_public={'scan_id':board['scan_id'],'updated_at':v4_lifecycle.iso(now),
                           'model_version':v4_shadow.VERSION,'combined_with_main_cash':False}
            forward=v4_forward.rebuild({},life['events'],now,{})
            forward_public=v4_forward.view(forward,board['scan_id'],now)
            lab=v4_lab.compile_report(life,wallet,shadow,now,forward)
            lab['scan_id']=board['scan_id']
            history={'model_version':'4.0.0','scan_id':board['scan_id'],
                'updated_at':board['updated_at'],'archive_days':90,
                'archived_total':life['archived_count'],'events':life['events'][-140:]}
            watch_ledger,watch_public=v4_watch_archive.merge({},life,forward,now,board['scan_id'])
            early_ledger,early_public=v4_early.build(m,market,board,{},watch_public,now)
            context_public={'model_version':'4.0.0-context-research-a1','updated_at':v4_lifecycle.iso(now),
                'source_status':{'all':'UNAVAILABLE'},'latest_items':[],
                'score_not_used_for_paper_or_v4_stage':True}
            for key,obj in [('v4-watch-archive',watch_public),('v4-early',early_public),('v4-context',context_public),
                            ('market',market),('mtf',m),('swing-radar',radar),
                            ('health',health),('v4-oi',oi_pub),('v4-radar',board),
                            ('v4-history-index',history),
                            ('v4-paper',account),('v4-shadow',shadow_public),
                            ('v4-forward',forward_public),('v4-lab',lab)]:
                (path/(key+'.json')).write_text(json.dumps(obj))
            old=v4_publication.DATA
            v4_publication.DATA=path
            try:
                manifest=v4_publication.produce(now+1000)
                self.assertTrue(manifest['publication_valid'])
                self.assertEqual(manifest['candidate_counts']['v4']['spotlight'],0)
                self.assertEqual(account['equity_usdt'],10000.)
                self.assertFalse(account['legacy_v3_balance_included'])
                self.assertTrue(account['no_real_orders'])
                self.assertTrue(all(x['lifecycle_stage']=='WATCH' for x in life['items']))
                self.assertEqual(len(manifest['sources']),14)
                self.assertEqual(watch_public['total'],len(watch_public['records']))
                shadow_public['scan_id']='incorrect-mixed-round'
                (path/'v4-shadow.json').write_text(json.dumps(shadow_public))
                with self.assertRaisesRegex(RuntimeError,'scan ids'):
                    v4_publication.produce(now+1000)
            finally:v4_publication.DATA=old
    def test_offline_3_1_source_to_new_v4_contract_without_lookahead(self):
        self.rehearsal()
if __name__=='__main__':unittest.main()
