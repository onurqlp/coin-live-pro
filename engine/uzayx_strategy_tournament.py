"""Point-in-time paper strategy contest; historical matching is not a trade replay."""
import datetime as dt
import math
import statistics as stats
from collections import defaultdict

from uzayx_adaptive import H, samples

DAY=24*H


def contest(books, now):
    """Count first independent coin episodes, with outcomes known before cutoff.

    Secondary matched IDs share a ticket's outcome: they are supporting
    hypotheses, never additional positions or independent profit.
    """
    rows,audit=samples(books,now-H)
    tickets={}
    for book in books:
        ns=book.get('epoch_id') or book.get('started_at')
        for t in book.get('tickets',[]):
            tickets[str(ns)+':'+str(t.get('event_id'))]=t
    primary=defaultdict(list);support=defaultdict(list)
    for row in rows:
        ticket=tickets.get(row['key'],{})
        if ticket.get('attribution_kind')!='EXACT_TURAN_RULE_AT_BIRTH':continue
        sid=row.get('strategy_id')
        if not isinstance(sid,str) or not sid.startswith('T'):continue
        primary[sid].append(row)
        for other in set(ticket.get('strategy_ids') or ())-{sid}:
            if isinstance(other,str) and other.startswith('T'):support[other].append(row)
    board={};quarantine={};promoted={}
    for n in range(1,201):
        sid=f'T{n:03}';rs=sorted(primary[sid],key=lambda r:(r['decision_ms'],r['key']))
        hours={r['decision_ms']//H for r in rs};days={r['decision_ms']//DAY for r in rs}
        latest=rs[-4:];losses=(len(latest)==4 and len({r['decision_ms']//H for r in latest})>=3
                         and all(r['return_pct']<0 for r in latest))
        pause_until=max(r['closed_ms'] for r in latest)+DAY if losses else None
        if pause_until and now<pause_until:quarantine[sid]=pause_until
        # No selection by a tiny discovery window or by the best of 200 trials.
        qualified=False;holdout=[];lower=None
        if len(rs)>=60 and len(hours)>=24 and max(hours)-min(hours)>=7*24:
            mid=sorted(hours)[len(hours)//2]*H
            discovery=[r for r in rs if r['closed_ms']<mid-H]
            holdout=[r for r in rs if r['decision_ms']>=mid]
            h=defaultdict(list)
            for r in holdout:h[r['decision_ms']//H].append(r['return_pct']-.1)
            if len(discovery)>=30 and len(holdout)>=30 and len(h)>=12:
                ys=[stats.mean(v) for v in h.values()]
                lower=stats.mean(ys)-3.5*stats.stdev(ys)/math.sqrt(len(ys))
                qualified=stats.mean(r['return_pct']-.1 for r in discovery)>0 and lower>0
        if qualified and sid not in quarantine:promoted[sid]=round(lower,6)
        board[sid]={'independent_primary_closed':len(rs),
                    'shared_supporting_closed':len(support[sid]),
                    'independent_market_hours':len(hours),'independent_days':len(days),
                    'mean_primary_net_notional_pct':round(stats.mean(r['return_pct'] for r in rs),6) if rs else None,
                    'last_four_primary_net_notional_pct':[round(r['return_pct'],6) for r in latest],
                    'holdout_primary_closed':len(holdout),'stressed_holdout_lower_heuristic_pct':round(lower,6) if lower is not None else None,
                    'provisional_forward_winner':qualified and sid not in quarantine,
                    'cash_pause_until_utc':dt.datetime.fromtimestamp(pause_until/1000,dt.timezone.utc).isoformat() if sid in quarantine else None,
                    'inverse_pnl_pct':None,'not_independent_secondary_positions':True}
    return {'board':board,'quarantine':quarantine,'promoted':promoted,
            'source_audit':audit,'selection_requires_days':7,'selection_requires_primary_closed':60,
            'selection_tests_200_hypotheses':True,'no_real_orders':True}
