'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  X,
  Check,
  LineChart as LineChartIcon,
  RefreshCw,
  DollarSign,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CategoryIcon, INVESTMENT_TYPES } from '@/components/icon-map';
import { useStore } from '@/lib/store';
import type { Investment, InvestmentType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currencies';
import {
  getInvestmentsSummary,
  getInvestmentPnl,
  toDateInputValue,
} from '@/lib/finance';
import { toast } from 'sonner';

const TYPE_META = Object.fromEntries(
  INVESTMENT_TYPES.map((t) => [t.value, t])
) as Record<InvestmentType, (typeof INVESTMENT_TYPES)[number]>;

export function InvestmentsView() {
  const {
    investments,
    accounts,
    preferences,
    addInvestment,
    updateInvestment,
    updateInvestmentPrice,
    sellInvestment,
    deleteInvestment,
  } = useStore();

  const [isAdding, setIsAdding] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const summary = useMemo(
    () => getInvestmentsSummary(investments),
    [investments]
  );

  const active = investments.filter((i) => i.status === 'active');
  const sold = investments.filter((i) => i.status === 'sold');
  const isPositive = summary.unrealizedPnl >= 0;

  const confirmDelete = (inv: Investment) => {
    toast(
      `Delete ${inv.name}? Its buy and sell transactions will be removed.`,
      {
        duration: 8000,
        action: {
          label: 'Delete',
          onClick: async () => {
            try {
              await deleteInvestment(inv.id);
              if (detailId === inv.id) setDetailId(null);
              toast.success('Investment deleted');
            } catch (err) {
              console.error(err);
              toast.error('Failed to delete investment');
            }
          },
        },
        cancel: { label: 'Cancel', onClick: () => {} },
      }
    );
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Portfolio summary hero */}
      <div className="rounded-3xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-5 md:p-8 shadow-lg shadow-primary/20">
        <div className="flex items-center gap-2 mb-2">
          <LineChartIcon className="h-5 w-5" />
          <span className="text-sm font-medium opacity-90">
            Portfolio Value
          </span>
        </div>
        <p className="text-3xl md:text-5xl font-bold tabular-nums">
          {formatCurrency(summary.currentValue, preferences.currencySymbol)}
        </p>
        <p className="text-xs md:text-sm opacity-75 mt-2 flex items-center gap-1.5">
          {isPositive ? (
            <TrendingUp className="h-3.5 w-3.5" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" />
          )}
          {isPositive ? '+' : ''}
          {formatCurrency(summary.unrealizedPnl, preferences.currencySymbol)} (
          {summary.totalPnlPercent >= 0 ? '+' : ''}
          {summary.totalPnlPercent.toFixed(2)}%) unrealized
        </p>

        <div className="grid grid-cols-2 gap-4 mt-6 md:max-w-md">
          <div className="rounded-2xl bg-white/15 p-3 md:p-4">
            <span className="text-xs opacity-90">Invested</span>
            <p className="text-base md:text-xl font-bold tabular-nums">
              {formatCurrency(
                summary.totalInvested,
                preferences.currencySymbol
              )}
            </p>
          </div>
          <div className="rounded-2xl bg-white/15 p-3 md:p-4">
            <span className="text-xs opacity-90">Realized P&amp;L</span>
            <p className="text-base md:text-xl font-bold tabular-nums">
              {summary.realizedPnl >= 0 ? '+' : ''}
              {formatCurrency(summary.realizedPnl, preferences.currencySymbol)}
            </p>
          </div>
        </div>
      </div>

      {/* Allocation breakdown */}
      {active.length > 0 && (
        <div className="bg-card rounded-2xl border border-border/40 p-4 md:p-6 max-w-3xl">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-4">
            Allocation
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {INVESTMENT_TYPES.map((meta) => {
              const value = active
                .filter((i) => i.type === meta.value)
                .reduce((s, i) => s + i.currentValue, 0);
              if (value === 0) return null;
              const pct =
                summary.currentValue > 0
                  ? (value / summary.currentValue) * 100
                  : 0;
              return (
                <div key={meta.value} className="flex items-center gap-3">
                  <div
                    className="h-7 w-7 md:h-8 md:w-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${meta.color}1A` }}
                  >
                    <span style={{ color: meta.color }}>
                      <CategoryIcon name={meta.icon} size={14} />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between">
                      <span className="text-xs md:text-sm font-medium">
                        {meta.label}
                      </span>
                      <span className="text-xs md:text-sm font-semibold tabular-nums">
                        {formatCurrency(value, preferences.currencySymbol)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: meta.color,
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        className="rounded-2xl border-dashed max-w-xs"
        onClick={() => setIsAdding(true)}
        disabled={accounts.length === 0}
      >
        <Plus className="h-4 w-4 mr-2" /> Add Investment
      </Button>

      {investments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <LineChartIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground max-w-[260px]">
            No investments yet. Track shares, IPOs, mutual funds, crypto, gold
            and more — they&apos;ll count toward your net worth.
          </p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase px-1">
                Active ({active.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {active.map((inv, i) => (
                  <InvestmentCard
                    key={inv.id}
                    investment={inv}
                    currencySymbol={preferences.currencySymbol}
                    onClick={() => setDetailId(inv.id)}
                    onEdit={() => setEditing(inv)}
                    onDelete={() => confirmDelete(inv)}
                    delay={i * 0.04}
                  />
                ))}
              </div>
            </div>
          )}

          {sold.length > 0 && (
            <div className="flex flex-col gap-3 mt-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase px-1">
                Sold ({sold.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {sold.map((inv) => (
                  <InvestmentCard
                    key={inv.id}
                    investment={inv}
                    currencySymbol={preferences.currencySymbol}
                    onClick={() => setDetailId(inv.id)}
                    onEdit={() => setEditing(inv)}
                    onDelete={() => confirmDelete(inv)}
                    delay={0}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <InvestmentSheet
        open={isAdding || editing !== null}
        investment={editing}
        onOpenChange={(open) => {
          if (!open) {
            setIsAdding(false);
            setEditing(null);
          }
        }}
        onSave={async (data, id) => {
          try {
            if (id) {
              await updateInvestment(id, data);
              toast.success('Investment updated');
            } else {
              await addInvestment(data);
              toast.success('Investment added');
            }
            setIsAdding(false);
            setEditing(null);
          } catch (err) {
            console.error(err);
            const message =
              err instanceof Error ? err.message : 'Failed to save investment';
            toast.error(message);
          }
        }}
      />

      <InvestmentDetailSheet
        key={detailId ?? 'closed'}
        investmentId={detailId}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        onUpdatePrice={async (id, price) => {
          try {
            await updateInvestmentPrice(id, price);
            toast.success('Price updated');
          } catch (err) {
            console.error(err);
            const message =
              err instanceof Error ? err.message : 'Failed to update price';
            toast.error(message);
          }
        }}
        onSell={async (id, soldPrice, soldDate) => {
          try {
            await sellInvestment(id, soldPrice, soldDate);
            toast.success('Investment sold');
          } catch (err) {
            console.error(err);
            const message =
              err instanceof Error ? err.message : 'Failed to sell investment';
            toast.error(message);
          }
        }}
      />
    </div>
  );
}

function InvestmentCard({
  investment,
  currencySymbol,
  onClick,
  onEdit,
  onDelete,
  delay,
}: {
  investment: Investment;
  currencySymbol: string;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  delay: number;
}) {
  const meta = TYPE_META[investment.type];
  const { pnl, pnlPercent, marketValue } = getInvestmentPnl(investment);
  const isPositive = pnl >= 0;
  const isSold = investment.status === 'sold';

  const displayValue = isSold
    ? (investment.soldPrice ?? 0) * investment.units
    : marketValue;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={cn(
        'bg-card rounded-2xl border border-border/40 p-4 md:p-5 flex flex-col justify-between',
        isSold && 'opacity-70'
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left"
        aria-label={`Open details for ${investment.name}`}
      >
        <div className="flex items-start gap-3">
          <div
            className="h-10 w-10 md:h-12 md:w-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${meta.color}1A` }}
          >
            <span style={{ color: meta.color }}>
              <CategoryIcon name={meta.icon} size={20} />
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm truncate">
                {investment.name}
              </span>
              {isSold && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                  Sold
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {investment.symbol || meta.label} · {investment.units} units @{' '}
              {formatCurrency(investment.buyPrice, currencySymbol)}
            </p>
            <p className="text-base font-bold tabular-nums mt-1">
              {formatCurrency(displayValue, currencySymbol)}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1">
            <span
              className={cn(
                'text-xs font-semibold tabular-nums flex items-center gap-0.5',
                isPositive ? 'text-income' : 'text-expense'
              )}
            >
              {isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {isPositive ? '+' : ''}
              {pnlPercent.toFixed(1)}%
            </span>
          </div>
        </div>
      </button>

      <div className="flex justify-end gap-1 mt-4 pt-3 border-t border-border/40">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="rounded-lg h-8 px-2 text-muted-foreground"
        >
          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="rounded-lg h-8 px-2 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
        </Button>
      </div>
    </motion.div>
  );
}

type InvestmentFormData = {
  name: string;
  symbol: string;
  type: InvestmentType;
  units: number;
  buyPrice: number;
  currentPrice: number;
  accountId: string;
  date: number;
  note: string;
};

function InvestmentSheet({
  open,
  investment,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  investment: Investment | null;
  onOpenChange: (open: boolean) => void;
  onSave: (data: InvestmentFormData, id?: string) => void | Promise<void>;
}) {
  const accounts = useStore((s) => s.accounts);
  const preferences = useStore((s) => s.preferences);
  const formKey = open ? investment?.id ?? 'new' : 'closed';

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs>
      <DrawerContent className="rounded-t-[2rem] md:rounded-[2rem] flex flex-col max-h-[90dvh] overflow-hidden">
        <div className="shrink-0 px-4 pt-2 pb-3 md:pt-6">
          <h2 className="text-xl font-bold">
            {investment ? 'Edit Investment' : 'New Investment'}
          </h2>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 scroll-pt-4">
          <InvestmentForm
            key={formKey}
            initial={investment}
            currencySymbol={preferences.currencySymbol}
            accounts={accounts}
            onCancel={() => onOpenChange(false)}
            onSubmit={(data) => onSave(data, investment?.id)}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function InvestmentForm({
  initial,
  currencySymbol,
  accounts,
  onCancel,
  onSubmit,
}: {
  initial: Investment | null;
  currencySymbol: string;
  accounts: ReturnType<typeof useStore.getState>['accounts'];
  onCancel: () => void;
  onSubmit: (data: InvestmentFormData) => void;
}) {
  const [type, setType] = useState<InvestmentType>(initial?.type ?? 'stocks');
  const [name, setName] = useState(initial?.name ?? '');
  const [symbol, setSymbol] = useState(initial?.symbol ?? '');
  const [units, setUnits] = useState(initial ? String(initial.units) : '');
  const [buyPrice, setBuyPrice] = useState(
    initial ? String(initial.buyPrice) : ''
  );
  const [currentPrice, setCurrentPrice] = useState(
    initial ? String(initial.currentPrice) : ''
  );
  const [accountId, setAccountId] = useState(
    initial?.accountId ?? accounts[0]?.id ?? ''
  );
  const [date, setDate] = useState(
    initial ? toDateInputValue(initial.date) : toDateInputValue(Date.now())
  );
  const [note, setNote] = useState(initial?.note ?? '');

  const isSold = initial?.status === 'sold';
  const totalCost = (parseFloat(units) || 0) * (parseFloat(buyPrice) || 0);

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Enter a name');
      return;
    }
    const u = parseFloat(units) || 0;
    const bp = parseFloat(buyPrice) || 0;
    if (u <= 0) {
      toast.error('Enter a valid number of units');
      return;
    }
    if (bp <= 0) {
      toast.error('Enter a valid buy price');
      return;
    }
    if (!accountId) {
      toast.error('Please select an account');
      return;
    }
    const [y, m, d] = date.split('-').map(Number);
    const ts = new Date(y, m - 1, d).getTime();

    const cpRaw = currentPrice.trim() ? parseFloat(currentPrice) : NaN;
    if (!Number.isNaN(cpRaw) && cpRaw < 0) {
      toast.error('Current price cannot be negative');
      return;
    }
    const cp = !Number.isNaN(cpRaw) && cpRaw > 0 ? cpRaw : bp;

    onSubmit({
      name: name.trim(),
      symbol: symbol.trim().toUpperCase(),
      type,
      units: u,
      buyPrice: bp,
      currentPrice: cp,
      accountId,
      date: ts,
      note: note.trim(),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {isSold && (
        <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
          This position is already sold. Current price is derived from the
          sale price; only the buy-side details are editable.
        </div>
      )}

      <div>
        <Label className="text-xs text-muted-foreground">Type</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {INVESTMENT_TYPES.map((meta) => (
            <button
              key={meta.value}
              type="button"
              onClick={() => setType(meta.value)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all',
                type === meta.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              <span
                style={{
                  color: type === meta.value ? 'inherit' : meta.color,
                }}
              >
                <CategoryIcon name={meta.icon} size={13} />
              </span>
              {meta.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Label className="text-xs text-muted-foreground">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Reliance Industries"
            className="mt-1 rounded-xl"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Symbol</Label>
          <Input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="RELIANCE"
            className="mt-1 rounded-xl uppercase"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-sm">
        <div>
          <Label className="text-xs text-muted-foreground">
            Units / Shares
          </Label>
          <Input
            type="number"
            inputMode="decimal"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            placeholder="10"
            className="mt-1 rounded-xl"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">
            Buy Price (per unit)
          </Label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              {currencySymbol}
            </span>
            <Input
              type="number"
              inputMode="decimal"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
              placeholder="0.00"
              className="rounded-xl pl-7"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-muted/40 p-3 flex items-center justify-between max-w-sm">
        <span className="text-xs text-muted-foreground">Total invested</span>
        <span className="text-sm font-bold tabular-nums">
          {formatCurrency(totalCost, currencySymbol)}
        </span>
      </div>

      {!isSold && (
        <div className="max-w-sm">
          <Label className="text-xs text-muted-foreground">
            Current Price (per unit)
          </Label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              {currencySymbol}
            </span>
            <Input
              type="number"
              inputMode="decimal"
              value={currentPrice}
              onChange={(e) => setCurrentPrice(e.target.value)}
              placeholder="Same as buy price if blank"
              className="rounded-xl pl-7"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 max-w-sm">
        <div>
          <Label className="text-xs text-muted-foreground">
            {initial ? 'Source account' : 'Funded from'}
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
        <div>
          <Label className="text-xs text-muted-foreground">
            Purchase date
          </Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 rounded-xl"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Note</Label>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional"
          className="mt-1 rounded-xl"
        />
      </div>

      <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] md:pb-4 bg-background border-t flex gap-2">
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

function InvestmentDetailSheet({
  investmentId,
  onOpenChange,
  onUpdatePrice,
  onSell,
}: {
  investmentId: string | null;
  onOpenChange: (open: boolean) => void;
  onUpdatePrice: (id: string, price: number) => Promise<void>;
  onSell: (id: string, soldPrice: number, soldDate: number) => Promise<void>;
}) {
  const accounts = useStore((s) => s.accounts);
  const preferences = useStore((s) => s.preferences);
  const allInvestments = useStore((s) => s.investments);

  const liveInvestment = investmentId
    ? allInvestments.find((i) => i.id === investmentId) ?? null
    : null;

  const [mode, setMode] = useState<'view' | 'price' | 'sell'>('view');
  const [priceInput, setPriceInput] = useState('');
  const [sellPriceInput, setSellPriceInput] = useState('');
  const [sellDate, setSellDate] = useState(toDateInputValue(Date.now()));
  const [submitting, setSubmitting] = useState(false);

  const open = liveInvestment !== null;
  const acc = liveInvestment
    ? accounts.find((a) => a.id === liveInvestment.accountId)
    : undefined;

  const reset = () => {
    setMode('view');
    setPriceInput('');
    setSellPriceInput('');
    setSellDate(toDateInputValue(Date.now()));
  };

  const submitPrice = async () => {
    if (!liveInvestment) return;
    const p = parseFloat(priceInput);
    if (!p || p <= 0) {
      toast.error('Enter a valid price');
      return;
    }
    try {
      setSubmitting(true);
      await onUpdatePrice(liveInvestment.id, p);
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  const submitSell = async () => {
    if (!liveInvestment) return;
    const p = parseFloat(sellPriceInput);
    if (!p || p <= 0) {
      toast.error('Enter a valid sell price');
      return;
    }
    const [y, m, d] = sellDate.split('-').map(Number);
    try {
      setSubmitting(true);
      await onSell(liveInvestment.id, p, new Date(y, m - 1, d).getTime());
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      repositionInputs
    >
      <DrawerContent className="rounded-t-[2rem] md:rounded-[2rem] flex flex-col max-h-[90dvh] overflow-hidden">
        {liveInvestment && (
          <>
            <div className="shrink-0 px-4 pt-2 pb-3 md:pt-6">
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-2xl flex items-center justify-center"
                  style={{
                    backgroundColor: `${TYPE_META[liveInvestment.type].color}1A`,
                  }}
                >
                  <span style={{ color: TYPE_META[liveInvestment.type].color }}>
                    <CategoryIcon
                      name={TYPE_META[liveInvestment.type].icon}
                      size={20}
                    />
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold truncate">
                    {liveInvestment.name}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {liveInvestment.symbol ||
                      TYPE_META[liveInvestment.type].label}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 scroll-pt-4">
              <div className="rounded-2xl bg-muted/40 p-4 mb-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">
                    {liveInvestment.status === 'sold'
                      ? 'Proceeds'
                      : 'Market value'}
                  </span>
                  <span className="text-2xl font-bold tabular-nums">
                    {formatCurrency(
                      liveInvestment.status === 'sold' &&
                        liveInvestment.soldPrice !== null
                        ? liveInvestment.soldPrice * liveInvestment.units
                        : liveInvestment.currentValue,
                      preferences.currencySymbol
                    )}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Units</p>
                    <p className="font-semibold tabular-nums">
                      {liveInvestment.units}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Buy</p>
                    <p className="font-semibold tabular-nums">
                      {formatCurrency(
                        liveInvestment.buyPrice,
                        preferences.currencySymbol
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">
                      {liveInvestment.status === 'sold' ? 'Sold' : 'Current'}
                    </p>
                    <p className="font-semibold tabular-nums">
                      {formatCurrency(
                        liveInvestment.status === 'sold'
                          ? liveInvestment.soldPrice ?? 0
                          : liveInvestment.currentPrice,
                        preferences.currencySymbol
                      )}
                    </p>
                  </div>
                </div>

                {(() => {
                  const { pnl, pnlPercent } = getInvestmentPnl(liveInvestment);
                  const pos = pnl >= 0;
                  return (
                    <div className="mt-3 pt-3 border-t flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {liveInvestment.status === 'sold'
                          ? 'Realized P&L'
                          : 'Unrealized P&L'}
                      </span>
                      <span
                        className={cn(
                          'text-sm font-bold tabular-nums',
                          pos ? 'text-income' : 'text-expense'
                        )}
                      >
                        {pos ? '+' : ''}
                        {formatCurrency(pnl, preferences.currencySymbol)} (
                        {pos ? '+' : ''}
                        {pnlPercent.toFixed(2)}%)
                      </span>
                    </div>
                  );
                })()}

                <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  Bought {new Date(liveInvestment.date).toLocaleDateString()}
                  {acc && ` · ${acc.name}`}
                </div>
                {liveInvestment.note && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {liveInvestment.note}
                  </p>
                )}
              </div>

              {liveInvestment.status === 'active' && mode === 'view' && (
                <div className="flex gap-2 mb-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 rounded-2xl gap-1.5"
                    onClick={() => {
                      setPriceInput(String(liveInvestment.currentPrice));
                      setMode('price');
                    }}
                  >
                    <RefreshCw className="h-4 w-4" /> Update Price
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 rounded-2xl gap-1.5"
                    onClick={() => {
                      setSellPriceInput(String(liveInvestment.currentPrice));
                      setMode('sell');
                    }}
                  >
                    <DollarSign className="h-4 w-4" /> Sell
                  </Button>
                </div>
              )}

              {mode === 'price' && liveInvestment.status === 'active' && (
                <div className="rounded-2xl border border-border/40 p-3 mb-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      Update Market Price
                    </span>
                    <button
                      type="button"
                      onClick={() => setMode('view')}
                      className="p-1.5 rounded-lg hover:bg-muted"
                      aria-label="Cancel"
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      {preferences.currencySymbol}
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      placeholder="0.00"
                      className="rounded-xl pl-7"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Per-unit price. Current value:{' '}
                    <span className="font-medium text-foreground tabular-nums">
                      {formatCurrency(
                        (parseFloat(priceInput) || 0) * liveInvestment.units,
                        preferences.currencySymbol
                      )}
                    </span>
                  </p>
                  <Button
                    type="button"
                    onClick={submitPrice}
                    disabled={submitting}
                    className="w-full rounded-xl"
                  >
                    <Check className="h-4 w-4 mr-1" />{' '}
                    {submitting ? 'Saving…' : 'Update Price'}
                  </Button>
                </div>
              )}

              {mode === 'sell' && liveInvestment.status === 'active' && (
                <div className="rounded-2xl border border-border/40 p-3 mb-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      Sell Investment
                    </span>
                    <button
                      type="button"
                      onClick={() => setMode('view')}
                      className="p-1.5 rounded-lg hover:bg-muted"
                      aria-label="Cancel"
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Sell Price (per unit)
                    </Label>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                        {preferences.currencySymbol}
                      </span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={sellPriceInput}
                        onChange={(e) => setSellPriceInput(e.target.value)}
                        placeholder="0.00"
                        className="rounded-xl pl-7"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Sell Date
                    </Label>
                    <Input
                      type="date"
                      value={sellDate}
                      onChange={(e) => setSellDate(e.target.value)}
                      className="mt-1 rounded-xl"
                    />
                  </div>
                  <div className="rounded-xl bg-muted/50 p-2.5 flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      Proceeds credited to {acc?.name ?? 'account'}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(
                        (parseFloat(sellPriceInput) || 0) *
                          liveInvestment.units,
                        preferences.currencySymbol
                      )}
                    </span>
                  </div>
                  <Button
                    type="button"
                    onClick={submitSell}
                    disabled={submitting}
                    className="w-full rounded-xl"
                  >
                    <Check className="h-4 w-4 mr-1" />{' '}
                    {submitting ? 'Selling…' : 'Confirm Sale'}
                  </Button>
                </div>
              )}

              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase px-1 mb-2">
                  Cash Movements
                </h3>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex justify-between p-3 rounded-2xl bg-muted/30">
                    <span className="text-muted-foreground">
                      Buy ·{' '}
                      {new Date(liveInvestment.date).toLocaleDateString()}
                    </span>
                    <span className="font-semibold tabular-nums text-expense">
                      -{formatCurrency(
                        liveInvestment.investedAmount,
                        preferences.currencySymbol
                      )}
                    </span>
                  </div>
                  {liveInvestment.status === 'sold' &&
                    liveInvestment.soldDate &&
                    liveInvestment.soldPrice !== null && (
                      <div className="flex justify-between p-3 rounded-2xl bg-muted/30">
                        <span className="text-muted-foreground">
                          Sell ·{' '}
                          {new Date(
                            liveInvestment.soldDate
                          ).toLocaleDateString()}
                        </span>
                        <span className="font-semibold tabular-nums text-income">
                          +{formatCurrency(
                            liveInvestment.soldPrice * liveInvestment.units,
                            preferences.currencySymbol
                          )}
                        </span>
                      </div>
                    )}
                </div>
              </div>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}