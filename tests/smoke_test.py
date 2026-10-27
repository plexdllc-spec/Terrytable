"""Click through every group and tab in the running site and fail on any page error.

Usage: python3 tests/smoke_test.py [http://localhost:8099]
Needs: pip install playwright, and a Chromium it can launch.
"""
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8099"
EXPECTED_GROUPS = ["Standings", "This Week", "History"]
EXPECTED_TABS = {
    "standings": ["table", "races", "playoffs"],
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
    print("OK: groups, subtabs, sections and duel button all work; no page errors")


if __name__ == "__main__":
    main()
