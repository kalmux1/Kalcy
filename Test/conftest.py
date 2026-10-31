"""Shared fixtures and helpers for the Kalcy Playwright test suite.

Setup:
  1. Create .env at project root (or Test/) with:
         KALCY_URL=https://kalcy.vercel.app
         KALCY_TEST_EMAIL=<your-test-email>
         KALCY_TEST_PASSWORD=<your-test-password>
  2. The Firebase user must exist AND their email must be present in
     Firestore → allowlist/{email} with enabled=true.
  3. Optional cleanup (destructive, wipes all data after each test):
         KALCY_CLEANUP=1
"""
from __future__ import annotations

import os
import re
import time
from collections.abc import Iterator
from pathlib import Path

import pytest
from dotenv import load_dotenv
from playwright.sync_api import Page, expect


# ═══════════════════════════════════════════════════════════════════════
#  .env loading — fail loudly, never silently substitute defaults
# ═══════════════════════════════════════════════════════════════════════

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_TEST_DIR = Path(__file__).resolve().parent

_env_candidates = [
    _PROJECT_ROOT / ".env",
    _TEST_DIR / ".env",
    _PROJECT_ROOT / ".env.local",
    _TEST_DIR / ".env.local",
]

_loaded_from: Path | None = None
for _candidate in _env_candidates:
    if _candidate.exists():
        load_dotenv(_candidate, override=False)
        _loaded_from = _candidate
        break

if _loaded_from is None:
    raise RuntimeError(
        "Missing .env file. Looked in:\n  "
        + "\n  ".join(str(p) for p in _env_candidates)
        + "\nCreate one with KALCY_TEST_EMAIL and KALCY_TEST_PASSWORD."
    )

print(f"[conftest] loaded env from: {_loaded_from}")


def _require_env(name: str) -> str:
    """Return an env var's value as `str` (Pylance-friendly narrowing)."""
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} is not set. Check your .env file.")
    return value


BASE_URL: str = os.getenv("KALCY_URL", "https://kalcy.vercel.app").rstrip("/")
TEST_EMAIL: str = _require_env("KALCY_TEST_EMAIL")
TEST_PASSWORD: str = _require_env("KALCY_TEST_PASSWORD")
CLEANUP_AFTER_TEST: bool = os.getenv("KALCY_CLEANUP", "0") == "1"

print(
    f"[conftest] email={TEST_EMAIL!r}  "
    f"password_len={len(TEST_PASSWORD)} chars  "
    f"cleanup={'on' if CLEANUP_AFTER_TEST else 'off'}"
)


# ═══════════════════════════════════════════════════════════════════════
#  Constants — default state assumed by phase tests
# ═══════════════════════════════════════════════════════════════════════

DEFAULT_INCOME_CATEGORY = "Salary"
DEFAULT_EXPENSE_CATEGORY = "Shopping"
DEFAULT_ACCOUNT = "Main Checking"
DEFAULT_CASH_ACCOUNT = "Cash Wallet"


# ═══════════════════════════════════════════════════════════════════════
#  Fixtures
# ═══════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    """Deterministic mobile viewport so nav/aria-labels are stable."""
    return {
        **browser_context_args,
        "viewport": {"width": 390, "height": 844},
        "ignore_https_errors": True,
    }


@pytest.fixture
def authenticated_page(page: Page) -> Iterator[Page]:
    """Sign in and wait for the authenticated app shell to mount.

    Polls each 500 ms cycle for three outcomes:
      1. FAB ("Add transaction") visible    → success
      2. Sonner error toast visible         → auth rejected, fail fast
      3. Neither within 20 s                → stall, fail with diagnostics

    NOTE: Success toasts (e.g. "Kalcy installed. You can now use it
    offline.") fire on every fresh browser context and are ignored — we
    filter to `data-type="error"` only.
    """
    page.goto(BASE_URL)
    page.fill('input[type="email"]', TEST_EMAIL)
    page.fill('input[type="password"]', TEST_PASSWORD)
    page.click('button[type="submit"]')

    fab = page.locator('button[aria-label="Add transaction"]')
    error_toast = page.locator('[data-sonner-toast][data-type="error"]')

    elapsed_ms = 0
    step_ms = 500
    deadline_ms = 20_000

    while elapsed_ms < deadline_ms:
        if fab.count() > 0 and fab.first.is_visible():
            _ensure_seeded(page)  # idempotent — no-op if seeds exist
            try:
                yield page
            finally:
                if CLEANUP_AFTER_TEST:
                    _teardown_wipe(page)
            return

        if error_toast.count() > 0 and error_toast.first.is_visible():
            msg = error_toast.first.inner_text().strip()
            raise AssertionError(
                f"Sign-in rejected: {msg!r}\n"
                f"  email: {TEST_EMAIL!r}\n"
                f"  Password length: {len(TEST_PASSWORD)} chars\n"
                f"\n"
                f"  Likely causes:\n"
                f"    • 'Incorrect email or password' — verify the Firebase\n"
                f"      Auth user exists and the password matches\n"
                f"      KALCY_TEST_PASSWORD.\n"
                f"    • 'Could not verify access' — allowlist/{{email}} is\n"
                f"      missing or enabled=false in Firestore.\n"
                f"    • 'Too many attempts' — Firebase throttling; wait 15 min.\n"
            )

        page.wait_for_timeout(step_ms)
        elapsed_ms += step_ms

    body_snippet = page.locator("body").inner_text()[:300]
    raise AssertionError(
        f"Sign-in stalled for {deadline_ms // 1000}s.\n"
        f"  Email used:      {TEST_EMAIL!r}\n"
        f"  Password length: {len(TEST_PASSWORD)} chars\n"
        f"  Current URL:     {page.url}\n"
        f"  Body text (300): {body_snippet!r}\n"
    )


