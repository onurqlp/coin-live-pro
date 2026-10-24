#!/usr/bin/env python3
"""Low-friction early LONG/SHORT WATCH signals from independently closed OKX candles.

This research stream NEVER enters lifecycle MOTION/SPOTLIGHT, V4 paper fills,
trade_intent_id, score calibration, or real orders. Lack of volume/indicators is
labelled as unconfirmed, rather than silently becoming a positive datapoint.
"""
import datetime as dt
import hashlib
import pathlib
import math
import json
import v4_paper

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web'/'data'
ARCH=ROOT/'archive'/'v4-early-ledger.json'
VERSION='4.0.0-early-research-a1'
PERIOD={'5m':300000,'15m':900000,'1H':3600000,'4H':14400000,'1D':86400000}
def epoch(s):
    try:
        t=dt.datetime.fromisoformat(str(s).replace('Z','+00:00'))
        return int(t.timestamp()*1000) if t.tzinfo else None
    except (ValueError,TypeError,OverflowError):return None
def stamp(ms):
    return dt.datetime.fromtimestamp(ms/1000,dt.timezone.utc).isoformat()
def number(value):
    if isinstance(value,bool) or value is None:return None
    try:
        v=float(value)
        return v if math.isfinite(v) else None
    except (ValueError,TypeError):return None
def closed(f,tf,now_ms):
    if not isinstance(f,dict) or f.get('quality')!='CLOSED_CONFIRMED':
        return False
    t=epoch(f.get('last_candle_utc'))
    return t is not None and -120000<=now_ms-(t+PERIOD[tf])<=PERIOD[tf]+1200000
def reported_result(watch):
    result={}
    for period in ('1H','4H'):
        observed=[]
        for r in watch.get('records',[]):
            x=r.get('checkpoints',{}).get(period,{})
            if x.get('state')=='OBSERVED' and isinstance(x.get('close_direction_pct'),(float,int)):
                observed.append(float(x['close_direction_pct']))
        result[period]={'observed':len(observed),
                        'positive_direction':sum(x>0 for x in observed),
                        'negative_direction':sum(x<0 for x in observed),
                        'flat_direction':sum(x==0 for x in observed),
                        'not_a_win_rate':True}
    return result
