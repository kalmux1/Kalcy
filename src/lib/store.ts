import { create } from 'zustand';
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

  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>;
  updateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;

  addAccount: (acc: Omit<Account, 'id' | 'createdAt'>) => Promise<void>;
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

export const useStore = create<StoreState>((set, get) => ({
  user: null,
  isLoading: true,
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
            createdAt: Date.now(),
          })
        );
        batch.set(prefRef, DEFAULT_PREFERENCES);
        await batch.commit();
      }
    } catch (err) {
      console.error('Failed to seed defaults for new user', err);
    }

    unsubs.push(
      onSnapshot(prefRef, (docSnap) => {
        if (docSnap.exists()) set({ preferences: docSnap.data() as Preferences });
      })
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'users', uid, 'accounts'),
        (s) => set({ accounts: s.docs.map((d) => d.data() as Account) })
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
        }
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
        }
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'users', uid, 'budgets'),
        (s) =>
          set({
            budgets: s.docs.map((d) => d.data() as Budget),
            isLoading: false,
          })
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
        }
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
        }
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
        }
      )
    );
  },

  addTransaction: async (tx) => {
    const { user } = get();
    if (!user) return;
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
    const { user, transactions } = get();
    if (!user) return;
    const oldTx = transactions.find((t) => t.id === id);
    if (!oldTx) return;

    const updatedTx: Transaction = { ...oldTx, ...updates };

    const oldEffects = txEffects(oldTx);
    const newEffects = txEffects(updatedTx);
    const net = new Map<string, number>();
    oldEffects.forEach((v, k) => net.set(k, (net.get(k) ?? 0) - v));
    newEffects.forEach((v, k) => net.set(k, (net.get(k) ?? 0) + v));

    const batch = writeBatch(db);
    batch.update(doc(db, 'users', user.uid, 'transactions', id), updates);
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

    // If this is a loan payment, cascade the delete.
    if (tx.linkedPaymentId) {
      await get().deleteLoanPayment(tx.linkedPaymentId);
      return;
    }

    // If this is the initial loan transaction, cascade the delete.
    if (tx.linkedLoanId && !tx.linkedPaymentId) {
      await get().deleteLoan(tx.linkedLoanId);
      return;
    }

    // If this is an investment transaction, cascade the delete.
    const linkedInv = investments.find(
      (i) =>
        i.linkedTransactionId === tx.id ||
        i.linkedSellTransactionId === tx.id
    );
    if (linkedInv) {
      await get().deleteInvestment(linkedInv.id);
      return;
    }

    // Normal deletion
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
    const id = genId('acc');
    await setDoc(doc(db, 'users', user.uid, 'accounts', id), {
      ...acc,
      id,
      createdAt: Date.now(),
    });
  },

  updateAccount: async (id, updates) => {
    const { user } = get();
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid, 'accounts', id), updates);
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
    const id = genId('cat');
    const order = categories.filter((c) => c.type === cat.type).length;
    await setDoc(doc(db, 'users', user.uid, 'categories', id), {
      ...cat,
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

    const toDelete = [
      id,
      ...categories.filter((c) => c.parentId === id).map((c) => c.id),
    ];
    const batch = writeBatch(db);

    toDelete.forEach((cid) =>
      batch.delete(doc(db, 'users', user.uid, 'categories', cid))
    );

    transactions
      .filter((t) => t.categoryId && toDelete.includes(t.categoryId))
      .forEach((t) =>
        batch.update(doc(db, 'users', user.uid, 'transactions', t.id), {
          categoryId: null,
        })
      );

    budgets
      .filter((b) => b.categoryId && toDelete.includes(b.categoryId))
      .forEach((b) => batch.delete(doc(db, 'users', user.uid, 'budgets', b.id)));

    await batch.commit();
  },

  addBudget: async (b) => {
    const { user } = get();
    if (!user) return;
    const id = genId('b');
    await setDoc(doc(db, 'users', user.uid, 'budgets', id), { ...b, id });
  },

  updateBudget: async (id, updates) => {
    const { user } = get();
    if (!user) return;
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

    if (
      typeof updates.principalAmount === 'number' &&
      updates.principalAmount !== loan.principalAmount
    ) {
      const paid = loan.principalAmount - loan.remainingAmount;
      const newRemaining = Math.max(0, updates.principalAmount - paid);
      patch.remainingAmount = newRemaining;

      if (initialTx) {
        txPatch.amount = updates.principalAmount;
        const delta = updates.principalAmount - loan.principalAmount;
        const signedDelta = loan.type === 'lent' ? -delta : delta;
        bump(loan.accountId, signedDelta);
      }
    }

    if (
      updates.accountId &&
      updates.accountId !== loan.accountId &&
      initialTx
    ) {
      txPatch.accountId = updates.accountId;
      const amount = txPatch.amount ?? loan.principalAmount;
      const signedDelta = loan.type === 'lent' ? -amount : amount;
      bump(loan.accountId, -signedDelta);
      bump(updates.accountId, signedDelta);
    }

    if (typeof updates.date === 'number' && initialTx) {
      txPatch.date = updates.date;
    }

    const finalRemaining = patch.remainingAmount ?? loan.remainingAmount;
    patch.isSettled = finalRemaining <= 0;

    const batch = writeBatch(db);
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

    const linked =
      transactions.find((t) => t.linkedPaymentId === id) ??
      transactions.find(
        (t) =>
          t.linkedLoanId === payment.loanId &&
          !t.linkedPaymentId &&
          t.amount === payment.amount &&
          t.date === payment.date &&
          (t.type === 'income' || t.type === 'expense')
      );

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
    name,
    symbol,
    type,
    units,
    buyPrice,
    currentPrice,
    accountId,
    date,
    note,
  }) => {
    const { user } = get();
    if (!user) throw new Error('Not authenticated');

    requirePositive(units, 'Units');
    requirePositive(buyPrice, 'Buy price');
    if (!accountId) throw new Error('Account is required');
    if (currentPrice !== undefined && currentPrice < 0) {
      throw new Error('Current price cannot be negative');
    }

    const invId = genId('inv');
    const txId = genId('t');
    const now = Date.now();
    const investedAmount = units * buyPrice;
    const effectiveCurrentPrice =
      typeof currentPrice === 'number' && currentPrice > 0
        ? currentPrice
        : buyPrice;
    const currentValue = units * effectiveCurrentPrice;

    const investment: Investment = {
      id: invId,
      name,
      symbol,
      type,
      units,
      buyPrice,
      currentPrice: effectiveCurrentPrice,
      investedAmount,
      currentValue,
      accountId,
      date,
      soldDate: null,
      soldPrice: null,
      status: 'active',
      note,
      createdAt: now,
      linkedTransactionId: txId,
      linkedSellTransactionId: null,
    };

    const tx: Transaction = {
      id: txId,
      type: 'expense',
      amount: investedAmount,
      accountId,
      toAccountId: null,
      categoryId: null,
      date,
      note: note || `Investment: ${name}${symbol ? ` (${symbol})` : ''}`,
      receiptUrl: null,
      isExcludedFromStats: true,
      isExcludedFromBudget: true,
      createdAt: now,
      linkedLoanId: null,
      linkedPaymentId: null,
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'users', user.uid, 'investments', invId), investment);
    batch.set(doc(db, 'users', user.uid, 'transactions', txId), tx);
    txEffects(tx).forEach((delta, accId) => {
      batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
        balance: increment(delta),
      });
    });
    await batch.commit();
  },

  updateInvestment: async (id, updates) => {
    const { user, investments, transactions } = get();
    if (!user) return;
    const inv = investments.find((i) => i.id === id);
    if (!inv) return;

    if (updates.units !== undefined) requirePositive(updates.units, 'Units');
    if (updates.buyPrice !== undefined) requirePositive(updates.buyPrice, 'Buy price');

    const newUnits = updates.units ?? inv.units;
    const newBuyPrice = updates.buyPrice ?? inv.buyPrice;
    const newAccountId = updates.accountId ?? inv.accountId;
    const newDate = updates.date ?? inv.date;
    const newInvestedAmount = newUnits * newBuyPrice;

    const patch: Partial<Investment> = { ...updates };
    if (updates.units !== undefined || updates.buyPrice !== undefined) {
      patch.investedAmount = newInvestedAmount;
    }

    if (inv.status === 'active') {
      const newCurrentPrice = updates.currentPrice ?? inv.currentPrice;
      if (updates.units !== undefined || updates.currentPrice !== undefined) {
        patch.currentValue = newUnits * newCurrentPrice;
      }
    } else if (inv.status === 'sold' && inv.soldPrice !== null) {
      patch.currentValue = newUnits * inv.soldPrice;
      patch.currentPrice = inv.soldPrice;
    }

    const batch = writeBatch(db);

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

    if (
      inv.status === 'sold' &&
      inv.soldPrice !== null &&
      inv.linkedSellTransactionId
    ) {
      const sellTx = transactions.find(
        (t) => t.id === inv.linkedSellTransactionId
      );
      if (sellTx) {
        const newProceeds = newUnits * inv.soldPrice;
        const accountChanged = newAccountId !== sellTx.accountId;
        const amountChanged = newProceeds !== sellTx.amount;

        if (accountChanged) {
          batch.update(
            doc(db, 'users', user.uid, 'accounts', sellTx.accountId),
            { balance: increment(-sellTx.amount) }
          );
          batch.update(doc(db, 'users', user.uid, 'accounts', newAccountId), {
            balance: increment(newProceeds),
          });
        } else if (amountChanged) {
          batch.update(doc(db, 'users', user.uid, 'accounts', newAccountId), {
            balance: increment(newProceeds - sellTx.amount),
          });
        }

        const txPatch: Partial<Transaction> = {};
        if (amountChanged) txPatch.amount = newProceeds;
        if (accountChanged) txPatch.accountId = newAccountId;

        if (Object.keys(txPatch).length > 0) {
          batch.update(
            doc(db, 'users', user.uid, 'transactions', sellTx.id),
            txPatch
          );
        }
      }
    }

    batch.update(doc(db, 'users', user.uid, 'investments', id), patch);
    await batch.commit();
  },

  updateInvestmentPrice: async (id, price) => {
    const { user, investments } = get();
    if (!user) throw new Error('Not authenticated');
    const inv = investments.find((i) => i.id === id);
    if (!inv) throw new Error('Investment not found');
    if (inv.status === 'sold') {
      throw new Error('Cannot update price on a sold investment');
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
    if (inv.status === 'sold') throw new Error('Investment is already sold');
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
    txEffects(tx).forEach((delta, accId) => {
      batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
        balance: increment(delta),
      });
    });
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
      txEffects(tx).forEach((delta, accId) => {
        batch.update(doc(db, 'users', user.uid, 'accounts', accId), {
          balance: increment(-delta),
        });
      });
    };

    reverseTx(inv.linkedTransactionId);
    reverseTx(inv.linkedSellTransactionId);

    batch.delete(doc(db, 'users', user.uid, 'investments', id));
    await batch.commit();
  },

  updatePreferences: async (updates) => {
    const { user, preferences } = get();
    if (!user) return;
    const prefs = { ...preferences, ...updates };
    if (updates.currency)
      prefs.currencySymbol = getCurrencySymbol(updates.currency);
    await setDoc(doc(db, 'users', user.uid, 'profile', 'preferences'), prefs);
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
          createdAt: Date.now(),
        });
      }
    });
    await batch.commit();
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
    loans.forEach((l) => wipe.delete(doc(db, 'users', user.uid, 'loans', l.id)));
    loanPayments.forEach((p) =>
      wipe.delete(doc(db, 'users', user.uid, 'loanPayments', p.id))
    );
    investments.forEach((i) =>
      wipe.delete(doc(db, 'users', user.uid, 'investments', i.id))
    );
    await wipe.commit();

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