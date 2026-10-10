import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { TransactionsTab } from '@/components/tabs/transactions-tab';
import { StatsTab } from '@/components/tabs/stats-tab';
import { AccountsTab } from '@/components/tabs/accounts-tab';
import { BudgetsView } from '@/components/tabs/budgets-view';
import { BottomNav, type TabKey } from '@/components/bottom-nav';
import { TransactionSheet } from '@/components/transaction-sheet';
import { AuthView } from '@/components/auth-view';
import { useStore } from '@/lib/store';
import { CURRENCIES } from '@/lib/currencies';
import { exportToCSV, downloadCSV } from '@/lib/finance';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { Transaction } from '@/lib/types';
import { Download, RotateCcw, Trash2, Target, LogOut, Cloud } from 'lucide-react';
import { toast } from 'sonner';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('transactions');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const {
    user,
    setUser,
    isLoading,
    initUserData,
    transactions,
    accounts,
    categories,
    preferences,
    updatePreferences,
    resetToSampleData,
    clearCloudData,
  } = useStore();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setUser({
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName,
          photoURL: fbUser.photoURL,
        });
        await initUserData(fbUser.uid);
      } else {
        setUser(null);
      }
    });
    return () => unsub();
  }, [setUser, initUserData]);

  if (isLoading && !user) {
    return (
      <main className="flex h-[100dvh] w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-xs text-muted-foreground animate-pulse">Syncing BudgetWise...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  const handleEditTransaction = (tx: Transaction) => {
    setEditingTx(tx);
    setIsSheetOpen(true);
  };

  const handleAddTransaction = () => {
    setEditingTx(null);
    setIsSheetOpen(true);
  };

  const handleExportCSV = () => {
    const csv = exportToCSV(transactions, accounts, categories);
    downloadCSV(csv, `kalcy-export-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Transactions exported to CSV');
  };

  const handleSignOut = async () => {
    await signOut(auth);
    toast.success('Signed out');
  };

  return (
    <main className="relative flex flex-col h-[100dvh] max-w-md mx-auto bg-background text-foreground overflow-hidden">
      <div className="flex-1 overflow-hidden pb-20">
        {activeTab === 'transactions' && (
          <TransactionsTab
            onEditTransaction={handleEditTransaction}
            onAddTransaction={handleAddTransaction}
          />
        )}

        {activeTab === 'stats' && <StatsTab />}

        {activeTab === 'accounts' && <AccountsTab />}

        {activeTab === 'more' && (
          <div className="h-full overflow-y-auto px-4 pt-4 pb-12 space-y-6 no-scrollbar">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">More & Budgets</h1>
                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">
                  {user.email}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="rounded-xl h-8 text-xs gap-1"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign Out
              </Button>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-2xl bg-primary/10 text-primary text-xs font-medium">
              <Cloud className="h-4 w-4" />
              <span>Realtime cloud sync active</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold">Monthly Budgets</h2>
              </div>
              <BudgetsView />
            </div>

            <div className="space-y-4 bg-card border border-border/40 rounded-3xl p-4">
              <h2 className="text-base font-semibold">Preferences</h2>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Currency</Label>
                <select
                  value={preferences.currency}
                  onChange={(e) => updatePreferences({ currency: e.target.value })}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} ({c.symbol})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 pt-2">
                <Label className="text-xs text-muted-foreground">Week Starts On</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={preferences.weekStartDay === 1 ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 rounded-xl"
                    onClick={() => updatePreferences({ weekStartDay: 1 })}
                  >
                    Monday
                  </Button>
                  <Button
                    type="button"
                    variant={preferences.weekStartDay === 0 ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 rounded-xl"
                    onClick={() => updatePreferences({ weekStartDay: 0 })}
                  >
                    Sunday
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <Label className="text-xs text-muted-foreground">Theme Mode</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(['light', 'dark', 'system'] as const).map((mode) => (
                    <Button
                      key={mode}
                      type="button"
                      variant={preferences.theme === mode ? 'default' : 'outline'}
                      size="sm"
                      className="capitalize rounded-xl text-xs"
                      onClick={() => updatePreferences({ theme: mode })}
                    >
                      {mode}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3 bg-card border border-border/40 rounded-3xl p-4">
              <h2 className="text-base font-semibold">Cloud Actions</h2>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="w-full justify-start rounded-xl gap-2 text-sm"
                  onClick={handleExportCSV}
                >
                  <Download className="h-4 w-4" /> Export All Data (CSV)
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start rounded-xl gap-2 text-sm text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                  onClick={async () => {
                    await resetToSampleData();
                    toast.success('Sample data populated in Firebase');
                  }}
                >
                  <RotateCcw className="h-4 w-4" /> Seed Sample Cloud Data
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start rounded-xl gap-2 text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={async () => {
                    await clearCloudData();
                    toast.success('All cloud records deleted');
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Delete All Cloud Data
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onAddClick={handleAddTransaction}
      />

      <TransactionSheet
        open={isSheetOpen}
        onOpenChange={(open) => {
          setIsSheetOpen(open);
          if (!open) setEditingTx(null);
        }}
        editingTransaction={editingTx}
      />
    </main>
  );
}