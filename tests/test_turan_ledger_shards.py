import json
import pathlib
import tempfile
import unittest

from scripts.turan_ledger_shards import INDEX, LEGACY, SHARDS, hydrate, pack


class TuranShardTests(unittest.TestCase):
    def setup_archive(self, root):
        ledger = dict(schema="turan.experiments.v1",
                      started_at_utc="2026-10-24T00:00:00+00:00",
                      last_scan_id="scan",
                      no_real_orders=True,
                      separate_from_shared_cash=True,
                      experiments=[dict(experiment_id=f"EXP-{i:04d}", strategy_id="T001",
                                        arms={"INVERSE": {"modeled_net_usdt": -i}},
                                        outcome="çalışma") for i in range(7)])
        p = root / LEGACY
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(ledger), encoding="utf-8")
        return ledger

    def test_lossless_shards_and_restore(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            original = self.setup_archive(root)
            result = pack(root, chunk_size=3)
            self.assertEqual(result["experiment_count"], 7)
            self.assertEqual(len(result["parts"]), 3)
            (root / LEGACY).unlink()
            self.assertEqual(hydrate(root), original)
            self.assertEqual(json.loads((root / LEGACY).read_text()), original)

    def test_corrupt_shard_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            self.setup_archive(root)
            pack(root, chunk_size=3)
            (root / LEGACY).unlink()
            part = root / SHARDS / "part-00000.json.gz"
            part.write_bytes(b"corrupt")
            with self.assertRaisesRegex(ValueError, "HASH_MISMATCH"):
                hydrate(root)
            self.assertFalse((root / LEGACY).exists())

    def test_prevent_data_loss(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            self.setup_archive(root)
            pack(root, chunk_size=3)
            obj = json.loads((root / LEGACY).read_text())
            obj["experiments"].pop()
            (root / LEGACY).write_text(json.dumps(obj))
            with self.assertRaisesRegex(ValueError, "REGRESSION"):
                pack(root, chunk_size=3)

    def test_missing_archive_fails(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError, "MISSING_EXPERIMENT_ARCHIVE"):
                hydrate(d)


if __name__ == "__main__":
    unittest.main()
