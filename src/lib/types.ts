export type TransactionType = 'expense' | 'income' | 'transfer';
export type AccountType = 'cash' | 'bank' | 'card' | 'savings' | 'wallet';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  initialBalance: number;
  currency: string;
  icon: string;
  color: string;
  isIncludedInTotal: boolean;
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  icon: string;
  color: string;
  parentId: string | null;
  isHidden: boolean;
  order: number;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  date: number;
  note: string;
  receiptUrl: string | null;
  isExcludedFromStats: boolean;
  isExcludedFromBudget: boolean;
  createdAt: number;
}

export interface Budget {
  id: string;
  categoryId: string | null;
  amount: number;
  period: 'monthly';
  carryOver: boolean;
  monthYear: string;
}

export interface Preferences {
  currency: string;
  currencySymbol: string;
  theme: ThemeMode;
  weekStartDay: 0 | 1;
  monthlyStartDay: number;
}

export interface Currency {
  code: string;
  symbol: string;
  name: string;
}