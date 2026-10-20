#!/usr/bin/env python3
"""Incremental Binance public futures OHLCV archive, research only.

Never feeds the OKX paper engine. Missing months or exchange information are
explicit gaps; a historical current-symbol catalogue is not reconstructed.
"""
import csv
import datetime as dt
import gzip
import hashlib
import io
import json
import os
import pathlib
import re
import urllib.error
import urllib.request
import zipfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'research/binance-history'
INDEX=OUT/'index.json'
BASE='https://data.binance.vision/data/futures'
MARKETS={'um':'https://fapi.binance.com/fapi/v1/exchangeInfo',
         'cm':'https://dapi.binance.com/dapi/v1/exchangeInfo'}
MAX_BYTES=3000000
VERSION='uzayx.binance.archive.v1'


def now_iso():return dt.datetime.now(dt.timezone.utc).isoformat()
def get(url,limit=MAX_BYTES):
    req=urllib.request.Request(url,headers={'User-Agent':'UzayX-research/1.0'})
    with urllib.request.urlopen(req,timeout=18) as r:
        data=r.read(limit+1)
        if len(data)>limit:raise ValueError('ARCHIVE_TOO_LARGE')
        return data
def month_after(ym):
    year,month=map(int,ym.split('-'))
    return f'{year+int(month==12):04d}-{month%12+1:02d}'
def month_at(ms):
    return dt.datetime.fromtimestamp(int(ms)/1000,dt.timezone.utc).strftime('%Y-%m')
def catalogue(fetch=get):
    rows=[];health={}
    for market,url in MARKETS.items():
        try:
            raw=json.loads(fetch(url));symbols=raw['symbols']
            if not isinstance(symbols,list) or len(symbols)<10:raise ValueError('INVALID_EXCHANGE_INFO')
            for s in symbols:
                symbol=s.get('symbol');contract=s.get('contractType');state=s.get('status')
                if not isinstance(symbol,str) or not re.fullmatch(r'[A-Z0-9_]{3,40}',symbol):continue
                if market=='um' and s.get('quoteAsset')!='USDT':continue
                if market=='cm' and not (s.get('pair') or '').endswith('USD'):continue
                if contract not in ('PERPETUAL','CURRENT_QUARTER','NEXT_QUARTER','CURRENT_QUARTER_DELIVERING'):continue
                rows.append({'market':market,'symbol':symbol,'contract_type':contract,
                    'status':state,'onboard_ms':s.get('onboardDate'),
                    'delivery_ms':s.get('deliveryDate'),
                    'historical_listing_reconstruction':'UNKNOWN_BEFORE_FIRST_CENSUS'})
            health[market]='OK'
        except (OSError,ValueError,KeyError,TypeError,urllib.error.URLError) as exc:
            health[market]='SOURCE_UNAVAILABLE_'+type(exc).__name__
    return rows,health


def read_zip(data,ym):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names=[n for n in archive.namelist() if n.endswith('.csv') and '/' not in n]
        if len(names)!=1:raise ValueError('UNEXPECTED_ARCHIVE_MEMBERS')
        with archive.open(names[0]) as f:
            rows=list(csv.reader(io.TextIOWrapper(f,encoding='utf-8-sig')))
    out=[];first=int(dt.datetime.fromisoformat(ym+'-01T00:00:00+00:00').timestamp()*1000)
    next_ms=int(dt.datetime.fromisoformat(month_after(ym)+'-01T00:00:00+00:00').timestamp()*1000)
    for row in rows:
        if row and row[0]=='open_time':continue
        if len(row)<7:raise ValueError('INVALID_KLINE_COLUMNS')
        t=int(row[0]);t=t//1000 if t>=10**15 else t
        o,h,l,c,v=map(float,row[1:6]);close_time=int(row[6]);close_time=close_time//1000 if close_time>=10**15 else close_time
        if not(first<=t<next_ms and close_time>=t+3599000 and close_time<t+3601000 and
               min(o,h,l,c)>0 and v>=0 and h>=max(o,c) and l<=min(o,c)):
            raise ValueError('INVALID_CLOSED_HOURLY_KLINE')
        out.append([t,o,h,l,c,v])
    out.sort(key=lambda r:r[0])
    if not out or any(b[0]<=a[0] for a,b in zip(out,out[1:])):raise ValueError('EMPTY_OR_DUPLICATE_KLINE')
    return out


