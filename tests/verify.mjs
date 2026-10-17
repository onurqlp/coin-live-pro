import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('web/index.html','utf8');
const code=fs.readFileSync('web/app.js','utf8');
const guidance=fs.readFileSync('web/chart-guidance.js','utf8');
new Function(guidance);
const pilot=fs.readFileSync('web/pilot-ui.js','utf8');
const router=fs.readFileSync('web/router.js','utf8');
const v4code=fs.readFileSync('web/v4-ui.js','utf8');
for(const body of [code,pilot,router,v4code])new Function(body);

const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
assert.equal(ids.length,new Set(ids).size,'DOM IDs must be unique');
const bound=[...(code+'\n'+pilot).matchAll(/\$\('([^']+)'\)/g)].map(x=>x[1]);
assert.deepEqual([...new Set(bound)].filter(x=>!ids.includes(x)),[],'No missing bound UI nodes');
for(const id of ['quoteClock','radarRows','swingHistoryRows','forwardRows','forwardSummary','forwardMeta','chartPanel',
  'candleChart','chartTf','chartQuickFrames','mtfPanel','paperPanel','paperKpis','paperRows',
  'systemPanel','systemKpis','healthTitle','scanStatus','serverRestart'])
  assert.ok(ids.includes(id),'Missing v3 page component: '+id);

assert.ok(!fs.existsSync('web/live-radar.js'),'Obsolete 15m browser scanner must be deleted');
assert.ok(!html.includes('legacy-reset.js?')&&!html.includes('live-radar.js?'),'No browser persistence script in online-only 90-day system');
assert.ok(!html.includes('Eski 15 Dakikalık Pilot Arşivi')&&!html.includes('id="historyRows"')&&!html.includes('id="browserHistory"'),'Legacy history UI is not allowed');
assert.ok(!code.includes("'history','reports'")&&!code.includes("'2.4.0-htf-sparks'")&&!code.includes("'2.3.0-htf-sparks'"),'Cannot accept legacy models');
assert.ok(code.includes("'3.0.0-htf-sparks'")&&code.includes("'swing-history'")&&code.includes("'swing-outcomes'"),'V3 canonical data sources required');
assert.ok(code.includes('selectSpark(el.dataset.symbol,el.dataset.tf)'),'Spark must select its own native chart');
assert.ok(html.includes('1H/15m TEYİT; 5m/1m ek kontrol.'),'Microframes used only for confirmation');
assert.ok(html.includes('legacyTechnicalDisclosure')&&html.includes('legacyReportDisclosure'),'Technical/old reports must be collapsed, not deleted');
assert.ok(html.includes('v4ObservationStatus')&&html.includes('<option value="3" selected>90 gün</option>'),'90-day observation default missing');
assert.ok(!html.includes('BETA'),'No beta labels in released site');
assert.ok(v4code.includes("select(symbol,'4H',false,false,b.dataset.v4Side)"),'V4 opportunities must select SAME PAGE chart and the clicked LONG/SHORT direction');
assert.ok(v4code.includes('showMarketSummary(r,manifest,stale)'),'V4 KPIs must render verified manifest data');
assert.ok(v4code.includes("new Set(rows.filter(x=>x.side===side)"),'LONG / SHORT counts must deduplicate multi-strategy symbol');
assert.ok(v4code.includes('store.initialChartSelected'),'Auto-select initial V4 candidate once');
assert.ok(code.includes('silent=false'),'Initial V4 chart must not jump on mobile');
assert.ok(html.indexOf('id="chartHostRadar"')<html.indexOf('id="legacyTechnicalDisclosure"'),
  'Chart should always be visible on main radar, never in collapsed technical details');
assert.ok(html.indexOf('id="v4Spotlight"')<html.indexOf('id="v4Motion"')&&
  html.indexOf('id="v4Motion"')<html.indexOf('id="v4Watch"')&&
  html.indexOf('id="v4Watch"')<html.indexOf('id="legacyTechnicalDisclosure"'),
  'Preserve strict older stage details behind disclosure');
for(const id of ['v4MarketTotal','v4LongTotal','v4ShortTotal','v4LastAnalysis'])
  assert.ok(ids.includes(id),'Missing summary KPI: '+id);
assert.ok(code.includes("mode:'SERVER'")&&code.includes("mode:'STALE'"),'Central data gate must fail closed');
assert.ok(router.includes("window.addEventListener('hashchange',renderRoute)"),'Navigation must support history');
assert.ok(router.includes('destination.replaceChildren(panel)'),'Native chart must be shared');
assert.ok(router.includes('schedule_proven'),'Cron health must require evidence');
assert.ok(!html.includes('id="alerts"')&&!code.includes('S.notified'),'Unused browser alerts removed');
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
for(const id of ['releaseVersion','releaseUpdated','releaseFooter','v4GlobalUtcClock',
                  'v4GlobalSession','v4AnomalyHourly'])
  assert.ok(ids.includes(id),'Missing release/UTC header: '+id);
assert.ok(v4code.includes("timeZone:'UTC'"),'V4 displayed market timestamps must use global UTC');
assert.ok(v4code.includes('renderGlobalResearch(r,manifest)'),'UTC market research view unconnected');
assert.ok(v4code.includes('loadRelease();load()'),'Version release.json not loaded');
const release=JSON.parse(fs.readFileSync('web/release.json','utf8'));
assert.equal(release.product_version,'4.02','Automatic 4.xx minor update from user approval');
assert.equal(release.version_change_owner,'AUTOMATIC_MINOR_WITHIN_4');
assert.ok(Number.isFinite(Date.parse(release.updated_at_utc)),'Update stamp missing');
assert.ok(html.includes('releaseHistoryList')&&v4code.includes('meta.change_log'),'UTC release history missing');
assert.ok(!code.includes('Europe/Istanbul'),'No Turkey-specific analysis clocks in legacy UI');
assert.ok(code.includes("String(x[8])==='1'"),'OKX chart must check candle confirmation');
assert.ok(!v4code.includes('localStorage.')&&!v4code.includes('sessionStorage.'),'Browser persistence forbidden');
assert.ok(v4code.includes('factorLamps(x)')&&v4code.includes('x.metrics||{}'),'Technical lamps must use actual V4 source metrics');
assert.ok(router.includes("key==='portfoy'?portfolio"),'One chart must move to paper portfolio');
assert.ok(v4code.includes('v4-history-index')&&v4code.includes('renderHistory()'),'V4 history must validate and display latest audited event index');
assert.ok(v4code.includes('publication_valid')&&v4code.includes('SHA-256'),
  'V4 must independently validate source checksums');
assert.ok(html.includes('v3LegacyDisclosure'),'Old V3 100-USDT pilot must remain archived');
assert.ok(code.includes('window.CoinLiveSelectSpark=selectSpark'), 'V4 cards must be able to reach actual chart selector');
assert.ok(v4code.includes('window.CoinLiveSelectSpark'), 'V4 graph buttons must have functional chart selector');
assert.ok(!v4code.includes('Notification('),'No V4 user push alerts');
const watchCode=fs.readFileSync('web/watch-archive-ui.js','utf8');new Function(watchCode);
for(const id of ['watchArchiveRefresh','watchArchiveRows','watchArchivePeriod','watchArchiveMore','watchArchiveSide','watchArchiveSearch','v4NewsStatus','v4NewsItems'])
 assert.ok(ids.includes(id),'Required UI missing: '+id);
assert.ok(watchCode.includes("crypto.subtle.digest")&&watchCode.includes("'v4-watch-archive'"),'Archive must verify SHA256');
assert.ok(html.includes('watch-archive-ui.js'),'Archive JavaScript missing');
const ui=fs.readFileSync('web/ui-refresh.css','utf8');
assert.ok(html.includes('ui-refresh.css?v=5'),'UI design tokens must be linked');
for(const id of ['v4RadarSearch','v4RadarSide','v4RadarFilterStatus'])
  assert.ok(ids.includes(id),'Radar search & side filters must be present: '+id);
assert.ok(v4code.includes('applyRadarFilter();')&&v4code.includes("mainFrameSummary(x)"),
  'Filters and primary closed-candle timeframes must render');
assert.ok(v4code.includes('v4Evidence')&&v4code.includes('factorLamps(x)'),
  'Collapsible research details must retain real source metrics');
assert.ok(ui.includes('prefers-reduced-motion')&&ui.includes(':focus-visible'),
  'Keyboard focus and reduced motion styles must exist');
assert.equal(JSON.parse(fs.readFileSync('web/release.json')).product_version,'4.02',
  'User approved automatic 4.xx revisions; only 5.0 requires approval');
for(const id of ['v4Early','v4EarlyCount','v4EarlyStatus','v4EarlyLabel','v4EarlyHistoryHint'])
  assert.ok(ids.includes(id),'Independent early alert UI missing '+id);
assert.ok(v4code.includes("readJson(k,m)")&&v4code.includes("'v4-early'"),'Early research must be SHA256 source verified');
assert.ok(v4code.includes('no_paper_entries')||v4code.includes('paper_eligible===false'),'Early watch cannot become paper entry');
assert.ok(v4code.includes('renderEarly(manifest,stale)'),'Early cards must respect V4 source freshness');
assert.ok(html.indexOf('id="v4Early"')<html.indexOf('id="chartHostRadar"')&&
 html.indexOf('id="chartHostRadar"')<html.indexOf('id="sparkStrictDetails"'),
 'Primary 1-2-3 alert stages and chart must precede strict advanced radar');
assert.ok(html.includes('id="sparkCompare"')&&html.includes('id="sparkCompareReport"')&&
 html.includes('id="sparkPaperPanel"'),'Automatic comparison and paper panel missing');
assert.ok(html.includes('id="chartIndicatorsToggle"')&&html.includes('id="chartIndicatorsCanvas"')&&
 html.includes('chart-indicators.js'),'Opt-in RSI MACD BB chart proof missing');
assert.ok(html.includes('spark-ui.js')&&v4code.includes("'v4-spark-paper'")&&
 v4code.includes("'v4-spark-review'"),'Unsigned unverified spark outcome source');
assert.ok(v4code.includes('paper_stage_number')&&v4code.includes('GELDİ'),
 '1-2-3 spark classification not automatic');
for(const id of ['chartScenario','v4StagePath'])assert.ok(html.includes('id="'+id+'"')||
 html.includes('class="'+id+'"'),'Model scenario and stage staircase missing '+id);
assert.ok(html.includes('chart-guidance.js?v=2')&&code.includes('CoinLiveChartGuidance?.build'),
 'Canvas must draw independent verified research thresholds on every selected timeframe');
assert.ok(v4code.includes("'v4-spark-review'].map(k=>readJson(k,m))")&&v4code.includes('mtf.fetched_at!==m.started_at_utc'),
 'HTF model must be SHA-verified and stamped to manifest');
assert.ok(code.includes('selectedSide')&&v4code.includes('b.dataset.v4Side'),
 'Clicked LONG/SHORT direction must stay selected through chart analysis');
assert.ok(guidance.includes("ATR_RESEARCH_PROJECTION")&&guidance.includes("SOURCE_RESEARCH_LEVELS")&&
 guidance.includes("NO_LEVEL"),'Do not fake targets or treat ATR projections as traded levels');
const firstScreen=html.slice(html.indexOf('<main class="workspaceView" data-view="radar"'),
 html.indexOf('id="v4Watch"'));
assert.ok(!firstScreen.includes('class="v4MarketSummary"') &&
 !firstScreen.includes('class="v4StagePath"') &&
 !firstScreen.includes('class="v4UtcBar"') &&
 !firstScreen.includes('class="v4Observation"'),
 'Verbose market metadata must be after opportunity panels inside disclosure');
assert.ok(html.includes('id="radarMetaDetails"')&&html.includes('id="headerMore"'),
 'Technical info and older pilot must remain reachable in disclosure');
assert.ok(html.includes('class="header minimalHeader"')&&html.includes('class="headerActions"'),
 'Minimal main header missing');
assert.ok(html.includes('id="calculator"')&&html.includes('id="releaseHistory"') &&
 html.includes('id="v4ArchivedCount"'), 'Collapse must not delete features');
assert.ok(v4code.includes("hidden=!priorityShown"),
 'Empty higher-stages must not consume the viewport');
assert.ok(ui.includes('.banner:not(.stale):not(.warn)'),
 'Healthy redundant status banners must not take vertical screen space');
assert.ok(html.includes('quickTfOptional')&&html.includes('id="chartTf"'),
 'Timeframes must remain accessible through ONE control');
assert.ok(!html.includes('Gerçek emir aç'),'No claims of real trading');
console.log('PASS: 4.02 automatic early staged virtual paper + forward-only comparison, readable chart.');

