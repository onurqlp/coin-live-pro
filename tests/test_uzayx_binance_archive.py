import datetime as dt
import hashlib
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import uzayx_binance_archive as archive


def fixture(checksum_valid=True):
    t=int(dt.datetime(2026,9,1,tzinfo=dt.timezone.utc).timestamp()*1000)
    row=f'{t},100,105,95,102,99,{t+3599999},0,0,0,0,0\n'
    buffer=io.BytesIO()
    with zipfile.ZipFile(buffer,'w') as z:z.writestr('BTCUSDT-1h-2026-09.csv',row)
    data=buffer.getvalue();checksum=hashlib.sha256(data).hexdigest()
    exchange={'symbols':[{'symbol':'BTCUSDT','quoteAsset':'USDT','contractType':'PERPETUAL',
        'status':'TRADING','onboardDate':t}]*11}
    def fetch(url,limit=archive.MAX_BYTES):
        if url.endswith('exchangeInfo'):return json.dumps(exchange).encode()
        if url.endswith('.CHECKSUM'):return (checksum if checksum_valid else '0'*64).encode()+b'  sample.zip\n'
        return data
    return fetch


class ArchiveTest(unittest.TestCase):
    def test_closed_monthly_data_is_verified_and_idempotent(self):
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(archive,'OUT',Path(temp)),patch.object(archive,'INDEX',Path(temp)/'index.json'):
                clock=dt.datetime(2026,10,20,tzinfo=dt.timezone.utc)
                one=archive.run(fixture(),max_artifacts=1,clock=clock)
                self.assertEqual(len(one['archives']),1)
                self.assertEqual(one['archives']['um/BTCUSDT/2026-09']['rows'],1)
                self.assertEqual(one['attempts']['um/BTCUSDT']['next_month'],'2026-10')
                self.assertFalse(one['real_orders'])
                two=archive.run(fixture(),max_artifacts=1,clock=clock)
                self.assertEqual(two['archives'],one['archives'])

    def test_bad_checksum_never_advances_cursor_or_publishes_bars(self):
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(archive,'OUT',Path(temp)),patch.object(archive,'INDEX',Path(temp)/'index.json'):
                result=archive.run(fixture(False),max_artifacts=1,
                    clock=dt.datetime(2026,10,20,tzinfo=dt.timezone.utc))
                self.assertEqual(result['archives'],{})
                self.assertEqual(result['attempts']['um/BTCUSDT']['next_month'],'2026-09')


if __name__=='__main__':unittest.main()
