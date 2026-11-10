'use client';

import { useState } from 'react';
import { motion, type PanInfo } from 'framer-motion';
import { Pencil, Trash2, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import { CategoryIcon } from './icon-map';
import { useStore } from '@/lib/store';
import type { Transaction } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currencies';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface TransactionItemProps {
  transaction: Transaction;
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void | Promise<void>;
}

export function TransactionItem({
  transaction,
  onEdit,
  onDelete,
}: TransactionItemProps) {
  const category = useStore((s) =>
    s.categories.find((c) => c.id === transaction.categoryId)
  );
  const account = useStore((s) =>
    s.accounts.find((a) => a.id === transaction.accountId)
  );
  const toAccount = useStore((s) =>
    transaction.toAccountId
      ? s.accounts.find((a) => a.id === transaction.toAccountId)
      : null
  );
  const currencySymbol = useStore((s) => s.preferences.currencySymbol);
  const linkedToInvestment = useStore((s) =>
    s.investments.some(
      (i) =>
        i.linkedTransactionId === transaction.id ||
        i.linkedSellTransactionId === transaction.id ||
        i.linkedApplyTransactionId === transaction.id ||
        i.linkedRefundTransactionId === transaction.id
    )
  );

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isExpense = transaction.type === 'expense';
  const isIncome = transaction.type === 'income';
  const isTransfer = transaction.type === 'transfer';

  const linkedToLoan = !!(
    transaction.linkedLoanId || transaction.linkedPaymentId
  );
  const isLinked = linkedToLoan || linkedToInvestment;

  const showLinkedError = () => {
    toast.error(
      'This transaction is linked to a loan or investment. Edit or delete it from the Loans or Investments tab instead.'
    );
  };

  const handleDelete = async () => {
    if (isLinked) {
      showLinkedError();
      return;
    }
    try {
      await onDelete(transaction.id);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to delete transaction'
      );
      throw err;
    }
  };

  const requestDelete = () => {
    if (isLinked) {
      showLinkedError();
      return;
    }
    setShowDeleteConfirm(true);
  };

  const requestEdit = () => {
    if (isLinked) {
      showLinkedError();
      return;
    }
    onEdit(transaction);
  };

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.x < -100) {
      requestDelete();
    } else if (info.offset.x > 100) {
      requestEdit();
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestDelete();
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestEdit();
  };

  return (
    <>
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        onClick={requestEdit}
        className="relative flex items-center gap-3 py-3 px-3 rounded-2xl hover:bg-muted/40 transition-colors cursor-grab active:cursor-grabbing"
      >
        <motion.div
          initial={{ opacity: 0 }}
          whileDrag={{ opacity: 1 }}
          className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1 pointer-events-none"
        >
          <div className="h-9 w-9 rounded-xl bg-destructive/90 flex items-center justify-center">
            <Trash2 className="h-4 w-4 text-white" />
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          whileDrag={{ opacity: 1 }}
          className="absolute left-3 top-1/2 -translate-y-1/2 flex gap-1 pointer-events-none"
        >
          <div className="h-9 w-9 rounded-xl bg-primary/90 flex items-center justify-center">
            <Pencil className="h-4 w-4 text-white" />
          </div>
        </motion.div>

        <div
          className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{
            backgroundColor: isTransfer
              ? 'hsl(var(--transfer) / 0.1)'
              : category
              ? `${category.color}1A`
              : 'hsl(var(--muted))',
          }}
        >
          {isTransfer ? (
            <ArrowRightLeft className="h-5 w-5 text-transfer" />
          ) : category ? (
            <span style={{ color: category.color }}>
              <CategoryIcon name={category.icon} size={20} />
            </span>
          ) : (
            <CategoryIcon
              name="MoreHorizontal"
              size={20}
              className="text-muted-foreground"
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {transaction.note ||
              category?.name ||
              (isTransfer ? 'Transfer' : 'Transaction')}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {isTransfer
              ? `${account?.name ?? '—'} → ${toAccount?.name ?? '—'}`
              : `${category?.name ?? 'Uncategorized'} · ${account?.name ?? '—'}`}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <div className="text-right mr-0.5">
            <p
              className={cn(
                'text-sm font-semibold tabular-nums',
                isExpense && 'text-expense',
                isIncome && 'text-income',
                isTransfer && 'text-transfer'
              )}
            >
              {isExpense ? '-' : isIncome ? '+' : ''}
              {formatCurrency(transaction.amount, currencySymbol)}
            </p>
            {transaction.isExcludedFromStats && (
              <p className="text-[10px] text-muted-foreground">excl. stats</p>
            )}
          </div>

          <button
            type="button"
            onClick={handleEditClick}
            aria-label="Edit transaction"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors touch-manipulation"
          >
            <Pencil className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleDeleteClick}
            aria-label="Delete transaction"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors touch-manipulation"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </motion.div>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Transaction"
        description="Are you sure you want to delete this transaction? This will update your account balances accordingly."
        confirmText="Delete Transaction"
        onConfirm={handleDelete}
      />
    </>
  );
}