import type { Transaction, Account, Category, Budget } from './types';

export function formatDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthYearKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Parse 'YYYY-MM-DD' as a LOCAL date (not UTC). */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Get the [start, end) millisecond range for a 'YYYY-MM' month key, in local time. */
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

  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatDateLong(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

export function formatMonthYear(monthYear: string): string {
  const [year, month] = monthYear.split('-');
  return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  });
}

export function groupTransactionsByDay(transactions: Transaction[]): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>();
  const sorted = [...transactions].sort((a, b) => b.date - a.date);
  for (const tx of sorted) {
    const key = formatDateKey(tx.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(tx);
  }
  return map;
}

export function getTransactionsForMonth(transactions: Transaction[], monthYear: string): Transaction[] {
  return transactions.filter((tx) => monthYearKey(tx.date) === monthYear);
}

export function getDailyTotals(transactions: Transaction[], dayKey: string): { income: number; expense: number } {
  const dayTxs = transactions.filter((tx) => formatDateKey(tx.date) === dayKey && tx.type !== 'transfer');
  return {
    income: dayTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    expense: dayTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
  };
}

export function getMonthlyTotals(transactions: Transaction[], monthYear: string): { income: number; expense: number; net: number } {
  const monthTxs = getTransactionsForMonth(transactions, monthYear).filter(
    (t) => !t.isExcludedFromStats && t.type !== 'transfer'
  );
  const income = monthTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = monthTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return { income, expense, net: income - expense };
}

export function getTotalBalance(accounts: Account[]): number {
  return accounts.filter((a) => a.isIncludedInTotal).reduce((sum, a) => sum + a.balance, 0);
}

export function getCategoryById(categories: Category[], id: string | null): Category | undefined {
  if (!id) return undefined;
  return categories.find((c) => c.id === id);
}

export function getAccountById(accounts: Account[], id: string): Account | undefined {
  return accounts.find((a) => a.id === id);
}

function findRootCategory(categories: Category[], catId: string): Category | undefined {
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
): { categoryId: string; name: string; color: string; icon: string; amount: number; percentage: number }[] {
  let filtered = transactions.filter((t) => t.type === type && !t.isExcludedFromStats);
  if (monthYear) filtered = filtered.filter((t) => monthYearKey(t.date) === monthYear);

  const total = filtered.reduce((sum, t) => sum + t.amount, 0);
  if (total === 0) return [];

  // Aggregate by ROOT category so subcategories roll up into their parent.
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

export function getBudgetProgress(
  budget: Budget,
  transactions: Transaction[],
  categories: Category[]
): { spent: number; remaining: number; percentage: number; isOver: boolean; isWarning: boolean } {
  const { start, end } = getMonthRange(budget.monthYear);

  const monthTxs = transactions.filter(
    (t) => t.type === 'expense' && !t.isExcludedFromBudget && t.date >= start && t.date < end
  );

  let spent: number;
  if (budget.categoryId) {
    const subcats = categories.filter((c) => c.parentId === budget.categoryId).map((c) => c.id);
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

export function getMonthTotalSpent(transactions: Transaction[], monthYear: string): number {
  const { start, end } = getMonthRange(monthYear);
  return transactions
    .filter((t) => t.type === 'expense' && !t.isExcludedFromBudget && t.date >= start && t.date < end)
    .reduce((s, t) => s + t.amount, 0);
}

export function exportToCSV(transactions: Transaction[], accounts: Account[], categories: Category[]): string {
  const headers = ['Date', 'Type', 'Amount', 'Account', 'To Account', 'Category', 'Note', 'Excluded from Stats', 'Excluded from Budget'];
  const rows = transactions.map((tx) => {
    const acc = accounts.find((a) => a.id === tx.accountId)?.name ?? '';
    const toAcc = tx.toAccountId ? accounts.find((a) => a.id === tx.toAccountId)?.name ?? '' : '';
    const cat = tx.categoryId ? categories.find((c) => c.id === tx.categoryId)?.name ?? '' : '';
    return [
      new Date(tx.date).toISOString(),
      tx.type,
      tx.amount.toString(),
      acc,
      toAcc,
      cat,
      tx.note.replace(/,/g, ';'),
      tx.isExcludedFromStats ? 'yes' : 'no',
      tx.isExcludedFromBudget ? 'yes' : 'no',
    ].join(',');
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

export function getCalendarDays(year: number, month: number, weekStartDay: 0 | 1): (Date | null)[] {
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

export function getMonthlyTrend(transactions: Transaction[], months: number): { label: string; income: number; expense: number; net: number }[] {
  const result: { label: string; income: number; expense: number; net: number }[] = [];
  const now = new Date();
  for (let m = months - 1; m >= 0; m--) {
    const date = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const myKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const totals = getMonthlyTotals(transactions, myKey);
    result.push({ label: date.toLocaleDateString('en-US', { month: 'short' }), ...totals });
  }
  return result;
}