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
  increment,
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
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${p}_${crypto.randomUUID()}`;
  }
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Compute per-account balance deltas produced by a transaction. */
function txEffects(tx: Pick<Transaction, 'type' | 'amount' | 'accountId' | 'toAccountId'>): Map<string, number> {
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

    // Seed defaults only if the user has NO accounts AND NO categories.
    try {
      const [catsSnap, accsSnap] = await Promise.all([
        getDocs(collection(db, 'users', uid, 'categories')),
        getDocs(collection(db, 'users', uid, 'accounts')),
      ]);
      if (catsSnap.empty && accsSnap.empty) {
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

    const prefRef = doc(db, 'users', uid, 'profile', 'preferences');
    unsubs.push(
      onSnapshot(
        prefRef,
        (docSnap) => {
          if (docSnap.exists()) {
            set({ preferences: docSnap.data() as Preferences });
          } else {
            setDoc(prefRef, DEFAULT_PREFERENCES).catch(console.error);
          }
        },
        (err) => console.error('preferences listener', err)
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'users', uid, 'accounts'),
        (s) => set({ accounts: s.docs.map((d) => d.data() as Account) }),
        (err) => console.error('accounts listener', err)
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'users', uid, 'categories'),
        (s) => {
          const categories = s.docs.map((d) => d.data() as Category).sort((a, b) => a.order - b.order);
          set({ categories });
        },
        (err) => console.error('categories listener', err)
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'users', uid, 'transactions'),
        (s) => {
          const transactions = s.docs.map((d) => d.data() as Transaction).sort((a, b) => b.date - a.date);
          set({ transactions });
        },
        (err) => console.error('transactions listener', err)
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'users', uid, 'budgets'),
        (s) => set({ budgets: s.docs.map((d) => d.data() as Budget), isLoading: false }),
        (err) => {
          console.error('budgets listener', err);
          set({ isLoading: false });
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
      batch.update(doc(db, 'users', user.uid, 'accounts', accId), { balance: increment(delta) });
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
        batch.update(doc(db, 'users', user.uid, 'accounts', accId), { balance: increment(delta) });
      }
    });

    await batch.commit();
  },

  deleteTransaction: async (id) => {
    const { user, transactions } = get();
    if (!user) return;
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return;

    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', user.uid, 'transactions', id));

    // Reverse the effects.
    txEffects(tx).forEach((delta, accId) => {
      batch.update(doc(db, 'users', user.uid, 'accounts', accId), { balance: increment(-delta) });
    });

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

  deleteAccount: async (id) => {
    const { user, transactions } = get();
    if (!user) return;

    const batch = writeBatch(db);
    const balanceDeltas = new Map<string, number>();
    const bump = (accId: string, delta: number) => {
      balanceDeltas.set(accId, (balanceDeltas.get(accId) ?? 0) + delta);
    };

    transactions
      .filter((t) => t.accountId === id || t.toAccountId === id)
      .forEach((t) => {
        // Reverse effects on OTHER accounts only.
        txEffects(t).forEach((delta, accId) => {
          if (accId !== id) bump(accId, -delta);
        });
        batch.delete(doc(db, 'users', user.uid, 'transactions', t.id));
      });

    balanceDeltas.forEach((delta, accId) => {
      if (delta !== 0) {
        batch.update(doc(db, 'users', user.uid, 'accounts', accId), { balance: increment(delta) });
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

  /** Cascade delete subcategories and detach any transactions/budgets referencing them. */
  deleteCategory: async (id) => {
    const { user, categories, transactions, budgets } = get();
    if (!user) return;

    const toDelete = [id, ...categories.filter((c) => c.parentId === id).map((c) => c.id)];
    const batch = writeBatch(db);

    toDelete.forEach((cid) => batch.delete(doc(db, 'users', user.uid, 'categories', cid)));

    transactions
      .filter((t) => t.categoryId && toDelete.includes(t.categoryId))
      .forEach((t) => batch.update(doc(db, 'users', user.uid, 'transactions', t.id), { categoryId: null }));

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

  updatePreferences: async (updates) => {
    const { user, preferences } = get();
    if (!user) return;
    const prefs = { ...preferences, ...updates };
    if (updates.currency) prefs.currencySymbol = getCurrencySymbol(updates.currency);
    await setDoc(doc(db, 'users', user.uid, 'profile', 'preferences'), prefs);
  },

  /** Wipe all docs then seed — prevents orphans from previous sample data. */
  resetToSampleData: async () => {
    const { user, accounts, categories, transactions, budgets } = get();
    if (!user) return;

    const wipe = writeBatch(db);
    accounts.forEach((a) => wipe.delete(doc(db, 'users', user.uid, 'accounts', a.id)));
    categories.forEach((c) => wipe.delete(doc(db, 'users', user.uid, 'categories', c.id)));
    transactions.forEach((t) => wipe.delete(doc(db, 'users', user.uid, 'transactions', t.id)));
    budgets.forEach((b) => wipe.delete(doc(db, 'users', user.uid, 'budgets', b.id)));
    await wipe.commit();

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