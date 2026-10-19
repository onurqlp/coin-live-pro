import contextlib
import datetime as dt
import io
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'engine'))
import uzayx_cash_close as close
import v4_spark_paper as spark


class CloseCommandTests(unittest.TestCase):
    def test_manual_requests_are_unique_and_invalid_overrides_are_rejected(self):
        config={'close_request_id':'uzayx-original'}
        self.assertEqual(close.request_id(config,{}),'uzayx-original')
        self.assertEqual(close.request_id(config,{'UZAYX_CLOSE_REQUEST_ID':'uzayx-manual-123'}),'uzayx-manual-123')
        for bad in ['../../cash','uzayx-manual-','uzayx-manual-123/other','untrusted','uzayx-manual-abc']:
            with self.assertRaises(ValueError):close.request_id(config,{'UZAYX_CLOSE_REQUEST_ID':bad})

    def test_manual_close_replay_preserves_books_and_first_snapshot(self):
        now=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp)
            (root/'config').mkdir();(root/'archive').mkdir();(root/'web/data').mkdir(parents=True)
            (root/'config/uzayx-strategy-policy.json').write_text(json.dumps({'close_request_id':'uzayx-original'}))
            (root/'config/v4-policy.json').write_text(json.dumps({'paper':{}}))
            docs={'spark':spark.initial(now),'strict':{'no_real_orders':True,'orders':{},'events':[]},
                  'pilot':{'orders':{},'journal':[],'model_version':close.pilot.MODEL}}
            originals={}
            for k,p in close.BOOKS.items():
                raw=json.dumps(docs[k]).encode();(root/p).write_bytes(raw);originals[k]=raw
            (root/'web/data/market.json').write_text(json.dumps({'provider':'OKX','fetched_at':spark.stamp(now),'rows':[]}))
            with patch.object(close,'ROOT',root),patch.dict('os.environ',{'UZAYX_CLOSE_REQUEST_ID':'uzayx-manual-123'}),contextlib.redirect_stdout(io.StringIO()):
                close.main()
                first={k:(root/p).read_bytes() for k,p in close.BOOKS.items()}
                report=(root/'web/data/uzayx-cash-close.json').read_bytes()
                close.main()
            self.assertEqual(json.loads(report)['request_id'],'uzayx-manual-123')
            for k,p in close.BOOKS.items():
                self.assertEqual((root/p).read_bytes(),first[k])
                self.assertEqual((root/'archive/closings/uzayx-manual-123'/('before-'+k+'.json')).read_bytes(),originals[k])
            self.assertEqual((root/'web/data/uzayx-cash-close.json').read_bytes(),report)


if __name__=='__main__':unittest.main()
