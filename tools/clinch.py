"""Exact playoff and bye clinch/elimination check for the Dean league.

League points: 2 for a win, 1 for scoring above the league average that week.
Top 6 make the playoffs, top 2 get a bye. Ties on league points go to total points.

For each team X we solve small integer programs over every remaining game result:
  eliminated  : even if X wins out and beats the average every week, at least K teams
                must finish strictly above X in every outcome (ties are not counted,
                since X could still win them on points).
  clinched    : even if X loses out and never beats the average, at most K-1 teams can
                reach X's total (ties counted against X).
K is 6 for the playoffs and 2 for the bye.

Usage: python3 tools/clinch.py  (writes clinch.json next to scores.json)
"""
import json, os, sys
import numpy as np
from scipy.optimize import milp, LinearConstraint, Bounds

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEEKS = 14


def standings(scores):
    n = len(scores['teams'])
    lp = [0] * n
    for wk in scores['weeks']:
        g = scores['weeks'][wk]
        sc = {}
        for m in g:
            sc[m['a']] = float(m['as']); sc[m['b']] = float(m['bs'])
        avg = sum(sc.values()) / len(sc)
        for m in g:
            for t, o in ((m['a'], m['b']), (m['b'], m['a'])):
                lp[t] += (2 if sc[t] > sc[o] else 0) + (1 if sc[t] > avg else 0)
    return lp


def remaining_games(scores, upcoming):
    done = max(int(k) for k in scores['weeks'])
    weeks = [w for w in range(done + 1, WEEKS + 1) if str(w) in upcoming['schedule']]
    games = [(w, a, b) for w in weeks for a, b in upcoming['schedule'][str(w)]]
    return done, weeks, games


def solve(X, lp, weeks, games, n, mode, K):
    """mode 'elim': min number of teams strictly above X's best case.
       mode 'clinch': max number of teams reaching X's worst case."""
    G, W = len(games), len(weeks)
    nx, nb, nz = G, W * n, n
    nv = nx + nb + nz
    ib = lambda wi, y: nx + wi * n + y
    iz = lambda y: nx + nb + y
    xg = sum(1 for g in games if X in g[1:])
    L = lp[X] + 3 * xg if mode == 'elim' else lp[X]
    BIG = 400
    A, lo, hi = [], [], []
    for gi, (w, a, b) in enumerate(games):
        if X in (a, b):  # X wins all (elim) or loses all (clinch)
            r = np.zeros(nv); r[gi] = 1; A.append(r)
            v = (1 if a == X else 0) if mode == 'elim' else (0 if a == X else 1)
            lo.append(v); hi.append(v)
    for wi in range(W):  # bonus vars: none for anyone in elim (worst for others), free in clinch
        for y in range(n):
            if mode == 'elim' or y == X:
                r = np.zeros(nv); r[ib(wi, y)] = 1; A.append(r); lo.append(0); hi.append(0)
    for y in range(n):
        if y == X:
            r = np.zeros(nv); r[iz(y)] = 1; A.append(r); lo.append(0); hi.append(0)
            continue
        r = np.zeros(nv); const = lp[y]
        for gi, (w, a, b) in enumerate(games):
            if a == y: r[gi] += 2
            elif b == y: r[gi] -= 2; const += 2
        for wi in range(W): r[ib(wi, y)] += 1
        if mode == 'elim':
            # z=0 requires final <= L ; z=1 free
            r[iz(y)] = -BIG; A.append(r); lo.append(-np.inf); hi.append(L - const)
        else:
            # z=1 requires final >= L
            r[iz(y)] = -BIG; A.append(r); lo.append(L - const - BIG); hi.append(np.inf)
    c = np.zeros(nv)
    for y in range(n): c[iz(y)] = 1 if mode == 'elim' else -1
    res = milp(c, constraints=LinearConstraint(np.array(A), lo, hi), integrality=np.ones(nv), bounds=Bounds(np.zeros(nv), np.ones(nv)))
    if res.status != 0:
        raise RuntimeError('solver failed for team %d %s' % (X, mode))
    return round(res.fun) if mode == 'elim' else -round(res.fun)


def main():
    scores = json.load(open(os.path.join(ROOT, 'scores.json')))
    upcoming = json.load(open(os.path.join(ROOT, 'upcoming.json')))
    n = len(scores['teams'])
    lp = standings(scores)
    done, weeks, games = remaining_games(scores, upcoming)
    out = {'after_week': done, 'teams': {}}
    for X in range(n):
        if not games:
            out['teams'][str(X)] = {}
            continue
        mn = solve(X, lp, weeks, games, n, 'elim', 6)
        mx = solve(X, lp, weeks, games, n, 'clinch', 6)
        out['teams'][str(X)] = {
            'po': 'eliminated' if mn >= 6 else ('clinched' if mx <= 5 else None),
            'bye': 'eliminated' if mn >= 2 else ('clinched' if mx <= 1 else None),
            'min_above': mn, 'max_reaching': mx,
        }
        print('%-30s lp=%2d  teams surely above best case=%2d  teams able to reach worst case=%2d  %s / %s' % (
            scores['teams'][X], lp[X], mn, mx, out['teams'][str(X)]['po'], out['teams'][str(X)]['bye']))
    json.dump(out, open(os.path.join(ROOT, 'clinch.json'), 'w'))


if __name__ == '__main__':
    main()
