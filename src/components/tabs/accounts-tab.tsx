'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Pencil,
  ArrowRightLeft,
  X,
  Check,
  Trash2,
  Wallet,
  HandCoins,
} from 'lucide-react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  CategoryIcon,
  AVAILABLE_ICONS,
  CATEGORY_COLORS,
} from '@/components/icon-map';
import { useStore } from '@/lib/store';
import type { Account, AccountType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currencies';
import {
  getTotalBalance,
  getLoansNetWorth,
  getTotalNetWorth,
} from '@/lib/finance';
import { LendingView } from './lending-view';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'card', label: 'Card' },
  { value: 'savings', label: 'Savings' },
  { value: 'wallet', label: 'Wallet' },
];

type AccountsSegment = 'accounts' | 'lending';

export function AccountsTab() {
  const {
    accounts,
    loans,
    preferences,
    addAccount,
    updateAccount,
    deleteAccount,
  } = useStore();
  const [segment, setSegment] = useState<AccountsSegment>('accounts');
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const cashBalance = getTotalBalance(accounts);
  const loansNet = getLoansNetWorth(loans);
  const netWorth = getTotalNetWorth(accounts, loans);
  const activeLoans = loans.filter(
    (l) => !l.isSettled && l.remainingAmount > 0
  );

  const confirmDelete = (acc: Account) => {
    toast('Delete this account and all its transactions?', {
      duration: 8000,
      action: {
        label: 'Delete',
        onClick: async () => {
          try {
            await deleteAccount(acc.id);
            toast.success('Account deleted');
          } catch (err) {
            console.error(err);
            toast.error('Failed to delete account');
          }
        },
      },
      cancel: { label: 'Cancel', onClick: () => {} },
    });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {segment === 'accounts' ? 'Accounts' : 'Lending'}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {segment === 'accounts'
                ? `${accounts.length} account${
                    accounts.length !== 1 ? 's' : ''
                  }`
                : `${activeLoans.length} active loan${
                    activeLoans.length !== 1 ? 's' : ''
                  }`}
            </p>
          </div>
          {segment === 'accounts' && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                className="rounded-xl"
                onClick={() => setTransferOpen(true)}
                disabled={accounts.length < 2}
                aria-label="Transfer between accounts"
              >
                <ArrowRightLeft className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                className="rounded-xl"
                onClick={() => setIsAdding(true)}
                aria-label="Add account"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-1 mx-4 mb-2 p-1 bg-muted rounded-xl">
        {(['accounts', 'lending'] as AccountsSegment[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSegment(s)}
            className={cn(
              'flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all flex items-center justify-center gap-1.5 touch-manipulation',
              segment === s
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground'
            )}
          >
            {s === 'accounts' ? (
              <Wallet className="h-3.5 w-3.5" />
            ) : (
              <HandCoins className="h-3.5 w-3.5" />
            )}
            {s === 'accounts' ? 'Accounts' : 'Lending'}
          </button>
        ))}
      </div>

      {segment === 'accounts' ? (
        <>
          <div className="px-4 pt-2">
            <div className="rounded-3xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-5 shadow-lg shadow-primary/20">
              <p className="text-sm opacity-90 font-medium">Total Net Worth</p>
              <p className="text-3xl font-bold mt-1 tabular-nums">
                {formatCurrency(netWorth, preferences.currencySymbol)}
              </p>
              {loansNet !== 0 && (
                <div className="mt-3 pt-3 border-t border-white/20 flex flex-col gap-1 text-xs">
                  <div className="flex justify-between">
                    <span className="opacity-75">Cash &amp; accounts</span>
                    <span className="tabular-nums">
                      {formatCurrency(
                        cashBalance,
                        preferences.currencySymbol
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-75">Loans (net)</span>
                    <span className="tabular-nums">
                      {loansNet >= 0 ? '+' : ''}
                      {formatCurrency(loansNet, preferences.currencySymbol)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 pt-3 pb-40">
            <div className="flex flex-col gap-3">
              {accounts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Wallet className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    No accounts yet. Tap + to add one.
                  </p>
                </div>
              ) : (
                accounts.map((acc, i) => (
                  <motion.div
                    key={acc.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-card rounded-2xl border border-border/40 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${acc.color}1A` }}
                      >
                        <span style={{ color: acc.color }}>
                          <CategoryIcon name={acc.icon} size={24} />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">
                            {acc.name}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                            {acc.type}
                          </span>
                        </div>
                        <p
                          className={cn(
                            'text-lg font-bold tabular-nums mt-1',
                            acc.balance >= 0
                              ? 'text-foreground'
                              : 'text-expense'
                          )}
                        >
                          {formatCurrency(
                            acc.balance,
                            preferences.currencySymbol
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingAccount(acc)}
                          className="p-2 rounded-xl hover:bg-muted transition-colors"
                          aria-label="Edit account"
                        >
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmDelete(acc)}
                          className="p-2 rounded-xl hover:bg-destructive/10 transition-colors"
                          aria-label="Delete account"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </button>
                      </div>
                    </div>
                    {!acc.isIncludedInTotal && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Excluded from total
                      </p>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 pb-40">
          <LendingView />
        </div>
      )}

      <AccountSheet
        open={isAdding || editingAccount !== null}
        account={editingAccount}
        onOpenChange={(open) => {
          if (!open) {
            setIsAdding(false);
            setEditingAccount(null);
          }
        }}
        onSave={async (data, id) => {
          try {
            if (id) {
              await updateAccount(id, data);
              toast.success('Account updated');
            } else {
              await addAccount(data);
              toast.success('Account added');
            }
            setIsAdding(false);
            setEditingAccount(null);
          } catch (err) {
            console.error(err);
            toast.error('Failed to save account');
          }
        }}
      />

      <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} />
    </div>
  );
}

function AccountSheet({
  open,
  account,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  account: Account | null;
  onOpenChange: (open: boolean) => void;
  onSave: (
    data: Omit<Account, 'id' | 'createdAt'>,
    id?: string
  ) => void | Promise<void>;
}) {
  const { preferences } = useStore();
  const formKey = open ? account?.id ?? 'new' : 'closed';

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs>
      <DrawerContent className="rounded-t-[2rem] flex flex-col max-h-[90dvh] overflow-hidden">
        <div className="shrink-0 px-4 pt-2 pb-3">
          <h2 className="text-xl font-bold">
            {account ? 'Edit Account' : 'New Account'}
          </h2>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 scroll-pt-4">
          <AccountForm
            key={formKey}
            initialName={account?.name ?? ''}
            initialType={account?.type ?? 'cash'}
            initialBalance={account?.initialBalance ?? 0}
            currentBalance={account?.balance ?? 0}
            isEditing={!!account}
            initialIcon={account?.icon ?? 'Banknote'}
            initialColor={account?.color ?? '#22C55E'}
            initialIncluded={account?.isIncludedInTotal ?? true}
            currencySymbol={preferences.currencySymbol}
            currencyCode={preferences.currency}
            onCancel={() => onOpenChange(false)}
            onSubmit={(data) => onSave(data, account?.id)}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function AccountForm({
  initialName,
  initialType,
  initialBalance,
  currentBalance,
  isEditing,
  initialIcon,
  initialColor,
  initialIncluded,
  currencySymbol,
  currencyCode,
  onCancel,
  onSubmit,
}: {
  initialName: string;
  initialType: AccountType;
  initialBalance: number;
  currentBalance: number;
  isEditing: boolean;
  initialIcon: string;
  initialColor: string;
  initialIncluded: boolean;
  currencySymbol: string;
  currencyCode: string;
  onCancel: () => void;
  onSubmit: (data: Omit<Account, 'id' | 'createdAt'>) => void;
}) {
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<AccountType>(initialType);
  const [initialBalanceInput, setInitialBalanceInput] = useState(
    String(initialBalance)
  );
  const [icon, setIcon] = useState(initialIcon);
  const [color, setColor] = useState(initialColor);
  const [isIncludedInTotal, setIsIncludedInTotal] = useState(initialIncluded);

  const parsedInitial = parseFloat(initialBalanceInput) || 0;
  const previewDelta = parsedInitial - initialBalance;
  const previewBalance = isEditing ? currentBalance + previewDelta : parsedInitial;

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Please enter an account name');
      return;
    }
    const newInitial = parsedInitial;
    const newBalance = isEditing
      ? currentBalance + (newInitial - initialBalance)
      : newInitial;

    onSubmit({
      name: name.trim(),
      type,
      balance: newBalance,
      initialBalance: newInitial,
      currency: currencyCode,
      icon,
      color,
      isIncludedInTotal,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-muted/40">
        <div
          className="h-12 w-12 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: `${color}1A` }}
        >
          <span style={{ color }}>
            <CategoryIcon name={icon} size={24} />
          </span>
        </div>
        <div>
          <p className="font-semibold text-sm">{name || 'Account Name'}</p>
          <p className="text-xs text-muted-foreground capitalize">{type}</p>
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Account Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Main Wallet"
          className="mt-1 rounded-xl"
        />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Account Type</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {ACCOUNT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={cn(
                'px-3 py-2 rounded-xl text-sm font-medium transition-all',
                type === t.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">
          Initial Balance
        </Label>
        <div className="relative mt-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {currencySymbol}
          </span>
          <Input
            type="number"
            inputMode="decimal"
            value={initialBalanceInput}
            onChange={(e) => setInitialBalanceInput(e.target.value)}
            placeholder="0.00"
            className="rounded-xl pl-8"
          />
        </div>
        {isEditing && (
          <p className="text-xs text-muted-foreground mt-2">
            Current balance:{' '}
            <span className="font-medium text-foreground tabular-nums">
              {formatCurrency(currentBalance, currencySymbol)}
            </span>
            {previewDelta !== 0 && (
              <>
                {' → '}
                <span className="font-medium text-foreground tabular-nums">
                  {formatCurrency(previewBalance, currencySymbol)}
                </span>
              </>
            )}
          </p>
        )}
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Icon</Label>
        <div className="grid grid-cols-6 gap-2 mt-1">
          {AVAILABLE_ICONS.slice(0, 18).map((iconName) => (
            <button
              key={iconName}
              type="button"
              onClick={() => setIcon(iconName)}
              aria-label={`Icon ${iconName}`}
              className={cn(
                'aspect-square w-full rounded-xl flex items-center justify-center transition-all',
                icon === iconName
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              )}
            >
              <CategoryIcon name={iconName} size={18} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Color</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {CATEGORY_COLORS.slice(0, 12).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              className={cn(
                'aspect-square w-8 rounded-full transition-all',
                color === c && 'ring-2 ring-offset-2 ring-ring scale-110'
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-sm">Include in net worth total</Label>
        <Switch
          checked={isIncludedInTotal}
          onCheckedChange={setIsIncludedInTotal}
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

function TransferDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { accounts, preferences, addTransaction } = useStore();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleTransfer = async () => {
    if (submitting) return;
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!fromId || !toId) {
      toast.error('Select both accounts');
      return;
    }
    if (fromId === toId) {
      toast.error('Choose different accounts');
      return;
    }
    try {
      setSubmitting(true);
      await addTransaction({
        type: 'transfer',
        amount: amt,
        accountId: fromId,
        toAccountId: toId,
        categoryId: null,
        date: Date.now(),
        note: 'Transfer',
        receiptUrl: null,
        isExcludedFromStats: true,
        isExcludedFromBudget: true,
      });
      toast.success('Transfer completed');
      setAmount('');
      setFromId('');
      setToId('');
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to complete transfer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Transfer Between Accounts</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div>
            <Label className="text-xs text-muted-foreground">From</Label>
            <select
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
              className="w-full mt-1 rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
            >
              <option value="">Select account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (
                  {formatCurrency(a.balance, preferences.currencySymbol)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">To</Label>
            <select
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              className="w-full mt-1 rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
            >
              <option value="">Select account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (
                  {formatCurrency(a.balance, preferences.currencySymbol)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Amount</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {preferences.currencySymbol}
              </span>
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="rounded-xl pl-8"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleTransfer}
            disabled={submitting}
          >
            <ArrowRightLeft className="h-4 w-4 mr-1" />{' '}
            {submitting ? 'Transferring…' : 'Transfer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}