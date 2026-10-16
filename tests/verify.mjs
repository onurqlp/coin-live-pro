import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('web/index.html','utf8');
const code=fs.readFileSync('web/app.js','utf8');
const pilot=fs.readFileSync('web/pilot-ui.js','utf8');
const router=fs.readFileSync('web/router.js','utf8');
const cleanup=fs.readFileSync('web/legacy-reset.js','utf8');
for(const body of [code,pilot,router,cleanup])new Function(body);

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
assert.ok(code.includes("mode:'SERVER'")&&code.includes("mode:'STALE'"),'Central data gate must fail closed');
assert.ok(router.includes("window.addEventListener('hashchange',renderRoute)"),'Navigation must support history');
assert.ok(router.includes('destination.replaceChildren(panel)'),'Native chart must be shared');
assert.ok(router.includes('schedule_proven'),'Cron health must require evidence');
assert.ok(html.includes('id="alerts" disabled')&&code.includes('Pilot: bildirim kapalı'),'Pilot alerts should remain disabled');
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
assert.match(marketWorkflow,/  push:\\n    branches:\\n      - main\\n/,
  'Feature branch code pushes must not run the production market publishing workflow');
console.log('PASS: COIN.LIVE PRO 3.0 only, no 15m signals/legacy metrics; six tabs, charts and forward audit intact.');
