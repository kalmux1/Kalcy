'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  PieChart as PieChartIcon,
  BarChart3,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import { useStore } from '@/lib/store';
import { CategoryIcon } from '@/components/icon-map';
import { cn } from '@/lib/utils';
import { formatCurrency, formatCurrencyCompact } from '@/lib/currencies';
import {
  getCategoryBreakdown,
  getMonthlyTrend,
  getMonthlyTotals,
  monthYearKey,
  formatMonthYear,
} from '@/lib/finance';

export function StatsTab() {
  const { transactions, categories, preferences } = useStore();
  const [selectedMonth, setSelectedMonth] = useState(() => new Date());
  const [chartType, setChartType] = useState<'expense' | 'income'>('expense');

  const monthYear = monthYearKey(selectedMonth.getTime());
  const totals = useMemo(
    () => getMonthlyTotals(transactions, monthYear),
    [transactions, monthYear]
  );
  const breakdown = useMemo(
    () => getCategoryBreakdown(transactions, categories, chartType, monthYear),
    [transactions, categories, chartType, monthYear]
  );

  // Trend is relative to the selected month, not today.
  const monthlyTrend = useMemo(
    () => getMonthlyTrend(transactions, 6, selectedMonth),
    [transactions, selectedMonth]
  );

  const changeMonth = (dir: number) => {
    const d = new Date(selectedMonth);
    d.setMonth(d.getMonth() + dir);
    setSelectedMonth(d);
  };

  const pieData = breakdown.slice(0, 8).map((b) => ({
    name: b.name,
    value: b.amount,
    color: b.color,
  }));
  const otherAmount = breakdown.slice(8).reduce((s, b) => s + b.amount, 0);
  if (otherAmount > 0) {
    pieData.push({ name: 'Other', value: otherAmount, color: '#94A3B8' });
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-2xl font-bold">Statistics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Analyze your spending patterns</p>
      </div>

      {/* Month selector */}
      <div className="flex items-center justify-between px-4 py-2">
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

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 pb-40">
        {/* Income vs Expense card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 gap-3 mt-2"
        >
          <div className="rounded-2xl bg-income/10 p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-income" />
              <span className="text-xs text-muted-foreground font-medium">Income</span>
            </div>
            <p className="text-xl font-bold text-income tabular-nums">
              {formatCurrency(totals.income, preferences.currencySymbol)}
            </p>
          </div>
          <div className="rounded-2xl bg-expense/10 p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-expense rotate-180" />
              <span className="text-xs text-muted-foreground font-medium">Expense</span>
            </div>
            <p className="text-xl font-bold text-expense tabular-nums">
              {formatCurrency(totals.expense, preferences.currencySymbol)}
            </p>
          </div>
        </motion.div>

        {/* Chart type toggle */}
        <div className="flex gap-1 mt-4 p-1 bg-muted rounded-xl">
          {(['expense', 'income'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setChartType(t)}
              className={cn(
                'flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all',
                chartType === t
                  ? t === 'expense'
                    ? 'bg-expense text-white'
                    : 'bg-income text-white'
                  : 'text-muted-foreground'
              )}
            >
              {t} Breakdown
            </button>
          ))}
        </div>

        {/* Donut chart */}
        <div className="bg-card rounded-3xl border border-border/40 p-4 mt-3">
          {pieData.length > 0 ? (
            <>
              <div className="relative h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) =>
                        formatCurrency(value, preferences.currencySymbol)
                      }
                      contentStyle={{
                        borderRadius: '0.75rem',
                        border: 'none',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs text-muted-foreground">Total</span>
                  <span className="text-xl font-bold tabular-nums">
                    {formatCurrencyCompact(
                      chartType === 'expense' ? totals.expense : totals.income,
                      preferences.currencySymbol
                    )}
                  </span>
                </div>
              </div>

              {/* Breakdown list */}
              <div className="mt-4 flex flex-col gap-2">
                {breakdown.slice(0, 8).map((item) => (
                  <div key={item.categoryId} className="flex items-center gap-3">
                    <div
                      className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${item.color}1A` }}
                    >
                      <span style={{ color: item.color }}>
                        <CategoryIcon name={item.icon} size={16} />
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">{item.name}</span>
                        <span className="text-sm font-semibold tabular-nums">
                          {formatCurrency(item.amount, preferences.currencySymbol)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                          {item.percentage.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-muted-foreground">
              <PieChartIcon className="h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm">No {chartType} data this month</p>
            </div>
          )}
        </div>

        {/* Monthly trend bar chart */}
        <div className="bg-card rounded-3xl border border-border/40 p-4 mt-3">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold">6-Month Trend</h3>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrend} barGap={2}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    formatCurrencyCompact(v, preferences.currencySymbol)
                  }
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatCurrency(value, preferences.currencySymbol),
                    name === 'income' ? 'Income' : 'Expense',
                  ]}
                  contentStyle={{
                    borderRadius: '0.75rem',
                    border: 'none',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  }}
                  cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
                />
                <Bar
                  dataKey="income"
                  fill="hsl(var(--income))"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={20}
                />
                <Bar
                  dataKey="expense"
                  fill="hsl(var(--expense))"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cash flow line chart */}
        <div className="bg-card rounded-3xl border border-border/40 p-4 mt-3">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold">Cash Flow</h3>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrend}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    formatCurrencyCompact(v, preferences.currencySymbol)
                  }
                />
                <Tooltip
                  formatter={(value: number) =>
                    formatCurrency(value, preferences.currencySymbol)
                  }
                  contentStyle={{
                    borderRadius: '0.75rem',
                    border: 'none',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}