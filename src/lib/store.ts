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

  setUser: (user: AuthUser | null) => void;
  initUserData: (uid: string) => Promise<void>;
  clearLocalState: () => void;
  toggleHideBalances: () => void;

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

const VALID_INVESTMENT_TRANSITIONS: Record<InvestmentStatus, InvestmentStatus[]> = {
  applied: ['active', 'not_allotted'],
  active: ['sold'],
  sold: [],
  not_allotted: [],
};

export const useStore = create<StoreState>((set, get) => ({
  user: null,
  isLoading: true,
  hideBalances: true, // Set to true by default as requested
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
  loans: [],
  loanPayments: [],
  investments: [],
  preferences: DEFAULT_PREFERENCES,

  setUser: (user) => {
    set({ user });
    if (!user) {
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
      isLoading: false,
    });
  },

  toggleHideBalances: () => set((state) => ({ hideBalances: !state.hideBalances })),

  initUserData: async (uid: string) => {
    clearUnsubs();
    set({ isLoading: true });

    const prefRef = doc(db, 'users', uid, 'profile', 'preferences');

    try {
      const prefSnap = await getDoc(prefRef);
      if (!prefSnap.exists()) {
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
      }
    } catch (err) {
      console.error('Failed to seed defaults for new user', err);
      toast.error(
        'Could not initialize your workspace. Check your connection and try again.'
      );
    }

    const READY_TARGET = 8;
    const readySet = new Set<string>();
    const markReady = (key: string) => {
      readySet.add(key);
      if (readySet.size >= READY_TARGET && get().isLoading) {
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

    setTimeout(() => {
      if (get().isLoading) set({ isLoading: false });
    }, 6000);
  },

  addTransaction: async (tx) => {
    const { user, categories } = get();
    if (!user) throw new Error('Not authenticated');

    validateTxShape(tx, categories);

    const id = genId('t');
    const newTx: Transaction = { ...tx, id, createdAt: Date.now() };

    const batch = writeBatch(db);
    batch.set(doc(db, 'users', user.uid, 'transactions', id), newTx);

    txEffects(newTx).forEach((delta, accId) => {
      batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
        balance: increment(delta),
      });
    });

    await batch.commit();
  },

  updateTransaction: async (id, updates) => {
    const { user, transactions, categories } = get();
    if (!user) return;
    const oldTx = transactions.find((t) => t.id === id);
    if (!oldTx) return;

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

    const batch = writeBatch(db);
    batch.update(doc(db, 'users', user.uid, 'transactions', id), patch);
    net.forEach((delta, accId) => {
      if (delta !== 0) {
        batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
          balance: increment(delta),
        });
      }
    });

    await batch.commit();
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

    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', user.uid, 'transactions', id));

    txEffects(tx).forEach((delta, accId) => {
      batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
        balance: increment(-delta),
      });
    });

    await batch.commit();
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

    const batch = writeBatch(db);
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

    paymentsOnAccount.forEach((p) => {
      if (deletingLoanIds.has(p.loanId)) return;
      const loan = loans.find((l) => l.id === p.loanId);
      if (!loan) return;
      const restored = Math.min(
        loan.principalAmount,
        loan.remainingAmount + p.amount
      );
      batch.update(doc(db, 'users', user.uid, 'loans', loan.id), {
        remainingAmount: restored,
        isSettled: restored <= 0,
      });
    });

    txIdsToDelete.forEach((txId) =>
      batch.delete(doc(db, 'users', user.uid, 'transactions', txId))
    );
    loansUsingAccount.forEach((l) =>
      batch.delete(doc(db, 'users', user.uid, 'loans', l.id))
    );
    loanPayments.forEach((p) => {
      if (deletingLoanIds.has(p.loanId) || paymentIdsToDelete.has(p.id)) {
        batch.delete(doc(db, 'users', user.uid, 'loanPayments', p.id));
      }
    });
    investmentsOnAccount.forEach((inv) =>
      batch.delete(doc(db, 'users', user.uid, 'investments', inv.id))
    );

    balanceDeltas.forEach((delta, accId) => {
      batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
        balance: increment(delta),
      });
    });

    batch.delete(doc(db, 'users', user.uid, 'accounts', id));
    await batch.commit();
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

    const batch = writeBatch(db);

    idsToDelete.forEach((cid) =>
      batch.delete(doc(db, 'users', user.uid, 'categories', cid))
    );

    transactions
      .filter((t) => t.categoryId && idsToDelete.includes(t.categoryId))
      .forEach((t) =>
        batch.update(doc(db, 'users', user.uid, 'transactions', t.id), {
          categoryId: null,
        })
      );

    budgets
      .filter((b) => b.categoryId && idsToDelete.includes(b.categoryId))
      .forEach((b) => batch.delete(doc(db, 'users', user.uid, 'budgets', b.id)));

    await batch.commit();
  },

  addBudget: async (b) => {
    const { user } = get();
    if (!user) return;
    requirePositive(b.amount, 'Budget amount');
    const id = genId('b');
    await setDoc(doc(db, 'users', user.uid, 'budgets', id), { ...b, id });
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

    const batch = writeBatch(db);
    batch.set(doc(db, 'users', user.uid, 'loans', loanId), loan);
    batch.set(doc(db, 'users', user.uid, 'transactions', txId), tx);
    txEffects(tx).forEach((delta, accId) => {
      batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
        balance: increment(delta),
      });
    });
    await batch.commit();
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

    const batch = writeBatch(db);

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
        batch.update(
          doc(db, 'users', user.uid, 'transactions', payTx.id),
          payTxPatch
        );
      }
    }

    batch.update(doc(db, 'users', user.uid, 'loans', id), patch);
    if (initialTx && Object.keys(txPatch).length > 0) {
      batch.update(
        doc(db, 'users', user.uid, 'transactions', initialTx.id),
        txPatch
      );
    }
    balanceDeltas.forEach((delta, accId) => {
      batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
        balance: increment(delta),
      });
    });
    await batch.commit();
  },

  deleteLoan: async (id) => {
    const { user, transactions, loanPayments } = get();
    if (!user) return;

    const batch = writeBatch(db);

    transactions
      .filter((t) => t.linkedLoanId === id)
      .forEach((t) => {
        batch.delete(doc(db, 'users', user.uid, 'transactions', t.id));
        txEffects(t).forEach((delta, accId) => {
          batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
            balance: increment(-delta),
          });
        });
      });

    loanPayments
      .filter((p) => p.loanId === id)
      .forEach((p) =>
        batch.delete(doc(db, 'users', user.uid, 'loanPayments', p.id))
      );

    batch.delete(doc(db, 'users', user.uid, 'loans', id));
    await batch.commit();
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

    const batch = writeBatch(db);
    batch.set(doc(db, 'users', user.uid, 'loanPayments', paymentId), payment);
    batch.set(doc(db, 'users', user.uid, 'transactions', txId), tx);
    batch.update(doc(db, 'users', user.uid, 'loans', loanId), {
      remainingAmount: newRemaining,
      isSettled: newRemaining <= 0,
    });
    txEffects(tx).forEach((delta, accId) => {
      batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
        balance: increment(delta),
      });
    });
    await batch.commit();
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
      const candidates = transactions.filter(
        (t) =>
          t.linkedLoanId === payment.loanId &&
          !t.linkedPaymentId &&
          t.amount === payment.amount &&
          t.date === payment.date &&
          (t.type === 'income' || t.type === 'expense')
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

    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', user.uid, 'loanPayments', id));

    if (linked) {
      batch.delete(doc(db, 'users', user.uid, 'transactions', linked.id));
      txEffects(linked).forEach((delta, accId) => {
        batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
          balance: increment(-delta),
        });
      });
    }

    const restored = Math.min(
      loan.principalAmount,
      loan.remainingAmount + payment.amount
    );
    batch.update(doc(db, 'users', user.uid, 'loans', loan.id), {
      remainingAmount: restored,
      isSettled: restored <= 0,
    });

    await batch.commit();
  },

  addInvestment: async ({
    name, symbol, type, units, buyPrice, currentPrice, accountId, date, note,
    status, listingPrice, listingDate, appliedAmount,
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

    const batch = writeBatch(db);
    batch.set(doc(db, 'users', user.uid, 'investments', invId), investment);

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
      batch.set(doc(db, 'users', user.uid, 'transactions', txId), tx);
      txEffects(tx).forEach((delta, accId) =>
        batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
          balance: increment(delta),
        })
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
      batch.set(doc(db, 'users', user.uid, 'transactions', txId), tx);
      txEffects(tx).forEach((delta, accId) =>
        batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
          balance: increment(delta),
        })
      );
    }
    await batch.commit();
  },

  updateInvestment: async (id, updates) => {
    const { user, investments, transactions } = get();
    if (!user) return;
    const inv = investments.find((i) => i.id === id);
    if (!inv) return;

    const newStatus = updates.status ?? inv.status;

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

    if (isBecomingSold) {
      const finalSoldPrice =
        updates.soldPrice ?? inv.soldPrice ?? inv.currentPrice;
      if (typeof finalSoldPrice !== 'number' || finalSoldPrice <= 0) {
        throw new Error(
          'A positive sale price is required to mark this investment as sold'
        );
      }
    }

    const newUnits = updates.units ?? inv.units;
    const newBuyPrice = updates.buyPrice ?? inv.buyPrice;
    const newAccountId = updates.accountId ?? inv.accountId;
    const newDate = updates.date ?? inv.date;
    const newInvestedAmount = newUnits * newBuyPrice;

    if (isBecomingAllotted && (newUnits <= 0 || newBuyPrice <= 0)) {
      throw new Error(
        'Units and buy price must be positive to allot the investment'
      );
    }

    const patch: Partial<Investment> = { ...updates };

    if (isBecomingAllotted || (wasActive && newStatus === 'active')) {
      patch.investedAmount = newInvestedAmount;
      const newCurrentPrice =
        pickPositive(updates.currentPrice, inv.currentPrice, newBuyPrice) ??
        newBuyPrice;
      patch.currentValue = newUnits * newCurrentPrice;
    } else if (isBecomingSold) {
      const finalSoldPrice =
        pickPositive(updates.soldPrice, inv.soldPrice, inv.currentPrice) ?? 0;
      patch.soldPrice = finalSoldPrice;
      patch.soldDate = updates.soldDate ?? Date.now();
      patch.status = 'sold';
      patch.currentValue = newUnits * finalSoldPrice;
      patch.currentPrice = finalSoldPrice;
    }

    const batch = writeBatch(db);

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
      batch.set(doc(db, 'users', user.uid, 'transactions', refundId), refundTx);
      txEffects(refundTx).forEach((delta, accId) =>
        batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
          balance: increment(delta),
        })
      );

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
        batch.set(
          doc(db, 'users', user.uid, 'transactions', refundId),
          refundTx
        );
        txEffects(refundTx).forEach((delta, accId) =>
          batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
            balance: increment(delta),
          })
        );
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
          note: `Investment: ${inv.name}${inv.symbol ? ` (${inv.symbol})` : ''} (Allotted)`,
          receiptUrl: null,
          isExcludedFromStats: true,
          isExcludedFromBudget: true,
          createdAt: Date.now(),
          linkedLoanId: null,
          linkedPaymentId: null,
        };
        batch.set(doc(db, 'users', user.uid, 'transactions', buyId), buyTx);
        txEffects(buyTx).forEach((delta, accId) =>
          batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
            balance: increment(delta),
          })
        );
        patch.linkedTransactionId = buyId;
      }
      patch.appliedAmount = 0;
    } else if (wasActive && newStatus === 'active') {
      const buyTx = inv.linkedTransactionId
        ? transactions.find((t) => t.id === inv.linkedTransactionId)
        : null;
      if (buyTx) {
        const accountChanged = newAccountId !== buyTx.accountId;
        const amountChanged = newInvestedAmount !== buyTx.amount;
        if (accountChanged) {
          batch.update(doc(db, 'users', user.uid, 'accounts', buyTx.accountId), {
            balance: increment(buyTx.amount),
          });
          batch.update(doc(db, 'users', user.uid, 'accounts', newAccountId), {
            balance: increment(-newInvestedAmount),
          });
        } else if (amountChanged) {
          batch.update(doc(db, 'users', user.uid, 'accounts', newAccountId), {
            balance: increment(buyTx.amount - newInvestedAmount),
          });
        }
        const txPatch: Partial<Transaction> = {};
        if (amountChanged) txPatch.amount = newInvestedAmount;
        if (accountChanged) txPatch.accountId = newAccountId;
        if (newDate !== buyTx.date) txPatch.date = newDate;
        if (Object.keys(txPatch).length > 0) {
          batch.update(
            doc(db, 'users', user.uid, 'transactions', buyTx.id),
            txPatch
          );
        }
      }
    } else if (isBecomingSold) {
      const finalSoldPrice =
        pickPositive(updates.soldPrice, inv.soldPrice, inv.currentPrice) ?? 0;
      const finalSoldDate = updates.soldDate ?? Date.now();

      patch.soldPrice = finalSoldPrice;
      patch.soldDate = finalSoldDate;
      patch.status = 'sold';
      patch.currentPrice = finalSoldPrice;
      patch.currentValue = newUnits * finalSoldPrice;

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
      batch.set(doc(db, 'users', user.uid, 'transactions', txId), tx);
      txEffects(tx).forEach((delta, accId) =>
        batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
          balance: increment(delta),
        })
      );
      patch.linkedSellTransactionId = txId;
    }

    batch.update(doc(db, 'users', user.uid, 'investments', id), patch);
    await batch.commit();
  },

  updateInvestmentPrice: async (id, price) => {
    const { user, investments } = get();
    if (!user) throw new Error('Not authenticated');
    const inv = investments.find((i) => i.id === id);
    if (!inv) throw new Error('Investment not found');
    if (inv.status === 'sold')
      throw new Error('Cannot update price on a sold investment');
    if (inv.status === 'applied')
      throw new Error('Cannot update price on an applied investment');
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
    if (inv.status === 'sold') throw new Error('Investment is already sold');
    if (inv.status === 'applied')
      throw new Error('Cannot sell an applied investment');
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

    const batch = writeBatch(db);
    batch.update(doc(db, 'users', user.uid, 'investments', id), {
      status: 'sold',
      soldPrice,
      soldDate,
      currentPrice: soldPrice,
      currentValue: proceeds,
      linkedSellTransactionId: txId,
    });
    batch.set(doc(db, 'users', user.uid, 'transactions', txId), tx);
    txEffects(tx).forEach((delta, accId) =>
      batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
        balance: increment(delta),
      })
    );
    await batch.commit();
  },

  deleteInvestment: async (id) => {
    const { user, investments, transactions } = get();
    if (!user) return;
    const inv = investments.find((i) => i.id === id);
    if (!inv) return;

    const batch = writeBatch(db);
    const reverseTx = (txId?: string | null) => {
      if (!txId) return;
      const tx = transactions.find((t) => t.id === txId);
      if (!tx) return;
      batch.delete(doc(db, 'users', user.uid, 'transactions', tx.id));
      txEffects(tx).forEach((delta, accId) =>
        batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
          balance: increment(-delta),
        })
      );
    };
    reverseTx(inv.linkedTransactionId);
    reverseTx(inv.linkedSellTransactionId);
    reverseTx(inv.linkedApplyTransactionId);
    reverseTx(inv.linkedRefundTransactionId);
    batch.delete(doc(db, 'users', user.uid, 'investments', id));
    await batch.commit();
  },

  updatePreferences: async (updates) => {
    const { user, preferences } = get();
    if (!user) return;
    try {
      const prefs = { ...preferences, ...updates };
      if (updates.currency) {
        prefs.currencySymbol = getCurrencySymbol(updates.currency);
      }
      await setDoc(doc(db, 'users', user.uid, 'profile', 'preferences'), prefs);
    } catch (err) {
      console.error('Failed to save preferences', err);
      toast.error('Failed to save preference');
    }
  },

  restoreDefaults: async () => {
    const { user, categories, accounts } = get();
    if (!user) return;
    const existingCatIds = new Set(categories.map((c) => c.id));
    const existingAccIds = new Set(accounts.map((a) => a.id));
    const batch = writeBatch(db);
    SEED_CATEGORIES.forEach((c) => {
      if (!existingCatIds.has(c.id)) {
        batch.set(doc(db, 'users', user.uid, 'categories', c.id), c);
      }
    });
    SEED_ACCOUNTS.forEach((a) => {
      if (!existingAccIds.has(a.id)) {
        batch.set(doc(db, 'users', user.uid, 'accounts', a.id), {
          ...a,
          balance: a.initialBalance,
          createdAt: Date.now(),
        });
      }
    });
    await batch.commit();
  },

  resetToSampleData: async () => {
    const {
      user, accounts, categories, transactions, budgets,
      loans, loanPayments, investments,
    } = get();
    if (!user) return;

    const wipe = writeBatch(db);
    accounts.forEach((a) =>
      wipe.delete(doc(db, 'users', user.uid, 'accounts', a.id))
    );
    categories.forEach((c) =>
      wipe.delete(doc(db, 'users', user.uid, 'categories', c.id))
    );
    transactions.forEach((t) =>
      wipe.delete(doc(db, 'users', user.uid, 'transactions', t.id))
    );
    budgets.forEach((b) =>
      wipe.delete(doc(db, 'users', user.uid, 'budgets', b.id))
    );
    loans.forEach((l) =>
      wipe.delete(doc(db, 'users', user.uid, 'loans', l.id))
    );
    loanPayments.forEach((p) =>
      wipe.delete(doc(db, 'users', user.uid, 'loanPayments', p.id))
    );
    investments.forEach((i) =>
      wipe.delete(doc(db, 'users', user.uid, 'investments', i.id))
    );
    await wipe.commit();

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

    const batch = writeBatch(db);
    SEED_CATEGORIES.forEach((c) =>
      batch.set(doc(db, 'users', user.uid, 'categories', c.id), c)
    );
    SEED_ACCOUNTS.forEach((a) =>
      batch.set(doc(db, 'users', user.uid, 'accounts', a.id), {
        ...a,
        balance: finalBalances.get(a.id) ?? a.initialBalance,
        createdAt: Date.now(),
      })
    );
    SEED_TRANSACTIONS.forEach((t) =>
      batch.set(doc(db, 'users', user.uid, 'transactions', t.id), {
        ...t,
        createdAt: Date.now(),
      })
    );
    SEED_BUDGETS.forEach((b) =>
      batch.set(doc(db, 'users', user.uid, 'budgets', b.id), {
        ...b,
        monthYear: currentMonthKey,
      })
    );
    batch.set(
      doc(db, 'users', user.uid, 'profile', 'preferences'),
      DEFAULT_PREFERENCES
    );
    await batch.commit();
  },

  clearCloudData: async () => {
    const {
      user, accounts, categories, transactions, budgets,
      loans, loanPayments, investments,
    } = get();
    if (!user) return;
    const batch = writeBatch(db);
    accounts.forEach((a) =>
      batch.delete(doc(db, 'users', user.uid, 'accounts', a.id))
    );
    categories.forEach((c) =>
      batch.delete(doc(db, 'users', user.uid, 'categories', c.id))
    );
    transactions.forEach((t) =>
      batch.delete(doc(db, 'users', user.uid, 'transactions', t.id))
    );
    budgets.forEach((b) =>
      batch.delete(doc(db, 'users', user.uid, 'budgets', b.id))
    );
    loans.forEach((l) =>
      batch.delete(doc(db, 'users', user.uid, 'loans', l.id))
    );
    loanPayments.forEach((p) =>
      batch.delete(doc(db, 'users', user.uid, 'loanPayments', p.id))
    );
    investments.forEach((i) =>
      batch.delete(doc(db, 'users', user.uid, 'investments', i.id))
    );
    batch.set(
      doc(db, 'users', user.uid, 'profile', 'preferences'),
      DEFAULT_PREFERENCES
    );
    await batch.commit();
  },
}));