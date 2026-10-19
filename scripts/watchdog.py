#!/usr/bin/env python3
"""GitHub issue-based operational watchdog, optional Telegram. No trade access."""
import base64
import datetime as dt
import json
import os
import urllib.error
import urllib.parse
import urllib.request

MARKER = "[COIN.LIVE-WATCHDOG]"
UTC = dt.timezone.utc


def parse_utc(value):
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
    except (AttributeError, ValueError, TypeError):
        return None


def diagnose(health, runs, now=None, max_age_minutes=25):
    now = now or dt.datetime.now(UTC)
    stamp = parse_utc(health.get("updated_at"))
    age = round((now-stamp).total_seconds()/60, 1) if stamp else None
    completed = [r for r in runs if r.get("status") == "completed"]
    recent_failures = 0
    for run in completed:
        if run.get("conclusion") in ("failure", "timed_out", "cancelled", "startup_failure"):
            recent_failures += 1
        else:
            break
    reasons = []
    if age is None or age > max_age_minutes or age < -3:
        reasons.append("Market health data stale/invalid (%s min)" % age)
    if recent_failures >= 3:
        reasons.append("Last %s completed market jobs failed" % recent_failures)
    if health.get("status") not in ("OK", "DEGRADED_SCHEDULE_GAP"):
        reasons.append("Health status %s" % health.get("status"))
    return {"unhealthy": bool(reasons), "reasons": reasons, "age_minutes": age,
            "consecutive_failed_runs": recent_failures,
            "last_good_scan": health.get("updated_at"),
            "latest_run_url": completed[0].get("html_url") if completed else None}



def recovery_decision(diagnosis, runs, now=None, cooldown_minutes=20):
    """Queue at most one read-only recovery scan if no recent or active scan exists."""
    now = now or dt.datetime.now(UTC)
    if not diagnosis.get("unhealthy"):
        return {"dispatch": False, "reason": "HEALTHY"}
    for run in runs:
        if run.get("status") in ("queued", "in_progress", "waiting", "pending", "requested"):
            return {"dispatch": False, "reason": "SCAN_ALREADY_RUNNING_OR_QUEUED"}
    recent = []
    for run in runs:
        started = parse_utc(run.get("created_at"))
        if started:
            age = (now - started).total_seconds() / 60
            if -3 <= age < cooldown_minutes:
                recent.append(age)
    if recent:
        return {"dispatch": False, "reason": "RECENT_RUN_COOLDOWN"}
    if diagnosis.get("age_minutes") is not None and diagnosis["age_minutes"] < 25 and diagnosis.get("consecutive_failed_runs", 0) < 3:
        return {"dispatch": False, "reason": "NO_RECOVERY_NEEDED"}
    return {"dispatch": True, "reason": "STALE_OR_THREE_FAILED_SCANS"}

def api(url, token, method="GET", payload=None):
    raw = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=raw, method=method, headers={
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "coin-live-watchdog",
        **({"Content-Type": "application/json"} if raw is not None else {})
    })
    with urllib.request.urlopen(req, timeout=20) as response:
        body = response.read().decode("utf-8")
        return json.loads(body) if body else {}


def telegram(message):
    bot = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat = os.environ.get("TELEGRAM_CHAT_ID", "")
    if not bot or not chat:
        return "not_configured"
    payload = urllib.parse.urlencode({"chat_id": chat, "text": message[:3500]}).encode("utf-8")
    request = urllib.request.Request("https://api.telegram.org/bot" + bot + "/sendMessage",
                                     data=payload, method="POST")
    with urllib.request.urlopen(request, timeout=15):
        pass
    return "sent"


def main():
    repo = os.environ["GITHUB_REPOSITORY"]
    token = os.environ["GITHUB_TOKEN"]
    base = "https://api.github.com/repos/" + repo
    raw = api(base + "/contents/web/data/health.json?ref=main", token)
    health = json.loads(base64.b64decode(raw["content"]).decode("utf-8"))
    runs = api(base + "/actions/workflows/market.yml/runs?per_page=12", token).get("workflow_runs", [])
    status = diagnose(health, runs)
    recovery = recovery_decision(status, runs)
    print("autonomous_recovery:", json.dumps(recovery))
    if recovery["dispatch"]:
        try:
            api(base + "/actions/workflows/market.yml/dispatches", token, "POST", {"ref": "main"})
            print("Dispatched one read-only recovery market scan; no trade orders.")
        except (urllib.error.URLError, TimeoutError, ValueError) as ex:
            print("Recovery dispatch failed; GitHub incident creation continues:",
                  type(ex).__name__)
    issues = api(base + "/issues?state=open&per_page=100", token)
    existing = [i for i in issues if str(i.get("title", "")).startswith(MARKER) and "pull_request" not in i]
    print(json.dumps(status))
    if status["unhealthy"]:
        body = ("Automatic read-only health check (UTC). Not a trading signal.\n\n" +
                "\n".join("- " + r for r in status["reasons"]) +
                "\n\nLast published scan: " + str(status["last_good_scan"]) +
                "\nLatest completed job: " + str(status["latest_run_url"]) +
                "\n\nNo keys or secrets were included. Issue closes automatically after recovery.")
        if not existing:
            api(base + "/issues", token, "POST", {"title": MARKER + " Market pipeline degraded", "body": body})
            try:
                print("telegram:", telegram("COIN.LIVE ALERT\n" + body))
            except (urllib.error.URLError, TimeoutError) as ex:
                print("telegram delivery unavailable:", type(ex).__name__)
        else:
            print("Existing open incident found; no duplicate created.")
    else:
        for issue in existing:
            api(base + "/issues/" + str(issue["number"]), token, "PATCH",
                {"state": "closed", "state_reason": "completed"})
        if existing:
            try:
                print("telegram:", telegram("COIN.LIVE recovered: fresh market pipeline"))
            except (urllib.error.URLError, TimeoutError) as ex:
                print("telegram delivery unavailable:", type(ex).__name__)


if __name__ == "__main__":
    main()
