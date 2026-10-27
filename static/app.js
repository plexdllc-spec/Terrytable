(function () {
  var WEEKS = 14, N = 12;
  var TABS = ['table', 'races', 'playoffs', 'matchups', 'alltime'];
  var state = { teams: [], weeks: {} };
  var tab = 'table', showWeeks = false, selTeam = null;
  var stateSig = '', loaded = false, loadFailed = false, entered = false, replaying = false;
  var mWeek = null, lastD = null;
  var introUntil = 0, introGo = false;
  var ANIM = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var $ = function (id) { return document.getElementById(id); };
  introUntil = performance.now() + (ANIM ? 3700 : 0);
  function introWait() { return Math.max(0, introUntil - performance.now()); }
  function onView(node, fn) {
    if (!ANIM) { fn(); return; }
    var t = setInterval(function () {
      if (!document.body.contains(node)) { clearInterval(t); return; }
      var r = node.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.top < window.innerHeight * 0.92 && r.bottom > 0) { clearInterval(t); fn(); }
    }, 250);
  }

  state.teams = (function () { var a = []; for (var i = 0; i < N; i++) a.push('Team ' + (i + 1)); return a; })();

  var SAMPLE_TEAMS = ['Snow Apostles', 'Light Cycles', 'Grid Bugs', 'Recognizers', 'Disc Wars', 'Identity Discs',
    'Clu Crew', "Flynn's Arcade", 'Bit Players', 'MCP Mob', 'Derezzed', 'Encom Eleven'];
  var SAMPLE_SCORES = [
    [[118.4, 102.2], [91.6, 134.8], [77.0, 110.3], [125.9, 99.1], [88.8, 95.5], [140.2, 81.6]],
    [[99.9, 121.4], [108.0, 86.4], [132.7, 115.5], [70.2, 101.8], [93.3, 128.0], [84.5, 97.6]],
    [[111.1, 90.0], [123.6, 104.9], [79.4, 119.2], [96.7, 96.7], [135.5, 88.1], [102.0, 114.4]]
  ];

  function num(v) {
    if (v === '' || v === null || v === undefined) return null;
    var x = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return isFinite(x) ? x : null;
  }

  // A week counts only when every team appears once and every score parses.
  function weekProblem(ms) {
    if (!ms) return 'No scores yet';
    var seen = {}, i;
    for (i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (m.a === m.b) return 'same team twice';
      if (seen[m.a] || seen[m.b]) return 'team in more than one matchup';
      seen[m.a] = seen[m.b] = true;
    }
    for (i = 0; i < ms.length; i++) if (num(ms[i].as) === null || num(ms[i].bs) === null) return 'missing score';
    return null;
  }
  function counted(weeksObj) {
    var out = {};
    Object.keys(weeksObj).forEach(function (k) { if (!weekProblem(weeksObj[k])) out[k] = weeksObj[k]; });
    return out;
  }

  // Terry's Table scoring. Cents as integers so comparisons never hit float noise.
  function compute(teams, weeksObj) {
    var rows = teams.map(function (t, i) { return { i: i, team: t, lp: 0, pts: 0, pa: 0, w: 0, l: 0, t: 0, above: 0, below: 0, tops: 0, wk: {} }; });
    Object.keys(weeksObj).map(Number).sort(function (a, b) { return a - b; }).forEach(function (n) {
      var ms = weeksObj[n], sum = 0, cnt = 0;
      ms.forEach(function (m) { sum += Math.round(num(m.as) * 100) + Math.round(num(m.bs) * 100); cnt += 2; });
      ms.forEach(function (m) {
        [[m.a, num(m.as), num(m.bs)], [m.b, num(m.bs), num(m.as)]].forEach(function (p) {
          var r = rows[p[0]], mine = Math.round(p[1] * 100), theirs = Math.round(p[2] * 100);
          var win = mine > theirs ? 2 : (mine === theirs ? 1 : 0);
          var ab = mine * cnt > sum ? 1 : 0;
          r.pts += p[1]; r.pa += p[2]; r.lp += win + ab;
          if (mine > theirs) r.w++; else if (mine < theirs) r.l++; else r.t++;
          if (ab) r.above++; else r.below++;
          r.wk[n] = { pts: p[1], opp: p[2], res: mine > theirs ? 'W' : (mine < theirs ? 'L' : 'T'), ab: !!ab, lp: win + ab, avg: sum / cnt / 100 };
        });
      });
      var mx = -Infinity;
      ms.forEach(function (m) { mx = Math.max(mx, Math.round(num(m.as) * 100), Math.round(num(m.bs) * 100)); });
      rows.forEach(function (r) {
        var x = r.wk[n];
        if (x && Math.round(x.pts * 100) === mx) { x.top = true; r.tops++; }
      });
    });
    rows.sort(function (a, b) { return (b.lp - a.lp) || (b.pts - a.pts); });
    rows.forEach(function (r, k) { r.rank = k + 1; });
    return rows;
  }

  function subset(weeksObj, keys) { var o = {}; keys.forEach(function (k) { o[k] = weeksObj[k]; }); return o; }

  // upTo (optional) limits to the first N finished weeks, used by the season replay.
  function getData(upTo) {
    var done = counted(state.weeks);
    var all = Object.keys(done).map(Number).sort(function (a, b) { return a - b; });
    var d;
    if (all.length) {
      var keys = upTo ? all.slice(0, upTo) : all;
      d = { sample: false, teams: state.teams, weeksObj: subset(done, keys), keys: keys };
    } else {
      var w = {};
      SAMPLE_SCORES.forEach(function (wk, wi) { w[wi + 1] = wk.map(function (s, k) { return { a: k * 2, b: k * 2 + 1, as: s[0], bs: s[1] }; }); });
      var sk = upTo ? [1, 2, 3].slice(0, upTo) : [1, 2, 3];
      d = { sample: true, teams: SAMPLE_TEAMS, weeksObj: subset(w, sk), keys: sk };
    }
    d.rows = compute(d.teams, d.weeksObj);
    if (d.keys.length > 1) {
      var pk = d.keys.slice(0, -1), prev = compute(d.teams, subset(d.weeksObj, pk)), pm = {};
      prev.forEach(function (r) { pm[r.i] = r.rank; });
      d.rows.forEach(function (r) { r.move = pm[r.i] - r.rank; });
    } else d.rows.forEach(function (r) { r.move = null; });
    $('sample').hidden = !d.sample;
    $('sample').textContent = loadFailed ? 'Scores are unavailable right now, so this is example data. It will update when the connection returns.' : 'Example data. The league appears here once the first week is final.';
    return d;
  }

  // Per-team analytics: all-play record, luck, scoring spread.
  function analyze(d) {
    var rows = d.rows;
    rows.forEach(function (r) {
      r.apw = 0; r.apl = 0; r.cum = []; r.scores = [];
      var run = 0;
      d.keys.forEach(function (n) {
        var mine = Math.round(r.wk[n].pts * 100);
        rows.forEach(function (o) {
          if (o === r) return;
          var theirs = Math.round(o.wk[n].pts * 100);
          if (mine > theirs) r.apw += 1; else if (mine < theirs) r.apl += 1; else { r.apw += 0.5; r.apl += 0.5; }
        });
        run += r.wk[n].lp; r.cum.push(run); r.scores.push(r.wk[n].pts);
      });
      var gp = d.keys.length;
      r.apPct = r.apw / (gp * (rows.length - 1));
      r.exp = r.apPct * gp;
      r.actual = r.w + 0.5 * r.t;
      r.luck = r.actual - r.exp;
      r.avg = r.pts / gp;
      r.hi = Math.max.apply(null, r.scores); r.lo = Math.min.apply(null, r.scores);
      var v = 0; r.scores.forEach(function (s) { v += (s - r.avg) * (s - r.avg); });
      r.sd = Math.sqrt(v / gp);
    });
    return rows;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function f2(x) { return x.toFixed(2); }
  function f1(x) { return x.toFixed(1); }
  function half(x) { return x % 1 === 0 ? String(x) : x.toFixed(1); }
  function signed(x, f) { return (x > 0 ? '+' : '') + f(x); }
  function fmtInt(x) { return String(Math.round(x)); }

  // ---- Sortable tables: click or press Enter on any header to sort ----
  function sortKey(td) {
    var t = (td ? td.textContent : '').trim().replace(/[,%$\s]/g, '').replace(/\u2212/g, '-');
    if (t === '' || t === '\u2014') return null;
    return /^[+-]?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : undefined;
  }
  function sortTable(tbl, c, th) {
    var prev = tbl._sort && tbl._sort.c === c ? tbl._sort.dir : null;
    var rows = Array.prototype.slice.call(tbl.rows, 1);
    var nums = rows.filter(function (r) { var k = sortKey(r.cells[c]); return typeof k === 'number'; }).length;
    var isNum = nums > 0 && nums >= rows.length / 2;
    var dir = prev === null ? (isNum ? 'desc' : 'asc') : (prev === 'desc' ? 'asc' : 'desc');
    var sign = dir === 'desc' ? -1 : 1;
    rows.sort(function (a, b) {
      var ka = sortKey(a.cells[c]), kb = sortKey(b.cells[c]);
      if (isNum) {
        if (ka === null || ka === undefined) return (kb === null || kb === undefined) ? 0 : 1;
        if (kb === null || kb === undefined) return -1;
        return sign * (ka - kb);
      }
      return sign * a.cells[c].textContent.trim().localeCompare(b.cells[c].textContent.trim(), undefined, { numeric: true });
    });
    rows.forEach(function (r) { tbl.appendChild(r); });
    tbl._sort = { c: c, dir: dir };
    Array.prototype.forEach.call(tbl.rows[0].cells, function (h) { h.removeAttribute('aria-sort'); h.classList.remove('sorted-asc', 'sorted-desc'); });
    th.setAttribute('aria-sort', dir === 'desc' ? 'descending' : 'ascending');
    th.classList.add(dir === 'desc' ? 'sorted-desc' : 'sorted-asc');
  }
  function makeSortable(tbl) {
    var hr = tbl.rows[0]; if (!hr || tbl._sortable) return;
    tbl._sortable = true;
    Array.prototype.forEach.call(hr.cells, function (th, c) {
      th.classList.add('sortable'); th.tabIndex = 0;
      var go = function () { sortTable(tbl, c, th); };
      th.addEventListener('click', go);
      th.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }
  function fill(tbl, heads, rows) {
    tbl.textContent = ''; tbl._sortable = false; tbl._sort = null;
    var hr = el('tr');
    heads.forEach(function (h) { hr.appendChild(el('th', h[1], h[0])); });
    tbl.appendChild(hr);
    rows.forEach(function (cells) {
      var tr = el('tr');
      cells.forEach(function (c) { tr.appendChild(el('td', c[1], c[0])); });
      tbl.appendChild(tr);
    });
    makeSortable(tbl);
  }

  // ---- Motion helpers ----
  var shown = {};
  function setNum(node, key, to, fmt) {
    var from = key in shown ? shown[key] : 0;
    shown[key] = to;
    if (!ANIM || from === to) { node.textContent = fmt(to); return; }
    var t0 = null, wait = introWait();
    node.textContent = fmt(from);
    function tick(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / 850), e = 1 - Math.pow(1 - p, 3);
      node.textContent = fmt(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(tick); else node.textContent = fmt(to);
    }
    if (wait > 0) setTimeout(function () { requestAnimationFrame(tick); }, wait); else requestAnimationFrame(tick);
  }
  function snapshot() {
    var m = {};
    document.querySelectorAll('#t tr[data-i], #cards .card[data-i]').forEach(function (e) {
      var r = e.getBoundingClientRect();
      if (r.height) m[e.tagName + e.getAttribute('data-i')] = r.top;
    });
    return m;
  }
  // FLIP: rows slide from their old position to the new one. First view: rows enter in a stagger.
  function motion(snap, first) {
    if (!ANIM) return;
    var idx = 0;
    document.querySelectorAll('#t tr[data-i], #cards .card[data-i]').forEach(function (e) {
      var r = e.getBoundingClientRect();
      if (!r.height) return;
      var key = e.tagName + e.getAttribute('data-i');
      if (key in snap) {
        var dy = snap[key] - r.top;
        if (Math.abs(dy) > 1) e.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 800, easing: 'cubic-bezier(.2,.8,.2,1)' });
      } else if (first) {
        e.animate([{ opacity: 0, transform: 'translateX(-46px)' }, { opacity: 1, transform: 'none' }],
          { duration: 600, delay: introWait() + Math.min(idx, 14) * 55, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
      }
      idx++;
    });
  }

  function spark(r, keys, mn, mx, draw) {
    var W = 92, H = 28, P = 4, n = keys.length, span = (mx - mn) || 1;
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'sp' + (draw ? ' draw' : ''), role: 'img' });
    if (draw) svg.style.setProperty('--sd', (introWait() / 1000 + 0.9).toFixed(2) + 's');
    var pts = keys.map(function (k, i) {
      return [n === 1 ? W / 2 : P + i * (W - 2 * P) / (n - 1), H - P - (r.wk[k].pts - mn) / span * (H - 2 * P)];
    });
    if (n > 1) svg.appendChild(sv('polyline', { points: pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '), 'class': 'sp-l', pathLength: '1' }));
    pts.forEach(function (p, i) { svg.appendChild(sv('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: 2.8, 'class': r.wk[keys[i]].ab ? 'sp-d on' : 'sp-d' })); });
    var tt = sv('title', {}); tt.textContent = 'Weekly scores: ' + keys.map(function (k) { return 'Wk ' + k + ' ' + f1(r.wk[k].pts); }).join(', ') + '. Filled dots beat the league average.';
    svg.appendChild(tt);
    return svg;
  }

  function moveBadge(r) {
    var s = el('span', 'mvt');
    if (r.move === null || r.move === undefined) { s.textContent = ''; return s; }
    if (r.move > 0) { s.className = 'mvt up'; s.textContent = '▲ ' + r.move; }
    else if (r.move < 0) { s.className = 'mvt dn'; s.textContent = '▼ ' + Math.abs(r.move); }
    else s.textContent = '–';
    return s;
  }

  // ---- Standings ----
  function pbaseRows(kk, d) {
    if (!HW || !Object.keys(HW).length) return null;
    var all = [];
    Object.keys(HW).sort().forEach(function (y) {
      var ms = Object.keys(HW[y]), arr = ms.map(function (m) {
        var lp = 0, lpk = 0, pf = 0;
        for (var k = 0; k < 14; k++) { lp += HW[y][m].lp[k]; if (k < kk) lpk += HW[y][m].lp[k]; pf += HW[y][m].p[k]; }
        return { lp: lp, lpk: lpk, pf: pf };
      });
      arr.sort(function (a, b) { return (b.lp - a.lp) || (b.pf - a.pf); });
      arr.forEach(function (r, k) { r.rank = k + 1; all.push(r); });
    });
    return d.rows.map(function (r) {
      var cmp = all.filter(function (x) { return Math.abs(x.lpk - r.lp) <= 1; }), po = 0, by = 0;
      cmp.forEach(function (x) { if (x.rank <= 6) po++; if (x.rank <= 2) by++; });
      return { team: r.team, lp: r.lp, n: cmp.length, po: cmp.length ? po / cmp.length : null, by: cmp.length ? by / cmp.length : null };
    });
  }
  function renderTable(upTo) {
    var d = getData(upTo), rows = d.rows, keys = d.keys;
    lastD = d;
    var snap = snapshot(), first = !entered;
    var smn = Infinity, smx = -Infinity;
    rows.forEach(function (r) { keys.forEach(function (n) { smn = Math.min(smn, r.wk[n].pts); smx = Math.max(smx, r.wk[n].pts); }); });
    var open = [];
    var allDone = counted(state.weeks);
    for (var w = 1; w <= WEEKS; w++) if (!allDone[w] && state.weeks[w] && !d.sample) open.push(w);
    $('tmeta').textContent = (d.sample ? 'Weeks shown: ' + keys.join(', ') + ' (example)' : 'Weeks counted: ' + keys.join(', ')) +
      (open.length && !upTo ? '. Not counted yet: ' + open.join(', ') + '.' : '');
    $('replay').hidden = replaying ? false : (d.keys.length < 2 || d.sample);

    var t = $('t');
    t.className = showWeeks ? 'show' : '';
    t.textContent = ''; t._sortable = false; t._sort = null;
    var hr = el('tr');
    var heads = [['Rank', 'c1'], ['Team', 'l c2'], ['League Pts', ''], ['Fantasy Pts', ''], ['Form', ''], ['W', ''], ['L', ''], ['Wks Above Avg', ''], ['Top Scorer Wks', '']];
    heads.forEach(function (h) { hr.appendChild(el('th', h[1], h[0])); });
    keys.forEach(function (n) {
      hr.appendChild(el('th', 'wk', 'Wk ' + n + ' Pts'));
      hr.appendChild(el('th', 'wk', 'Wk ' + n + ' W/L'));
      hr.appendChild(el('th', 'wk', 'Wk ' + n + ' LP'));
    });
    t.appendChild(hr);
    var cards = $('cards'); cards.textContent = '';
    rows.forEach(function (r) {
      var seed = r.rank <= 2 ? ' s-bye' : (r.rank <= 6 ? ' s-in' : ' out');
      var tr = el('tr', (seed + (r.rank === 6 ? ' cut' : '')).trim());
      tr.setAttribute('data-i', String(r.i));
      var tdRank = el('td', 'c1');
      tdRank.appendChild(el('span', 'rk', String(r.rank)));
      tdRank.appendChild(moveBadge(r));
      tr.appendChild(tdRank);
      var tdTeam = el('td', 'l c2 team', r.team);
      if (r.rank <= 2) tdTeam.appendChild(el('span', 'bye', 'Bye'));
      var tcb = clinchBadge(r.i); if (tcb) tdTeam.appendChild(tcb);
      tr.appendChild(tdTeam);
      var tdLp = el('td', 'lp'); setNum(tdLp, 'lp' + r.i, r.lp, fmtInt); tr.appendChild(tdLp);
      var tdPf = el('td', 'pf'); setNum(tdPf, 'pf' + r.i, r.pts, f2); tr.appendChild(tdPf);
      var tdF = el('td', 'sp-td'); tdF.appendChild(spark(r, keys, smn, smx, first)); tr.appendChild(tdF);
      tr.appendChild(el('td', '', String(r.w) + (r.t ? '+' + r.t + 'T' : '')));
      tr.appendChild(el('td', '', String(r.l)));
      tr.appendChild(el('td', '', String(r.above)));
      tr.appendChild(el('td', '', String(r.tops)));
      keys.forEach(function (n) {
        var x = r.wk[n];
        tr.appendChild(el('td', 'wk' + (x && x.ab ? ' hi' : '') + (x && x.top ? ' topc' : ''), x ? f2(x.pts) : ''));
        tr.appendChild(el('td', 'wk', x ? x.res : ''));
        tr.appendChild(el('td', 'wk', x ? String(x.lp) : ''));
      });
      t.appendChild(tr);

      var c = el('details', 'card' + seed + (r.rank === 6 ? ' cut' : ''));
      c.setAttribute('data-i', String(r.i));
      var s = el('summary');
      var cr = el('span', 'cr'); cr.appendChild(el('span', 'rk', String(r.rank))); cr.appendChild(moveBadge(r)); s.appendChild(cr);
      var nm = el('span', 'cn', r.team);
      if (r.rank <= 2) nm.appendChild(el('span', 'bye', 'Bye'));
      var ccb = clinchBadge(r.i); if (ccb) nm.appendChild(ccb);
      nm.appendChild(el('span', 'cs', r.w + '-' + r.l + (r.t ? '-' + r.t : '') + '  ·  ' + f2(r.pts) + ' pts for'));
      s.appendChild(nm);
      var lp = el('span', 'cl'); setNum(lp, 'clp' + r.i, r.lp, fmtInt); lp.appendChild(el('small', '', 'League pts'));
      s.appendChild(lp);
      c.appendChild(s);
      var body = el('div', 'cb');
      var fm = el('div', 'cform'); fm.appendChild(el('span', '', 'Form')); fm.appendChild(spark(r, keys, smn, smx, false)); body.appendChild(fm);
      keys.forEach(function (n) {
        var x = r.wk[n], line = el('div');
        line.appendChild(el('span', '', 'Wk ' + n + '  ' + f2(x.pts) + (x.top ? '  top scorer' : '')));
        line.appendChild(el('span', x.ab ? 'ab' : '', x.res + '  ' + x.lp + ' pts' + (x.ab ? '  above avg' : '')));
        body.appendChild(line);
      });
      var pb = el('button', 'btn', 'Team profile'); pb.type = 'button'; pb.style.marginTop = '10px';
      pb.addEventListener('click', function () { openTeam(r.i); });
      body.appendChild(pb);
      c.appendChild(body);
      cards.appendChild(c);
    });
    motion(snap, first);
    makeSortable(t);
    if (loaded) entered = true;
  }

  // ---- Playoff picture ----
  function plate(r, cls, d, i, line1, line2) {
    var p = el('div', 'plate ' + cls); p.setAttribute('data-ti', String(r.i));
    p.style.setProperty('--d', (i * 0.06) + 's');
    p.appendChild(el('div', 'sd', String(r.rank)));
    var mid = el('div');
    var pnm = el('div', 'pn', r.team), cb = clinchBadge(r.i); if (cb) pnm.appendChild(cb);
    mid.appendChild(pnm);
    mid.appendChild(el('div', 'pg', line1));
    p.appendChild(mid);
    var pl = el('div', 'pl', String(r.lp)); pl.appendChild(el('small', '', line2));
    p.appendChild(pl);
    return p;
  }
  function gapText(r, ref, above) {
    var diff = r.lp - ref.lp;
    if (above) {
      if (diff > 0) return diff + (diff === 1 ? ' pt' : ' pts') + ' clear of 7th';
      return r.pts > ref.pts ? 'Level with 7th, ahead on points' : 'Level with 7th, behind on points';
    }
    if (diff < 0) return Math.abs(diff) + (diff === -1 ? ' pt' : ' pts') + ' behind 6th';
    return r.pts > ref.pts ? 'Level with 6th, ahead on points' : 'Level with 6th, behind on points';
  }
  function renderPlayoffs() {
    var d = getData(), rows = d.rows, box = $('picture');
    $('pmeta').textContent = (d.sample ? 'Example data. ' : '') + 'After week ' + d.keys[d.keys.length - 1] + '. Ties on League Points are broken by Fantasy Points.';
    box.textContent = '';
    var r6 = rows[5], r7 = rows[6], k = 0;
    function tier(title, cls, list, fn) {
      var wrap = el('div', 'tier'); wrap.appendChild(el('h3', 'tier-h', title));
      var g = el('div', 'plates');
      list.forEach(function (r) { g.appendChild(fn(r, k++)); });
      wrap.appendChild(g); box.appendChild(wrap);
    }
    tier('First-round bye', 'p-bye', rows.slice(0, 2), function (r, i) { return plate(r, 'p-bye', d, i, gapText(r, r7, true), 'League pts'); });
    tier('In the playoffs', 'p-in', rows.slice(2, 6), function (r, i) { return plate(r, 'p-in', d, i, gapText(r, r7, true), 'League pts'); });
    box.appendChild(el('div', 'cutline', 'Playoff cutoff'));
    tier('On the bubble', 'p-bub', rows.slice(6, 8), function (r, i) { return plate(r, 'p-bub', d, i, gapText(r, r6, false), 'League pts'); });
    tier('Outside', 'p-out', rows.slice(8), function (r, i) { return plate(r, 'p-out', d, i, gapText(r, r6, false), 'League pts'); });
    if (!d.sample && d.keys.length) renderBracket(box, d);
  }
  // If the season ended today: byes and first-round games, with this season's meeting if there was one.
  function renderBracket(box, d) {
    var rows = d.rows, wrap = el('div', 'tier brk');
    wrap.appendChild(el('h3', 'tier-h', 'If the season ended today'));
    function met(a, b) {
      var out = [];
      d.keys.forEach(function (n) {
        (d.weeksObj[n] || []).forEach(function (m) {
          if ((m.a === a.i && m.b === b.i) || (m.a === b.i && m.b === a.i)) {
            var sa = m.a === a.i ? num(m.as) : num(m.bs), sb = m.a === a.i ? num(m.bs) : num(m.as);
            out.push('Week ' + n + ': ' + (sa > sb ? a.team : b.team) + ' won ' + f2(Math.max(sa, sb)) + ' to ' + f2(Math.min(sa, sb)));
          }
        });
      });
      return out.length ? out.join('. ') + '.' : 'Have not met this season.';
    }
    var g = el('div', 'brk-g');
    [[rows[2], rows[5]], [rows[3], rows[4]]].forEach(function (p) {
      var c = el('div', 'brk-m');
      c.appendChild(el('div', 'brk-t', '#' + p[0].rank + ' ' + p[0].team));
      c.appendChild(el('div', 'brk-v', 'vs'));
      c.appendChild(el('div', 'brk-t', '#' + p[1].rank + ' ' + p[1].team));
      c.appendChild(el('div', 'brk-h', met(p[0], p[1])));
      g.appendChild(c);
    });
    wrap.appendChild(g);
    wrap.appendChild(el('p', 'meta keep', 'Byes: #1 ' + rows[0].team + ' and #2 ' + rows[1].team + '. They meet the first-round winners in the semifinals.'));
    box.appendChild(wrap);
  }

  // ---- Matchup scorebugs ----
  function weekChips(box, keys, cur, onPick) {
    box.textContent = '';
    keys.forEach(function (n) {
      var b = el('button', 'chip', 'Wk ' + n); b.type = 'button';
      b.setAttribute('aria-pressed', String(n === cur));
      b.addEventListener('click', function () { onPick(n); });
      box.appendChild(b);
    });
  }
  function renderMatchups() {
    var d = getData();
    if (mWeek === null || d.keys.indexOf(mWeek) < 0) mWeek = d.keys[d.keys.length - 1];
    weekChips($('mchips'), d.keys, mWeek, function (n) { mWeek = n; renderMatchups(); renderTotw(); });
    var ms = d.weeksObj[mWeek], mx = -Infinity;
    ms.forEach(function (m) { mx = Math.max(mx, Math.round(num(m.as) * 100), Math.round(num(m.bs) * 100)); });
    var avg = d.rows[0].wk[mWeek].avg;
    $('mmeta').textContent = (d.sample ? 'Example data. ' : '') + 'Week ' + mWeek + ' final. League average ' + f2(avg) + '.';
    var box = $('bugs'); box.textContent = '';
    ms.forEach(function (m, k) {
      var bug = el('div', 'bug'); bug.style.setProperty('--d', (k * 0.07) + 's');
      var a = Math.round(num(m.as) * 100), b = Math.round(num(m.bs) * 100);
      [[m.a, num(m.as), a > b], [m.b, num(m.bs), b > a]].forEach(function (s) {
        var row = el('div', 'bug-r' + (s[2] ? ' w' : ''));
        row.appendChild(el('div', 'bn', d.teams[s[0]]));
        row.appendChild(el('div', 'bs', f2(s[1])));
        bug.appendChild(row);
      });
      var f = el('div', 'bug-f');
      f.appendChild(el('span', '', a === b ? 'Tie game' : 'Won by ' + f2(Math.abs(a - b) / 100)));
      var topNames = [];
      if (a === mx) topNames.push(d.teams[m.a]);
      if (b === mx) topNames.push(d.teams[m.b]);
      if (topNames.length) f.appendChild(el('span', '', 'Top score of the week'));
      bug.appendChild(f);
      box.appendChild(bug);
    });
  }

  // ---- Up next: the coming week's games and what each result does to playoff odds ----
  function renderNext() {
    var host = $('x-next'); if (!host) return;
    var x = luReady(host); if (!x) return;
    var o = null; try { o = getOutlook(x); } catch (e) { o = null; }
    if (!o || !o.sim) { host.appendChild(el('p', 'cap', 'Odds are not available yet.')); return; }
    var s = o.sim, wk = s.start, d = x.d, N2 = s.N;
    if (wk > WEEKS) { host.appendChild(el('p', 'cap', 'The regular season is complete.')); return; }
    var games = fullSched()[String(wk)];
    if (!games || !games.length) { host.appendChild(el('p', 'cap', 'The Week ' + wk + ' schedule is not loaded yet.')); return; }
    var byI = {}; d.rows.forEach(function (r) { byI[r.i] = r; });
    function odds(i) { var c = 0; s.pos[i].forEach(function (v, k) { if (k < 6) c += v; }); return c / N2; }
    function split(i) {
      var wn = 0, wi = 0, ln = 0, li = 0, g = s.g1[i], ip = s.inP[i];
      for (var q = 0; q < N2; q++) { if (g[q] >= 2) { wn++; wi += ip[q]; } else { ln++; li += ip[q]; } }
      return { pw: wn / N2, win: wn > 40 ? wi / wn : null, loss: ln > 40 ? li / ln : null };
    }
    function sw(sp) { return sp.win !== null && sp.loss !== null ? sp.win - sp.loss : 0; }
    var cards = games.map(function (g) {
      var sa = split(g[0]), sb = split(g[1]);
      return { A: byI[g[0]], B: byI[g[1]], sa: sa, sb: sb, swing: sw(sa) + sw(sb) };
    });
    cards.sort(function (a, b) { return b.swing - a.swing; });
    var best = cards[0];
    host.appendChild(el('p', 'cap keep', 'Week ' + wk + '. The big number is the chance to win, from the season model. The line below shows playoff odds now, after a win (W) and after a loss (L).'));
    var box = el('div', 'nextgrid');
    cards.forEach(function (c) {
      var gotw = c === best && c.swing > 0.05, card = el('div', 'nx' + (gotw ? ' gotw' : ''));
      if (gotw) card.appendChild(el('div', 'nx-tag', 'Game of the week: biggest playoff swing'));
      [[c.A, c.sa], [c.B, c.sb]].forEach(function (t) {
        var r = t[0], sp = t[1], row = el('div', 'nx-r');
        var nm = el('div', 'nx-n'); nm.appendChild(el('span', 'nx-t', r.team));
        nm.appendChild(el('small', '', '#' + r.rank + '  ·  ' + r.w + '-' + r.l + '  ·  ' + r.lp + ' LP'));
        row.appendChild(nm);
        var pw = el('div', 'nx-p', Math.round(sp.pw * 100) + '%'); pw.appendChild(el('small', '', 'to win')); row.appendChild(pw);
        var od = el('div', 'nx-o');
        od.appendChild(el('span', '', 'Playoffs ' + pctText(odds(r.i))));
        if (sp.win !== null && sp.loss !== null && Math.abs(sp.win - sp.loss) >= 0.005) {
          od.appendChild(el('span', 'pos', 'W ' + pctText(sp.win)));
          od.appendChild(el('span', 'neg', 'L ' + pctText(sp.loss)));
        }
        row.appendChild(od);
        card.appendChild(row);
      });
      box.appendChild(card);
    });
    host.appendChild(box);
  }

  // ---- Team of the week: the best lineup that could be built from every starter that week ----
  function renderTotw() {
    var host = $('x-totw'); if (!host) return;
    var x = luReady(host); if (!x) return;
    var d = x.d, n = mWeek !== null && x.keys.indexOf(mWeek) >= 0 ? mWeek : x.keys[x.keys.length - 1];
    var ps = starters(x).filter(function (p) { return p.n === n; }).sort(function (a, b) { return b.pts - a.pts; });
    var used = {}, pick = [], tot = 0;
    function take(slot, ok, cnt) {
      ps.forEach(function (p) {
        var k = p.name + '|' + p.t;
        if (cnt > 0 && !used[k] && ok(p.pos)) { used[k] = 1; pick.push([slot, p]); tot += p.pts; cnt--; }
      });
    }
    take('QB', function (q) { return q === 'QB'; }, 1);
    take('RB', function (q) { return q === 'RB'; }, 2);
    take('WR', function (q) { return q === 'WR'; }, 2);
    take('TE', function (q) { return q === 'TE'; }, 1);
    take('FLEX', function (q) { return q === 'RB' || q === 'WR' || q === 'TE'; }, 2);
    var topTeam = d.rows.slice().sort(function (a, b) { return b.wk[n].pts - a.wk[n].pts; })[0];
    var by = {}; pick.forEach(function (q) { by[q[1].t] = (by[q[1].t] || 0) + 1; });
    var most = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; })[0];
    host.appendChild(el('p', 'cap keep', 'Week ' + n + '. The best lineup anyone could have built from the league\'s starters scored ' + f2(tot) + ', against ' + f2(topTeam.wk[n].pts) + ' for the week\'s top team (' + topTeam.team + '). ' + d.teams[most] + ' supplied the most picks (' + by[most] + ').'));
    put(host, [['Slot', 'l'], ['Player', 'l'], ['Fantasy team', 'l'], ['Pts', '']],
      pick.map(function (q) { return [[q[0], 'l'], [q[1].name, 'l team'], [d.teams[q[1].t], 'l'], [f2(q[1].pts), 'pos']]; }));
  }

  // ---- SVG helpers ----
  var NS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function niceTicks(min, max) {
    var span = (max - min) || 1, raw = span / 4, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), norm = raw / mag;
    var step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, t = [];
    for (var v = lo; v <= hi + step / 2; v += step) t.push(Math.round(v * 1000) / 1000);
    return t;
  }
  // ---- Lineup analytics (starters only, from /api/lineups) ----
  var LU = null, luSig = '';

  // Animated bar list. rows: {t, v, txt, sub, v2, cls}. opts: {max, div, sorts:[[label, fn(a,b)]], key2}
  function barList(host, rows, opts) {
    opts = opts || {};
    var wrap = el('div'), list = el('div', 'bl'), cur = 0;
    var mx = opts.max || Math.max.apply(null, rows.map(function (r) { return Math.abs(r.v); }).concat([0.0001]));
    function draw() {
      list.textContent = '';
      var arr = rows.slice();
      if (opts.sorts && opts.sorts[cur]) arr.sort(opts.sorts[cur][1]);
      var made = [];
      arr.forEach(function (r, k) {
        var row = el('div', 'blr'), nm = el('div', 'nm tl', r.t);
        if (r.ti !== undefined) row.setAttribute('data-ti', String(r.ti));
        if (r.sub) nm.appendChild(el('small', '', r.sub));
        var tr = el('div', 'tr' + (opts.div ? ' div' : '')), f = el('i', r.v < 0 ? 'neg' : '');
        tr.appendChild(f);
        if (opts.div) tr.appendChild(el('span', 'zero'));
        var f2n = null;
        if (r.v2 !== undefined && r.v2 !== null) { f2n = el('i', 'b2'); tr.appendChild(f2n); }
        var v = el('div', 'v' + (r.cls ? ' ' + r.cls : ''), r.txt);
        row.appendChild(nm); row.appendChild(tr); row.appendChild(v); list.appendChild(row);
        made.push([f, f2n, r, k]);
      });
      function go() {
        made.forEach(function (m) {
          var f = m[0], r = m[2], w = opts.div ? Math.abs(r.v) / mx * 50 : Math.max(0, r.v) / mx * 100;
          f.style.transitionDelay = (m[3] * 35) + 'ms'; f.style.width = Math.min(100, w).toFixed(1) + '%';
          if (m[1]) { m[1].style.transitionDelay = (m[3] * 35) + 'ms'; m[1].style.width = Math.min(100, Math.max(0, r.v2) / mx * 100).toFixed(1) + '%'; }
        });
      }
      if (ANIM) onView(list, go); else go();
    }
    if (opts.sorts && opts.sorts.length > 1) {
      var tabs = el('div', 'bl-tabs');
      opts.sorts.forEach(function (sx, k) {
        var b = el('button', '', sx[0]); b.type = 'button'; b.setAttribute('aria-pressed', String(k === 0));
        b.addEventListener('click', function () { cur = k; Array.prototype.forEach.call(tabs.children, function (c, j) { c.setAttribute('aria-pressed', String(j === k)); }); draw(); });
        tabs.appendChild(b);
      });
      wrap.appendChild(tabs);
    }
    if (opts.key2) { var kd = el('div', 'bl-key'); var kk = el('span'); kk.appendChild(el('b')); kk.appendChild(document.createTextNode(opts.key2)); kd.appendChild(kk); wrap.appendChild(kd); }
    wrap.appendChild(list); host.appendChild(wrap); draw();
  }
  function put(host, heads, rows) {
    var w = el('div', 'scroll'), t = el('table');
    fill(t, heads, rows); w.appendChild(t); host.appendChild(w);
    return t;
  }
  function sec(host, title, first) {
    var h = el('div', 'ph', title);
    if (!first) h.style.marginTop = '24px';
    host.appendChild(h);
  }
  function luReady(host) {
    host.textContent = '';
    var d = getData(), keys = [];
    if (!d.sample && LU) keys = d.keys.filter(function (n) { return LU[n]; });
    if (!keys.length) {
      host.appendChild(el('p', 'cap', d.sample ? 'Lineup analytics appear once real weeks are loaded.' : 'Lineup data is not available yet.'));
      return null;
    }
    return { d: d, keys: keys };
  }
  function projOf(n, i) { var s = 0; LU[n][i].forEach(function (p) { s += p.proj; }); return s; }
  function starters(x) {
    var all = [];
    x.keys.forEach(function (n) {
      x.d.rows.forEach(function (r) {
        LU[n][r.i].forEach(function (p) {
          all.push({ t: r.i, nfl: p.t, n: n, name: p.p, s: p.s, pos: p.pos || p.s, proj: p.proj, pts: p.pts, f: p.f || '' });
        });
      });
    });
    return all;
  }

  function renderPlayers() {
    var host = $('x-players'), x = luReady(host); if (!x) return;
    var d = x.d, all = starters(x);
    sec(host, 'Team MVP and star dependence', true);
    var mv = d.rows.map(function (r) {
      var by = {};
      all.filter(function (p) { return p.t === r.i; }).forEach(function (p) { by[p.name] = (by[p.name] || 0) + p.pts; });
      var best = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; })[0];
      return { team: r.team, name: best, pts: by[best], share: by[best] / r.pts };
    });
    mv.sort(function (a, b) { return b.share - a.share; });
    put(host, [['Team', 'l c0'], ['Top Player', 'l'], ['Pts', ''], ['Share of Team Pts', '']],
      mv.map(function (m) { return [[m.team, 'l c0 team'], [m.name, 'l'], [f2(m.pts), ''], [(m.share * 100).toFixed(0) + '%', '']]; }));
    sec(host, 'Best single-week starters');
    var top = all.slice().sort(function (a, b) { return b.pts - a.pts; }).slice(0, 10);
    put(host, [['Player', 'l'], ['Team', 'l'], ['Wk', ''], ['Pts', '']],
      top.map(function (p) { return [[p.name, 'l team'], [d.teams[p.t], 'l'], [String(p.n), ''], [f2(p.pts), '']]; }));
    sec(host, 'Biggest busts (projected 10 or more)');
    var bust = all.filter(function (p) { return p.proj >= 10; })
      .sort(function (a, b) { return (a.pts - a.proj) - (b.pts - b.proj); }).slice(0, 10);
    put(host, [['Player', 'l'], ['Team', 'l'], ['Wk', ''], ['Proj', ''], ['Pts', ''], ['Diff', '']],
      bust.map(function (p) { return [[p.name, 'l team'], [d.teams[p.t], 'l'], [String(p.n), ''], [f2(p.proj), ''], [f2(p.pts), ''], [signed(p.pts - p.proj, f2), 'neg']]; }));
    sec(host, 'Dead starters');
    var dead = d.rows.map(function (r) {
      var mine = all.filter(function (p) { return p.t === r.i; });
      return { team: r.team, dead: mine.filter(function (p) { return p.pts < 2; }).length, n: mine.length };
    });
    dead.sort(function (a, b) { return b.dead - a.dead; });
    put(host, [['Team', 'l c0'], ['Starters Under 2 Pts', ''], ['Of Starters', '']],
      dead.map(function (t) { return [[t.team, 'l c0 team'], [String(t.dead), t.dead ? 'neg' : ''], [String(t.n), '']]; }));
    hotCold(host, all, d);
  }

  function weekAwards(x, n) {
    var d = x.d, all = starters(x);
    var ps = all.filter(function (p) { return p.n === n; });
    var topP = ps.slice().sort(function (a, b) { return b.pts - a.pts; })[0];
    var bustP = ps.filter(function (p) { return p.proj >= 10; })
      .sort(function (a, b) { return (a.pts - a.proj) - (b.pts - b.proj); })[0];
    var ms = d.weeksObj[n].map(function (m) {
      var sa = num(m.as), sb = num(m.bs), wa = sa > sb;
      return { w: wa ? m.a : m.b, l: wa ? m.b : m.a, ws: wa ? sa : sb, ls: wa ? sb : sa, mg: Math.abs(sa - sb) };
    }).filter(function (m) { return m.mg > 0; });
    var items = [];
    if (topP) items.push(['Top starter', topP.name + ' (' + d.teams[topP.t] + ')', f2(topP.pts)]);
    if (bustP) items.push(['Bust', bustP.name + ' (' + d.teams[bustP.t] + ')', f2(bustP.pts) + ' vs ' + f2(bustP.proj) + ' proj']);
    if (ms.length) {
      var luck = ms.slice().sort(function (a, b) { return a.ws - b.ws; })[0];
      var unl = ms.slice().sort(function (a, b) { return b.ls - a.ls; })[0];
      items.push(['Lucky win', d.teams[luck.w] + ' beat ' + d.teams[luck.l], f2(luck.ws)]);
      items.push(['Unlucky loss', d.teams[unl.l] + ' lost to ' + d.teams[unl.w], f2(unl.ls)]);
    }
    return items;
  }
  function renderHighlights() {
    var host = $('x-highlights'), x = luReady(host); if (!x) return;
    var n = x.keys[x.keys.length - 1];
    sec(host, 'Week ' + n + ' highlights', true);
    var box = el('div', 'matchups');
    weekAwards(x, n).forEach(function (it) {
      var row = el('div', 'prizeitem');
      var pw = el('span', 'pw', it[0]); pw.style.minWidth = '6.4rem';
      row.appendChild(pw); row.appendChild(el('span', 'pn', it[1])); row.appendChild(el('span', 'ps', it[2]));
      box.appendChild(row);
    });
    host.appendChild(box);
  }

  // ---- Outlook, odds, power (starters only; next week and schedule from /api/upcoming) ----
  var CL = null;
  // Exact clinch flags from tools/clinch.py; ignored if they were computed for an older week.
  function clinchOf(i) {
    if (!CL) return null;
    var d = getData(); if (d.sample || !d.keys.length || CL.after_week !== Math.max.apply(null, d.keys.map(Number))) return null;
    return CL.teams[String(i)] || null;
  }
  function clinchBadge(i) {
    var c = clinchOf(i); if (!c) return null;
    if (c.po === 'eliminated') return el('span', 'cbadge out', 'Eliminated');
    if (c.bye === 'clinched') return el('span', 'cbadge bye', 'Bye clinched');
    if (c.po === 'clinched') return el('span', 'cbadge in', 'Clinched');
    return null;
  }
  var UP = null, OUT = null, REPL = 10, pSel = null, upSig = '';
  var LUTABS = ['table', 'matchups', 'playoffs'];
  function mean(a) { var s = 0; a.forEach(function (v) { s += v; }); return a.length ? s / a.length : 0; }
  function f0(x) { return x.toFixed(0); }
  function phi(z) {
    var t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
    return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
  }
  function mulberry32(a) {
    return function () {
      var t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function gauss(r) { var u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function pctile(sorted, p) { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))]; }
  function shortName(s, n) { return s.length > n ? s.slice(0, n - 1) + '.' : s; }
  function pctText(p) { return p < 0.005 ? '<1%' : (p > 0.995 ? '>99%' : Math.round(p * 100) + '%'); }

  function histOf(x) {
    var H = { ks: x.keys, act: {}, proj: {} };
    x.d.rows.forEach(function (r) {
      H.act[r.i] = x.keys.map(function (n) { return r.wk[n].pts; });
      H.proj[r.i] = x.keys.map(function (n) { var s = 0; LU[n][r.i].forEach(function (q) { s += q.proj >= 1 ? q.proj : REPL; }); return s; });
    });
    return H;
  }

  // k is the weight given to a team's habit of beating or missing its projection (empirical Bayes: 0 means it looks like luck).
  function fitModel(H, m) {
    var ids = Object.keys(H.act), bias = {}, means = [], within = 0, ss = 0, cnt = 0;
    ids.forEach(function (i) {
      var r = [], j; for (j = 0; j < m; j++) r.push(H.act[i][j] - H.proj[i][j]);
      var mu = mean(r); bias[i] = mu; means.push(mu);
      r.forEach(function (v) { ss += v * v; cnt++; });
      if (m > 1) { var q = 0; r.forEach(function (v) { q += (v - mu) * (v - mu); }); within += q / (m - 1); }
    });
    var k = 0;
    if (m > 1) {
      within /= ids.length;
      var mm = mean(means), v = 0; means.forEach(function (u) { v += (u - mm) * (u - mm); }); v /= (ids.length - 1);
      var tau2 = Math.max(v - within / m, 0);
      k = tau2 > 0 ? tau2 / (tau2 + within / m) : 0;
    }
    return { k: k, sigma: Math.sqrt(ss / cnt), bias: bias };
  }

  function fillOf(rows) {
    var s = 0, holes = 0, left = 0;
    rows.forEach(function (p) {
      if (p.act !== undefined) { s += p.act; return; }
      var v = p.proj >= 1 ? p.proj : REPL;
      if (p.proj < 1) holes++;
      s += v; left += v;
    });
    return { proj: s, holes: holes, rem: s > 0 ? (left > 0 ? Math.min(1, Math.max(0.04, left / s)) : 0) : 1 };
  }

  function backtest(H) {
    var m = H.ks.length, out = { n: 0, y: 0, a: 0, b: 0 }, j;
    for (j = 2; j < m; j++) {
      var fm = fitModel(H, j);
      Object.keys(H.act).forEach(function (i) {
        var act = H.act[i][j], y = H.proj[i][j], adj = y + fm.k * fm.bias[i], ws = 0, sw = 0;
        H.act[i].slice(0, j).forEach(function (v, q) { ws += (q + 1) * v; sw += q + 1; });
        out.y += Math.abs(act - y); out.a += Math.abs(act - adj); out.b += Math.abs(act - (0.65 * adj + 0.35 * ws / sw)); out.n++;
      });
    }
    if (out.n) { out.y /= out.n; out.a /= out.n; out.b /= out.n; }
    return out;
  }

  var WADJ = 0.5; // share of Yahoo's week-to-week projection swing applied to future weeks
  var TEAM_SD = 5; // season-long error in each team strength, added to every remaining week mean. Widens the tails so long shots are not undersold.
  function simulate(x, o) {
    var N = o.simN || 5000, ids = o.ids, T = ids.length, sigma = o.fm.sigma, r = mulberry32(20261006);
    var start = Math.max.apply(null, x.d.keys) + 1, cur = {}, sched = fullSched();
    x.d.rows.forEach(function (q) { cur[q.i] = { lp: q.lp, pts: q.pts }; });
    var res = { N: N, start: start, pos: {}, lp: {}, cut6: [], cut2: [], g1: {}, inP: {} };
    ids.forEach(function (i) { res.g1[i] = new Int8Array(N); res.inP[i] = new Uint8Array(N); });
    ids.forEach(function (i) { res.pos[i] = []; for (var k = 0; k < T; k++) res.pos[i].push(0); res.lp[i] = []; });
    for (var s = 0; s < N; s++) {
      var lp = {}, pts = {}, off = {};
      var base = {};
      ids.forEach(function (i) { lp[i] = cur[i].lp; pts[i] = cur[i].pts; base[i] = lp[i]; off[i] = TEAM_SD * gauss(r); });
      for (var w = start; w <= WEEKS; w++) {
        var sc = {}, tot = 0;
        ids.forEach(function (i) {
          var mu = (o.up && w === o.up.week && o.f5[i] !== undefined) ? o.f5[i] : o.mu[i] + (o.wadj && o.wadj[w] ? o.wadj[w][i] || 0 : 0);
          var rm = (o.up && w === o.up.week && o.fill[i]) ? Math.sqrt(o.fill[i].rem) : 1;
          sc[i] = mu + off[i] + sigma * rm * gauss(r); tot += sc[i];
        });
        var avg = tot / T, pairs = sched[w], q;
        if (!pairs) {
          var sh = ids.slice();
          for (q = sh.length - 1; q > 0; q--) { var z = Math.floor(r() * (q + 1)), tmp = sh[q]; sh[q] = sh[z]; sh[z] = tmp; }
          pairs = []; for (q = 0; q < sh.length; q += 2) pairs.push([sh[q], sh[q + 1]]);
        }
        pairs.forEach(function (p) {
          if (sc[p[0]] > sc[p[1]]) lp[p[0]] += 2; else if (sc[p[1]] > sc[p[0]]) lp[p[1]] += 2;
        });
        ids.forEach(function (i) { if (sc[i] > avg) lp[i] += 1; pts[i] += sc[i]; });
        if (w === start) ids.forEach(function (i) { res.g1[i][s] = lp[i] - base[i]; });
      }
      var order = ids.slice().sort(function (a, b) { return (lp[b] - lp[a]) || (pts[b] - pts[a]); });
      order.forEach(function (i, k) { res.pos[i][k]++; res.lp[i].push(lp[i]); if (k < 6) res.inP[i][s] = 1; });
      res.cut6.push(lp[order[5]]); res.cut2.push(lp[order[1]]);
    }
    return res;
  }

  function fullSched() {
    var sc = {}, k;
    Object.keys(state.weeks || {}).forEach(function (n) { sc[n] = (state.weeks[n] || []).map(function (m) { return [m.a, m.b]; }); });
    var us = (UP && UP.schedule) || {};
    for (k in us) sc[k] = us[k];
    return sc;
  }
  function getOutlook(x) {
    var key = x.keys.join(',') + '|' + (UP ? UP.week : '');
    if (OUT && OUT.key === key) return OUT;
    OUT = buildOutlook(x, 5000, key); return OUT;
  }
  function buildOutlook(x, simN, key, noUp) {
    var H = histOf(x), fm = fitModel(H, H.ks.length);
    var o = { simN: simN, key: key, H: H, fm: fm, last: x.keys[x.keys.length - 1], ids: x.d.rows.map(function (r) { return r.i; }), f5: {}, fill: {}, mu: {}, sos: {} };
    o.up = !noUp && UP && UP.lineups && UP.week > Math.max.apply(null, x.d.keys) ? UP : null;
    o.ids.forEach(function (i) {
      var arr = H.proj[i].slice();
      if (o.up && o.up.lineups[i]) { var tt = o.up.tot && o.up.tot[i], f = tt ? { proj: tt[1], holes: 0, rem: tt[1] - tt[0] <= 0.005 ? 0 : Math.min(1, Math.max(0.04, (tt[1] - tt[0]) / tt[1])) } : fillOf(o.up.lineups[i]); o.fill[i] = f; arr.push(f.proj); o.f5[i] = f.proj + fm.k * fm.bias[i]; }
      o.mu[i] = mean(arr) + fm.k * fm.bias[i];
    });
    // Week-by-week shape from Yahoo's long-range team projections (byes, injuries). Each team keeps its own level from the model;
    // half of its deviation from its own average projection is applied, because far-off projections undercount bench fill-ins.
    o.wadj = {};
    var PJ = UP && UP.proj ? UP.proj : null;
    if (PJ) {
      var avgP = {};
      o.ids.forEach(function (i) { var v = []; Object.keys(PJ).forEach(function (w) { if (PJ[w][i] !== undefined) v.push(PJ[w][i]); }); avgP[i] = v.length ? mean(v) : null; });
      Object.keys(PJ).forEach(function (w) {
        o.wadj[w] = {};
        o.ids.forEach(function (i) { o.wadj[w][i] = avgP[i] === null || PJ[w][i] === undefined ? 0 : WADJ * (PJ[w][i] - avgP[i]); });
      });
    }
    o.bt = backtest(H);
    o.sim = simulate(x, o);
    var opp = {}, lgMu = mean(o.ids.map(function (i) { return o.mu[i]; })), sched = fullSched();
    o.ids.forEach(function (i) { opp[i] = []; });
    for (var w = o.sim.start; w <= WEEKS; w++) {
      (sched[w] || []).forEach(function (p) { opp[p[0]].push(o.mu[p[1]]); opp[p[1]].push(o.mu[p[0]]); });
    }
    o.ids.forEach(function (i) { o.sos[i] = opp[i].length ? mean(opp[i]) - lgMu : null; });
    return o;
  }

  function rangeChart(host, info, cut6, cut2) {
    var W = 480, rowH = 24, T = 22, B = 30, L = 150, R = 14, H = T + B + rowH * info.length, pw = W - L - R, max = 42;
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    var x = function (v) { return L + pw * v / max; }, t;
    for (t = 0; t <= max; t += 6) {
      svg.appendChild(sv('line', { x1: x(t), x2: x(t), y1: T, y2: H - B, 'class': 'grid' }));
      svg.appendChild(sv('text', { x: x(t), y: H - 12, 'text-anchor': 'middle', 'class': 'ax' }, String(t)));
    }
    [[cut6, '6th'], [cut2, '2nd']].forEach(function (c) {
      svg.appendChild(sv('line', { x1: x(c[0]), x2: x(c[0]), y1: T, y2: H - B, 'class': 's-avg' }));
      svg.appendChild(sv('text', { x: x(c[0]), y: T - 7, 'text-anchor': 'middle', 'class': 'ax' }, c[1]));
    });
    info.forEach(function (r, k) {
      var y = T + rowH * k + rowH / 2;
      svg.appendChild(sv('text', { x: L - 8, y: y + 4, 'text-anchor': 'end', 'class': 'ax' }, shortName(r.team, 22)));
      svg.appendChild(sv('line', { x1: x(r.lo), x2: x(r.hi), y1: y, y2: y, 'class': 's-sel' }));
      svg.appendChild(sv('circle', { cx: x(r.med), cy: y, r: 4.5, 'class': 'dot' }));
      svg.appendChild(sv('circle', { cx: x(r.now), cy: y, r: 3, 'class': 'nowd' }));
    });
    host.appendChild(svg);
  }


  // ---- Road to the playoffs: plain-language explainer for one team (hover card and team sheet) ----
  function roadOf(i) {
    var x = luX(); if (!x) return null;
    var o; try { o = getOutlook(x); } catch (e) { return null; }
    if (!o || !o.sim || !o.sim.pos[i]) return null;
    var d = x.d, s = o.sim, cur = null, byRank = d.rows.slice(), up = o.up, kk = s.start - 1;
    d.rows.forEach(function (q) { if (q.i === i) cur = q; });
    if (!cur) return null;
    var asc = function (a, b) { return a - b; };
    var left = WEEKS - s.start + 1, pr = 0, by = 0, N = s.N;
    s.pos[i].forEach(function (c, k) { if (k < 6) pr += c; if (k < 2) by += c; });
    var po = pr / N, bye = by / N, lps = s.lp[i].slice().sort(asc), med = pctile(lps, 0.5);
    var c6 = s.cut6.slice().sort(asc), c2 = s.cut2.slice().sort(asc), m6 = pctile(c6, 0.5), m2 = pctile(c2, 0.5);
    var mx = cur.lp + 3 * left, above = 0, reach = 0;
    d.rows.forEach(function (q) { if (q.i === i) return; if (q.lp > mx) above++; if (q.lp + 3 * left >= cur.lp) reach++; });
    var status, cls;
    var cx = clinchOf(i);
    if (above >= 6 || (cx && cx.po === 'eliminated')) { status = 'Eliminated'; cls = 'neg'; }
    else if (reach <= 5 || (cx && cx.po === 'clinched')) { status = 'Clinched'; cls = 'pos'; }
    else if (po >= 0.8) { status = 'Favored'; cls = 'pos'; }
    else if (po >= 0.2) { status = 'Bubble'; cls = ''; }
    else { status = 'Long shot'; cls = 'neg'; }
    var need = Math.max(0, m6 - cur.lp), pace = left ? need / left : 0, own = left ? Math.max(0, med - cur.lp) / left : 0;
    var r6 = d.rows[5], r7 = d.rows[6], pfRank = 1;
    d.rows.forEach(function (q) { if (q.pts > cur.pts) pfRank++; });
    var L = [], where;
    if (cur.rank <= 6) where = '#' + cur.rank + ' with ' + cur.lp + ' LP, ' + (cur.lp - r7.lp) + ' clear of 7th (' + r7.team + ', ' + r7.lp + ').';
    else where = '#' + cur.rank + ' with ' + cur.lp + ' LP, ' + (r6.lp - cur.lp) + ' behind 6th (' + r6.team + ', ' + r6.lp + ').';
    var tie = Math.abs(cur.lp - (cur.rank <= 6 ? r7.lp : r6.lp)) <= 1 ? ' Ties on LP go to total points: ' + f1(cur.pts) + ', ' + ordn(pfRank) + ' in the league.' : '';
    L.push(['Where', where + tie]);
    var road;
    if (status === 'Eliminated') road = 'Even 3 LP every week (max ' + mx + ') cannot pass the six teams ahead.';
    else if (status === 'Clinched') road = 'No team outside the top six can catch them. ' + (bye >= 0.995 ? 'The bye is also locked.' : 'Bye odds are ' + Math.round(bye * 100) + '%; the bye line is usually near ' + m2 + ' LP.');
    else if (status === 'Favored') road = 'Usually the cutoff is about ' + m6 + ' LP, so ' + need + ' more over ' + left + ' weeks (' + f1(pace) + ' a week). They are on pace for ' + f1(own) + ' a week. They miss only if they fall well short of that.' + (bye >= 0.1 ? ' Bye odds ' + Math.round(bye * 100) + '% (line near ' + m2 + ' LP).' : '');
    else road = 'Usually the cutoff is about ' + m6 + ' LP (' + pctile(c6, 0.1) + ' to ' + pctile(c6, 0.9) + ' in most simulations). They need ' + need + ' more in ' + left + ' weeks, ' + f1(pace) + ' a week, and are on pace for ' + f1(own) + '. A win is 2 LP and beating the league average adds 1, so about ' + Math.ceil(need / 3) + ' of ' + left + ' weeks need to be both.';
    L.push(['Road', road]);
    var opp = -1, mt = null;
    if (up) up.matchups.forEach(function (m) { if (m.a === i) { opp = m.b; mt = m; } else if (m.b === i) { opp = m.a; mt = m; } });
    if (opp >= 0 && o.fill[i] && o.fill[i].rem + o.fill[opp].rem > 0 && status !== 'Eliminated' && status !== 'Clinched') {
      var wn = 0, wi = 0, ln = 0, li = 0, g = s.g1[i], ip = s.inP[i], q;
      for (q = 0; q < N; q++) { if (g[q] >= 2) { wn++; wi += ip[q]; } else { ln++; li += ip[q]; } }
      if (wn > 40 && ln > 40) L.push(['Week ' + up.week, 'Vs ' + d.teams[opp] + ': a win moves playoff odds to ' + Math.round(wi / wn * 100) + '%, a loss to ' + Math.round(li / ln * 100) + '%.']);
    }
    if (status === 'Bubble' || status === 'Long shot') {
      var how = status === 'Bubble' ? 'In: stay at or above ' + f1(pace) + ' LP a week and win the close ones. Out: a couple of losses to teams around the cutoff.' : 'A run of wins is not enough alone; teams ahead also have to stall. Their own pace is ' + f1(own) + ' a week against ' + f1(pace) + ' needed.';
      L.push(['To get in', how]);
    }
    if (HW && Object.keys(HW).length && kk >= 1) {
      var pb = pbaseRows(kk, d), hr = null; if (pb) pb.forEach(function (z) { if (z.team === cur.team) hr = z; });
      if (hr && hr.n >= 3 && hr.po !== null) L.push(['History', 'Since 2021, teams within 1 LP of ' + cur.lp + ' after Week ' + kk + ' made it ' + Math.round(hr.po * 100) + '% of the time (' + hr.n + ' team seasons).']);
    } else if (!HW) loadHW(function () {});
    return { team: cur.team, status: status, cls: cls, po: po, lines: L };
  }
  function roadDom(i) {
    var r = roadOf(i); if (!r) return null;
    var w = el('div', 'road'), h = el('div', 'road-h');
    h.appendChild(el('b', '', r.team)); h.appendChild(el('span', 'road-p', Math.round(r.po * 100) + '% playoffs'));
    h.appendChild(el('span', 'road-s ' + r.cls, r.status)); w.appendChild(h);
    r.lines.forEach(function (z) { var p = el('p', 'road-l'); p.appendChild(el('b', '', z[0] + ' ')); p.appendChild(document.createTextNode(z[1])); w.appendChild(p); });
    return w;
  }
  (function () {
    var tip = null, timer = null, curEl = null;
    function hide() { clearTimeout(timer); curEl = null; if (tip) tip.hidden = true; }
    function find(n) {
      var e = n && n.closest ? n.closest('[data-ti], #t tr[data-i], #cards .card[data-i]') : null;
      if (!e) return null;
      var v = e.getAttribute('data-ti'); if (v === null) v = e.getAttribute('data-i');
      var i = parseInt(v, 10); return isNaN(i) ? null : { e: e, i: i };
    }
    function show(f) {
      var dom = roadDom(f.i); if (!dom) return;
      if (!tip) { tip = el('div', 'roadtip'); tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
      tip.textContent = ''; tip.appendChild(dom); tip.hidden = false;
      var rc = f.e.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
      var x0 = Math.min(Math.max(8, rc.left + 16), vw - tw - 8), y0 = rc.bottom + 8;
      if (y0 + th > vh - 8) y0 = Math.max(8, rc.top - th - 8);
      tip.style.left = x0 + 'px'; tip.style.top = y0 + 'px';
    }
    if (!(window.matchMedia && window.matchMedia('(hover: hover)').matches)) return;
    document.addEventListener('mouseover', function (ev) {
      var f = find(ev.target);
      if (!f) { if (curEl) hide(); return; }
      if (curEl === f.e) return;
      clearTimeout(timer); curEl = f.e;
      timer = setTimeout(function () { if (curEl === f.e) show(f); }, 220);
    });
    document.addEventListener('mouseleave', hide);
    window.addEventListener('scroll', hide, true);
    document.addEventListener('click', hide);
  })();

  function scatter(host, pts, sel) {
    var W = 480, Hh = 320, L = 44, R = 14, T = 14, B = 36, pw = W - L - R, ph = Hh - T - B, all = [];
    pts.forEach(function (p) { all.push(p.x, p.y); });
    var ticks = niceTicks(Math.min.apply(null, all), Math.max.apply(null, all)), lo = ticks[0], hi = ticks[ticks.length - 1];
    var x = function (v) { return L + pw * (v - lo) / (hi - lo); }, y = function (v) { return T + ph * (1 - (v - lo) / (hi - lo)); };
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + Hh, role: 'img' });
    ticks.forEach(function (tv) {
      svg.appendChild(sv('line', { x1: L, x2: W - R, y1: y(tv), y2: y(tv), 'class': 'grid' }));
      svg.appendChild(sv('text', { x: L - 6, y: y(tv) + 4, 'text-anchor': 'end', 'class': 'ax' }, String(tv)));
      svg.appendChild(sv('text', { x: x(tv), y: Hh - 18, 'text-anchor': 'middle', 'class': 'ax' }, String(tv)));
    });
    svg.appendChild(sv('text', { x: L + pw / 2, y: Hh - 3, 'text-anchor': 'middle', 'class': 'ax' }, 'Yahoo projection'));
    svg.appendChild(sv('line', { x1: x(lo), y1: y(lo), x2: x(hi), y2: y(hi), 'class': 's-avg' }));
    pts.filter(function (p) { return p.t !== sel; }).forEach(function (p) { svg.appendChild(sv('circle', { cx: x(p.x), cy: y(p.y), r: 3.5, 'class': 'dot2' })); });
    pts.filter(function (p) { return p.t === sel; }).forEach(function (p) { svg.appendChild(sv('circle', { cx: x(p.x), cy: y(p.y), r: 5, 'class': 'dot' })); });
    host.appendChild(svg);
  }

  function renderPower() {
    var host = $('x-power'), x = luReady(host); if (!x) return;
    var o = getOutlook(x), d = x.d, rows = analyze(d).slice();
    rows.forEach(function (r) { r.l3 = mean(r.scores.slice(-Math.min(3, r.scores.length))); r.str = mean(o.H.proj[r.i]); });
    var zs = function (key, sign) {
      var v = rows.map(function (r) { return r[key]; }), m = mean(v), q = 0;
      v.forEach(function (u) { q += (u - m) * (u - m); });
      q = Math.sqrt(q / v.length) || 1;
      rows.forEach(function (r) { r['z' + key] = sign * (r[key] - m) / q; });
    };
    zs('avg', 1); zs('l3', 1); zs('apPct', 1); zs('str', 1); zs('sd', -1);
    rows.forEach(function (r) { r.pw = 50 + 10 * (0.25 * r.zavg + 0.20 * r.zl3 + 0.20 * r.zapPct + 0.25 * r.zstr + 0.10 * r.zsd); });
    var byStand = rows.slice().sort(function (a, b) { return a.rank - b.rank; });
    rows.sort(function (a, b) { return b.pw - a.pw; });
    var cap = el('p', 'cap', 'Power score blends season average (25%), last 3 weeks (20%), all-play win rate (20%), roster strength from Yahoo projections (25%), and steadiness (10%). Move is standings rank minus power rank: plus means the team looks better than its record. Weights are judgment, not fitted.');
    cap.style.marginTop = '0'; host.appendChild(cap);
    sec(host, 'Power rankings', true);
    put(host, [['Pwr', 'c1'], ['Team', 'l c2'], ['Stand', ''], ['Move', ''], ['Score', ''], ['Avg', ''], ['Last 3', ''], ['All-Play', ''], ['Roster Proj', ''], ['Std Dev', '']],
      rows.map(function (r, k) {
        var mv = r.rank - (k + 1);
        return [[String(k + 1), 'c1'], [r.team, 'l c2 team'], [String(r.rank), ''], [mv === 0 ? '0' : signed(mv, String), mv > 0 ? 'pos' : (mv < 0 ? 'neg' : '')],
          [f1(r.pw), ''], [f1(r.avg), ''], [f1(r.l3), ''], [(r.apPct * 100).toFixed(0) + '%', ''], [f1(r.str), ''], [f1(r.sd), '']];
      }));
    sec(host, 'Projection vs actual');
    var pickRow = el('div', 'pick'); pickRow.appendChild(el('label', 'meta', 'Highlight'));
    var sel = el('select'); sel.id = 'psel';
    if (pSel === null || !d.rows.some(function (r) { return r.i === pSel; })) pSel = byStand[0].i;
    byStand.forEach(function (r) { var op = el('option', '', r.team); op.value = String(r.i); if (r.i === pSel) op.selected = true; sel.appendChild(op); });
    sel.addEventListener('change', function () { pSel = parseInt(sel.value, 10); renderPower(); });
    pickRow.appendChild(sel); host.appendChild(pickRow);
    var pts = []; d.rows.forEach(function (r) { x.keys.forEach(function (n) { pts.push({ x: projOf(n, r.i), y: r.wk[n].pts, t: r.i }); }); });
    var cb = el('div', 'chartbox'); cb.style.marginTop = '8px'; scatter(cb, pts, pSel);
    var lg = el('div', 'legend'); lg.appendChild(el('span', '', 'Each dot is one team in one week. Above the dashed line means it beat the Yahoo projection. Vertical axis is actual points.'));
    cb.appendChild(lg); host.appendChild(cb);
  }

  function hotCold(host, all, d) {
    var by = {};
    all.forEach(function (p) {
      var g = by[p.name] || (by[p.name] = { name: p.name, t: p.t, n: 0, proj: 0, pts: 0, beat: 0 });
      g.n++; g.proj += p.proj; g.pts += p.pts; g.t = p.t; if (p.pts > p.proj) g.beat++;
    });
    var list = Object.keys(by).map(function (k) { var g = by[k]; g.ap = g.proj / g.n; g.ay = g.pts / g.n; g.df = g.ay - g.ap; return g; })
      .filter(function (g) { return g.n >= 3 && g.ap >= 8; });
    var heads = [['Player', 'l c0'], ['Team', 'l'], ['Starts', ''], ['Avg Proj', ''], ['Avg Pts', ''], ['Diff', ''], ['Beat Proj', '']];
    var mk = function (g) { return [[g.name, 'l c0 team'], [d.teams[g.t], 'l'], [String(g.n), ''], [f1(g.ap), ''], [f1(g.ay), ''], [signed(g.df, f1), g.df >= 0 ? 'pos' : 'neg'], [g.beat + '/' + g.n, '']]; };
    sec(host, 'Running hot (3 or more starts, projected 8 or more)');
    put(host, heads, list.slice().sort(function (a, b) { return b.df - a.df; }).slice(0, 8).map(mk));
    sec(host, 'Running cold (3 or more starts, projected 8 or more)');
    put(host, heads, list.slice().sort(function (a, b) { return a.df - b.df; }).slice(0, 8).map(mk));
    host.appendChild(el('p', 'cap', 'Averages over the weeks a player was started. One huge or empty game moves these a lot, and a few weeks of data rarely predicts the next one.'));
  }



  // ---- History: past seasons by manager ----
  var HIST = null, histSeason = null;
  function loadHist(cb) {
    if (HIST) { cb(); return; }
    fetch('/api/history').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      HIST = (d && d.seasons) || {}; cb();
    }).catch(function () { HIST = {}; cb(); });
  }
  function histYears() { return Object.keys(HIST).sort(); }
  function gamesIn(rows) { return rows[0].w + rows[0].l; }
  function renderAlltime() {
    var host = $('x-alltime'); host.textContent = '';
    if (!HIST) { host.appendChild(el('p', 'cap', 'Loading history...')); loadHist(function () { if (tab === 'alltime') RENDER.alltime(); }); return; }
    var years = histYears();
    if (!years.length) { host.appendChild(el('p', 'cap', 'No past seasons loaded yet.')); return; }
    var M = {}, recs = [];
    years.forEach(function (y) {
      var rows = HIST[y], g = gamesIn(rows);
      rows.forEach(function (r) {
        recs.push({ y: y, r: r, g: g });
        if (r.mgr === '(hidden)') return;
        var m = M[r.mgr] || (M[r.mgr] = { n: r.mgr, s: 0, t1: 0, t2: 0, t3: 0, po: 0, w: 0, l: 0, pf: 0, g: 0, fin: 0, best: 99, teams: {} });
        m.s++; m.w += r.w; m.l += r.l; m.pf += r.pf; m.g += r.w + r.l; m.fin += r.r; m.best = Math.min(m.best, r.r);
        if (r.r === 1) m.t1++; if (r.r === 2) m.t2++; if (r.r === 3) m.t3++; if (r.r <= 6) m.po++;
      });
    });
    var list = Object.keys(M).map(function (k) { return M[k]; });
    list.sort(function (a, b) { return (b.t1 - a.t1) || (b.t2 - a.t2) || ((b.w / (b.w + b.l)) - (a.w / (a.w + a.l))); });
    sec(host, 'All-time by manager', true);
    put(host, [['#', 'c1'], ['Manager', 'l c2'], ['Titles', ''], ['2nd', ''], ['3rd', ''], ['Playoffs', ''], ['Seasons', ''], ['Record', ''], ['Win %', ''], ['PF / game', ''], ['Avg finish', ''], ['Best', '']],
      list.map(function (m, k) {
        return [[String(k + 1), 'c1'], [m.n, 'l c2 team'], [String(m.t1), m.t1 ? 'pos' : ''], [String(m.t2), ''], [String(m.t3), ''], [m.po + '/' + m.s, ''], [String(m.s), ''],
          [m.w + '-' + m.l, ''], [(100 * m.w / (m.w + m.l)).toFixed(1) + '%', ''], [f1(m.pf / m.g), ''], [f1(m.fin / m.s), ''], [m.best === 1 ? 'Champ' : String(m.best), '']];
      }));
    function top(title, key, dir, fmt) {
      var a = recs.slice().sort(function (p, q) { return dir * (key(q) - key(p)); }).slice(0, 5);
      sec(host, title);
      put(host, [['Year', ''], ['Team', 'l'], ['Manager', 'l'], ['Value', '']], a.map(function (x) { return [[x.y, ''], [x.r.team, 'l team'], [x.r.mgr, 'l'], [fmt(x), '']]; }));
    }
    top('Most points in a season (per game)', function (x) { return x.r.pf / x.g; }, 1, function (x) { return f1(x.r.pf / x.g) + ' (' + f1(x.r.pf) + ' total)'; });
    top('Best regular season records', function (x) { return x.r.w / x.g; }, 1, function (x) { return x.r.w + '-' + x.r.l + ' (finished ' + x.r.r + ')'; });
  }
  function renderSeasons() {
    var host = $('x-seasons'); host.textContent = '';
    if (!HIST) { host.appendChild(el('p', 'cap', 'Loading history...')); loadHist(function () { if (tab === 'alltime') RENDER.alltime(); }); return; }
    var years = histYears().reverse();
    if (!years.length) { host.appendChild(el('p', 'cap', 'No past seasons loaded yet.')); return; }
    if (!histSeason || !HIST[histSeason]) histSeason = years[0];
    var bar = el('div', 'pick'), lab = el('label', 'meta', 'Season'), sel = el('select');
    years.forEach(function (y) { var o = el('option', '', y); o.value = y; if (y === histSeason) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', function () { histSeason = sel.value; renderSeasons(); });
    bar.appendChild(lab); bar.appendChild(sel); host.appendChild(bar);
    var rows = HIST[histSeason], g = gamesIn(rows);
    var cap = el('p', 'cap keep', histSeason + ' final standings. Champion: ' + rows[0].team + ' (' + rows[0].mgr + ').');
    host.appendChild(cap);
    put(host, [['Rank', 'c1'], ['Team', 'l c2'], ['Manager', 'l'], ['Record', ''], ['PF', ''], ['PA', ''], ['Diff', '']],
      rows.map(function (r) {
        var d = r.pf - r.pa;
        return [[String(r.r), 'c1'], [r.team + (r.r === 1 ? ' (champion)' : ''), 'l c2 team'], [r.mgr, 'l'], [r.w + '-' + r.l, ''], [f2(r.pf), ''], [f2(r.pa), ''], [signed(d, f1), d >= 0 ? 'pos' : 'neg']];
      }));
  }



  // ---- Races: animated charts over time ----
  var RC = { view: 'bars', metric: 'lp', t: Infinity, n: 0, playing: false, speed: 1, raf: 0, last: 0, hi: null, upd: null, odds: null, dmetric: 'titles' };
  function raceStop() { bumpStop(); RC.playing = false; if (RC.raf) cancelAnimationFrame(RC.raf); RC.raf = 0; var b = document.getElementById('rplay'); if (b) b.textContent = 'Play'; }
  function raceTick(ts) {
    if (!RC.playing) return;
    RC.raf = requestAnimationFrame(raceTick);
    var dt = Math.min(0.1, (ts - RC.last) / 1000 || 0.016); RC.last = ts;
    RC.t = Math.min(RC.n, RC.t + dt * RC.speed * (RC.mult || 1) / 1.3);
    raceDraw();
    if (RC.t >= RC.n) raceStop();
  }
  function racePlay() {
    if (RC.playing) { raceStop(); return; }
    if (RC.t >= RC.n) RC.t = 0;
    RC.playing = true; RC.last = performance.now(); $('rplay').textContent = 'Pause';
    RC.raf = requestAnimationFrame(raceTick);
  }
  function raceDraw() {
    var sl = document.getElementById('rslide'), lab = document.getElementById('rlab');
    if (sl) sl.value = RC.t;
    if (lab && RC.labels) lab.textContent = RC.labels[Math.min(RC.labels.length - 1, Math.round(RC.t))];
    if (RC.upd) RC.upd(RC.t);
  }
  function lerpAt(arr, t) { var i = Math.min(arr.length - 2, Math.floor(t)), f = Math.min(1, t - i); if (arr.length < 2) return arr[0]; return arr[i] + (arr[i + 1] - arr[i]) * f; }

  function weeklySeries(d) {
    var ser = {}, K = d.keys.length, k;
    d.teams.forEach(function (t, i) { ser[i] = { lp: [0], pts: [0], rank: [null] }; });
    for (k = 1; k <= K; k++) {
      compute(d.teams, subset(d.weeksObj, d.keys.slice(0, k))).forEach(function (r) { ser[r.i].lp.push(r.lp); ser[r.i].pts.push(r.pts); ser[r.i].rank.push(r.rank); });
    }
    d.teams.forEach(function (t, i) { ser[i].rank[0] = ser[i].rank[1]; });
    return ser;
  }
  var WI = ['Playoff result (actual)', 'Best regular season record', 'Most points scored'];
  function champOf(y, rule) {
    var rows = HIST[y].filter(function (q) { return q.mgr !== '(hidden)' || rule === 0; });
    if (rule === 0) return HIST[y].filter(function (q) { return q.r === 1; })[0];
    return rows.slice().sort(function (a, b) { return rule === 1 ? ((b.w - a.w) || (b.pf - a.pf)) : (b.pf - a.pf); })[0];
  }
  function dynastySeries(metric) {
    var years = histYears(), ser = {}, names = [], cum = {};
    var recs = histRecs();
    recs.forEach(function (x) { if (x.r.mgr !== '(hidden)' && !ser[x.r.mgr]) { ser[x.r.mgr] = [0]; cum[x.r.mgr] = { w: 0, g: 0, p: 0 }; names.push(x.r.mgr); } });
    years.forEach(function (y) {
      names.forEach(function (n) {
        var prev = ser[n][ser[n].length - 1], r = HIST[y].filter(function (q) { return q.mgr === n; })[0], add = 0;
        if (metric === 'winpct' || metric === 'ppg') {
          var c = cum[n];
          if (r) { c.w += r.w; c.g += r.w + r.l; c.p += r.pf || 0; }
          ser[n].push(!c.g ? 0 : (metric === 'winpct' ? 100 * c.w / c.g : c.p / c.g));
          return;
        }
        if (r) {
          if (metric === 'titles') add = champOf(y, RC.wi || 0).mgr === n ? 1 : 0;
          else if (metric === 'finals') add = r.r <= 2 ? 1 : 0;
          else if (metric === 'playoffs') add = r.r <= 6 ? 1 : 0;
          else if (metric === 'pf') add = r.pf || 0;
          else add = r.w;
        }
        ser[n].push(prev + add);
      });
    });
    return { ser: ser, names: names, years: years };
  }

  function whatIfDiff(dy, rule) {
    var diffs = [], saved = RC.wi;
    RC.wi = 0; var act = dynastySeries('titles'); RC.wi = saved;
    dy.names.forEach(function (n) { var a = act.ser[n][act.ser[n].length - 1], b = dy.ser[n][dy.ser[n].length - 1]; if (a !== b) diffs.push({ n: n, a: a, b: b }); });
    diffs.sort(function (x, y) { return (y.b - y.a) - (x.b - x.a); });
    if (!diffs.length) return 'Same champions either way.';
    return 'Versus the real playoffs: ' + diffs.map(function (x) { return x.n + ' ' + x.a + ' to ' + x.b; }).join(', ') + '.';
  }

  function hwAll() {
    var X = {}, d = getData();
    Object.keys(HW || {}).forEach(function (y) { X[y] = HW[y]; });
    if (!d.sample && d.keys.length) {
      var cy = {};
      d.keys.forEach(function (n, k) {
        d.weeksObj[n].forEach(function (m) {
          [[m.a, m.as], [m.b, m.bs]].forEach(function (z) { var g = MGR26[d.teams[z[0]]]; if (!g) return; cy[g] = cy[g] || { p: [] }; cy[g].p[k] = num(z[1]); });
        });
      });
      X['2026'] = cy;
    }
    return X;
  }
  function headToHead(A, B) {
    var d = getData(); if (d.sample || !d.keys.length) return 'Head to head: no games loaded yet.';
    var ia = -1, ib = -1, wa = 0, wb = 0, gm = 0;
    d.teams.forEach(function (t, i) { if (MGR26[t] === A) ia = i; if (MGR26[t] === B) ib = i; });
    if (ia < 0 || ib < 0) return 'Head to head: ' + A + ' and ' + B + ' are not both in the current league.';
    Object.keys(d.weeksObj).forEach(function (n) {
      d.weeksObj[n].forEach(function (m) {
        if (!((m.a === ia && m.b === ib) || (m.a === ib && m.b === ia))) return;
        var sa = num(m.as), sb = num(m.bs);
        if (sa === sb) return;
        gm++; if ((m.a === ia) === (sa > sb)) wa++; else wb++;
      });
    });
    if (!gm) return 'Head to head this season: no games yet between them.';
    return 'Head to head this season: ' + A + ' ' + wa + ', ' + B + ' ' + wb + ' (' + gm + ' game' + (gm > 1 ? 's' : '') + ').';
  }
  function duelMgrs(S) {
    var o = {};
    Object.keys(S).forEach(function (y) { Object.keys(S[y]).forEach(function (m) { if (m !== '(hidden)') o[m] = (o[m] || 0) + 1; }); });
    return Object.keys(o).sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });
  }
  function duelSteps(S, A, B, scope) {
    var st = [];
    Object.keys(S).sort().forEach(function (y) {
      if (scope !== 'all' && scope !== y) return;
      var a = S[y][A], b = S[y][B]; if (!a || !b) return;
      for (var k = 0; k < Math.max(a.p.length, b.p.length); k++) if (a.p[k] > 0 && b.p[k] > 0) st.push({ y: y, wk: k + 1, a: a.p[k], b: b.p[k] });
    });
    return st;
  }
  function buildDuel(stage, st, A, B) {
    var n = st.length, sa = [0], sb = [0], wa = [0], wb = [0], gap = [0], mx = 1, k;
    for (k = 0; k < n; k++) {
      sa.push(sa[k] + st[k].a); sb.push(sb[k] + st[k].b);
      wa.push(wa[k] + (st[k].a > st[k].b ? 1 : 0)); wb.push(wb[k] + (st[k].b > st[k].a ? 1 : 0));
      gap.push(sa[k + 1] - sb[k + 1]); mx = Math.max(mx, Math.abs(gap[k + 1]));
    }
    stage.textContent = ''; stage.style.height = 'auto';
    var box = el('div', 'duel'), head = el('div', 'dl-head'), na = el('div', 'dl-n a', A), nb = el('div', 'dl-n b', B);
    var ta = el('div', 'dl-t', '0'), tb = el('div', 'dl-t', '0');
    var ca = el('div', 'dl-c'), cb = el('div', 'dl-c'); ca.appendChild(na); ca.appendChild(ta); cb.appendChild(nb); cb.appendChild(tb);
    head.appendChild(ca); head.appendChild(cb); box.appendChild(head);
    var track = el('div', 'dl-track'), fill = el('div', 'dl-fill'), tick = el('div', 'dl-tick'); track.appendChild(fill); track.appendChild(tick); box.appendChild(track);
    var gl = el('div', 'dl-gap', 'Even'); box.appendChild(gl);
    var tally = el('div', 'dl-tally'); box.appendChild(tally);
    var last = el('div', 'dl-last'); box.appendChild(last);
    stage.appendChild(box);
    RC.upd = function (t) {
      var g = lerpAt(gap, t), i = Math.round(t);
      var w = 50 * Math.abs(g) / mx;
      fill.style.width = w + '%'; fill.style.left = g >= 0 ? '50%' : (50 - w) + '%';
      fill.className = 'dl-fill' + (g >= 0 ? ' a' : ' b');
      ta.textContent = Math.round(lerpAt(sa, t)).toLocaleString(); tb.textContent = Math.round(lerpAt(sb, t)).toLocaleString();
      na.className = 'dl-n a' + (g > 0.5 ? ' up' : ''); nb.className = 'dl-n b' + (g < -0.5 ? ' up' : '');
      gl.textContent = Math.abs(g) < 0.5 ? 'Even' : (g > 0 ? A : B) + ' leads by ' + f1(Math.abs(g)) + ' points';
      tally.textContent = 'Higher score in the same week: ' + A + ' ' + wa[i] + ', ' + B + ' ' + wb[i] + (i - wa[i] - wb[i] ? ', ties ' + (i - wa[i] - wb[i]) : '');
      if (i >= 1) { var q = st[i - 1]; last.textContent = q.y + ' week ' + q.wk + ': ' + A + ' ' + f1(q.a) + ', ' + B + ' ' + f1(q.b) + (q.a > q.b ? ' (' + A + ' by ' : ' (' + B + ' by ') + f1(Math.abs(q.a - q.b)) + ')'; }
      else last.textContent = 'Press Play.';
    };
  }

  function buildBarRace(stage, names, ser, fmt, labelFor, flagFor) {
    var RH = 30, ids = Object.keys(names), rows = {}, mx = 0;
    ids.forEach(function (i) { mx = Math.max(mx, ser[i][ser[i].length - 1]); });
    mx = mx || 1;
    stage.style.height = (ids.length * RH + 6) + 'px'; stage.textContent = '';
    ids.forEach(function (i) {
      var r = el('div', 'rrow'), b = el('div', 'rbar'), n = el('div', 'rn', labelFor ? labelFor(i) : names[i]), v = el('div', 'rv', '0');
      r.appendChild(b); r.appendChild(n); r.appendChild(v); stage.appendChild(r); rows[i] = { r: r, b: b, v: v };
    });
    RC.upd = function (t) {
      var cur = ids.map(function (i) { return { i: i, v: lerpAt(ser[i], t) }; }), flag = flagFor ? flagFor(t) : null;
      cur.sort(function (a, b) { return (b.v - a.v) || (a.i < b.i ? -1 : 1); });
      cur.forEach(function (c, k) {
        var o = rows[c.i];
        o.r.style.transform = 'translateY(' + (k * RH) + 'px)';
        o.b.style.width = Math.max(0.5, 100 * c.v / mx) + '%';
        o.v.textContent = fmt(c.v);
        o.r.className = 'rrow' + (k === 0 && c.v > 0 ? ' lead' : '') + (flag !== null && String(c.i) === String(flag) ? ' flash' : '');
      });
    };
  }

  function buildLines(stage, names, ser, opt) {
    // opt: x0 step offset, yMin, yMax, yTicks, fmt, invert
    var K = ser[Object.keys(ser)[0]].length - 1, W = 480, H = opt.h || 340, L = 42, R = 118, T = 12, B = 26, pw = W - L - R, ph = H - T - B;
    var x = function (k) { return L + pw * (k / K); };
    var y = function (v) { return opt.invert ? T + ph * (v - opt.yMin) / (opt.yMax - opt.yMin) : T + ph * (1 - (v - opt.yMin) / (opt.yMax - opt.yMin)); };
    stage.textContent = ''; stage.style.height = 'auto';
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    opt.ticks.forEach(function (tv) {
      svg.appendChild(sv('line', { x1: L, x2: W - R, y1: y(tv), y2: y(tv), 'class': 'grid' }));
      svg.appendChild(sv('text', { x: L - 6, y: y(tv) + 4, 'text-anchor': 'end', 'class': 'ax' }, opt.fmt(tv)));
    });
    for (var k = (opt.xStart || 0); k <= K; k++) svg.appendChild(sv('text', { x: x(k), y: H - 8, 'text-anchor': 'middle', 'class': 'ax' }, RC.labels[k] ? RC.labels[k].replace('Week ', 'W') : ''));
    if (opt.cut !== undefined) svg.appendChild(sv('line', { x1: L, x2: W - R, y1: y(opt.cut), y2: y(opt.cut), 'class': 's-avg' }));
    var ids = Object.keys(names), paths = {}, dots = {}, tags = {};
    ids.forEach(function (i) {
      paths[i] = sv('path', { fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }); svg.appendChild(paths[i]);
    });
    ids.forEach(function (i) {
      dots[i] = sv('circle', { r: 3.6 }); svg.appendChild(dots[i]);
      tags[i] = sv('text', { 'class': 'ax', 'font-size': 11 }, shortName(names[i], 17)); svg.appendChild(tags[i]);
    });
    stage.appendChild(svg);
    RC.upd = function (t) {
      var lead = null, best = -1e9, ends = [];
      ids.forEach(function (i) {
        var a = ser[i], d = '', last = Math.floor(t), f = t - last, k0 = opt.xStart || 0, q;
        for (q = k0; q <= last && q <= K; q++) d += (d ? 'L' : 'M') + x(q).toFixed(1) + ' ' + y(a[q]).toFixed(1);
        var ex = x(Math.min(K, t)), ev = lerpAt(a, Math.min(K, t));
        if (f > 0 && last < K) d += 'L' + ex.toFixed(1) + ' ' + y(ev).toFixed(1);
        paths[i].setAttribute('d', d);
        var score = opt.invert ? -ev : ev; if (score > best) { best = score; lead = i; }
        ends.push({ i: i, ex: ex, ey: y(ev) });
      });
      ends.sort(function (a, b) { return a.ey - b.ey; });
      for (var q = 1; q < ends.length; q++) if (ends[q].ty === undefined) { ends[q].ty = Math.max(ends[q].ey, (ends[q - 1].ty === undefined ? ends[q - 1].ey : ends[q - 1].ty) + 12); }
      ends[0].ty = ends[0].ey;
      ends.forEach(function (e) {
        var i = e.i, isHi = String(RC.hi) === String(i), isLead = i === lead;
        paths[i].setAttribute('stroke', isHi || isLead ? '#f2b632' : 'rgba(214,52,98,0.55)');
        paths[i].setAttribute('stroke-width', isHi ? 3.6 : (isLead ? 3 : 1.6));
        paths[i].setAttribute('opacity', RC.hi !== null && !isHi ? 0.35 : 1);
        dots[i].setAttribute('cx', e.ex); dots[i].setAttribute('cy', e.ey); dots[i].setAttribute('fill', isHi || isLead ? '#f2b632' : '#d63462');
        tags[i].setAttribute('x', e.ex + 7); tags[i].setAttribute('y', e.ty + 4); tags[i].setAttribute('fill', isHi || isLead ? '#f2b632' : '#c9a9b2');
      });
    };
  }

  function oddsSeries(d, done) {
    if (RC.odds && RC.odds.sig === d.keys.join(',')) { done(RC.odds.ser); return; }
    var K = d.keys.length, ser = {}, k = 1;
    d.teams.forEach(function (t, i) { ser[i] = [0.5]; });
    function step() {
      var dk = getData(k), xk = { d: dk, keys: dk.keys.filter(function (n) { return LU[n]; }) };
      var o = buildOutlook(xk, 1500, 'r' + k, k < K), s = o.sim;
      d.teams.forEach(function (t, i) { var pr = 0; (s.pos[i] || []).forEach(function (c, q) { if (q < 6) pr += c; }); ser[i].push(pr / s.N); });
      k++;
      if (k <= K) setTimeout(step, 10); else { RC.odds = { sig: d.keys.join(','), ser: ser }; done(ser); }
    }
    setTimeout(step, 10);
  }

  function renderRaces() {
    var host = $('x-races'); host.textContent = '';
    var d = getData();
    var views = [['bars', 'Standings race'], ['lines', 'Rank race'], ['odds', 'Playoff odds'], ['duel', 'Manager duel'], ['dyn', 'Dynasty 2013 to 2025']];
    var pills = el('div', 'rpills');
    views.forEach(function (v) {
      var b = el('button', '', v[1]); b.setAttribute('aria-pressed', String(RC.view === v[0]));
      b.addEventListener('click', function () { raceStop(); RC.view = v[0]; RC.t = Infinity; renderRaces(); });
      pills.appendChild(b);
    });
    host.appendChild(pills);
    var needHist = RC.view === 'dyn';
    if (needHist && !HIST) { host.appendChild(el('p', 'cap', 'Loading history...')); loadHist(function () { if (tab === 'races') renderRaces(); }); return; }
    if (RC.view === 'duel' && !HW) { host.appendChild(el('p', 'cap', 'Loading weekly history...')); loadHW(function () { if (tab === 'races') renderRaces(); }); return; }
    if (!needHist && RC.view !== 'duel' && d.sample) { host.appendChild(el('p', 'cap', 'Races appear once real weeks are loaded.')); return; }
    var sub = el('div', 'rpills'), caption = el('div', 'rcap'), stage = el('div', 'race');
    if (RC.view === 'bars') {
      [['lp', 'League points'], ['pts', 'Fantasy points']].forEach(function (m) {
        var b = el('button', '', m[1]); b.setAttribute('aria-pressed', String(RC.metric === m[0]));
        b.addEventListener('click', function () { RC.metric = m[0]; renderRaces(); }); sub.appendChild(b);
      });
      host.appendChild(sub);
    }
    if (RC.view === 'dyn') {
      [['titles', 'Titles'], ['finals', 'Finals trips'], ['playoffs', 'Playoff trips'], ['wins', 'Regular season wins'], ['pf', 'Points scored'], ['winpct', 'Win %'], ['ppg', 'Points per game']].forEach(function (m) {
        var b = el('button', '', m[1]); b.setAttribute('aria-pressed', String(RC.dmetric === m[0]));
        b.addEventListener('click', function () { RC.dmetric = m[0]; renderRaces(); }); sub.appendChild(b);
      });
      host.appendChild(sub);
      if (RC.dmetric === 'titles') {
        var wr = el('div', 'wirow'), wl2 = el('label', 'meta', 'What if titles went to'), ws = el('input'), wt = el('span', 'wit', WI[RC.wi || 0]);
        ws.type = 'range'; ws.min = 0; ws.max = 2; ws.step = 1; ws.value = RC.wi || 0; ws.setAttribute('aria-label', 'What if titles went to');
        ws.addEventListener('input', function () { RC.wi = parseInt(ws.value, 10); raceStop(); renderRaces(); });
        wr.appendChild(wl2); wr.appendChild(ws); wr.appendChild(wt); host.appendChild(wr);
      }
    }
    var ctl = el('div', 'rctl'), play = el('button', 'btn', RC.playing ? 'Pause' : 'Play'); play.id = 'rplay'; play.addEventListener('click', racePlay);
    var sl = el('input'); sl.type = 'range'; sl.id = 'rslide'; sl.min = 0; sl.step = 'any';
    var lab = el('span', 'rlab'); lab.id = 'rlab';
    var spd = el('button', 'btn', RC.speed === 1 ? '1x' : '2x'); spd.addEventListener('click', function () { RC.speed = RC.speed === 1 ? 2 : 1; spd.textContent = RC.speed === 1 ? '1x' : '2x'; });
    ctl.appendChild(play); ctl.appendChild(sl); ctl.appendChild(lab); ctl.appendChild(spd);
    host.appendChild(ctl); host.appendChild(stage); host.appendChild(caption);
    sl.addEventListener('input', function () { raceStop(); RC.t = parseFloat(sl.value); raceDraw(); });
    function start(n, labels, note, mult) {
      RC.mult = mult || 1; RC.n = n; RC.labels = labels; sl.max = n; RC.t = Math.min(RC.t, n); caption.textContent = note || ''; raceDraw();
      if (!RC.playing && RC.t === 0 && !RC.started) { RC.started = true; }
    }
    var keys = d.keys, wl = ['Start'].concat(keys.map(function (n) { return 'Week ' + n; }));
    if (RC.view === 'bars') {
      var ser = weeklySeries(d), names = {}; d.teams.forEach(function (t, i) { names[i] = t; });
      var sm = {}; Object.keys(ser).forEach(function (i) { sm[i] = ser[i][RC.metric]; });
      buildBarRace(stage, names, sm, RC.metric === 'lp' ? function (v) { return String(Math.round(v)); } : function (v) { return v.toFixed(0); });
      start(keys.length, wl, 'Bars grow as each week is added. Gold is the leader. Drag the slider to jump to any week.');
    } else if (RC.view === 'lines') {
      ctl.hidden = true;
      caption.textContent = 'Rank after each week. Press Play or drag the slider. Tap a team to follow it. Gold is a bye, garnet is in playoff position, the dashed line is the cutoff.';
      renderBump(stage, d);
    } else if (RC.view === 'duel') {
      var S = hwAll(), mg = duelMgrs(S);
      if (!RC.dA || mg.indexOf(RC.dA) < 0) RC.dA = mg.indexOf('James') >= 0 ? 'James' : mg[0];
      if (!RC.dB || mg.indexOf(RC.dB) < 0 || RC.dB === RC.dA) RC.dB = mg.filter(function (m) { return m !== RC.dA; })[0];
      var dsc = RC.dS || 'all';
      var yrs = Object.keys(S).sort().filter(function (y) { return S[y][RC.dA] && S[y][RC.dB]; });
      if (dsc !== 'all' && yrs.indexOf(dsc) < 0) dsc = 'all';
      RC.dS = dsc;
      var dbar = el('div', 'pick');
      function dsel(label, vals, cur, fn, txt) {
        var l = el('label', 'meta', label), sx = el('select');
        vals.forEach(function (v) { var o = el('option', '', txt ? txt(v) : v); o.value = v; if (v === cur) o.selected = true; sx.appendChild(o); });
        sx.addEventListener('change', function () { raceStop(); fn(sx.value); RC.t = 0; renderRaces(); });
        dbar.appendChild(l); dbar.appendChild(sx);
      }
      dsel('Manager', mg, RC.dA, function (v) { RC.dA = v; });
      dsel('vs', mg.filter(function (m) { return m !== RC.dA; }), RC.dB, function (v) { RC.dB = v; });
      dsel('Seasons', ['all'].concat(yrs), RC.dS, function (v) { RC.dS = v; }, function (v) { return v === 'all' ? 'All seasons' : v; });
      host.insertBefore(dbar, ctl);
      var dst = duelSteps(S, RC.dA, RC.dB, RC.dS);
      if (!dst.length) { stage.appendChild(el('p', 'cap', 'These two managers share no weeks of history.')); return; }
      var dl = ['Start'].concat(dst.map(function (q) { return q.y + ' W' + q.wk; }));
      buildDuel(stage, dst, RC.dA, RC.dB);
      var h2 = headToHead(RC.dA, RC.dB);
      host.appendChild(el('p', 'cap', h2));
      start(dst.length, dl, 'Each week adds both managers\' scores to a running total. This compares scores in the same week, not games they played against each other, because history stores scores but not opponents.', Math.max(1, dst.length / 20));
    } else if (RC.view === 'odds') {
      if (!LU || !UP) { stage.appendChild(el('p', 'cap', 'Lineup data is still loading. Open this view again in a moment.')); return; }
      stage.appendChild(el('p', 'cap', 'Computing playoff odds for each week...'));
      var sigNow = d.keys.join(',');
      oddsSeries(d, function (os) {
        if (tab !== 'races' || RC.view !== 'odds' || d.keys.join(',') !== sigNow) return;
        var nm2 = {}; d.teams.forEach(function (t, i) { nm2[i] = t; });
        var hs2 = el('div', 'pick'), hl2 = el('label', 'meta', 'Highlight'), hsel2 = el('select'), oo = el('option', '', 'Leader'); oo.value = ''; hsel2.appendChild(oo);
        d.teams.forEach(function (t, i) { var o = el('option', '', t); o.value = i; if (String(RC.hi) === String(i)) o.selected = true; hsel2.appendChild(o); });
        hsel2.addEventListener('change', function () { RC.hi = hsel2.value === '' ? null : parseInt(hsel2.value, 10); raceDraw(); });
        hs2.appendChild(hl2); hs2.appendChild(hsel2); host.insertBefore(hs2, ctl);
        RC.labels = ['Start'].concat(keys.map(function (n) { return 'Week ' + n; }));
        buildLines(stage, nm2, os, { yMin: 0, yMax: 1, ticks: [0, 0.25, 0.5, 0.75, 1], fmt: function (v) { return Math.round(v * 100) + '%'; }, xStart: 0, cut: 0.5 });
        start(keys.length, RC.labels, 'Chance to make the top 6 after each week, from a simulation of the rest of the season (1,500 runs per week). Every team starts at 50% in theory. Early weeks swing a lot.');
      });
    } else {
      var dy = dynastySeries(RC.dmetric), nm3 = {}; dy.names.forEach(function (n) { nm3[n] = n; });
      var lbl = ['Start'].concat(dy.years);
      var nTop = dy.names.filter(function (n) { return dy.ser[n][dy.ser[n].length - 1] > 0; });
      var nm4 = {}, s4 = {}; nTop.forEach(function (n) { nm4[n] = n; s4[n] = dy.ser[n]; });
      var wi = RC.dmetric === 'titles' ? (RC.wi || 0) : 0, champM = dy.years.map(function (y) { return champOf(y, wi).mgr; });
      buildBarRace(stage, nm4, s4, function (v) { return RC.dmetric === 'pf' ? Math.round(v).toLocaleString() : (RC.dmetric === 'winpct' ? v.toFixed(1) + '%' : (RC.dmetric === 'ppg' ? v.toFixed(1) : String(Math.round(v)))); }, null, function (t) { var yi = Math.round(t); return yi >= 1 && Math.abs(t - yi) < 0.3 ? champM[yi - 1] : null; });
      RC.labels = lbl;
      var champs = dy.years.map(function (y) { var c = champOf(y, wi); return y + ': ' + c.team + ' (' + c.mgr + ')'; });
      var baseUpd = RC.upd;
      RC.upd = function (t) { baseUpd(t); var yi = Math.round(t); caption.textContent = yi >= 1 ? (wi ? 'Title under this rule ' : 'Champion ') + champs[yi - 1] : 'Counted season by season from final standings. Press Play.'; };
      start(dy.years.length, lbl, '');
      if (wi) host.appendChild(el('p', 'cap', whatIfDiff(dy, wi)));
    }
  }

  // ---- Phase 1 additions: Hall of Fame, Managers, Prizes, Recap ----
  var PRIZE = 50;
  var MGR26 = { 'Tally SwampDonks': 'DanielM', 'RayGun Raptors': 'Weinjew', 'In The End We Have Forever': 'Shaq', "I'll Kupp Your Balls": 'James', 'Jewban': 'Daniel',
    'Dean Bernies XX': 'Corey', 'Feet': 'Joshua', 'Yordy': 'Jordan', 'Klitty Titty City Committee': 'Dave', 'Flois': 'nizzy', 'The Shredders': 'Marc', 'Rudyman': 'Aron' };
  function histHost(id, tabName, fn) {
    var host = $(id); host.textContent = '';
    if (!HIST) { host.appendChild(el('p', 'cap', 'Loading history...')); loadHist(function () { if (tab === tabName) RENDER[tabName](); }); return null; }
    if (!histYears().length) { host.appendChild(el('p', 'cap', 'No past seasons loaded yet.')); return null; }
    return host;
  }
  function histRecs() {
    var out = [];
    histYears().forEach(function (y) { var rows = HIST[y], g = gamesIn(rows); rows.forEach(function (r) { out.push({ y: y, r: r, g: g, wp: r.w / g }); }); });
    return out;
  }

  function profChart(host, years, series, sel) {
    var W = 480, H = 240, L = 30, R = 14, T = 14, B = 26, pw = W - L - R, ph = H - T - B, n = years.length;
    var x = function (i) { return L + pw * (n > 1 ? i / (n - 1) : 0.5); }, y = function (r) { return T + ph * (r - 1) / 11; };
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    [1, 3, 6, 9, 12].forEach(function (r) {
      svg.appendChild(sv('line', { x1: L, x2: W - R, y1: y(r), y2: y(r), 'class': 'grid' }));
      svg.appendChild(sv('text', { x: L - 6, y: y(r) + 4, 'text-anchor': 'end', 'class': 'ax' }, String(r)));
    });
    svg.appendChild(sv('line', { x1: L, x2: W - R, y1: (y(6) + y(7)) / 2, y2: (y(6) + y(7)) / 2, 'class': 's-avg' }));
    years.forEach(function (yr, i) { if (i % 2 === 0 || n < 8) svg.appendChild(sv('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', 'class': 'ax' }, String(yr).slice(2))); });
    function path(name, cls, w) {
      var d = '', pts = [];
      years.forEach(function (yr, i) { var r = series[name][yr]; if (r === undefined) return; pts.push([x(i), y(r)]); d += (d ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(r).toFixed(1); });
      if (d) svg.appendChild(sv('path', { d: d, fill: 'none', 'class': cls, 'stroke-width': w, 'stroke-linejoin': 'round' }));
      return pts;
    }
    Object.keys(series).forEach(function (nm) { if (nm !== sel) path(nm, 'dot2l', 1); });
    var pts = path(sel, 'selline', 2.6);
    pts.forEach(function (p) { svg.appendChild(sv('circle', { cx: p[0], cy: p[1], r: 3.8, 'class': 'dot' })); });
    host.appendChild(svg);
  }

  function renderProfiles() {
    var host = histHost('x-profiles', 'alltime'); if (!host) return;
    var years = histYears(), recs = histRecs(), by = {};
    recs.forEach(function (x) { if (x.r.mgr === '(hidden)') return; (by[x.r.mgr] || (by[x.r.mgr] = [])).push(x); });
    var names = Object.keys(by).sort(function (a, b) {
      var ta = by[a].filter(function (x) { return x.r.r === 1; }).length, tb = by[b].filter(function (x) { return x.r.r === 1; }).length;
      return (tb - ta) || (by[b].length - by[a].length);
    });
    if (!profSel || !by[profSel]) profSel = names[0];
    var bar = el('div', 'pick'), lab = el('label', 'meta', 'Manager'), sel = el('select');
    names.forEach(function (n) { var o = el('option', '', n); o.value = n; if (n === profSel) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', function () { profSel = sel.value; renderProfiles(); });
    bar.appendChild(lab); bar.appendChild(sel); host.appendChild(bar);
    var mine = by[profSel], t1 = mine.filter(function (x) { return x.r.r === 1; }), w = 0, l = 0, pf = 0, g = 0, fin = 0, best = 99;
    mine.forEach(function (x) { w += x.r.w; l += x.r.l; pf += x.r.pf; g += x.g; fin += x.r.r; best = Math.min(best, x.r.r); });
    var cap = el('p', 'cap keep', profSel + ': ' + mine.length + ' seasons, ' + t1.length + ' title' + (t1.length === 1 ? '' : 's') + (t1.length ? ' (' + t1.map(function (x) { return x.y; }).join(', ') + ')' : '') +
      ', ' + w + '-' + l + ' regular season record (' + (100 * w / (w + l)).toFixed(1) + '%), ' + f1(pf / g) + ' points per game, average finish ' + f1(fin / mine.length) + ', best finish ' + best + '.');
    host.appendChild(cap);
    var series = {};
    names.forEach(function (n) { series[n] = {}; by[n].forEach(function (x) { series[n][x.y] = x.r.r; }); });
    sec(host, 'Finish by season');
    var cb = el('div', 'chartbox'); profChart(cb, years, series, profSel);
    var lg = el('div', 'legend'); lg.appendChild(el('span', '', 'Gold is ' + profSel + '. Gray lines are everyone else. Up is better. The dashed line is the playoff cutoff.')); cb.appendChild(lg); host.appendChild(cb);
    var d = getData();
    if (!d.sample && d.keys.length) {
      var rows = analyze(d), cur = null;
      rows.forEach(function (r) { if (MGR26[r.team] === profSel) cur = r; });
      if (cur) {
        sec(host, '2026 so far');
        host.appendChild(el('p', 'cap keep', cur.team + ' is ranked ' + cur.rank + ' of 12 with ' + cur.lp + ' league points and averages ' + f1(cur.avg) + ' per game, against a career average of ' + f1(pf / g) + ' (' + signed(cur.avg - pf / g, f1) + ').'));
      }
    }
  }
  var profSel = null;

  function endp(t) { return /[.!?]$/.test(t) ? t : t + '.'; }
  var recapWk = null;
  function ordn(n) { var t = n % 100; return n + (t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')); }
  function renderRecap() {
    var host = $('x-recap'); host.textContent = '';
    var d = getData();
    if (d.sample) { host.appendChild(el('p', 'cap', 'The recap appears once real weeks are loaded.')); return; }
    var keys = d.keys.slice().reverse();
    if (!recapWk || d.keys.indexOf(recapWk) < 0) recapWk = keys[0];
    var bar = el('div', 'pick'), lab = el('label', 'meta', 'Week'), sel = el('select');
    keys.forEach(function (k) { var o = el('option', '', 'Week ' + k); o.value = k; if (k === recapWk) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', function () { recapWk = parseInt(sel.value, 10); renderRecap(); });
    bar.appendChild(lab); bar.appendChild(sel); host.appendChild(bar);
    var n = recapWk, rows = d.rows, ms = d.weeksObj[n], T = d.teams;
    var gs = ms.map(function (m) { var a = num(m.as), b = num(m.bs); return { w: a >= b ? m.a : m.b, l: a >= b ? m.b : m.a, ws: Math.max(a, b), ls: Math.min(a, b) }; });
    var sc = []; ms.forEach(function (m) { sc.push({ i: m.a, s: num(m.as) }); sc.push({ i: m.b, s: num(m.bs) }); });
    sc.sort(function (a, b) { return b.s - a.s; });
    var avg = mean(sc.map(function (x) { return x.s; }));
    var close = gs.slice().sort(function (a, b) { return (a.ws - a.ls) - (b.ws - b.ls); })[0];
    var blow = gs.slice().sort(function (a, b) { return (b.ws - b.ls) - (a.ws - a.ls); })[0];
    var lucky = gs.slice().sort(function (a, b) { return a.ws - b.ws; })[0];
    var unl = gs.slice().sort(function (a, b) { return b.ls - a.ls; })[0];
    var prev = d.keys.indexOf(n) > 0 ? compute(d.teams, subset(d.weeksObj, d.keys.slice(0, d.keys.indexOf(n)))) : null, mv = null;
    var after = compute(d.teams, subset(d.weeksObj, d.keys.slice(0, d.keys.indexOf(n) + 1)));
    if (prev) {
      var pm = {}; prev.forEach(function (r) { pm[r.i] = r.rank; });
      after.forEach(function (r) { var c = pm[r.i] - r.rank; if (!mv || Math.abs(c) > Math.abs(mv.c)) mv = { r: r, c: c, from: pm[r.i] }; });
    }
    var items = [
      ['Top scorer', T[sc[0].i] + ' with ' + f2(sc[0].s) + ' (' + signed(sc[0].s - avg, f1) + ' vs the league average of ' + f1(avg) + '). Wins the $' + PRIZE + ' prize.'],
      ['Lowest score', T[sc[sc.length - 1].i] + ' with ' + f2(sc[sc.length - 1].s) + '.'],
      ['Closest game', T[close.w] + ' ' + f2(close.ws) + ' over ' + T[close.l] + ' ' + f2(close.ls) + ', a margin of ' + f2(close.ws - close.ls) + '.'],
      ['Biggest blowout', T[blow.w] + ' ' + f2(blow.ws) + ' over ' + T[blow.l] + ' ' + f2(blow.ls) + ', a margin of ' + f2(blow.ws - blow.ls) + '.'],
      ['Luckiest win', T[lucky.w] + ' won with just ' + f2(lucky.ws) + ' against ' + endp(T[lucky.l])],
      ['Unluckiest loss', T[unl.l] + ' scored ' + f2(unl.ls) + ' and still lost to ' + endp(T[unl.w])]
    ];
    if (mv && mv.c !== 0) items.push(['Biggest mover', mv.r.team + ' ' + (mv.c > 0 ? 'climbed ' : 'fell ') + Math.abs(mv.c) + ' spot' + (Math.abs(mv.c) === 1 ? '' : 's') + ', from ' + mv.from + ' to ' + mv.r.rank + '.']);
    var top = after[0]; items.push(['Standings leader', top.team + ' with ' + top.lp + ' league points after Week ' + n + '.']);
    sec(host, 'Week ' + n + ' recap', true);
    items.forEach(function (it) {
      var row = el('div', 'prizeitem'), pw = el('span', 'pw', it[0]); pw.style.minWidth = '8.2rem';
      row.appendChild(pw); row.appendChild(el('span', 'pn', it[1])); host.appendChild(row);
    });
    if (!HW) { loadHW(function () { if (tab === 'matchups') RENDER.matchups(); }); }
    else if (Object.keys(HW).length) {
      var pool = [];
      Object.keys(HW).sort().forEach(function (y) { Object.keys(HW[y]).forEach(function (m) { HW[y][m].p.forEach(function (v, k) { pool.push({ v: v, k: y + ':' + m + ':' + (k + 1) }); }); }); });
      d.rows.forEach(function (r) { Object.keys(r.wk).forEach(function (w) { pool.push({ v: r.wk[w].pts, k: '2026:' + (MGR26[r.team] || r.team) + ':' + w }); }); });
      var hiP = pool.slice().sort(function (a, b) { return b.v - a.v; }), loP = hiP.slice().reverse(), alerts = [];
      sc.forEach(function (x) {
        var key = '2026:' + (MGR26[T[x.i]] || T[x.i]) + ':' + n, ih = -1, il = -1;
        hiP.forEach(function (q, k) { if (q.k === key) ih = k; }); loP.forEach(function (q, k) { if (q.k === key) il = k; });
        var nm = T[x.i];
        if (ih >= 0 && ih < 10) alerts.push([ih === 0 ? 'New record high' : 'Top 10 week', nm + ' scored ' + f2(x.s) + ', the ' + (ih === 0 ? 'highest' : ordn(ih + 1) + ' highest') + ' of ' + pool.length + ' team-weeks since 2021.']);
        if (il >= 0 && il < 10) alerts.push([il === 0 ? 'New record low' : 'Bottom 10 week', nm + ' scored ' + f2(x.s) + ', the ' + (il === 0 ? 'lowest' : ordn(il + 1) + ' lowest') + ' of ' + pool.length + ' team-weeks since 2021.']);
      });
      sec(host, 'Record watch');
      if (!alerts.length) host.appendChild(el('p', 'cap', 'No top 10 or bottom 10 scores since 2021 this week.'));
      alerts.forEach(function (it) {
        var row = el('div', 'prizeitem'), pw = el('span', 'pw', it[0]); pw.style.minWidth = '8.2rem';
        row.appendChild(pw); row.appendChild(el('span', 'pn', it[1])); host.appendChild(row);
      });
    }
    sec(host, 'All games');
    put(host, [['Winner', 'l'], ['Score', ''], ['Loser', 'l'], ['Score', ''], ['Margin', '']], gs.map(function (g) { return [[T[g.w], 'l team'], [f2(g.ws), ''], [T[g.l], 'l'], [f2(g.ls), ''], [f2(g.ws - g.ls), '']]; }));
  }

  function loadLU() {
    fetch('/api/lineups').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var sig = JSON.stringify(d && d.weeks || null);
      if (sig === luSig) return;
      luSig = sig; OUT = null;
      LU = d && d.weeks && Object.keys(d.weeks).length ? d.weeks : null;
      if (LUTABS.indexOf(tab) >= 0) renderCurrent();
    }).catch(function () {});
    fetch('/api/clinch').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      CL = d && d.teams ? d : null;
      if (CL && (tab === 'playoffs' || tab === 'table')) renderCurrent();
    }).catch(function () {});
    fetch('/api/upcoming').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var sig = JSON.stringify(d || null);
      if (sig === upSig) return;
      upSig = sig; OUT = null;
      UP = d && d.matchups && d.lineups ? d : null;
      showAsof();
      if (LUTABS.indexOf(tab) >= 0) renderCurrent();
    }).catch(function () {});
  }

  // ---- Last-updated pill for the live week data ----
  function showAsof() {
    var p = $('asof'), t = UP && UP.asof ? Date.parse(UP.asof) : NaN;
    if (!p || isNaN(t)) { if (p) p.hidden = true; return; }
    try { var dd = getData(); if (!dd.sample && dd.keys.length && UP.week <= Math.max.apply(null, dd.keys.map(Number))) { p.hidden = true; return; } } catch (e) {}
    var mins = Math.max(0, Math.round((Date.now() - t) / 60000)), age;
    if (mins < 2) age = 'just now'; else if (mins < 90) age = mins + ' min ago'; else if (mins < 2880) age = Math.round(mins / 60) + ' h ago'; else age = Math.round(mins / 1440) + ' d ago';
    var dt = new Date(t), day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()], h = dt.getHours(), m = dt.getMinutes();
    $('atxt').textContent = 'Live data ' + day + ' ' + ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m + ' ' + (h < 12 ? 'AM' : 'PM') + ' (' + age + ')';
    p.hidden = false; p.className = 'pill' + (mins > 1440 ? ' stale' : '');
  }
  setInterval(showAsof, 60000);

  // ---- Rank history for the rank race ----
  function rankHistory(d) {
    var hist = {};
    d.rows.forEach(function (r) { hist[r.i] = []; });
    d.keys.forEach(function (n, k) {
      compute(d.teams, subset(d.weeksObj, d.keys.slice(0, k + 1))).forEach(function (r) { hist[r.i].push(r.rank); });
    });
    return hist;
  }

  // ---- Rank race: animated bump chart with a week scrubber ----
  var pinnedTeam = null, raceK = null, raceTimer = null, racePlayed = false;
  function bumpStop() { if (raceTimer) { clearInterval(raceTimer); raceTimer = null; } }
  function renderBump(host, d) {
    bumpStop();
    host.textContent = '';
    var hist = rankHistory(d), n = d.keys.length, rows = d.rows, R = rows.length;
    if (raceK === null || raceK >= n) raceK = n - 1;
    var W = 860, L = 44, RT = 250, T = 34, B = 22, step = 34, pw = W - L - RT, H = T + (R - 1) * step + B;
    var x = function (k) { return L + (n === 1 ? pw / 2 : k * pw / (n - 1)); };
    var y = function (rk) { return T + (rk - 1) * step; };

    var ctl = el('div', 'race-ctl');
    var play = el('button', 'btn race-play', 'Play');
    play.type = 'button';
    var range = document.createElement('input');
    range.type = 'range'; range.min = '0'; range.max = String(n - 1); range.step = '1';
    range.className = 'race-range'; range.setAttribute('aria-label', 'Week shown');
    var lbl = el('span', 'race-lbl');
    ctl.appendChild(play); ctl.appendChild(range); ctl.appendChild(lbl);
    host.appendChild(ctl);

    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'bump', role: 'group', 'aria-label': 'Rank by week for every team' });
    var swrap = el('div', 'scroll'); swrap.appendChild(svg); host.appendChild(swrap);
    for (var rk = 1; rk <= R; rk++) {
      svg.appendChild(sv('line', { x1: L, x2: W - RT + 12, y1: y(rk), y2: y(rk), 'class': 'guide' }));
      svg.appendChild(sv('text', { x: L - 22, y: y(rk) + 4, 'class': 'rk-l' }, String(rk)));
    }
    svg.appendChild(sv('line', { x1: L - 6, x2: W - RT + 12, y1: y(6.5), y2: y(6.5), 'class': 'cutl' }));
    d.keys.forEach(function (wk, k) { svg.appendChild(sv('text', { x: x(k), y: T - 16, 'class': 'wk-l' }, 'Wk ' + wk)); });

    var layer = sv('g', {}); svg.appendChild(layer);
    var hot = pinnedTeam;
    var groups = rows.map(function (r) {
      var g = sv('g', { 'class': 'bl', 'data-i': String(r.i), tabindex: '0', role: 'button', 'aria-label': r.team });
      var pth = sv('path', {}), dts = sv('g', { 'class': 'dts' }), tag = sv('g', { 'class': 'tag' });
      tag.appendChild(sv('text', { x: 0, y: 5, 'class': 'nm' }, r.team));
      g.appendChild(pth); g.appendChild(dts); g.appendChild(tag);
      layer.appendChild(g);
      var G = { i: r.i, g: g, path: pth, dts: dts, tag: tag };
      function setHot(i) { hot = i; svg.classList.toggle('has-sel', i !== null && i !== undefined); draw(raceK); }
      g.addEventListener('mouseenter', function () { setHot(r.i); });
      g.addEventListener('mouseleave', function () { setHot(pinnedTeam); });
      g.addEventListener('focus', function () { setHot(r.i); });
      g.addEventListener('blur', function () { setHot(pinnedTeam); });
      function pin() { pinnedTeam = pinnedTeam === r.i ? null : r.i; setHot(pinnedTeam); }
      g.addEventListener('click', pin);
      g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pin(); } });
      return G;
    });

    function draw(k) {
      raceK = k;
      range.value = String(k);
      lbl.textContent = 'After week ' + d.keys[k];
      var on = hot !== null && hot !== undefined;
      svg.classList.toggle('has-sel', on);
      groups.forEach(function (G) {
        var rr = hist[G.i], rkNow = rr[k];
        G.g.setAttribute('class', 'bl ' + (rkNow <= 2 ? 't-top' : (rkNow <= 6 ? 't-in' : 't-out')) + (on && hot === G.i ? ' on' : ''));
        var pts = [];
        for (var j = 0; j <= k; j++) pts.push([x(j), y(rr[j])]);
        var dstr = '';
        if (pts.length > 1) {
          dstr = 'M' + pts[0][0] + ',' + pts[0][1];
          for (var q = 1; q < pts.length; q++) {
            var mx = (pts[q - 1][0] + pts[q][0]) / 2;
            dstr += ' C' + mx + ',' + pts[q - 1][1] + ' ' + mx + ',' + pts[q][1] + ' ' + pts[q][0] + ',' + pts[q][1];
          }
        }
        G.path.setAttribute('d', dstr);
        G.dts.textContent = '';
        pts.forEach(function (pt, jj) {
          var dg = sv('g', { 'class': 'dt' });
          dg.appendChild(sv('circle', { cx: pt[0], cy: pt[1], r: jj === k ? 11 : 8 }));
          dg.appendChild(sv('text', { x: pt[0], y: pt[1] }, String(rr[jj])));
          G.dts.appendChild(dg);
        });
        G.tag.style.transform = 'translate(' + (x(k) + 18).toFixed(1) + 'px,' + y(rkNow).toFixed(1) + 'px)';
      });
    }

    function stepPlay() {
      if (raceK >= n - 1) { bumpStop(); play.textContent = 'Replay'; return; }
      draw(raceK + 1);
    }
    function startPlay() {
      if (raceTimer) return;
      if (raceK >= n - 1) draw(0);
      play.textContent = 'Pause';
      raceTimer = setInterval(stepPlay, 800);
    }
    play.addEventListener('click', function () {
      if (raceTimer) { bumpStop(); play.textContent = 'Play'; } else startPlay();
    });
    range.addEventListener('input', function () {
      bumpStop(); play.textContent = 'Play';
      draw(parseInt(range.value, 10));
    });

    draw(raceK);
    if (ANIM && !racePlayed) {
      racePlayed = true;
      draw(0);
      onView(svg, startPlay);
    }
  }

  // ---- Baseball cards: one per manager, drawn on canvas so the PNG is the card ----
  var CW = 750, CH = 1050;
  function fitText(g, text, x, yy, maxW) {
    var f = g.font, size = parseInt(/(\d+)px/.exec(f)[1], 10);
    while (g.measureText(text).width > maxW && size > 14) { size -= 2; g.font = f.replace(/\d+px/, size + 'px'); }
    g.fillText(text, x, yy);
  }
  function initials(name) {
    var p = name.split(/[\s_\-]+/).filter(Boolean);
    return (p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2)).toUpperCase();
  }
  function cardRows() {
    var d = getData();
    if (d.sample) return null;
    var rows = analyze(d), lx = luReady(document.createElement('div')), o = null, all = [];
    if (lx) { try { o = getOutlook(lx); all = starters(lx); } catch (e) { o = null; } }
    var recs = histRecs();
    return rows.filter(function (r) { return MGR26[r.team]; }).map(function (r) {
      var mgr = MGR26[r.team], best = null;
      d.keys.forEach(function (wk) { var s = r.wk[wk].pts; if (!best || s > best.pts) best = { pts: s, wk: wk }; });
      var by = {};
      all.filter(function (p) { return p.t === r.i; }).forEach(function (p) { by[p.name] = (by[p.name] || 0) + p.pts; });
      var star = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; })[0];
      var odds = null;
      if (o && o.sim) { var c = 0, N = o.sim.N, arr = o.sim.inP[r.i]; for (var s = 0; s < N; s++) c += arr[s]; odds = c / N; }
      var mine = recs.filter(function (q) { return q.r.mgr === mgr; }), w = 0, l = 0;
      mine.forEach(function (q) { w += q.r.w; l += q.r.l; });
      return {
        mgr: mgr, team: r.team, rank: r.rank, w: r.w, l: r.l, lp: r.lp, pf: r.pts, best: best,
        star: star ? { name: star, pts: by[star] } : null, odds: odds,
        titles: mine.filter(function (q) { return q.r.r === 1; }).length,
        career: (w + l) ? w / (w + l) : null
      };
    });
  }
  function rrect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function spaced(g, text, x, yy, px) {
    if ('letterSpacing' in g) { g.letterSpacing = px + 'px'; g.fillText(text, x, yy); g.letterSpacing = '0px'; }
    else g.fillText(text, x, yy);
  }
  function drawCard(cv, k, wk) {
    var g = cv.getContext('2d'), W = CW, H = CH;
    var INK = '#1d1410', PAPER = '#f6eedc', CREAM = '#fbf5e6', RED = '#a3271c', GOLD = '#c8962c', GOLDL = '#f4d983', MUTE = '#7a6450';
    var DISP = '"Barlow Condensed", "Arial Narrow", Impact, sans-serif', BODY = 'Barlow, system-ui, sans-serif';
    var tier = k.rank <= 2 ? ['#f9de8f', '#c08a1e', '#3a2506'] : (k.rank <= 6 ? ['#d24b68', '#7a1a33', '#fff4f6'] : ['#8d80a0', '#3b3247', '#f5f1f8']);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.clearRect(0, 0, W, H);
    // paper and gold foil edge
    g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
    var fg = g.createLinearGradient(0, 0, W, H); fg.addColorStop(0, GOLDL); fg.addColorStop(0.5, GOLD); fg.addColorStop(1, GOLDL);
    g.fillStyle = fg; rrect(g, 14, 14, W - 28, H - 28, 30); g.fill();
    g.fillStyle = PAPER; rrect(g, 32, 32, W - 64, H - 64, 22); g.fill();
    g.strokeStyle = INK; g.lineWidth = 2; rrect(g, 46, 46, W - 92, H - 92, 14); g.stroke();
    // header
    g.fillStyle = RED; g.font = '600 22px ' + DISP; spaced(g, 'THE DEAN ASSOCIATION  ·  2026 SEASON', W / 2, 92, 3);
    g.strokeStyle = GOLD; g.lineWidth = 2; g.beginPath(); g.moveTo(96, 118); g.lineTo(W - 96, 118); g.stroke();
    // name plate
    g.fillStyle = INK; g.font = '700 110px ' + DISP; fitText(g, k.mgr.toUpperCase(), W / 2, 206, W - 170);
    g.fillStyle = MUTE; g.font = 'italic 500 32px ' + BODY; fitText(g, k.team, W / 2, 256, W - 170);
    // hero panel
    var px = 96, py = 288, pw = W - 192, ph = 340;
    var hg = g.createLinearGradient(0, py, 0, py + ph); hg.addColorStop(0, tier[0]); hg.addColorStop(1, tier[1]);
    g.save(); rrect(g, px, py, pw, ph, 18); g.clip();
    g.fillStyle = hg; g.fillRect(px, py, pw, ph);
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 14;
    for (var sx = -ph; sx < pw + ph; sx += 46) { g.beginPath(); g.moveTo(px + sx, py + ph); g.lineTo(px + sx + ph, py); g.stroke(); }
    g.restore();
    g.fillStyle = tier[2]; g.font = '700 240px ' + DISP; g.globalAlpha = 0.92;
    g.fillText(initials(k.mgr), W / 2, py + ph / 2 + 12); g.globalAlpha = 1;
    // rank badge
    g.fillStyle = INK; g.beginPath(); g.arc(px + pw - 62, py + 62, 50, 0, Math.PI * 2); g.fill();
    g.strokeStyle = GOLD; g.lineWidth = 4; g.stroke();
    g.fillStyle = CREAM; g.font = '700 54px ' + DISP; g.fillText('#' + k.rank, px + pw - 62, py + 66);
    // signature banner
    g.fillStyle = INK; rrect(g, px, 648, pw, 52, 12); g.fill();
    g.fillStyle = GOLDL; g.font = '600 22px ' + DISP; spaced(g, 'STAR', px + 56, 674, 3);
    g.fillStyle = CREAM; g.font = '600 30px ' + DISP;
    fitText(g, k.star ? k.star.name.toUpperCase() + '   ' + f1(k.star.pts) + ' PTS' : 'NO STAR YET', W / 2 + 40, 675, pw - 200);
    // headline stats
    var heads = [['LEAGUE PTS', String(k.lp)], ['RECORD', k.w + '-' + k.l], ['PLAYOFF ODDS', k.odds !== null ? Math.round(k.odds * 100) + '%' : '—']];
    var cw = pw / 3;
    heads.forEach(function (c, i) {
      var cx = px + cw * i + cw / 2;
      g.fillStyle = MUTE; g.font = '600 22px ' + DISP; spaced(g, c[0], cx, 736, 3);
      g.fillStyle = INK; g.font = '700 86px ' + DISP; fitText(g, c[1], cx, 800, cw - 16);
    });
    g.strokeStyle = 'rgba(29,20,16,0.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(px, 846); g.lineTo(px + pw, 846); g.stroke();
    // secondary stats
    var secStats = [['PTS FOR', f1(k.pf)], ['BEST WK', k.best ? f1(k.best.pts) : '—'], ['TITLES', String(k.titles)], ['CAREER W%', k.career !== null ? (k.career * 100).toFixed(1) + '%' : '—']];
    var sw = pw / 4;
    secStats.forEach(function (c, i) {
      var cx = px + sw * i + sw / 2;
      g.fillStyle = MUTE; g.font = '600 19px ' + DISP; spaced(g, c[0], cx, 878, 2);
      g.fillStyle = INK; g.font = '700 44px ' + DISP; fitText(g, c[1], cx, 920, sw - 12);
    });
    g.fillStyle = MUTE; g.font = 'italic 500 22px ' + BODY;
    g.fillText('Through week ' + wk + '  ·  Terry’s Table', W / 2, H - 92);
  }
  var cardIO = null;
  function paintCard(cv) {
    if (cv._painted) return;
    var go = function () { cv._painted = true; drawCard(cv, cv._job.k, cv._job.wk); };
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(go); else go();
  }
  function renderCards() {
    var host = $('x-cards'); if (!host) return;
    var data = null;
    try { data = cardRows(); } catch (e) { data = null; }
    if (!data || !data.length) { host.textContent = ''; host._sig = ''; host.appendChild(el('p', 'cap', 'Cards appear once real weeks are loaded.')); return; }
    var wk = getData().keys.slice(-1)[0], sig = wk + '|' + JSON.stringify(data);
    if (host._sig === sig && host.querySelector('canvas')) return;
    host._sig = sig; host.textContent = '';
    host.appendChild(el('p', 'cap keep', 'One card per manager. Download saves a PNG for the group chat. Share opens your share sheet where the browser supports it.'));
    var canShare = false;
    try { canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([new Blob([''], { type: 'image/png' })], 'c.png', { type: 'image/png' })] })); } catch (e) { canShare = false; }
    if (cardIO) cardIO.disconnect();
    cardIO = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { cardIO.unobserve(e.target); paintCard(e.target); } });
    }, { rootMargin: '300px 0px' }) : null;
    var grid = el('div', 'cards-grid');
    data.forEach(function (k) {
      var box = el('div', 'bcard');
      var cv = document.createElement('canvas');
      cv.width = CW; cv.height = CH; cv.className = 'bcard-cv'; cv._job = { k: k, wk: wk };
      cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', k.mgr + ' baseball card');
      box.appendChild(cv);
      if (cardIO) cardIO.observe(cv); else paintCard(cv);
      var name = 'terrystable-' + k.mgr.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-wk' + wk + '.png';
      function blob(cb) { if (!cv._painted) { cv._painted = true; drawCard(cv, k, wk); } cv.toBlob(cb, 'image/png'); }
      var btns = el('div', 'bcard-btns');
      var dl = el('button', 'btn', 'Download PNG'); dl.type = 'button';
      dl.addEventListener('click', function () {
        blob(function (b) {
          if (!b) return;
          var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name;
          document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        });
      });
      btns.appendChild(dl);
      if (canShare) {
        var sh = el('button', 'btn', 'Share'); sh.type = 'button';
        sh.addEventListener('click', function () {
          blob(function (b) {
            if (!b) return;
            var f = new File([b], name, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: k.mgr }).catch(function () {});
          });
        });
        btns.appendChild(sh);
      }
      box.appendChild(btns);
      grid.appendChild(box);
    });
    host.appendChild(grid);
  }
  // ---- Ticker ----
  var tickSig = '';
  function updateTicker() {
    var d = getData(), tk = $('ticker');
    if (d.sample) { tk.hidden = true; return; }
    var n = d.keys[d.keys.length - 1], items = [], rows = d.rows;
    d.weeksObj[n].forEach(function (m) {
      var a = Math.round(num(m.as) * 100), b = Math.round(num(m.bs) * 100);
      var hi = a >= b ? [m.a, m.as] : [m.b, m.bs], lo = a >= b ? [m.b, m.bs] : [m.a, m.as];
      items.push([[d.teams[hi[0]] + ' ', false], [f2(num(hi[1])), true], [a === b ? ' ties ' : ' def. ', false], [d.teams[lo[0]] + ' ', false], [f2(num(lo[1])), true]]);
    });
    var tops = rows.filter(function (r) { return r.wk[n].top; });
    items.push([['Top scorer: ', false], [tops.map(function (r) { return r.team; }).join(' and '), true], [' ' + f2(tops[0].wk[n].pts), false]]);
    items.push([['Leader: ', false], [rows[0].team, true], [' ' + rows[0].lp + ' League Pts', false]]);
    var sig = JSON.stringify(items);
    if (sig === tickSig && !tk.hidden) return;
    tickSig = sig;
    $('tktag').textContent = 'Week ' + n + ' final';
    var track = $('tk'); track.textContent = '';
    var chars = 0;
    for (var rep = 0; rep < 2; rep++) {
      items.forEach(function (parts) {
        var it = el('span', 'tk-item');
        parts.forEach(function (p) { it.appendChild(p[1] ? el('b', '', p[0]) : document.createTextNode(p[0])); if (rep === 0) chars += p[0].length + 4; });
        track.appendChild(it);
      });
    }
    track.style.animationDuration = Math.max(28, Math.round(chars * 0.2)) + 's';
    tk.hidden = false;
  }

  // ---- Tabs, view mode, status ----
  var RENDER = {
    table: function () { renderTable(); renderHighlights(); },
    races: renderRaces,
    playoffs: function () { renderPlayoffs(); renderPower(); },
    matchups: function () { renderNext(); renderMatchups(); renderTotw(); renderRecap(); renderPlayers(); },
    alltime: function () { renderAlltime(); renderProfiles(); renderCards(); renderSeasons(); renderRecords(); }
  };

  // ---- Collapsible sections: every .ph heading folds the content under it ----
  var OPENSEC = {}, csecBusy = false, csecQueued = false;

  function infoify() {
    document.querySelectorAll('main p.cap:not(.keep):not([data-inf]), main p.meta:not(.keep):not([data-inf])').forEach(function (p) {
      if (p.id === 'tmeta' || p.textContent.length <= 70) return;
      p.setAttribute('data-inf', '1'); p.classList.add('inf');
      var b = el('button', 'info', 'i'); b.type = 'button'; b.setAttribute('aria-label', 'More info'); b.setAttribute('aria-expanded', 'false');
      b.addEventListener('click', function () { var on = p.classList.toggle('show'); b.setAttribute('aria-expanded', String(on)); });
      p.parentNode.insertBefore(b, p);
    });
  }
  // Give every picker and slider an accessible name, from the visible label next to it when there is one.
  function labelFields() {
    document.querySelectorAll('main select:not([aria-label]), main input:not([aria-label])').forEach(function (f) {
      var p = f.previousElementSibling;
      if (p && p.tagName === 'LABEL' && p.textContent.trim()) { f.setAttribute('aria-label', p.textContent.trim()); return; }
      if (f.type === 'range') { f.setAttribute('aria-label', f.id === 'rslide' ? 'Timeline' : 'Slider'); return; }
      var o = f.options && f.options[0] ? f.options[0].textContent : '';
      f.setAttribute('aria-label', /^Week/.test(o) ? 'Week' : (/^\d{4}$/.test(o) ? 'Season' : (/season/i.test(o) ? 'Seasons' : 'Choose')));
    });
  }
  function collapsify() {
    csecBusy = true;
    try {
      var secs = document.querySelectorAll('main section[id^="p-"]');
      Array.prototype.forEach.call(secs, function (sc) {
        if (sc.hidden) return;
        var tabId = sc.id.slice(2), heads = Array.prototype.filter.call(sc.querySelectorAll('.ph'), function (h) { return !h.closest('details.csec'); });
        if (!heads.length) return;
        var firstInTab = !sc.querySelector('details.csec');
        heads.forEach(function (h, idx) {
          var parent = h.parentNode, det = el('details', 'csec'), sm = el('summary'), body = el('div', 'cbody'), nodes = [], n = h.nextSibling, key = tabId + ':' + h.textContent;
          while (n && !(n.nodeType === 1 && n.classList.contains('ph'))) { nodes.push(n); n = n.nextSibling; }
          parent.insertBefore(det, h);
          sm.appendChild(h); det.appendChild(sm); nodes.forEach(function (x) { body.appendChild(x); }); det.appendChild(body);
          var lead = sc.querySelector('.ph[data-open]');
          det.open = key in OPENSEC ? OPENSEC[key] : (lead ? h === lead : (firstInTab && idx === 0));
          det.addEventListener('toggle', function () { OPENSEC[key] = det.open; });
        });
        var all = sc.querySelectorAll('details.csec');
        if (all.length >= 3 && !sc.querySelector('.cctl')) {
          var bar = el('div', 'cctl'), a = el('button', '', 'Expand all'), c = el('button', '', 'Collapse all');
          a.addEventListener('click', function () { sc.querySelectorAll('details.csec').forEach(function (d) { d.open = true; }); });
          c.addEventListener('click', function () { sc.querySelectorAll('details.csec').forEach(function (d) { d.open = false; }); });
          bar.appendChild(a); bar.appendChild(c);
          var first = sc.querySelector('details.csec'); first.parentNode.insertBefore(bar, first);
        }
      });
    } finally { csecBusy = false; }
  }
  (function () {
    var m = document.querySelector('main');
    if (!m || !window.MutationObserver) return;
    new MutationObserver(function () {
      if (csecBusy || csecQueued) return;
      csecQueued = true;
      requestAnimationFrame(function () { csecQueued = false; collapsify(); infoify(); labelFields(); });
    }).observe(m, { childList: true, subtree: true });
  })();


  // ---- Records: weekly scores from the manual sheet (2021 to 2025) plus this season ----
  var HW = null;
  function loadHW(cb) {
    if (HW) { cb(); return; }
    fetch('/api/history_weeks').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      HW = (d && d.seasons) || {}; cb();
    }).catch(function () { HW = {}; cb(); });
  }
  function renderRecords() {
    var host = $('x-records'); host.textContent = '';
    if (!HW) { host.appendChild(el('p', 'cap', 'Loading records...')); loadHW(function () { if (tab === 'alltime') RENDER.alltime(); }); return; }
    var ys = Object.keys(HW).sort();
    if (!ys.length) { host.appendChild(el('p', 'cap', 'No weekly history loaded yet.')); return; }
    var d = getData(), cur = d.sample ? [] : d.rows, games = [], M = {}, W = {}, i;
    ys.forEach(function (y) {
      var ms = Object.keys(HW[y]);
      for (var wk = 0; wk < 14; wk++) {
        var sc = ms.map(function (m) { return HW[y][m].p[wk]; }), mx = Math.max.apply(null, sc), sum = 0;
        sc.forEach(function (v) { sum += v; });
        W[y + ':' + (wk + 1)] = { avg: sum / sc.length, hi: mx, lo: Math.min.apply(null, sc) };
        ms.forEach(function (m) {
          var o = M[m] || (M[m] = { n: m, lp: 0, w: 0, g: 0, pts: 0, tops: 0, ys: {}, best: 0 });
          var v = HW[y][m].p[wk];
          o.lp += HW[y][m].lp[wk]; o.w += HW[y][m].w[wk]; o.g++; o.pts += v; o.ys[y] = 1;
          if (v === mx) { o.tops++; }
          games.push({ y: y, wk: wk + 1, m: m, v: v, top: v === mx });
        });
      }
    });
    cur.forEach(function (r) {
      Object.keys(r.wk).forEach(function (n) { games.push({ y: '2026', wk: +n, m: MGR26[r.team] || r.team, v: r.wk[n].pts, top: !!r.wk[n].top }); });
    });
    var cap = el('p', 'cap', 'Weekly scores for ' + ys[0] + ' to ' + ys[ys.length - 1] + ' come from the old manual Terry Table sheet, plus this season as it plays. League points use today\'s 3-point rule. Final standings stay on the Yahoo numbers.');
    cap.style.marginTop = '0'; host.appendChild(cap);

    sec(host, 'League points since ' + ys[0], true);
    var list = Object.keys(M).map(function (k) { return M[k]; }).sort(function (a, b) { return (b.lp / b.g) - (a.lp / a.g); });
    barList(host, list.map(function (m) { var sn = Object.keys(m.ys).length; return { t: m.n, sub: m.w + '-' + (m.g - m.w), v: m.lp / sn, txt: (m.lp / sn).toFixed(1), tot: m.lp, avg: m.pts / m.g }; }),
      { sorts: [['LP / season', function (x, y) { return y.v - x.v; }], ['Total LP', function (x, y) { return y.tot - x.tot; }], ['Avg pts', function (x, y) { return y.avg - x.avg; }]] });

    sec(host, 'Highest single weeks');
    function gl(arr) { return arr.slice(0, 10).map(function (g, k) { return [[String(k + 1), 'rk'], [g.m, 'l team'], [g.y + ' Wk ' + g.wk, 'l'], [g.v.toFixed(2), 'pos']]; }); }
    var hi = games.slice().sort(function (a, b) { return b.v - a.v; });
    put(host, [['#', ''], ['Manager', 'l'], ['When', 'l'], ['Pts', '']], gl(hi));

    // luck and consistency from all-play
    var LK = {};
    ys.forEach(function (y) {
      var ms = Object.keys(HW[y]);
      ms.forEach(function (m) {
        var o = LK[m] || (LK[m] = { n: m, w: 0, ex: 0, ps: [] });
        for (var k = 0; k < 14; k++) {
          var v = HW[y][m].p[k], beat = 0;
          ms.forEach(function (z) { if (z !== m) { var u = HW[y][z].p[k]; beat += v > u ? 1 : (v === u ? 0.5 : 0); } });
          o.ex += beat / (ms.length - 1); o.w += HW[y][m].w[k]; o.ps.push(v);
        }
      });
    });
    var lk = Object.keys(LK).map(function (k) { var o = LK[k], mu = mean(o.ps), sd = Math.sqrt(mean(o.ps.map(function (v) { return (v - mu) * (v - mu); }))); o.mu = mu; o.sd = sd; o.lo = Math.min.apply(null, o.ps); o.hi = Math.max.apply(null, o.ps); o.luck = o.w - o.ex; return o; });
    sec(host, 'Consistency since ' + ys[0]);
    put(host, [['Manager', 'l'], ['Avg', ''], ['Spread', ''], ['Low', ''], ['High', '']],
      lk.slice().sort(function (a, b) { return a.sd - b.sd; }).map(function (o) { return [[o.n, 'l team'], [o.mu.toFixed(1), ''], [o.sd.toFixed(1), ''], [o.lo.toFixed(1), ''], [o.hi.toFixed(1), '']]; }));
  }


  // ---- Team profile sheet ----
  function mlOdds(p) {
    p = Math.min(0.99, Math.max(0.01, p * 1.0476));
    var v = p >= 0.5 ? -100 * p / (1 - p) : 100 * (1 - p) / p;
    v = Math.round(v / 5) * 5;
    if (v > -100 && v < 100) v = v < 0 ? -100 : 100;
    return (v > 0 ? '+' : '') + v;
  }
  function luX() {
    var d = getData();
    if (d.sample || !LU) return null;
    var keys = d.keys.filter(function (n) { return LU[n]; });
    return keys.length ? { d: d, keys: keys } : null;
  }
  function teamIdx(txt) {
    var d = getData(), t = (txt || '').replace(/\s+/g, ' ').trim(), k, i;
    if (!t || d.sample) return -1;
    t = t.replace(/\s*(Bye|Out)$/, '');
    for (i = 0; i < d.teams.length; i++) if (d.teams[i] === t) return i;
    for (i = 0; i < d.teams.length; i++) if (t.length > 3 && d.teams[i].indexOf(t) === 0) return i;
    for (k in MGR26) if (MGR26[k] === t) for (i = 0; i < d.teams.length; i++) if (d.teams[i] === k) return i;
    return -1;
  }
  function countUp(node, to, fmt) {
    if (!ANIM) { node.textContent = fmt(to); return; }
    var t0 = null;
    function step(ts) {
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / 700), e = 1 - Math.pow(1 - k, 3);
      node.textContent = fmt(to * e);
      if (k < 1) requestAnimationFrame(step); else node.textContent = fmt(to);
    }
    requestAnimationFrame(step);
  }
  function tstats(r, keys) {
    var p = keys.map(function (n) { return r.wk[n].pts; }), mu = mean(p);
    return { p: p, avg: mu, hi: Math.max.apply(null, p), lo: Math.min.apply(null, p), sd: Math.sqrt(mean(p.map(function (v) { return (v - mu) * (v - mu); }))), lp: r.lp, w: r.w };
  }
  var SHEET = { i: -1, vs: -1 };
  function ensureSheet() {
    var ov = $('ov');
    if (ov) return ov;
    ov = el('div', 'ov'); ov.id = 'ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.appendChild(el('div', 'sheet'));
    ov.addEventListener('click', function (e) { if (e.target === ov) closeSheet(); });
    document.body.appendChild(ov);
    return ov;
  }
  function closeSheet() { var ov = $('ov'); if (ov) ov.classList.remove('on'); document.body.style.overflow = ''; SHEET.i = -1; }
  function openTeam(i, vs) {
    var d = getData(); if (d.sample || i < 0) return;
    var ov = ensureSheet(), sh = ov.firstChild, r = null;
    d.rows.forEach(function (q) { if (q.i === i) r = q; });
    if (!r) return;
    SHEET.i = i; SHEET.vs = vs === undefined ? -1 : vs;
    sh.textContent = '';
    var keys = d.keys, x = luX(), o = null;
    if (x) { try { o = getOutlook(x); } catch (e) { o = null; } }
    var mg = MGR26[r.team] || '';
    var hd = el('div', 'sh-h'), ht = el('div'), h3 = el('h3', '', r.team);
    ht.appendChild(h3); ht.appendChild(el('small', '', (mg ? mg + '  ·  ' : '') + r.w + '-' + r.l + (r.t ? '-' + r.t : '') + '  ·  Rank ' + r.rank));
    var xb = el('button', 'sh-x', '×'); xb.type = 'button'; xb.setAttribute('aria-label', 'Close');
    xb.addEventListener('click', closeSheet);
    hd.appendChild(ht); hd.appendChild(xb); sh.appendChild(hd);
    var b = el('div', 'sh-b'); sh.appendChild(b);
    // tiles
    var po = null, by = null, med = null;
    if (o && o.sim && o.sim.pos[i]) {
      var pr = 0, bb = 0; o.sim.pos[i].forEach(function (c, k) { if (k < 6) pr += c; if (k < 2) bb += c; });
      po = pr / o.sim.N * 100; by = bb / o.sim.N * 100;
      var lps = o.sim.lp[i].slice().sort(function (a, c) { return a - c; }); med = pctile(lps, 0.5);
    }
    var tiles = el('div', 'tiles'), TS = tstats(r, keys);
    [['Rank', r.rank, function (v) { return String(Math.round(v)); }], ['League pts', r.lp, function (v) { return String(Math.round(v)); }],
     ['Avg pts', TS.avg, function (v) { return v.toFixed(1); }], ['Playoffs', po, function (v) { return Math.round(v) + '%'; }]].forEach(function (t) {
      var c = el('div', 'tile'), n = el('b', '', '0'); c.appendChild(n); c.appendChild(el('span', '', t[0])); tiles.appendChild(c);
      if (t[1] === null) n.textContent = '–'; else countUp(n, t[1], t[2]);
    });
    b.appendChild(tiles);
    var rd = roadDom(i); if (rd) { b.appendChild(el('div', 'sh-t', 'Road to the playoffs')); b.appendChild(rd); }
    // form chips
    b.appendChild(el('div', 'sh-t', 'Form'));
    var ch = el('div', 'chips');
    keys.forEach(function (n) {
      var w = r.wk[n], c = el('div', 'chip ' + (w.res === 'W' ? 'w' : (w.res === 'L' ? 'l' : '')), w.res + ' ' + w.pts.toFixed(1));
      c.appendChild(el('i', '', 'Wk ' + n)); ch.appendChild(c);
    });
    b.appendChild(ch);
    // sparkline vs league average
    var W = 340, H = 90, L = 24, R = 10, T = 12, B = 18, all = [];
    keys.forEach(function (n) { all.push(r.wk[n].pts, r.wk[n].avg); });
    var mn = Math.min.apply(null, all) - 8, mx = Math.max.apply(null, all) + 8;
    var X = function (k) { return keys.length < 2 ? (L + W - R) / 2 : L + (W - L - R) * k / (keys.length - 1); }, Y = function (v) { return T + (H - T - B) * (1 - (v - mn) / (mx - mn)); };
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'sh-svg', role: 'img' });
    svg.appendChild(sv('polyline', { 'class': 'av', points: keys.map(function (n, k) { return X(k).toFixed(1) + ',' + Y(r.wk[n].avg).toFixed(1); }).join(' ') }));
    var ln = sv('polyline', { 'class': 'ln', points: keys.map(function (n, k) { return X(k).toFixed(1) + ',' + Y(r.wk[n].pts).toFixed(1); }).join(' ') });
    svg.appendChild(ln);
    keys.forEach(function (n, k) {
      svg.appendChild(sv('circle', { cx: X(k), cy: Y(r.wk[n].pts), r: 4, 'class': 'dt' }));
      svg.appendChild(sv('text', { x: X(k), y: H - 4, 'text-anchor': 'middle' }, 'W' + n));
    });
    svg.appendChild(sv('text', { x: 2, y: Y(mean(keys.map(function (n) { return r.wk[n].avg; }))) + 4 }, 'avg'));
    b.appendChild(svg);
    if (ANIM) { try { var len = ln.getTotalLength(); ln.style.strokeDasharray = len; ln.style.strokeDashoffset = len; ln.getBoundingClientRect(); ln.style.transition = 'stroke-dashoffset 1s ease'; requestAnimationFrame(function () { ln.style.strokeDashoffset = 0; }); } catch (e) {} }
    // next game
    var opp = -1, m0 = null;
    if (o && o.up) o.up.matchups.forEach(function (m) { if (m.a === i) { opp = m.b; m0 = m; } else if (m.b === i) { opp = m.a; m0 = m; } });
    if (o && opp >= 0) {
      var sm = Math.max(0.01, o.fm.sigma * Math.sqrt(o.fill[i].rem + o.fill[opp].rem)), fa = o.f5[i], fb = o.f5[opp], pa = phi((fa - fb) / sm), mg2 = Math.round(Math.abs(fa - fb) * 2) / 2;
      b.appendChild(el('div', 'sh-t', 'Week ' + o.up.week + ' vs ' + d.teams[opp]));
      var ob = el('div', 'oddsb'), s1 = el('div', 'obtn' + (pa >= 0.5 ? '' : ' dog'), (mg2 === 0 ? 'PK' : (fa >= fb ? '-' : '+') + mg2.toFixed(1))); s1.appendChild(el('small', '', 'Spread'));
      var s2 = el('div', 'obtn' + (pa >= 0.5 ? '' : ' dog'), mlOdds(pa)); s2.appendChild(el('small', '', 'Money line'));
      ob.appendChild(s1); ob.appendChild(el('span', 'mid', f1(fa) + ' to ' + f1(fb))); ob.appendChild(s2); b.appendChild(ob);
    }
    if (po !== null) {
      b.appendChild(el('div', 'sh-t', 'Season odds'));
      var rr = el('div', 'chips');
      [['Playoffs', Math.round(po) + '%'], ['Bye', Math.round(by) + '%'], ['Median final LP', String(med)]].forEach(function (z) { var c = el('div', 'chip', z[1]); c.appendChild(el('i', '', z[0])); rr.appendChild(c); });
      b.appendChild(rr);
    }
    // manager history
    var hh = el('div'); b.appendChild(hh);
    function hist() {
      if (!HIST || SHEET.i !== i || !mg) return;
      var yrs = histYears(), n = 0, t1 = 0, w = 0, l = 0, best = 99;
      yrs.forEach(function (y) { HIST[y].forEach(function (q) { if (q.mgr === mg) { n++; w += q.w; l += q.l; if (q.r === 1) t1++; best = Math.min(best, q.r); } }); });
      if (!n) return;
      hh.textContent = ''; hh.appendChild(el('div', 'sh-t', mg + ' all-time'));
      var cc = el('div', 'chips');
      [[String(n), 'Seasons'], [String(t1), 'Titles'], ['#' + best, 'Best finish'], [w + '-' + l, 'Record']].forEach(function (z) { var c = el('div', 'chip', z[0]); c.appendChild(el('i', '', z[1])); cc.appendChild(c); });
      hh.appendChild(cc);
    }
    if (HIST) hist(); else loadHist(hist);
    // compare
    b.appendChild(el('div', 'sh-t', 'Compare'));
    var sel = el('select', 'sh-sel'), o0 = el('option', '', 'Pick a team'); o0.value = '-1'; sel.appendChild(o0);
    d.rows.forEach(function (q) { if (q.i !== i) { var op = el('option', '', q.team); op.value = String(q.i); if (q.i === SHEET.vs) op.selected = true; sel.appendChild(op); } });
    b.appendChild(sel);
    var cw = el('div'); b.appendChild(cw);
    function compare() {
      cw.textContent = '';
      var j = SHEET.vs; if (j < 0) return;
      var r2 = null; d.rows.forEach(function (q) { if (q.i === j) r2 = q; });
      var A = TS, Bt = tstats(r2, keys), sg = o ? o.fm.sigma : 19.1, mu1 = o ? o.mu[i] : A.avg, mu2 = o ? o.mu[j] : Bt.avg;
      var pA = phi((mu1 - mu2) / (sg * Math.SQRT2)), spd = Math.round(Math.abs(mu1 - mu2) * 2) / 2;
      var ob2 = el('div', 'oddsb');
      var a1 = el('div', 'obtn' + (pA >= 0.5 ? '' : ' dog'), mlOdds(pA)); a1.appendChild(el('small', '', shortName(r.team, 14)));
      var a2 = el('div', 'obtn' + (pA >= 0.5 ? ' dog' : ''), mlOdds(1 - pA)); a2.appendChild(el('small', '', shortName(r2.team, 14)));
      ob2.appendChild(a1); ob2.appendChild(el('span', 'mid', (spd === 0 ? 'PK' : (pA >= 0.5 ? shortName(r.team, 10) : shortName(r2.team, 10)) + ' -' + spd.toFixed(1))));
      ob2.appendChild(a2); cw.appendChild(ob2);
      [['League pts', A.lp, Bt.lp, 0], ['Avg pts', A.avg, Bt.avg, 1], ['High week', A.hi, Bt.hi, 1], ['Low week', A.lo, Bt.lo, 1], ['Spread (lower is steadier)', A.sd, Bt.sd, 1], ['Wins', A.w, Bt.w, 0]].forEach(function (m) {
        var mxv = Math.max(m[1], m[2], 1), row = el('div', 'cmpr');
        var lb = el('div', 'lb'); lb.appendChild(el('span', '', m[0])); row.appendChild(lb);
        [[m[1], ''], [m[2], ' b']].forEach(function (z) {
          var bar = el('div', 'bar2' + z[1]), fill2 = el('i'); bar.appendChild(fill2); bar.appendChild(el('span', '', m[3] ? z[0].toFixed(1) : String(Math.round(z[0]))));
          row.appendChild(bar);
          setTimeout(function () { fill2.style.width = (z[0] / mxv * 70).toFixed(1) + '%'; }, 30);
        });
        cw.appendChild(row);
      });
    }
    sel.addEventListener('change', function () { SHEET.vs = parseInt(sel.value, 10); compare(); });
    compare();
    ov.classList.add('on'); document.body.style.overflow = 'hidden'; sh.scrollTop = 0;
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('td.team, .mu-h .l, .mu-h .r, .tl') : null;
    if (!t || t.closest('#ov')) return;
    var txt = '';
    for (var k = 0; k < t.childNodes.length; k++) if (t.childNodes[k].nodeType === 3) txt += t.childNodes[k].nodeValue;
    var i = teamIdx(txt || t.textContent);
    if (i >= 0) { e.preventDefault(); openTeam(i); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  function renderCurrent() { if (!replaying) RENDER[tab](); if (loaded && !replaying) updateTicker(); }
  var GROUPS = [
    ['standings', ['table', 'races', 'playoffs']],
    ['week', ['matchups']],
    ['history', ['alltime']]
  ];
  function groupOf(t) { for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i][1].indexOf(t) >= 0) return GROUPS[i]; return GROUPS[0]; }
  function setTab(t) {
    if (replaying) return;
    if (t !== 'races') raceStop();
    tab = t;
    var g = groupOf(t);
    GROUPS.forEach(function (G) {
      $('g-' + G[0]).setAttribute('aria-selected', String(G === g));
      G[1].forEach(function (k) { $('tab-' + k).hidden = G !== g; });
    });
    $('subnav').hidden = g[1].length < 2;
    TABS.forEach(function (k) {
      $('p-' + k).hidden = k !== t;
      $('tab-' + k).setAttribute('aria-selected', String(k === t));
    });
    renderCurrent();
  }
  document.querySelectorAll('#subnav button').forEach(function (b) {
    b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
  });
  document.querySelectorAll('#gnav button').forEach(function (b) {
    b.addEventListener('click', function () {
      var key = b.getAttribute('data-group'), g = GROUPS.filter(function (G) { return G[0] === key; })[0];
      setTab(g[1].indexOf(tab) >= 0 ? tab : g[1][0]);
    });
  });
  $('goduel').addEventListener('click', function () { raceStop(); RC.view = 'duel'; RC.t = 0; setTab('races'); });
  $('toggle').addEventListener('click', function () {
    showWeeks = !showWeeks;
    $('toggle').setAttribute('aria-pressed', String(showWeeks));
    $('toggle').textContent = showWeeks ? 'Hide weeks' : 'Show weeks';
    $('t').className = showWeeks ? 'show' : '';
  });

  // Season replay: rebuild the standings week by week and let the rows re-rank.
  $('replay').addEventListener('click', function () {
    var d = getData(), total = d.keys.length, btn = $('replay');
    if (replaying || total < 2) return;
    replaying = true; btn.disabled = true;
    var k = 1;
    (function step() {
      renderTable(k);
      btn.textContent = 'Week ' + k + ' of ' + total;
      if (k < total) { k++; setTimeout(step, 1900); }
      else setTimeout(function () { replaying = false; btn.disabled = false; btn.textContent = 'Replay season'; renderTable(); }, 1900);
    })();
  });

  function setStatus(s, err) {
    $('stxt').textContent = s;
    $('status').className = 'pill' + (err ? ' err' : '');
  }
  function setMobile(on, remember) {
    $('page').classList.toggle('mv', on);
    $('mv').setAttribute('aria-pressed', String(on));
    $('mv').textContent = on ? 'Desktop view' : 'Mobile view';
    if (remember) { try { localStorage.setItem('terry-mv', on ? '1' : '0'); } catch (e) {} }
  }
  $('mv').addEventListener('click', function () { setMobile(!$('page').classList.contains('mv'), true); });
  var pref = null;
  try { pref = localStorage.getItem('terry-mv'); } catch (e) {}
  setMobile(pref === null ? window.innerWidth < 600 : pref === '1', false);

  // ---- Splash ----
  var splash = $('splash');
  function finishIntro() {
    if (introGo && loaded) setTimeout(function () { $('page').classList.remove('intro', 'go'); }, 4200);
  }
  function closeSplash() {
    if (!splash || !splash.parentNode) return;
    if (!introGo) { introGo = true; introUntil = performance.now() + (ANIM ? 1200 : 0); $('page').classList.add('go'); finishIntro(); }
    splash.classList.add('out');
    setTimeout(function () { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 800);
  }
  document.querySelectorAll('nav button').forEach(function (b, i) { b.style.setProperty('--k', String(i)); });
  if (!ANIM) { $('page').classList.remove('intro'); closeSplash(); } else {
    splash.addEventListener('click', closeSplash);
    setTimeout(closeSplash, 2500);
  }

  // ---- Data: server reads Yahoo or scores.json ----
  function ready() {
    $('page').classList.remove('booting');
    loaded = true;
    finishIntro();
  }
  function load() {
    fetch('/api/state').then(function (r) {
      if (!r.ok) throw new Error('bad status');
      return r.json();
    }).then(function (d) {
      var sig = JSON.stringify([d.teams, d.weeks]);
      state.teams = d.teams || state.teams;
      state.weeks = d.weeks || {};
      loadFailed = false;
      setStatus('Updated ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      var wasLoaded = loaded;
      ready();
      if (!wasLoaded) setTab(tab); else if (sig !== stateSig) renderCurrent();
      stateSig = sig;
      loadLU();
    }).catch(function () {
      if (!loaded) { loadFailed = true; ready(); setTab(tab); }
      setStatus('Could not load scores. Try again soon.', true);
    });
  }
  setStatus('Loading');
  load();
  setInterval(load, 300000);
})();
