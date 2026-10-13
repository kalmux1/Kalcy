'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Pencil,
  Trash2,
  HandCoins,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  Check,
  Calendar as CalendarIcon,
  Wallet,
  CheckCircle2,
} from 'lucide-react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStore } from '@/lib/store';
import type { Loan, LoanType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currencies';
import { getLoansSummary, formatDateKey, toDateInputValue } from '@/lib/finance';
import { toast } from 'sonner';

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
  } = useStore();

  const [isAdding, setIsAdding] = useState(false);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [detail, setDetail] = useState<Loan | null>(null);

  const summary = useMemo(() => getLoansSummary(loans), [loans]);
  const activeLoans = loans.filter((l) => !l.isSettled);
  const settledLoans = loans.filter((l) => l.isSettled);

  const confirmDelete = (loan: Loan) => {
    toast(
      `Delete this loan with ${loan.personName}? All payments will be removed.`,
      {
        duration: 8000,
        action: {
          label: 'Delete',
          onClick: async () => {
            try {
              await deleteLoan(loan.id);
              toast.success('Loan deleted');
            } catch (err) {
              console.error(err);
              toast.error('Failed to delete loan');
            }
          },
        },
        cancel: { label: 'Cancel', onClick: () => {} },
      }
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-3xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-5 shadow-lg shadow-primary/20">
        <div className="flex items-center gap-2 mb-2">
          <HandCoins className="h-5 w-5" />
          <span className="text-sm font-medium opacity-90">
            Lending Overview
          </span>
        </div>
        <p className="text-3xl font-bold tabular-nums">
          {summary.netReceivable >= 0 ? '+' : ''}
          {formatCurrency(summary.netReceivable, preferences.currencySymbol)}
        </p>
        <p className="text-xs opacity-75 mt-1">Net position</p>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="rounded-2xl bg-white/15 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowDownLeft className="h-3.5 w-3.5" />
              <span className="text-xs opacity-90">Owed to you</span>
            </div>
            <p className="text-base font-bold tabular-nums">
              {formatCurrency(summary.totalLent, preferences.currencySymbol)}
            </p>
          </div>
          <div className="rounded-2xl bg-white/15 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowUpRight className="h-3.5 w-3.5" />
              <span className="text-xs opacity-90">You owe</span>
            </div>
            <p className="text-base font-bold tabular-nums">
              {formatCurrency(
                summary.totalBorrowed,
                preferences.currencySymbol
              )}
            </p>
          </div>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="rounded-2xl border-dashed"
        onClick={() => setIsAdding(true)}
        disabled={accounts.length === 0}
      >
        <Plus className="h-4 w-4 mr-2" /> Add Loan
      </Button>

      {activeLoans.length === 0 && settledLoans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <HandCoins className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground max-w-[240px]">
            No loans yet. Track money you lend or borrow from friends and
            family.
          </p>
        </div>
      ) : (
        <>
          {activeLoans.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase px-1">
                Active ({activeLoans.length})
              </h3>
              {activeLoans.map((loan, i) => (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  currencySymbol={preferences.currencySymbol}
                  onClick={() => setDetail(loan)}
                  onEdit={() => setEditing(loan)}
                  onDelete={() => confirmDelete(loan)}
                  delay={i * 0.04}
                />
              ))}
            </div>
          )}

          {settledLoans.length > 0 && (
            <div className="flex flex-col gap-2 mt-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase px-1">
                Settled ({settledLoans.length})
              </h3>
              {settledLoans.map((loan) => (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  currencySymbol={preferences.currencySymbol}
                  onClick={() => setDetail(loan)}
                  onEdit={() => setEditing(loan)}
                  onDelete={() => confirmDelete(loan)}
                  delay={0}
                />
              ))}
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
            toast.error('Failed to save loan');
          }
        }}
      />

      <LoanDetailSheet
        loan={detail}
        payments={loanPayments}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        onAddPayment={async (data) => {
          try {
            await addLoanPayment(data);
            toast.success('Payment recorded');
          } catch (err) {
            console.error(err);
            toast.error('Failed to record payment');
          }
        }}
        onDeletePayment={async (id) => {
          try {
            await deleteLoanPayment(id);
            toast.success('Payment removed');
          } catch (err) {
            console.error(err);
            toast.error('Failed to remove payment');
          }
        }}
      />
    </div>
  );
}

