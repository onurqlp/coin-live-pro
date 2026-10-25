#!/usr/bin/env python3
"""Isolated, forward-only research. No cash writes, fake attribution or future training."""
import copy
import datetime as dt
import hashlib
import json
import math
import pathlib
import statistics
import v4_forward
import v4_paper

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web/data'
ARCH=ROOT/'archive/uzayx-research-ledger.json'
VERSION='uzayx.research.v1'
HOUR=3600000
HORIZONS={'1H':(HOUR,'5m',300000),'4H':(4*HOUR,'5m',300000),
          '24H':(24*HOUR,'1H',HOUR),'3D':(72*HOUR,'4H',4*HOUR),
          '7D':(168*HOUR,'4H',4*HOUR)}
FAMILIES={
 'T006':('Ergenekon Çıkışı','4H sıkışma ≤25; son 1H kapanışı önceki 8 mumun dışına çıkar.'),
 'T032':('Bilge Kağan Onayı','16 saatlik seviye kırılır; ayrı mumda %0,2 toleransla retest ve kabul.'),
 'T033':('Mete İkinci Akın','3 saatlik ≥%2 ilk itki, sonraki geri çekilme ve ikinci kırılım.'),
 'T054':('Ak Ana Tuzağı','Önceki 8 saatlik dip altına fitil, aynı kapalı mumda geri kabul.'),
 'T093':('Ergenekon Ayrışması','BTC 4 saat değişimi <%0,5 iken coin mutlak değişimi ≥%2.'),
 'T102':('Kayı Gecikeni','Zamanına göre doğrulanmış sektör üyeliği ve lider verisi bekleniyor.'),
 'T154':('Bozkurt Sahte Kırılma','Önceki mumda 8 saatlik kırılım; son kapalı mumda banda geri dönüş.')}
CONFIG_HASH=hashlib.sha256(json.dumps({'version':VERSION,'rules':FAMILIES,
    'horizons':HORIZONS,'execution':False},sort_keys=True,ensure_ascii=False).encode()).hexdigest()
NATIVE={'SPARK_'+x for x in ('KIVILCIM','ERKEN_SINYAL','ISIK_GUCLENIYOR','GELDI')}

def iso(ms):return dt.datetime.fromtimestamp(ms/1000,dt.timezone.utc).isoformat()
def number(x):return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)
def finite(x):return float(x) if number(x) else 0.0

def closed_rows(rows,step,now):
    out=[]
    for row in rows or []:
        if (not isinstance(row,list) or len(row)<5 or not all(number(v) for v in row[:5])
            or row[0]%step or row[1]<=0 or row[3]<=0
            or row[2]<max(row[1],row[3],row[4]) or row[3]>min(row[1],row[2],row[4])):
            raise ValueError('INVALID_RESEARCH_CANDLE')
        if row[0]+step<=now:
            out.append({'t':int(row[0]),'o':row[1],'h':row[2],'l':row[3],'c':row[4]})
    if len({x['t'] for x in out})!=len(out):raise ValueError('DUPLICATE_RESEARCH_CANDLE')
    return sorted(out,key=lambda x:x['t'])

def detect(rows,context,btc):
    """Registered pilot rules, not profitable validated strategies."""
    if len(rows)<24 or any(b['t']-a['t']!=HOUR for a,b in zip(rows,rows[1:])):return []
    a=rows[-1];prev=rows[-2];out=[]
    high=max(x['h'] for x in rows[-9:-1]);low=min(x['l'] for x in rows[-9:-1])
    compression=(context.get('frames')or{}).get('4H',{}).get('bb_compression_percentile_30')
    if number(compression) and compression<=25:
        if a['c']>high:out.append(('T006','LONG'))
        elif a['c']<low:out.append(('T006','SHORT'))
    level=max(x['h'] for x in rows[-19:-3]);floor=min(x['l'] for x in rows[-19:-3])
    breaking,retest=rows[-3],rows[-2]
    if breaking['c']>level and retest['l']<=level*1.002 and retest['c']>=level and a['c']>retest['h']:
        out.append(('T032','LONG'))
    elif breaking['c']<floor and retest['h']>=floor*.998 and retest['c']<=floor and a['c']<retest['l']:
        out.append(('T032','SHORT'))
    impulse=rows[-6]['c']/rows[-9]['c']-1
    pull=rows[-5:-1]
    if impulse>=.02 and min(x['l'] for x in pull)<rows[-6]['c'] and min(x['l'] for x in pull)>rows[-9]['c'] and a['c']>max(x['h'] for x in pull):
        out.append(('T033','LONG'))
    elif impulse<=-.02 and max(x['h'] for x in pull)>rows[-6]['c'] and max(x['h'] for x in pull)<rows[-9]['c'] and a['c']<min(x['l'] for x in pull):
        out.append(('T033','SHORT'))
    if a['l']<low and a['c']>low:out.append(('T054','LONG'))
    if btc and len(btc)>=5 and btc[-1]['t']==a['t']:
        bm=btc[-1]['c']/btc[-5]['c']-1;cm=a['c']/rows[-5]['c']-1
        if abs(bm)<.005 and abs(cm)>=.02:out.append(('T093','LONG' if cm>0 else 'SHORT'))
    oldhigh=max(x['h'] for x in rows[-10:-2]);oldlow=min(x['l'] for x in rows[-10:-2])
    if prev['c']>oldhigh and a['c']<oldhigh:out.append(('T154','SHORT'))
    elif prev['c']<oldlow and a['c']>oldlow:out.append(('T154','LONG'))
    return out

