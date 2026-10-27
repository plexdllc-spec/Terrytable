"""Click through every group and tab in the running site and fail on any page error.

Usage: python3 tests/smoke_test.py [http://localhost:8099]
Needs: pip install playwright, and a Chromium it can launch.
"""
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8099"
EXPECTED_GROUPS = ["Standings", "This Week", "History"]
EXPECTED_TABS = {
    "standings": ["table", "races", "playoffs", "whatif"],
    "week": ["matchups"],
    "history": ["alltime"],
}


def main():
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 430, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(BASE)
        page.wait_for_timeout(1500)

        groups = page.eval_on_selector_all("#gnav button", "els => els.map(e => e.textContent.trim())")
        if groups != EXPECTED_GROUPS:
            failures.append(f"groups {groups} != {EXPECTED_GROUPS}")

        for group, tabs in EXPECTED_TABS.items():
            page.evaluate("g => document.querySelector('#gnav [data-group=\"' + g + '\"]').click()", group)
            page.wait_for_timeout(200)
            shown = page.eval_on_selector_all(
                "#subnav button", "els => els.filter(e => !e.hidden).map(e => e.getAttribute('data-tab'))")
            if shown != tabs:
                failures.append(f"{group} subtabs {shown} != {tabs}")
            for t in tabs:
                page.evaluate("t => document.getElementById('tab-' + t).click()", t)
                page.wait_for_timeout(350)
                visible = page.eval_on_selector_all(
                    "main section", "els => els.filter(s => !s.hidden).map(s => s.id)")
                if visible != ["p-" + t]:
                    failures.append(f"tab {t} shows {visible}")

        # This Week: the Up next preview and Team of the week render with real data.
        page.evaluate("document.getElementById('g-week').click()")
        page.wait_for_timeout(2500)
        nx = page.eval_on_selector_all("#x-next .nx", "els => els.length")
        if nx not in (0, 6):
            failures.append(f"Up next shows {nx} games, expected 6")
        if nx == 0 and not page.eval_on_selector("#x-next", "e => e.textContent.length > 0"):
            failures.append("Up next is empty")
        totw = page.eval_on_selector_all("#x-totw tr", "els => els.length")
        if totw and totw != 9:
            failures.append(f"Team of the week has {totw - 1} players, expected 8")

        # Every table header is sortable.
        bad = page.evaluate("() => [...document.querySelectorAll('main table')].filter(t => t.rows.length && ![...t.rows[0].cells].every(c => c.classList.contains('sortable'))).length")
        if bad:
            failures.append(f"{bad} tables without sortable headers")

        api = page.evaluate("() => fetch('/api/clinch').then(r => r.json())")
        if "teams" not in api:
            failures.append("/api/clinch returned no teams")

        page.evaluate("document.getElementById('g-history').click()")
        page.wait_for_timeout(800)
        page.evaluate("document.getElementById('goduel').click()")
        page.wait_for_timeout(400)
        view = page.evaluate("() => document.querySelector('#x-races .rpills [aria-pressed=\"true\"]') && document.querySelector('#x-races .rpills [aria-pressed=\"true\"]').textContent")
        if view != "Manager duel":
            failures.append(f"All-time duel button opened '{view}'")

        browser.close()

    if errors:
        failures.append(f"page errors: {errors}")
    if failures:
        print("FAIL")
        for f in failures:
            print(" -", f)
        sys.exit(1)
    print("OK: groups, subtabs, sections, Up next, team of the week, sortable tables, clinch API and duel button all work; no page errors")


if __name__ == "__main__":
    main()
