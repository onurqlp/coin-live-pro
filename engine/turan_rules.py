"""Canonical versioned TURAN OHLC rules shared by forward and historical research.
No future candle is accepted here; callers must provide only closed source bars.
"""
import math
import statistics as st

H=3600000
VERSION='turan200-20261025-v2'

def number(v):
    return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)

RULES={
 1:[('z', '>=',2.5),('macro','==',True)],
 2:[('acceptance','==',True)],3:[('range_escape','==',True)],
 4:[('staircase','==',True),('macro','==',True)],
 5:[('compression','<=',20),('micro_accumulation','==',True)],
 6:[('compression','<=',25),('breakout','==',True)],
 7:[('z','>=',3.0)],8:[('rejection','>=',.6),('body','>',0)],
 9:[('retested_zone','==',True)],10:[('delayed_impulse','==',True)],
 11:[('relative_volume','>=',2),('move_atr','>=',.5)],
 17:[('post_impulse_volume','==',True)],
 31:[('range_escape','==',True),('relative_volume','>=',1)],
 32:[('retest_breakout','==',True)],33:[('second_wave','==',True)],
 34:[('acceleration','==',True),('macro','==',True)],
 36:[('trend_pullback','==',True)],37:[('flag_breakout','==',True)],
 38:[('h1_h4_aligned','==',True),('breakout','==',True)],
 39:[('macro','==',True),('hour_aligned','==',True),('relative_volume','>=',1)],
 41:[('compression','<=',20),('range_atr','>=',1.5),('breakout','==',True)],
 42:[('range_atr','>=',2),('move_atr','>=',.5)],
 43:[('vol_cluster','==',True),('macro','==',True)],
 44:[('nested_breakout','==',True)],45:[('vol_transition','==',True),('move_atr','>',0)],
 47:[('tail_cluster','==',True),('move_atr','>',0)],
 48:[('range_expansion','==',True),('breakout','==',True)],
 49:[('vol_asymmetry','>=',2),('macro','==',True)],
 50:[('compression','<=',20),('compression_1h','<=',20),('breakout','==',True)],
 51:[('side','==','SHORT'),('demand_exhaustion','==',True)],
 52:[('side','==','LONG'),('absorption','==',True)],
 53:[('side','==','SHORT'),('failed_high','==',True)],
 54:[('side','==','LONG'),('failed_low','==',True)],
 55:[('side','==','SHORT'),('parabolic_failure','==',True)],
 56:[('side','==','SHORT'),('distribution','==',True)],
 57:[('side','==','LONG'),('capitulation_reclaim','==',True)],
 58:[('v_recovery','==',True)],59:[('rounded_turn','==',True)],
 60:[('failed_breakout','==',True)],
 92:[('beta_residual_z','>=',2),('macro','==',True)],
 93:[('btc_flat','==',True),('relative_4h','>=',2)],
 94:[('btc_delayed_shock','==',True)],
 95:[('adx_4h','>=',25),('macro','==',True),('breakout','==',True)],
 96:[('breadth','>=',.7),('macro','==',True),('move_atr','>=',.5)],
 97:[('correlation_break','==',True),('relative_4h','>=',2)],
 98:[('side','==','SHORT'),('btc_4h','>=',1),('coin_4h','<=',-1)],
 99:[('side','==','LONG'),('btc_recovery','==',True),('move_atr','>',0)],
 107:[('side','==','LONG'),('market_mean_4h','<=',-1),('coin_4h','>=',1)],
 108:[('side','==','SHORT'),('market_mean_4h','>=',1),('coin_4h','<=',-1)],
 141:[('z','>=',2.5)],142:[('empirical_tail','==',True)],
 143:[('cusum','>=',3)],154:[('failed_breakout','==',True)]}


def change(rows,n):return (rows[-1]['c']/rows[-n-1]['c']-1)*100 if len(rows)>n else None
def returns(rows):return [(b['c']/a['c']-1)*100 for a,b in zip(rows,rows[1:])]
def correlation(a,b):
    if len(a)!=len(b) or len(a)<8 or not st.pstdev(a) or not st.pstdev(b):return None
    am,bm=st.mean(a),st.mean(b)
    return sum((x-am)*(y-bm) for x,y in zip(a,b))/(len(a)*st.pstdev(a)*st.pstdev(b))


