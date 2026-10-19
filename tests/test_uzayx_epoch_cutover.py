"""Minimal data-loss regression for the one-time virtual cashbook cutover."""
import datetime as dt
import hashlib
import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
sys.path.insert(0,str(ROOT/'engine'))
import uzayx_epoch_cutover as cutover

class TestEpochCutover(unittest.TestCase):
    def test_full_old_cashbooks_archived_before_empty_epoch(self):
        with tempfile.TemporaryDirectory() as tmp:
            base=pathlib.Path(tmp)
            paths={
                'spark-ledger':base/'archive/v4-spark-paper-ledger.json',
                'v4-ledger':base/'archive/v4-paper-ledger.json',
                'spark-public':base/'web/data/v4-spark-paper.json',
                'v4-public':base/'web/data/v4-paper.json',
            }
            old={
                'spark-ledger':{'model_version':'4.0.3-spark-paper-a1',
                    'no_real_orders':True,'tickets':[{'event_id':'old','status':'OPEN',
                    'reference_notional_usdt':10}]},
                'v4-ledger':{'model_version':'4.0.0-paper-a1',
                    'no_real_orders':True,'orders':{'q':{'status':'FILLED'}}},
                'spark-public':{'all_events_count':1,
                    'summary':{'counts':{'OPEN':1,'CLOSED':0,'WAITING_FUTURE_BAR':0}}},
                'v4-public':{'no_real_orders':True},
            }
            before={}
            for name,path in paths.items():
                path.parent.mkdir(parents=True,exist_ok=True)
                path.write_text(json.dumps(old[name]),encoding='utf-8')
                before[name]=path.read_bytes()
            policy_path=base/'config/v4-policy.json'
            policy_path.parent.mkdir(parents=True,exist_ok=True)
            policy_path.write_text(json.dumps({'policy_version':'research-test'}))
            epoch_path=base/'config/uzayx-paper-epoch.json'
            name='uzayx-unit-test-epoch'
            epoch_path.write_text(json.dumps({'epoch_id':name}))
            at=dt.datetime(2026,10,19,14,0,tzinfo=dt.timezone.utc)
            with mock.patch.object(cutover,'ROOT',base),mock.patch.object(cutover,'EPOCH',epoch_path),mock.patch.object(cutover,'SOURCES',paths):
                self.assertTrue(cutover.main(now=at))
                checkpoint=json.loads((base/'archive/epochs'/name/'checkpoint.json').read_text())
                self.assertEqual(checkpoint['previous_all_events_count'],1)
                self.assertEqual(checkpoint['previous_v4_order_count'],1)
                for key,raw in before.items():
                    saved=(base/'archive/epochs'/name/(key+'.json')).read_bytes()
                    self.assertEqual(saved,raw)
                    self.assertEqual(checkpoint['archived_sha256'][key],hashlib.sha256(raw).hexdigest())
                fresh=json.loads(paths['spark-ledger'].read_text())
                strict=json.loads(paths['v4-ledger'].read_text())
                self.assertEqual(fresh['epoch_id'],name)
                self.assertEqual(fresh['tickets'],[])
                self.assertEqual(strict['orders'],{})
                self.assertTrue(cutover.main(now=at))
                self.assertEqual((base/'archive/epochs'/name/'spark-ledger.json').read_bytes(),
                                 before['spark-ledger'])
