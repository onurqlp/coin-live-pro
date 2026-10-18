#!/usr/bin/env python3
"""UzayX Google read-only current-summary export. No Apps Script credentials needed."""
import csv
import datetime as dt
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / 'web' / 'data'
OUT = DATA / 'uzayx-guncel.csv'

def load(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))

def build():
    m, h, p, sp, review = (
        load('v4-manifest.json'), load('health.json'), load('v4-paper.json'),
        load('v4-spark-paper.json'), load('v4-spark-review.json')
    )
    sid=m.get('scan_id')
    if not sid or any(x.get('scan_id') != sid for x in (p,sp,review)):
        raise ValueError('SCAN_ID_MISMATCH')
    if m.get('publication_valid') is not True or m.get('no_real_orders') is not True:
        raise ValueError('UNVERIFIED_MANIFEST')
    stamp=m.get('finished_at_utc')
    now=dt.datetime.now(dt.timezone.utc)
    end=dt.datetime.fromisoformat(str(stamp).replace('Z','+00:00'))
    age=(now-end).total_seconds()/60
    if age < -3 or age > 35:
        raise ValueError('STALE_SOURCE')
    c=m.get('candidate_counts') or {}
    stages=c.get('v4') or {}
    totals=(review.get('cohorts') or {}).get('TÜMÜ') or {}
    spark=sp.get('summary') or {}
    status='GÜNCEL' if h.get('status')=='OK' else 'ZAMANLAMA UYARISI'
    pairs=[
        ('KAYNAK ZAMANI UTC',stamp),
        ('SON TARANAN VERI',status),
        ('VERI KAYNAGI',m.get('provider','—')),
        ('KAYNAK KIMLIGI',sid),
        ('TARANAN PARITE',c.get('market_pairs','—')),
        ('DOGRULANAN',str(c.get('verified','—'))+' / '+str(c.get('attempted','—'))),
        ('IZLEME LISTESI',stages.get('watch','—')),
        ('HAREKET GOZLEMI',stages.get('motion','—')),
        ('ONE CIKAN',stages.get('spotlight','—')),
        ('ANA SANAL KASA USDT',p.get('equity_usdt','—')),
        ('DENEYSEL SANAL KASA USDT',spark.get('virtual_equity_usdt','—')),
        ('KAPANAN DENEY',totals.get('closed','—')),
        ('POZITIF KAPANAN',totals.get('positive','—')),
        ('NEGATIF KAPANAN',totals.get('negative','—')),
        ('NET KOHORT SONUCU USDT',totals.get('realized_total_usdt','—')),
        ('GERCEK EMIR','YOK')
    ]
    with OUT.open('w',encoding='utf-8-sig',newline='') as stream:
        w=csv.writer(stream)
        w.writerow(['GOSTERGE','DEGER','GUNCELLEME UTC'])
        w.writerows((key,value,stamp) for key,value in pairs)
    print('UzayX verified Google summary:', sid, len(pairs), 'rows, source age:',round(age,1),'min')

if __name__ == '__main__':
    build()