def metrics(candidate,rows,btc,market_moves,side):
    f=candidate['frames'];h=f['1H'];h4=f['4H'];day=f['1D'];sign=1 if side=='LONG' else -1
    target='UP' if sign>0 else 'DOWN';atr=h.get('atr_pct')
    if not number(atr) or atr<=0 or len(rows)<30:return {}
    a=rows[-1];prev=rows[-2];rs=returns(rows);baseline=rs[-21:-1]
    sd=st.pstdev(baseline);z=(rs[-1]-st.mean(baseline))/sd if sd else None
    high=max(r['h'] for r in rows[-9:-1]);low=min(r['l'] for r in rows[-9:-1]);body=sign*(a['c']-a['o'])/a['o']*100
    orient=lambda v:sign*v
    broken=(a['c']>high if sign>0 else a['c']<low)
    failed_high=a['h']>high and a['c']<high and a['c']<a['o']
    failed_low=a['l']<low and a['c']>low and a['c']>a['o']
    width=a['h']-a['l'];rejection=(min(a['o'],a['c'])-a['l'] if sign>0 else a['h']-max(a['o'],a['c']))/width if width else 0
    ranges=[(r['h']-r['l'])/r['o']*100 for r in rows]
    old_level=max(r['h'] for r in rows[-10:-2]) if sign>0 else min(r['l'] for r in rows[-10:-2])
    old_break=prev['c']>old_level if sign>0 else prev['c']<old_level
    aligned=h4.get('trend')==target and day.get('trend')==target
    rr=[orient(r) for r in rs];coin4=change(rows,4)
    vols=[r['v'] for r in rows]
    recent_sd=st.pstdev(rs[-4:]);past_sd=st.pstdev(rs[-16:-4])
    stair=all(sign*(b['l' if sign>0 else 'h']-a0['l' if sign>0 else 'h'])>0 for a0,b in zip(rows[-5:-1],rows[-4:]))
    retest=False;second=False
    for j in range(max(8,len(rows)-7),len(rows)-2):
        level=max(r['h'] for r in rows[j-8:j]) if sign>0 else min(r['l'] for r in rows[j-8:j])
        first=rows[j];touch=rows[j+1]
        if sign*(first['c']-level)>0 and (touch['l']<=level*1.002 and touch['c']>=level if sign>0 else touch['h']>=level*.998 and touch['c']<=level) and sign*(a['c']-first['c'])>0:retest=True
    if len(rows)>=8:
        impulse=orient((rows[-5]['c']/rows[-8]['o']-1)*100)
        second=impulse>=2 and (min(r['l'] for r in rows[-4:-1])>rows[-8]['o'] if sign>0 else max(r['h'] for r in rows[-4:-1])<rows[-8]['o']) and sign*(a['c']-rows[-5]['c'])>0
    m={'side':side,'z':orient(z) if z is not None else None,'macro':aligned,'hour_aligned':h.get('trend')==target,
       'h1_h4_aligned':h.get('trend')==h4.get('trend')==target,'compression':h4.get('bb_compression_percentile_30'),
       'compression_1h':h.get('bb_compression_percentile_30'),'relative_volume':h.get('volume_ratio_20'),
       'adx_4h':h4.get('adx_14'),'body':body,'range_atr':ranges[-1]/atr,'move_atr':orient(rs[-1])/atr,
       'rejection':rejection,'breakout':broken,'failed_high':failed_high,'failed_low':failed_low,
       'acceptance':old_break and sign*(a['c']-old_level)>0,
       'range_escape':h4.get('trend')=='SIDEWAYS' and broken,
       'staircase':stair,'micro_accumulation':all(x>0 for x in rr[-3:]),
       'retested_zone':(a['l']<=low*1.002 and a['c']>low and body>0) if sign>0 else (a['h']>=high*.998 and a['c']<high and body>0),
       'delayed_impulse':rr[-4]>2*atr and sum(rr[-3:-1])<=atr and rr[-1]>.5*atr,
       'post_impulse_volume':rr[-3]>atr and vols[-1]>2*st.mean(vols[-21:-1]) and rr[-1]>0,
       'retest_breakout':retest,'second_wave':second,'acceleration':0<rr[-3]<rr[-2]<rr[-1],
       'trend_pullback':aligned and rr[-2]<0 and rr[-1]>0 and sign*(a['c']-rows[-3]['c'])>0,
       'flag_breakout':rr[-5]>2*atr and max(r['h'] for r in rows[-4:-1])-min(r['l'] for r in rows[-4:-1])<a['c']*atr/100 and broken,
       'vol_cluster':min(ranges[-3:])>1.3*st.mean(ranges[-15:-3]),
       'nested_breakout':rows[-2]['h']<rows[-3]['h']<rows[-4]['h'] and rows[-2]['l']>rows[-3]['l']>rows[-4]['l'] and sign*(a['c']-prev['h' if sign>0 else 'l'])>0,
       'vol_transition':past_sd>0 and recent_sd>2*past_sd,
       'tail_cluster':sd>0 and sum(abs(x-st.mean(baseline))>2*sd for x in rs[-10:])>=3,
       'range_expansion':sum(ranges[-6:])>1.8*sum(ranges[-12:-6]),
       'vol_asymmetry':sum(x*x for x in rr[-20:] if x>0)/max(1e-12,sum(x*x for x in rr[-20:] if x<0)),
       'demand_exhaustion':a['h']>=high*.998 and st.mean(vols[-3:])<.7*st.mean(vols[-6:-3]) and rs[-1]<0,
       'absorption':a['l']<=low*1.002 and vols[-1]>2*st.mean(vols[-21:-1]) and abs(a['c']/a['o']-1)*100<atr*.3 and a['c']>a['o'],
       'parabolic_failure':rs[-4]>0 and rs[-3]>rs[-4] and rs[-2]>rs[-3] and rs[-1]<-atr,
       'distribution':st.mean(vols[-3:])>2*st.mean(vols[-23:-3]) and abs(change(rows,3))<atr and rs[-1]<0,
       'capitulation_reclaim':rs[-2]<-2*atr and vols[-2]>2*st.mean(vols[-22:-2]) and a['c']>prev['o'],
       'v_recovery':rr[-2]<-2*atr and rr[-1]>abs(rr[-2])*.75,
       'rounded_turn':orient(st.mean(r['c'] for r in rows[-3:])-st.mean(r['c'] for r in rows[-6:-3]))>0 and orient(st.mean(r['c'] for r in rows[-6:-3])-st.mean(r['c'] for r in rows[-9:-6]))<0,
       'failed_breakout':((prev['c']>max(r['h'] for r in rows[-10:-2]) and a['c']<max(r['h'] for r in rows[-10:-2])) if side=='SHORT' else (prev['c']<min(r['l'] for r in rows[-10:-2]) and a['c']>min(r['l'] for r in rows[-10:-2]))),
       'empirical_tail':orient(rs[-1])>max(orient(x) for x in baseline),
       'cusum':max(0,sum((orient(x-st.mean(baseline))/sd-.25) for x in rs[-5:])) if sd else None,
       'coin_4h':coin4,'relative_4h':orient(coin4),
       'breadth':sum(sign*x>0 for x in market_moves)/len(market_moves) if market_moves else None,
       'market_mean_4h':st.mean(market_moves) if market_moves else None}
    bytime={r['t']:r for r in btc};pairs=[(r,bytime[r['t']]) for r in rows if r['t'] in bytime]
    if len(pairs)>=25 and all(pairs[i+1][0]['t']-pairs[i][0]['t']==H for i in range(len(pairs)-1)):
        cr=returns([r[0] for r in pairs]);br=returns([r[1] for r in pairs]);basec=cr[-21:-1];baseb=br[-21:-1]
        covariance=st.mean((x-st.mean(basec))*(y-st.mean(baseb)) for x,y in zip(basec,baseb));variance=st.pvariance(baseb)
        beta=covariance/variance if variance else 0
        residuals=[x-beta*y for x,y in zip(basec,baseb)];res_sd=st.pstdev(residuals)
        btc4=change([r[1] for r in pairs],4)
        oldcorr=correlation(cr[-21:-1],br[-21:-1]);newcorr=correlation(cr[-8:],br[-8:])
        m.update(btc_4h=btc4,btc_flat=abs(btc4)<.5,
                 beta_residual_z=sign*(cr[-1]-beta*br[-1]-st.mean(residuals))/res_sd if res_sd else None,
                 correlation_break=oldcorr is not None and newcorr is not None and oldcorr>.7 and newcorr<.1,
                 btc_delayed_shock=sign*sum(br[-5:-1])>2 and sign*br[-1]>0 and orient(cr[-1])>.5*atr,
                 btc_recovery=sum(br[-5:-1])<-2 and br[-1]>0)
    return m


def matches(conditions,m):
    for key,op,value in conditions:
        actual=m.get(key)
        if actual is None:return False
        if op=='==' and actual!=value:return False
        if op in ('>','>=','<='):
            if not number(actual):return False
            if op=='>' and not actual>value:return False
            if op=='>=' and not actual>=value:return False
            if op=='<=' and not actual<=value:return False
    return True

