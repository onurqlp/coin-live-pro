#!/usr/bin/env python3
"""COIN.LIVE PRO 2.2 deterministic 1-7 day swing controls.

4H + UTC 1D are PRIMARY, confirmed bars only. 15m/5m serve timing.
Flags indicate unusual market structure and elevated *risk*, not proof of
manipulation, calibrated win probability, or a real trading order.
No live exchange credentials, no trade execution.
"""
import math

MODEL = '2.2.0-swing-4h-1d'
CLOSED = 'CLOSED_CONFIRMED'
DIRECTION = {'LONG':'UP','SHORT':'DOWN'}

def num(value):
    try:
        x = float(value)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None

def swing_context(market, states, side, derivatives=None):
    """Return auditable flags, non-probabilistic risk and 4H/1D gated horizon."""
    derivatives = derivatives or {}
    day = states.get('1D') or {}
    h4 = states.get('4H') or {}
    weekly = states.get('1W') or {}
    macro_available = day.get('quality') == CLOSED and h4.get('quality') == CLOSED
    wanted = DIRECTION[side]
    aligned = macro_available and day.get('trend') == wanted and h4.get('trend') == wanted
    mixed = macro_available and (day.get('trend') != h4.get('trend'))
    notes = []
    risk = 0

    spread = num(market.get('spread_bps'))
    volume = num(market.get('volume'))
    day_change = num(market.get('change'))
    funding = num(derivatives.get('funding_rate'))
    oi_usd = num(derivatives.get('open_interest_usd'))
    listing_age_days = num(market.get('listing_age_days'))
    instrument_state = str(market.get('instrument_state') or '').upper()
    inactive = instrument_state not in ('','LIVE','UNKNOWN')
    newly_listed = listing_age_days is not None and listing_age_days < 7
    if inactive:
        risk += 80; notes.append('INSTRUMENT_NOT_LIVE')
    elif instrument_state == 'UNKNOWN':
        risk += 8; notes.append('INSTRUMENT_STATE_UNVERIFIED')
    if newly_listed:
        risk += 38; notes.append('NEW_LISTING_LT_7D')
    elif listing_age_days is not None and listing_age_days<30:
        risk += 17; notes.append('NEW_LISTING_LT_30D')

    # Volume and wick observations require *completed* bars; these fields are
    # calculated in mtf.state() after the OKX confirm flag was verified.
    for tf,weight in (('4H',1.0),('1D',0.8)):
        state = states.get(tf) or {}
        if state.get('quality') != CLOSED:
            continue
        if (state.get('wick_rejections_8') or 0) >= 3:
            risk += round(17*weight)
            notes.append(tf+'_REPEATED_LONG_WICKS')
        # A closed breakout rejection can indicate a liquidity sweep; it does
        # not prove spoofing/manipulation, and never authorizes a position.
        if state.get('fakeout_up_on_close') and side=='LONG':
            risk += round(22*weight)
            notes.append(tf+'_FAILED_UP_BREAKOUT')
        if state.get('fakeout_down_on_close') and side=='SHORT':
            risk += round(22*weight)
            notes.append(tf+'_FAILED_DOWN_BREAKOUT')
        rel = num(state.get('volume_ratio_20'))
        if rel is not None and rel >= 3.5:
            risk += round(17*weight)
            notes.append(tf+'_UNUSUAL_CLOSED_BAR_VOLUME')
        if rel is not None and rel >= 6.0:
            risk += round(9*weight)
            notes.append(tf+'_EXTREME_VOLUME')
        atr = num(state.get('atr_pct'))
        if atr is not None and atr >= (7.0 if tf=='1D' else 3.5):
            risk += round(13*weight)
            notes.append(tf+'_HIGH_TRUE_RANGE')

    if spread is None:
        notes.append('SPREAD_UNAVAILABLE')
    elif spread > 35:
        risk += 37; notes.append('WIDE_SPREAD_35BPS')
    elif spread > 18:
        risk += 22; notes.append('ELEVATED_SPREAD_18BPS')
    if volume is None or volume < 15_000_000:
        risk += 24; notes.append('LOW_QUOTE_TURNOVER')
    elif volume < 30_000_000:
        risk += 12; notes.append('LIMITED_QUOTE_TURNOVER')
    if day_change is not None and abs(day_change) > 18:
        risk += 17; notes.append('EXTREME_24H_PRICE_MOVE')
    elif day_change is not None and abs(day_change) > 12:
        risk += 8; notes.append('STRONG_24H_PRICE_MOVE')
    if funding is None:
        notes.append('FUNDING_NOT_VERIFIED')
    elif abs(funding) >= .0015:  # >=0.15% / exchange-reported interval
        risk += 23; notes.append('EXTREME_FUNDING_RATE')
    elif abs(funding) >= .00075:
        risk += 11; notes.append('ELEVATED_FUNDING_RATE')
    if oi_usd is None:
        notes.append('OI_CHANGE_NOT_VERIFIED')
    elif oi_usd < 2_000_000:
        risk += 12; notes.append('SMALL_OPEN_INTEREST_USD')
    else:
        notes.append('OI_SNAPSHOT_ONLY_NO_DELTA')
    risk = min(100,risk)
    risk_label = 'ÇOK YÜKSEK' if risk>=70 else 'YÜKSEK' if risk>=45 else 'ORTA' if risk>=20 else 'DÜŞÜK'

    if not macro_available:
        status='NO_HISTORY'
        horizon='Belirsiz'
        notes.append('MISSING_CLOSED_1D_OR_4H')
    elif not aligned:
        status='WAIT_4H_1D'
        horizon='Belirsiz'
        notes.append('4H_1D_DIRECTION_MISMATCH' if mixed else '4H_1D_NOT_ALIGNED_WITH_SIDE')
    elif risk >=70 or inactive or newly_listed:
        status='AVOID_RISK'
        horizon='Belirsiz'
        notes.append('STRUCTURE_RISK_BLOCK')
    else:
        status='SWING_WATCH' if risk >=45 else 'SWING_CANDIDATE'
        horizon='3-7 gün' if weekly.get('quality')==CLOSED and weekly.get('trend')==wanted else '1-3 gün'
    return {
        'swing_status':status,'swing_horizon':horizon,'swing_direction':side,
        'direction_aligned_4h_1d':bool(aligned),'structure_risk_score':risk,
        'structure_risk_label':risk_label,'structure_flags':list(dict.fromkeys(notes)),
        'instrument_state':instrument_state or None,'listing_age_days':listing_age_days,
        'funding_rate':funding,'open_interest_usd':oi_usd,
        'open_interest_change_pct':None,
        'risk_method':'Heuristic: closed-candle long wicks, abnormal volume, ATR, spread, 24h move, funding/current OI. Not proof of manipulation.'
    }

def gate_score(raw, context):
    """Downgrade non-aligned or high-risk observations; never force AL/SAT."""
    score=max(0,min(100,int(round(raw))))
    status=context['swing_status']
    if status=='NO_HISTORY':return min(score,40)
    if status=='WAIT_4H_1D':return min(score,52)
    if status=='AVOID_RISK':return min(score,39)
    if status=='SWING_WATCH':return min(score,64)
    return score
