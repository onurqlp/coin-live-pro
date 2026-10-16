#!/usr/bin/env python3
"""Independent, read-only media context recorder. NEVER a live trade gate.

RSS is editorial information, Bluesky public search optional. X/Twitter:
UNAVAILABLE_NO_CREDENTIALS, not silently substituted. Results have independent
publication AND first-observed timestamps to prevent lookahead. Headlines are
NOT proof of manipulation or price direction.
"""
import datetime as dt
import email.utils
import hashlib
import html
import json
import math
import pathlib
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web'/'data'
ARCH=ROOT/'archive'/'v4-context-ledger.json'
PUBLIC=DATA/'v4-context.json'
VERSION='4.0.0-context-research-a1'
RSS={
 'coindesk':('https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml','coindesk.com'),
 'cointelegraph':('https://cointelegraph.com/rss','cointelegraph.com'),
 'theblock':('https://www.theblock.co/rss.xml','theblock.co')
}
BSKY='https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts'
QUERIES=('bitcoin','ethereum','solana','xrp','dogecoin')
ALIASES={
 'BTCUSDT':('bitcoin','btc'), 'ETHUSDT':('ethereum','ether','eth'),
 'SOLUSDT':('solana',), 'XRPUSDT':('xrp','ripple'),
 'DOGEUSDT':('dogecoin','doge'), 'ADAUSDT':('cardano',),
 'LINKUSDT':('chainlink',), 'BNBUSDT':('binance coin','bnb'),
 'AVAXUSDT':('avalanche blockchain','avax'), 'SUIUSDT':('sui network','sui blockchain'),
 'NEARUSDT':('near protocol',),'INJUSDT':('injective',),
 'LTCUSDT':('litecoin',),'UNIUSDT':('uniswap',),
 'ARBUSDT':('arbitrum',),'FILUSDT':('filecoin',),
 'ZECUSDT':('zcash',),'PEPEUSDT':('pepe coin','pepe token'),
 'TIAUSDT':('celestia',),'WLDUSDT':('worldcoin'),
 'HYPEUSDT':('hyperliquid',)
}
NEGATIVE={'exploit':2.8,'hacked':3,'hack':3,'security breach':3,
 'delist':2.8,'trading halt':2.6,'lawsuit':1.5,'investigation':1.5,
 'outage':1.7,'bankruptcy':3,'fraud':2.7,'scam':2.5,'sell-off':1.1,
 'liquidation':1,'plunges':1.1,'attack':1.8}
POSITIVE={'approved':1.5,'approval':1.3,'etf inflow':1.4,
 'institutional adoption':1.5,'integration':.8,'partnership':.7,
 'upgrade completed':1,'launches':.6,'listing':.8,'record inflows':1.1}
UNCERTAIN=('rumor','rumour','alleged','unconfirmed','could','might','reportedly','speculation')
UA='CoinLiveResearch/4.0 (Public RSS & Bluesky, read-only)'
def iso(ms):return dt.datetime.fromtimestamp(ms/1000,dt.timezone.utc).isoformat()
def ts(v):
    try:
        t=dt.datetime.fromisoformat(str(v).replace('Z','+00:00'))
        return int(t.timestamp()*1000) if t.tzinfo else None
    except (ValueError,TypeError,AttributeError):return None
def parsed_time(v):
    try:
        d=email.utils.parsedate_to_datetime(str(v))
        if d.tzinfo:return int(d.timestamp()*1000)
    except (ValueError,TypeError):pass
    return ts(v)
def read(path,default):
    try:return json.loads(path.read_text(encoding='utf8'))
    except (OSError,ValueError):return default
def save(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(json.dumps(obj,sort_keys=True,separators=(',',':'),
                              ensure_ascii=False,allow_nan=False)+'\n',encoding='utf8')
    tmp.replace(path)
def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/rss+xml,text/xml,application/json'})
    with urllib.request.urlopen(req,timeout=9) as r:
        b=r.read(600001)
    if len(b)>600000:raise ValueError('RESPONSE_TOO_LARGE')
    return b
def clean(v):return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]*>',' ',str(v or '')))).strip()[:260]
def valid_url(url,domain=None):
    try:
        p=urllib.parse.urlsplit(str(url));host=p.hostname or ''
        return p.scheme=='https' and bool(host) and (domain is None or host==domain or host.endswith('.'+domain))
    except ValueError:return False
