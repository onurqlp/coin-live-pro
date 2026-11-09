#!/usr/bin/env python3
"""Losslessly compact large append-only JSON books for GitHub publication.

Engines continue to read the original JSON paths. This helper rehydrates verified
gzip sidecars before a run and stores byte-identical compressed archives after it.
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
MANIFEST = pathlib.Path("archive/compact-json-archives.json")
SCHEMA = "uzayx.compact-json-archives.v1"
FILES = (
    pathlib.Path("archive/uzayx-research-ledger.json"),
    pathlib.Path("archive/v4-lifecycle-ledger.json"),
    pathlib.Path("archive/v4-forward-ledger.json"),
    pathlib.Path("archive/v4-watch-ledger.json"),
    pathlib.Path("archive/v4-spark-paper-ledger.json"),
)
MAX_GZIP_BYTES = 90 * 1024 * 1024


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def atomic(path: pathlib.Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".compact-tmp-", delete=False) as f:
        temp = pathlib.Path(f.name)
        f.write(data)
    os.replace(temp, path)


def checked_manifest(root: pathlib.Path) -> dict | None:
    path = root / MANIFEST
    if not path.exists():
        return None
    doc = json.loads(path.read_text(encoding="utf-8"))
    if doc.get("schema") != SCHEMA or not isinstance(doc.get("files"), list):
        raise ValueError("INVALID_COMPACT_ARCHIVE_MANIFEST")
    expected = {p.as_posix() for p in FILES}
    actual = {x.get("path") for x in doc["files"] if isinstance(x, dict)}
    if actual != expected or len(doc["files"]) != len(FILES):
        raise ValueError("COMPACT_ARCHIVE_FILE_SET_MISMATCH")
    return doc


def hydrate(root: pathlib.Path = ROOT) -> None:
    manifest = checked_manifest(root)
    if manifest is None:
        for path in FILES:
            target = root / path
            if not target.is_file():
                raise ValueError(f"MISSING_LEDGER_WITHOUT_COMPACT_ARCHIVE: {path}")
            json.loads(target.read_text(encoding="utf-8"))
        print("COMPACT_ARCHIVE_LEGACY_READY", len(FILES))
        return

    entries = {x["path"]: x for x in manifest["files"]}
    for path in FILES:
        rel = path.as_posix()
        entry = entries[rel]
        gzip_rel = pathlib.Path(entry.get("gzip_path", ""))
        if gzip_rel != pathlib.Path(rel + ".gz"):
            raise ValueError("UNEXPECTED_COMPACT_ARCHIVE_PATH")
        compressed = (root / gzip_rel).read_bytes()
        if len(compressed) != entry.get("gzip_bytes") or sha(compressed) != entry.get("gzip_sha256"):
            raise ValueError(f"COMPACT_ARCHIVE_GZIP_HASH_MISMATCH: {rel}")
        raw = gzip.decompress(compressed)
        if len(raw) != entry.get("raw_bytes") or sha(raw) != entry.get("raw_sha256"):
            raise ValueError(f"COMPACT_ARCHIVE_RAW_HASH_MISMATCH: {rel}")
        json.loads(raw)
        target = root / path
        if target.exists():
            existing = target.read_bytes()
            if sha(existing) != entry["raw_sha256"]:
                raise ValueError(f"REFUSE_TO_OVERWRITE_CHANGED_LEDGER: {rel}")
        else:
            atomic(target, raw)
    print("COMPACT_ARCHIVES_REHYDRATED", len(FILES), "verified ledgers")


def pack(root: pathlib.Path = ROOT) -> None:
    entries = []
    payloads = []
    for path in FILES:
        target = root / path
        if not target.is_file():
            raise ValueError(f"MISSING_LEDGER_DURING_COMPACTION: {path}")
        raw = target.read_bytes()
        json.loads(raw)
        compressed = gzip.compress(raw, compresslevel=9, mtime=0)
        if len(compressed) >= MAX_GZIP_BYTES:
            raise ValueError(f"COMPRESSED_LEDGER_STILL_TOO_LARGE: {path}")
        if gzip.decompress(compressed) != raw:
            raise ValueError(f"COMPACT_ARCHIVE_ROUNDTRIP_MISMATCH: {path}")
        gzip_path = pathlib.Path(path.as_posix() + ".gz")
        entries.append({
            "path": path.as_posix(),
            "gzip_path": gzip_path.as_posix(),
            "raw_bytes": len(raw),
            "raw_sha256": sha(raw),
            "gzip_bytes": len(compressed),
            "gzip_sha256": sha(compressed),
        })
        payloads.append((target, gzip_path, raw, compressed))

    for _, gzip_path, _, compressed in payloads:
        atomic(root / gzip_path, compressed)
    document = {
        "schema": SCHEMA,
        "generated_by": "scripts/compact_large_ledgers.py",
        "lossless": True,
        "files": entries,
    }
    atomic(root / MANIFEST, (json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8"))

    verified = checked_manifest(root)
    by_path = {item["path"]: item for item in verified["files"]}
    for target, gzip_path, raw, _ in payloads:
        item = by_path[target.relative_to(root).as_posix()]
        recovered = gzip.decompress((root / gzip_path).read_bytes())
        if recovered != raw or sha(recovered) != item["raw_sha256"]:
            raise ValueError(f"COMPACT_ARCHIVE_FINAL_VERIFY_FAILED: {target}")
    for target, _, _, _ in payloads:
        target.unlink()
    print("COMPACT_ARCHIVES_PACKED", len(FILES), "losslessly verified ledgers")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in ("hydrate", "pack"):
        raise SystemExit("usage: compact_large_ledgers.py hydrate|pack")
    (hydrate if sys.argv[1] == "hydrate" else pack)()


if __name__ == "__main__":
    main()
