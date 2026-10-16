import type {
  Transaction,
  Account,
  Category,
  Budget,
  Loan,
  Investment,
} from './types';

/* -------------------------------------------------------------------------- */
/*  Date helpers                                                              */
/* -------------------------------------------------------------------------- */

export function formatDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export function toDateInputValue(timestamp: number): string {
  return formatDateKey(timestamp);
}

export function toTimeInputValue(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(
    2,
    '0'
  )}`;
}

export function monthYearKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function getMonthRange(monthYear: string): { start: number; end: number } {
  const [y, m] = monthYear.split('-').map(Number);
  return {
    start: new Date(y, m - 1, 1).getTime(),
    end: new Date(y, m, 1).getTime(),
  };
}

export function formatDateLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const dateStr = formatDateKey(timestamp);
  if (dateStr === formatDateKey(today.getTime())) return 'Today';
  if (dateStr === formatDateKey(yesterday.getTime())) return 'Yesterday';

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateLong(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatMonthYear(monthYear: string): string {
  const [year, month] = monthYear.split('-');
  return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

/* -------------------------------------------------------------------------- */
/*  Transaction aggregation                                                   */
/* -------------------------------------------------------------------------- */

export function groupTransactionsByDay(
  transactions: Transaction[]
): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>();
  const sorted = [...transactions].sort((a, b) => b.date - a.date);
  for (const tx of sorted) {
    const key = formatDateKey(tx.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(tx);
  }
  return map;
}

export function getTransactionsForMonth(
  transactions: Transaction[],
  monthYear: string
): Transaction[] {
  return transactions.filter((tx) => monthYearKey(tx.date) === monthYear);
}

export function getDailyTotals(
  transactions: Transaction[],
  dayKey: string
): { income: number; expense: number } {
  const dayTxs = transactions.filter(
    (tx) => formatDateKey(tx.date) === dayKey && tx.type !== 'transfer'
  );
  return {
    income: dayTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    expense: dayTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
  };
}

export function getMonthlyTotals(
  transactions: Transaction[],
  monthYear: string
): { income: number; expense: number; net: number } {
  const monthTxs = getTransactionsForMonth(transactions, monthYear).filter(
    (t) => !t.isExcludedFromStats && t.type !== 'transfer'
  );
  const income = monthTxs
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const expense = monthTxs
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);
  return { income, expense, net: income - expense };
}

export function getTotalBalance(accounts: Account[]): number {
  return accounts
    .filter((a) => a.isIncludedInTotal)
    .reduce((sum, a) => sum + a.balance, 0);
}

export function getCategoryById(
  categories: Category[],
  id: string | null
): Category | undefined {
  if (!id) return undefined;
  return categories.find((c) => c.id === id);
}

export function getAccountById(
  accounts: Account[],
  id: string
): Account | undefined {
  return accounts.find((a) => a.id === id);
}

function findRootCategory(
  categories: Category[],
  catId: string
): Category | undefined {
  let cat = categories.find((c) => c.id === catId);
  const seen = new Set<string>();
  while (cat?.parentId && !seen.has(cat.id)) {
    seen.add(cat.id);
    const parent = categories.find((c) => c.id === cat!.parentId);
    if (!parent) break;
    cat = parent;
  }
  return cat;
}

export function getCategoryBreakdown(
  transactions: Transaction[],
  categories: Category[],
  type: 'expense' | 'income',
  monthYear?: string
): {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  amount: number;
  percentage: number;
}[] {
  let filtered = transactions.filter((t) => t.type === type && !t.isExcludedFromStats);
  if (monthYear) filtered = filtered.filter((t) => monthYearKey(t.date) === monthYear);

  const total = filtered.reduce((sum, t) => sum + t.amount, 0);
  if (total === 0) return [];

  const byRoot = new Map<string, number>();
  for (const tx of filtered) {
    const root = tx.categoryId ? findRootCategory(categories, tx.categoryId) : undefined;
    const key = root?.id ?? 'uncategorized';
    byRoot.set(key, (byRoot.get(key) ?? 0) + tx.amount);
  }

  return Array.from(byRoot.entries())
    .map(([rootId, amount]) => {
      const cat = categories.find((c) => c.id === rootId);
      return {
        categoryId: rootId,
        name: cat?.name ?? 'Uncategorized',
        color: cat?.color ?? '#94A3B8',
        icon: cat?.icon ?? 'MoreHorizontal',
        amount,
        percentage: (amount / total) * 100,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

/* -------------------------------------------------------------------------- */
/*  Budgets                                                                   */
/* -------------------------------------------------------------------------- */

export function getBudgetProgress(
  budget: Budget,
  transactions: Transaction[],
  categories: Category[]
): {
  spent: number;
  remaining: number;
  percentage: number;
  isOver: boolean;
  isWarning: boolean;
} {
  const { start, end } = getMonthRange(budget.monthYear);

  const monthTxs = transactions.filter(
    (t) =>
      t.type === 'expense' &&
      !t.isExcludedFromBudget &&
      t.date >= start &&
      t.date < end
  );

  let spent: number;
  if (budget.categoryId) {
    const subcats = categories
      .filter((c) => c.parentId === budget.categoryId)
      .map((c) => c.id);
    const allCatIds = [budget.categoryId, ...subcats];
    spent = monthTxs
      .filter((t) => t.categoryId && allCatIds.includes(t.categoryId))
      .reduce((sum, t) => sum + t.amount, 0);
  } else {
    spent = monthTxs.reduce((sum, t) => sum + t.amount, 0);
  }

  const remaining = budget.amount - spent;
  const rawPct = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
  return {
    spent,
    remaining,
    percentage: Math.min(rawPct, 100),
    isOver: spent > budget.amount,
    isWarning: rawPct >= 80 && rawPct < 100,
  };
}

export function getMonthTotalSpent(
  transactions: Transaction[],
  monthYear: string
): number {
  const { start, end } = getMonthRange(monthYear);
  return transactions
    .filter(
      (t) =>
        t.type === 'expense' &&
        !t.isExcludedFromBudget &&
        t.date >= start &&
        t.date < end
    )
    .reduce((s, t) => s + t.amount, 0);
}

/* -------------------------------------------------------------------------- */
/*  CSV export                                                                */
/* -------------------------------------------------------------------------- */

/** CSV-safe: neutralise formula-injection prefixes. */
function csvSafe(value: string): string {
  const trimmed = value.replace(/\r?\n/g, ' ').replace(/"/g, '""');
  if (/^[=+\-@\t]/.test(trimmed)) return `'${trimmed}`;
  return trimmed;
}