def symbols(text,universe):
    t=clean(text).casefold();found=set()
    for sym in universe:
        aliases=ALIASES.get(sym,())
        if re.search(r'(?<!\w)[$#]'+re.escape(sym[:-4].casefold())+r'(?!\w)',t):
            found.add(sym);continue
        if any(re.search(r'(?<!\w)'+re.escape(alias)+r'(?!\w)',t) for alias in aliases):
            found.add(sym)
    return sorted(found)
def tone(text):
    t=clean(text).casefold()
    neg=max((v for k,v in NEGATIVE.items() if k in t),default=0)
    pos=max((v for k,v in POSITIVE.items() if k in t),default=0)
    a=pos if pos>neg else -neg if neg>pos else 0
    uncertain=any(x in t for x in UNCERTAIN)
    return (round(a*(.25 if uncertain else 1),2),uncertain)
def normalize(title,url,when,kind,source,now,universe,engagement=0):
    if not isinstance(when,int) or when>now+90000 or now-when>36*3600000:return None
    name=clean(title)
    if len(name)<14 or not valid_url(url):return None
    coins=symbols(name,universe)
    if not coins:return None
    sentiment,uncertain=tone(name)
    return {'id':hashlib.sha256((str(url)+'|'+name.casefold()).encode()).hexdigest()[:22],
        'title':name,'url':str(url),'source':source,'kind':kind,
        'symbols':coins,'published_at_utc':iso(when),'first_seen_at_utc':iso(now),
        'headline_direction':sentiment,'uncertain_language':uncertain,
        'engagement':min(10000,max(0,int(engagement))) if kind=='SOCIAL' else None,
        'evidence_tier':'EDITORIAL_FEED' if kind=='NEWS' else 'PUBLIC_SOCIAL_UNVERIFIED'}
def read_feed(raw,source,now,universe):
    root=ET.fromstring(raw)
    elements=root.findall('.//item')
    if not elements:elements=root.findall('.//{http://www.w3.org/2005/Atom}entry')
    result=[]
    for item in elements[:75]:
        def field(*tags):
            for tag in tags:
                v=item.find(tag)
                if v is not None and v.text:return v.text
            return None
        title=field('title','{http://www.w3.org/2005/Atom}title')
        url=field('link')
        if not url:
            link=item.find('{http://www.w3.org/2005/Atom}link')
            url=link.get('href') if link is not None else ''
        if not valid_url(url,RSS[source][1]):continue
        when=parsed_time(field('pubDate','{http://purl.org/dc/elements/1.1/}date',
             '{http://www.w3.org/2005/Atom}published','{http://www.w3.org/2005/Atom}updated'))
        e=normalize(title,url,when,'NEWS',source,now,universe)
        if e:result.append(e)
    return result
def search_bsky(q,now,universe,fetch=get):
    url=BSKY+'?'+urllib.parse.urlencode({'q':q,'sort':'latest','limit':20})
    obj=json.loads(fetch(url))
    out=[]
    for post in obj.get('posts',[])[:20]:
        rec=post.get('record') or {}
        created=ts(rec.get('createdAt'));indexed=ts(post.get('indexedAt'))
        when=max(created,indexed) if created and indexed else created
        if when is None:continue
        author=(post.get('author') or {}).get('handle','')
        key=str(post.get('uri') or '').rsplit('/',1)[-1]
        if not re.fullmatch(r'[a-zA-Z0-9.-]{2,130}',str(author)) or not re.fullmatch(r'[a-zA-Z0-9_-]{2,90}',key):
            continue
        link=f'https://bsky.app/profile/{author}/post/{key}'
        engagement=(post.get('likeCount') or 0)+(post.get('repostCount') or 0)
        e=normalize(rec.get('text'),link,when,'SOCIAL','bluesky',now,universe,engagement)
        if e:out.append(e)
    return out
def weight(event,now):
    pub=ts(event.get('published_at_utc'));first=ts(event.get('first_seen_at_utc'))
    if pub is None or first is None or first>now or pub>now:return 0
    age=(now-pub)/3600000
    return 2**(-age/5) if 0<=age<=24 else 0
