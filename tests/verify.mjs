import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('web/index.html','utf8');
const code=fs.readFileSync('web/app.js','utf8');
const pilot=fs.readFileSync('web/pilot-ui.js','utf8');
const router=fs.readFileSync('web/router.js','utf8');
const cleanup=fs.readFileSync('web/legacy-reset.js','utf8');
const v4code=fs.readFileSync('web/v4-ui.js','utf8');
for(const body of [code,pilot,router,cleanup,v4code])new Function(body);

const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
assert.equal(ids.length,new Set(ids).size,'DOM IDs must be unique');
const bound=[...(code+'\n'+pilot).matchAll(/\$\('([^']+)'\)/g)].map(x=>x[1]);
assert.deepEqual([...new Set(bound)].filter(x=>!ids.includes(x)),[],'No missing bound UI nodes');
for(const id of ['quoteClock','radarRows','swingHistoryRows','forwardRows','forwardSummary','forwardMeta','chartPanel',
  'candleChart','chartTf','chartQuickFrames','mtfPanel','paperPanel','paperKpis','paperRows',
  'systemPanel','systemKpis','healthTitle','scanStatus','serverRestart'])
  assert.ok(ids.includes(id),'Missing v3 page component: '+id);

assert.ok(!fs.existsSync('web/live-radar.js'),'Obsolete 15m browser scanner must be deleted');
assert.ok(html.includes('legacy-reset.js?')&&!html.includes('live-radar.js?'),'V3 resets old local device history');
assert.ok(cleanup.includes("removeItem('clpro.local_events_v1')"),'Browser 15m history reset missing');
assert.ok(!html.includes('Eski 15 Dakikalık Pilot Arşivi')&&!html.includes('id="historyRows"')&&!html.includes('id="browserHistory"'),'Legacy history UI is not allowed');
assert.ok(!code.includes("'history','reports'")&&!code.includes("'2.4.0-htf-sparks'")&&!code.includes("'2.3.0-htf-sparks'"),'Cannot accept legacy models');
assert.ok(code.includes("'3.0.0-htf-sparks'")&&code.includes("'swing-history'")&&code.includes("'swing-outcomes'"),'V3 canonical data sources required');
assert.ok(code.includes('selectSpark(el.dataset.symbol,el.dataset.tf)'),'Spark must select its own native chart');
assert.ok(html.includes('1H/15m TEYİT; 5m/1m ek kontrol.'),'Microframes used only for confirmation');
assert.ok(html.includes('legacyTechnicalDisclosure')&&html.includes('legacyReportDisclosure'),'Technical/old reports must be collapsed, not deleted');
assert.ok(html.includes('v4ObservationStatus')&&html.includes('<option value="3" selected>90 gün</option>'),'90-day observation default missing');
assert.ok(!html.includes('BETA'),'No beta labels in released site');
assert.ok(v4code.includes("select(symbol,'4H',false)"),'V4 opportunities must select SAME PAGE chart');
assert.ok(v4code.includes('showMarketSummary(r,manifest,stale)'),'V4 KPIs must render verified manifest data');
assert.ok(v4code.includes("new Set(rows.filter(x=>x.side===side)"),'LONG / SHORT counts must deduplicate multi-strategy symbol');
assert.ok(v4code.includes('store.initialChartSelected'),'Auto-select initial V4 candidate once');
assert.ok(code.includes('silent=false'),'Initial V4 chart must not jump on mobile');
assert.ok(html.indexOf('id="chartHostRadar"')<html.indexOf('id="legacyTechnicalDisclosure"'),
  'Chart should always be visible on main radar, never in collapsed technical details');
assert.ok(html.indexOf('id="v4Spotlight"')<html.indexOf('id="v4Motion"')&&
  html.indexOf('id="v4Motion"')<html.indexOf('id="v4Watch"')&&
  html.indexOf('id="v4Watch"')<html.indexOf('id="chartHostRadar"'),
  'Main radar must show spotlight/motion above watch and chart');
for(const id of ['v4MarketTotal','v4LongTotal','v4ShortTotal','v4LastAnalysis'])
  assert.ok(ids.includes(id),'Missing summary KPI: '+id);
assert.ok(code.includes("mode:'SERVER'")&&code.includes("mode:'STALE'"),'Central data gate must fail closed');
assert.ok(router.includes("window.addEventListener('hashchange',renderRoute)"),'Navigation must support history');
assert.ok(router.includes('destination.replaceChildren(panel)'),'Native chart must be shared');
assert.ok(router.includes('schedule_proven'),'Cron health must require evidence');
assert.ok(html.includes('id="alerts" disabled')&&code.includes('Bildirimler kapalı'),'User alerts must remain disabled during 90 days');
assert.ok(html.indexOf('id="chartPanel"')<html.indexOf('data-view="grafikler"'),'Native chart must be on Radar homepage');
const routes=['radar','grafikler','portfoy','gecmis','rapor','sistem'];
const views=[...html.matchAll(/class="workspaceView"[^>]*data-view="([^"]+)"[^>]*>/g)];
assert.deepEqual(views.map(v=>v[1]),routes,'Six workspace tabs');
assert.equal(views.filter(v=>!v[0].includes(' hidden')).length,1,'Exactly first page active');
for(const route of routes)assert.ok(html.includes('href="#'+route+'" data-nav="'+route+'"'),'Missing route '+route);
assert.ok(code.includes('async function refreshLivePrices()'),'Independent real-time OKX quotes absent');
assert.ok(code.includes('setInterval(()=>{if(!document.hidden)refreshLivePrices();},20000)'),'20-sec visible price polling must run');
assert.ok(code.includes('S.quoteRowsCache.get(old.symbol)'),'Server snapshot should not overwrite newer live prices');
assert.ok(code.includes("S.stamps.radar")&&code.includes('25*60000'),'Independent stale 1D/4H guard retained');
const marketWorkflow=fs.readFileSync('.github/workflows/market.yml','utf8');
assert.match(marketWorkflow,/  push:\n    branches:\n      - main\n/,
  'Feature branch code pushes must not run the production market publishing workflow');
for(const id of ['v4Board','v4Spotlight','v4Motion','v4Watch','v4Desk','v4PaperKpis',
 'v4Positions','chartHostPortfolio','v4Orders','v4EquityCanvas','v4Lab','v4LabBody',
 'v4HistoryRows','v4HistoryCount'])
  assert.ok(ids.includes(id),'V4 view missing '+id);
assert.ok(html.includes('v4-ui.js')&&html.includes('v4-style.css'),'V4 scripts not connected');
assert.ok(!html.includes('legacy-reset.js'),'Never read/write browser persistent storage');
assert.ok(v4code.includes('factorLamps(x)')&&v4code.includes('x.metrics||{}'),'Technical lamps must use actual V4 source metrics');
assert.ok(router.includes("key==='portfoy'?portfolio"),'One chart must move to paper portfolio');
assert.ok(v4code.includes('v4-history-index')&&v4code.includes('renderHistory()'),'V4 history must validate and display latest audited event index');
assert.ok(v4code.includes('publication_valid')&&v4code.includes('SHA-256'),
  'V4 must independently validate source checksums');
assert.ok(html.includes('v3LegacyDisclosure'),'Old V3 100-USDT pilot must remain archived');
assert.ok(code.includes('window.CoinLiveSelectSpark=selectSpark'), 'V4 cards must be able to reach actual chart selector');
assert.ok(v4code.includes('window.CoinLiveSelectSpark'), 'V4 graph buttons must have functional chart selector');
assert.ok(!v4code.includes('Notification('),'No V4 user push alerts');
console.log('PASS: V3 compatibility plus V4 three-stage, isolated paper UI, checksum reader, shared chart.');
