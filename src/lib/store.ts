import { create } from 'zustand';
import { toast } from 'sonner';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  writeBatch,
  increment,
  Unsubscribe,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import type {
  Account,
  Category,
  Transaction,
  Budget,
  Preferences,
  AuthUser,
  Loan,
  LoanPayment,
  Investment,
  InvestmentStatus,
} from './types';
import {
  SEED_CATEGORIES,
  SEED_ACCOUNTS,
  SEED_TRANSACTIONS,
  SEED_BUDGETS,
  DEFAULT_PREFERENCES,
} from './seed-data';
import { getCurrencySymbol } from './currencies';
import {
  type AuthSettings,
  DEFAULT_AUTH_SETTINGS,
  loadAuthSettings,
  saveAuthSettings,
  registerCredential,
  hashPin,
  verifyPin as verifyPinHash,
  isSupported,
} from './auth-service';

interface StoreState {
  user: AuthUser | null;
  isLoading: boolean;
  hideBalances: boolean;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  loans: Loan[];
  loanPayments: LoanPayment[];
  investments: Investment[];
  preferences: Preferences;

  authSettings: AuthSettings;
  authLoaded: boolean;
  isAuthConfigured: boolean;

  setUser: (user: AuthUser | null) => void;
  initUserData: (uid: string) => Promise<void>;
  clearLocalState: () => void;
  toggleHideBalances: () => void;

  enableWebAuthn: () => Promise<void>;
  disableWebAuthn: () => Promise<void>;
  setPin: (pin: string) => Promise<void>;
  disablePin: () => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;

  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>;
  updateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;

  addAccount: (
    acc: Omit<Account, 'id' | 'createdAt' | 'balance'>
  ) => Promise<void>;
  updateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;

  addCategory: (cat: Omit<Category, 'id' | 'order'>) => Promise<void>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  addBudget: (budget: Omit<Budget, 'id'>) => Promise<void>;
  updateBudget: (id: string, updates: Partial<Budget>) => Promise<void>;
  deleteBudget: (id: string) => Promise<void>;

  addLoan: (
    loan: Omit<Loan, 'id' | 'createdAt' | 'isSettled' | 'remainingAmount'>
  ) => Promise<void>;
  updateLoan: (id: string, updates: Partial<Loan>) => Promise<void>;
  deleteLoan: (id: string) => Promise<void>;

  addLoanPayment: (
    payment: Omit<LoanPayment, 'id' | 'createdAt'>
  ) => Promise<void>;
  deleteLoanPayment: (id: string) => Promise<void>;

  addInvestment: (inv: {
    name: string;
    symbol: string;
    type: Investment['type'];
    units: number;
    buyPrice: number;
    currentPrice?: number;
    accountId: string;
    date: number;
    note: string;
    status?: Investment['status'];
    listingPrice?: number | null;
    listingDate?: number | null;
    appliedAmount?: number | null;
    soldPrice?: number | null;
    soldDate?: number | null;
  }) => Promise<void>;
  updateInvestment: (id: string, updates: Partial<Investment>) => Promise<void>;
  updateInvestmentPrice: (id: string, price: number) => Promise<void>;
  sellInvestment: (id: string, soldPrice: number, soldDate: number) => Promise<void>;
  deleteInvestment: (id: string) => Promise<void>;

  updatePreferences: (updates: Partial<Preferences>) => Promise<void>;
  restoreDefaults: () => Promise<void>;
  resetToSampleData: () => Promise<void>;
  clearCloudData: () => Promise<void>;
}

