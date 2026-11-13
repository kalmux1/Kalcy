'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import {
  Plus,
  Trash2,
  HandCoins,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  Check,
  CheckCircle2,
} from 'lucide-react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStore } from '@/lib/store';
import { useBackButton } from '@/lib/back-button';
import type { Account, Loan, LoanType, LoanPayment } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currencies';
import { toDateInputValue } from '@/lib/finance';
import { OpenEyeIcon, ClosedEyeIcon } from '@/components/ui/icons';
import { toast } from 'sonner';

const formatLedgerDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

function parseDateInput(value: string): number | null {
  if (!value) return null;
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return null;
  }
  const [y, m, d] = parts;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date.getTime();
}

type GroupedLoans = {
  personName: string;
  type: LoanType;
  activeLoans: Loan[];
  settledLoans: Loan[];
  totalPrincipal: number;
  totalRemaining: number;
  totalPaid: number;
};

export function LendingView() {
  const {
    loans,
    loanPayments,
    accounts,
    preferences,
    addLoan,
    updateLoan,
    deleteLoan,
    addLoanPayment,
    deleteLoanPayment,
    hideBalances,
    toggleHideBalances,
  } = useStore(
    useShallow((s) => ({
      loans: s.loans,
      loanPayments: s.loanPayments,
      accounts: s.accounts,
      preferences: s.preferences,
      addLoan: s.addLoan,
      updateLoan: s.updateLoan,
      deleteLoan: s.deleteLoan,
      addLoanPayment: s.addLoanPayment,
      deleteLoanPayment: s.deleteLoanPayment,
      hideBalances: s.hideBalances,
      toggleHideBalances: s.toggleHideBalances,
    }))
  );

  const [isAdding, setIsAdding] = useState(false);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [detailGroupKey, setDetailGroupKey] = useState<string | null>(null);
  const [autoAddPaymentLoanId, setAutoAddPaymentLoanId] = useState<string | null>(null);

  const [loanToDelete, setLoanToDelete] = useState<Loan | null>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<LoanPayment | null>(null);

  useBackButton(() => {
    if (isAdding || editing) {
      setIsAdding(false);
      setEditing(null);
      return true;
    }
    if (detailGroupKey) {
      setDetailGroupKey(null);
      return true;
    }
    if (loanToDelete) {
      setLoanToDelete(null);
      return true;
    }
    if (paymentToDelete) {
      setPaymentToDelete(null);
      return true;
    }
    return false;
  }, isAdding || editing !== null || detailGroupKey !== null || loanToDelete !== null || paymentToDelete !== null);

  const groupedLoans = useMemo(() => {
    const map = new Map<string, GroupedLoans>();
    
    loans.forEach((loan) => {
      const key = `${loan.personName.trim().toLowerCase()}_${loan.type}`;
      
      if (!map.has(key)) {
        map.set(key, {
          personName: loan.personName,
          type: loan.type,
          activeLoans: [],
          settledLoans: [],
          totalPrincipal: 0,
          totalRemaining: 0,
          totalPaid: 0,
        });
      }
      
      const group = map.get(key)!;
      const isSettled = loan.isSettled || loan.remainingAmount <= 0;
      
      if (isSettled) {
        group.settledLoans.push(loan);
      } else {
        group.activeLoans.push(loan);
        group.totalPrincipal += loan.principalAmount;
        group.totalRemaining += loan.remainingAmount;
        group.totalPaid += (loan.principalAmount - loan.remainingAmount);
      }
    });
    
    return Array.from(map.values());
  }, [loans]);

  const activeGroups = groupedLoans.filter((g) => g.activeLoans.length > 0);
  const settledGroups = groupedLoans.filter((g) => g.activeLoans.length === 0);

  const summary = useMemo(() => {
    let totalLent = 0;
    let totalBorrowed = 0;
    let activeCount = 0;
    
    loans.forEach((loan) => {
      if (loan.isSettled || loan.remainingAmount <= 0) return;
      activeCount++;
      if (loan.type === 'lent') totalLent += loan.remainingAmount;
      else totalBorrowed += loan.remainingAmount;
    });
    
    return {
      totalLent,
      totalBorrowed,
      netReceivable: totalLent - totalBorrowed,
      activeCount,
    };
  }, [loans]);

  const handleDeleteLoan = async () => {
    if (!loanToDelete) return;
    try {
      await deleteLoan(loanToDelete.id);
      if (detailGroupKey === `${loanToDelete.personName.trim().toLowerCase()}_${loanToDelete.type}`) {
        const remainingLoans = loans.filter(
          l => l.id !== loanToDelete.id && 
          l.personName.trim().toLowerCase() === loanToDelete.personName.trim().toLowerCase() && 
          l.type === loanToDelete.type
        );
        if (remainingLoans.length === 0) setDetailGroupKey(null);
      }
      toast.success('Loan deleted');
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete loan');
      throw err;
    }
  };

  const handleDeletePayment = async () => {
    if (!paymentToDelete) return;
    try {
      await deleteLoanPayment(paymentToDelete.id);
      toast.success('Payment removed');
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to remove payment');
      throw err;
    }
  };

  const handleRecordPayment = (loanId: string, groupKey: string) => {
    setDetailGroupKey(groupKey);
    setAutoAddPaymentLoanId(loanId);
  };

  // ✅ FIX: Added `?? null` to convert `undefined` to `null`
  const activeGroup = detailGroupKey 
    ? groupedLoans.find(g => `${g.personName.trim().toLowerCase()}_${g.type}` === detailGroupKey) ?? null 
    : null;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-5 md:p-8 shadow-lg shadow-primary/20">
        <button
          type="button"
          onClick={toggleHideBalances}
          className="absolute right-4 top-4 md:right-6 md:top-6 p-2 rounded-full hover:bg-white/10 transition-all active:scale-95 z-10 outline-none focus:outline-none"
          aria-label={hideBalances ? 'Show balances' : 'Hide balances'}
        >
          {hideBalances ? (
            <ClosedEyeIcon className="h-6 w-6 md:h-8 md:w-8 text-white/80 hover:text-white transition-colors" />
          ) : (
            <OpenEyeIcon className="h-6 w-6 md:h-8 md:w-8 text-white hover:text-primary-foreground transition-colors" />
          )}
        </button>

        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <HandCoins className="h-5 w-5" />
            <span className="text-sm font-medium opacity-90">
              Lending Overview
            </span>
          </div>
          <p className="text-3xl md:text-5xl font-bold tabular-nums">
            {hideBalances ? (
              `${preferences.currencySymbol}••••••`
            ) : (
              <>
                {summary.netReceivable >= 0 ? '+' : ''}
                {formatCurrency(summary.netReceivable, preferences.currencySymbol)}
              </>
            )}
          </p>
          <p className="text-xs md:text-sm opacity-75 mt-1">Net position</p>

          <div className="grid grid-cols-2 gap-4 mt-4 md:mt-6 md:max-w-md">
            <div className="rounded-2xl bg-white/15 p-3 md:p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowDownLeft className="h-3.5 w-3.5" />
                <span className="text-xs opacity-90">Owed to you</span>
              </div>
              <p className="text-base md:text-xl font-bold tabular-nums">
                {hideBalances
                  ? `${preferences.currencySymbol}••••••`
                  : formatCurrency(summary.totalLent, preferences.currencySymbol)}
              </p>
            </div>
            <div className="rounded-2xl bg-white/15 p-3 md:p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowUpRight className="h-3.5 w-3.5" />
                <span className="text-xs opacity-90">You owe</span>
              </div>
              <p className="text-base md:text-xl font-bold tabular-nums">
                {hideBalances
                  ? `${preferences.currencySymbol}••••••`
                  : formatCurrency(summary.totalBorrowed, preferences.currencySymbol)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="rounded-2xl border-dashed w-full sm:w-auto gap-2"
        onClick={() => setIsAdding(true)}
        disabled={accounts.length === 0}
      >
        <Plus className="h-4 w-4" /> Add Loan
      </Button>

      {activeGroups.length === 0 && settledGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <HandCoins className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground max-w-[240px]">
            No loans yet. Track money you lend or borrow from friends and family.
          </p>
        </div>
      ) : (
        <>
          {activeGroups.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase px-1">
                Active ({activeGroups.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {activeGroups.map((group, i) => {
                  const groupKey = `${group.personName.trim().toLowerCase()}_${group.type}`;
                  return (
                    <GroupedLoanCard
                      key={groupKey}
                      group={group}
                      currencySymbol={preferences.currencySymbol}
                      hideBalances={hideBalances}
                      onClick={() => {
                        setDetailGroupKey(groupKey);
                        setAutoAddPaymentLoanId(null);
                      }}
                      onRecordPayment={() => handleRecordPayment(group.activeLoans[0].id, groupKey)}
                      delay={i * 0.04}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {settledGroups.length > 0 && (
            <div className="flex flex-col gap-3 mt-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase px-1">
                Settled ({settledGroups.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {settledGroups.map((group) => {
                  const groupKey = `${group.personName.trim().toLowerCase()}_${group.type}`;
                  return (
                    <GroupedLoanCard
                      key={groupKey}
                      group={group}
                      currencySymbol={preferences.currencySymbol}
                      hideBalances={hideBalances}
                      onClick={() => {
                        setDetailGroupKey(groupKey);
                        setAutoAddPaymentLoanId(null);
                      }}
                      onRecordPayment={() => {}}
                      delay={0}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <LoanSheet
        open={isAdding || editing !== null}
        loan={editing}
        onOpenChange={(open) => {
          if (!open) {
            setIsAdding(false);
            setEditing(null);
          }
        }}
        onSave={async (data, id) => {
          try {
            if (id) {
              await updateLoan(id, data);
              toast.success('Loan updated');
            } else {
              await addLoan(data);
              toast.success('Loan added');
            }
            setIsAdding(false);
            setEditing(null);
          } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'Failed to save loan');
          }
        }}
      />

      <PersonDetailSheet
        key={detailGroupKey ? `${detailGroupKey}-${autoAddPaymentLoanId}` : 'closed'}
        group={activeGroup}
        initialAddingLoanId={autoAddPaymentLoanId}
        payments={loanPayments}
        hideBalances={hideBalances}
        onOpenChange={(open) => {
          if (!open) {
            setDetailGroupKey(null);
            setAutoAddPaymentLoanId(null);
          }
        }}
        onAddPayment={async (data) => {
          try {
            await addLoanPayment(data);
            toast.success('Payment recorded');
          } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'Failed to record payment');
          }
        }}
        onEditLoan={(loan) => {
          setDetailGroupKey(null);
          setEditing(loan);
        }}
        onDeleteLoan={(loan) => setLoanToDelete(loan)}
        onDeletePayment={(payment) => setPaymentToDelete(payment)}
      />

      <ConfirmDialog
        open={loanToDelete !== null}
        onOpenChange={(open) => !open && setLoanToDelete(null)}
        title="Delete Loan"
        description={`Are you sure you want to delete the loan with ${loanToDelete?.personName}? All associated payments and transactions will be permanently removed.`}
        confirmText="Delete Loan"
        onConfirm={handleDeleteLoan}
      />

      <ConfirmDialog
        open={paymentToDelete !== null}
        onOpenChange={(open) => !open && setPaymentToDelete(null)}
        title="Remove Payment"
        description="Are you sure you want to remove this payment? The loan balance will be adjusted back and the transaction will be deleted."
        confirmText="Remove Payment"
        onConfirm={handleDeletePayment}
      />
    </div>
  );
}

function GroupedLoanCard({
  group,
  currencySymbol,
  hideBalances,
  onClick,
  onRecordPayment,
  delay,
}: {
  group: GroupedLoans;
  currencySymbol: string;
  hideBalances: boolean;
  onClick: () => void;
  onRecordPayment: () => void;
  delay: number;
}) {
  const isLent = group.type === 'lent';
  const isSettled = group.activeLoans.length === 0;
  const progress = group.totalPrincipal > 0 ? (group.totalPaid / group.totalPrincipal) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={cn(
        'bg-card rounded-2xl border border-border/40 p-4 md:p-5 flex flex-col justify-between',
        isSettled && 'opacity-70'
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left"
        aria-label={`Open loan details for ${group.personName}`}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'h-10 w-10 md:h-12 md:w-12 rounded-xl flex items-center justify-center shrink-0',
              isLent ? 'bg-income/10' : 'bg-expense/10'
            )}
          >
            {isLent ? (
              <ArrowDownLeft className="h-5 w-5 text-income" />
            ) : (
              <ArrowUpRight className="h-5 w-5 text-expense" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm truncate">
                {group.personName}
              </span>
              {isSettled && (
                <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-income/15 text-income font-medium">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Settled
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isLent ? 'They owe you' : 'You owe them'} · {group.activeLoans.length + group.settledLoans.length} loan(s)
            </p>
            <p
              className={cn(
                'text-base font-bold tabular-nums mt-1',
                isLent ? 'text-income' : 'text-expense'
              )}
            >
              {hideBalances
                ? `${currencySymbol}••••••`
                : formatCurrency(group.totalRemaining, currencySymbol)}
              <span className="text-xs text-muted-foreground font-normal">
                {' '}
                / {hideBalances ? `${currencySymbol}••••••` : formatCurrency(group.totalPrincipal, currencySymbol)}
              </span>
            </p>
          </div>
        </div>

        <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              isLent ? 'bg-income' : 'bg-expense'
            )}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </button>

      <div className="flex flex-col gap-2 mt-4 pt-3 border-t border-border/40">
        {!isSettled && (
          <Button
            type="button"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onRecordPayment();
            }}
            className="w-full rounded-xl h-8 text-xs font-semibold bg-primary/5 text-primary border-primary/20 hover:bg-primary/10 gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Record Payment
          </Button>
        )}
        <div className="flex gap-1 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="rounded-lg h-8 px-2 text-muted-foreground"
          >
            View History
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

type LoanFormData = Omit<
  Loan,
  'id' | 'createdAt' | 'isSettled' | 'remainingAmount'
>;

function LoanSheet({
  open,
  loan,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  loan: Loan | null;
  onOpenChange: (open: boolean) => void;
  onSave: (data: LoanFormData, id?: string) => void | Promise<void>;
}) {
  const accounts = useStore((s) => s.accounts);
  const preferences = useStore((s) => s.preferences);
  const formKey = open ? loan?.id ?? 'new' : 'closed';

  return (
    <Drawer 
      open={open} 
      onOpenChange={onOpenChange} 
      repositionInputs={false}
      shouldScaleBackground={false}
    >
      <DrawerContent className="rounded-t-[2rem] md:rounded-[2rem] flex flex-col max-h-[90dvh] overflow-hidden">
        <div className="shrink-0 px-4 pt-2 pb-3 md:pt-6 border-b border-border/40">
          <h2 className="text-xl font-bold">
            {loan ? 'Edit Loan' : 'New Loan'}
          </h2>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 scroll-pt-4 pb-6">
          <LoanForm
            key={formKey}
            initial={loan}
            currencySymbol={preferences.currencySymbol}
            accounts={accounts}
            onSubmit={(data) => onSave(data, loan?.id)}
          />
        </div>

        <div className="shrink-0 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] md:pb-4 bg-background border-t border-border/40 flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 rounded-xl h-11"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
          <Button
            type="submit"
            form="loan-form"
            className="flex-1 rounded-xl h-11"
          >
            <Check className="h-4 w-4 mr-1" /> Save
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function LoanForm({
  initial,
  currencySymbol,
  accounts,
  onSubmit,
}: {
  initial: Loan | null;
  currencySymbol: string;
  accounts: Account[];
  onSubmit: (data: LoanFormData) => void;
}) {
  const [type, setType] = useState<LoanType>(initial?.type ?? 'lent');
  const [personName, setPersonName] = useState(initial?.personName ?? '');
  const [amount, setAmount] = useState(
    initial ? String(initial.principalAmount) : ''
  );
  const [accountId, setAccountId] = useState(
    initial?.accountId ?? accounts[0]?.id ?? ''
  );
  const [date, setDate] = useState(
    initial ? toDateInputValue(initial.date) : toDateInputValue(Date.now())
  );
  const [dueDate, setDueDate] = useState(
    initial?.dueDate ? toDateInputValue(initial.dueDate) : ''
  );
  const [note, setNote] = useState(initial?.note ?? '');

  const handleSubmit = () => {
    if (!personName.trim()) {
      toast.error('Please enter a name');
      return;
    }
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!accountId) {
      toast.error('Please select an account');
      return;
    }

    const ts = parseDateInput(date);
    if (ts === null) {
      toast.error('Enter a valid loan date');
      return;
    }

    let dueTs: number | null = null;
    if (dueDate) {
      dueTs = parseDateInput(dueDate);
      if (dueTs === null) {
        toast.error('Enter a valid due date');
        return;
      }
    }

    onSubmit({
      personName: personName.trim(),
      type,
      principalAmount: amt,
      accountId,
      date: ts,
      dueDate: dueTs,
      note: note.trim(),
    });
  };

  return (
    <form
      id="loan-form"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex gap-2 p-1 bg-muted rounded-2xl max-w-sm">
        {(['lent', 'borrowed'] as LoanType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-sm font-semibold capitalize transition-all touch-manipulation',
              type === t
                ? t === 'lent'
                  ? 'bg-income text-white shadow-sm'
                  : 'bg-expense text-white shadow-sm'
                : 'text-muted-foreground'
            )}
          >
            {t === 'lent' ? 'I lent' : 'I borrowed'}
          </button>
        ))}
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">
          {type === 'lent'
            ? 'Who did you lend to?'
            : 'Who did you borrow from?'}
        </Label>
        <Input
          value={personName}
          onChange={(e) => setPersonName(e.target.value)}
          placeholder="e.g. Alice"
          className="mt-1 rounded-xl"
        />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Amount</Label>
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

      <div>
        <Label className="text-xs text-muted-foreground">
          {type === 'lent' ? 'From account' : 'To account'}
        </Label>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="mt-1 rounded-xl h-11 bg-background">
            <SelectValue placeholder="Select account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.length === 0 && (
              <SelectItem value="none" disabled>
                No accounts
              </SelectItem>
            )}
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-sm">
        <div>
          <Label className="text-xs text-muted-foreground">Date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 rounded-xl"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Due (optional)</Label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 rounded-xl"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Note</Label>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note"
          className="mt-1 rounded-xl"
        />
      </div>
    </form>
  );
}

function PersonDetailSheet({
  group,
  initialAddingLoanId,
  payments,
  hideBalances,
  onOpenChange,
  onAddPayment,
  onEditLoan,
  onDeleteLoan,
  onDeletePayment,
}: {
  group: GroupedLoans | null;
  initialAddingLoanId: string | null;
  payments: LoanPayment[];
  hideBalances: boolean;
  onOpenChange: (open: boolean) => void;
  onAddPayment: (data: {
    loanId: string;
    amount: number;
    accountId: string;
    date: number;
    note: string;
  }) => void | Promise<void>;
  onEditLoan: (loan: Loan) => void;
  onDeleteLoan: (loan: Loan) => void;
  onDeletePayment: (payment: LoanPayment) => void;
}) {
  const accounts = useStore((s) => s.accounts);
  const preferences = useStore((s) => s.preferences);
  const open = group !== null;

  const [payingLoanId, setPayingLoanId] = useState<string | null>(initialAddingLoanId);
  const [payAmount, setPayAmount] = useState('');
  const [payAccountId, setPayAccountId] = useState('');
  const [payDate, setPayDate] = useState(toDateInputValue(Date.now()));
  const [payNote, setPayNote] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const activeLoanToPay = group?.activeLoans.find(l => l.id === payingLoanId);

  const resetPaymentForm = () => {
    setPayAmount('');
    setPayAccountId('');
    setPayDate(toDateInputValue(Date.now()));
    setPayNote('');
    setPayingLoanId(null);
  };

  const submitPayment = async () => {
    if (!activeLoanToPay || submittingPayment) return;
    const amt = parseFloat(payAmount) || 0;
    if (amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (amt > activeLoanToPay.remainingAmount) {
      toast.error('Payment exceeds remaining amount');
      return;
    }
    if (!payAccountId) {
      toast.error('Please select an account');
      return;
    }

    const sd = parseDateInput(payDate);
    if (sd === null) {
      toast.error('Enter a valid payment date');
      return;
    }

    try {
      setSubmittingPayment(true);
      await onAddPayment({
        loanId: activeLoanToPay.id,
        amount: amt,
        accountId: payAccountId,
        date: sd,
        note: payNote.trim(),
      });
      resetPaymentForm();
    } finally {
      setSubmittingPayment(false);
    }
  };

  const ledgerEntries = useMemo(() => {
    if (!group) return [];
    
    const entries: {
      id: string;
      type: 'loan' | 'payment';
      date: number;
      amount: number;
      note: string;
      accountId: string;
      loanId: string;
      paymentId?: string;
    }[] = [];

    group.activeLoans.forEach((l) => {
      entries.push({
        id: `loan_${l.id}`,
        type: 'loan',
        date: l.date,
        amount: l.principalAmount,
        note: l.note || (group.type === 'lent' ? 'Money lent' : 'Money borrowed'),
        accountId: l.accountId,
        loanId: l.id,
      });
    });
    group.settledLoans.forEach((l) => {
      entries.push({
        id: `loan_${l.id}`,
        type: 'loan',
        date: l.date,
        amount: l.principalAmount,
        note: l.note || (group.type === 'lent' ? 'Money lent' : 'Money borrowed'),
        accountId: l.accountId,
        loanId: l.id,
      });
    });

    const groupPayments = payments.filter((p) =>
      group.activeLoans.some((l) => l.id === p.loanId) ||
      group.settledLoans.some((l) => l.id === p.loanId)
    );

    groupPayments.forEach((p) => {
      entries.push({
        id: `payment_${p.id}`,
        type: 'payment',
        date: p.date,
        amount: p.amount,
        note: p.note || (group.type === 'lent' ? 'Repayment received' : 'Repayment made'),
        accountId: p.accountId,
        loanId: p.loanId,
        paymentId: p.id,
      });
    });

    return entries.sort((a, b) => b.date - a.date);
  }, [group, payments]);

  if (!group) return null;

  const isLent = group.type === 'lent';
  const progress = group.totalPrincipal > 0 ? (group.totalPaid / group.totalPrincipal) * 100 : 0;

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) resetPaymentForm();
        onOpenChange(o);
      }}
      repositionInputs={false}
      shouldScaleBackground={false}
    >
      <DrawerContent className="rounded-t-[2rem] md:rounded-[2rem] flex flex-col max-h-[90dvh] overflow-hidden">
        <div className="shrink-0 px-4 pt-2 pb-3 md:pt-6">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'h-10 w-10 rounded-2xl flex items-center justify-center',
                isLent ? 'bg-income/10' : 'bg-expense/10'
              )}
            >
              {isLent ? (
                <ArrowDownLeft className="h-5 w-5 text-income" />
              ) : (
                <ArrowUpRight className="h-5 w-5 text-expense" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold truncate">
                {group.personName}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isLent ? 'They owe you' : 'You owe them'} · {group.activeLoans.length + group.settledLoans.length} loan(s)
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 scroll-pt-4 pb-12">
          <div className="rounded-2xl bg-muted/40 p-4 mb-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">
                Total Outstanding
              </span>
              <span
                className={cn(
                  'text-2xl font-bold tabular-nums',
                  group.totalRemaining > 0
                    ? isLent
                      ? 'text-income'
                      : 'text-expense'
                    : 'text-muted-foreground'
                )}
              >
                {hideBalances
                  ? `${preferences.currencySymbol}••••••`
                  : formatCurrency(
                      group.totalRemaining,
                      preferences.currencySymbol
                    )}
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xs text-muted-foreground">
                Total Principal
              </span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {hideBalances
                  ? `${preferences.currencySymbol}••••••`
                  : formatCurrency(
                      group.totalPrincipal,
                      preferences.currencySymbol
                    )}
              </span>
            </div>

            <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  isLent ? 'bg-income' : 'bg-expense'
                )}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
              <span>
                {progress.toFixed(0)}% repaid ·{' '}
                {hideBalances
                  ? `${preferences.currencySymbol}••••••`
                  : formatCurrency(group.totalPaid, preferences.currencySymbol)}{' '}
                of{' '}
                {hideBalances
                  ? `${preferences.currencySymbol}••••••`
                  : formatCurrency(
                      group.totalPrincipal,
                      preferences.currencySymbol
                    )}
              </span>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase px-1 mb-2">
              Active Loans ({group.activeLoans.length})
            </h3>
            {group.activeLoans.length === 0 ? (
              <p className="text-sm text-muted-foreground px-1">No active loans.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {group.activeLoans.map((loan) => (
                  <div key={loan.id} className="rounded-2xl border border-border/40 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">
                          {formatCurrency(loan.principalAmount, preferences.currencySymbol)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(loan.date).toLocaleDateString()} {loan.dueDate && `· Due ${new Date(loan.dueDate).toLocaleDateString()}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={cn("text-sm font-bold", isLent ? 'text-income' : 'text-expense')}>
                          {formatCurrency(loan.remainingAmount, preferences.currencySymbol)} left
                        </p>
                        <div className="flex gap-1 justify-end mt-1">
                          <button onClick={() => onEditLoan(loan)} className="text-[10px] text-muted-foreground hover:text-primary">Edit</button>
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <button onClick={() => onDeleteLoan(loan)} className="text-[10px] text-destructive hover:underline">Delete</button>
                        </div>
                      </div>
                    </div>
                    
                    {payingLoanId !== loan.id ? (
                      <Button
                        type="button"
                        onClick={() => {
                          setPayingLoanId(loan.id);
                          setPayAccountId(loan.accountId);
                        }}
                        className="w-full mt-3 rounded-xl h-8 text-xs bg-primary/10 text-primary hover:bg-primary/20"
                      >
                        Record Payment
                      </Button>
                    ) : (
                      <div className="mt-3 flex flex-col gap-3 bg-muted/20 p-3 rounded-xl border border-border/40">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold">Record Payment</span>
                          <button type="button" onClick={resetPaymentForm} className="p-1 rounded-md hover:bg-muted text-muted-foreground">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Amount</Label>
                          <Input type="number" inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" className="h-8 text-sm rounded-lg mt-1" />
                          <div className="flex gap-1 mt-1.5">
                            {[0.25, 0.5, 1].map((f) => (
                              <button key={f} type="button" onClick={() => setPayAmount(String(Math.round(loan.remainingAmount * f * 100) / 100))} className="flex-1 text-[10px] py-1 rounded bg-muted hover:bg-muted/80 font-medium">
                                {f === 1 ? 'Full' : `${f * 100}%`}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Account</Label>
                          <Select value={payAccountId} onValueChange={setPayAccountId}>
                            <SelectTrigger className="h-8 text-sm rounded-lg mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Date</Label>
                            <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="h-8 text-sm rounded-lg mt-1" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Note</Label>
                            <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Optional" className="h-8 text-sm rounded-lg mt-1" />
                          </div>
                        </div>
                        <Button type="button" onClick={submitPayment} disabled={submittingPayment} className="w-full h-8 text-xs rounded-lg mt-1">
                          {submittingPayment ? 'Saving…' : 'Save Payment'}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {group.settledLoans.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase px-1 mb-2">
                Settled Loans ({group.settledLoans.length})
              </h3>
              <div className="flex flex-col gap-2">
                {group.settledLoans.map((loan) => (
                  <div key={loan.id} className="rounded-2xl border border-border/40 p-3 flex items-center justify-between opacity-70">
                    <div>
                      <p className="text-sm font-medium">{formatCurrency(loan.principalAmount, preferences.currencySymbol)}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(loan.date).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-income">Settled</p>
                      <div className="flex gap-1 justify-end mt-1">
                         <button onClick={() => onEditLoan(loan)} className="text-[10px] text-muted-foreground hover:text-primary">Edit</button>
                         <span className="text-[10px] text-muted-foreground">·</span>
                         <button onClick={() => onDeleteLoan(loan)} className="text-[10px] text-destructive hover:underline">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase px-1 mb-2">
              Consolidated History
            </h3>
            <div className="rounded-2xl border border-border/40 overflow-hidden">
              <div className="divide-y divide-border/40">
                {ledgerEntries.map((entry) => {
                  const acc = accounts.find((a) => a.id === entry.accountId);
                  return (
                    <div key={entry.id} className="px-4 py-3 flex items-start justify-between gap-3 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {entry.type === 'loan' 
                            ? (isLent ? 'Money lent' : 'Money borrowed')
                            : (isLent ? 'Repayment received' : 'Repayment made')}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {formatLedgerDate(entry.date)}
                          {acc && ` · ${acc.name}`}
                          {entry.note && ` · ${entry.note}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn(
                          'text-sm font-semibold tabular-nums',
                          entry.type === 'loan' 
                            ? (isLent ? 'text-expense' : 'text-income')
                            : (isLent ? 'text-income' : 'text-expense')
                        )}>
                          {entry.type === 'loan' 
                            ? (isLent ? '−' : '+') 
                            : (isLent ? '+' : '−')}
                          {formatCurrency(entry.amount, preferences.currencySymbol)}
                        </span>
                        {entry.type === 'payment' && entry.paymentId && (
                          <button
                            type="button"
                            onClick={() => {
                              const p = payments.find(x => x.id === entry.paymentId);
                              if (p) onDeletePayment(p);
                            }}
                            className="p-1 rounded-lg hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {ledgerEntries.length === 0 && (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No history recorded.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}