def score_for(symbol,events,now,health):
    fresh=[e for e in events if symbol in e.get('symbols',[]) and weight(e,now)>0]
    sources=set(e['source'] for e in fresh if e['kind']=='NEWS')
    relevant=sorted(fresh,key=lambda e:e['published_at_utc'],reverse=True)
    # Score is a contextual, bounded *research* statistic, not additive to V4
    # base technical score until prospective evidence justifies a new policy.
    signed=0.;support=0.;skeptic=0.
    for e in relevant[:20]:
        directional=float(e.get('headline_direction') or 0)
        base=1.0 if e['kind']=='NEWS' else .3
        effect=base*weight(e,now)*directional
        signed+=effect
        support+=base*weight(e,now)
        if e.get('uncertain_language'):skeptic+=1
    if len(sources)>=2:signed*=1.15
    contextual=int(round(max(-5,min(5,signed))))
    if not relevant:
        state='UNKNOWN' if all(health.get(k)!='OK' for k in ('coindesk','cointelegraph','theblock','bluesky')) else 'NO_MATCHING_EVIDENCE'
    else:state='OBSERVED_UNVERIFIED_DIRECTION'
    return {'state':state,'experimental_adjustment':contextual if relevant else None,
        'observed_headline_count':len(relevant),'independent_editorial_sources':len(sources),
        'uncertain_items':skeptic,'latest_event_at':relevant[0]['published_at_utc'] if relevant else None,
        'sources':sorted({e['source'] for e in relevant}),
        'event_ids':[e['id'] for e in relevant[:8]],
        'not_core_score':True,'not_trade_confirmation':True}
def build(previous,observed,health,now,universe):
    old=[x for x in previous.get('events',[]) if ts(x.get('first_seen_at_utc')) and
         now-(ts(x['first_seen_at_utc']))<=7*86400000]
    by_id={x['id']:x for x in old}
    for x in observed:
        if x['id'] not in by_id:by_id[x['id']]=x
    retained=sorted(by_id.values(),key=lambda x:x['first_seen_at_utc'])
    retained=retained[-1200:]
    contextual={symbol:score_for(symbol,retained,now,health) for symbol in universe}
    ledger={'model_version':VERSION,'started_at':previous.get('started_at') or iso(now),
        'updated_at':iso(now),'events':retained,'sources':health}
    public={'model_version':VERSION,'updated_at':iso(now),'observation_started_at':ledger['started_at'],
        'publisher':'PUBLIC_NEWS_SOCIAL_RESEARCH',
        'source_status':dict(health,x_twitter='UNAVAILABLE_NO_AUTH'),
        'source_scope':'RSS_EDITORIAL_AND_OPTIONAL_BLUESKY_NO_OFFICIAL_X',
        'observations':contextual,'event_count_7d':len(retained),
        'latest_items':retained[-100:][::-1],
        'experimental_max_bonus':5,'experimental_max_penalty':-5,
        'score_not_used_for_paper_or_v4_stage':True,
        'warning':'Headlines may be wrong, delayed or misleading; not manipulation proof or trading confirmation.'}
    return ledger,public
def main():
    now=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    market=read(DATA/'market.json',{})
    universe=sorted({x['symbol'] for x in market.get('rows',[]) if str(x.get('symbol','')).endswith('USDT')})
    if not universe:raise RuntimeError('Live market universe missing, no media scoring')
    seen=[];health={}
    for source,(url,_) in RSS.items():
        try:
            events=read_feed(get(url),source,now,universe)
            health[source]='OK'
            seen+=events
        except (OSError,ValueError,ET.ParseError,RuntimeError) as e:
            health[source]='UNAVAILABLE_'+type(e).__name__
    for q in QUERIES:
        try:
            seen+=search_bsky(q,now,universe)
            health['bluesky']='OK'
        except (OSError,ValueError,RuntimeError,KeyError) as e:
            health['bluesky']='UNAVAILABLE_'+type(e).__name__
            # Stop probing after first failure; do not claim public access.
            break
    old=read(ARCH,{})
    ledger,public=build(old,seen,health,now,universe)
    # Write both to git workspace; deploy occurs via separate GitHub workflow.
    save(ARCH,ledger);save(PUBLIC,public)
    print('MEDIA CONTEXT',len(seen),'new source matches',
          'health',health,'active',len(public['observations']),flush=True)

if __name__=='__main__':main()