export function exportToCSV(
  transactions: Transaction[],
  accounts: Account[],
  categories: Category[]
): string {
  const headers = [
    'Date',
    'Type',
    'Amount',
    'Account',
    'To Account',
    'Category',
    'Note',
    'Excluded from Stats',
    'Excluded from Budget',
  ];
  const rows = transactions.map((tx) => {
    const acc = accounts.find((a) => a.id === tx.accountId)?.name ?? '';
    const toAcc = tx.toAccountId
      ? accounts.find((a) => a.id === tx.toAccountId)?.name ?? ''
      : '';
    const cat = tx.categoryId
      ? categories.find((c) => c.id === tx.categoryId)?.name ?? ''
      : '';
    return [
      new Date(tx.date).toISOString(),
      tx.type,
      tx.amount.toString(),
      acc,
      toAcc,
      cat,
      csvSafe(tx.note),
      tx.isExcludedFromStats ? 'yes' : 'no',
      tx.isExcludedFromBudget ? 'yes' : 'no',
    ]
      .map((v) => (v.includes(',') || v.includes('"') ? `"${v}"` : v))
      .join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/* -------------------------------------------------------------------------- */
/*  Calendar                                                                  */
/* -------------------------------------------------------------------------- */

export function getCalendarDays(
  year: number,
  month: number,
  weekStartDay: 0 | 1
): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: (Date | null)[] = [];
  const firstDayWeekday = firstDay.getDay();
  const offset = weekStartDay === 1 ? (firstDayWeekday + 6) % 7 : firstDayWeekday;
  for (let i = 0; i < offset; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

/** Trend relative to a reference date (defaults to today). */
export function getMonthlyTrend(
  transactions: Transaction[],
  months: number,
  referenceDate: Date = new Date()
): { label: string; income: number; expense: number; net: number }[] {
  const result: {
    label: string;
    income: number;
    expense: number;
    net: number;
  }[] = [];
  for (let m = months - 1; m >= 0; m--) {
    const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - m, 1);
    const myKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const totals = getMonthlyTotals(transactions, myKey);
    result.push({
      label: date.toLocaleDateString('en-US', { month: 'short' }),
      ...totals,
    });
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/*  Lending / loans                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Summary of all active loans.
 * - totalLent:     money others currently owe you (a receivable / asset)
 * - totalBorrowed: money you currently owe others (a payable / liability)
 * - netReceivable: totalLent − totalBorrowed (positive = net asset position)
 * - activeCount:   number of unsettled loans
 *
 * Settled loans (isSettled === true or remaining <= 0) are ignored.
 */
export function getLoansSummary(loans: Loan[]): {
  totalLent: number;
  totalBorrowed: number;
  netReceivable: number;
  activeCount: number;
} {
  let totalLent = 0;
  let totalBorrowed = 0;
  let activeCount = 0;
  for (const loan of loans) {
    if (loan.isSettled || loan.remainingAmount <= 0) continue;
    activeCount += 1;
    if (loan.type === 'lent') totalLent += loan.remainingAmount;
    else totalBorrowed += loan.remainingAmount;
  }
  return {
    totalLent,
    totalBorrowed,
    netReceivable: totalLent - totalBorrowed,
    activeCount,
  };
}

/** Net worth contribution from loans: + receivables, − payables. */
export function getLoansNetWorth(loans: Loan[]): number {
  return getLoansSummary(loans).netReceivable;
}

/**
 * Paid amount on a loan (principal − remaining), clamped to [0, principal].
 */
export function getLoanPaid(loan: Loan): number {
  const paid = loan.principalAmount - loan.remainingAmount;
  return Math.max(0, Math.min(paid, loan.principalAmount));
}

/** Payment progress as a percentage, clamped to [0, 100]. */
export function getLoanProgress(loan: Loan): number {
  if (loan.principalAmount <= 0) return 0;
  return Math.min(100, (getLoanPaid(loan) / loan.principalAmount) * 100);
}

/* -------------------------------------------------------------------------- */
/*  Investments                                                               */
/* -------------------------------------------------------------------------- */

export function getInvestmentsSummary(investments: Investment[]): {
  totalInvested: number;
  currentValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalPnl: number;
  totalPnlPercent: number;
  activeCount: number;
  soldCount: number;
} {
  let totalInvested = 0;
  let currentValue = 0;
  let realizedPnl = 0;
  let activeCount = 0;
  let soldCount = 0;

  for (const inv of investments) {
    if (inv.status === 'active') {
      totalInvested += inv.investedAmount;
      currentValue += inv.currentValue;
      activeCount += 1;
    } else if (inv.status === 'sold' && inv.soldPrice !== null) {
      const proceeds = inv.soldPrice * inv.units;
      realizedPnl += proceeds - inv.investedAmount;
      soldCount += 1;
    }
  }

  const unrealizedPnl = currentValue - totalInvested;
  const totalPnl = unrealizedPnl + realizedPnl;
  const totalPnlPercent =
    totalInvested > 0 ? (unrealizedPnl / totalInvested) * 100 : 0;

  return {
    totalInvested,
    currentValue,
    unrealizedPnl,
    realizedPnl,
    totalPnl,
    totalPnlPercent,
    activeCount,
    soldCount,
  };
}

/** Net worth contribution from active investments (market value). */
export function getInvestmentsNetWorth(investments: Investment[]): number {
  return investments
    .filter((i) => i.status === 'active')
    .reduce((s, i) => s + i.currentValue, 0);
}

/**
 * Full net worth = accounts balance + net loan position + investments value.
 *
 * Buying an investment moves cash → asset, so it should not change net worth
 * at the moment of purchase. Price appreciation (currentPrice > buyPrice) is
 * what moves net worth up; depreciation moves it down.
 */
export function getTotalNetWorth(
  accounts: Account[],
  loans: Loan[],
  investments: Investment[]
): number {
  return (
    getTotalBalance(accounts) +
    getLoansNetWorth(loans) +
    getInvestmentsNetWorth(investments)
  );
}

/** Investment P&L per unit, in currency. */
export function getInvestmentPnl(inv: Investment): {
  pnl: number;
  pnlPercent: number;
  marketValue: number;
} {
  const marketValue = inv.units * inv.currentPrice;
  const pnl = marketValue - inv.investedAmount;
  const pnlPercent =
    inv.investedAmount > 0 ? (pnl / inv.investedAmount) * 100 : 0;
  return { pnl, pnlPercent, marketValue };
}