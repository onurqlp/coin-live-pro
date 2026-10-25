import importlib.util
import tempfile
import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'engine'))

class RecoveryTests(unittest.TestCase):
    def module(self):
        self.assertIsNotNone(importlib.util.find_spec('turan_candles'),'persistent experiment candle recovery is missing')
        import turan_candles
        return turan_candles

    def test_rotated_coin_recovers_closed_gap_and_persists_it(self):
        m=self.module();step=300000;now=12*step
        exp={'symbol':'BTCUSDT','exchange':'OKX','decision_ms':step,'strategy_version':'v2','horizons':{},'arms':{'ORIGINAL':{'status':'SOURCE_GAP','last_bar_ms':step}}}
        prior={'experiments':[exp]};pack={'candles_by_symbol':{}}
        with tempfile.TemporaryDirectory() as root:
            def fetch(symbol,tf,start,end):
                return [[t,100,101,99,100,10] for t in range(start,end,step if tf=='5m' else 3600000)]
            out,diag=m.collect(prior,pack,now,Path(root),fetch=fetch,budget=1)
            self.assertIn(2*step,[r[0] for r in out['candles_by_symbol']['BTCUSDT']['5m']])
            again,_=m.collect(prior,pack,now,Path(root),fetch=lambda *a:[],budget=0)
            self.assertIn(2*step,[r[0] for r in again['candles_by_symbol']['BTCUSDT']['5m']])
            self.assertEqual(exp['arms']['ORIGINAL']['status'],'SOURCE_GAP')
            self.assertEqual(diag['requests'],1)

    def test_unclosed_and_conflicting_bars_cannot_replace_evidence(self):
        m=self.module();step=300000
        with tempfile.TemporaryDirectory() as root:
            p={'candles_by_symbol':{'BTCUSDT':{'5m':[[0,100,101,99,100,1],[step,100,101,99,100,1]]}}}
            out,_=m.collect({},p,step,Path(root),budget=0)
            self.assertEqual(len(out['candles_by_symbol']['BTCUSDT']['5m']),1)
            p['candles_by_symbol']['BTCUSDT']['5m'][0][4]=100.5
            with self.assertRaisesRegex(ValueError,'CONFLICT'):
                m.collect({},p,step,Path(root),budget=0)

    def test_invalid_legacy_symbol_does_not_block_current_scans(self):
        m=self.module();step=300000;now=12*step
        old={'symbol':'BTC-USDT-SWAP','exchange':'OKX','decision_ms':step,
             'horizons':{},'arms':{'ORIGINAL':{'status':'SOURCE_GAP'}}}
        prior={'experiments':[old]};pack={'candles_by_symbol':{'BTCUSDT':{'5m':[[0,100,101,99,100,1]]}}}
        with tempfile.TemporaryDirectory() as root:
            out,diag=m.collect(prior,pack,now,Path(root),fetch=lambda *args:[],budget=0)
            self.assertEqual(diag['quarantined_legacy_experiment_count'],1)
            self.assertEqual(diag['quarantined_legacy_symbols'],['BTC-USDT-SWAP'])
            self.assertEqual(prior['experiments'][0],old)
            self.assertIn('BTCUSDT',out['candles_by_symbol'])
            self.assertNotIn('BTC-USDT-SWAP',out['candles_by_symbol'])
            pack['candles_by_symbol']['BTC-USDT-SWAP']={'5m':[]}
            with self.assertRaisesRegex(ValueError,'INVALID_CANDLE_SYMBOL'):
                m.collect(prior,pack,now,Path(root),budget=0)