function LoanCard({
  loan,
  currencySymbol,
  onClick,
  onEdit,
  onDelete,
  delay,
}: {
  loan: Loan;
  currencySymbol: string;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  delay: number;
}) {
  const paid = loan.principalAmount - loan.remainingAmount;
  const progress =
    loan.principalAmount > 0 ? (paid / loan.principalAmount) * 100 : 0;
  const isLent = loan.type === 'lent';
  const isSettled = loan.isSettled || loan.remainingAmount <= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={cn(
        'bg-card rounded-2xl border border-border/40 p-4',
        isSettled && 'opacity-70'
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left"
        aria-label={`Open loan details for ${loan.personName}`}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'h-11 w-11 rounded-2xl flex items-center justify-center shrink-0',
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
                {loan.personName}
              </span>
              {isSettled && (
                <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-income/15 text-income font-medium">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Settled
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isLent ? 'They owe you' : 'You owe them'} · since{' '}
              {new Date(loan.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </p>
            <p
              className={cn(
                'text-base font-bold tabular-nums mt-1',
                isLent ? 'text-income' : 'text-expense'
              )}
            >
              {formatCurrency(loan.remainingAmount, currencySymbol)}
              <span className="text-xs text-muted-foreground font-normal">
                {' '}
                / {formatCurrency(loan.principalAmount, currencySymbol)}
              </span>
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-2 rounded-xl hover:bg-muted transition-colors"
              aria-label="Edit loan"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-2 rounded-xl hover:bg-destructive/10 transition-colors"
              aria-label="Delete loan"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </button>
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
  const { accounts, preferences } = useStore();
  const formKey = open ? loan?.id ?? 'new' : 'closed';

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs>
      <DrawerContent className="rounded-t-[2rem] flex flex-col max-h-[90dvh] overflow-hidden">
        <div className="shrink-0 px-4 pt-2 pb-3">
          <h2 className="text-xl font-bold">
            {loan ? 'Edit Loan' : 'New Loan'}
          </h2>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 scroll-pt-4">
          <LoanForm
            key={formKey}
            initial={loan}
            currencySymbol={preferences.currencySymbol}
            accounts={accounts}
            onCancel={() => onOpenChange(false)}
            onSubmit={(data) => onSave(data, loan?.id)}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function LoanForm({
  initial,
  currencySymbol,
  accounts,
  onCancel,
  onSubmit,
}: {
  initial: Loan | null;
  currencySymbol: string;
  accounts: ReturnType<typeof useStore.getState>['accounts'];
  onCancel: () => void;
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
    const [y, m, d] = date.split('-').map(Number);
    const ts = new Date(y, m - 1, d).getTime();

    let dueTs: number | null = null;
    if (dueDate) {
      const [dy, dm, dd] = dueDate.split('-').map(Number);
      dueTs = new Date(dy, dm - 1, dd).getTime();
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
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 p-1 bg-muted rounded-2xl">
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
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="w-full mt-1 rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
        >
          {accounts.length === 0 && <option value="">No accounts</option>}
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
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
          <Label className="text-xs text-muted-foreground">
            Due (optional)
          </Label>
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

function LoanDetailSheet({
  loan,
  payments,
  onOpenChange,
  onAddPayment,
  onDeletePayment,
}: {
  loan: Loan | null;
  payments: ReturnType<typeof useStore.getState>['loanPayments'];
  onOpenChange: (open: boolean) => void;
  onAddPayment: (data: {
    loanId: string;
    amount: number;
    accountId: string;
    date: number;
    note: string;
  }) => void | Promise<void>;
  onDeletePayment: (id: string) => void | Promise<void>;
}) {
  const { accounts, preferences } = useStore();
  const [adding, setAdding] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payAccountId, setPayAccountId] = useState('');
  const [payDate, setPayDate] = useState(toDateInputValue(Date.now()));
  const [payNote, setPayNote] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const loanPayments = loan
    ? payments.filter((p) => p.loanId === loan.id)
    : [];
  const isLent = loan?.type === 'lent';
  const open = loan !== null;

  const resetPaymentForm = () => {
    setPayAmount('');
    setPayAccountId(loan?.accountId ?? accounts[0]?.id ?? '');
    setPayDate(toDateInputValue(Date.now()));
    setPayNote('');
    setAdding(false);
  };

  const submitPayment = async () => {
    if (!loan || submittingPayment) return;
    const amt = parseFloat(payAmount) || 0;
    if (amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (amt > loan.remainingAmount) {
      toast.error('Payment exceeds remaining amount');
      return;
    }
    if (!payAccountId) {
      toast.error('Please select an account');
      return;
    }
    const [y, m, d] = payDate.split('-').map(Number);
    try {
      setSubmittingPayment(true);
      await onAddPayment({
        loanId: loan.id,
        amount: amt,
        accountId: payAccountId,
        date: new Date(y, m - 1, d).getTime(),
        note: payNote.trim(),
      });
      resetPaymentForm();
    } finally {
      setSubmittingPayment(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) resetPaymentForm();
        onOpenChange(o);
      }}
      repositionInputs
    >
      <DrawerContent className="rounded-t-[2rem] flex flex-col max-h-[90dvh] overflow-hidden">
        {loan && (
          <>
            <div className="shrink-0 px-4 pt-2 pb-3">
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
                    {loan.personName}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {isLent ? 'They owe you' : 'You owe them'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 scroll-pt-4">
              <div className="rounded-2xl bg-muted/40 p-4 mb-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">
                    Remaining
                  </span>
                  <span
                    className={cn(
                      'text-2xl font-bold tabular-nums',
                      isLent ? 'text-income' : 'text-expense'
                    )}
                  >
                    {formatCurrency(
                      loan.remainingAmount,
                      preferences.currencySymbol
                    )}
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-xs text-muted-foreground">
                    Principal
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {formatCurrency(
                      loan.principalAmount,
                      preferences.currencySymbol
                    )}
                  </span>
                </div>
                {loan.dueDate && (
                  <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    Due {new Date(loan.dueDate).toLocaleDateString()}
                  </div>
                )}
                {loan.note && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {loan.note}
                  </p>
                )}
              </div>

              {!adding ? (
                <Button
                  type="button"
                  onClick={() => {
                    setPayAccountId(loan.accountId);
                    setAdding(true);
                  }}
                  disabled={loan.remainingAmount <= 0}
                  className="w-full rounded-2xl mb-4"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Record Payment
                </Button>
              ) : (
                <div className="rounded-2xl border border-border/40 p-3 mb-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      Record Payment
                    </span>
                    <button
                      type="button"
                      onClick={resetPaymentForm}
                      className="p-1.5 rounded-lg hover:bg-muted"
                      aria-label="Cancel payment"
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Amount
                    </Label>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {preferences.currencySymbol}
                      </span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        placeholder="0.00"
                        className="rounded-xl pl-8"
                      />
                    </div>
                    <div className="flex gap-1.5 mt-2">
                      {[0.25, 0.5, 1].map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() =>
                            setPayAmount(
                              String(
                                Math.round(
                                  loan.remainingAmount * f * 100
                                ) / 100
                              )
                            )
                          }
                          className="flex-1 text-[11px] py-1.5 rounded-lg bg-muted hover:bg-muted/70 text-muted-foreground font-medium"
                        >
                          {f === 1 ? 'Full' : `${f * 100}%`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {isLent ? 'Into account' : 'From account'}
                    </Label>
                    <select
                      value={payAccountId}
                      onChange={(e) => setPayAccountId(e.target.value)}
                      className="w-full mt-1 rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Date
                    </Label>
                    <Input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      className="mt-1 rounded-xl"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Note
                    </Label>
                    <Input
                      value={payNote}
                      onChange={(e) => setPayNote(e.target.value)}
                      placeholder="Optional"
                      className="mt-1 rounded-xl"
                    />
                  </div>

                  <Button
                    type="button"
                    onClick={submitPayment}
                    disabled={submittingPayment}
                    className="w-full rounded-xl"
                  >
                    <Check className="h-4 w-4 mr-1" />{' '}
                    {submittingPayment ? 'Saving…' : 'Save Payment'}
                  </Button>
                </div>
              )}

              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase px-1 mb-2">
                  Payment History ({loanPayments.length})
                </h3>
                {loanPayments.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    No payments yet
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {loanPayments.map((p) => {
                      const acc = accounts.find((a) => a.id === p.accountId);
                      return (
                        <div
                          key={p.id}
                          className="flex items-center gap-3 p-3 rounded-2xl bg-muted/30"
                        >
                          <div className="h-9 w-9 rounded-xl bg-card flex items-center justify-center shrink-0">
                            <Wallet className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium tabular-nums">
                              {formatCurrency(
                                p.amount,
                                preferences.currencySymbol
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {formatDateKey(p.date)}
                              {acc && ` · ${acc.name}`}
                              {p.note && ` · ${p.note}`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              toast('Remove this payment?', {
                                duration: 6000,
                                action: {
                                  label: 'Remove',
                                  onClick: () => onDeletePayment(p.id),
                                },
                                cancel: { label: 'Cancel', onClick: () => {} },
                              });
                            }}
                            className="p-2 rounded-xl hover:bg-destructive/10"
                            aria-label="Delete payment"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}