def measure(event,now,frames):
    results=copy.deepcopy(event.get('horizons')or{})
    for name,(span,tf,step) in HORIZONS.items():
        if results.get(name,{}).get('state')=='OBSERVED':continue
        if now<event['event_ms']+span+1500:
            results[name]={'state':'TRACKING'};continue
        if not frames.get(tf):results[name]={'state':'SOURCE_UNAVAILABLE'};continue
        bars=closed_rows(frames[tf],step,now)
        result=v4_forward.horizon_result(event,now,bars,span,step)
        if result.get('state')=='OBSERVED':
            # Directional benchmark only; not an opposite execution or inverted PnL.
            result['inverse_direction_pct']=-result['close_direction_pct']
            result['no_trade_price_exposure_pct']=0
            result['cash_pnl_usdt']=None
        results[name]=result
    return results

def observe(prior,mtf,pack,scan,now,bank_feed=None):
    timestamp=v4_forward.parse(mtf.get('fetched_at'))
    if (not scan or mtf.get('provider')!='OKX' or not timestamp or not -120000<=now-timestamp<=480000
        or pack.get('source')!='OKX_CLOSED_CANDLES' or pack.get('source_mtf_at')!=mtf.get('fetched_at')):
        raise ValueError('RESEARCH_SOURCE_MISMATCH_OR_STALE')
    if prior and (prior.get('schema')!=VERSION or not isinstance(prior.get('events'),list)):
        raise ValueError('REFUSE_UNKNOWN_RESEARCH_LEDGER')
    ledger=copy.deepcopy(prior) if prior else {'schema':VERSION,'started_at_utc':iso(now),'events':[]}
    ids=[x['event_id'] for x in ledger['events']]
    if len(ids)!=len(set(ids)):raise ValueError('DUPLICATE_RESEARCH_EVENT')
    seen=set(ids);frames=pack.get('candles_by_symbol')or{}
    btc=closed_rows(frames.get('BTCUSDT',{}).get('1H',[]),HOUR,now)
    candidates=mtf.get('candidates',[])
    if bank_feed is not None:
        if bank_feed.get('source_mtf_at')!=mtf['fetched_at'] or bank_feed.get('registry_count')!=200:
            raise ValueError('RESEARCH_CANONICAL_FEED_MISMATCH')
        rules={r['id']:r for r in bank_feed['registry']}
        for signal in bank_feed.get('signals',[]):
            for sid in signal['strategy_ids']:
                rule=rules[sid];version=rule['strategy_version'];rule_hash=rule['strategy_config_hash']
                identity=[version,rule_hash,sid,signal['symbol'],signal['side'],signal['source_closed_1h_at_utc']]
                key=hashlib.sha256(json.dumps(identity).encode()).hexdigest()[:24]
                if key in seen:continue
                seen.add(key)
                ledger['events'].append({'event_id':key,'parent_event_id':signal['event_id'],
                    'strategy_id':sid,'strategy_version':version,'config_hash':rule_hash,
                    'symbol':signal['symbol'],'side':signal['side'],'event_ms':now,'observed_at_utc':iso(now),
                    'first_seen_price':signal['price_at_scan'],'source_scan_id':scan,'source_venue':'OKX',
                    'birth':{'source_1h_candle':signal['source_closed_1h_at_utc'],
                        'reference_price':signal['price_at_scan'],'condition':rule.get('conditions'),
                        'source_observed_at':signal['source_observed_at_utc']},
                    'is_executed_trade':False,'net_pnl_usdt':None,'horizons':{}})
        candidates=[] # Legacy detector is retained only for explicit legacy callers.
    for c in candidates:
        symbol=c.get('symbol');f=c.get('frames')or{}
        if c.get('quality')!='COMPLETE' or any(f.get(tf,{}).get('quality')!='CLOSED_CONFIRMED' for tf in ('4H','1D')):continue
        observed=v4_forward.parse(c.get('observed_at_utc'))
        ref=c.get('price_reference')
        if not observed or not -120000<=now-observed<=480000 or not number(ref) or ref<=0:continue
        rows=closed_rows(frames.get(symbol,{}).get('1H',[]),HOUR,now)
        if not rows or now-(rows[-1]['t']+HOUR)>HOUR+480000:continue
        for strategy,side in detect(rows,c,btc):
            key=hashlib.sha256(f'{VERSION}:{CONFIG_HASH}:{strategy}:{symbol}:{side}:{rows[-1]["t"]}'.encode()).hexdigest()[:24]
            if key in seen:continue
            seen.add(key)
            ledger['events'].append({'event_id':key,'parent_event_id':f'{symbol}:{rows[-1]["t"]}',
                'strategy_id':strategy,'strategy_version':VERSION,'config_hash':CONFIG_HASH,
                'symbol':symbol,'side':side,'event_ms':now,'observed_at_utc':iso(now),
                'first_seen_price':ref,'source_scan_id':scan,'source_venue':'OKX',
                'birth':{'source_1h_candle':iso(rows[-1]['t']),'reference_price':ref,
                         'condition':FAMILIES[strategy][1],'source_observed_at':c['observed_at_utc']},
                'is_executed_trade':False,'net_pnl_usdt':None,'horizons':{}})
    for e in ledger['events']:e['horizons']=measure(e,now,frames.get(e['symbol'],{}))
    ledger.update(updated_at_utc=iso(now),source_scan_id=scan,no_real_orders=True)
    return ledger