def detect(item,quote,now_ms):
    """One recorded setup per symbol/side; 4H+1D preferred, not jointly mandatory."""
    if item.get('quality')!='COMPLETE' or not str(item.get('symbol','')).endswith('USDT'):
        return None
    side=item.get('side')
    if side not in ('LONG','SHORT'):return None
    frames=item.get('frames') or {}
    if not all(closed(frames.get(tf),tf,now_ms) for tf in ('4H','1D','1H','15m','5m')):
        return None
    if (quote.get('instrument_state')!='live' or
        number(quote.get('volume')) is None or quote['volume']<2_000_000 or
        number(quote.get('spread_bps')) is None or quote['spread_bps']>40 or
        number(quote.get('listing_age_days')) is None or quote['listing_age_days']<3):
        return None
    price=number(quote.get('price'))
    risk=number(item.get('structure_risk_score'))
    if not price or price<=0 or risk is None or risk>=70:return None
    if any(frames[x].get('fakeout_up_on_close' if side=='LONG' else 'fakeout_down_on_close')
           for x in ('4H','1D')):
        return None
    target='UP' if side=='LONG' else 'DOWN'
    opposite='DOWN' if side=='LONG' else 'UP'
    aligned={tf:frames.get(tf,{}).get('trend')==target for tf in ('1W','1D','4H','1H','15m','5m')}
    conflict={tf:frames.get(tf,{}).get('trend')==opposite for tf in ('1W','1D','4H','1H','15m','5m')}
    main=aligned['4H'] or aligned['1D']
    micro=aligned['1H'] or aligned['15m'] or aligned['5m']
    if not main or not (micro or (aligned['1D'] and aligned['4H'])):return None
    aligned_count=sum(aligned[tf] for tf in ('1D','4H','1H','15m','5m'))
    rv4=number(frames['4H'].get('volume_ratio_20'))
    rv1=number(frames['1H'].get('volume_ratio_20'))
    hist4=number((frames['4H'].get('macd_12_26_9') or {}).get('hist_pct'))
    hist_signed=(hist4 or 0)*(1 if side=='LONG' else -1) if hist4 is not None else None
    strong_pair=aligned['1D'] and aligned['4H']
    tier=('ISIK_GUCLENIYOR' if strong_pair and (aligned['1H'] or aligned['15m']) and
           (rv4 is not None and rv4>=0.8 or rv1 is not None and rv1>=1.0 or hist_signed is not None and hist_signed>0)
           else 'ERKEN_SINYAL' if strong_pair or
                (aligned['4H'] and aligned['1H'] and aligned['15m'])
           else 'KIVILCIM')
    rank=int(max(0,min(100,
        12+23*aligned['4H']+21*aligned['1D']+11*aligned['1H']+
        7*aligned['15m']+3*aligned['5m']+5*aligned['1W']+
        (4 if rv4 is not None and rv4>=0.8 else 0)+
        (3 if rv1 is not None and rv1>=1.0 else 0)+
        (4 if hist_signed is not None and hist_signed>0 else 0)-
        (13 if conflict['1W'] else 0)-int(risk*.25))))
    reasons=[]
    if strong_pair:reasons.append('1D_4H_ALIGNED')
    elif aligned['4H']:reasons.append('4H_TREND')
    elif aligned['1D']:reasons.append('1D_TREND')
    if aligned['1H']:reasons.append('1H_SUPPORT')
    if aligned['15m']:reasons.append('15M_SUPPORT')
    if rv4 is not None and rv4>=0.8:reasons.append('4H_VOLUME_0_8PLUS')
    if rv1 is not None and rv1>=1.0:reasons.append('1H_VOLUME_1PLUS')
    if hist_signed is not None and hist_signed>0:reasons.append('4H_MACD_DIRECTION')
    if conflict['1W']:reasons.append('WEEKLY_OPPOSITION_CAUTION')
    if rv4 is not None and rv4<0.8 and rv1 is not None and rv1<1.0:
        reasons.append('WEAK_RELATIVE_VOLUME')
    # Levels come only from a previous-eight-closed-1H-candle breakout threshold.
    one=frames['1H']
    key='breakout_high_prev8' if side=='LONG' else 'breakout_low_prev8'
    level=number(one.get(key));close=number(one.get('close'))
    trigger_state=('CLOSED_1H_LEVEL_BREACHED' if level and close and
                   (close>level if side=='LONG' else close<level)
                   else 'WAIT_FOR_NEW_1H_CLOSE' if level else 'LEVEL_UNAVAILABLE')
    stamp1=frames['1H'].get('last_candle_utc')
    return {'symbol':item['symbol'],'side':side,
      'research_tier':tier,'research_rank':rank,'source_closed_1h_at_utc':stamp1,
      'source_closed_4h_at_utc':frames['4H'].get('last_candle_utc'),
      'source_closed_1d_at_utc':frames['1D'].get('last_candle_utc'),
      'source_observed_at_utc':item.get('observed_at_utc'),
      'price_at_scan':price,'quote_24h_change_pct':number(quote.get('change')),
      'structure_risk_score':risk,'spread_bps':quote['spread_bps'],
      'volume_24h_usdt':quote['volume'],'relative_volume_4h':rv4,
      'relative_volume_1h':rv1,
      'trend_1d':frames['1D'].get('trend'),'trend_4h':frames['4H'].get('trend'),
      'trend_1h':frames['1H'].get('trend'),'trend_1w':(frames.get('1W') or {}).get('trend','UNKNOWN'),
      'aligned_main_count':int(aligned['1D'])+int(aligned['4H']),
      'supporting_factor_count':aligned_count,
      'reasons':reasons,'hourly_level':level,'hourly_level_state':trigger_state,
      'probability_calibrated':False,'verified_technical_entry':False,
      'paper_eligible':False,'real_order_eligible':False,'interpretation':'EARLY_WATCH_RESEARCH_ONLY',
      'source_quality':'VERIFIED_CLOSED_OHLC'}
