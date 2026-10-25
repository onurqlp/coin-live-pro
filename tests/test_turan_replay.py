import importlib.util
import tempfile
import gzip
import hashlib
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'engine'))
H=3600000

class ReplayTests(unittest.TestCase):
    def module(self):
        self.assertIsNotNone(importlib.util.find_spec('turan_replay'),'canonical historical replay is missing')
        import turan_replay
        return turan_replay

    def test_partial_four_hour_bar_never_enters_features(self):
        m=self.module();rows=[[i*H,100,101,99,100,10] for i in range(8)]
        self.assertEqual([r['t'] for r in m.aggregate(rows,4*H,6*H)],[0])
        rows[6][4]=1000000
        self.assertEqual(m.aggregate(rows,4*H,6*H)[0]['c'],100)

    def test_absent_future_exit_is_unknown_not_zero_profit(self):
        m=self.module();a=m.trade_arm([],H,'LONG',1,reference=100)
        self.assertEqual(a['status'],'SOURCE_GAP')
        self.assertIsNone(a['modeled_net_usdt'])

    def test_same_bar_stop_and_target_is_stop_first_with_fees(self):
        m=self.module();rows=[[2*H,100,104,96,100,10]]
        a=m.trade_arm(rows,H,'LONG',1,reference=100)
        self.assertEqual(a['outcome'],'AMBIGUOUS_STOP_FIRST')
        self.assertLess(a['modeled_net_usdt'],-3)

    def test_checksum_mismatch_cannot_be_replayed(self):
        m=self.module()
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)/'month.json.gz';p.write_bytes(gzip.compress(json.dumps({'rows':[[0,100,101,99,100,1]]}).encode()))
            with self.assertRaisesRegex(ValueError,'CHECKSUM'):
                m.read_archive(Path(temp),{'path':'month.json.gz','sha256':'0'*64})

    def test_changed_deep_archive_replays_before_unchanged_shallow_cache(self):
        m=self.module()
        data={'BTCUSDT':[None]*1500,'ETHUSDT':[None]*1200,'AUSDT':[None]*300}
        hashes={symbol:symbol for symbol in data}
        implementation='v2'
        signature=lambda symbol:m.digest([implementation,hashes[symbol],hashes.get('BTCUSDT')])
        cache={'AUSDT':{'signature':signature('AUSDT')},
               'BTCUSDT':{'signature':'old-month'},
               'ETHUSDT':{'signature':signature('ETHUSDT')}}
        self.assertEqual(m.pending_symbols(data,hashes,cache,implementation)[:2],['BTCUSDT'])
        cache['ETHUSDT']['signature']='old-month'
        self.assertEqual(m.pending_symbols(data,hashes,cache,implementation)[:2],['BTCUSDT','ETHUSDT'])
