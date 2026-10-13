import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { getDoc, doc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { TransactionsTab } from '@/components/tabs/transactions-tab';
import { StatsTab } from '@/components/tabs/stats-tab';
import { AccountsTab } from '@/components/tabs/accounts-tab';
import { BudgetsView } from '@/components/tabs/budgets-view';
import { BottomNav, type TabKey } from '@/components/bottom-nav';
import { TransactionSheet } from '@/components/transaction-sheet';
import { AuthView } from '@/components/auth-view';
import { ProfileEditDrawer } from '@/components/profile-edit-drawer';
import { useStore } from '@/lib/store';
import { CURRENCIES } from '@/lib/currencies';
import { exportToCSV, downloadCSV } from '@/lib/finance';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { Transaction } from '@/lib/types';
import { Download, Trash2, Target, LogOut, Wifi, WifiOff, UserCog } from 'lucide-react';
import { toast } from 'sonner';

/* ------------------------------------------------------------------ */
/*  Online/offline indicator                                          */
/* ------------------------------------------------------------------ */

function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Some browsers don't fire `offline` reliably; poll as a fallback.
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
        {isOnline
          ? 'Connected to the internet'
          : 'No internet connection'}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('transactions');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const isLoading = useStore((s) => s.isLoading);
  const initUserData = useStore((s) => s.initUserData);
  const transactions = useStore((s) => s.transactions);
  const accounts = useStore((s) => s.accounts);
  const categories = useStore((s) => s.categories);
  const preferences = useStore((s) => s.preferences);
  const updatePreferences = useStore((s) => s.updatePreferences);
  const clearCloudData = useStore((s) => s.clearCloudData);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        return;
      }

      setAuthNotice(null);

      const email = fbUser.email?.toLowerCase() ?? '';
      if (!email) {
        await signOut(auth);
        setAuthNotice('Your account has no email address attached.');
        return;
      }

      try {
        const allowSnap = await getDoc(doc(db, 'allowlist', email));
        const allowed = allowSnap.exists() && allowSnap.data()?.enabled === true;

        if (!allowed) {
          await signOut(auth);
          setAuthNotice(
            'Access denied. Your account is not authorised to use Kalcy.'
          );
          return;
        }
      } catch (err) {
        console.error('Allowlist check failed', err);
        await signOut(auth);
        setAuthNotice('Could not verify access. Please try again.');
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

  if (isLoading && !user) {
    return (
      <main className="flex h-[100dvh] w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-xs text-muted-foreground animate-pulse">
            {authNotice ? '' : 'Verifying access...'}
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return <AuthView notice={authNotice} />;
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

  const confirmWipe = () => {
    toast('Delete ALL records? This cannot be undone.', {
      duration: 10000,
      action: {
        label: 'Delete Everything',
        onClick: async () => {
          await clearCloudData();
          toast.success('All data deleted');
        },
      },
      cancel: { label: 'Cancel', onClick: () => {} },
    });
  };

  return (
    <main className="relative flex flex-col h-[100dvh] max-w-md mx-auto bg-background text-foreground overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'transactions' && (
          <TransactionsTab onEditTransaction={handleEditTransaction} />
        )}

        {activeTab === 'stats' && <StatsTab />}

        {activeTab === 'accounts' && <AccountsTab />}

        {activeTab === 'more' && (
          <div className="h-full overflow-y-auto no-scrollbar px-4 pt-4 pb-40 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src="/kalcy-logo.svg"
                  alt=""
                  className="h-10 w-auto"
                  draggable={false}
                />
                <div>
                  <h1 className="text-xl font-bold">More &amp; Budgets</h1>
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

            {/* Connection status indicator */}
            <ConnectionStatus />

            {/* Account / Profile */}
            <div className="space-y-3 bg-card border border-border/40 rounded-3xl p-4">
              <h2 className="text-base font-semibold">Account</h2>
              <Button
                variant="outline"
                className="w-full justify-start rounded-xl gap-2 text-sm"
                onClick={() => setIsProfileOpen(true)}
              >
                <UserCog className="h-4 w-4" /> Edit Profile &amp; Password
              </Button>
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
                  className="w-full justify-start rounded-xl gap-2 text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={confirmWipe}
                >
                  <Trash2 className="h-4 w-4" /> Delete All Data
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

      <ProfileEditDrawer open={isProfileOpen} onOpenChange={setIsProfileOpen} />
    </main>
  );
}