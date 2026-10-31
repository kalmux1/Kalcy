"""Phase 1 — Core Logic and Data Management.

Verifies:
  • Budget creation with a monthly limit and its rendering
  • Income + expense logging and their visibility in the transaction list
"""
import pytest
from playwright.sync_api import Page, expect

from conftest import (
    clear_overall_budget,
    DEFAULT_ACCOUNT,
    DEFAULT_CASH_ACCOUNT,
    DEFAULT_EXPENSE_CATEGORY,
    DEFAULT_INCOME_CATEGORY,
    enter_numpad_amount,
    open_tab,
    open_transaction_sheet,
    pick_account,
    pick_category,
    save_transaction_sheet,
    set_note,
    unique_tag,
)


def test_budget_creation_and_verification(authenticated_page: Page):
    """Create an Overall budget of 50000 and verify it's rendered."""
    page = authenticated_page

    # --- Clean slate, then VERIFY it's clean ---
    clear_overall_budget(page)

    stale = (
        page.locator("div.bg-card")
        .filter(has_text="Overall Budget")
        .filter(has=page.locator('button:text-is("Delete")'))
    )
    assert stale.count() == 0, (
        f"Cleanup failed: {stale.count()} Overall Budget card(s) still "
        f"present. A duplicate exists in Firestore."
    )

    # --- Open drawer and fill ---
    page.click('button:has-text("Add Budget")')
    drawer = page.locator("[data-vaul-drawer]").last
    expect(drawer).to_be_visible(timeout=5_000)

    drawer.locator('button:text-is("Overall")').click()
    drawer.locator('input[type="number"]').fill("50000")
    page.wait_for_timeout(300)  # let React flush the amount into state

    drawer.locator('button:has-text("Save")').click()

    # --- Race: drawer-close vs error-toast ---
    for _ in range(20):  # up to 10 seconds
        err_toast = page.locator('[data-sonner-toast][data-type="error"]')
        if err_toast.count() > 0 and err_toast.first.is_visible():
            msg = err_toast.first.inner_text().strip()
            raise AssertionError(
                f"Save failed: {msg!r}\n"
                f"  If 'already exists this month': duplicate remained in "
                f"Firestore after cleanup — run Delete All Data manually.\n"
                f"  If 'Failed to save budget': Firestore rules block writes."
            )

        if drawer.count() == 0 or not drawer.is_visible():
            break

        page.wait_for_timeout(500)
    else:
        raise AssertionError(
            "Drawer didn't close after Save, and no error toast appeared. "
            "Check the BudgetForm wiring in budgets-view.tsx."
        )

    # --- Verify the card rendered with the correct amount ---
    card = (
        page.locator("div.bg-card")
        .filter(has_text="Overall Budget")
        .filter(has=page.locator('button:text-is("Delete")'))
        .last
    )
    expect(card).to_be_visible(timeout=10_000)
    expect(card).to_contain_text("50,000.00")


def test_expense_logging(authenticated_page: Page):
    """Log one income and one expense; both must appear in the list."""
    page = authenticated_page
    tag = unique_tag()

    # ---- Income ----
    open_tab(page, "transactions")
    open_transaction_sheet(page)
    drawer = page.locator("[data-vaul-drawer]").last

    drawer.locator('button:text-is("income")').click()
    enter_numpad_amount(page, "100000")
    pick_category(page, DEFAULT_INCOME_CATEGORY)
    pick_account(page, DEFAULT_ACCOUNT)
    set_note(page, f"Income-{tag}")
    save_transaction_sheet(page)

    expect(page.locator(f"text=Income-{tag}")).to_be_visible(timeout=15_000)

    # ---- Expense (type defaults to 'expense') ----
    open_transaction_sheet(page)
    enter_numpad_amount(page, "25000")
    pick_category(page, DEFAULT_EXPENSE_CATEGORY)
    pick_account(page, DEFAULT_CASH_ACCOUNT)
    set_note(page, f"Expense-{tag}")
    save_transaction_sheet(page)

    expect(page.locator(f"text=Expense-{tag}")).to_be_visible(timeout=15_000)
    expect(page.locator(f"text=Income-{tag}")).to_be_visible()