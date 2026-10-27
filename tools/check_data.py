"""Consistency checks for the hand-entered data. Run after every update.

  - every final week in scores.json has 6 games covering all 12 teams once
  - each team's starters in lineups.json add up to its score in scores.json
  - each lineup has the 8 expected slots
  - upcoming.json schedule covers each remaining week with all 12 teams once
  - clinch.json is computed for the latest final week

Usage: python3 tools/check_data.py   (exit code 1 on any problem)
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX']


def load(name):
    p = os.path.join(ROOT, name)
    return json.load(open(p)) if os.path.exists(p) else None


def main():
    bad = []
    s, l, u, c = load('scores.json'), load('lineups.json'), load('upcoming.json'), load('clinch.json')
    n = len(s['teams'])
    weeks = sorted(s['weeks'], key=int)
    for wk in weeks:
        g = s['weeks'][wk]
        teams = sorted([m['a'] for m in g] + [m['b'] for m in g])
        if teams != list(range(n)):
            bad.append('week %s: games do not cover each team once: %s' % (wk, teams))
        lw = (l or {}).get('weeks', {}).get(wk)
        if not lw:
            bad.append('week %s: no lineups' % wk); continue
        for m in g:
            for t, sc in ((m['a'], m['as']), (m['b'], m['bs'])):
                rows = lw.get(str(t), [])
                if [r['s'] for r in rows] != SLOTS:
                    bad.append('week %s team %d: slots %s' % (wk, t, [r['s'] for r in rows]))
                tot = round(sum(r.get('pts', 0) for r in rows), 2)
                if abs(tot - float(sc)) > 0.011:
                    bad.append('week %s %s: starters add to %.2f, score is %s' % (wk, s['teams'][t], tot, sc))
    last = int(weeks[-1])
    for w in range(last + 1, 15):
        g = (u or {}).get('schedule', {}).get(str(w))
        if not g:
            bad.append('week %d: missing from upcoming schedule' % w); continue
        teams = sorted([x for p in g for x in p])
        if teams != list(range(n)):
            bad.append('week %d schedule does not cover each team once' % w)
    if not c or c.get('after_week') != last:
        bad.append('clinch.json is not computed for week %d: run python3 tools/clinch.py' % last)
    if bad:
        print('PROBLEMS:'); print('\n'.join('  ' + b for b in bad)); sys.exit(1)
    print('OK: weeks 1-%d consistent, schedule %d-14 complete, clinch flags current.' % (last, last + 1))


if __name__ == '__main__':
    main()
