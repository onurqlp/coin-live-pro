#!/usr/bin/env python3
"""Lossless, versioned TARAN/TURAN experiment archive shards.

GitHub rejects individual blobs >100 MB. Keep a *temporary*, ignored aggregate
for existing research engines; persist every experiment in small sha256-checked
gzip members. Never silently initialize a missing or corrupt production archive.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import os
import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
LEGACY = pathlib.Path("archive/turan-experiments-ledger.json")
SHARDS = pathlib.Path("archive/turan-ledger-shards")
INDEX = SHARDS / "manifest.json"
SCHEMA = "turan.experiments.shards.v1"
LEDGER_SCHEMA = "turan.experiments.v1"
CHUNK_SIZE = 1000
MAX_PART_BYTES = 32 * 1024 * 1024  # well below GitHub's single-blob limit


def check_ledger(ledger):
    if not isinstance(ledger, dict) or ledger.get("schema") != LEDGER_SCHEMA:
        raise ValueError("INVALID_LEDGER_SCHEMA")
    if ledger.get("no_real_orders") is not True or ledger.get("separate_from_shared_cash") is not True:
        raise ValueError("INVALID_PAPER_ONLY_LEDGER")
    experiments = ledger.get("experiments")
    if not isinstance(experiments, list):
        raise ValueError("INVALID_LEDGER_EXPERIMENTS")
    ids = [x.get("experiment_id") if isinstance(x, dict) else None for x in experiments]
    if not all(isinstance(x, str) and x for x in ids) or len(set(ids)) != len(ids):
        raise ValueError("INVALID_OR_DUPLICATED_EXPERIMENT_ID")
    return ledger


def _write_atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".shard-tmp-", delete=False) as f:
        temp = pathlib.Path(f.name)
        f.write(data)
    os.replace(temp, path)


def _read_shards(root):
    folder = root / SHARDS
    index_path = root / INDEX
    index = json.loads(index_path.read_text(encoding="utf-8"))
    if index.get("schema") != SCHEMA or not isinstance(index.get("parts"), list):
        raise ValueError("INVALID_SHARD_MANIFEST")
    meta = index.get("ledger_meta")
    if not isinstance(meta, dict) or "experiments" in meta:
        raise ValueError("INVALID_SHARD_LEDGER_META")
    experiments = []
    for n, part in enumerate(index["parts"]):
        expected = f"part-{n:05d}.json.gz"
        if part.get("file") != expected:
            raise ValueError("SHARD_UNEXPECTED_FILENAME")
        data = (folder / expected).read_bytes()  # fail closed if missing
        if len(data) != part.get("bytes") or hashlib.sha256(data).hexdigest() != part.get("sha256"):
            raise ValueError("SHARD_HASH_MISMATCH")
        group = json.loads(gzip.decompress(data))
        if not isinstance(group, list) or len(group) != part.get("count"):
            raise ValueError("SHARD_COUNT_MISMATCH")
        experiments.extend(group)
    if len(experiments) != index.get("experiment_count"):
        raise ValueError("ARCHIVE_EXPERIMENT_REGRESSION")
    return check_ledger(dict(meta, experiments=experiments))


def hydrate(root=ROOT):
    """Reconstruct the ignored aggregate before running existing engines."""
    root = pathlib.Path(root)
    if (root / INDEX).exists():
        data = _read_shards(root)
        payload = (json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
        _write_atomic(root / LEGACY, payload)
        print("TURAN_ARCHIVE_RESTORED", len(data["experiments"]))
        return data
    legacy = root / LEGACY
    if not legacy.is_file():
        raise ValueError("MISSING_EXPERIMENT_ARCHIVE: refuse empty reset")
    data = check_ledger(json.loads(legacy.read_text(encoding="utf-8")))
    print("TURAN_ARCHIVE_LEGACY_MIGRATION_READY", len(data["experiments"]))
    return data


def pack(root=ROOT, chunk_size=CHUNK_SIZE):
    """Write versioned compressed members; retain historical index and all IDs."""
    root = pathlib.Path(root)
    if not isinstance(chunk_size, int) or chunk_size < 1:
        raise ValueError("INVALID_CHUNK_SIZE")
    legacy = root / LEGACY
    ledger = check_ledger(json.loads(legacy.read_text(encoding="utf-8")))
    previous = _read_shards(root) if (root / INDEX).exists() else None
    if previous and len(ledger["experiments"]) < len(previous["experiments"]):
        raise ValueError("ARCHIVE_EXPERIMENT_REGRESSION")
    # Preserve metadata and original insertion order; don't rewrite cash or rules.
    meta = {k: v for k, v in ledger.items() if k != "experiments"}
    entries = ledger["experiments"]
    parts = []
    for i in range(0, len(entries), chunk_size):
        group = entries[i:i + chunk_size]
        raw = json.dumps(group, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        compressed = gzip.compress(raw, compresslevel=6, mtime=0)
        if len(compressed) > MAX_PART_BYTES:
            raise ValueError("SHARD_TOO_LARGE: reduce chunk size")
        name = f"part-{len(parts):05d}.json.gz"
        _write_atomic(root / SHARDS / name, compressed)
        parts.append(dict(file=name, count=len(group), bytes=len(compressed),
                          sha256=hashlib.sha256(compressed).hexdigest()))
    index = dict(schema=SCHEMA, ledger_meta=meta, experiment_count=len(entries),
                 part_size_experiments=chunk_size, parts=parts,
                 no_real_orders=True, lossless=True)
    _write_atomic(root / INDEX, (json.dumps(index, ensure_ascii=False,
                                                separators=(",", ":")) + "\n").encode("utf-8"))
    restored = _read_shards(root)
    if restored != ledger:
        raise ValueError("SHARD_ROUNDTRIP_MISMATCH")
    print("TURAN_ARCHIVE_SHARDED", len(entries), "items", len(parts), "verified parts")
    return index


def main():
    command = sys.argv[1] if len(sys.argv) == 2 else ""
    if command == "hydrate":
        hydrate()
    elif command == "pack":
        pack()
    else:
        raise SystemExit("usage: turan_ledger_shards.py hydrate|pack")


if __name__ == "__main__":
    main()
