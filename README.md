# Terry's Table (public site)

Shows the Dean League standings, playoff picture, races, matchups, history and manager cards. Read-only and public.

Files
- app.py: the small server that talks to Yahoo
- index.html: the page people see
- render.yaml, requirements.txt: tell Render how to run it

Variables to set on the host (never put them in the code)
- YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET: from your Yahoo developer app
- YAHOO_REDIRECT_URI: https://YOUR-ADDRESS/callback (must also be listed in the Yahoo app)
- ADMIN_KEY: a long password only you know
- YAHOO_REFRESH_TOKEN: shown once after you sign in at /login?key=YOUR_ADMIN_KEY
- YAHOO_LEAGUE_KEY: optional. If blank, the first NFL league on your Yahoo account is used.

Weekly update (scores are hand-entered from Yahoo screenshots)
1. Finals: add the week to scores.json (a, b, as, bs in schedule order) and lineups.json (starters with proj and pts).
2. Preview: refresh upcoming.json (week, asof, matchups, lineups) for the next week. The rest of the schedule lives in upcoming.json "schedule".
3. Run python3 tools/clinch.py to recompute exact clinch and elimination flags (needs numpy and scipy). The site hides flags computed for an older week.
4. Run python3 tools/check_data.py. It checks that starters add up to each score, every week covers all 12 teams, the schedule is complete, and the clinch flags are current.
5. Start the site locally (PORT=8099 python3 app.py) and run python3 tests/smoke_test.py, then push. Render deploys main automatically.

Assets
- static/og.png is the link-preview image for group chats. static/icon*.png, icon.svg and manifest.json give the home-screen icon.