let unsubs: Unsubscribe[] = [];
function clearUnsubs() {
  unsubs.forEach((u) => u());
  unsubs = [];
}
function genId(p: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${p}_${crypto.randomUUID()}`;
  }
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function txEffects(
  tx: Pick<Transaction, 'type' | 'amount' | 'accountId' | 'toAccountId'>
): Map<string, number> {
  const m = new Map<string, number>();
  const add = (id: string | null | undefined, delta: number) => {
    if (!id || delta === 0) return;
    m.set(id, (m.get(id) ?? 0) + delta);
  };
  if (tx.type === 'transfer') {
    add(tx.accountId, -tx.amount);
    add(tx.toAccountId, +tx.amount);
  } else if (tx.type === 'expense') {
    add(tx.accountId, -tx.amount);
  } else if (tx.type === 'income') {
    add(tx.accountId, +tx.amount);
  }
  return m;
}

const FIRESTORE_BATCH_LIMIT = 400;

async function commitInChunks(
  ops: Array<(batch: WriteBatch) => void>
): Promise<void> {
  if (ops.length === 0) return;
  for (let i = 0; i < ops.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    ops.slice(i, i + FIRESTORE_BATCH_LIMIT).forEach((fn) => fn(batch));
    await batch.commit();
  }
}

function findInitialLoanTransaction(
  loan: Loan,
  transactions: Transaction[]
): Transaction | undefined {
  const initialType: Transaction['type'] =
    loan.type === 'lent' ? 'expense' : 'income';
  return transactions.find(
    (t) => t.linkedLoanId === loan.id && !t.linkedPaymentId && t.type === initialType
  );
}

function requirePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
}

function validateTxShape(
  tx: Pick<Transaction, 'type' | 'categoryId' | 'accountId' | 'toAccountId' | 'amount'>,
  categories: Category[]
): void {
  if (!Number.isFinite(tx.amount) || tx.amount <= 0) {
    throw new Error('Amount must be a positive number');
  }
  if (tx.type === 'transfer') {
    if (!tx.toAccountId) throw new Error('Transfer destination is required');
    if (tx.toAccountId === tx.accountId) {
      throw new Error('Source and destination accounts must be different');
    }
  } else {
    if (!tx.categoryId) throw new Error('Category is required');
    const cat = categories.find((c) => c.id === tx.categoryId);
    if (!cat) throw new Error('Category not found');
    if (cat.type !== tx.type) {
      throw new Error(`Category "${cat.name}" is not a ${tx.type} category`);
    }
  }
}

function pickPositive(...values: (number | null | undefined)[]): number | null {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

const INVESTMENT_BUY_SIDE_FIELDS = [
  'name',
  'symbol',
  'type',
  'units',
  'buyPrice',
  'accountId',
  'date',
] as const;

const INVESTMENT_USER_FIELDS: ReadonlySet<keyof Investment> = new Set([
  'name', 'symbol', 'type', 'units', 'buyPrice', 'currentPrice',
  'accountId', 'date', 'soldPrice', 'soldDate', 'status',
  'listingPrice', 'listingDate', 'appliedAmount', 'note',
]);

const VALID_INVESTMENT_TRANSITIONS: Record<InvestmentStatus, InvestmentStatus[]> = {
  applied: ['active', 'not_allotted'],
  active: ['sold'],
  sold: [],
  not_allotted: [],
};

export const useStore = create<StoreState>((set, get) => ({
  user: null,
  isLoading: true,
  hideBalances: true,
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
  loans: [],
  loanPayments: [],
  investments: [],
  preferences: DEFAULT_PREFERENCES,

  authSettings: { ...DEFAULT_AUTH_SETTINGS },
  authLoaded: false,
  isAuthConfigured: false,

  setUser: (user) => {
    set({ user });
    if (user) {
      const settings = loadAuthSettings(user.uid);
      set({
        authSettings: settings,
        authLoaded: true,
        isAuthConfigured:
          settings.webauthnEnabled || settings.pinEnabled,
      });
    } else {
      clearUnsubs();
      get().clearLocalState();
    }
  },

  clearLocalState: () => {
    set({
      accounts: [],
      categories: [],
      transactions: [],
      budgets: [],
      loans: [],
      loanPayments: [],
      investments: [],
      preferences: DEFAULT_PREFERENCES,
      authSettings: { ...DEFAULT_AUTH_SETTINGS },
      authLoaded: false,
      isAuthConfigured: false,
      isLoading: false,
    });
  },

  toggleHideBalances: () =>
    set((state) => ({ hideBalances: !state.hideBalances })),

  enableWebAuthn: async () => {
    const { user, authSettings } = get();
    if (!user) throw new Error('Not authenticated');

    // STRICT SECURITY REQUIREMENT: Biometrics cannot be enabled without a PIN
    if (!authSettings.pinEnabled) {
      throw new Error('A 4-digit backup PIN must be configured before enabling biometric unlock.');
    }

    const supported = await isSupported();
    if (!supported) {
      throw new Error(
        'WebAuthn is not available on this device. Use a secure connection (HTTPS or localhost) with a platform authenticator.'
      );
    }

    const credential = await registerCredential(
      user.uid,
      user.email ?? user.uid,
      user.displayName ?? user.email ?? 'Kalcy user'
    );

    const next: AuthSettings = {
      ...get().authSettings,
      webauthnEnabled: true,
      webauthnCredentialId: credential.id,
    };
    saveAuthSettings(user.uid, next);
    set({
      authSettings: next,
      isAuthConfigured: next.webauthnEnabled || next.pinEnabled,
    });
  },

  disableWebAuthn: async () => {
    const { user } = get();
    if (!user) return;
    const next: AuthSettings = {
      ...get().authSettings,
      webauthnEnabled: false,
      webauthnCredentialId: null,
    };
    saveAuthSettings(user.uid, next);
    set({
      authSettings: next,
      isAuthConfigured: next.webauthnEnabled || next.pinEnabled,
    });
  },

  setPin: async (pin: string) => {
    const { user } = get();
    if (!user) throw new Error('Not authenticated');
    if (!/^\d{4}$/.test(pin)) {
      throw new Error('PIN must be exactly 4 digits');
    }
    const { hash, salt } = await hashPin(pin);
    const next: AuthSettings = {
      ...get().authSettings,
      pinEnabled: true,
      pinHash: hash,
      pinSalt: salt,
    };
    saveAuthSettings(user.uid, next);
    set({
      authSettings: next,
      isAuthConfigured: next.webauthnEnabled || next.pinEnabled,
    });
  },

  disablePin: async () => {
    const { user } = get();
    if (!user) return;
    const next: AuthSettings = {
      ...get().authSettings,
      pinEnabled: false,
      pinHash: null,
      pinSalt: null,
    };
    saveAuthSettings(user.uid, next);
    set({
      authSettings: next,
      isAuthConfigured: next.webauthnEnabled || next.pinEnabled,
    });
  },

  verifyPin: async (pin: string) => {
    const { authSettings } = get();
    if (
      !authSettings.pinEnabled ||
      !authSettings.pinHash ||
      !authSettings.pinSalt
    ) {
      return false;
    }
    return verifyPinHash(pin, authSettings.pinHash, authSettings.pinSalt);
  },

  initUserData: async (uid: string) => {
    clearUnsubs();
    set({ isLoading: true });

    const prefRef = doc(db, 'users', uid, 'profile', 'preferences');

    const trySeed = async (): Promise<void> => {
      const prefSnap = await getDoc(prefRef);
      if (prefSnap.exists()) return;
      const batch = writeBatch(db);
      SEED_CATEGORIES.forEach((c) =>
        batch.set(doc(db, 'users', uid, 'categories', c.id), c)
      );
      SEED_ACCOUNTS.forEach((a) =>
        batch.set(doc(db, 'users', uid, 'accounts', a.id), {
          ...a,
          balance: a.initialBalance,
          createdAt: Date.now(),
        })
      );
      batch.set(prefRef, DEFAULT_PREFERENCES);
      await batch.commit();
    };

    try {
      await trySeed();
    } catch (err) {
      console.warn('Initial seed failed, retrying once', err);
      try {
        await new Promise((r) => setTimeout(r, 2000));
        await trySeed();
      } catch (err2) {
        console.error('Seed retry failed', err2);
        toast.error(
          'Could not initialize your workspace. Check your connection and try again.'
        );
      }
    }

    const registeredKeys: string[] = [];
    const registerListener = (key: string) => {
      registeredKeys.push(key);
    };
    const readySet = new Set<string>();
    const markReady = (key: string) => {
      readySet.add(key);
      if (
        registeredKeys.length > 0 &&
        readySet.size >= registeredKeys.length &&
        get().isLoading
      ) {
        set({ isLoading: false });
      }
    };

    const handleError = (label: string) => (err: { code?: string; message?: string }) => {
      console.error(`[${label}] Firestore listener error`, err);
      if (err.code === 'permission-denied') {
        toast.error('Access revoked. Please sign in again.');
        get().setUser(null);
      } else {
        toast.error('Failed to load data. Check your connection.');
      }
      markReady(label);
    };

    registerListener('preferences');
    unsubs.push(
      onSnapshot(
        prefRef,
        (snap) => {
          if (snap.exists()) set({ preferences: snap.data() as Preferences });
          markReady('preferences');
        },
        handleError('preferences')
      )
    );

    registerListener('accounts');
    unsubs.push(
      onSnapshot(
        collection(db, 'users', uid, 'accounts'),
        (s) => {
          set({ accounts: s.docs.map((d) => d.data() as Account) });
          markReady('accounts');
        },
        handleError('accounts')
      )
    );

    registerListener('categories');
    unsubs.push(
      onSnapshot(
        collection(db, 'users', uid, 'categories'),
        (s) => {
          const categories = s.docs
            .map((d) => d.data() as Category)
            .sort((a, b) => a.order - b.order);
          set({ categories });
          markReady('categories');
        },
        handleError('categories')
      )
    );

    registerListener('transactions');
    unsubs.push(
      onSnapshot(
        collection(db, 'users', uid, 'transactions'),
        (s) => {
          const transactions = s.docs
            .map((d) => d.data() as Transaction)
            .sort((a, b) => b.date - a.date);
          set({ transactions });
          markReady('transactions');
        },
        handleError('transactions')
      )
    );

    registerListener('budgets');
    unsubs.push(
      onSnapshot(
        collection(db, 'users', uid, 'budgets'),
        (s) => {
          set({ budgets: s.docs.map((d) => d.data() as Budget) });
          markReady('budgets');
        },
        handleError('budgets')
      )
    );

    registerListener('loans');
    unsubs.push(
      onSnapshot(
        collection(db, 'users', uid, 'loans'),
        (s) => {
          const loans = s.docs
            .map((d) => d.data() as Loan)
            .sort((a, b) => b.date - a.date);
          set({ loans });
          markReady('loans');
        },
        handleError('loans')
      )
    );

    registerListener('loanPayments');
    unsubs.push(
      onSnapshot(
        collection(db, 'users', uid, 'loanPayments'),
        (s) => {
          const loanPayments = s.docs
            .map((d) => d.data() as LoanPayment)
            .sort((a, b) => b.date - a.date);
          set({ loanPayments });
          markReady('loanPayments');
        },
        handleError('loanPayments')
      )
    );

    registerListener('investments');
    unsubs.push(
      onSnapshot(
        collection(db, 'users', uid, 'investments'),
        (s) => {
          const investments = s.docs
            .map((d) => d.data() as Investment)
            .sort((a, b) => b.date - a.date);
          set({ investments });
          markReady('investments');
        },
        handleError('investments')
      )
    );
  },

  addTransaction: async (tx) => {
    const { user, categories } = get();
    if (!user) throw new Error('Not authenticated');

    validateTxShape(tx, categories);

    const id = genId('t');
    const newTx: Transaction = { ...tx, id, createdAt: Date.now() };

    const ops: Array<(batch: WriteBatch) => void> = [];
    ops.push((batch) =>
      batch.set(doc(db, 'users', user.uid, 'transactions', id), newTx)
    );
    txEffects(newTx).forEach((delta, accId) => {
      ops.push((batch) =>
        batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
          balance: increment(delta),
        })
      );
    });
    await commitInChunks(ops);
  },

  updateTransaction: async (id, updates) => {
    const { user, transactions, categories, investments } = get();
    if (!user) return;
    const oldTx = transactions.find((t) => t.id === id);
    if (!oldTx) return;

    const linkedInv = investments.find(
      (i) =>
        i.linkedTransactionId === id ||
        i.linkedSellTransactionId === id ||
        i.linkedApplyTransactionId === id ||
        i.linkedRefundTransactionId === id
    );
    if (oldTx.linkedLoanId || oldTx.linkedPaymentId || linkedInv) {
      throw new Error(
        'This transaction is linked to a loan or investment. Edit it from the parent tab instead.'
      );
    }

    const merged: Transaction = { ...oldTx, ...updates };

    const needsValidation =
      updates.type !== undefined ||
      updates.categoryId !== undefined ||
      updates.accountId !== undefined ||
      updates.toAccountId !== undefined ||
      updates.amount !== undefined;
    if (needsValidation) {
      validateTxShape(merged, categories);
    }

    const patch: Partial<Transaction> = { ...updates };
    if (merged.type === 'transfer') {
      patch.categoryId = null;
    } else {
      patch.toAccountId = null;
    }

    const oldEffects = txEffects(oldTx);
    const newEffects = txEffects(merged);
    const net = new Map<string, number>();
    oldEffects.forEach((v, k) => net.set(k, (net.get(k) ?? 0) - v));
    newEffects.forEach((v, k) => net.set(k, (net.get(k) ?? 0) + v));

    const ops: Array<(batch: WriteBatch) => void> = [];
    ops.push((batch) =>
      batch.update(doc(db, 'users', user.uid, 'transactions', id), patch)
    );
    net.forEach((delta, accId) => {
      if (delta !== 0) {
        ops.push((batch) =>
          batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
            balance: increment(delta),
          })
        );
      }
    });
    await commitInChunks(ops);
  },

  deleteTransaction: async (id) => {
    const { user, transactions, investments } = get();
    if (!user) return;
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return;

    if (tx.linkedPaymentId) {
      await get().deleteLoanPayment(tx.linkedPaymentId);
      return;
    }
    if (tx.linkedLoanId && !tx.linkedPaymentId) {
      await get().deleteLoan(tx.linkedLoanId);
      return;
    }

    const linkedInv = investments.find(
      (i) =>
        i.linkedTransactionId === tx.id ||
        i.linkedSellTransactionId === tx.id ||
        i.linkedApplyTransactionId === tx.id ||
        i.linkedRefundTransactionId === tx.id
    );
    if (linkedInv) {
      await get().deleteInvestment(linkedInv.id);
      return;
    }

    const ops: Array<(batch: WriteBatch) => void> = [];
    ops.push((batch) =>
      batch.delete(doc(db, 'users', user.uid, 'transactions', id))
    );
    txEffects(tx).forEach((delta, accId) => {
      ops.push((batch) =>
        batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
          balance: increment(-delta),
        })
      );
    });
    await commitInChunks(ops);
  },

  addAccount: async (acc) => {
    const { user } = get();
    if (!user) return;
    if (!acc.name?.trim()) throw new Error('Account name is required');
    if (!Number.isFinite(acc.initialBalance)) {
      throw new Error('Initial balance must be a number');
    }
    const id = genId('acc');
    await setDoc(doc(db, 'users', user.uid, 'accounts', id), {
      ...acc,
      name: acc.name.trim(),
      id,
      balance: acc.initialBalance,
      createdAt: Date.now(),
    });
  },

  updateAccount: async (id, updates) => {
    const { user, accounts } = get();
    if (!user) return;
    const current = accounts.find((a) => a.id === id);
    if (!current) return;

    const docRef = doc(db, 'users', user.uid, 'accounts', id);

    const { balance: _ignored, ...rest } = updates;
    void _ignored;

    if (
      typeof rest.initialBalance === 'number' &&
      rest.initialBalance !== current.initialBalance
    ) {
      const delta = rest.initialBalance - current.initialBalance;
      await updateDoc(docRef, {
        ...rest,
        balance: increment(delta),
      });
      return;
    }

    if (Object.keys(rest).length > 0) {
      await updateDoc(docRef, rest);
    }
  },

  deleteAccount: async (id) => {
    const { user, transactions, loans, loanPayments, investments } = get();
    if (!user) return;

    const ops: Array<(batch: WriteBatch) => void> = [];
    const balanceDeltas = new Map<string, number>();
    const bump = (accId: string, delta: number) => {
      if (accId === id) return;
      if (delta === 0) return;
      balanceDeltas.set(accId, (balanceDeltas.get(accId) ?? 0) + delta);
    };

    const loansUsingAccount = loans.filter((l) => l.accountId === id);
    const deletingLoanIds = new Set(loansUsingAccount.map((l) => l.id));

    const paymentsOnAccount = loanPayments.filter((p) => p.accountId === id);
    const paymentIdsToDelete = new Set(paymentsOnAccount.map((p) => p.id));

    const investmentsOnAccount = investments.filter((i) => i.accountId === id);

    const txIdsToDelete = new Set<string>();
    transactions.forEach((t) => {
      if (
        t.accountId === id ||
        t.toAccountId === id ||
        (t.linkedLoanId && deletingLoanIds.has(t.linkedLoanId)) ||
        (t.linkedPaymentId && paymentIdsToDelete.has(t.linkedPaymentId))
      ) {
        txIdsToDelete.add(t.id);
      }
    });
    investmentsOnAccount.forEach((inv) => {
      if (inv.linkedTransactionId) txIdsToDelete.add(inv.linkedTransactionId);
      if (inv.linkedSellTransactionId) txIdsToDelete.add(inv.linkedSellTransactionId);
      if (inv.linkedApplyTransactionId) txIdsToDelete.add(inv.linkedApplyTransactionId);
      if (inv.linkedRefundTransactionId) txIdsToDelete.add(inv.linkedRefundTransactionId);
    });

    transactions.forEach((t) => {
      if (txIdsToDelete.has(t.id)) {
        txEffects(t).forEach((delta, accId) => bump(accId, -delta));
      }
    });

    const restoreByLoan = new Map<string, number>();
    paymentsOnAccount.forEach((p) => {
      if (deletingLoanIds.has(p.loanId)) return;
      restoreByLoan.set(p.loanId, (restoreByLoan.get(p.loanId) ?? 0) + p.amount);
    });
    restoreByLoan.forEach((amount, loanId) => {
      const loan = loans.find((l) => l.id === loanId);
      if (!loan) return;
      const restored = Math.min(loan.principalAmount, loan.remainingAmount + amount);
      ops.push((batch) =>
        batch.update(doc(db, 'users', user.uid, 'loans', loanId), {
          remainingAmount: restored,
          isSettled: restored <= 0,
        })
      );
    });

    investments.forEach((inv) => {
      if (inv.accountId === id) return;
      const patch: Partial<Investment> = {};
      if (inv.linkedTransactionId && txIdsToDelete.has(inv.linkedTransactionId)) {
        patch.linkedTransactionId = null;
      }
      if (
        inv.linkedSellTransactionId &&
        txIdsToDelete.has(inv.linkedSellTransactionId)
      ) {
        patch.linkedSellTransactionId = null;
      }
      if (
        inv.linkedApplyTransactionId &&
        txIdsToDelete.has(inv.linkedApplyTransactionId)
      ) {
        patch.linkedApplyTransactionId = null;
      }
      if (
        inv.linkedRefundTransactionId &&
        txIdsToDelete.has(inv.linkedRefundTransactionId)
      ) {
        patch.linkedRefundTransactionId = null;
      }
      if (Object.keys(patch).length > 0) {
        ops.push((batch) =>
          batch.update(doc(db, 'users', user.uid, 'investments', inv.id), patch)
        );
      }
    });

    txIdsToDelete.forEach((txId) =>
      ops.push((batch) => batch.delete(doc(db, 'users', user.uid, 'transactions', txId)))
    );
    loansUsingAccount.forEach((loan) =>
      ops.push((batch) => batch.delete(doc(db, 'users', user.uid, 'loans', loan.id)))
    );
    loanPayments.forEach((payment) => {
      if (deletingLoanIds.has(payment.loanId) || paymentIdsToDelete.has(payment.id)) {
        ops.push((batch) =>
          batch.delete(doc(db, 'users', user.uid, 'loanPayments', payment.id))
        );
      }
    });
    investmentsOnAccount.forEach((investment) =>
      ops.push((batch) =>
        batch.delete(doc(db, 'users', user.uid, 'investments', investment.id))
      )
    );

    balanceDeltas.forEach((delta, accId) => {
      ops.push((batch) =>
        batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
          balance: increment(delta),
        })
      );
    });

    ops.push((batch) => batch.delete(doc(db, 'users', user.uid, 'accounts', id)));
    await commitInChunks(ops);
  },

  addCategory: async (cat) => {
    const { user, categories } = get();
    if (!user) return;
    if (!cat.name?.trim()) throw new Error('Category name is required');
    const id = genId('cat');
    const order = categories.filter((c) => c.type === cat.type).length;
    await setDoc(doc(db, 'users', user.uid, 'categories', id), {
      ...cat,
      name: cat.name.trim(),
      id,
      order,
    });
  },

  updateCategory: async (id, updates) => {
    const { user } = get();
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid, 'categories', id), updates);
  },

  deleteCategory: async (id) => {
    const { user, categories, transactions, budgets } = get();
    if (!user) return;

    const toDelete = new Set<string>();
    const stack = [id];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (toDelete.has(cur)) continue;
      toDelete.add(cur);
      categories
        .filter((c) => c.parentId === cur)
        .forEach((c) => stack.push(c.id));
    }
    const idsToDelete = Array.from(toDelete);

    const ops: Array<(batch: WriteBatch) => void> = [];
    idsToDelete.forEach((cid) =>
      ops.push((batch) =>
        batch.delete(doc(db, 'users', user.uid, 'categories', cid))
      )
    );

    transactions
      .filter((t) => t.categoryId && idsToDelete.includes(t.categoryId))
      .forEach((transaction) =>
        ops.push((batch) =>
          batch.update(doc(db, 'users', user.uid, 'transactions', transaction.id), {
            categoryId: null,
          })
        )
      );

    budgets
      .filter((budget) => budget.categoryId && idsToDelete.includes(budget.categoryId))
      .forEach((budget) =>
        ops.push((batch) =>
          batch.delete(doc(db, 'users', user.uid, 'budgets', budget.id))
        )
      );

    await commitInChunks(ops);
  },

  addBudget: async (budget) => {
    const { user } = get();
    if (!user) return;
    requirePositive(budget.amount, 'Budget amount');
    const id = genId('b');
    await setDoc(doc(db, 'users', user.uid, 'budgets', id), { ...budget, id });
  },

  updateBudget: async (id, updates) => {
    const { user } = get();
    if (!user) return;
    if (typeof updates.amount === 'number') {
      requirePositive(updates.amount, 'Budget amount');
    }
    await updateDoc(doc(db, 'users', user.uid, 'budgets', id), updates);
  },

  deleteBudget: async (id) => {
    const { user } = get();
    if (!user) return;
    await deleteDoc(doc(db, 'users', user.uid, 'budgets', id));
  },

  addLoan: async ({
    personName,
    type,
    principalAmount,
    accountId,
    date,
    dueDate,
    note,
  }) => {
    const { user } = get();
    if (!user) throw new Error('Not authenticated');
    requirePositive(principalAmount, 'Loan amount');
    if (!accountId) throw new Error('Account is required');

    const loanId = genId('loan');
    const txId = genId('t');
    const now = Date.now();

    const loan: Loan = {
      id: loanId,
      personName,
      type,
      principalAmount,
      remainingAmount: principalAmount,
      accountId,
      date,
      dueDate: dueDate ?? null,
      note,
      isSettled: false,
      createdAt: now,
    };

    const tx: Transaction = {
      id: txId,
      type: type === 'lent' ? 'expense' : 'income',
      amount: principalAmount,
      accountId,
      toAccountId: null,
      categoryId: null,
      date,
      note:
        note ||
        (type === 'lent'
          ? `Money lent to ${personName}`
          : `Money borrowed from ${personName}`),
      receiptUrl: null,
      isExcludedFromStats: true,
      isExcludedFromBudget: true,
      createdAt: now,
      linkedLoanId: loanId,
      linkedPaymentId: null,
    };

    const ops: Array<(batch: WriteBatch) => void> = [];
    ops.push((batch) =>
      batch.set(doc(db, 'users', user.uid, 'loans', loanId), loan)
    );
    ops.push((batch) =>
      batch.set(doc(db, 'users', user.uid, 'transactions', txId), tx)
    );
    txEffects(tx).forEach((delta, accId) => {
      ops.push((batch) =>
        batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
          balance: increment(delta),
        })
      );
    });
    await commitInChunks(ops);
  },

  updateLoan: async (id, updates) => {
    const { user, loans, transactions } = get();
    if (!user) return;
    const loan = loans.find((l) => l.id === id);
    if (!loan) return;

    if (typeof updates.principalAmount === 'number') {
      requirePositive(updates.principalAmount, 'Loan amount');
    }

    const initialTx = findInitialLoanTransaction(loan, transactions);
    const patch: Partial<Loan> = { ...updates };
    const txPatch: Partial<Transaction> = {};
    const balanceDeltas = new Map<string, number>();
    const bump = (accId: string, delta: number) => {
      if (delta === 0) return;
      balanceDeltas.set(accId, (balanceDeltas.get(accId) ?? 0) + delta);
    };

    const oldAmount = loan.principalAmount;
    const oldType = loan.type;
    const oldAccount = loan.accountId;
    const oldDate = loan.date;
    const oldPersonName = loan.personName;

    const newAmount =
      typeof updates.principalAmount === 'number'
        ? updates.principalAmount
        : oldAmount;
    const newType = updates.type ?? oldType;
    const newAccount = updates.accountId ?? oldAccount;
    const newDate = typeof updates.date === 'number' ? updates.date : oldDate;
    const newPersonName = updates.personName ?? oldPersonName;

    if (newAmount !== oldAmount) {
      const paid = oldAmount - loan.remainingAmount;
      patch.remainingAmount = Math.max(0, newAmount - paid);
    }

    if (updates.dueDate !== undefined) {
      patch.dueDate = updates.dueDate;
    }

    if (initialTx) {
      const oldSign = oldType === 'lent' ? -1 : 1;
      const newSign = newType === 'lent' ? -1 : 1;
      const oldEffect = oldSign * oldAmount;
      const newEffect = newSign * newAmount;

      if (oldAccount === newAccount) {
        bump(oldAccount, newEffect - oldEffect);
      } else {
        bump(oldAccount, -oldEffect);
        bump(newAccount, newEffect);
      }

      if (newAmount !== oldAmount) txPatch.amount = newAmount;
      if (newType !== oldType) {
        txPatch.type = newType === 'lent' ? 'expense' : 'income';
      }
      if (newAccount !== oldAccount) txPatch.accountId = newAccount;
      if (newDate !== oldDate) txPatch.date = newDate;

      const oldDefault = `Money ${
        oldType === 'lent' ? 'lent to' : 'borrowed from'
      } ${oldPersonName}`;
      if (
        initialTx.note === oldDefault &&
        (newType !== oldType || newPersonName !== oldPersonName)
      ) {
        txPatch.note = `Money ${
          newType === 'lent' ? 'lent to' : 'borrowed from'
        } ${newPersonName}`;
      }
    }

    const finalRemaining = patch.remainingAmount ?? loan.remainingAmount;
    patch.isSettled = finalRemaining <= 0;

    const ops: Array<(batch: WriteBatch) => void> = [];

    if (newType !== oldType) {
      const linkedPayments = transactions.filter(
        (t) => t.linkedLoanId === id && !!t.linkedPaymentId
      );
      for (const payTx of linkedPayments) {
        const oldPaySign = oldType === 'lent' ? 1 : -1;
        const newPaySign = newType === 'lent' ? 1 : -1;
        const delta = (newPaySign - oldPaySign) * payTx.amount;
        bump(payTx.accountId, delta);

        const newPayType: Transaction['type'] =
          newType === 'lent' ? 'income' : 'expense';

        const oldAutoNote =
          oldType === 'lent'
            ? `Repayment from ${oldPersonName}`
            : `Repayment to ${oldPersonName}`;
        const payTxPatch: Partial<Transaction> = { type: newPayType };
        if (payTx.note === oldAutoNote) {
          payTxPatch.note =
            newType === 'lent'
              ? `Repayment from ${newPersonName}`
              : `Repayment to ${newPersonName}`;
        }
        ops.push((batch) =>
          batch.update(
            doc(db, 'users', user.uid, 'transactions', payTx.id),
            payTxPatch
          )
        );
      }
    }

    ops.push((batch) => batch.update(doc(db, 'users', user.uid, 'loans', id), patch));
    if (initialTx && Object.keys(txPatch).length > 0) {
      ops.push((batch) =>
        batch.update(doc(db, 'users', user.uid, 'transactions', initialTx.id), txPatch)
      );
    }
    balanceDeltas.forEach((delta, accId) => {
      ops.push((batch) =>
        batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
          balance: increment(delta),
        })
      );
    });
    await commitInChunks(ops);
  },

  deleteLoan: async (id) => {
    const { user, transactions, loanPayments } = get();
    if (!user) return;

    const ops: Array<(batch: WriteBatch) => void> = [];

    transactions
      .filter((t) => t.linkedLoanId === id)
      .forEach((tx) => {
        ops.push((batch) =>
          batch.delete(doc(db, 'users', user.uid, 'transactions', tx.id))
        );
        txEffects(tx).forEach((delta, accId) => {
          ops.push((batch) =>
            batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
              balance: increment(-delta),
            })
          );
        });
      });

    loanPayments
      .filter((payment) => payment.loanId === id)
      .forEach((payment) =>
        ops.push((batch) =>
          batch.delete(doc(db, 'users', user.uid, 'loanPayments', payment.id))
        )
      );

    ops.push((batch) => batch.delete(doc(db, 'users', user.uid, 'loans', id)));
    await commitInChunks(ops);
  },

  addLoanPayment: async ({ loanId, amount, accountId, date, note }) => {
    const { user, loans } = get();
    if (!user) throw new Error('Not authenticated');
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) throw new Error('Loan not found');

    requirePositive(amount, 'Payment amount');
    if (amount > loan.remainingAmount) {
      throw new Error(
        `Payment exceeds remaining balance (${loan.remainingAmount.toFixed(2)})`
      );
    }
    if (!accountId) throw new Error('Account is required');

    const paymentId = genId('pay');
    const txId = genId('t');
    const now = Date.now();

    const payment: LoanPayment = {
      id: paymentId,
      loanId,
      amount,
      accountId,
      date,
      note,
      createdAt: now,
    };

    const tx: Transaction = {
      id: txId,
      type: loan.type === 'lent' ? 'income' : 'expense',
      amount,
      accountId,
      toAccountId: null,
      categoryId: null,
      date,
      note:
        note ||
        (loan.type === 'lent'
          ? `Repayment from ${loan.personName}`
          : `Repayment to ${loan.personName}`),
      receiptUrl: null,
      isExcludedFromStats: true,
      isExcludedFromBudget: true,
      createdAt: now,
      linkedLoanId: loanId,
      linkedPaymentId: paymentId,
    };

    const newRemaining = Math.max(0, loan.remainingAmount - amount);

    const ops: Array<(batch: WriteBatch) => void> = [];
    ops.push((batch) =>
      batch.set(doc(db, 'users', user.uid, 'loanPayments', paymentId), payment)
    );
    ops.push((batch) =>
      batch.set(doc(db, 'users', user.uid, 'transactions', txId), tx)
    );
    ops.push((batch) =>
      batch.update(doc(db, 'users', user.uid, 'loans', loanId), {
        remainingAmount: newRemaining,
        isSettled: newRemaining <= 0,
      })
    );
    txEffects(tx).forEach((delta, accId) => {
      ops.push((batch) =>
        batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
          balance: increment(delta),
        })
      );
    });
    await commitInChunks(ops);
  },

  deleteLoanPayment: async (id) => {
    const { user, loanPayments, transactions, loans } = get();
    if (!user) return;
    const payment = loanPayments.find((p) => p.id === id);
    if (!payment) return;
    const loan = loans.find((l) => l.id === payment.loanId);
    if (!loan) return;

    let linked = transactions.find((t) => t.linkedPaymentId === id);

    if (!linked) {
      const paymentType: Transaction['type'] =
        loan.type === 'lent' ? 'income' : 'expense';
      const candidates = transactions.filter(
        (t) =>
          t.linkedLoanId === payment.loanId &&
          !t.linkedPaymentId &&
          t.type === paymentType &&
          t.amount === payment.amount &&
          t.date === payment.date
      );
      if (candidates.length === 1) {
        linked = candidates[0];
      } else if (candidates.length > 1) {
        console.warn(
          'Ambiguous legacy payment; skipping transaction deletion.',
          { payment, candidates }
        );
      }
    }

    const ops: Array<(batch: WriteBatch) => void> = [];
    ops.push((batch) =>
      batch.delete(doc(db, 'users', user.uid, 'loanPayments', id))
    );

    if (linked) {
      ops.push((batch) =>
        batch.delete(doc(db, 'users', user.uid, 'transactions', linked.id))
      );
      txEffects(linked).forEach((delta, accId) => {
        ops.push((batch) =>
          batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
            balance: increment(-delta),
          })
        );
      });
    }

    const restored = Math.min(
      loan.principalAmount,
      loan.remainingAmount + payment.amount
    );
    ops.push((batch) =>
      batch.update(doc(db, 'users', user.uid, 'loans', loan.id), {
        remainingAmount: restored,
        isSettled: restored <= 0,
      })
    );

    await commitInChunks(ops);
  },

  addInvestment: async ({
    name,
    symbol,
    type,
    units,
    buyPrice,
    currentPrice,
    accountId,
    date,
    note,
    status,
    listingPrice,
    listingDate,
    appliedAmount,
  }) => {
    const { user } = get();
    if (!user) throw new Error('Not authenticated');

    const normalizedStatus: InvestmentStatus = status ?? 'active';
    const isApplied = normalizedStatus === 'applied';
    const isActive = normalizedStatus === 'active';

    if (!accountId) throw new Error('Account is required');
    if (!name.trim()) throw new Error('Name is required');

    if (isApplied) {
      if (!appliedAmount || appliedAmount <= 0) {
        throw new Error('Applied amount must be positive for an IPO');
      }
    } else if (isActive) {
      requirePositive(units, 'Units');
      requirePositive(buyPrice, 'Buy price');
    } else {
      throw new Error(
        `Cannot create an investment in status "${normalizedStatus}"`
      );
    }

    const invId = genId('inv');
    const txId = isApplied ? genId('apply') : genId('t');
    const now = Date.now();

    const blocked = isApplied ? appliedAmount ?? 0 : 0;
    const invested = isActive ? units * buyPrice : 0;
    const effectiveCurrentPrice = isActive
      ? pickPositive(currentPrice, buyPrice) ?? buyPrice
      : 0;
    const currentValue = isActive ? units * effectiveCurrentPrice : 0;

    const hasBuyTx = isActive && invested > 0;

    const investment: Investment = {
      id: invId,
      name: name.trim(),
      symbol,
      type,
      units: isActive ? units : 0,
      buyPrice: isActive ? buyPrice : 0,
      currentPrice: effectiveCurrentPrice,
      investedAmount: invested,
      currentValue,
      accountId,
      date,
      soldDate: null,
      soldPrice: null,
      status: normalizedStatus,
      listingPrice: listingPrice ?? null,
      listingDate: listingDate ?? null,
      appliedAmount: blocked,
      note,
      createdAt: now,
      linkedTransactionId: hasBuyTx ? txId : null,
      linkedSellTransactionId: null,
      linkedApplyTransactionId: isApplied ? txId : null,
      linkedRefundTransactionId: null,
    };

    const ops: Array<(batch: WriteBatch) => void> = [];
    ops.push((batch) =>
      batch.set(doc(db, 'users', user.uid, 'investments', invId), investment)
    );

    if (isApplied && blocked > 0) {
      const tx: Transaction = {
        id: txId,
        type: 'expense',
        amount: blocked,
        accountId,
        toAccountId: null,
        categoryId: null,
        date,
        note: `IPO Applied: ${name}${symbol ? ` (${symbol})` : ''} (Blocked)`,
        receiptUrl: null,
        isExcludedFromStats: true,
        isExcludedFromBudget: true,
        createdAt: now,
        linkedLoanId: null,
        linkedPaymentId: null,
      };
      ops.push((batch) =>
        batch.set(doc(db, 'users', user.uid, 'transactions', txId), tx)
      );
      txEffects(tx).forEach((delta, accId) =>
        ops.push((batch) =>
          batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
            balance: increment(delta),
          })
        )
      );
    } else if (hasBuyTx) {
      const tx: Transaction = {
        id: txId,
        type: 'expense',
        amount: invested,
        accountId,
        toAccountId: null,
        categoryId: null,
        date,
        note: `Investment: ${name}${symbol ? ` (${symbol})` : ''}`,
        receiptUrl: null,
        isExcludedFromStats: true,
        isExcludedFromBudget: true,
        createdAt: now,
        linkedLoanId: null,
        linkedPaymentId: null,
      };
      ops.push((batch) =>
        batch.set(doc(db, 'users', user.uid, 'transactions', txId), tx)
      );
      txEffects(tx).forEach((delta, accId) =>
        ops.push((batch) =>
          batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
            balance: increment(delta),
          })
        )
      );
    }
    await commitInChunks(ops);
  },

  updateInvestment: async (id, updates) => {
    const { user, investments, transactions } = get();
    if (!user) return;
    const inv = investments.find((i) => i.id === id);
    if (!inv) return;

    const sanitized: Partial<Investment> = {};
    for (const key of Object.keys(updates) as (keyof Investment)[]) {
      if (INVESTMENT_USER_FIELDS.has(key)) {
        (sanitized as Record<string, unknown>)[key] = updates[key];
      }
    }

    const newStatus = sanitized.status ?? inv.status;

    if (newStatus !== inv.status) {
      const allowed = VALID_INVESTMENT_TRANSITIONS[inv.status];
      if (!allowed.includes(newStatus)) {
        throw new Error(
          `Cannot transition investment from "${inv.status}" to "${newStatus}"`
        );
      }
    }

    const wasApplied = inv.status === 'applied';
    const isBecomingNotAllotted = newStatus === 'not_allotted' && wasApplied;
    const isBecomingAllotted = newStatus === 'active' && wasApplied;
    const wasActive = inv.status === 'active';
    const isBecomingSold = newStatus === 'sold' && wasActive;
    const isEditingActive = wasActive && newStatus === 'active';
    const isEditingSold = inv.status === 'sold' && newStatus === 'sold';
    const isEditingApplied = wasApplied && newStatus === 'applied';

    if (
      inv.status === 'sold' ||
      inv.status === 'not_allotted' ||
      isBecomingSold
    ) {
      for (const field of INVESTMENT_BUY_SIDE_FIELDS) {
        const newVal = sanitized[field];
        const oldVal = inv[field];
        if (newVal !== undefined && newVal !== oldVal) {
          throw new Error(
            'Buy-side fields (name, symbol, type, units, buy price, account, purchase date) cannot be edited on a sold or not-allotted position. Only sale price, sale date, and note are editable.'
          );
        }
      }
    }

    if (isEditingApplied) {
      if (sanitized.units !== undefined && sanitized.units !== 0) {
        throw new Error(
          'Units cannot be set on an applied IPO. Allot it first.'
        );
      }
      if (sanitized.buyPrice !== undefined && sanitized.buyPrice !== 0) {
        throw new Error(
          'Buy price cannot be set on an applied IPO. Allot it first.'
        );
      }
    }

    const newUnits = sanitized.units ?? inv.units;
    const newBuyPrice = sanitized.buyPrice ?? inv.buyPrice;
    const newAccountId = sanitized.accountId ?? inv.accountId;
    const newDate = sanitized.date ?? inv.date;
    const newInvestedAmount = newUnits * newBuyPrice;

    if (
      (isBecomingAllotted || isEditingActive) &&
      (newUnits <= 0 || newBuyPrice <= 0)
    ) {
      throw new Error(
        'Units and buy price must be positive for an active investment'
      );
    }
    if (isBecomingSold) {
      const finalSoldPrice =
        sanitized.soldPrice ?? inv.soldPrice ?? inv.currentPrice;
      if (typeof finalSoldPrice !== 'number' || finalSoldPrice <= 0) {
        throw new Error(
          'A positive sale price is required to mark this investment as sold'
        );
      }
    }
    if (isEditingApplied) {
      const newApplied = sanitized.appliedAmount ?? inv.appliedAmount;
      if (newApplied <= 0) {
        throw new Error('Applied amount must be positive');
      }
    }

    const patch: Partial<Investment> = { ...sanitized };
    const ops: Array<(batch: WriteBatch) => void> = [];
    const bump = (accId: string, delta: number) => {
      if (delta === 0) return;
      ops.push((batch) =>
        batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
          balance: increment(delta),
        })
      );
    };

    if (isBecomingNotAllotted && inv.appliedAmount) {
      const refundId = genId('t');
      const refundTx: Transaction = {
        id: refundId,
        type: 'income',
        amount: inv.appliedAmount,
        accountId: inv.accountId,
        toAccountId: null,
        categoryId: null,
        date: Date.now(),
        note: `IPO Refund: ${inv.name} (Not Allotted)`,
        receiptUrl: null,
        isExcludedFromStats: true,
        isExcludedFromBudget: true,
        createdAt: Date.now(),
        linkedLoanId: null,
        linkedPaymentId: null,
      };
      ops.push((batch) =>
        batch.set(doc(db, 'users', user.uid, 'transactions', refundId), refundTx)
      );
      bump(inv.accountId, inv.appliedAmount);
      patch.appliedAmount = 0;
      patch.units = 0;
      patch.buyPrice = 0;
      patch.investedAmount = 0;
      patch.currentValue = 0;
      patch.linkedRefundTransactionId = refundId;
    } else if (isBecomingAllotted) {
      if (inv.appliedAmount && inv.appliedAmount > 0) {
        const refundId = genId('t');
        const refundTx: Transaction = {
          id: refundId,
          type: 'income',
          amount: inv.appliedAmount,
          accountId: inv.accountId,
          toAccountId: null,
          categoryId: null,
          date: newDate,
          note: `IPO Block Released: ${inv.name}`,
          receiptUrl: null,
          isExcludedFromStats: true,
          isExcludedFromBudget: true,
          createdAt: Date.now(),
          linkedLoanId: null,
          linkedPaymentId: null,
        };
        ops.push((batch) =>
          batch.set(
            doc(db, 'users', user.uid, 'transactions', refundId),
            refundTx
          )
        );
        bump(inv.accountId, inv.appliedAmount);
        patch.linkedRefundTransactionId = refundId;
      }

      if (newInvestedAmount > 0) {
        const buyId = genId('t');
        const buyTx: Transaction = {
          id: buyId,
          type: 'expense',
          amount: newInvestedAmount,
          accountId: newAccountId,
          toAccountId: null,
          categoryId: null,
          date: newDate,
          note: `Investment: ${inv.name}${
            inv.symbol ? ` (${inv.symbol})` : ''
          } (Allotted)`,
          receiptUrl: null,
          isExcludedFromStats: true,
          isExcludedFromBudget: true,
          createdAt: Date.now(),
          linkedLoanId: null,
          linkedPaymentId: null,
        };
        ops.push((batch) =>
          batch.set(doc(db, 'users', user.uid, 'transactions', buyId), buyTx)
        );
        bump(newAccountId, -newInvestedAmount);
        patch.linkedTransactionId = buyId;
        patch.investedAmount = newInvestedAmount;
        const newCurrentPrice =
          pickPositive(sanitized.currentPrice, inv.currentPrice, newBuyPrice) ??
          newBuyPrice;
        patch.currentPrice = newCurrentPrice;
        patch.currentValue = newUnits * newCurrentPrice;
      }
      patch.appliedAmount = 0;
      patch.units = newUnits;
      patch.buyPrice = newBuyPrice;
    } else if (isBecomingSold) {
      const finalSoldPrice =
        pickPositive(sanitized.soldPrice, inv.soldPrice, inv.currentPrice) ?? 0;
      const finalSoldDate = sanitized.soldDate ?? Date.now();
      const proceeds = finalSoldPrice * newUnits;
      const txId = genId('t');
      const tx: Transaction = {
        id: txId,
        type: 'income',
        amount: proceeds,
        accountId: newAccountId,
        toAccountId: null,
        categoryId: null,
        date: finalSoldDate,
        note: `Sold: ${inv.name}${inv.symbol ? ` (${inv.symbol})` : ''}`,
        receiptUrl: null,
        isExcludedFromStats: true,
        isExcludedFromBudget: true,
        createdAt: Date.now(),
        linkedLoanId: null,
        linkedPaymentId: null,
      };
      ops.push((batch) =>
        batch.set(doc(db, 'users', user.uid, 'transactions', txId), tx)
      );
      bump(newAccountId, proceeds);

      patch.soldPrice = finalSoldPrice;
      patch.soldDate = finalSoldDate;
      patch.status = 'sold';
      patch.currentPrice = finalSoldPrice;
      patch.currentValue = 0;
      patch.investedAmount = newInvestedAmount;
      patch.linkedSellTransactionId = txId;
    } else if (isEditingActive) {
      patch.investedAmount = newInvestedAmount;
      const newCurrentPrice =
        pickPositive(sanitized.currentPrice, inv.currentPrice, newBuyPrice) ??
        newBuyPrice;
      patch.currentPrice = newCurrentPrice;
      patch.currentValue = newUnits * newCurrentPrice;

      const buyTx = inv.linkedTransactionId
        ? transactions.find((t) => t.id === inv.linkedTransactionId)
        : null;
      if (buyTx) {
        const accountChanged = newAccountId !== buyTx.accountId;
        const amountChanged = newInvestedAmount !== buyTx.amount;

        if (accountChanged) {
          bump(buyTx.accountId, buyTx.amount);
          bump(newAccountId, -newInvestedAmount);
        } else if (amountChanged) {
          bump(newAccountId, buyTx.amount - newInvestedAmount);
        }

        const txPatch: Partial<Transaction> = {};
        if (amountChanged) txPatch.amount = newInvestedAmount;
        if (accountChanged) txPatch.accountId = newAccountId;
        if (newDate !== buyTx.date) txPatch.date = newDate;

        const newName = sanitized.name ?? inv.name;
        const newSymbol = sanitized.symbol ?? inv.symbol;
        const oldNote = `Investment: ${inv.name}${
          inv.symbol ? ` (${inv.symbol})` : ''
        }`;
        const newNote = `Investment: ${newName}${
          newSymbol ? ` (${newSymbol})` : ''
        }`;
        if (buyTx.note === oldNote && newNote !== buyTx.note) {
          txPatch.note = newNote;
        }

        if (Object.keys(txPatch).length > 0) {
          ops.push((batch) =>
            batch.update(
              doc(db, 'users', user.uid, 'transactions', buyTx.id),
              txPatch
            )
          );
        }
      }
    } else if (isEditingSold) {
      patch.investedAmount = inv.investedAmount;
      const sp =
        pickPositive(sanitized.soldPrice, inv.soldPrice, inv.currentPrice) ?? 0;
      const sd = sanitized.soldDate ?? inv.soldDate;

      if (sp > 0) {
        patch.soldPrice = sp;
        patch.soldDate = sd;
        patch.currentPrice = sp;
        patch.currentValue = 0;
      }

      const sellTx = inv.linkedSellTransactionId
        ? transactions.find((t) => t.id === inv.linkedSellTransactionId)
        : null;
      if (sellTx && sp > 0) {
        const newProceeds = sp * newUnits;
        const amountChanged = newProceeds !== sellTx.amount;
        const dateChanged = sd !== null && sd !== sellTx.date;

        if (amountChanged) {
          bump(sellTx.accountId, newProceeds - sellTx.amount);
        }

        const txPatch: Partial<Transaction> = {};
        if (amountChanged) txPatch.amount = newProceeds;
        if (dateChanged && sd !== null) txPatch.date = sd;

        if (Object.keys(txPatch).length > 0) {
          ops.push((batch) =>
            batch.update(
              doc(db, 'users', user.uid, 'transactions', sellTx.id),
              txPatch
            )
          );
        }
      }
    } else if (isEditingApplied) {
      const newApplied = sanitized.appliedAmount ?? inv.appliedAmount;
      patch.appliedAmount = newApplied;

      const applyTx = inv.linkedApplyTransactionId
        ? transactions.find((t) => t.id === inv.linkedApplyTransactionId)
        : null;
      if (applyTx) {
        const accountChanged = newAccountId !== applyTx.accountId;
        const amountChanged = newApplied !== applyTx.amount;

        if (accountChanged) {
          bump(applyTx.accountId, applyTx.amount);
          bump(newAccountId, -newApplied);
        } else if (amountChanged) {
          bump(newAccountId, applyTx.amount - newApplied);
        }

        const txPatch: Partial<Transaction> = {};
        if (amountChanged) txPatch.amount = newApplied;
        if (accountChanged) txPatch.accountId = newAccountId;
        if (newDate !== applyTx.date) txPatch.date = newDate;

        if (Object.keys(txPatch).length > 0) {
          ops.push((batch) =>
            batch.update(
              doc(db, 'users', user.uid, 'transactions', applyTx.id),
              txPatch
            )
          );
        }
      }
    }

    ops.push((batch) =>
      batch.update(doc(db, 'users', user.uid, 'investments', id), patch)
    );
    await commitInChunks(ops);
  },

  updateInvestmentPrice: async (id, price) => {
    const { user, investments } = get();
    if (!user) throw new Error('Not authenticated');
    const inv = investments.find((i) => i.id === id);
    if (!inv) throw new Error('Investment not found');
    if (inv.status !== 'active') {
      throw new Error(
        `Cannot update price on an investment in status "${inv.status}"`
      );
    }
    requirePositive(price, 'Price');
    await updateDoc(doc(db, 'users', user.uid, 'investments', id), {
      currentPrice: price,
      currentValue: inv.units * price,
    });
  },

  sellInvestment: async (id, soldPrice, soldDate) => {
    const { user, investments } = get();
    if (!user) throw new Error('Not authenticated');
    const inv = investments.find((i) => i.id === id);
    if (!inv) throw new Error('Investment not found');
    if (inv.status !== 'active') {
      throw new Error(`Cannot sell an investment in status "${inv.status}"`);
    }
    requirePositive(soldPrice, 'Sell price');

    const proceeds = soldPrice * inv.units;
    const txId = genId('t');
    const now = Date.now();

    const tx: Transaction = {
      id: txId,
      type: 'income',
      amount: proceeds,
      accountId: inv.accountId,
      toAccountId: null,
      categoryId: null,
      date: soldDate,
      note: `Sold: ${inv.name}${inv.symbol ? ` (${inv.symbol})` : ''}`,
      receiptUrl: null,
      isExcludedFromStats: true,
      isExcludedFromBudget: true,
      createdAt: now,
      linkedLoanId: null,
      linkedPaymentId: null,
    };

    const ops: Array<(batch: WriteBatch) => void> = [];
    ops.push((batch) =>
      batch.update(doc(db, 'users', user.uid, 'investments', id), {
        status: 'sold',
        soldPrice,
        soldDate,
        currentPrice: soldPrice,
        currentValue: 0,
        linkedSellTransactionId: txId,
      })
    );
    ops.push((batch) =>
      batch.set(doc(db, 'users', user.uid, 'transactions', txId), tx)
    );
    txEffects(tx).forEach((delta, accId) =>
      ops.push((batch) =>
        batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
          balance: increment(delta),
        })
      )
    );
    await commitInChunks(ops);
  },

  deleteInvestment: async (id) => {
    const { user, investments, transactions } = get();
    if (!user) return;
    const inv = investments.find((i) => i.id === id);
    if (!inv) return;

    const ops: Array<(batch: WriteBatch) => void> = [];
    const reverseTx = (txId?: string | null) => {
      if (!txId) return;
      const tx = transactions.find((t) => t.id === txId);
      if (!tx) return;
      ops.push((batch) =>
        batch.delete(doc(db, 'users', user.uid, 'transactions', tx.id))
      );
      txEffects(tx).forEach((delta, accId) =>
        ops.push((batch) =>
          batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
            balance: increment(-delta),
          })
        )
      );
    };
    reverseTx(inv.linkedTransactionId);
    reverseTx(inv.linkedSellTransactionId);
    reverseTx(inv.linkedApplyTransactionId);
    reverseTx(inv.linkedRefundTransactionId);
    ops.push((batch) =>
      batch.delete(doc(db, 'users', user.uid, 'investments', id))
    );
    await commitInChunks(ops);
  },

  updatePreferences: async (updates) => {
    const { user } = get();
    if (!user) return;
    try {
      const patch: Partial<Preferences> = { ...updates };
      if (updates.currency) {
        patch.currencySymbol = getCurrencySymbol(updates.currency);
      }
      await setDoc(
        doc(db, 'users', user.uid, 'profile', 'preferences'),
        patch,
        { merge: true }
      );
    } catch (err) {
      console.error('Failed to save preferences', err);
      toast.error('Failed to save preference');
    }
  },

  restoreDefaults: async () => {
    const { user, categories, accounts } = get();
    if (!user) return;
    const prefRef = doc(db, 'users', user.uid, 'profile', 'preferences');
    const prefSnap = await getDoc(prefRef);
    const existingCatIds = new Set(categories.map((c) => c.id));
    const existingAccIds = new Set(accounts.map((a) => a.id));
    const ops: Array<(batch: WriteBatch) => void> = [];
    SEED_CATEGORIES.forEach((c) => {
      if (!existingCatIds.has(c.id)) {
        ops.push((batch) =>
          batch.set(doc(db, 'users', user.uid, 'categories', c.id), c, {
            merge: true,
          })
        );
      }
    });
    SEED_ACCOUNTS.forEach((a) => {
      if (!existingAccIds.has(a.id)) {
        ops.push((batch) =>
          batch.set(
            doc(db, 'users', user.uid, 'accounts', a.id),
            { ...a, balance: a.initialBalance, createdAt: Date.now() },
            { merge: true }
          )
        );
      }
    });
    if (!prefSnap.exists()) {
      ops.push((batch) => batch.set(prefRef, DEFAULT_PREFERENCES));
    }
    await commitInChunks(ops);
  },

  resetToSampleData: async () => {
    const {
      user,
      accounts,
      categories,
      transactions,
      budgets,
      loans,
      loanPayments,
      investments,
    } = get();
    if (!user) return;

    const wipeOps: Array<(batch: WriteBatch) => void> = [];
    accounts.forEach((account) =>
      wipeOps.push((batch) =>
        batch.delete(doc(db, 'users', user.uid, 'accounts', account.id))
      )
    );
    categories.forEach((category) =>
      wipeOps.push((batch) =>
        batch.delete(doc(db, 'users', user.uid, 'categories', category.id))
      )
    );
    transactions.forEach((transaction) =>
      wipeOps.push((batch) =>
        batch.delete(doc(db, 'users', user.uid, 'transactions', transaction.id))
      )
    );
    budgets.forEach((budget) =>
      wipeOps.push((batch) =>
        batch.delete(doc(db, 'users', user.uid, 'budgets', budget.id))
      )
    );
    loans.forEach((loan) =>
      wipeOps.push((batch) =>
        batch.delete(doc(db, 'users', user.uid, 'loans', loan.id))
      )
    );
    loanPayments.forEach((payment) =>
      wipeOps.push((batch) =>
        batch.delete(doc(db, 'users', user.uid, 'loanPayments', payment.id))
      )
    );
    investments.forEach((investment) =>
      wipeOps.push((batch) =>
        batch.delete(doc(db, 'users', user.uid, 'investments', investment.id))
      )
    );
    await commitInChunks(wipeOps);

    const finalBalances = new Map<string, number>();
    SEED_ACCOUNTS.forEach((a) => finalBalances.set(a.id, a.initialBalance));
    SEED_TRANSACTIONS.forEach((t) => {
      txEffects(t).forEach((delta, accId) => {
        finalBalances.set(accId, (finalBalances.get(accId) ?? 0) + delta);
      });
    });

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, '0')}`;

    const seedOps: Array<(batch: WriteBatch) => void> = [];
    SEED_CATEGORIES.forEach((category) =>
      seedOps.push((batch) =>
        batch.set(doc(db, 'users', user.uid, 'categories', category.id), category)
      )
    );
    SEED_ACCOUNTS.forEach((account) =>
      seedOps.push((batch) =>
        batch.set(doc(db, 'users', user.uid, 'accounts', account.id), {
          ...account,
          balance: finalBalances.get(account.id) ?? account.initialBalance,
          createdAt: Date.now(),
        })
      )
    );
    SEED_TRANSACTIONS.forEach((transaction) =>
      seedOps.push((batch) =>
        batch.set(doc(db, 'users', user.uid, 'transactions', transaction.id), {
          ...transaction,
          createdAt: Date.now(),
        })
      )
    );
    SEED_BUDGETS.forEach((seedBudget) =>
      seedOps.push((batch) =>
        batch.set(doc(db, 'users', user.uid, 'budgets', seedBudget.id), {
          ...seedBudget,
          monthYear: currentMonthKey,
        })
      )
    );
    seedOps.push((batch) =>
      batch.set(
        doc(db, 'users', user.uid, 'profile', 'preferences'),
        DEFAULT_PREFERENCES
      )
    );
    await commitInChunks(seedOps);
  },

  clearCloudData: async () => {
    const {
      user,
      accounts,
      categories,
      transactions,
      budgets,
      loans,
      loanPayments,
      investments,
    } = get();
    if (!user) return;
    const ops: Array<(batch: WriteBatch) => void> = [];
    accounts.forEach((account) =>
      ops.push((batch) =>
        batch.delete(doc(db, 'users', user.uid, 'accounts', account.id))
      )
    );
    categories.forEach((category) =>
      ops.push((batch) =>
        batch.delete(doc(db, 'users', user.uid, 'categories', category.id))
      )
    );
    transactions.forEach((transaction) =>
      ops.push((batch) =>
        batch.delete(doc(db, 'users', user.uid, 'transactions', transaction.id))
      )
    );
    budgets.forEach((budget) =>
      ops.push((batch) =>
        batch.delete(doc(db, 'users', user.uid, 'budgets', budget.id))
      )
    );
    loans.forEach((loan) =>
      ops.push((batch) =>
        batch.delete(doc(db, 'users', user.uid, 'loans', loan.id))
      )
    );
    loanPayments.forEach((payment) =>
      ops.push((batch) =>
        batch.delete(doc(db, 'users', user.uid, 'loanPayments', payment.id))
      )
    );
    investments.forEach((investment) =>
      ops.push((batch) =>
        batch.delete(doc(db, 'users', user.uid, 'investments', investment.id))
      )
    );
    ops.push((batch) =>
      batch.set(
        doc(db, 'users', user.uid, 'profile', 'preferences'),
        DEFAULT_PREFERENCES
      )
    );
    await commitInChunks(ops);
  },
}));