const test = require('node:test');
const assert = require('node:assert/strict');
const {analyze} = require('../web/uzayx/learning.js');
const fixture = (changes={})=>({
  needs_out_of_sample_validation: true,
  cohorts: {
    'TÜMÜ':{closed: 90,positive: 20,negative: 70},
    'LONG':{closed: 40,positive: 4,negative: 36,mean_net_per_closed_ticket_usdt:-0.11,realized_total_usdt:-4.4},
    'SHORT':{closed: 50,positive: 16,negative: 34,mean_net_per_closed_ticket_usdt:-0.02,realized_total_usdt:-1}
  },...changes
});
test('failed cohort is a research hypothesis, not an automatic reversed trade',()=>{
  const a=analyze(fixture(),{started_at:'2026-10-17T00:00:00Z'},'2026-10-18T15:00:00Z');
  assert.equal(a.totalClosed,90);
  assert.equal(a.autoReverseEnabled,false);assert.equal(a.mirrorOutcomeValid,false);
  assert.equal(a.hypotheses[0].id,'LONG');
  assert.equal(a.hypotheses[0].suggestedExperiment,'MIRROR_AND_SKIP_CHALLENGER');
  assert.equal(a.hypotheses[0].mirrorState,'REPLAY_REQUIRED');
  assert.equal(a.hypotheses[0].mirrorPnL,null);
  assert.equal(a.hypotheses[0].tradeAction,'NO_TRADE_CHANGE');
});
test('observations from two days never count as validated walk-forward',()=>{
  const a=analyze(fixture(),{started_at:'2026-10-17T00:00:00Z'},'2026-10-18T15:00:00Z');
  assert.equal(a.hypotheses[0].historyEnough,false);
});
test('invalid cohort counts cannot generate a trading recommendation',()=>{
  const broken=fixture({cohorts:{LONG:{closed:4,positive:8,negative:0,mean_net_per_closed_ticket_usdt:-1}}});
  const a=analyze(broken,{started_at:'2026-10-17T00:00:00Z'},'2026-10-18T15:00:00Z');
  assert.equal(a.hypotheses.length,0);
  assert.equal(a.realOrdersEnabled,false);
});
test('missing report cannot be interpreted as profit',()=>{
  const a=analyze({}, {},'2026-10-18T15:00:00Z');
  assert.equal(a.hypotheses.length,0);
  assert.equal(a.totalClosed,null);
  assert.equal(a.verdict,'NO_VERIFIED_MIRROR_EDGE');
});