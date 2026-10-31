"""Phase 2 — Investment Sheet.

Verifies:
  • IPO lifecycle Applied → Allotted (active) → Sold through the UI
  • Net worth updates correctly after cash-affecting operations
"""
import pytest
from playwright.sync_api import Page, expect

from conftest import (
    DEFAULT_ACCOUNT,
    DEFAULT_INCOME_CATEGORY,
    enter_numpad_amount,
    open_tab,
    open_transaction_sheet,
    pick_account,
    pick_category,
    read_net_worth,
    save_transaction_sheet,
    unique_tag,
)


def _drawer(page: Page):
    return page.locator("[data-vaul-drawer]").last


def test_ipo_status_transitions(authenticated_page: Page):
    """Full lifecycle: Applied → Allotted (active) → Sold."""
    page = authenticated_page
    tag = unique_tag()
    ipo_name = f"TechCorp-{tag}"

    # Navigate: Accounts → Invest
    open_tab(page, "accounts")
    page.locator('button:text-is("Invest")').click()
    expect(page.locator('button:has-text("Add Investment")')).to_be_visible(
        timeout=10_000
    )

    # ---- Create IPO (state: applied) ----
    page.click('button:has-text("Add Investment")')
    drawer = _drawer(page)
    expect(drawer).to_be_visible(timeout=5_000)

    drawer.locator('button:text-is("IPO")').click()

    drawer.locator('input[placeholder="e.g. Tata Tech"]').fill(ipo_name)
    drawer.locator('input[placeholder="TATATECH"]').fill(f"TC{tag[:4]}")
    drawer.locator('input[placeholder="0.00"]').first.fill("15000")
    drawer.locator("select").last.select_option(label=DEFAULT_ACCOUNT)
    drawer.locator('button[type="submit"]').click()
    expect(drawer).not_to_be_visible(timeout=15_000)

    expect(page.locator("text=IPO Applied")).to_be_visible(timeout=15_000)
    card = page.locator("div.bg-card").filter(has_text=ipo_name).last
    expect(card).to_be_visible()
    expect(card.locator("text=Applied")).to_be_visible()

    # ---- Transition: Applied → Allotted (state: active) ----
    card.locator('button:text-is("Edit")').click()
    drawer = _drawer(page)
    expect(drawer).to_be_visible(timeout=5_000)

    # FIX: :text-is — "Not Allotted" would also match :has-text
    drawer.locator('button:text-is("Allotted")').click()

    drawer.locator('input[placeholder="10"]').fill("50")
    drawer.locator('input[placeholder="0.00"]').first.fill("300")
    drawer.locator('input[placeholder="Same as buy price if blank"]').fill("300")
    drawer.locator('button[type="submit"]').click()
    expect(drawer).not_to_be_visible(timeout=15_000)

    card = page.locator("div.bg-card").filter(has_text=ipo_name).last
    expect(card).to_be_visible(timeout=10_000)
    expect(card.locator("text=Applied")).not_to_be_visible()
    expect(card.locator("text=%").first).to_be_visible()

    # ---- Transition: Allotted → Sold ----
    card.locator('button:text-is("Edit")').click()
    drawer = _drawer(page)
    expect(drawer).to_be_visible(timeout=5_000)

    # FIX: DOM text is lowercase "sold" (CSS `capitalize` only affects
    # visual rendering). get_by_role is case-insensitive by default.
    drawer.get_by_role("button", name="sold", exact=False).click()

    # Two "0.00" inputs now: buy price (nth 0), sale price (nth 1)
    drawer.locator('input[placeholder="0.00"]').nth(1).fill("400")
    drawer.locator('button[type="submit"]').click()
    expect(drawer).not_to_be_visible(timeout=15_000)

    card = page.locator("div.bg-card").filter(has_text=ipo_name).last
    expect(card).to_be_visible(timeout=10_000)
    expect(card.locator("text=Sold")).to_be_visible()


def test_net_worth_calculation(authenticated_page: Page):
    """Adding $1,000 income must raise net worth by exactly $1,000."""
    page = authenticated_page
    tag = unique_tag()

    before = read_net_worth(page)

    # Add $1,000 income
    open_tab(page, "transactions")
    open_transaction_sheet(page)
    _drawer(page).locator('button:text-is("income")').click()
    enter_numpad_amount(page, "1000")
    pick_category(page, DEFAULT_INCOME_CATEGORY)
    pick_account(page, DEFAULT_ACCOUNT)

    # Add a marker note so we can wait for Firestore propagation
    from conftest import set_note
    set_note(page, f"NW-{tag}")
    save_transaction_sheet(page)

    # Wait for Firestore propagation to accounts snapshot
    expect(page.locator(f"text=NW-{tag}")).to_be_visible(timeout=15_000)
    page.wait_for_timeout(2_000)

    after = read_net_worth(page)

    assert after - before == pytest.approx(1000, abs=1.0), (
        f"Net worth went from {before} to {after}, expected +1000"
    )