#!/usr/bin/env python3
"""Auto-compare virtual early cohorts after each scan, no adaptive live trading.

Aggregates *only* recorded forward-only paper outcomes. Features are frozen at
signal creation, never recomputed with future candles. No win-probability
calibration or automatic strategy parameter change is claimed.
"""
import datetime as dt
import pathlib
import v4_paper
import v4_spark_paper as paper

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'web'/'data'
ARCH=ROOT/'archive'/'v4-spark-paper-ledger.json'
VERSION='4.0.3-spark-review-a1'
def cohort(t):
    feats=t.get('features_at_birth') or {}
    h=feats.get('4H') or {}
    rsi=h.get('rsi')
    bb=h.get('bb_compression_percentile')
    hist=h.get('macd_hist_pct')
    side=1 if t['side']=='LONG' else -1
    keys=['TÜMÜ',t['side'],
          'GELDI_OTOMATIK_GIRIS' if t.get('entry_class')=='GELDI' else 'ERKEN_ARASTIRMA']
    if t.get('stage_definition')=='VERSIONED_STRATEGY_TRIGGER_AND_COST_REGIME_GATE':
        keys.append('TURAN_STRATEJI_AŞAMA_'+str(t.get('stage_at_birth_number',1)))
    elif t.get('stage_definition')=='CLOSED_1H_BREAKOUT_REQUIRED':
        keys.append(f"AŞAMA_{t.get('stage_at_birth_number',paper.TIER_STAGE.get(t.get('stage_at_birth'),1))}")
    else:
        keys.append('ESKİ_AŞAMA_TANIMI_DÖNEMİ')
    keys+=['RSI_4H_30_50' if 30<=rsi<50 else 'RSI_4H_50_70' if 50<=rsi<=70 else 'RSI_4H_DIĞER'] if isinstance(rsi,(float,int)) else ['RSI_4H_BİLİNMİYOR']
    keys+=['MACD_4H_DESTEK' if isinstance(hist,(float,int)) and hist*side>0 else 'MACD_4H_ZAYIF']
    keys+=['BB_4H_SIKIŞMA' if isinstance(bb,(float,int)) and bb<=30 else 'BB_4H_DİĞER']
    return keys
def build(ledger,early,now_ms):
    if ledger.get('last_scan_id')!=early.get('scan_id'):
        raise RuntimeError('spark-review-scan-mismatch')
    tickets=ledger.get('tickets') or []
    grouped={}
    for t in tickets:
        for key in cohort(t):
            g=grouped.setdefault(key,{'all':0,'open':0,'closed':0,'data_gap':0,
                'positive':0,'negative':0,'flat':0,'realized_total_usdt':0.0,
                'max_favorable_sum_pct':0.0,'max_adverse_sum_pct':0.0})
            g['all']+=1
            if t['status']=='OPEN':g['open']+=1
            if t['status']=='DATA_GAP':g['data_gap']+=1
            if t['status']!='CLOSED':continue
            net=t.get('realized_net_usdt')
            if not isinstance(net,(float,int)):continue
            g['closed']+=1;g['positive']+=net>0;g['negative']+=net<0;g['flat']+=net==0
            g['realized_total_usdt']+=net
            g['max_favorable_sum_pct']+=float(t.get('max_favorable_pct') or 0)
            g['max_adverse_sum_pct']+=float(t.get('max_adverse_pct') or 0)
    for v in grouped.values():
        n=v['closed'];v['realized_total_usdt']=round(v['realized_total_usdt'],5)
        v['mean_net_per_closed_ticket_usdt']=round(v['realized_total_usdt']/n,5) if n else None
        v['mean_mfe_pct']=round(v['max_favorable_sum_pct']/n,4) if n else None
        v['mean_mae_pct']=round(v['max_adverse_sum_pct']/n,4) if n else None
        v['evidence_sufficient_for_comparison']=n>=30
        v['not_a_calibrated_win_probability']=True
        del v['max_favorable_sum_pct'];del v['max_adverse_sum_pct']
    cohorts=sorted(grouped.items(),key=lambda kv:(-kv[1]['closed'],kv[0]))
    conclusions=[]
    base=grouped.get('TÜMÜ',{})
    if base.get('closed',0)<30:
        conclusions.append('En az 30 kapanmış deneme oluşmadan sistem yeni strateji üstünlüğü ilan etmez.')
    else:
        for key,row in cohorts:
            if key=='TÜMÜ' or row['closed']<30:continue
            diff=row['mean_net_per_closed_ticket_usdt']-base['mean_net_per_closed_ticket_usdt']
            conclusions.append(key+': örneklem '+str(row['closed'])+
               ', gerçekleşen sanal ortalama fark '+str(round(diff,5))+
               ' USDT. Tarihsel örnek; bağımsız doğrulama olmadan strateji değiştirilmez.')
        if not conclusions:
            conclusions.append('En az 30 kapanmış baz örnek var; alt gruplar karşılaştırma için henüz küçük.')
    result={'model_version':VERSION,'scan_id':early['scan_id'],'updated_at':paper.stamp(now_ms),
        'source_spark_paper_at':ledger['updated_at'],'total_ever_tickets':len(tickets),
        'cohorts':{k:v for k,v in cohorts},'conclusions':conclusions[:18],
        'geldi_auto_entry_cohort_separate':True,
        'new_rules_applied_automatically':False,'forward_only_training_samples':True,
        'needs_out_of_sample_validation':True,'archive_is_persistent':True,'no_real_orders':True,
        'not_a_win_probability':True}
    return result
def main():
    now=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    prior=v4_paper.read(ARCH,{})
    early=v4_paper.read(DATA/'v4-early.json',{})
    result=build(prior,early,now)
    v4_paper.save(DATA/'v4-spark-review.json',result)
    print('SPARK REVIEW',result['total_ever_tickets'],
          result['cohorts'].get('TÜMÜ',{}).get('closed',0),'settled tickets',flush=True)
if __name__=='__main__':main()
