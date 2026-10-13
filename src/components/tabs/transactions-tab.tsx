'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Wallet,
  CalendarDays,
  List,
  PieChart,
  LayoutGrid,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { TransactionItem } from '../transaction-item';
import type { Transaction } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatCurrency, formatCurrencyCompact } from '@/lib/currencies';
import {
  groupTransactionsByDay,
  getDailyTotals,
  getMonthlyTotals,
  getCalendarDays,
  formatDateLabel,
  formatDateKey,
  formatMonthYear,
  monthYearKey,
  getTotalBalance,
} from '@/lib/finance';

type ViewMode = 'daily' | 'calendar' | 'monthly' | 'summary';

interface TransactionsTabProps {
  onEditTransaction: (tx: Transaction) => void;
}

/** Time-of-day greeting. */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

export function TransactionsTab({ onEditTransaction }: TransactionsTabProps) {
  const { transactions, accounts, preferences, deleteTransaction } = useStore();
  const user = useStore((s) => s.user);
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [selectedMonth, setSelectedMonth] = useState(() => new Date());
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string | null>(
    null
  );

  const monthYear = monthYearKey(selectedMonth.getTime());
  const monthTxs = useMemo(
    () => transactions.filter((t) => monthYearKey(t.date) === monthYear),
    [transactions, monthYear]
  );
  const totals = useMemo(
    () => getMonthlyTotals(transactions, monthYear),
    [transactions, monthYear]
  );
  const totalBalance = useMemo(() => getTotalBalance(accounts), [accounts]);

  // Fall back to the local-part of the email if no display name is set.
  const firstName =
    user?.displayName?.trim().split(' ')[0] ||
    user?.email?.split('@')[0] ||
    '';
  const greeting = getGreeting();

  const changeMonth = (dir: number) => {
    const d = new Date(selectedMonth);
    d.setMonth(d.getMonth() + dir);
    setSelectedMonth(d);
    setCalendarSelectedDate(null);
  };

  const viewModes: { key: ViewMode; label: string; icon: typeof List }[] = [
    { key: 'daily', label: 'Daily', icon: List },
    { key: 'calendar', label: 'Calendar', icon: CalendarDays },
    { key: 'monthly', label: 'Monthly', icon: LayoutGrid },
    { key: 'summary', label: 'Summary', icon: PieChart },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Greeting */}
      <div className="px-4 pt-4 pb-1">
        <p className="text-sm text-muted-foreground">
          {greeting}
          {firstName ? ',' : ''}
        </p>
        <h1 className="text-2xl font-bold truncate">
          {firstName ? `${firstName} 👋` : 'Hello 👋'}
        </h1>
      </div>

      {/* Balance Card */}
      <div className="px-4 pt-3">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-5 shadow-lg shadow-primary/20"
        >
          <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-white/10" />
          <div className="absolute -bottom-12 -left-4 h-24 w-24 rounded-full bg-white/5" />
          <div className="relative">
            <p className="text-sm opacity-90 font-medium">Total Balance</p>
            <p className="text-3xl font-bold mt-1 tabular-nums">
              {formatCurrency(totalBalance, preferences.currencySymbol)}
            </p>
            <div className="flex gap-4 mt-4">
              <div className="flex items-center gap-1.5">
                <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center">
                  <TrendingDown className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs opacity-75">Expense</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatCurrencyCompact(totals.expense, preferences.currencySymbol)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs opacity-75">Income</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatCurrencyCompact(totals.income, preferences.currencySymbol)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Month selector */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button
          onClick={() => changeMonth(-1)}
          className="p-2 rounded-xl hover:bg-muted"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-base font-semibold">{formatMonthYear(monthYear)}</h2>
        <button
          onClick={() => changeMonth(1)}
          className="p-2 rounded-xl hover:bg-muted"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* View mode tabs */}
      <div className="flex gap-1 px-4 pb-3 overflow-x-auto no-scrollbar">
        {viewModes.map((mode) => {
          const Icon = mode.icon;
          const isActive = viewMode === mode.key;
          return (
            <button
              key={mode.key}
              onClick={() => setViewMode(mode.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {mode.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 pb-40">
        <AnimatePresence mode="wait">
          <motion.div
            key={viewMode}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
          >
            {viewMode === 'daily' && (
              <DailyView
                transactions={monthTxs}
                onEdit={onEditTransaction}
                onDelete={deleteTransaction}
                symbol={preferences.currencySymbol}
              />
            )}
            {viewMode === 'calendar' && (
              <CalendarView
                transactions={transactions}
                selectedMonth={selectedMonth}
                weekStartDay={preferences.weekStartDay}
                selectedDate={calendarSelectedDate}
                onSelectDate={setCalendarSelectedDate}
                onEdit={onEditTransaction}
                onDelete={deleteTransaction}
                symbol={preferences.currencySymbol}
              />
            )}
            {viewMode === 'monthly' && (
              <MonthlyView
                transactions={transactions}
                symbol={preferences.currencySymbol}
                selectedMonth={selectedMonth}
              />
            )}
            {viewMode === 'summary' && (
              <SummaryView
                transactions={transactions}
                accounts={accounts}
                symbol={preferences.currencySymbol}
                selectedMonth={selectedMonth}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function DailyView({
  transactions,
  onEdit,
  onDelete,
  symbol,
}: {
  transactions: Transaction[];
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
  symbol: string;
}) {
  const grouped = useMemo(() => groupTransactionsByDay(transactions), [transactions]);

  if (grouped.size === 0) {
    return <EmptyState message="No transactions this month. Tap + to add one." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {Array.from(grouped.entries()).map(([dayKey, txs]) => {
        const totals = getDailyTotals(transactions, dayKey);
        return (
          <div key={dayKey}>
            <div className="flex items-center justify-between px-1 py-2">
              <span className="text-sm font-semibold">
                {formatDateLabel(new Date(dayKey).getTime())}
              </span>
              <div className="flex gap-3 text-xs">
                {totals.income > 0 && (
                  <span className="text-income font-medium">
                    +{formatCurrencyCompact(totals.income, symbol)}
                  </span>
                )}
                {totals.expense > 0 && (
                  <span className="text-expense font-medium">
                    -{formatCurrencyCompact(totals.expense, symbol)}
                  </span>
                )}
              </div>
            </div>
            <div className="bg-card rounded-2xl border border-border/40 px-1">
              {txs.map((tx) => (
                <TransactionItem
                  key={tx.id}
                  transaction={tx}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarView({
  transactions,
  selectedMonth,
  weekStartDay,
  selectedDate,
  onSelectDate,
  onEdit,
  onDelete,
  symbol,
}: {
  transactions: Transaction[];
  selectedMonth: Date;
  weekStartDay: 0 | 1;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
  symbol: string;
}) {
  const days = useMemo(
    () =>
      getCalendarDays(
        selectedMonth.getFullYear(),
        selectedMonth.getMonth(),
        weekStartDay
      ),
    [selectedMonth, weekStartDay]
  );
  const weekDays =
    weekStartDay === 1
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const selectedTxs = selectedDate
    ? transactions
        .filter((t) => formatDateKey(t.date) === selectedDate)
        .sort((a, b) => b.date - a.date)
    : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-card rounded-2xl border border-border/40 p-3">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map((d) => (
            <div
              key={d}
              className="text-center text-xs font-medium text-muted-foreground py-1"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, i) => {
            if (!day) return <div key={i} />;
            const dayKey = formatDateKey(day.getTime());
            const dayTxs = transactions.filter(
              (t) => formatDateKey(t.date) === dayKey && t.type !== 'transfer'
            );
            const expense = dayTxs
              .filter((t) => t.type === 'expense')
              .reduce((s, t) => s + t.amount, 0);
            const income = dayTxs
              .filter((t) => t.type === 'income')
              .reduce((s, t) => s + t.amount, 0);
            const net = income - expense;
            const isToday = formatDateKey(Date.now()) === dayKey;
            const isSelected = selectedDate === dayKey;

            return (
              <button
                key={i}
                onClick={() => onSelectDate(dayKey)}
                className={cn(
                  'aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all relative',
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : isToday
                    ? 'bg-primary/10'
                    : 'hover:bg-muted'
                )}
              >
                <span
                  className={cn(
                    'text-xs font-medium',
                    isSelected && 'text-primary-foreground'
                  )}
                >
                  {day.getDate()}
                </span>
                {net !== 0 && (
                  <span
                    className={cn(
                      'text-[8px] font-semibold tabular-nums leading-none',
                      isSelected
                        ? 'text-primary-foreground/80'
                        : net > 0
                        ? 'text-income'
                        : 'text-expense'
                    )}
                  >
                    {net > 0 ? '+' : ''}
                    {formatCurrencyCompact(net, symbol).replace(symbol, '')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between px-1 py-2">
            <span className="text-sm font-semibold">
              {formatDateLabel(new Date(selectedDate).getTime())}
            </span>
            <span className="text-xs text-muted-foreground">
              {selectedTxs.length} transaction{selectedTxs.length !== 1 ? 's' : ''}
            </span>
          </div>
          {selectedTxs.length > 0 ? (
            <div className="bg-card rounded-2xl border border-border/40 px-1">
              {selectedTxs.map((tx) => (
                <TransactionItem
                  key={tx.id}
                  transaction={tx}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-border/40 p-8 text-center text-sm text-muted-foreground">
              No transactions on this day
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

function MonthlyView({
  transactions,
  symbol,
  selectedMonth,
}: {
  transactions: Transaction[];
  symbol: string;
  selectedMonth: Date;
}) {
  const monthsData = useMemo(() => {
    const result: {
      label: string;
      monthYear: string;
      income: number;
      expense: number;
      net: number;
    }[] = [];
    for (let m = 5; m >= 0; m--) {
      const d = new Date(
        selectedMonth.getFullYear(),
        selectedMonth.getMonth() - m,
        1
      );
      const myKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        '0'
      )}`;
      const totals = getMonthlyTotals(transactions, myKey);
      result.push({
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        monthYear: myKey,
        ...totals,
      });
    }
    return result;
  }, [transactions, selectedMonth]);

  const maxVal = Math.max(...monthsData.map((d) => Math.max(d.income, d.expense)), 1);

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-card rounded-2xl border border-border/40 p-4">
        <h3 className="text-sm font-semibold mb-4">6-Month Overview</h3>
        <div className="flex items-end justify-between gap-2 h-32">
          {monthsData.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col items-center gap-0.5 justify-end h-24">
                <div
                  className="w-full max-w-[24px] rounded-t-lg bg-income transition-all"
                  style={{
                    height: `${(d.income / maxVal) * 50}%`,
                    minHeight: d.income > 0 ? '4px' : '0',
                  }}
                  title={`Income: ${formatCurrency(d.income, symbol)}`}
                />
                <div
                  className="w-full max-w-[24px] rounded-b-lg bg-expense transition-all"
                  style={{
                    height: `${(d.expense / maxVal) * 50}%`,
                    minHeight: d.expense > 0 ? '4px' : '0',
                  }}
                  title={`Expense: ${formatCurrency(d.expense, symbol)}`}
                />
              </div>
              <span className="text-[10px] text-muted-foreground font-medium">
                {d.label}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded bg-income" />
            <span className="text-xs text-muted-foreground">Income</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded bg-expense" />
            <span className="text-xs text-muted-foreground">Expense</span>
          </div>
        </div>
      </div>

      {monthsData.map((d) => (
        <div key={d.monthYear} className="bg-card rounded-2xl border border-border/40 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">{formatMonthYear(d.monthYear)}</span>
            <span
              className={cn(
                'text-sm font-bold tabular-nums',
                d.net >= 0 ? 'text-income' : 'text-expense'
              )}
            >
              {d.net >= 0 ? '+' : ''}
              {formatCurrency(d.net, symbol)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              Income:{' '}
              <span className="text-income font-medium">
                {formatCurrency(d.income, symbol)}
              </span>
            </span>
            <span className="text-muted-foreground">
              Expense:{' '}
              <span className="text-expense font-medium">
                {formatCurrency(d.expense, symbol)}
              </span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryView({
  transactions,
  accounts,
  symbol,
  selectedMonth,
}: {
  transactions: Transaction[];
  accounts: ReturnType<typeof useStore.getState>['accounts'];
  symbol: string;
  selectedMonth: Date;
}) {
  const monthYear = monthYearKey(selectedMonth.getTime());
  const totals = getMonthlyTotals(transactions, monthYear);
  const totalBalance = getTotalBalance(accounts);
  const totalAssets = accounts
    .filter((a) => a.isIncludedInTotal && a.balance > 0)
    .reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = accounts
    .filter((a) => a.isIncludedInTotal && a.balance < 0)
    .reduce((s, a) => s + Math.abs(a.balance), 0);
  const savingsRate =
    totals.income > 0 ? ((totals.income - totals.expense) / totals.income) * 100 : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-card rounded-2xl border border-border/40 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">Net Worth</h3>
        </div>
        <p className="text-3xl font-bold tabular-nums">
          {formatCurrency(totalBalance, symbol)}
        </p>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="rounded-xl bg-income/10 p-3">
            <p className="text-xs text-muted-foreground">Total Assets</p>
            <p className="text-lg font-bold text-income tabular-nums">
              {formatCurrency(totalAssets, symbol)}
            </p>
          </div>
          <div className="rounded-xl bg-expense/10 p-3">
            <p className="text-xs text-muted-foreground">Liabilities</p>
            <p className="text-lg font-bold text-expense tabular-nums">
              {formatCurrency(totalLiabilities, symbol)}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border/40 p-5">
        <h3 className="text-sm font-semibold mb-3">
          {formatMonthYear(monthYear)} Summary
        </h3>
        <div className="flex flex-col gap-3">
          <SummaryRow
            label="Total Income"
            value={formatCurrency(totals.income, symbol)}
            color="text-income"
          />
          <SummaryRow
            label="Total Expense"
            value={formatCurrency(totals.expense, symbol)}
            color="text-expense"
          />
          <div className="border-t pt-3">
            <SummaryRow
              label="Net Cash Flow"
              value={`${totals.net >= 0 ? '+' : ''}${formatCurrency(
                totals.net,
                symbol
              )}`}
              color={totals.net >= 0 ? 'text-income' : 'text-expense'}
              bold
            />
          </div>
          <div className="border-t pt-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Savings Rate</span>
              <span
                className={cn(
                  'text-sm font-bold tabular-nums',
                  savingsRate >= 0 ? 'text-income' : 'text-expense'
                )}
              >
                {savingsRate.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border/40 p-5">
        <h3 className="text-sm font-semibold mb-3">Accounts Breakdown</h3>
        <div className="flex flex-col gap-2">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="flex items-center justify-between py-2 border-b last:border-0"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium capitalize text-muted-foreground">
                  {acc.type}
                </span>
                <span className="text-sm font-medium">{acc.name}</span>
              </div>
              <span
                className={cn(
                  'text-sm font-semibold tabular-nums',
                  acc.balance >= 0 ? 'text-foreground' : 'text-expense'
                )}
              >
                {formatCurrency(acc.balance, symbol)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: string;
  color: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={cn(
          'text-sm text-muted-foreground',
          bold && 'text-foreground font-medium'
        )}
      >
        {label}
      </span>
      <span className={cn('text-sm tabular-nums', color, bold && 'font-bold text-base')}>
        {value}
      </span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Wallet className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
    </div>
  );
}