import { create } from 'zustand';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  writeBatch,
  getDocs,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Account, Category, Transaction, Budget, Preferences, AuthUser } from './types';
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

  updatePreferences: (updates: Partial<Preferences>) => Promise<void>;
  resetToSampleData: () => Promise<void>;
  clearCloudData: () => Promise<void>;
}

let unsubs: Unsubscribe[] = [];
function clearUnsubs() {
  unsubs.forEach((u) => u());
  unsubs = [];
}
function genId(p: string) {
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export const useStore = create<StoreState>((set, get) => ({
  user: null,
  isLoading: true,
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
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
      preferences: DEFAULT_PREFERENCES,
      isLoading: false,
    });
  },

  initUserData: async (uid: string) => {
    clearUnsubs();
    set({ isLoading: true });

    // Bootstrap a first-time user with default categories + accounts.
    try {
      const catsSnap = await getDocs(collection(db, 'users', uid, 'categories'));
      if (catsSnap.empty) {
        const batch = writeBatch(db);
        SEED_CATEGORIES.forEach((c) => batch.set(doc(db, 'users', uid, 'categories', c.id), c));
        SEED_ACCOUNTS.forEach((a) =>
          batch.set(doc(db, 'users', uid, 'accounts', a.id), { ...a, createdAt: Date.now() })
        );
        await batch.commit();
      }
    } catch (err) {
      console.error('Failed to seed defaults for new user', err);
    }

    // Preferences
    const prefRef = doc(db, 'users', uid, 'profile', 'preferences');
    unsubs.push(
      onSnapshot(prefRef, (docSnap) => {
        if (docSnap.exists()) {
          set({ preferences: docSnap.data() as Preferences });
        } else {
          setDoc(prefRef, DEFAULT_PREFERENCES);
        }
      })
    );

    unsubs.push(
      onSnapshot(collection(db, 'users', uid, 'accounts'), (s) => {
        set({ accounts: s.docs.map((d) => d.data() as Account) });
      })
    );

    unsubs.push(
      onSnapshot(collection(db, 'users', uid, 'categories'), (s) => {
        const categories = s.docs.map((d) => d.data() as Category).sort((a, b) => a.order - b.order);
        set({ categories });
      })
    );

    unsubs.push(
      onSnapshot(collection(db, 'users', uid, 'transactions'), (s) => {
        const transactions = s.docs.map((d) => d.data() as Transaction).sort((a, b) => b.date - a.date);
        set({ transactions });
      })
    );

    unsubs.push(
      onSnapshot(collection(db, 'users', uid, 'budgets'), (s) => {
        set({ budgets: s.docs.map((d) => d.data() as Budget), isLoading: false });
      })
    );
  },

  addTransaction: async (tx) => {
    const { user, accounts } = get();
    if (!user) return;
    const id = genId('t');
    const newTx: Transaction = { ...tx, id, createdAt: Date.now() };

    const batch = writeBatch(db);
    batch.set(doc(db, 'users', user.uid, 'transactions', id), newTx);

    if (tx.type === 'transfer') {
      const f = accounts.find((a) => a.id === tx.accountId);
      const t = accounts.find((a) => a.id === tx.toAccountId);
      if (f) batch.update(doc(db, 'users', user.uid, 'accounts', f.id), { balance: f.balance - tx.amount });
      if (t) batch.update(doc(db, 'users', user.uid, 'accounts', t.id), { balance: t.balance + tx.amount });
    } else if (tx.type === 'expense') {
      const acc = accounts.find((a) => a.id === tx.accountId);
      if (acc) batch.update(doc(db, 'users', user.uid, 'accounts', acc.id), { balance: acc.balance - tx.amount });
    } else if (tx.type === 'income') {
      const acc = accounts.find((a) => a.id === tx.accountId);
      if (acc) batch.update(doc(db, 'users', user.uid, 'accounts', acc.id), { balance: acc.balance + tx.amount });
    }
    await batch.commit();
  },

  updateTransaction: async (id, updates) => {
    const { user, transactions, accounts } = get();
    if (!user) return;
    const oldTx = transactions.find((t) => t.id === id);
    if (!oldTx) return;

    const updatedTx = { ...oldTx, ...updates };
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', user.uid, 'transactions', id), updates);

    const temp = accounts.map((a) => ({ ...a }));
    // Reverse old effect
    if (oldTx.type === 'transfer') {
      const f = temp.find((a) => a.id === oldTx.accountId);
      const t = temp.find((a) => a.id === oldTx.toAccountId);
      if (f) f.balance += oldTx.amount;
      if (t) t.balance -= oldTx.amount;
    } else if (oldTx.type === 'expense') {
      const a = temp.find((acc) => acc.id === oldTx.accountId);
      if (a) a.balance += oldTx.amount;
    } else if (oldTx.type === 'income') {
      const a = temp.find((acc) => acc.id === oldTx.accountId);
      if (a) a.balance -= oldTx.amount;
    }
    // Apply new effect
    if (updatedTx.type === 'transfer') {
      const f = temp.find((a) => a.id === updatedTx.accountId);
      const t = temp.find((a) => a.id === updatedTx.toAccountId);
      if (f) f.balance -= updatedTx.amount;
      if (t) t.balance += updatedTx.amount;
    } else if (updatedTx.type === 'expense') {
      const a = temp.find((acc) => acc.id === updatedTx.accountId);
      if (a) a.balance -= updatedTx.amount;
    } else if (updatedTx.type === 'income') {
      const a = temp.find((acc) => acc.id === updatedTx.accountId);
      if (a) a.balance += updatedTx.amount;
    }

    temp.forEach((acc) => {
      batch.update(doc(db, 'users', user.uid, 'accounts', acc.id), { balance: acc.balance });
    });
    await batch.commit();
  },

  deleteTransaction: async (id) => {
    const { user, transactions, accounts } = get();
    if (!user) return;
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return;

    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', user.uid, 'transactions', id));

    if (tx.type === 'transfer') {
      const f = accounts.find((a) => a.id === tx.accountId);
      const t = accounts.find((a) => a.id === tx.toAccountId);
      if (f) batch.update(doc(db, 'users', user.uid, 'accounts', f.id), { balance: f.balance + tx.amount });
      if (t) batch.update(doc(db, 'users', user.uid, 'accounts', t.id), { balance: t.balance - tx.amount });
    } else if (tx.type === 'expense') {
      const a = accounts.find((acc) => acc.id === tx.accountId);
      if (a) batch.update(doc(db, 'users', user.uid, 'accounts', a.id), { balance: a.balance + tx.amount });
    } else if (tx.type === 'income') {
      const a = accounts.find((acc) => acc.id === tx.accountId);
      if (a) batch.update(doc(db, 'users', user.uid, 'accounts', a.id), { balance: a.balance - tx.amount });
    }
    await batch.commit();
  },

  addAccount: async (acc) => {
    const { user } = get();
    if (!user) return;
    const id = genId('acc');
    await setDoc(doc(db, 'users', user.uid, 'accounts', id), { ...acc, id, createdAt: Date.now() });
  },

  updateAccount: async (id, updates) => {
    const { user } = get();
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid, 'accounts', id), updates);
  },

  /**
   * Deleting an account removes all its transactions AND reverses any
   * transfer balance effect the deleted account had on the OTHER account.
   */
  deleteAccount: async (id) => {
    const { user, transactions, accounts } = get();
    if (!user) return;

    const batch = writeBatch(db);

    // Accumulate balance deltas so we don't write the same doc twice.
    const balanceDeltas = new Map<string, number>();
    const bump = (accId: string, delta: number) => {
      balanceDeltas.set(accId, (balanceDeltas.get(accId) ?? 0) + delta);
    };

    transactions
      .filter((t) => t.accountId === id || t.toAccountId === id)
      .forEach((t) => {
        if (t.type === 'transfer') {
          if (t.accountId === id && t.toAccountId) {
            // Deleted account was source → dest gained amount, reverse it.
            bump(t.toAccountId, -t.amount);
          }
          if (t.toAccountId === id && t.accountId) {
            // Deleted account was destination → source lost amount, reverse it.
            bump(t.accountId, +t.amount);
          }
        }
        batch.delete(doc(db, 'users', user.uid, 'transactions', t.id));
      });

    balanceDeltas.forEach((delta, accId) => {
      const acc = accounts.find((a) => a.id === accId);
      if (acc) {
        batch.update(doc(db, 'users', user.uid, 'accounts', accId), { balance: acc.balance + delta });
      }
    });

    batch.delete(doc(db, 'users', user.uid, 'accounts', id));
    await batch.commit();
  },

  addCategory: async (cat) => {
    const { user, categories } = get();
    if (!user) return;
    const id = genId('cat');
    const order = categories.filter((c) => c.type === cat.type).length;
    await setDoc(doc(db, 'users', user.uid, 'categories', id), { ...cat, id, order });
  },

  updateCategory: async (id, updates) => {
    const { user } = get();
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid, 'categories', id), updates);
  },

  deleteCategory: async (id) => {
    const { user, categories } = get();
    if (!user) return;
    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', user.uid, 'categories', id));
    categories
      .filter((c) => c.parentId === id)
      .forEach((s) => batch.delete(doc(db, 'users', user.uid, 'categories', s.id)));
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

  updatePreferences: async (updates) => {
    const { user, preferences } = get();
    if (!user) return;
    const prefs = { ...preferences, ...updates };
    if (updates.currency) prefs.currencySymbol = getCurrencySymbol(updates.currency);
    await setDoc(doc(db, 'users', user.uid, 'profile', 'preferences'), prefs);
  },

  resetToSampleData: async () => {
    const { user } = get();
    if (!user) return;
    const batch = writeBatch(db);
    SEED_CATEGORIES.forEach((c) => batch.set(doc(db, 'users', user.uid, 'categories', c.id), c));
    SEED_ACCOUNTS.forEach((a) =>
      batch.set(doc(db, 'users', user.uid, 'accounts', a.id), { ...a, createdAt: Date.now() })
    );
    SEED_TRANSACTIONS.forEach((t) =>
      batch.set(doc(db, 'users', user.uid, 'transactions', t.id), { ...t, createdAt: Date.now() })
    );
    SEED_BUDGETS.forEach((b) =>
      batch.set(doc(db, 'users', user.uid, 'budgets', b.id), {
        ...b,
        monthYear: new Date().toISOString().slice(0, 7),
      })
    );
    batch.set(doc(db, 'users', user.uid, 'profile', 'preferences'), DEFAULT_PREFERENCES);
    await batch.commit();
  },

  clearCloudData: async () => {
    const { user, accounts, categories, transactions, budgets } = get();
    if (!user) return;
    const batch = writeBatch(db);
    accounts.forEach((a) => batch.delete(doc(db, 'users', user.uid, 'accounts', a.id)));
    categories.forEach((c) => batch.delete(doc(db, 'users', user.uid, 'categories', c.id)));
    transactions.forEach((t) => batch.delete(doc(db, 'users', user.uid, 'transactions', t.id)));
    budgets.forEach((b) => batch.delete(doc(db, 'users', user.uid, 'budgets', b.id)));
    await batch.commit();
  },
}));    