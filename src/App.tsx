import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { TransactionsTab } from '@/components/tabs/transactions-tab';
import { StatsTab } from '@/components/tabs/stats-tab';
import { AccountsTab } from '@/components/tabs/accounts-tab';
import { BudgetsView } from '@/components/tabs/budgets-view';
import { CategoriesView } from '@/components/tabs/categories-view';
import { BottomNav, type TabKey } from '@/components/bottom-nav';
import { TransactionSheet } from '@/components/transaction-sheet';
import { AuthView } from '@/components/auth-view';
import { ProfileEditDrawer } from '@/components/profile-edit-drawer';
import { AboutSection } from '@/components/about-section';
import { LockScreen } from '@/components/lock-screen';
import { useStore } from '@/lib/store';
import { CURRENCIES } from '@/lib/currencies';
import { exportToCSV, downloadCSV } from '@/lib/finance';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Transaction } from '@/lib/types';
import {
  Download,
  Trash2,
  Target,
  LogOut,
  Wifi,
  WifiOff,
  UserCog,
  Plus,
  Wallet,
  BarChart3,
  ListChecks,
  Settings,
  Tags,
  Fingerprint,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(() => {
      setIsOnline(navigator.onLine);
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return isOnline;
}

function ConnectionStatus() {
  const isOnline = useOnlineStatus();

  return (
    <div
      className={
        'flex items-center gap-2 p-3 rounded-2xl text-xs font-medium transition-colors duration-300 ' +
        (isOnline
          ? 'bg-income/10 text-income'
          : 'bg-destructive/10 text-destructive')
      }
      role="status"
      aria-live="polite"
    >
      {isOnline ? (
        <Wifi className="h-4 w-4" />
      ) : (
        <WifiOff className="h-4 w-4" />
      )}
      <span>
        {isOnline ? 'Connected to the internet' : 'No internet connection'}
      </span>
    </div>
  );
}

const NAV_ITEMS = [
  { key: 'transactions', label: 'Transactions', icon: ListChecks },
  { key: 'stats', label: 'Statistics', icon: BarChart3 },
  { key: 'accounts', label: 'Accounts', icon: Wallet },
  { key: 'settings', label: 'Settings', icon: Settings },
] as const;

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('transactions');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isWipeDialogOpen, setIsWipeDialogOpen] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);

  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const isLoading = useStore((s) => s.isLoading);
  const initUserData = useStore((s) => s.initUserData);
  const transactions = useStore((s) => s.transactions);
  const accounts = useStore((s) => s.accounts);
  const categories = useStore((s) => s.categories);
  const preferences = useStore((s) => s.preferences);
  const updatePreferences = useStore((s) => s.updatePreferences);
  const toggleBiometric = useStore((s) => s.toggleBiometric);
  const clearCloudData = useStore((s) => s.clearCloudData);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setIsUnlocked(false);
        return;
      }

      setUser({
        uid: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName,
        photoURL: fbUser.photoURL,
      });
      await initUserData(fbUser.uid);
    });

    return () => unsub();
  }, [setUser, initUserData]);

  const handleEditTransaction = useCallback((tx: Transaction) => {
    setEditingTx(tx);
    setIsSheetOpen(true);
  }, []);

  const handleAddTransaction = useCallback(() => {
    setEditingTx(null);
    setIsSheetOpen(true);
  }, []);

  const handleExportCSV = useCallback(() => {
    const csv = exportToCSV(transactions, accounts, categories);
    downloadCSV(csv, `kalcy-export-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Transactions exported to CSV');
  }, [transactions, accounts, categories]);

  const handleSignOut = useCallback(async () => {
    await signOut(auth);
    setIsUnlocked(false);
    toast.success('Signed out');
  }, []);

  const handleWipeData = useCallback(async () => {
    try {
      await clearCloudData();
      toast.success('All data deleted');
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete data');
      throw err;
    }
  }, [clearCloudData]);

  if (isLoading && !user) {
    return (
      <main className="flex h-[100dvh] w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-xs text-muted-foreground animate-pulse">
            Loading...
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  if (!isUnlocked) {
    return <LockScreen onUnlock={() => setIsUnlocked(true)} />;
  }

  return (
    <main className="flex h-[100dvh] w-full bg-background text-foreground overflow-hidden">
      <aside className="hidden md:flex w-64 flex-col border-r border-border/40 bg-card h-full shrink-0">
        <div className="p-6 flex items-center gap-3">
          <img src="/kalcy-logo.svg" alt="Kalcy" className="h-8 w-auto" />
          <h1 className="text-xl font-bold">Kalcy</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.key;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key as TabKey)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-border/40 space-y-3">
          <Button
            onClick={handleAddTransaction}
            className="w-full rounded-xl gap-2 font-semibold"
          >
            <Plus className="h-4 w-4" /> New Transaction
          </Button>
          <div className="flex items-center gap-3 px-2">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">
                {user.displayName || 'User'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        <div className="flex-1 min-h-0 overflow-hidden">
          {activeTab === 'transactions' && (
            <TransactionsTab onEditTransaction={handleEditTransaction} />
          )}
          {activeTab === 'stats' && <StatsTab />}
          {activeTab === 'accounts' && <AccountsTab />}

          {activeTab === 'settings' && (
            <div className="h-full overflow-y-auto no-scrollbar px-4 pt-4 pb-40 md:pb-10 space-y-6 max-w-4xl mx-auto w-full">
              <div className="flex md:hidden items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <img src="/kalcy-logo.svg" alt="" className="h-10 w-auto" />
                  <div>
                    <h1 className="text-xl font-bold">Settings</h1>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {user.displayName || user.email}
                    </p>
                  </div>
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

              <ConnectionStatus />

              <div className="space-y-3 bg-card border border-border/40 rounded-3xl p-4 md:p-6 shadow-sm">
                <h2 className="text-base font-semibold">Account</h2>
                <Button
                  variant="outline"
                  className="w-full justify-start rounded-xl gap-2 text-sm"
                  onClick={() => setIsProfileOpen(true)}
                >
                  <UserCog className="h-4 w-4" /> Edit Profile &amp; Password
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSignOut}
                  className="hidden md:flex w-full justify-start rounded-xl gap-2 text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" /> Sign Out
                </Button>
              </div>

              <div className="space-y-3 bg-card border border-border/40 rounded-3xl p-4 md:p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Fingerprint className="h-4 w-4 text-primary" />
                  <h2 className="text-base font-semibold">Security</h2>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Biometric Authentication</p>
                    <p className="text-xs text-muted-foreground">
                      Use fingerprint or face unlock to open the app.
                      If disabled, the app will require your device PIN, pattern, or password.
                    </p>
                  </div>
                  <Switch
                    checked={preferences.biometricEnabled}
                    onCheckedChange={toggleBiometric}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <h2 className="text-base font-semibold">Monthly Budgets</h2>
                </div>
                <BudgetsView />
              </div>

              <div className="space-y-3 bg-card border border-border/40 rounded-3xl p-4 md:p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Tags className="h-4 w-4 text-primary" />
                  <h2 className="text-base font-semibold">Categories</h2>
                </div>
                <CategoriesView />
              </div>

              <div className="space-y-4 bg-card border border-border/40 rounded-3xl p-4 md:p-6 shadow-sm max-w-2xl">
                <h2 className="text-base font-semibold">Preferences</h2>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Currency
                  </Label>
                  <Select
                    value={preferences.currency}
                    onValueChange={(val) => updatePreferences({ currency: val })}
                  >
                    <SelectTrigger className="w-full rounded-xl h-11">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.name} ({c.symbol})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 pt-2">
                  <Label className="text-xs text-muted-foreground">
                    Week Starts On
                  </Label>
                  <div className="flex gap-2 max-w-sm">
                    <Button
                      type="button"
                      variant={
                        preferences.weekStartDay === 1 ? 'default' : 'outline'
                      }
                      size="sm"
                      className="flex-1 rounded-xl"
                      onClick={() => updatePreferences({ weekStartDay: 1 })}
                    >
                      Monday
                    </Button>
                    <Button
                      type="button"
                      variant={
                        preferences.weekStartDay === 0 ? 'default' : 'outline'
                      }
                      size="sm"
                      className="flex-1 rounded-xl"
                      onClick={() => updatePreferences({ weekStartDay: 0 })}
                    >
                      Sunday
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2">
                  <Label className="text-xs text-muted-foreground">
                    Theme Mode
                  </Label>
                  <div className="grid grid-cols-3 gap-2 max-w-sm">
                    {(['light', 'dark', 'system'] as const).map((mode) => (
                      <Button
                        key={mode}
                        type="button"
                        variant={
                          preferences.theme === mode ? 'default' : 'outline'
                        }
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

              <div className="space-y-3 bg-card border border-border/40 rounded-3xl p-4 md:p-6 shadow-sm max-w-2xl">
                <h2 className="text-base font-semibold">Cloud Actions</h2>
                <div className="flex flex-col gap-2 max-w-sm">
                  <Button
                    variant="outline"
                    className="w-full justify-start rounded-xl gap-2 text-sm"
                    onClick={handleExportCSV}
                  >
                    <Download className="h-4 w-4" /> Export All Data (CSV)
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start rounded-xl gap-2 text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setIsWipeDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" /> Delete All Data
                  </Button>
                </div>
              </div>

              <AboutSection />
            </div>
          )}
        </div>

        <BottomNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onAddClick={handleAddTransaction}
        />
      </div>

      <TransactionSheet
        open={isSheetOpen}
        onOpenChange={(open) => {
          setIsSheetOpen(open);
          if (!open) setEditingTx(null);
        }}
        editingTransaction={editingTx}
      />

      <ProfileEditDrawer open={isProfileOpen} onOpenChange={setIsProfileOpen} />

      <ConfirmDialog
        open={isWipeDialogOpen}
        onOpenChange={setIsWipeDialogOpen}
        title="Delete All Data"
        description="Are you absolutely sure? This will permanently delete all your transactions, accounts, budgets, and investments. This action cannot be undone."
        confirmText="Delete Everything"
        onConfirm={handleWipeData}
      />
    </main>
  );
}