def run(fetch=get,max_artifacts=4,clock=None):
    clock=clock or dt.datetime.now(dt.timezone.utc)
    if max_artifacts<1 or max_artifacts>20:raise ValueError('INVALID_ARTIFACT_BUDGET')
    previous=json.loads(INDEX.read_text()) if INDEX.exists() else {}
    if previous and previous.get('version')!=VERSION:raise ValueError('UNKNOWN_ARCHIVE_VERSION')
    instruments,health=catalogue(fetch)
    old={(s['market'],s['symbol']):s for s in previous.get('instruments',[])}
    if not instruments:instruments=list(old.values())
    merged=dict(old)
    for s in instruments:merged[(s['market'],s['symbol'])]=s
    index={'version':VERSION,'updated_at_utc':clock.isoformat(),
        'first_census_at_utc':previous.get('first_census_at_utc') or (clock.isoformat() if any(v=='OK' for v in health.values()) else None),
        'source_health':health,'instruments':sorted(merged.values(),key=lambda s:(s['market'],s['symbol'])),
        'archives':previous.get('archives',{}),'attempts':previous.get('attempts',{}),
        'market_scope':'OBSERVED_EXCHANGE_INFO_NOT_ALL_DELISTED_HISTORY',
        'ohlcv_scope':'CLOSED_1H_MONTHLY_ONLY','funding':'NOT_COLLECTED',
        'open_interest':'NOT_COLLECTED','book_history':'NOT_COLLECTED',
        'real_orders':False,'paper_cash_untouched':True}
    latest=month_at(clock.timestamp()*1000)
    candidates=[]
    for s in index['instruments']:
        if s['status']!='TRADING':continue
        onboard=s.get('onboard_ms')
        if not isinstance(onboard,int) or onboard<1500000000000:continue
        key=s['market']+'/'+s['symbol'];cursor=previous.get('attempts',{}).get(key,{}).get('next_month') or month_at(onboard)
        if cursor<latest:candidates.append((cursor,key,s))
    # Least advanced symbol first, bounded work per invocation.
    for ym,key,s in sorted(candidates)[:max_artifacts]:
        name=f"{s['symbol']}-1h-{ym}";relative=f"{s['market']}/{s['symbol']}/1h/{ym}.json.gz"
        url=f"{BASE}/{s['market']}/monthly/klines/{s['symbol']}/1h/{name}.zip"
        record={'month':ym,'next_month':month_after(ym)}
        try:
            data=fetch(url)
            checksum=fetch(url+'.CHECKSUM',1024).decode('ascii').split()[0]
            if not re.fullmatch(r'[0-9a-fA-F]{64}',checksum) or hashlib.sha256(data).hexdigest()!=checksum.lower():
                raise ValueError('ARCHIVE_CHECKSUM_MISMATCH')
            bars=read_zip(data,ym)
            target=OUT/relative;target.parent.mkdir(parents=True,exist_ok=True)
            content=gzip.compress(json.dumps({'source':url,'month':ym,'market':s['market'],
                'symbol':s['symbol'],'rows':bars,'not_a_backtest':True},separators=(',',':')).encode(),mtime=0)
            target.write_bytes(content)
            index['archives'][key+'/'+ym]={'path':relative,'rows':len(bars),'first_ms':bars[0][0],
                'last_ms':bars[-1][0],'sha256':hashlib.sha256(content).hexdigest(),
                'source_zip_sha256':checksum.lower(),'status':'VERIFIED_CLOSED_OHLCV'}
            record['state']='VERIFIED'
        except urllib.error.HTTPError as exc:
            record['state']='SOURCE_MISSING' if exc.code==404 else 'SOURCE_UNAVAILABLE'
            record['http_status']=exc.code
        except (OSError,ValueError,zipfile.BadZipFile,urllib.error.URLError) as exc:
            record['state']=type(exc).__name__+'_'+str(exc)[:70]
            record['next_month']=ym  # Retry, never advance a failed checksum or transient request.
        index['attempts'][key]=record
    OUT.mkdir(parents=True,exist_ok=True)
    temp=INDEX.with_suffix('.tmp');temp.write_text(json.dumps(index,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n');temp.replace(INDEX)
    return index


if __name__=='__main__':
    result=run(max_artifacts=int(os.environ.get('UZAYX_BINANCE_ARTIFACT_BUDGET','4')))
    print('BINANCE_RESEARCH',result['source_health'],'instruments',len(result['instruments']),
          'verified_months',len(result['archives']))
