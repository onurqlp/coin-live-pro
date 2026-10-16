/**
 * COIN.LIVE PRO 3.0 — independent Google Apps Script scheduler.
 * This is an optional HEARTBEAT. It does not contain trading API keys and
 * cannot place orders. Installation requires one-time user authorization.
 *
 * 1. Paste into script.google.com (separate Apps Script project).
 * 2. Project settings -> Script properties -> CLPRO_GITHUB_TOKEN.
 * 3. Token is a fine-grained GitHub PAT restricted to onurqlp/coin-live-pro
 *    with Actions: Read and write; do not put token in this source or chats.
 * 4. Run installCoinLiveHeartbeat() once, approve Google's permission request.
 */
const CLPRO3 = Object.freeze({
  api: 'https://api.github.com/repos/onurqlp/coin-live-pro/actions/workflows/market.yml',
  minGapMs: 12 * 60 * 1000,
  fn: 'coinLiveHeartbeat'
});

function coinLiveGithub_(url, method, token, payload) {
  const options = {
    method: method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'COIN-LIVE-PRO-3-External-Heartbeat'
    },
    muteHttpExceptions: true,
    followRedirects: true
  };
  if (payload !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  const response = UrlFetchApp.fetch(url, options);
  const status = response.getResponseCode();
  if (status !== (method === 'post' ? 204 : 200)) {
    throw Error('GitHub Actions HTTP ' + status + ': ' + response.getContentText().slice(0, 240));
  }
  return method === 'get' ? JSON.parse(response.getContentText()) : null;
}

function coinLiveHeartbeat() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('CLPRO_GITHUB_TOKEN');
  if (!token) throw Error('Script Properties / CLPRO_GITHUB_TOKEN eksik.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return 'Başka kontrol çalışıyor';
  try {
    const runs = coinLiveGithub_(CLPRO3.api + '/runs?per_page=15', 'get', token)
      .workflow_runs || [];
    // Avoid duplicate runs if GitHub's own cron or another heartbeat worked.
    const active = runs.some(run => ['queued','waiting','pending','in_progress'].includes(run.status));
    if (active) return 'GitHub merkezi taraması zaten çalışıyor';
    const lastSuccess = runs.find(run => run.conclusion === 'success');
    const ago = lastSuccess ? Date.now() - Date.parse(lastSuccess.updated_at) : Infinity;
    if (Number.isFinite(ago) && ago >= 0 && ago < CLPRO3.minGapMs) {
      return 'Merkezi tarama yakın zamanda başarılı: ' + Math.round(ago / 60000) + ' dk';
    }
    // Dispatch does NOT claim to be GitHub's native "schedule" event.
    coinLiveGithub_(CLPRO3.api + '/dispatches','post',token,{ref:'main'});
    props.setProperty('CLPRO_LAST_HEARTBEAT_DISPATCH',new Date().toISOString());
    return 'Başlatma isteği GitHub tarafından kabul edildi (204)';
  } finally {
    lock.releaseLock();
  }
}

function installCoinLiveHeartbeat() {
  const props=PropertiesService.getScriptProperties();
  if (!props.getProperty('CLPRO_GITHUB_TOKEN')) {
    throw Error('Önce Script Properties içine CLPRO_GITHUB_TOKEN tanımla.');
  }
  // Never delete anyone else's Apps Script triggers.
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === CLPRO3.fn)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(CLPRO3.fn).timeBased().everyMinutes(15).create();
  const first = coinLiveHeartbeat();
  Logger.log('Kuruldu: her 15 dakika kontrol. İlk durum: ' + first);
  return first;
}

function coinLiveHeartbeatStatus() {
  const props=PropertiesService.getScriptProperties();
  const jobs=ScriptApp.getProjectTriggers()
    .filter(x=>x.getHandlerFunction()===CLPRO3.fn).length;
  return {
    installed: jobs > 0,
    triggers: jobs,
    last_dispatch: props.getProperty('CLPRO_LAST_HEARTBEAT_DISPATCH') || null,
    schedule_is_guaranteed: false
  };
}