# ═══════════════════════════════════════════════════════════════════════
#  Helpers — used by phase files
# ═══════════════════════════════════════════════════════════════════════

def unique_tag() -> str:
    """Six-digit suffix so repeated runs don't collide in visible text."""
    return f"{int(time.time() * 1000) % 1_000_000:06d}"


def parse_currency(text: str) -> float:
    """Convert '$1,234.56' / '-₹1,234.56' / '+$100.00' → float."""
    cleaned = re.sub(r"[^\d.\-]", "", text)
    if not cleaned or cleaned == "-":
        return 0.0
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def open_tab(page: Page, tab: str) -> None:
    """Click a bottom-nav or sidebar tab.

    tab ∈ {'transactions', 'stats', 'accounts', 'more'}
    """
    mobile_labels = {
        "transactions": "Trans",
        "stats": "Stats",
        "accounts": "Accounts",
        "more": "More",
    }
    desktop_text = {
        "transactions": "Transactions",
        "stats": "Statistics",
        "accounts": "Accounts",
        "more": "More & Budgets",
    }

    mobile_btn = page.locator(f'button[aria-label="{mobile_labels[tab]}"]')
    if mobile_btn.count() > 0 and mobile_btn.first.is_visible():
        mobile_btn.first.click()
        return

    sidebar_btn = page.locator("aside button").filter(
        has_text=desktop_text[tab]
    )
    if sidebar_btn.count() > 0:
        sidebar_btn.first.click()
        return

    raise AssertionError(f"Could not find tab '{tab}' in nav or sidebar")


def active_drawer(page: Page):
    """Return the topmost Vaul drawer content."""
    return page.locator("[data-vaul-drawer]").last


def open_transaction_sheet(page: Page) -> None:
    """Open the Add Transaction drawer (FAB or sidebar button)."""
    fab = page.locator('button[aria-label="Add transaction"]')
    if fab.count() > 0 and fab.first.is_visible():
        fab.first.click()
    else:
        page.locator('aside button:has-text("New Transaction")').click()
    expect(active_drawer(page)).to_be_visible(timeout=5_000)


def enter_numpad_amount(page: Page, digits: str) -> None:
    """Tap each digit on the on-screen calculator numpad."""
    drawer = active_drawer(page)
    for ch in digits:
        drawer.locator(f'button:text-is("{ch}")').first.click()


def pick_category(page: Page, name: str) -> None:
    """Open the category picker step and tap the named category."""
    active_drawer(page).locator('button:has-text("Category")').first.click()
    picker = page.locator("[data-vaul-drawer]").last
    picker.locator(f'button:has-text("{name}")').first.click()


def pick_account(page: Page, name: str) -> None:
    """Open the account picker step and tap the named account."""
    active_drawer(page).locator('button:has-text("Account")').first.click()
    picker = page.locator("[data-vaul-drawer]").last
    picker.locator(f'button:has-text("{name}")').first.click()


def set_note(page: Page, note: str) -> None:
    """Enter a free-text note on the transaction sheet."""
    active_drawer(page).locator('button:has-text("Note")').first.click()
    note_drawer = page.locator("[data-vaul-drawer]").last
    note_drawer.locator("textarea").fill(note)
    note_drawer.locator('button:has-text("Done")').click()


