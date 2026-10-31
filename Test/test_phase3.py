"""Phase 3 — UI/UX and Sophisticated Dialogs.

Verifies:
  • Mobile viewport renders the responsive shell (bottom nav + FAB)
  • Numpad-based input works on a touch-sized viewport
  • Enhanced delete confirmation dialog appears and correctly removes data
"""
import pytest
from playwright.sync_api import Page, expect

from conftest import (
    DEFAULT_ACCOUNT,
    active_drawer,
    enter_numpad_amount,
    open_tab,
    unique_tag,
)


def test_mobile_viewport_layout(authenticated_page: Page):
    """On a phone-sized viewport the bottom nav + FAB must be present."""
    page = authenticated_page
    page.set_viewport_size({"width": 375, "height": 812})
    page.reload()

    expect(page.locator('button[aria-label="Trans"]')).to_be_visible(
        timeout=25_000
    )
    expect(page.locator('button[aria-label="Add transaction"]')).to_be_visible()

    # Desktop sidebar must be hidden
    expect(page.locator("aside")).to_be_hidden()


def test_mobile_numpad_input(authenticated_page: Page):
    """Verify drawer inputs work on a phone viewport using the numpad."""
    page = authenticated_page
    page.set_viewport_size({"width": 375, "height": 812})
    page.reload()
    expect(page.locator('button[aria-label="Add transaction"]')).to_be_visible(
        timeout=25_000
    )

    page.click('button[aria-label="Add transaction"]')
    drawer = active_drawer(page)
    expect(drawer).to_be_visible(timeout=5_000)

    enter_numpad_amount(page, "5000")

    # Numpad display renders formatted amount
    expect(drawer.locator("text=5,000")).to_be_visible()

    # Category picker step must be reachable and render options
    drawer.locator('button:has-text("Category")').first.click()
    picker = page.locator("[data-vaul-drawer]").last
    expect(picker.locator("text=Select Category")).to_be_visible(timeout=5_000)

    # At least one category tile visible
    expect(picker.locator("button").first).to_be_visible()


def test_delete_confirmation_dialog(authenticated_page: Page):
    """Create an investment, trigger delete, confirm the Radix dialog flow."""
    page = authenticated_page
    tag = unique_tag()
    name = f"ToDelete-{tag}"

    # Create an active investment
    open_tab(page, "accounts")
    page.locator('button:text-is("Invest")').click()
    page.click('button:has-text("Add Investment")')

    drawer = active_drawer(page)
    expect(drawer).to_be_visible(timeout=5_000)
    drawer.locator('button:text-is("Shares")').click()
    drawer.locator('input[placeholder="e.g. Tata Tech"]').fill(name)
    drawer.locator('input[placeholder="TATATECH"]').fill("DEL")
    drawer.locator('input[placeholder="10"]').fill("10")
    drawer.locator('input[placeholder="0.00"]').first.fill("100")
    drawer.locator("select").last.select_option(label=DEFAULT_ACCOUNT)
    drawer.locator('button[type="submit"]').click()
    expect(drawer).not_to_be_visible(timeout=15_000)

    expect(page.locator(f"text={name}").first).to_be_visible(timeout=15_000)

    # Click Delete on the specific card
    card = page.locator("div.bg-card").filter(has_text=name).last
    card.locator('button:text-is("Delete")').click()

    # Radix confirm dialog must be visible
    dialog = page.locator('[role="dialog"]').filter(has_text="Delete Investment")
    expect(dialog).to_be_visible(timeout=5_000)
    expect(dialog).to_contain_text(name)

    # Cancel keeps the card
    dialog.locator('button:text-is("Cancel")').click()
    expect(dialog).not_to_be_visible(timeout=5_000)
    expect(page.locator(f"text={name}").first).to_be_visible()

    # Reopen and confirm
    card.locator('button:text-is("Delete")').click()
    dialog = page.locator('[role="dialog"]').filter(has_text="Delete Investment")
    expect(dialog).to_be_visible(timeout=5_000)
    dialog.locator('button:text-is("Delete Investment")').click()

    # Dialog closes, card disappears
    expect(dialog).not_to_be_visible(timeout=10_000)
    expect(page.locator(f"text={name}")).not_to_be_visible(timeout=15_000)