"""Terry's Table web app. Reads the Dean League from Yahoo and serves a public, read-only page.

Environment variables (set them on the host, never in the code):
  YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET   from your Yahoo developer app
  YAHOO_REDIRECT_URI                     https://<your-address>/callback
  ADMIN_KEY                              a password only you know, used once to sign in to Yahoo
  YAHOO_REFRESH_TOKEN                    shown to you once after signing in; paste it back as a variable
  YAHOO_LEAGUE_KEY                       optional; the first NFL league on your Yahoo account is used if blank
"""
import base64
import hmac
import json
import os
import secrets
import threading
import time
from html import escape
from urllib.parse import urlencode

import requests
from flask import Flask, Response, jsonify, redirect, request, send_from_directory

CLIENT_ID = os.environ.get("YAHOO_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("YAHOO_CLIENT_SECRET", "")
REDIRECT_URI = os.environ.get("YAHOO_REDIRECT_URI", "")
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")
LEAGUE_KEY = os.environ.get("YAHOO_LEAGUE_KEY", "")
AUTH_URL = "https://api.login.yahoo.com/oauth2/request_auth"
TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token"
API = "https://fantasysports.yahooapis.com/fantasy/v2/"
CACHE_SECONDS = 300

app = Flask(__name__, static_folder=None)
_tok = {"access": None, "exp": 0.0, "refresh": os.environ.get("YAHOO_REFRESH_TOKEN", "")}
_lock = threading.Lock()
_state = {"value": None}
_week_cache = {}  # (league_key, week) -> matchups, finished weeks only
_cache = {"t": 0.0, "data": None}


# ---------- Yahoo OAuth ----------
def _token_request(data):
    basic = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    r = requests.post(TOKEN_URL, data=data, headers={"Authorization": f"Basic {basic}"}, timeout=20)
    if not r.ok:
        raise RuntimeError(f"Yahoo token {r.status_code}: {r.text[:300]}")
    return r.json()


def access_token():
    with _lock:
        if _tok["access"] and time.time() < _tok["exp"]:
            return _tok["access"]
        if not _tok["refresh"]:
            raise PermissionError("Not signed in to Yahoo yet")
        j = _token_request({"grant_type": "refresh_token", "refresh_token": _tok["refresh"],
                            "redirect_uri": REDIRECT_URI})
        _tok["access"] = j["access_token"]
        _tok["exp"] = time.time() + int(j.get("expires_in", 3600)) - 60
        if j.get("refresh_token"):
            _tok["refresh"] = j["refresh_token"]
        return _tok["access"]


def yahoo_get(path):
    r = requests.get(API + path, params={"format": "json"},
                     headers={"Authorization": f"Bearer {access_token()}"}, timeout=30)
    if not r.ok:
        raise RuntimeError(f"Yahoo {r.status_code} for {path}: {r.text[:400]} | www-auth: {r.headers.get('WWW-Authenticate', '')[:200]}")
    return r.json()


# ---------- Yahoo JSON helpers (Yahoo nests lists and numeric-keyed dicts) ----------
def find_all(obj, key):
    """Yield every dict that contains `key`, searching recursively."""
    if isinstance(obj, dict):
        if key in obj:
            yield obj
        for v in obj.values():
            yield from find_all(v, key)
    elif isinstance(obj, list):
        for v in obj:
            yield from find_all(v, key)


def numbered(d):
    return [d[k] for k in sorted((k for k in d if k != "count"), key=int)]


def parse_scoreboard(data):
    """Return (matchups, all_final). matchup = [(team_key, name, score), ...]"""
    matchups, final = [], True
    for holder in find_all(data, "matchups"):
        for item in numbered(holder["matchups"]):
            m = item["matchup"]
            if m.get("status") != "postevent":
                final = False
            teams = []
            for t in numbered(m["0"]["teams"]):
                parts = t["team"]
                meta = {}
                for p in parts[0]:
                    if isinstance(p, dict):
                        meta.update(p)
                teams.append((meta["team_key"], meta["name"], float(parts[1]["team_points"]["total"])))
            matchups.append(teams)
        break
    return matchups, final


def league_key():
    if LEAGUE_KEY:
        return LEAGUE_KEY
    data = yahoo_get("users;use_login=1/games;game_keys=nfl/leagues")
    keys = [d["league_key"] for d in find_all(data, "league_key")]
    if not keys:
        raise RuntimeError("No NFL league found on this Yahoo account")
    return keys[0]


def build_state():
    """The shape the page expects: teams (names by position) and finished weeks of matchups."""
    lk = league_key()
    meta = next(find_all(yahoo_get(f"league/{lk}"), "current_week"))
    current = int(meta["current_week"])
    names, weeks = {}, {}
    for wk in range(1, current + 1):
        if (lk, wk) in _week_cache:
            matchups = _week_cache[(lk, wk)]
        else:
            matchups, final = parse_scoreboard(yahoo_get(f"league/{lk}/scoreboard;week={wk}"))
            if not (final and matchups):
                continue
            _week_cache[(lk, wk)] = matchups
        weeks[wk] = matchups
        for m in matchups:
            for key, name, _ in m:
                names[key] = name
    keys = sorted(names, key=lambda k: int(k.rsplit(".", 1)[-1]))
    idx = {k: i for i, k in enumerate(keys)}
    out = {}
    for wk, ms in weeks.items():
        out[str(wk)] = [{"a": idx[m[0][0]], "b": idx[m[1][0]],
                         "as": f"{m[0][2]:.2f}", "bs": f"{m[1][2]:.2f}"} for m in ms if len(m) == 2]
    return {"league": meta.get("name"), "teams": [names[k] for k in keys], "weeks": out}


# ---------- Routes ----------
@app.route("/")
def index():
    return send_from_directory(os.path.dirname(os.path.abspath(__file__)), "index.html")


SCORES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scores.json")


@app.route("/api/state")
def api_state():
    # If scores.json exists it is the source (hand-entered weeks). Delete it to use Yahoo live.
    if os.path.exists(SCORES_FILE):
        with open(SCORES_FILE, encoding="utf-8") as f:
            return jsonify(json.load(f))
    now = time.time()
    if _cache["data"] is not None and now - _cache["t"] < CACHE_SECONDS:
        return jsonify(_cache["data"])
    try:
        data = build_state()
    except Exception as e:  # keep serving the last good copy if Yahoo hiccups
        if _cache["data"] is not None:
            return jsonify(_cache["data"])
        return jsonify(error=str(e)), 502
    _cache.update(t=now, data=data)
    return jsonify(data)


@app.route("/login")
def login():
    key = request.args.get("key", "")
    if not (ADMIN_KEY and hmac.compare_digest(key, ADMIN_KEY)):
        return "Not allowed", 403
    _state["value"] = secrets.token_urlsafe(16)
    q = urlencode({"client_id": CLIENT_ID, "redirect_uri": REDIRECT_URI, "response_type": "code",
                   "state": _state["value"], "language": "en-us"})
    return redirect(f"{AUTH_URL}?{q}")


@app.route("/callback")
def callback():
    code, state = request.args.get("code"), request.args.get("state")
    if not code or not _state["value"] or not hmac.compare_digest(state or "", _state["value"]):
        return "Start again from /login", 400
    _state["value"] = None
    j = _token_request({"grant_type": "authorization_code", "code": code, "redirect_uri": REDIRECT_URI})
    with _lock:
        _tok.update(access=j["access_token"], exp=time.time() + int(j.get("expires_in", 3600)) - 60,
                    refresh=j["refresh_token"])
    body = ("<h2>Signed in to Yahoo</h2>"
            "<p>Copy this value into a variable named <b>YAHOO_REFRESH_TOKEN</b> on your host, then redeploy. "
            "Keep it private.</p>"
            f"<pre style='white-space:pre-wrap;word-break:break-all'>{escape(j['refresh_token'])}</pre>")
    return Response(body, mimetype="text/html")


@app.route("/healthz")
def healthz():
    return "ok"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
