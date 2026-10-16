export type TransactionType = 'expense' | 'income' | 'transfer';
export type AccountType = 'cash' | 'bank' | 'card' | 'savings' | 'wallet';
export type ThemeMode = 'light' | 'dark' | 'system';
export type LoanType = 'lent' | 'borrowed'; // lent = they owe me; borrowed = I owe them

/* ------------------------------------------------------------------ */
/*  Investments                                                       */
/* ------------------------------------------------------------------ */

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

export type InvestmentStatus = 'active' | 'sold';

export interface Investment {
  id: string;
  /** Human-readable name, e.g. "Reliance Industries" or "Zomato IPO". */
  name: string;
  /** Ticker or short code, e.g. "RELIANCE", "ZOMATO". Optional but recommended. */
  symbol: string;
  type: InvestmentType;
  /** Number of shares / units / coins / grams purchased. */
  units: number;
  /** Purchase price per unit. */
  buyPrice: number;
  /** Current market price per unit. Seeded to buyPrice on creation. */
  currentPrice: number;
  /** Denormalized: units * buyPrice. Kept in sync by the store. */
  investedAmount: number;
  /** Denormalized: units * currentPrice. Kept in sync by the store. */
  currentValue: number;
  /** Account used to fund the purchase, and to credit proceeds on sale. */
  accountId: string;
  /** Purchase timestamp (epoch ms). */
  date: number;
  /** Sale timestamp (epoch ms). null while active. */
  soldDate: number | null;
  /** Sale price per unit. null while active. */
  soldPrice: number | null;
  status: InvestmentStatus;
  note: string;
  createdAt: number;
  /** Transaction created when the position was purchased. */
  linkedTransactionId?: string | null;
  /** Transaction created when the position was sold (if applicable). */
  linkedSellTransactionId?: string | null;
}

/* ------------------------------------------------------------------ */

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
  /**
   * Optional link to the loan that generated this transaction. Used so that
   * deleting a loan can also clean up its associated transactions.
   */
  linkedLoanId?: string | null;
  /**
   * Optional link to the specific loan payment that generated this
   * transaction. Used by deleteLoanPayment for deterministic matching.
   * Only present on transactions created by addLoanPayment.
   */
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