# Terry's Table (public site)

Reads the Dean League from Yahoo and shows Terry's Table, analytics and weekly top scorers. Read-only and public.

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