def build(mtf,market,radar,prior,watch,now_ms,strategy_feed=None):
    """Create snapshot and event ledger ONLY from a matching, current scanned round."""
    if mtf.get('model_version')!='3.0.0-mtf-swing' or market.get('provider')!='OKX':
        raise RuntimeError('early-source-identity-invalid')
    if mtf.get('fetched_at')!=radar.get('source_mtf_at'):
        raise RuntimeError('early-mixed-scan')
    t=epoch(mtf.get('fetched_at'))
    if t is None or not -120000<=now_ms-t<=20*60000:
        raise RuntimeError('early-stale-scan')
    if watch.get('scan_id')!=radar.get('scan_id'):
        raise RuntimeError('early-archive-scan-mismatch')
    by_symbol={x['symbol']:x for x in market.get('rows',[])
               if isinstance(x,dict) and x.get('symbol')}
    proposals=[]
    for c in mtf.get('candidates',[]):
        q=by_symbol.get(c.get('symbol'))
        if not q:continue
        obj=detect(c,q,now_ms)
        if obj:proposals.append(obj)
    proposals.sort(key=lambda x:(-x['research_rank'],x['symbol'],x['side']))
    latest={}
    for x in proposals:
        key=(x['symbol'],x['side'])
        if key not in latest:latest[key]=x
    proposals=list(latest.values())
    if strategy_feed is not None:
        if strategy_feed.get('source_mtf_at')!=mtf['fetched_at'] or strategy_feed.get('registry_count')!=200:
            raise ValueError('early-strategy-feed-mismatch')
        proposals=[dict(x) for x in strategy_feed['signals']]
    # Stable event identity is a real first observation of a closed 1H candle,
    # never a retrospectively inferred price, success, or execution.
    old={e['event_id']:dict(e) for e in prior.get('events',[]) if e.get('event_id')}
    for x in proposals:
        signature='|'.join([x['symbol'],x['side'],str(x.get('source_closed_1h_at_utc'))])
        if strategy_feed is not None:signature+='|'+x['strategy_id']+'|'+x['strategy_config_hash']
        event_id=hashlib.sha256(signature.encode()).hexdigest()[:24]
        prior_event=old.get(event_id)
        if prior_event is None:
            old[event_id]={'event_id':event_id,'first_seen_at_utc':stamp(now_ms),
               'first_seen_price':x['price_at_scan'],'symbol':x['symbol'],
               'side':x['side'],'source_closed_1h_at_utc':x['source_closed_1h_at_utc'],
               'first_research_tier':x['research_tier'],'first_rank':x['research_rank'],
               'observation_count':1,'last_seen_at_utc':stamp(now_ms),
               'last_research_tier':x['research_tier'],
               'stage_history':[{'at_utc':stamp(now_ms),'tier':x['research_tier'],'research_rank':x['research_rank']}],
               'not_executed_trade':True,'outcome':'NOT_MEASURED'}
        else:
            # A stale replay with identical scan ID is not a fresh re-evaluation.
            if prior.get('last_scan_id')!=radar['scan_id']:
                prior_event['observation_count']=int(prior_event.get('observation_count',1))+1
                prior_event['last_seen_at_utc']=stamp(now_ms)
                if prior_event.get('last_research_tier')!=x['research_tier']:
                    prior_event.setdefault('stage_history',[]).append({
                       'at_utc':stamp(now_ms),'tier':x['research_tier'],'research_rank':x['research_rank']})
                prior_event['last_research_tier']=x['research_tier']
        x['paper_stage_number']=(x['paper_stage_number'] if strategy_feed is not None else
                3 if x['hourly_level_state']=='CLOSED_1H_LEVEL_BREACHED' else
                2 if x['research_tier'] in ('ERKEN_SINYAL','ISIK_GUCLENIYOR') else 1)
        x['paper_stage_name']={1:'İZLENEN',2:'GELMEKTE OLAN',3:'GELDİ'}[x['paper_stage_number']]
        if strategy_feed is not None:
            x['strategy_event_id']=x['event_id']
        x['event_id']=event_id
        x['first_seen_at_utc']=old[event_id]['first_seen_at_utc']
        x['first_seen_price']=old[event_id]['first_seen_price']
    events=sorted(old.values(),key=lambda x:(x['first_seen_at_utc'],x['event_id']),reverse=True)
    ledger={'model_version':VERSION,'started_at':prior.get('started_at') or stamp(now_ms),
        'updated_at':stamp(now_ms),'last_scan_id':radar['scan_id'],
        'events':events,'total_discoveries':len(events),'no_real_orders':True}
    hist=reported_result(watch)
    out={'model_version':VERSION,'scan_id':radar['scan_id'],'updated_at':stamp(now_ms),
        'source_mtf_at':mtf['fetched_at'],'source_venue':'OKX','source_market_type':'USDT-SWAP',
        'candidates':proposals[:32],'total_fresh_candidates':len(proposals),
        'counts':{k:sum(x['research_tier']==k for x in proposals)
                  for k in ('KIVILCIM','ERKEN_SINYAL','ISIK_GUCLENIYOR')},
        'stage_counts':{str(n):sum(x['paper_stage_number']==n for x in proposals) for n in (1,2,3)},
        'stage_3_requires_closed_1h_breakout':True,
        'archive_recent_events':events[:40],
        'archive_total_discoveries':len(events),
        'prior_watch_directional_observations':hist,
        'research_only':True,'no_paper_entries':True,'no_real_orders':True,
        'not_a_win_probability':True,'no_backfilled_outcomes':True,
        'warning':'An early signal is only a closed-candle research alert, not a recommendation to enter. Low volume and weekly conflict increase false-signal risk.'}
    if strategy_feed is not None:
        out.update(strategy_policy='TURAN200_ONLY',strategy_registry_hash=strategy_feed['registry_hash'],
                   stage_definition='VERSIONED_STRATEGY_TRIGGER_AND_COST_REGIME_GATE',
                   stage_3_requires_closed_1h_breakout=False)
    return ledger,out
def main():
    now_ms=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    mtf=v4_paper.read(DATA/'mtf.json',{})
    market=v4_paper.read(DATA/'market.json',{})
    radar=v4_paper.read(DATA/'v4-radar.json',{})
    watch=v4_paper.read(DATA/'v4-watch-archive.json',{})
    import uzayx_strategy_bank as bank
    feed=bank.read_feed(mtf['fetched_at']) if bank.enabled() else None
    prior=json.loads(ARCH.read_text(encoding='utf8'))
    if prior.get('model_version')!=VERSION:raise ValueError('UNRECOGNIZED_EARLY_ARCHIVE_NO_RESET')
    ledger,pub=build(mtf,market,radar,prior,watch,now_ms,feed)
    v4_paper.save(ARCH,ledger)
    v4_paper.save(DATA/'v4-early.json',pub)
    print('V4 EARLY WATCH',pub['total_fresh_candidates'],pub['counts'],
          'history',pub['archive_total_discoveries'],'scan',pub['scan_id'],flush=True)
if __name__=='__main__':main()