def account(ledger,public):
    tickets=ledger.get('tickets')
    if not isinstance(tickets,list) or public.get('no_real_orders') is not True:raise ValueError('INVALID_CASH_SOURCE')
    ids=[x.get('event_id') for x in tickets]
    if not all(ids) or len(ids)!=len(set(ids)) or len(tickets)!=public.get('all_events_count'):
        raise ValueError('INCOMPLETE_OR_DUPLICATE_CASH_LEDGER')
    if any(x.get('is_real_trade') is True or any(x.get(k) is not None and not number(x[k]) for k in
           ('realized_net_usdt','unrealized_net_usdt','remaining_notional_usdt','initial_margin_usdt')) for x in tickets):
        raise ValueError('INVALID_CASH_VALUE')
    groups={};coins={};sides={'LONG':0.,'SHORT':0.};unknown=0;partial=0.;closed=0.;realized=0.;floating=0.;margin=0.;fees=0.;open_count=0;stop_risk=0.
    for x in tickets:
        r=finite(x.get('realized_net_usdt'));realized+=r;fees+=finite(x.get('fees_estimated_usdt'))
        key=x.get('strategy_id')
        from turan_attribution import classify
        if key not in NATIVE and not classify(x)['eligible_for_strategy_pnl']:unknown+=1;key='LEGACY_UNASSIGNED'
        g=groups.setdefault(key,{'id':key,'count':0,'closed':0,'open':0,'realized_usdt':0.,'closed_net_usdt':0.,'floating_usdt':0.})
        g['count']+=1;g['realized_usdt']+=r
        if x.get('status')=='CLOSED':closed+=r;g['closed']+=1;g['closed_net_usdt']+=r
        else:partial+=r
        if x.get('status')=='OPEN':
            open_count+=1;g['open']+=1;u=finite(x.get('unrealized_net_usdt'));floating+=u;g['floating_usdt']+=u
            nom=finite(x.get('remaining_notional_usdt'));side=x.get('side')
            if side not in sides:raise ValueError('INVALID_OPEN_SIDE')
            sides[side]+=nom;coin=coins.setdefault(x['symbol'],{'symbol':x['symbol'],'tickets':0,'nominal_usdt':0.})
            coin['tickets']+=1;coin['nominal_usdt']+=nom
            qty=finite(x.get('remaining_qty'));total=finite(x.get('total_qty'))
            if total>0:margin+=finite(x.get('initial_margin_usdt'))*qty/total
            if number(x.get('fill_price')) and number(x.get('stop')):stop_risk+=qty*abs(x['fill_price']-x['stop'])
    start=public.get('starting_balance_usdt',10000);published=(public.get('summary')or{}).get('virtual_equity_usdt')
    equity=start+realized+floating if number(start) else None
    reconciled=number(published) and number(equity) and abs(published-equity)<.0001
    return {'reconciled':reconciled,'tickets':len(tickets),'unknown_attribution_count':unknown,
            'attributed_count':len(tickets)-unknown,'groups':sorted(groups.values(),key=lambda g:(g['id']=='LEGACY_UNASSIGNED',g['id'])),
            'realized_all_usdt':realized,'closed_realized_usdt':closed,'partial_realized_usdt':partial,
            'floating_usdt':floating,'equity_usdt':equity if reconciled else None,
            'fees_estimated_usdt':fees,'open_count':open_count,'gross_nominal_usdt':sum(sides.values()),
            'nominal_by_side':sides,'remaining_margin_usdt':margin,'stop_distance_risk_usdt':stop_risk,
            'coins':sorted(coins.values(),key=lambda c:-c['nominal_usdt']),
            'uniform_plus_2pct_scenario_usdt':.02*(sides['LONG']-sides['SHORT']),
            'funding_included':False,'exact_liquidation_included':False}

