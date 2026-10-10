'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus, Pencil, Trash2, Target, AlertTriangle, X, Check } from 'lucide-react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CategoryIcon } from '@/components/icon-map';
import { useStore } from '@/lib/store';
import type { Budget, Category } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currencies';
import { getBudgetProgress, getMonthTotalSpent, formatMonthYear, monthYearKey } from '@/lib/finance';
import { toast } from 'sonner';

export function BudgetsView() {
  const { budgets, transactions, categories, preferences, addBudget, updateBudget, deleteBudget } = useStore();
  const [editing, setEditing] = useState<Budget | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const currentMonth = monthYearKey(Date.now());
  const monthBudgets = budgets.filter((b) => b.monthYear === currentMonth);

  const totalBudget = monthBudgets.reduce((s, b) => s + b.amount, 0);
  // Compute spent from raw transactions — do NOT sum per-budget progress (double-counts).
  const totalSpent = useMemo(
    () => getMonthTotalSpent(transactions, currentMonth),
    [transactions, currentMonth]
  );
  const overallPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-3xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-5 shadow-lg shadow-primary/20">
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-5 w-5" />
          <span className="text-sm font-medium opacity-90">Overall Budget — {formatMonthYear(currentMonth)}</span>
        </div>
        <p className="text-3xl font-bold tabular-nums">
          {formatCurrency(totalSpent, preferences.currencySymbol)}
          <span className="text-lg opacity-75 font-normal"> / {formatCurrency(totalBudget, preferences.currencySymbol)}</span>
        </p>
        <div className="mt-3 h-2.5 rounded-full bg-white/20 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(overallPercentage, 100)}%` }}
            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
            className={cn(
              'h-full rounded-full transition-colors',
              overallPercentage >= 100 ? 'bg-destructive' : overallPercentage >= 80 ? 'bg-warning' : 'bg-white'
            )}
          />
        </div>
        <p className="text-xs opacity-75 mt-2">
          {totalBudget === 0
            ? 'No budgets set for this month yet.'
            : overallPercentage >= 100
            ? 'Budget exceeded! Consider adjusting your spending.'
            : `${(100 - overallPercentage).toFixed(0)}% remaining`}
        </p>
      </div>

      <Button variant="outline" className="rounded-2xl border-dashed" onClick={() => setIsAdding(true)}>
        <Plus className="h-4 w-4 mr-2" /> Add Budget
      </Button>

      {monthBudgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Target className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No budgets set for this month yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {monthBudgets.map((budget, i) => {
            const cat = categories.find((c) => c.id === budget.categoryId);
            const progress = getBudgetProgress(budget, transactions, categories);
            return (
              <motion.div
                key={budget.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-card rounded-2xl border border-border/40 p-4"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: cat ? `${cat.color}1A` : 'hsl(var(--muted))' }}
                  >
                    {cat ? (
                      <span style={{ color: cat.color }}>
                        <CategoryIcon name={cat.icon} size={20} />
                      </span>
                    ) : (
                      <Target className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{cat?.name ?? 'Overall Budget'}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatCurrency(progress.spent, preferences.currencySymbol)} of {formatCurrency(budget.amount, preferences.currencySymbol)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(budget)} className="p-2 rounded-xl hover:bg-muted">
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => {
                        deleteBudget(budget.id);
                        toast.success('Budget deleted');
                      }}
                      className="p-2 rounded-xl hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </button>
                  </div>
                </div>

                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress.percentage}%` }}
                    transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                    className={cn(
                      'h-full rounded-full',
                      progress.isOver ? 'bg-destructive' : progress.isWarning ? 'bg-warning' : 'bg-primary'
                    )}
                  />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {progress.percentage.toFixed(0)}% used
                  </span>
                  <span
                    className={cn(
                      'text-xs font-medium tabular-nums',
                      progress.isOver ? 'text-destructive' : progress.isWarning ? 'text-warning' : 'text-muted-foreground'
                    )}
                  >
                    {progress.isOver ? (
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Over by {formatCurrency(progress.spent - budget.amount, preferences.currencySymbol)}
                      </span>
                    ) : (
                      `${formatCurrency(progress.remaining, preferences.currencySymbol)} left`
                    )}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <BudgetSheet
        open={isAdding || editing !== null}
        budget={editing}
        onOpenChange={(open) => {
          if (!open) {
            setIsAdding(false);
            setEditing(null);
          }
        }}
        onSave={(data, id) => {
          if (id) {
            updateBudget(id, data);
            toast.success('Budget updated');
          } else {
            addBudget(data);
            toast.success('Budget added');
          }
          setIsAdding(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function BudgetSheet({
  open,
  budget,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  budget: Budget | null;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Omit<Budget, 'id'>, id?: string) => void;
}) {
  const { categories, preferences } = useStore();
  const formKey = open ? (budget?.id ?? 'new') : 'closed';

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="rounded-t-[2rem]">
        <div className="mx-auto w-full max-w-md px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2">
          <h2 className="text-xl font-bold mb-4">{budget ? 'Edit Budget' : 'New Budget'}</h2>
          <BudgetForm
            key={formKey}
            initialAmount={budget?.amount ?? 0}
            initialCategoryId={budget?.categoryId ?? null}
            initialCarryOver={budget?.carryOver ?? false}
            currencySymbol={preferences.currencySymbol}
            categories={categories}
            onCancel={() => onOpenChange(false)}
            onSubmit={(data) =>
              onSave(
                {
                  ...data,
                  monthYear: monthYearKey(Date.now()),
                  period: 'monthly',
                },
                budget?.id
              )
            }
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function BudgetForm({
  initialAmount,
  initialCategoryId,
  initialCarryOver,
  currencySymbol,
  categories,
  onCancel,
  onSubmit,
}: {
  initialAmount: number;
  initialCategoryId: string | null;
  initialCarryOver: boolean;
  currencySymbol: string;
  categories: Category[];
  onCancel: () => void;
  onSubmit: (data: { amount: number; categoryId: string | null; carryOver: boolean }) => void;
}) {
  const [amount, setAmount] = useState(String(initialAmount));
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId);
  const [carryOver, setCarryOver] = useState(initialCarryOver);
  const expenseCategories = categories.filter((c) => c.type === 'expense' && !c.parentId && !c.isHidden);

  const handleSubmit = () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    onSubmit({ amount: amt, categoryId, carryOver });
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label className="text-xs text-muted-foreground">Budget for Category</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          <button
            onClick={() => setCategoryId(null)}
            className={cn(
              'px-3 py-2 rounded-xl text-sm font-medium transition-all',
              categoryId === null ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            Overall
          </button>
          {expenseCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryId(cat.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all',
                categoryId === cat.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}
            >
              <span style={{ color: categoryId === cat.id ? 'inherit' : cat.color }}>
                <CategoryIcon name={cat.icon} size={14} />
              </span>
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Monthly Budget Amount</Label>
        <div className="relative mt-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{currencySymbol}</span>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="rounded-xl pl-8 text-lg"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm">Carry over</Label>
          <p className="text-xs text-muted-foreground">Roll over unused budget to next month</p>
        </div>
        <Switch checked={carryOver} onCheckedChange={setCarryOver} />
      </div>

      <div className="flex gap-2 mt-2">
        <Button variant="outline" className="flex-1 rounded-xl" onClick={onCancel}>
          <X className="h-4 w-4 mr-1" /> Cancel
        </Button>
        <Button className="flex-1 rounded-xl" onClick={handleSubmit}>
          <Check className="h-4 w-4 mr-1" /> Save
        </Button>
      </div>
    </div>
  );
}