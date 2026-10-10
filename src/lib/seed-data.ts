import type { Account, Category, Transaction, Budget, Preferences } from './types';

export const SEED_CATEGORIES: Category[] = [
  { id: 'cat_food', name: 'Food & Dining', type: 'expense', icon: 'UtensilsCrossed', color: '#FF6B6B', parentId: null, isHidden: false, order: 0 },
  { id: 'cat_groceries', name: 'Groceries', type: 'expense', icon: 'ShoppingCart', color: '#4ECDC4', parentId: 'cat_food', isHidden: false, order: 1 },
  { id: 'cat_restaurant', name: 'Restaurant', type: 'expense', icon: 'Utensils', color: '#FF6B6B', parentId: 'cat_food', isHidden: false, order: 2 },
  { id: 'cat_transport', name: 'Transport', type: 'expense', icon: 'Car', color: '#45B7D1', parentId: null, isHidden: false, order: 3 },
  { id: 'cat_fuel', name: 'Fuel', type: 'expense', icon: 'Fuel', color: '#96CEB4', parentId: 'cat_transport', isHidden: false, order: 4 },
  { id: 'cat_shopping', name: 'Shopping', type: 'expense', icon: 'ShoppingBag', color: '#DDA0DD', parentId: null, isHidden: false, order: 5 },
  { id: 'cat_housing', name: 'Housing', type: 'expense', icon: 'Home', color: '#A8DADC', parentId: null, isHidden: false, order: 6 },
  { id: 'cat_entertainment', name: 'Entertainment', type: 'expense', icon: 'Clapperboard', color: '#E8A0BF', parentId: null, isHidden: false, order: 7 },
  { id: 'cat_health', name: 'Health', type: 'expense', icon: 'HeartPulse', color: '#FF6B9D', parentId: null, isHidden: false, order: 8 },
  { id: 'cat_salary', name: 'Salary', type: 'income', icon: 'Wallet', color: '#22C55E', parentId: null, isHidden: false, order: 9 },
  { id: 'cat_freelance', name: 'Freelance', type: 'income', icon: 'Laptop', color: '#4ADE80', parentId: null, isHidden: false, order: 10 },
  { id: 'cat_refund', name: 'Refund', type: 'income', icon: 'RotateCcw', color: '#22C55E', parentId: null, isHidden: false, order: 11 },
];

export const SEED_ACCOUNTS: Account[] = [
  { id: 'acc_cash', name: 'Cash Wallet', type: 'cash', balance: 500, initialBalance: 500, currency: 'USD', icon: 'Banknote', color: '#22C55E', isIncludedInTotal: true, createdAt: Date.now() },
  { id: 'acc_bank', name: 'Main Checking', type: 'bank', balance: 2500, initialBalance: 2500, currency: 'USD', icon: 'Building2', color: '#3B82F6', isIncludedInTotal: true, createdAt: Date.now() },
];

export const SEED_TRANSACTIONS: Transaction[] = [
  { id: 't1', type: 'income', amount: 2500, accountId: 'acc_bank', toAccountId: null, categoryId: 'cat_salary', date: Date.now() - 86400000, note: 'Salary deposit', receiptUrl: null, isExcludedFromStats: false, isExcludedFromBudget: false, createdAt: Date.now() - 86400000 },
  { id: 't2', type: 'expense', amount: 45.50, accountId: 'acc_cash', toAccountId: null, categoryId: 'cat_restaurant', date: Date.now() - 43200000, note: 'Lunch', receiptUrl: null, isExcludedFromStats: false, isExcludedFromBudget: false, createdAt: Date.now() - 43200000 },
];

export const SEED_BUDGETS: Budget[] = [
  { id: 'b1', categoryId: 'cat_food', amount: 400, period: 'monthly', carryOver: false, monthYear: new Date().toISOString().slice(0, 7) },
  { id: 'b2', categoryId: null, amount: 1500, period: 'monthly', carryOver: false, monthYear: new Date().toISOString().slice(0, 7) },
];

export const DEFAULT_PREFERENCES: Preferences = {
  currency: 'USD',
  currencySymbol: '$',
  theme: 'light',
  weekStartDay: 1,
  monthlyStartDay: 1,
};