"""Persistent closed OKX candles for resolving prospective paper experiments.

Recovery is retrospective OHLC evidence, never an exchange fill or cash input.
Original birth records are not changed. Conflicting observations fail closed.
"""
import concurrent.futures
import copy
import gzip
import json
import pathlib
import re
import urllib.parse
import urllib.request

from uzayx_research import closed_rows
from v4_early import epoch

STEPS={'5m':300000,'1H':3600000,'4H':14400000}

def request(symbol,tf,start,end):
    inst=symbol[:-4]+'-USDT-SWAP'
    query=urllib.parse.urlencode({'instId':inst,'bar':tf,'after':end,'limit':100})
    req=urllib.request.Request('https://www.okx.com/api/v5/market/history-candles?'+query,headers={'User-Agent':'UzayX-research/4.10'})
    with urllib.request.urlopen(req,timeout=8) as response:doc=json.load(response)
    if doc.get('code')!='0':raise ValueError('OKX_HISTORY_UNAVAILABLE')
    return [[int(r[0]),*map(float,r[1:6])] for r in doc['data'] if len(r)>=9 and r[8]=='1' and start<=int(r[0])<end]

def collect(prior,pack,now,root,fetch=None,budget=24):
    fetch=fetch or request
    out=copy.deepcopy(pack);frames=out.setdefault('candles_by_symbol',{})
    directory=pathlib.Path(root)/'research/turan-candles';directory.mkdir(parents=True,exist_ok=True)
    needs={};symbols=set(frames)
    # Preserve legacy experiment identity; isolate invalid old instruments.
    quarantined_legacy={}
    for item in prior.get('experiments',[]):
        if item.get('exchange','OKX')!='OKX':continue
        symbol=item.get('symbol')
        if not isinstance(symbol,str) or not re.fullmatch(r'[A-Z0-9]{2,35}USDT',symbol):
            key=str(symbol)
            quarantined_legacy[key]=quarantined_legacy.get(key,0)+1
            continue  # Never infer fills/PNL or rewrite an invalid legacy instrument.
        symbols.add(symbol);birth=item['decision_ms']
        for kind,arm in item['arms'].items():
            if arm.get('status') in ('CLOSED','BENCHMARK','NO_CONFIRMATION','BLOCKED_RISK'):continue
            eligible=birth
            if kind=='WAIT':
                confirm=(birth//STEPS['1H']+1)*STEPS['1H']
                if confirm+STEPS['1H']<=now:needs.setdefault((symbol,'1H'),set()).add(confirm)
                eligible=confirm+STEPS['1H']
            target=arm.get('last_bar_ms',eligible//300000*300000)+300000
            if target+300000<=now:needs.setdefault((symbol,'5m'),set()).add(target)
        from turan_experiments import HORIZONS
        for name,(span,tf,step) in HORIZONS.items():
            if birth+span>now or item.get('horizons',{}).get(name,{}).get('state')=='OBSERVED':continue
            target=((birth+span+step-1)//step)*step-step
            needs.setdefault((symbol,tf),set()).add(target)
    loaded={};dirty=set()
    def merge(symbol,tf,rows):
        step=STEPS[tf]
        valid=closed_rows(rows,step,now)
        valid_times={r['t'] for r in valid}
        book=loaded[(symbol,tf)]
        for row in rows:
            if row[0] not in valid_times:continue
            normalized=list(row[:6])
            if len(normalized)!=6:raise ValueError('CANDLE_VOLUME_MISSING')
            at=int(row[0]);old=book.get(at)
            if old is not None and old!=normalized:raise ValueError('TURAN_CANDLE_CONFLICT')
            if old is None:book[at]=normalized;dirty.add((symbol,tf))
    for symbol in sorted(symbols):
        if not re.fullmatch(r'[A-Z0-9]{2,35}USDT',symbol):raise ValueError('INVALID_CANDLE_SYMBOL')
        for tf in STEPS:
            path=directory/(symbol+'-'+tf+'.json.gz');loaded[(symbol,tf)]={}
            if path.exists():
                doc=json.loads(gzip.decompress(path.read_bytes()))
                if doc.get('source')!='OKX_CLOSED_HISTORY' or doc.get('symbol')!=symbol or doc.get('timeframe')!=tf:raise ValueError('INVALID_CANDLE_CACHE')
                merge(symbol,tf,doc['rows']);dirty.discard((symbol,tf))
            merge(symbol,tf,frames.get(symbol,{}).get(tf,[]))
    pending=[]
    for (symbol,tf),targets in needs.items():
        missing=sorted(t for t in targets if t not in loaded[(symbol,tf)])
        if missing:
            # Recent unresolved bars get a reserved priority over old gaps.
            recent=[t for t in missing if now-t<=48*3600000]
            first=min(recent or missing);step=STEPS[tf]
            pending.append((0 if recent else 1,-first,symbol,tf,first,min(first+100*step,now//step*step)))
    pending.sort();jobs=pending[:max(0,budget)];errors=[]
    state_path=directory/'recovery-state.json'
    state=json.loads(state_path.read_text()) if state_path.exists() else {'schema':'turan.candle.attempts.v1','sources':{}}
    if state.get('schema')!='turan.candle.attempts.v1' or not isinstance(state.get('sources'),dict):
        raise ValueError('INVALID_CANDLE_RECOVERY_STATE')
    def work(job):
        _,_,symbol,tf,start,end=job
        try:return symbol,tf,fetch(symbol,tf,start,end),None
        except (OSError,ValueError,KeyError,TypeError) as exc:return symbol,tf,[],type(exc).__name__
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for job,(symbol,tf,rows,error) in zip(jobs,pool.map(work,jobs)):
            key=symbol+'|'+tf+'|'+str(job[4]);attempt=state['sources'].get(key,{})
            attempt['attempts']=attempt.get('attempts',0)+1
            attempt['last_attempt_ms']=now
            if not error:merge(symbol,tf,rows)
            if not error and job[4] not in loaded[(symbol,tf)]:error='SOURCE_BAR_MISSING'
            attempt['last_error']=error
            state['sources'][key]=attempt
            if error:errors.append({'symbol':symbol,'timeframe':tf,'error':error})
    for (symbol,tf),book in loaded.items():
        rows=[book[t] for t in sorted(book)]
        if rows:frames.setdefault(symbol,{})[tf]=rows
        if (symbol,tf) in dirty:
            doc={'source':'OKX_CLOSED_HISTORY','symbol':symbol,'timeframe':tf,'rows':rows,'observed_at_ms':now,'not_exchange_fills':True}
            path=directory/(symbol+'-'+tf+'.json.gz');temp=path.with_suffix('.tmp')
            temp.write_bytes(gzip.compress(json.dumps(doc,separators=(',',':')).encode(),mtime=0));temp.replace(path)
    unresolved=sum(t not in loaded[key] for key,ts in needs.items() for t in ts)
    for key,attempt in list(state['sources'].items()):
        symbol,tf,stamp=key.rsplit('|',2)
        if int(stamp) in loaded.get((symbol,tf),{}):attempt['last_error']=None
    temp=state_path.with_suffix('.tmp')
    temp.write_text(json.dumps(state,separators=(',',':'))+'\n');temp.replace(state_path)
    unresolved_attempts=[{'symbol':key.split('|')[0],'timeframe':key.split('|')[1],
        'error':entry['last_error'],'attempts':entry['attempts'],'last_attempt_ms':entry['last_attempt_ms']}
        for key,entry in state['sources'].items() if entry.get('last_error')]
    return out,{'schema':'turan.candle.recovery.v1','requests':len(jobs),'budget':budget,
        'unresolved_requested_bars':unresolved,'pending_coin_frames':len(pending),
        'errors':errors,'retrying_sources':len(unresolved_attempts),'last_errors':unresolved_attempts[-8:],
        'cache_symbols':len(symbols),'recovered_candles_are_retrospective':True,
        'no_cash_inputs':True,'observed_at_ms':now,
        'quarantined_legacy_experiment_count':sum(quarantined_legacy.values()),
        'quarantined_legacy_symbols':sorted(quarantined_legacy)}
