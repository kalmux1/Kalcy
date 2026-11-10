export type TransactionType = 'expense' | 'income' | 'transfer';
export type AccountType = 'cash' | 'bank' | 'card' | 'savings' | 'wallet';
export type ThemeMode = 'light' | 'dark' | 'system';
export type LoanType = 'lent' | 'borrowed';

export type InvestmentType =
  | 'stocks'
  | 'ipo'
  | 'mutual_fund'
  | 'etf'
  | 'crypto'
  | 'bond'
  | 'fixed_deposit'
  | 'real_estate'
  | 'gold'
  | 'other';

export type InvestmentStatus = 'applied' | 'active' | 'sold' | 'not_allotted';

export interface Investment {
  id: string;
  name: string;
  symbol: string;
  type: InvestmentType;
  units: number;
  buyPrice: number;
  currentPrice: number;
  investedAmount: number;
  currentValue: number;
  accountId: string;
  date: number;
  soldDate: number | null;
  soldPrice: number | null;
  status: InvestmentStatus;
  listingDate: number | null;
  listingPrice: number | null;
  /**
   * Amount blocked for IPO application. Always `0` for non-IPO positions.
   * Writers always set a number — never `null`.
   */
  appliedAmount: number;
  note: string;
  createdAt: number;
  linkedTransactionId?: string | null;
  linkedSellTransactionId?: string | null;
  linkedApplyTransactionId?: string | null;
  /** Refund transaction produced when an IPO block is released (allotted or not allotted). */
  linkedRefundTransactionId?: string | null;
}

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
  linkedLoanId?: string | null;
  linkedPaymentId?: string | null;
}

export interface Budget {
  id: string;
  categoryId: string | null;
  amount: number;
  period: 'monthly';
  carryOver: boolean;
  monthYear: string;
}

export interface Loan {
  id: string;
  personName: string;
  type: LoanType;
  principalAmount: number;
  remainingAmount: number;
  accountId: string;
  date: number;
  dueDate: number | null;
  note: string;
  isSettled: boolean;
  createdAt: number;
}

export interface LoanPayment {
  id: string;
  loanId: string;
  amount: number;
  accountId: string;
  date: number;
  note: string;
  createdAt: number;
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