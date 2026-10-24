import gzip
import json
import tempfile
import unittest
from pathlib import Path
from engine.turan_core import archive_cycle


class CycleArchiveTests(unittest.TestCase):
    def test_midnight_retry_uses_frozen_source_day_and_rejects_conflict(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            record={'scan_id':'s','at_utc':'2026-10-24T23:59:59Z',
                'source_mtf_at':'2026-10-24T23:58:00Z','evaluations':[{'strategy_id':'T001'}]}
            ref=archive_cycle(root,record)
            retry={**record,'at_utc':'2026-10-25T00:00:01Z'}
            self.assertEqual(ref,archive_cycle(root,retry))
            self.assertEqual(len(list((root/'archive/turan-cycles').glob('*.gz'))),1)
            with self.assertRaisesRegex(ValueError,'IMMUTABLE_CYCLE_CONFLICT'):
                archive_cycle(root,{**retry,'evaluations':[]})

    def test_retry_after_journal_failure_keeps_one_immutable_cycle(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            record={'scan_id':'s','at_utc':'2026-10-24T08:00:00Z','evaluations':[{'strategy_id':'T001','evaluation_id':'e'}]}
            ref=archive_cycle(root,record)
            again=archive_cycle(root,{**record,'at_utc':'2026-10-24T08:01:00Z'})
            self.assertEqual(ref,again)
            with gzip.open(root/ref['path'],'rt') as f:rows=[json.loads(x) for x in f]
            self.assertEqual(len(rows),1)
            with self.assertRaisesRegex(ValueError,'IMMUTABLE_CYCLE_CONFLICT'):
                archive_cycle(root,{**record,'evaluations':[]})
