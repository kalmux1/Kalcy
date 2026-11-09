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
    pick_account,
    pick_category,
    read_card_balances,
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

    # Hard reload — Firestore SDK rehydrates from IndexedDB + network.
    # Note: `hideBalances` resets to hidden after reload; that's fine here
    # because this test only checks a transaction note, not a balance.
    page.reload()
    expect(page.locator('button[aria-label="Trans"]')).to_be_visible(
        timeout=25_000
    )
    open_tab(page, "transactions")

    expect(page.locator(f"text={note}")).to_be_visible(timeout=20_000)


def test_balance_reconciliation(authenticated_page: Page):
    """Sum of included account balances must equal Total Balance.

    Asserts internal consistency of the app's own balance arithmetic.
    `read_card_balances` reveals balances first (the app hides them by
    default) so every card shows a real number.
    """
    page = authenticated_page

    balances = read_card_balances(page)
    expected = round(sum(balances), 2)
    displayed = round(read_total_balance(page), 2)

    assert displayed == pytest.approx(expected, abs=0.01), (
        f"Displayed Total Balance {displayed} != sum of account balances "
        f"{expected}. Individual balances: {balances}"
    )