def save_transaction_sheet(page: Page) -> None:
    """Tap Save in the sheet header and wait for the drawer to close."""
    active_drawer(page).locator('button:has-text("Save")').first.click()
    expect(active_drawer(page)).not_to_be_visible(timeout=15_000)


def clear_overall_budget(page: Page) -> None:
    """Delete all Overall Budget cards for this month. Idempotent."""
    open_tab(page, "more")
    page.locator('h2:text-is("Monthly Budgets")').first.scroll_into_view_if_needed()

    # Give Firestore listeners time to populate the budgets array
    page.wait_for_timeout(1_500)

    for _ in range(10):
        cards = (
            page.locator("div.bg-card")
            .filter(has_text="Overall Budget")
            .filter(has=page.locator('button:text-is("Delete")'))
        )
        if cards.count() == 0:
            return

        cards.first.locator('button:text-is("Delete")').click()

        toast = page.locator("[data-sonner-toast]").filter(
            has_text="Delete this budget"
        )
        expect(toast).to_be_visible(timeout=5_000)
        toast.locator('button:text-is("Delete")').click()

        # Wait for Firestore snapshot to propagate before re-checking
        page.wait_for_timeout(1_000)

    raise AssertionError(
        "clear_overall_budget looped 10x without clearing all cards. "
        "Firestore listeners may be stalled."
    )


def read_net_worth(page: Page) -> float:
    """Read the 'Total Net Worth' value shown on the Accounts tab."""
    open_tab(page, "accounts")
    expect(page.locator('p:text-is("Total Net Worth")')).to_be_visible(
        timeout=15_000
    )
    text = (
        page.locator('p:text-is("Total Net Worth")')
        .locator("..")
        .locator("p")
        .nth(1)
        .inner_text()
    )
    return parse_currency(text)


def read_total_balance(page: Page) -> float:
    """Read the 'Total Balance' (cash only) value on the Transactions tab."""
    open_tab(page, "transactions")
    expect(page.locator('p:text-is("Total Balance")')).to_be_visible(
        timeout=15_000
    )
    text = (
        page.locator('p:text-is("Total Balance")')
        .locator("..")
        .locator("p")
        .nth(1)
        .inner_text()
    )
    return parse_currency(text)


# ═══════════════════════════════════════════════════════════════════════
#  Seed management — idempotent restore + optional wipe
# ═══════════════════════════════════════════════════════════════════════

def _ensure_seeded(page: Page) -> None:
    """If accounts/categories are missing (e.g. after a prior cleanup),
    restore seeds via the transaction sheet's "Restore Defaults" button."""
    try:
        open_tab(page, "accounts")
        page.wait_for_timeout(1_500)  # let Firestore populate

        if page.locator("text=No accounts yet").count() == 0:
            return  # Already seeded — nothing to do

        open_tab(page, "transactions")
        fab = page.locator('button[aria-label="Add transaction"]')
        if fab.count() == 0:
            return
        fab.first.click()

        drawer = page.locator("[data-vaul-drawer]").last
        expect(drawer).to_be_visible(timeout=5_000)

        cat_btn = drawer.locator('button:has-text("Category")').first
        if cat_btn.count() > 0:
            cat_btn.click()
            picker = page.locator("[data-vaul-drawer]").last
            restore_btn = picker.locator('button:has-text("Restore Defaults")')
            if restore_btn.count() > 0 and restore_btn.first.is_visible():
                restore_btn.first.click()
                page.wait_for_timeout(1_500)

        page.keyboard.press("Escape")
        page.wait_for_timeout(200)
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
    except Exception as exc:  # noqa: BLE001
        print(f"[ensure_seeded] skipped: {exc}")


def _teardown_wipe(page: Page) -> None:
    """Delete All Data via the app's UI, then re-seed. Best-effort."""
    try:
        # Close any lingering overlays so nav is clickable
        if page.locator("[data-vaul-drawer]").count() > 0:
            page.keyboard.press("Escape")
            page.wait_for_timeout(500)
        if page.locator('[role="dialog"]').count() > 0:
            page.keyboard.press("Escape")
            page.wait_for_timeout(500)

        open_tab(page, "more")
        page.locator("text=Delete All Data").scroll_into_view_if_needed()
        page.click('button:has-text("Delete All Data")')

        toast = page.locator("[data-sonner-toast]").filter(
            has_text="Delete ALL records"
        )
        expect(toast).to_be_visible(timeout=5_000)
        toast.locator('button:has-text("Delete Everything")').click()

        page.wait_for_timeout(2_000)
        _ensure_seeded(page)
        print("[teardown] wiped + re-seeded")
    except Exception as exc:  # noqa: BLE001
        print(f"[teardown] cleanup skipped: {exc}")