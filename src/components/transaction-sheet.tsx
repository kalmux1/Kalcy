'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Check, Calendar as CalendarIcon, FileText, Settings2, ArrowRight } from 'lucide-react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CalculatorNumpad } from './calculator-numpad';
import { CategoryIcon } from './icon-map';
import { useStore } from '@/lib/store';
import type { TransactionType, Transaction, Category } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatDateLong } from '@/lib/finance';
import { toast } from 'sonner';

interface TransactionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTransaction?: Transaction | null;
  defaultType?: TransactionType;
}

type Step = 'main' | 'category' | 'account' | 'toAccount' | 'date' | 'note';

export function TransactionSheet({
  open,
  onOpenChange,
  editingTransaction,
  defaultType = 'expense',
}: TransactionSheetProps) {
  const { accounts, categories, preferences, addTransaction, updateTransaction } = useStore();
  const [step, setStep] = useState<Step>('main');
  const [type, setType] = useState<TransactionType>(defaultType);
  const [amount, setAmount] = useState(0);
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [parentCategory, setParentCategory] = useState<Category | null>(null);
  const [date, setDate] = useState(Date.now());
  const [note, setNote] = useState('');
  const [isExcludedFromStats, setIsExcludedFromStats] = useState(false);
  const [isExcludedFromBudget, setIsExcludedFromBudget] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  // Reset form when the sheet opens or the target transaction changes.
  // NOTE: `accounts` is intentionally excluded from deps — it changes on
  // every Firestore snapshot and would otherwise wipe the form mid-edit.
  useEffect(() => {
    if (!open) return;
    const defaultAccounts = useStore.getState().accounts;
    if (editingTransaction) {
      setType(editingTransaction.type);
      setAmount(editingTransaction.amount);
      setAccountId(editingTransaction.accountId);
      setToAccountId(editingTransaction.toAccountId ?? '');
      setCategoryId(editingTransaction.categoryId);
      setDate(editingTransaction.date);
      setNote(editingTransaction.note);
      setIsExcludedFromStats(editingTransaction.isExcludedFromStats);
      setIsExcludedFromBudget(editingTransaction.isExcludedFromBudget);
    } else {
      setType(defaultType);
      setAmount(0);
      setAccountId(defaultAccounts[0]?.id ?? '');
      setToAccountId(defaultAccounts[1]?.id ?? '');
      setCategoryId(null);
      setDate(Date.now());
      setNote('');
      setIsExcludedFromStats(false);
      setIsExcludedFromBudget(false);
    }
    setStep('main');
    setShowOptions(false);
    setParentCategory(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingTransaction, defaultType]);

  const handleSave = useCallback(() => {
    if (amount <= 0) {
      toast.error('Please enter an amount');
      return;
    }
    if (!accountId) {
      toast.error('Please select an account');
      return;
    }
    if (type === 'transfer' && !toAccountId) {
      toast.error('Please select a destination account');
      return;
    }
    if (type === 'transfer' && accountId === toAccountId) {
      toast.error('Source and destination must be different');
      return;
    }
    if (type !== 'transfer' && !categoryId) {
      toast.error('Please select a category');
      return;
    }

    const txData = {
      type,
      amount,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      categoryId: type === 'transfer' ? null : categoryId,
      date,
      note,
      receiptUrl: null,
      isExcludedFromStats,
      isExcludedFromBudget: type === 'transfer' ? true : isExcludedFromBudget,
    };

    if (editingTransaction) {
      updateTransaction(editingTransaction.id, txData);
      toast.success('Transaction updated');
    } else {
      addTransaction(txData);
      toast.success(
        type === 'expense' ? 'Expense added' : type === 'income' ? 'Income added' : 'Transfer completed'
      );
    }
    onOpenChange(false);
  }, [
    amount, accountId, toAccountId, type, categoryId, date, note,
    isExcludedFromStats, isExcludedFromBudget,
    editingTransaction, addTransaction, updateTransaction, onOpenChange,
  ]);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const selectedToAccount = accounts.find((a) => a.id === toAccountId);
  const selectedCategory = categories.find((c) => c.id === categoryId);
  const filteredCategories = categories.filter((c) => c.type === type && !c.isHidden && !c.parentId);

  const renderStep = () => {
    if (step === 'category') {
      const subs = parentCategory
        ? categories.filter((c) => c.parentId === parentCategory.id && !c.isHidden)
        : [];
      const list = parentCategory ? subs : filteredCategories;

      return (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-1 pb-4">
            <button
              onClick={() => {
                if (parentCategory) setParentCategory(null);
                else setStep('main');
              }}
              className="p-2 -ml-2 rounded-xl hover:bg-muted"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold">
              {parentCategory ? parentCategory.name : 'Select Category'}
            </h2>
          </div>
          <div className="grid grid-cols-4 gap-2 overflow-y-auto no-scrollbar pb-4">
            {list.map((cat) => {
              const hasChildren =
                !parentCategory && categories.some((c) => c.parentId === cat.id && !c.isHidden);
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    if (hasChildren) {
                      setParentCategory(cat);
                    } else {
                      setCategoryId(cat.id);
                      setParentCategory(null);
                      setStep('main');
                    }
                  }}
                  className={cn(
                    'flex flex-col items-center gap-2 p-3 rounded-2xl transition-all',
                    categoryId === cat.id ? 'bg-primary/10 ring-2 ring-primary' : 'hover:bg-muted'
                  )}
                >
                  <div
                    className="h-12 w-12 rounded-2xl flex items-center justify-center"
                    style={{ backgroundColor: `${cat.color}20` }}
                  >
                    <span style={{ color: cat.color }}>
                      <CategoryIcon name={cat.icon} size={22} />
                    </span>
                  </div>
                  <span className="text-xs font-medium text-center leading-tight">{cat.name}</span>
                  {hasChildren && (
                    <span className="text-[9px] text-muted-foreground">More ›</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (step === 'account' || step === 'toAccount') {
      const isTo = step === 'toAccount';
      return (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-1 pb-4">
            <button onClick={() => setStep('main')} className="p-2 -ml-2 rounded-xl hover:bg-muted">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold">{isTo ? 'To Account' : 'Select Account'}</h2>
          </div>
          <div className="flex flex-col gap-2 overflow-y-auto no-scrollbar pb-4">
            {accounts.map((acc) => {
              const isActive = isTo ? toAccountId === acc.id : accountId === acc.id;
              return (
                <button
                  key={acc.id}
                  onClick={() => {
                    if (isTo) setToAccountId(acc.id);
                    else setAccountId(acc.id);
                    setStep('main');
                  }}
                  className={cn(
                    'flex items-center gap-3 p-4 rounded-2xl transition-all',
                    isActive ? 'bg-primary/10 ring-2 ring-primary' : 'hover:bg-muted'
                  )}
                >
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${acc.color}20` }}
                  >
                    <span style={{ color: acc.color }}>
                      <CategoryIcon name={acc.icon} size={20} />
                    </span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-sm">{acc.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{acc.type}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    {preferences.currencySymbol}
                    {acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (step === 'date') {
      return (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-1 pb-4">
            <button onClick={() => setStep('main')} className="p-2 -ml-2 rounded-xl hover:bg-muted">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold">Select Date</h2>
          </div>
          <div className="flex flex-col gap-3 pb-4">
            <input
              type="date"
              value={new Date(date).toISOString().split('T')[0]}
              onChange={(e) => {
                const [y, m, d] = e.target.value.split('-').map(Number);
                const newDate = new Date(y, m - 1, d);
                newDate.setHours(new Date(date).getHours(), new Date(date).getMinutes());
                setDate(newDate.getTime());
              }}
              className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-base"
            />
            <input
              type="time"
              value={new Date(date).toTimeString().slice(0, 5)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number);
                const newDate = new Date(date);
                newDate.setHours(h, m);
                setDate(newDate.getTime());
              }}
              className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-base"
            />
            <div className="flex gap-2">
              {['Today', 'Yesterday', '2 days ago'].map((label, i) => (
                <Button
                  key={label}
                  variant="outline"
                  size="sm"
                  className="rounded-full flex-1"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    d.setHours(new Date().getHours(), new Date().getMinutes());
                    setDate(d.getTime());
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (step === 'note') {
      return (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-1 pb-4">
            <button onClick={() => setStep('main')} className="p-2 -ml-2 rounded-xl hover:bg-muted">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold">Add Note</h2>
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was this transaction for?"
            className="flex-1 min-h-[120px] rounded-2xl text-base resize-none"
            autoFocus
          />
          <Button onClick={() => setStep('main')} className="mt-3 rounded-2xl">
            Done
          </Button>
        </div>
      );
    }

    // ---- Main step ----
    return (
      <div className="flex flex-col h-full overflow-y-auto no-scrollbar">
        <div className="flex gap-2 p-1 bg-muted rounded-2xl">
          {(['expense', 'income', 'transfer'] as TransactionType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                'flex-1 py-2.5 rounded-xl text-sm font-semibold capitalize transition-all',
                type === t
                  ? t === 'expense'
                    ? 'bg-expense text-white shadow-sm'
                    : t === 'income'
                    ? 'bg-income text-white shadow-sm'
                    : 'bg-transfer text-white shadow-sm'
                  : 'text-muted-foreground'
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <CalculatorNumpad
            initialAmount={amount}
            symbol={preferences.currencySymbol}
            onChange={setAmount}
          />
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {type === 'transfer' ? (
            <>
              <FieldButton
                icon={
                  <span style={{ color: selectedAccount?.color }}>
                    <CategoryIcon name={selectedAccount?.icon ?? 'Wallet'} size={20} />
                  </span>
                }
                label="From"
                value={selectedAccount?.name ?? 'Select'}
                onClick={() => setStep('account')}
              />
              <div className="flex items-center justify-center -my-1">
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                  <ArrowRight className="h-3 w-3" />
                </div>
              </div>
              <FieldButton
                icon={
                  <span style={{ color: selectedToAccount?.color }}>
                    <CategoryIcon name={selectedToAccount?.icon ?? 'Wallet'} size={20} />
                  </span>
                }
                label="To"
                value={selectedToAccount?.name ?? 'Select'}
                onClick={() => setStep('toAccount')}
              />
            </>
          ) : (
            <>
              <FieldButton
                icon={
                  selectedCategory ? (
                    <span style={{ color: selectedCategory.color }}>
                      <CategoryIcon name={selectedCategory.icon} size={20} />
                    </span>
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-dashed border-muted-foreground" />
                  )
                }
                label="Category"
                value={selectedCategory?.name ?? 'Select'}
                onClick={() => {
                  setParentCategory(null);
                  setStep('category');
                }}
              />
              <FieldButton
                icon={
                  <span style={{ color: selectedAccount?.color }}>
                    <CategoryIcon name={selectedAccount?.icon ?? 'Wallet'} size={20} />
                  </span>
                }
                label="Account"
                value={selectedAccount?.name ?? 'Select'}
                onClick={() => setStep('account')}
              />
            </>
          )}

          <FieldButton
            icon={<CalendarIcon className="h-5 w-5 text-muted-foreground" />}
            label="Date"
            value={formatDateLong(date)}
            onClick={() => setStep('date')}
          />

          <FieldButton
            icon={<FileText className="h-5 w-5 text-muted-foreground" />}
            label="Note"
            value={note || 'Add a note'}
            onClick={() => setStep('note')}
            valueClass={note ? 'text-foreground' : 'text-muted-foreground'}
          />
        </div>

        {type !== 'transfer' && (
          <button
            onClick={() => setShowOptions(!showOptions)}
            className="flex items-center gap-2 mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings2 className="h-4 w-4" />
            More options
          </button>
        )}

        <AnimatePresence>
          {showOptions && type !== 'transfer' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-3 pt-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ex-stats" className="text-sm">Exclude from stats</Label>
                  <Switch
                    id="ex-stats"
                    checked={isExcludedFromStats}
                    onCheckedChange={setIsExcludedFromStats}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="ex-budget" className="text-sm">Exclude from budget</Label>
                  <Switch
                    id="ex-budget"
                    checked={isExcludedFromBudget}
                    onCheckedChange={setIsExcludedFromBudget}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh] rounded-t-[2rem]">
        <div className="mx-auto w-full max-w-md px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-xl font-bold">
              {editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
            </h1>
            <Button onClick={handleSave} size="sm" className="rounded-full h-9 px-4 gap-1">
              <Check className="h-4 w-4" />
              Save
            </Button>
          </div>

          <div className="overflow-y-auto no-scrollbar" style={{ maxHeight: 'calc(92vh - 60px)' }}>
            {renderStep()}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function FieldButton({
  icon,
  label,
  value,
  onClick,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onClick: () => void;
  valueClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3.5 rounded-2xl bg-muted/40 hover:bg-muted transition-colors text-left"
    >
      <div className="h-10 w-10 rounded-xl bg-card flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-sm font-medium truncate', valueClass)}>{value}</p>
      </div>
      <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground shrink-0" />
    </button>
  );
}