def report(ledger,manifest,spark,cash,forward,now):
    scan=manifest.get('scan_id')
    if (manifest.get('publication_valid') is not True or manifest.get('no_real_orders') is not True
        or any(d.get('scan_id')!=scan for d in (spark,forward)) or ledger.get('source_scan_id')!=scan):
        raise ValueError('RESEARCH_REPORT_SCAN_MISMATCH')
    acc=account(cash,spark)
    if not acc['reconciled']:raise ValueError('CASH_RECONCILIATION_FAILED')
    families=[]
    for key,(name,rule) in FAMILIES.items():
        events=[e for e in ledger['events'] if e['strategy_id']==key]
        horizons={}
        for horizon in HORIZONS:
            values=[e['horizons'][horizon]['close_direction_pct'] for e in events if e['horizons'].get(horizon,{}).get('state')=='OBSERVED']
            horizons[horizon]={'observed':len(values),'median_direction_pct':statistics.median(values) if values else None,
                'tracking':sum(e['horizons'].get(horizon,{}).get('state')=='TRACKING' for e in events),
                'unavailable':sum(e['horizons'].get(horizon,{}).get('state') not in ('TRACKING','OBSERVED') for e in events)}
        families.append({'id':key,'name':name,'rule':rule,'status':'BLOCKED_SECTOR_SOURCE' if key=='T102' else 'OBSERVING',
                         'events':len(events),'horizons':horizons,'cash_pnl_usdt':None})
    coverage={h:sum(x.get('horizons',{}).get(h,{}).get('state')=='OBSERVED' for x in forward.get('results',[])) for h in HORIZONS}
    return {'schema':VERSION,'scan_id':scan,'generated_at_utc':iso(now),'source_finished_at_utc':manifest['finished_at_utc'],
            'no_real_orders':True,'research_only':True,'no_cash_execution':True,'account':acc,
            'families':families,'events':ledger['events'][-60:],'total_events':len(ledger['events']),
            'existing_model_horizon_coverage':coverage,'config_hash':CONFIG_HASH,
            'comparisons':'Original and inverse directional price observation; no-trade price exposure zero; delayed execution not modeled.',
            'cost_scope':{'funding':'UNMODELED','liquidation':'UNVERIFIED','orderbook_execution':'UNMODELED'}}

def main():
    load=lambda path:json.loads(path.read_text(encoding='utf8'))
    manifest=load(DATA/'v4-manifest.json');now=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    prior=load(ARCH) if ARCH.exists() else {}
    ledger=observe(prior,load(DATA/'mtf.json'),load(DATA/'chart-pack.json'),manifest['scan_id'],now,bank_feed=load(DATA/'uzayx-strategy-bank.json'))
    cash=load(ROOT/'archive/v4-spark-paper-ledger.json');spark=load(DATA/'v4-spark-paper.json')
    if cash.get('last_scan_id')!=manifest['scan_id']:raise ValueError('PRIVATE_CASH_SCAN_MISMATCH')
    public=report(ledger,manifest,spark,cash,load(DATA/'v4-forward.json'),now)
    v4_paper.save(ARCH,ledger);v4_paper.save(DATA/'uzayx-research.json',public)
    print('UZAYX RESEARCH',len(ledger['events']),'events; seven registered families; cash reconciled',flush=True)

if __name__=='__main__':main()
