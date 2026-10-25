#!/usr/bin/env python3
"""Canonical TURAN rules on verified historical Binance USDT hourly archives.

Separate research only. H1 execution scenario, not the live 5m cash model.
No automatic promotion, complete net PnL or reconstructed historical fills.
"""
import datetime as dt
import gzip
import hashlib
import json
import pathlib
from collections import defaultdict,Counter

import mtf
import turan_rules as rules
from uzayx_strategy_bank import registry
from turan_experiments import report_results
from uzayx_research import closed_rows

ROOT=pathlib.Path(__file__).resolve().parents[1]
H=3600000
POLICY='H1_ONE_FULL_BAR_DELAY_ATR1_TP2_MODELED_COSTS_v1'
FEE=.0006
SLIP=.0003
HALF_SPREAD=.0001 # Fixed research scenario, not an observed historical spread.
NOTIONAL=300.

def digest(x):return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def iso(ms):return dt.datetime.fromtimestamp(ms/1000,dt.timezone.utc).isoformat()

def aggregate(rows,step,decision):
    groups=defaultdict(list)
    for r in rows:
        if r[0]+H<=decision:groups[r[0]//step*step].append(r)
    out=[]
    for start,part in sorted(groups.items()):
        part=sorted(part)
        if start+step>decision or [r[0] for r in part]!=list(range(start,start+step,H)):continue
        out.append({'t':start,'o':part[0][1],'h':max(r[2] for r in part),'l':min(r[3] for r in part),'c':part[-1][4],'v':sum(r[5] for r in part)})
    return out

def trade_arm(rows,decision,side,atr,reference,wait=False):
    by={r[0]:r for r in rows};eligible=decision
    if wait:
        confirmation=by.get(decision+H)
        if confirmation is None:return {'status':'SOURCE_GAP','modeled_net_usdt':None}
        sign=1 if side=='LONG' else -1
        if sign*(confirmation[4]-reference)<=0:return {'status':'NO_CONFIRMATION','modeled_net_usdt':0.,'exit_ms':decision+2*H}
        eligible=decision+2*H
    start=eligible+H;first=by.get(start)
    if first is None:return {'status':'SOURCE_GAP','modeled_net_usdt':None}
    if not rules.number(atr) or atr<=0 or atr>=35:return {'status':'BLOCKED_RISK','modeled_net_usdt':None}
    sign=1 if side=='LONG' else -1;entry=first[1]*(1+sign*(SLIP+HALF_SPREAD));qty=NOTIONAL/entry
    stop=entry*(1-sign*atr/100);target=entry*(1+sign*2*atr/100)
    for t in range(start,start+24*H,H):
        r=by.get(t)
        if r is None:return {'status':'SOURCE_GAP','modeled_net_usdt':None}
        hit_stop=r[3]<=stop if sign>0 else r[2]>=stop
        hit_target=r[2]>=target if sign>0 else r[3]<=target
        if hit_stop:
            raw=min(r[1],stop) if sign>0 else max(r[1],stop);outcome='AMBIGUOUS_STOP_FIRST' if hit_target else 'STOP'
        elif hit_target:raw=target;outcome='TAKE_PROFIT'
        elif t==start+23*H:raw=r[4];outcome='TIME_EXIT'
        else:continue
        fill=raw*(1-sign*(SLIP+HALF_SPREAD));fees=NOTIONAL*FEE+fill*qty*FEE
        return {'status':'CLOSED','outcome':outcome,'entry_ms':start,'exit_ms':t+H,
            'modeled_net_usdt':round(sign*(fill-entry)*qty-fees,8),'fees_usdt':round(fees,8),
            'entry_fill':entry,'exit_fill':fill,'complete_net_usdt':None}
    raise AssertionError('UNREACHABLE_REPLAY_EXIT')

def read_archive(directory,meta):
    path=(directory/meta['path']).resolve()
    if not path.is_relative_to(directory.resolve()):raise ValueError('INVALID_REPLAY_SOURCE_PATH')
    data=path.read_bytes()
    if hashlib.sha256(data).hexdigest()!=meta['sha256']:raise ValueError('REPLAY_SOURCE_CHECKSUM_MISMATCH')
    doc=json.loads(gzip.decompress(data));rows=doc['rows']
    closed_rows(rows,H,max((r[0] for r in rows),default=0)+H)
    if any(len(r)!=6 or not rules.number(r[5]) or r[5]<0 for r in rows):raise ValueError('INVALID_REPLAY_VOLUME')
    return rows

def replay_symbol(rows,symbol,market,source_hash,btc_rows=None):
    rows=sorted(rows);bytime={r[0]:r for r in rows}
    if len(bytime)!=len(rows):raise ValueError('DUPLICATE_REPLAY_BAR')
    register={r['id']:r for r in registry()};events=[];blocked=Counter();evaluated=Counter();cooldown={}
    if not rows:return {'events':[],'evaluated':{},'blocked':{},'source_hash':source_hash,'split_ms':None}
    warmup=rows[min(len(rows)-1,25*24)][0]+H
    split=warmup+int(max(0,rows[-1][0]+H-warmup)*.7)//H*H
    for index in range(40,len(rows)):
        decision=rows[index][0]+H
        # Missing consecutive input prevents every rule evaluation for this coin/hour.
        hour=aggregate(rows[max(0,index-94):index+1],H,decision)
        if len(hour)<40 or any(b['t']-a['t']!=H for a,b in zip(hour,hour[1:])):continue
        frames={'1H':mtf.state(hour,'1H')}
        for tf,step in [('4H',4*H),('1D',24*H)]:frames[tf]=mtf.state(aggregate(rows[:index+1],step,decision)[-95:],tf)
        if any(f.get('quality')!='CLOSED_CONFIRMED' for f in frames.values()):continue
        btc=aggregate(btc_rows or [],H,decision)[-95:]
        for side in ('LONG','SHORT'):
            metric=rules.metrics({'frames':frames},hour,btc,[],side)
            for n,conditions in rules.RULES.items():
                sid=f'T{n:03}'
                if any(metric.get(k) is None for k,_,_ in conditions):blocked[sid]+=1;continue
                evaluated[sid]+=1
                if decision<cooldown.get((sid,side),0) or not rules.matches(conditions,metric):continue
                atr=frames['1H'].get('atr_pct');reference=rows[index][4]
                original=trade_arm(rows,decision,side,atr,reference)
                inverse=trade_arm(rows,decision,'SHORT' if side=='LONG' else 'LONG',atr,reference)
                wait=trade_arm(rows,decision,side,atr,reference,wait=True)
                until=max(a.get('exit_ms',decision+25*H) for a in [original,inverse,wait]);cooldown[(sid,side)]=until
                # Purge discovery labels crossing the holdout boundary.
                split_name='HOLDOUT' if decision>=split else 'DISCOVERY' if until<split else 'PURGED_BOUNDARY'
                r=register[sid];identity=[sid,r['strategy_version'],r['strategy_config_hash'],symbol,side,decision,source_hash,POLICY]
                events.append({'experiment_id':'HIST-'+digest(identity)[:24],'episode_id':symbol+':'+side+':'+str(decision//(24*H)),
                    'strategy_id':sid,'strategy_version':r['strategy_version'],'rules_hash':r['strategy_config_hash'],
                    'equivalence_group':r['equivalence_group'],'symbol':symbol,'direction':side,'decision_ms':decision,
                    'exchange':'BINANCE','contract_type':'UM_USDT_ARCHIVE','experiment_policy':POLICY,'split':split_name,
                    'arms':{'ORIGINAL':original,'INVERSE':inverse,'WAIT':wait,'NO_TRADE':{'status':'BENCHMARK','modeled_net_usdt':0.}},
                    'source_hash':source_hash,'funding':'UNKNOWN','liquidation':'UNKNOWN','complete_net_usdt':None})
    return {'events':events,'evaluated':dict(evaluated),'blocked':dict(blocked),'source_hash':source_hash,'split_ms':split,
        'first_bar':iso(rows[0][0]),'last_bar':iso(rows[-1][0]),'bars':len(rows),'market':market}

def report(symbol_results):
    events=[e for s in symbol_results.values() for e in s['events']];cohorts=report_results(events)
    splits={name:report_results([e for e in events if e['split']==name]) for name in ('DISCOVERY','HOLDOUT','PURGED_BOUNDARY')}
    for cohort in cohorts['cohorts']:
        items=[e for e in events if e['strategy_id']==cohort['strategy_id'] and e['rules_hash']==cohort['rules_hash']]
        cohort['arm_risk_diagnostics']={}
        for arm in ('ORIGINAL','INVERSE','WAIT'):
            curve=peak=drawdown=0.;losses=max_losses=0
            for event in sorted(items,key=lambda e:e['arms'][arm].get('exit_ms',0)):
                outcome=event['arms'][arm]
                if outcome['status']!='CLOSED':continue
                value=outcome['modeled_net_usdt'];curve+=value;peak=max(peak,curve);drawdown=max(drawdown,peak-curve)
                losses=losses+1 if value<0 else 0;max_losses=max(max_losses,losses)
            cohort['arm_risk_diagnostics'][arm]={'summed_research_drawdown_usdt':round(drawdown,6),'max_consecutive_losses':max_losses,'portfolio_drawdown':False}
    statuses=[]
    for r in registry():
        n=sum(s['evaluated'].get(r['id'],0) for s in symbol_results.values())
        matches=sum(e['strategy_id']==r['id'] for e in events)
        statuses.append({'id':r['id'],'role':r['role'],'strategy_version':r['strategy_version'],'rules_hash':r['strategy_config_hash'],
            'equivalence_group':r['equivalence_group'],'evaluated_coin_directions':n,'experiments':matches,
            'status':'EVALUATED' if n else 'BLOCKED_REQUIRED_SOURCE' if r['role']=='SOURCE_DEPENDENT_HYPOTHESIS' else 'CONTROL_RESEARCH_ONLY' if r['role']=='CONTROL_OR_RESEARCH' else 'INSUFFICIENT_HISTORY_OR_CROSS_MARKET_SOURCE'})
    return {'schema':'turan.replay.v1','generated_at_utc':dt.datetime.now(dt.timezone.utc).isoformat(),
        'strategy_version':rules.VERSION,'source':'BINANCE_VERIFIED_MONTHLY_1H','symbols_replayed':len(symbol_results),
        'bars_loaded':sum(s['bars'] for s in symbol_results.values()),'experiments':len(events),'strategies':statuses,
        'paired_results':cohorts,'split_results':splits,'execution_policy':POLICY,'source_periods':{k:{a:s[a] for a in ('first_bar','last_bar','bars','source_hash','split_ms')} for k,s in symbol_results.items()},
        'complete_net_usdt':None,'funding':'UNKNOWN','liquidation':'UNKNOWN','portfolio_return':False,
        'current_tradability_verified':False,'historical_universe_complete':False,'no_real_orders':True,'auto_promote':False,
        'cost_scenario':{'fee_per_side':FEE,'slippage_per_side':SLIP,'assumed_half_spread':HALF_SPREAD,'spread_observed':False,'notional_usdt':NOTIONAL,'max_hold_hours':24},
        'selection_warning':'Retrospective discovery, overlapping hypotheses and fixed spread scenario; no validated profitable winners.'}

def pending_symbols(data,hashes,cached,implementation):
    """Revisit changed archives first; deep continuous histories produce usable frames sooner."""
    ordered=sorted(data,key=lambda symbol:(-len(data[symbol]),symbol))
    return [symbol for symbol in ordered if cached.get(symbol,{}).get('signature')!=
            digest([implementation,hashes[symbol],hashes.get('BTCUSDT')])]

def main(root=ROOT,budget=16):
    directory=root/'research/binance-history';index=json.loads((directory/'index.json').read_text())
    files=defaultdict(list)
    for key,meta in index['archives'].items():
        market,symbol,month=key.split('/')
        if market=='um' and symbol.endswith('USDT') and '_' not in symbol and meta.get('status')=='VERIFIED_CLOSED_OHLCV':files[symbol].append(meta)
    data={};hashes={};errors={}
    for symbol,metas in files.items():
        try:
            rows=[]
            for meta in sorted(metas,key=lambda m:m['first_ms']):rows.extend(read_archive(directory,meta))
            data[symbol]=rows;hashes[symbol]=digest([m['sha256'] for m in metas])
        except (OSError,ValueError,KeyError) as exc:errors[symbol]=str(exc)
    checkpoint=root/'research/turan-replay';checkpoint.mkdir(parents=True,exist_ok=True)
    cachepath=checkpoint/'checkpoint.json';cache=json.loads(cachepath.read_text()) if cachepath.exists() else {'symbols':{},'offset':0}
    # Changed canonical rule/implementation fingerprint invalidates cache without erasing old runs.
    implementation=digest({'rules':[r['strategy_config_hash'] for r in registry()],'replay_code':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'policy':POLICY})
    if cache.get('implementation')!=implementation:cache={'symbols':{},'offset':0,'implementation':implementation}
    chosen=pending_symbols(data,hashes,cache['symbols'],implementation)[:budget]
    for symbol in chosen:
        signature=digest([implementation,hashes[symbol],hashes.get('BTCUSDT')])
        old=cache['symbols'].get(symbol)
        if old and old['signature']==signature:continue
        result=replay_symbol(data[symbol],symbol,'um',hashes[symbol],data.get('BTCUSDT'))
        name=symbol+'-'+signature[:20]+'.json.gz';(checkpoint/name).write_bytes(gzip.compress(json.dumps(result,separators=(',',':')).encode(),mtime=0))
        cache['symbols'][symbol]={'signature':signature,'path':name}
    # Keep the legacy checkpoint field readable, but selection is driven by
    # stale source signatures rather than a rotating offset into all symbols.
    cache['offset']=0
    results={symbol:json.loads(gzip.decompress((checkpoint/meta['path']).read_bytes())) for symbol,meta in cache['symbols'].items() if symbol in data and meta['signature']==digest([implementation,hashes[symbol],hashes.get('BTCUSDT')])}
    public=report(results);public['source_errors']=errors;public['available_archive_symbols']=len(data)
    target=root/'web/data/turan-replay.json';target.write_text(json.dumps(public,separators=(',',':'))+'\n')
    cachepath.write_text(json.dumps(cache,separators=(',',':'))+'\n')
    print('TURAN_REPLAY',public['symbols_replayed'],'symbols',public['experiments'],'experiments; no automatic promotion')
    return public

if __name__=='__main__':main()
