'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Pencil,
  Trash2,
  Target,
  AlertTriangle,
  X,
  Check,
} from 'lucide-react';
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
import {
  getBudgetProgress,
  getMonthTotalSpent,
  getMonthRange,
  formatMonthYear,
  monthYearKey,
} from '@/lib/finance';
import { toast } from 'sonner';

export function BudgetsView() {
  const {
    budgets,
    transactions,
    categories,
    preferences,
    addBudget,
    updateBudget,
    deleteBudget,
  } = useStore();
  const [editing, setEditing] = useState<Budget | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const currentMonth = monthYearKey(Date.now());
  const monthBudgets = useMemo(
    () => budgets.filter((b) => b.monthYear === currentMonth),
    [budgets, currentMonth]
  );

  const overallBudget = monthBudgets.find((b) => b.categoryId === null);
  const categoryBudgets = useMemo(
    () => monthBudgets.filter((b) => b.categoryId !== null),
    [monthBudgets]
  );

  const totalBudget = overallBudget
    ? overallBudget.amount
    : categoryBudgets.reduce((s, b) => s + b.amount, 0);

  /*
    When there's an explicit overall budget, "spent" is all-month spending.
    Otherwise we only count spending in budgeted categories so the aggregate
    figure is consistent with the per-category cards below it.
  */
  const totalSpent = useMemo(() => {
    if (overallBudget) {
      return getMonthTotalSpent(transactions, currentMonth);
    }
    if (categoryBudgets.length === 0) return 0;

    const { start, end } = getMonthRange(currentMonth);
    const budgetedCatIds = new Set<string>();
    categoryBudgets.forEach((b) => {
      if (!b.categoryId) return;
      budgetedCatIds.add(b.categoryId);
      categories
        .filter((c) => c.parentId === b.categoryId)
        .forEach((c) => budgetedCatIds.add(c.id));
    });

    return transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          !t.isExcludedFromBudget &&
          t.date >= start &&
          t.date < end &&
          t.categoryId !== null &&
          budgetedCatIds.has(t.categoryId)
      )
      .reduce((s, t) => s + t.amount, 0);
  }, [transactions, currentMonth, overallBudget, categoryBudgets, categories]);

  const overallPercentage =
    totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  const handleSave = async (data: Omit<Budget, 'id'>, id?: string) => {
    const duplicate = budgets.find(
      (b) =>
        b.monthYear === currentMonth &&
        b.categoryId === data.categoryId &&
        b.id !== id
    );
    if (duplicate) {
      toast.error(
        data.categoryId
          ? 'A budget for this category already exists this month'
          : 'An overall budget already exists this month'
      );
      return;
    }
    try {
      if (id) {
        await updateBudget(id, data);
        toast.success('Budget updated');
      } else {
        await addBudget(data);
        toast.success('Budget added');
      }
      setIsAdding(false);
      setEditing(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save budget');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-3xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-5 shadow-lg shadow-primary/20">
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-5 w-5" />
          <span className="text-sm font-medium opacity-90">
            {overallBudget ? 'Overall Budget' : 'Category Budgets'} —{' '}
            {formatMonthYear(currentMonth)}
          </span>
        </div>
        <p className="text-3xl font-bold tabular-nums">
          {formatCurrency(totalSpent, preferences.currencySymbol)}
          <span className="text-lg opacity-75 font-normal">
            {' '}
            / {formatCurrency(totalBudget, preferences.currencySymbol)}
          </span>
        </p>
        <div className="mt-3 h-2.5 rounded-full bg-white/20 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(overallPercentage, 100)}%` }}
            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
            className={cn(
              'h-full rounded-full transition-colors',
              overallPercentage >= 100
                ? 'bg-destructive'
                : overallPercentage >= 80
                ? 'bg-warning'
                : 'bg-white'
            )}
          />
        </div>
        <p className="text-xs opacity-75 mt-2">
          {totalBudget === 0
            ? 'No budgets set for this month yet.'
            : overallPercentage >= 100
            ? 'Budget exceeded! Consider adjusting your spending.'
            : `${Math.max(0, 100 - overallPercentage).toFixed(0)}% remaining`}
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        className="rounded-2xl border-dashed"
        onClick={() => setIsAdding(true)}
      >
        <Plus className="h-4 w-4 mr-2" /> Add Budget
      </Button>

      {monthBudgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Target className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            No budgets set for this month yet
          </p>
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
                    style={{
                      backgroundColor: cat
                        ? `${cat.color}1A`
                        : 'hsl(var(--muted))',
                    }}
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
                    <p className="font-semibold text-sm">
                      {cat?.name ?? 'Overall Budget'}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatCurrency(
                        progress.spent,
                        preferences.currencySymbol
                      )}{' '}
                      of{' '}
                      {formatCurrency(budget.amount, preferences.currencySymbol)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(budget)}
                      className="p-2 rounded-xl hover:bg-muted"
                      aria-label="Edit budget"
                    >
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        toast('Delete this budget?', {
                          duration: 6000,
                          action: {
                            label: 'Delete',
                            onClick: async () => {
                              try {
                                await deleteBudget(budget.id);
                                toast.success('Budget deleted');
                              } catch (err) {
                                console.error(err);
                                toast.error('Failed to delete budget');
                              }
                            },
                          },
                          cancel: { label: 'Cancel', onClick: () => {} },
                        });
                      }}
                      className="p-2 rounded-xl hover:bg-destructive/10"
                      aria-label="Delete budget"
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
                      progress.isOver
                        ? 'bg-destructive'
                        : progress.isWarning
                        ? 'bg-warning'
                        : 'bg-primary'
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
                      progress.isOver
                        ? 'text-destructive'
                        : progress.isWarning
                        ? 'text-warning'
                        : 'text-muted-foreground'
                    )}
                  >
                    {progress.isOver ? (
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Over by{' '}
                        {formatCurrency(
                          progress.spent - budget.amount,
                          preferences.currencySymbol
                        )}
                      </span>
                    ) : (
                      `${formatCurrency(
                        progress.remaining,
                        preferences.currencySymbol
                      )} left`
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
        onSave={handleSave}
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
  onSave: (data: Omit<Budget, 'id'>, id?: string) => void | Promise<void>;
}) {
  const { categories, preferences } = useStore();
  const formKey = open ? budget?.id ?? 'new' : 'closed';

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs>
      <DrawerContent className="rounded-t-[2rem] flex flex-col max-h-[90dvh] overflow-hidden">
        <div className="shrink-0 px-4 pt-2 pb-3">
          <h2 className="text-xl font-bold">
            {budget ? 'Edit Budget' : 'New Budget'}
          </h2>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 scroll-pt-4">
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
  onSubmit: (data: {
    amount: number;
    categoryId: string | null;
    carryOver: boolean;
  }) => void;
}) {
  const [amount, setAmount] = useState(String(initialAmount));
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId);
  const [carryOver, setCarryOver] = useState(initialCarryOver);

  const expenseCategories = categories.filter(
    (c) => c.type === 'expense' && !c.parentId && !c.isHidden
  );

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
        <Label className="text-xs text-muted-foreground">
          Budget for Category
        </Label>
        <div className="flex flex-wrap gap-2 mt-1">
          <button
            type="button"
            onClick={() => setCategoryId(null)}
            className={cn(
              'px-3 py-2 rounded-xl text-sm font-medium transition-all',
              categoryId === null
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            )}
          >
            Overall
          </button>
          {expenseCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryId(cat.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all',
                categoryId === cat.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              <span
                style={{
                  color: categoryId === cat.id ? 'inherit' : cat.color,
                }}
              >
                <CategoryIcon name={cat.icon} size={14} />
              </span>
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">
          Monthly Budget Amount
        </Label>
        <div className="relative mt-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {currencySymbol}
          </span>
          <Input
            type="number"
            inputMode="decimal"
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
          <p className="text-xs text-muted-foreground">
            Roll over unused budget to next month
          </p>
        </div>
        <Switch checked={carryOver} onCheckedChange={setCarryOver} />
      </div>

      <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] bg-background border-t flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 rounded-xl"
          onClick={onCancel}
        >
          <X className="h-4 w-4 mr-1" /> Cancel
        </Button>
        <Button
          type="button"
          className="flex-1 rounded-xl"
          onClick={handleSubmit}
        >
          <Check className="h-4 w-4 mr-1" /> Save
        </Button>
      </div>
    </div>
  );
}