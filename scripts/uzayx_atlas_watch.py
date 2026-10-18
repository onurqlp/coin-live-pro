#!/usr/bin/env python3
"""Append-only read-only hourly UzayX V4.1 Atlas/market research observation.

No strategy validation, paper fills, orders, manipulated-volume accusations or
future price attribution. Never mutates the trading ledger or prior journal rows.
"""
import datetime as dt
import hashlib
import json
import pathlib
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/"web"/"data"
ATLAS=DATA/"uzayx-atlas-v4.json"
JOURNAL=DATA/"uzayx-atlas-watch-history.json"
MAKINE="https://raw.githubusercontent.com/onurqlp/makine-core/main/site/data/support.json"
CODES=("A1","A2","A3","B1","B2","T0")

def parse_date(s):
    try:return dt.datetime.fromisoformat(str(s).replace("Z","+00:00")).astimezone(dt.timezone.utc)
    except (TypeError,ValueError,OverflowError):return None

def load(path):
    return json.loads(path.read_text(encoding="utf-8"))

def main():
    now=dt.datetime.now(dt.timezone.utc)
    stamp=now.isoformat(timespec="seconds").replace("+00:00","Z")
    atlas=load(ATLAS)
    if atlas.get("schema")!="uzayx.atlas.v4.web.v1" or len(atlas.get("events",[]))!=31:
        raise ValueError("Atlas dataset not the committed source; no observation saved")
    manifest=load(DATA/"v4-manifest.json")
    early=load(DATA/"v4-early.json")
    scan=manifest.get("scan_id")
    if not scan or early.get("scan_id")!=scan:
        raise ValueError("Market sources disagree: no research observation emitted")
    market_time=parse_date(manifest.get("finished_at_utc"))
    minutes=(now-market_time).total_seconds()/60 if market_time else None
    fresh=minutes is not None and -2<=minutes<=45 and manifest.get("publication_valid") is True
    known={e["symbol"].upper() for e in atlas["events"] if "/" not in e.get("symbol","")}
    known.update(x["symbol"].upper() for x in atlas["candidates"])
    entries=early.get("candidates",[]) if fresh else []
    matched=[]
    if isinstance(entries,list):
        for record in entries:
            if not isinstance(record,dict):continue
            symbol=str(record.get("symbol") or "").upper()
            base=symbol.removesuffix("USDT")
            if base not in known:continue
            matched.append({"symbol":symbol,"base":base,"research_tier":record.get("research_tier"),
               "side_observed":record.get("side"),
               "source_closed_1h_at_utc":record.get("source_closed_1h_at_utc"),
               "source_closed_4h_at_utc":record.get("source_closed_4h_at_utc"),
               "observed_at_utc":record.get("source_observed_at_utc"),
               "historical_event_prediction":False,
               "trade_ready":False})
    mod={"state":"UNAVAILABLE","asof_utc":None,
         "modules":[{"id":code,"state":"UNAVAILABLE"} for code in CODES]}
    try:
        req=urllib.request.Request(MAKINE,headers={"User-Agent":"UzayX-ReadOnly-Atlas/4.1"})
        with urllib.request.urlopen(req,timeout=10) as response:
            payload=json.load(response)
        sup_time=parse_date(payload.get("generated_at_utc"))
        age=(now-sup_time).total_seconds()/60 if sup_time else None
        if (payload.get("schema")=="makine-six-support-v2" and
            age is not None and -2<=age<=90 and
            isinstance(payload.get("modules"),list) and len(payload["modules"])==6):
            mapping={x.get("id"):x for x in payload["modules"] if isinstance(x,dict)}
            if all(c in mapping for c in CODES):
                mod={"state":"OBSERVATION_CONTEXT_ONLY","asof_utc":payload["generated_at_utc"],
                     "modules":[{"id":c,"state":mapping[c].get("state"),
                                 "data_scope":mapping[c].get("data_scope"),
                                 "observations":len(mapping[c].get("observations",[]) or []),
                                 "signal":False,"executable":False} for c in CODES]}
    except (OSError,ValueError,KeyError,TypeError):pass
    if JOURNAL.exists():
        journal=load(JOURNAL)
        if journal.get("schema")!="uzayx.atlas.watch.v1":raise ValueError("unexpected journal schema")
    else:
        journal={"schema":"uzayx.atlas.watch.v1","version":"4.1.0","append_only":True,"observations":[]}
    observations=journal.setdefault("observations",[])
    if observations and observations[-1].get("scan_id")==scan:
        print("Existing scan already observed; no new research entry")
        return
    if observations and observations[-1].get("observed_at_utc",">")>=stamp:
        print("Clock ordering unsafe; skip")
        return
    observations.append({"observed_at_utc":stamp,"scan_id":scan,
        "market_asof_utc":manifest.get("finished_at_utc"),"market_age_minutes":round(minutes,1) if minutes is not None else None,
        "market_state":"FRESH_RESEARCH" if fresh else "STALE_NO_MATCHING",
        "fresh_early_candidate_count":len(entries) if isinstance(entries,list) else 0,
        "historical_symbol_matches":matched[:100],
        "module_context":mod,
        "atlas_source_sha256":atlas.get("source_sha256"),
        "ohlcv_backtest":False,"predictions_verified":False,
        "futures_tradability_verified":False,
        "real_order":False,"simulated_fill":False,
        "note":"Historical token name overlap only, not recurring pattern proof or actionable signal."})
    JOURNAL.write_text(json.dumps(journal,ensure_ascii=False,indent=2,allow_nan=False)+"\n",encoding="utf-8")
    print("APPENDED atlas research:",stamp,"symbol matches",len(matched),"module-context",mod["state"])

if __name__=="__main__":main()
