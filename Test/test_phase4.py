"""Phase 4 — Production Readiness.

Verifies:
  • Data persists across a full page reload (Firestore round-trip)
  • Balance reconciliation: sum of included accounts == Total Balance
"""
import pytest
from playwright.sync_api import Page, expect

from conftest import (
    DEFAULT_CASH_ACCOUNT,
    DEFAULT_EXPENSE_CATEGORY,
    enter_numpad_amount,
    open_tab,
    open_transaction_sheet,
    parse_currency,
    pick_account,
    pick_category,
    read_total_balance,
    save_transaction_sheet,
    set_note,
    unique_tag,
)


def test_data_persistence_after_reload(authenticated_page: Page):
    """A transaction written to Firestore must survive a full reload."""
    page = authenticated_page
    tag = unique_tag()
    note = f"Persist-{tag}"

    open_tab(page, "transactions")
    open_transaction_sheet(page)
    enter_numpad_amount(page, "1234")
    pick_category(page, DEFAULT_EXPENSE_CATEGORY)
    pick_account(page, DEFAULT_CASH_ACCOUNT)
    set_note(page, note)
    save_transaction_sheet(page)

    expect(page.locator(f"text={note}")).to_be_visible(timeout=15_000)

    # Hard reload — Firestore SDK rehydrates from IndexedDB + network
    page.reload()
    expect(page.locator('button[aria-label="Trans"]')).to_be_visible(
        timeout=25_000
    )
    open_tab(page, "transactions")

    expect(page.locator(f"text={note}")).to_be_visible(timeout=20_000)


def test_balance_reconciliation(authenticated_page: Page):
    """Sum of included account balances must equal Total Balance.

    This replaces the empty 'bank reconciliation' stub. Kalcy has no
    Bank of Baroda integration — this asserts internal consistency of
    the app's own balance arithmetic.
    """
    page = authenticated_page

    open_tab(page, "accounts")
    expect(page.locator('button:text-is("Invest")')).to_be_visible(
        timeout=15_000
    )
    page.wait_for_timeout(1_500)  # let Firestore snapshots settle

    cards = page.locator("div.bg-card").filter(
        has=page.locator('button:text-is("Edit")')
    ).filter(
        has=page.locator('button:text-is("Delete")')
    )

    balances = []
    for i in range(cards.count()):
        card = cards.nth(i)
        if "Excluded from total" in card.inner_text():
            continue
        balance_text = card.locator(
            ".text-lg.font-bold.tabular-nums"
        ).first.inner_text()
        balances.append(parse_currency(balance_text))

    expected = round(sum(balances), 2)
    displayed = round(read_total_balance(page), 2)

    assert displayed == pytest.approx(expected, abs=0.01), (
        f"Displayed Total Balance {displayed} != sum of account balances "
        f"{expected}. Individual balances: {balances}"
    )