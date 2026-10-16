#!/usr/bin/env python3
"""V4 7/14/30/90d lab. Unknown data stays UNKNOWN, never 0 wins."""
import datetime as dt
import pathlib
import v4_paper

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web'/'data'
ARCH=ROOT/'archive'
VERSION='4.0.0-lab-a1'
STRATEGIES=('TREND_BREAKOUT','VOLUME_EXPANSION','BREAKOUT_RETEST',
 'REVERSAL_SETUP','VOLATILITY_SQUEEZE','OI_FUNDING_PRESSURE','SHORT_BREAKDOWN')

def compile_report(lifecycle,paper,shadow,now_ms):
    events=lifecycle.get('events',[])
    attempts=list(shadow.get('attempts',{}).values())
    orders=list(paper.get('orders',{}).values())
    reports=[]
    for days in (7,14,30,90):
        t=now_ms-days*86400000
        recent=[e for e in events if (int(dt.datetime.fromisoformat(e['event_time_utc']).timestamp()*1000)>=t)]
        by_strategy={}
        for strategy in STRATEGIES:
            group=[e for e in recent if e.get('strategy_id')==strategy]
            seen=lambda kind:len({e['setup_id'] for e in group if e['type']==kind})
            by_strategy[strategy]={
                'discovered':seen('DISCOVERED'),
                'motion':seen('MOTION_STARTED'),
                'spotlight':seen('SPOTLIGHT_PROMOTED'),
                'invalidated':seen('INVALIDATED'),
                'expired_or_stale':seen('ARCHIVED'),
                'entry_eligible':len({e.get('trade_intent_id') for e in group
                                    if e['type']=='ENTRY_ELIGIBLE' and e.get('trade_intent_id')}),
                'signal_success_rate':'INSUFFICIENT_SAMPLE',
                'mfe_mae':'NO_V4_FORWARD_BARS_YET'}
        a=[x for x in attempts if x.get('signal_at_ms',0)>=t]
        terminal=[x for x in a if x.get('status') in ('FAVORABLE_1R','ADVERSE_1R')]
        r=[x for x in orders if x.get('created_at_ms',0)>=t]
        resolved=[x for x in r if x.get('status')=='CLOSED']
        reports.append({
            'days':days,'strategies':by_strategy,
            'shadow':{'attempts':len(a),'resolved':len(terminal),
                      'favorable_1r':sum(x['status']=='FAVORABLE_1R' for x in terminal),
                      'adverse_1r':sum(x['status']=='ADVERSE_1R' for x in terminal),
                      'ambiguous':sum(x['status']=='AMBIGUOUS' for x in a),
                      'no_fill':sum(x['status']=='NO_FILL' for x in a),
                      'data_gap':sum(x['status']=='DATA_GAP' for x in a),
                      'observed_rate_pct':round(100*sum(x['status']=='FAVORABLE_1R' for x in terminal)/len(terminal),2) if len(terminal)>=30 else None,
                      'shadow_is_not_cash_account':True},
            'paper':{'created':len(r),'closed':len(resolved),
                     'open':sum(x['status']=='FILLED' for x in r),
                     'no_fill':sum(x['status']=='NO_FILL' for x in r),
                     'realized_net_usdt_ex_funding':round(sum(x.get('realized_pnl_usdt',0) for x in r),4),
                     'funding_state':'UNKNOWN_NOT_MODELED'},
            'sample_quality':'INSUFFICIENT_SAMPLE' if len(terminal)<30 else 'OBSERVATIONAL_ONLY',
            'not_win_probability':True})
    return {'model_version':VERSION,'policy_version':lifecycle.get('policy_version'),
            'updated_at':dt.datetime.fromtimestamp(now_ms/1000,dt.timezone.utc).isoformat(),
            'periods':reports,'no_data_is_not_zero_success':True,'no_real_orders':True,
            'notes':['V4 events only; V3 historical paper is excluded.',
                     'Shadow outcome rate excludes ambiguous, pending and data gaps.',
                     'MFE/MAE requires verified V4 forward bars and is not available yet.',
                     'Funding unknown; paper PnL is NOT fully funding-inclusive.']}

def main():
    now_ms=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    lifecycle=v4_paper.read(ARCH/'v4-lifecycle-ledger.json',{})
    paper=v4_paper.read(ARCH/'v4-paper-ledger.json',{})
    shadow=v4_paper.read(ARCH/'v4-shadow-ledger.json',{})
    if not lifecycle.get('model_version','').startswith('4.0.0-'):
        raise RuntimeError('Lab only for V4 lifecycle, no V3 data masquerade')
    result=compile_report(lifecycle,paper,shadow,now_ms)
    v4=v4_paper.read(DATA/'v4-radar.json',{})
    result['scan_id']=v4.get('scan_id')
    v4_paper.save(DATA/'v4-lab.json',result)
    print('V4 LAB periods',len(result['periods']),'latest discoveries',
          sum(r['discovered'] for r in result['periods'][0]['strategies'].values()),flush=True)

if __name__=='__main__':main()
