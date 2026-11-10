
# Kalcy 💰

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

> A privacy-first, offline-capable personal finance PWA — track expenses, manage budgets, monitor accounts, track loans, and monitor your investment portfolio — all synced in real time through Firebase.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Features](#features)
4. [High-Level Architecture](#high-level-architecture)
5. [Data Model](#data-model)
6. [Directory Structure](#directory-structure)
7. [Getting Started](#getting-started)
8. [Firestore Setup & Security Rules](#firestore-setup--security-rules)
9. [Core Workflows](#core-workflows)
10. [State Management](#state-management)
11. [Design System](#design-system)
12. [PWA & Offline Strategy](#pwa--offline-strategy)
13. [Scripts](#scripts)
14. [Conventions & Invariants](#conventions--invariants)
15. [Known Limitations](#known-limitations)
16. [License](#license)

---

## Overview

**Kalcy** is a mobile-first, Progressive Web App (PWA) for personal finance. It is intentionally **invite-only in the sense that there is no sign-up UI** — user accounts are provisioned manually in Firebase Console → Authentication. Once signed in, all data is scoped to `users/{uid}/…` in Firestore and enforced by security rules (`isOwner(uid)`), so one user can never read or write another user's data.

It is built as a single-page React app that:

- Syncs all data to **Cloud Firestore** with **offline persistence enabled by default**
- Seeds sensible defaults (accounts, categories, preferences) on first sign-in
- Handles **accounts, transactions, transfers, budgets, loans, and repayments** with correct double-entry-style balance updates
- Tracks an **investment portfolio** (shares, IPOs, mutual funds, ETFs, crypto, bonds, FDs, real estate, gold) with live P&L and net-worth integration
- Works **fully offline** once installed, and auto-updates in the background
- Ships as an installable PWA with maskable icons and a themed splash

The project deliberately avoids a backend server: Firestore + Firebase Auth are the entire "backend", and all business logic lives in a Zustand store that reconciles local state with real-time Firestore snapshots.

Balances are **hidden by default** on first launch. The eye button on any hero card (Transactions, Accounts, Lending, Investments) toggles a session-wide unhide; the flag is intentionally not persisted so a fresh tab starts hidden.

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Build | **Vite 5** | Fast HMR, ESM-native, `@` → `src` alias |
| UI | **React 18** + **TypeScript 5** | Strict mode, `noUnusedLocals`, `noUnusedParameters` |
| Styling | **Tailwind CSS 3** + **shadcn/ui** (Radix) | CSS-variable theming, light/dark |
| Animation | **Framer Motion 11** | Layout pills, sheet transitions, swipe gestures |
| State | **Zustand 4** (+ `useShallow`) | Single store, no boilerplate |
| Backend | **Firebase 10** (Auth + Firestore) | `persistentLocalCache`, `persistentMultipleTabManager` |
| Charts | **Recharts 2** | Pie, Bar, Line |
| Bottom sheets | **Vaul** | iOS-style drawers, `repositionInputs` for keyboard |
| Toasts | **Sonner** | Themed via `ThemeProvider` |
| Icons | **Lucide React** | Mapped by string name in `icon-map.tsx` |
| PWA | **vite-plugin-pwa** + **Workbox 7** | `autoUpdate`, runtime font caching, precache |
| Assets | **@vite-pwa/assets-generator** | Generates maskable/apple icons from `kalcy-logo.svg` |

---

## Features

### 🔐 Authentication & Access Control

- Email/password sign-in via Firebase Auth
- **No public sign-up.** Users are created manually in **Firebase Console → Authentication → Users**; anyone without a Firebase Auth account cannot sign in.
- **Firestore security rules** enforce strict per-user isolation via `request.auth.uid == uid`; the catch-all `match /{document=**}` denies everything else.
- Profile drawer for display name + password change (requires re-authentication).
- If Firestore ever returns `permission-denied` (e.g. a stale token, a misconfigured rule, or a deleted Auth user), the store's listener error handler **signs the user out immediately** and surfaces a toast.

### 💸 Transactions

- Three types: **expense**, **income**, **transfer**
- Built-in **calculator numpad** (supports `+ − × ÷`, AC, backspace; left-to-right evaluation matching iOS Calculator)
- Hierarchical categories (parent → sub-categories)
- Date + time picker with quick presets (Today / Yesterday / 2 days ago)
- Notes, "exclude from stats", "exclude from budget" switches
- **Tap a row to edit** (in addition to swiping left to delete, right to edit)
- Four view modes: **Daily**, **Calendar**, **Monthly**, **Summary**
- Transactions linked to a loan or investment are **edit- and delete-guarded** in the list **and** in the store. The UI surfaces a toast pointing to the parent tab; the store throws on the same operation so a modified client can't bypass the guard.
- Daily-header and calendar-day sums honour `isExcludedFromStats`, so a blocked IPO block or a loan origination no longer appears as a same-day "expense" while being excluded from the monthly totals.

### 🏦 Accounts

- Types: cash, bank, card, savings, wallet
- Editable icon (Lucide) + color
- Toggle "include in net worth total"
- **Transfers** between accounts (with state that resets cleanly if cancelled)
- Editing an account's *initial* balance shifts its live balance by the same delta (preserving all transactional drift)
- Deleting an account **cascades** — removes every linked transaction, loan, loan payment, and investment, and reverses each transaction's effect on the surviving accounts. Multiple repayments to the same surviving loan are **aggregated per loan before writing**, so `remainingAmount` is restored to the correct value instead of just the last payment's amount. Any surviving investment that pointed at a transaction being removed has its stale `linked*TransactionId` pointer nulled out, so no dangling references remain.

### 🎯 Budgets

- Monthly budgets — **overall** or **per category**
- Sub-category roll-up (parent budget includes children)
- Warning (≥80%) and over-budget states
- Carry-over flag (data model ready)
- Duplicate-budget guard (one overall + one per category per month)
- Delete uses the shared `ConfirmDialog` — consistent with every other destructive action

### 🤝 Lending

- Track money **lent** (asset) or **borrowed** (liability)
- Each loan generates a mirrored account transaction automatically
- Partial repayments with payment history
- Auto-settle when `remainingAmount ≤ 0`
- Editing a loan reconciles **amount, type, account, and date** in one atomic delta — switching `lent ↔ borrowed` correctly flips every mirrored transaction (initial + every payment) and reverses the balance effect
- Net worth = accounts balance + net loan position

### 📈 Investments

- Track **shares, IPOs, mutual funds, ETFs, crypto, bonds, fixed deposits, real estate, gold** and custom types
- Per-unit **buy price** and **current market price** (user-updated)
- Automatic **unrealized P&L** (on active positions) and **realized P&L** (on sold positions)
- Every buy/sell/refund creates a mirrored, stats/budget-excluded account transaction
- Portfolio **allocation breakdown** by asset type
- **Net worth contribution** = market value of all active positions **plus** any capital blocked in applied IPOs
- **Full IPO lifecycle** — `Applied → (Allotted | Not Allotted)`, and `Allotted → Sold`, each with **correct, reversible cash movements**:

  | Transition | Cash effect | Transactions created |
  |---|---|---|
  | New (applied) | `−appliedAmount` | 1 expense (block) |
  | Applied → Allotted | `+appliedAmount − (units × buyPrice)` | 1 income (release block) + 1 expense (buy) |
  | Applied → Not Allotted | `+appliedAmount` | 1 income (refund) |
  | Active → Sold | `+(soldPrice × units)` | 1 income (proceeds) |

- Deleting an investment **reverses every transaction it ever produced** — buy, apply, refund, and sell — because each is tracked by a dedicated field (`linkedTransactionId`, `linkedApplyTransactionId`, `linkedRefundTransactionId`, `linkedSellTransactionId`).
- Selling requires a **positive sale price**; the store rejects a `$0` sale before writing.
- `sellInvestment` and `updateInvestmentPrice` both require `status === 'active'` — an `applied` IPO has no units to sell or re-price, and a `not_allotted` one has zero units, so both are rejected uniformly.
- All dates submitted by the form are strictly validated. Malformed `YYYY-MM-DD` strings are rejected with a toast rather than serialised as `NaN` (which Firestore would store as `null`, corrupting the model).

**Edit rules — which fields can change**

| Current status | What can be edited | What is reconciled |
|---|---|---|
| `active` | name, symbol, units, buy price, current price, funding account, purchase date, note | Buy transaction: amount, account, date, note |
| `sold` | **sale price**, **sale date**, note *(all buy-side fields are locked in the UI and rejected by the store)* | Sell transaction: amount, account, date |
| `applied` | applied amount, funding account, apply date, note | Apply transaction: amount, account, date |
| `not_allotted` | note only *(terminal state)* | — |

Locking buy-side fields on a sold position is a strict invariant. `store.ts`'s `updateInvestment` explicitly throws if `name`, `symbol`, `type`, `units`, `buyPrice`, `accountId`, or `date` are modified on a `sold`, `not_allotted`, or transitioning-to-`sold` position. Allowing units/buy-price edits on a sold position would desync the buy transaction from the stored `investedAmount`.

### 📊 Statistics

- Monthly donut chart of category breakdown (expense / income toggle)
- 6-month income vs expense bar chart
- Cash-flow line chart
- Category progress bars with % of total
- Month navigation is clamped to the 1st of the month to prevent date overflow bugs (e.g., clicking "next" from Jan 31 safely lands on Feb 1).

### ⚙️ Preferences & Settings

- 20 fiat currencies with symbol lookup
- Light / Dark / System theme
- Week start day (Mon / Sun)
- Tab labelled **Settings** (previously "More") to accurately reflect its contents.

### ☁️ Data

- **CSV export** of all transactions (formula-injection safe)
- **Delete All Data** — wipes every user collection and resets the preferences marker so re-seeding doesn't trigger on next sign-in. Commits are **chunked at 400 operations** to stay safely under Firestore's 500-operation batch cap, so a long-time user's full history can be deleted in one tap.
- **Restore Defaults** uses `set(..., { merge: true })`, so renamed seeds or a customised default account aren't clobbered.

---

## High-Level Architecture

```mermaid
graph TD
    subgraph Browser["Browser (PWA)"]
        UI["React UI<br/>App.tsx + components"]
        Store["Zustand Store<br/>src/lib/store.ts"]
        Theme["ThemeProvider"]
        SW["Service Worker<br/>(Workbox)"]
    end

    subgraph Firebase["Firebase Backend"]
        Auth["Firebase Auth<br/>(manually provisioned users)"]
        FS["Cloud Firestore<br/>+ IndexedDB cache<br/>+ security rules"]
    end

    UI -->|dispatch actions| Store
    Store -->|onSnapshot realtime| FS
    Store -->|writeBatch / setDoc| FS
    UI -->|signIn / signOut| Auth
    Auth -->|onAuthStateChanged| UI
    Auth -.->|request.auth.uid| FS
    UI -.->|class toggling| Theme
    SW -.->|precache + runtime cache| UI
```

**Key idea:** the UI never talks to Firestore directly. It dispatches intent to `useStore`, which:

1. Computes side effects locally (e.g. account balance deltas, invested amounts)
2. Commits them in a single atomic `writeBatch` (chunked at 400 ops for large deletes)
3. Lets Firestore's real-time listeners push the canonical state back into the store

This means **every UI surface is driven by the store snapshot**, and the store is never optimistically out of sync for longer than a round-trip.

---

## Data Model

All user data is scoped under `users/{uid}/…`. Types live in `src/lib/types.ts`.

```mermaid
erDiagram
    USER ||--o{ ACCOUNT : owns
    USER ||--o{ CATEGORY : owns
    USER ||--o{ TRANSACTION : owns
    USER ||--o{ BUDGET : owns
    USER ||--o{ LOAN : owns
    USER ||--o{ LOAN_PAYMENT : owns
    USER ||--o{ INVESTMENT : owns
    USER ||--|| PREFERENCES : has

    ACCOUNT {
        string id
        string name
        enum   type "cash|bank|card|savings|wallet"
        number balance
        number initialBalance
        string currency
        string icon
        string color
        bool   isIncludedInTotal
        number createdAt
    }

    CATEGORY {
        string id
        string name
        enum   type "expense|income|transfer"
        string icon
        string color
        string parentId "nullable"
        bool   isHidden
        number order
    }

    TRANSACTION {
        string id
        enum   type "expense|income|transfer"
        number amount
        string accountId
        string toAccountId "nullable"
        string categoryId "nullable"
        number date
        string note
        bool   isExcludedFromStats
        bool   isExcludedFromBudget
        string linkedLoanId "nullable"
        string linkedPaymentId "nullable"
    }

    BUDGET {
        string id
        string categoryId "null = overall"
        number amount
        string period "monthly"
        bool   carryOver
        string monthYear "YYYY-MM"
    }

    LOAN {
        string id
        string personName
        enum   type "lent|borrowed"
        number principalAmount
        number remainingAmount
        string accountId
        number date
        number dueDate "nullable"
        bool   isSettled
    }

    LOAN_PAYMENT {
        string id
        string loanId
        number amount
        string accountId
        number date
    }

    INVESTMENT {
        string id
        string name
        string symbol
        enum   type "stocks|ipo|mutual_fund|etf|crypto|bond|fixed_deposit|real_estate|gold|other"
        number units
        number buyPrice
        number currentPrice
        number investedAmount "units * buyPrice"
        number currentValue   "units * currentPrice"
        string accountId
        number date
        number soldDate "nullable"
        number soldPrice "nullable"
        enum   status "applied|active|sold|not_allotted"
        number appliedAmount "blocked amount for IPO, 0 otherwise"
        number listingPrice  "nullable"
        number listingDate   "nullable"
        string linkedTransactionId    "nullable, buy tx"
        string linkedApplyTransactionId "nullable, IPO block tx"
        string linkedRefundTransactionId "nullable, IPO release tx"
        string linkedSellTransactionId  "nullable, sell tx"
    }

    PREFERENCES {
        string currency
        string currencySymbol
        enum   theme "light|dark|system"
        number weekStartDay "0|1"
        number monthlyStartDay
    }
```

### Firestore paths

```
users/{uid}/accounts/{accountId}
users/{uid}/categories/{categoryId}
users/{uid}/transactions/{transactionId}
users/{uid}/budgets/{budgetId}
users/{uid}/loans/{loanId}
users/{uid}/loanPayments/{paymentId}
users/{uid}/investments/{investmentId}
users/{uid}/profile/preferences            ← singleton doc, also used as seed marker
```

### Transaction ↔ Account effects

The helper `txEffects()` in `store.ts` produces the balance deltas for any transaction:

| Type | Effect on `accountId` | Effect on `toAccountId` |
|---|---|---|
| `expense` | `−amount` | — |
| `income` | `+amount` | — |
| `transfer` | `−amount` | `+amount` |

These deltas are always applied with `increment(delta)` inside a `writeBatch`, guaranteeing consistency even under concurrent edits.

Loan and investment transactions are **generated by the store** — they use the same `txEffects` path, so all balance arithmetic stays in one place.

### Investment transaction tracking

Every investment keeps an explicit pointer to each transaction it produced, so that deletion and status transitions can reverse exactly the right cash movements:

| Field | Set when | Reconciled on edit | Reversed on delete |
|---|---|---|---|
| `linkedTransactionId` | New active investment, or `applied → active` | `active → active` edit (amount / account / date / note) | ✅ |
| `linkedApplyTransactionId` | New IPO in `applied` status | `applied → applied` edit (amount / account / date) | ✅ |
| `linkedRefundTransactionId` | `applied → active` or `applied → not_allotted` | — (immutable once set) | ✅ |
| `linkedSellTransactionId` | `active → sold` | `sold → sold` edit (amount / account / date) | ✅ |

This is what makes `deleteInvestment` idempotent and *net-worth neutral* — every cash movement is precisely undone. The same pointers also make **edits** safe: changing an active position's buy amount re-writes the buy transaction and applies the incremental delta in the same batch.

### Batch size policy

Firestore caps a single `writeBatch` at **500 operations**. Anything larger is rejected atomically. `commitInChunks` (in `store.ts`) accepts an array of `(batch) => void` operations, groups them into chunks of **400**, and commits each chunk sequentially. This is used by:

- `clearCloudData` (Delete All Data)
- `resetToSampleData`
- `deleteAccount` (cascade can touch hundreds of documents)
- `deleteCategory` (subtree + linked budgets)
- `deleteLoan` (loan + payments + mirrored transactions)
- Every single-transaction action that touches multiple docs

Chunking is not fully atomic across chunks, but each chunk is atomic. For a *delete* operation this is safe — a partial failure leaves orphaned documents that a retry will clean up, never corrupted balances.

---

## Directory Structure

```
.
├── public/
│   ├── kalcy-logo.svg              # Source asset for PWA generation
│   ├── favicon.ico
│   ├── apple-touch-icon-180x180.png
│   ├── maskable-icon-512x512.png
│   ├── pwa-64x64.png
│   ├── pwa-192x192.png
│   └── pwa-512x512.png
├── src/
│   ├── components/
│   │   ├── tabs/
│   │   │   ├── accounts-tab.tsx        # Accounts + Transfers + Lending + Investments segments
│   │   │   ├── budgets-view.tsx        # Monthly budgets CRUD
│   │   │   ├── categories-view.tsx     # Category tree CRUD
│   │   │   ├── lending-view.tsx        # Loans & repayments
│   │   │   ├── investments-view.tsx    # Investment portfolio (shares, IPO, crypto, …)
│   │   │   ├── stats-tab.tsx           # Recharts dashboards
│   │   │   └── transactions-tab.tsx    # Daily/Calendar/Monthly/Summary
│   │   ├── ui/                         # shadcn primitives
│   │   │   ├── button.tsx
│   │   │   ├── confirm-dialog.tsx      # Async-aware Radix dialog
│   │   │   ├── dialog.tsx
│   │   │   ├── drawer.tsx              # Vaul wrapper
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── select.tsx
│   │   │   ├── sonner.tsx
│   │   │   ├── switch.tsx
│   │   │   └── textarea.tsx
│   │   ├── auth-view.tsx               # Sign-in screen
│   │   ├── bottom-nav.tsx              # Tab bar + FAB
│   │   ├── calculator-numpad.tsx       # Arithmetic numpad
│   │   ├── error-boundary.tsx          # Top-level error catcher
│   │   ├── icon-map.tsx                # String → Lucide component registry
│   │   ├── profile-edit-drawer.tsx     # Name + password change
│   │   ├── theme-provider.tsx          # light/dark/system
│   │   ├── transaction-item.tsx        # Swipeable & clickable row
│   │   └── transaction-sheet.tsx       # Multi-step add/edit sheet
│   ├── lib/
│   │   ├── currencies.ts               # 20 currencies + format helpers
│   │   ├── finance.ts                  # Pure aggregation/derivation helpers
│   │   ├── firebase.ts                 # App + Auth + Firestore (offline cache, HMR-safe)
│   │   ├── seed-data.ts                # Default categories/accounts/budgets
│   │   ├── store.ts                    # Zustand store — the "brain"
│   │   ├── types.ts                    # All TypeScript domain types
│   │   └── utils.ts                    # cn() — clsx + tailwind-merge
│   ├── App.tsx                          # Root shell + auth gate + Settings tab
│   ├── index.css                        # Tailwind layers + theme tokens
│   ├── main.tsx                         # SW registration + render
│   └── vite-env.d.ts                    # Env var + PWA client typings
├── components.json                 # shadcn CLI config
├── index.html                      # PWA meta, theme-color, manifest hints
├── package.json
├── postcss.config.js
├── pwa-assets.config.ts            # Icon generation preset
├── tailwind.config.ts
├── tsconfig.json
└── vite.config.ts                  # VitePWA manifest + Workbox runtime caching
```

---

## Getting Started

### Prerequisites

- Node.js **18+**
- A Firebase project with **Email/Password** auth enabled
- A **Firestore** database (Native mode)

### 1. Install

```bash
npm install
```

### 2. Configure environment

Create a `.env` file at the repo root:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

These are consumed by `src/lib/firebase.ts` via `import.meta.env`.

### 3. Create users manually

There is **no sign-up UI**. To let someone use Kalcy:

1. Firebase Console → **Authentication** → **Users** → **Add user**
2. Enter email + password, save.
3. That's it. No allowlist collection, no additional provisioning.

The first time that user signs in, `initUserData` seeds:

- 12 default categories
- 2 default accounts (`Cash Wallet`, `Main Checking`)
- Default preferences doc (`users/{uid}/profile/preferences`) — also used as the "already seeded" marker

If the seed fails (network drop during first sign-in), the store retries once after 2 s and surfaces a toast on second failure — the user is never left staring at an empty app until a manual reload.

If you want to revoke access later, delete the user in Firebase Console → Authentication. The next Firestore read will return `permission-denied`, and the listener error handler signs them out automatically.

### 4. Publish Firestore security rules

Copy the rules from [Firestore Setup & Security Rules](#firestore-setup--security-rules) into **Firestore → Rules → Publish**.

### 5. Run

```bash
npm run dev
```

Open the printed `localhost` URL and sign in with a user you created in step 3.

### 6. Regenerate PWA icons (optional)

```bash
npm run generate-pwa-assets
```

Reads `pwa-assets.config.ts` and produces maskable + apple + standard icons from `public/kalcy-logo.svg`.

---

## Firestore Setup & Security Rules

Kalcy relies entirely on **per-user `uid` scoping**. Every document lives under `users/{uid}/…`, and the ruleset below enforces `request.auth.uid == uid` on every read and write. There is **no `allowlist` collection** — access is controlled purely by whether a Firebase Auth user exists.

**Published rules:**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper: Ensure the user is signed in and only accessing their own data
    function isOwner(uid) {
      return request.auth != null && request.auth.uid == uid;
    }

    // User data - locked to their own UID
    match /users/{uid}/accounts/{id}      { allow read, write: if isOwner(uid); }
    match /users/{uid}/categories/{id}    { allow read, write: if isOwner(uid); }
    match /users/{uid}/transactions/{id}  { allow read, write: if isOwner(uid); }
    match /users/{uid}/budgets/{id}       { allow read, write: if isOwner(uid); }
    match /users/{uid}/loans/{id}         { allow read, write: if isOwner(uid); }
    match /users/{uid}/loanPayments/{id}  { allow read, write: if isOwner(uid); }
    match /users/{uid}/investments/{id}   { allow read, write: if isOwner(uid); }

    match /users/{uid}/profile/{doc} {
      allow read:           if isOwner(uid);
      allow create, update: if isOwner(uid);
      allow delete:         if false;
    }

    // Deny everything else by default
    match /{document=**}{ allow read, write: if false; }
  }
}
```

**Notes:**

- The `profile/preferences` doc is **non-deletable** by design — it doubles as the "user has been seeded" marker. `clearCloudData` resets it to `DEFAULT_PREFERENCES` instead of deleting it, so the seed batch doesn't re-run on the next sign-in.
- If you ever see `permission-denied` on the `preferences` listener at sign-in time, the most likely cause is a stale Auth token — the store signs the user out and shows a toast so they can retry.
- No index requirements beyond what Firestore creates automatically — all per-user queries are simple collection reads.

---

## Core Workflows

### 1. Authentication

```mermaid
sequenceDiagram
    participant U as User
    participant AV as AuthView
    participant FA as Firebase Auth
    participant App as App.tsx
    participant FS as Firestore
    participant S as useStore

    U->>AV: email + password
    AV->>FA: signInWithEmailAndPassword
    alt invalid credentials
        FA-->>AV: auth/invalid-credential
        AV->>U: toast "Incorrect email or password"
    else authenticated
        FA-->>App: onAuthStateChanged(fbUser)
        App->>S: setUser({ uid, email, ... })
        App->>S: initUserData(uid)
        S->>FS: getDoc(users/{uid}/profile/preferences)
        alt first sign-in
            S->>FS: writeBatch — seed categories, accounts, preferences
        end
        S->>FS: onSnapshot × 8 collections
        FS-->>S: snapshot (enforced by isOwner(uid) rule)
        S-->>App: isLoading = false
        App->>U: render main shell
    end
```

**Notes:**

- The gate is **Firebase Auth itself**. Anyone without an Auth user never gets past `signInWithEmailAndPassword`.
- `initUserData` seeds defaults only if `users/{uid}/profile/preferences` is missing, then attaches **eight** `onSnapshot` listeners (accounts, categories, transactions, budgets, loans, loanPayments, **investments**, preferences).
- The `isLoading` state is released when *all* registered listeners have fired their first snapshot. The target count is dynamically derived from the number of listeners registered, so adding/removing a listener in the future won't silently break the loading state.
- If the **seed batch fails** on the first attempt, the store retries once after 2 s, then surfaces a toast if the retry also fails.
- Any listener that receives `permission-denied` triggers an immediate `signOut()` + toast.

### 2. Adding a Transaction

```mermaid
flowchart TD
    A[TransactionSheet<br/>numpad + fields] --> B{Validate}
    B -- invalid --> E[toast.error]
    B -- valid --> C[store.addTransaction]
    C --> D[genId + createdAt]
    D --> F[txEffects compute deltas]
    F --> G[commitInChunks]
    G --> H[set transaction doc]
    G --> I[increment account balances]
    H & I --> J[batch.commit]
    J --> K[onSnapshot pushes new state]
    K --> L[UI re-renders]
```

`updateTransaction` reverses the **old** effects and applies the **new** ones — the net delta is always committed atomically:

```ts
const net = new Map<string, number>();
oldEffects.forEach((v, k) => net.set(k, (net.get(k) ?? 0) - v));
newEffects.forEach((v, k) => net.set(k, (net.get(k) ?? 0) + v));
```

**Linked records are guarded on *both* edit and delete.** If the target transaction is linked to a loan or investment, `updateTransaction` **throws** and `deleteTransaction` **dispatches to the parent's delete function** instead of touching the row — keeping the linked entity's balance and remaining amount consistent even if a modified client bypasses the UI guard in `TransactionItem` / `TransactionSheet`.

### 3. Loan Lifecycle

```mermaid
sequenceDiagram
    participant U as User
    participant LV as LendingView
    participant S as Store
    participant FS as Firestore

    Note over U,FS: Loan origination
    U->>LV: New loan (lent $100 to Alice)
    LV->>S: addLoan(...)
    S->>FS: batch.set loans/{id}
    S->>FS: batch.set transactions/{id} (expense, excluded from stats)
    S->>FS: batch.update accounts/{id} { balance: increment(-100) }

    Note over U,FS: Partial repayment
    U->>LV: Record $40 payment
    LV->>S: addLoanPayment(...)
    S->>FS: batch.set loanPayments/{id}
    S->>FS: batch.set transactions/{id} (income)
    S->>FS: batch.update loans/{id} { remainingAmount: 60 }
    S->>FS: batch.update accounts/{id} { balance: increment(+40) }

    Note over U,FS: Type flip (lent ↔ borrowed)
    U->>LV: Edit → change to "borrowed"
    LV->>S: updateLoan({ type: 'borrowed', ... })
    S->>FS: batch.update transactions/{id} { type: 'income', note }
    S->>FS: batch.update accounts/{id} { balance: increment(2 × amount) }
    Note right of S: Net delta computed across amount + type + account + date<br/>as one signed adjustment. Every linked payment tx is flipped too.
```

**Rules encoded in the store:**

- Lending money out: `expense` on the account, **excluded from stats and budget** (it's not consumption — it's a receivable).
- Borrowing: `income`, also excluded.
- Repayment in the opposite direction.
- `updateLoan` computes the **net balance delta** from the old `(amount, type, account)` triple versus the new one, so any combination of changes (including `lent ↔ borrowed`) applies exactly the right adjustment in one batch. Every payment transaction linked to the loan is also flipped atomically.
- `deleteLoan` cascades: deletes the loan, every `linkedLoanId` transaction, and every payment.

### 4. Investment Lifecycle (incl. IPO)

```mermaid
sequenceDiagram
    participant U as User
    participant IV as InvestmentsView
    participant S as Store
    participant FS as Firestore

    Note over U,FS: New active investment (e.g. shares)
    U->>IV: New (10 RELIANCE @ ₹2500)
    IV->>S: addInvestment(...)
    S->>FS: batch.set investments/{id} (status: active, linkedTransactionId)
    S->>FS: batch.set transactions/{id} (expense, excluded)
    S->>FS: batch.update accounts { balance: increment(-25000) }

    Note over U,FS: IPO — apply (blocked funds)
    U->>IV: New IPO (₹15000 applied)
    IV->>S: addInvestment({ status: 'applied', appliedAmount: 15000 })
    S->>FS: batch.set investments/{id} (linkedApplyTransactionId)
    S->>FS: batch.set transactions/{id} (expense, excluded)
    S->>FS: batch.update accounts { balance: increment(-15000) }

    Note over U,FS: IPO — allot
    U->>IV: Edit → Allotted (50 units @ ₹300)
    IV->>S: updateInvestment({ status: 'active', units: 50, buyPrice: 300 })
    S->>FS: batch.set transactions (income — release block, linkedRefundTransactionId)
    S->>FS: batch.set transactions (expense — buy, linkedTransactionId)
    S->>FS: batch.update accounts { increment: +15000 then −15000 }
    S->>FS: batch.update investments { status: 'active', appliedAmount: 0 }

    Note over U,FS: IPO — not allotted
    U->>IV: Edit → Not Allotted
    IV->>S: updateInvestment({ status: 'not_allotted' })
    S->>FS: batch.set transactions (income — refund, linkedRefundTransactionId)
    S->>FS: batch.update accounts { increment: +15000 }

    Note over U,FS: Price update
    U->>IV: Update price → ₹2800
    IV->>S: updateInvestmentPrice(id, 2800)
    S->>FS: update investments { currentPrice, currentValue }
    Note right of S: No cash movement — only paper net worth changes

    Note over U,FS: Sell
    U->>IV: Sell @ ₹2800
    IV->>S: sellInvestment(...)
    S->>FS: batch.update investments { status: 'sold', soldPrice, soldDate }
    S->>FS: batch.set transactions (income, linkedSellTransactionId)
    S->>FS: batch.update accounts { balance: increment(+28000) }

    Note over U,FS: Edit active position (e.g. buy price)
    U->>IV: Edit active → change buy price ₹2500 → ₹2600
    IV->>S: updateInvestment({ buyPrice: 2600 })
    S->>FS: batch.update transactions/{buyTxId} { amount: 26000, date, account, note }
    S->>FS: batch.update accounts { increment: -1000 }

    Note over U,FS: Edit sold position (sale price only)
    U->>IV: Edit sold → change sale price ₹2800 → ₹2900
    IV->>S: updateInvestment({ soldPrice: 2900 })
    S->>FS: batch.update transactions/{sellTxId} { amount: 29000, account, date }
    S->>FS: batch.update accounts { increment: +1000 }

    Note over U,FS: Delete (any status)
    U->>IV: Delete
    IV->>S: deleteInvestment(id)
    S->>FS: reverse ALL linked txs (buy, apply, refund, sell)
    S->>FS: batch.delete investments/{id}
```

**Rules encoded in the store:**

- Buying moves cash → asset; both sides are excluded from stats and budget so analytics stay clean.
- **Price updates never touch cash.** Only `currentPrice` / `currentValue` change.
- **Refund transactions are tracked** via `linkedRefundTransactionId` so that allotment and not-allotted transitions are fully reversible.
- `deleteInvestment` reverses **every** linked transaction and restores cash — regardless of whether the position is applied, active, sold, or not allotted.
- Selling requires `soldPrice > 0`; the store rejects a `$0` sale before any write.
- Allotting requires `units > 0` and `buyPrice > 0`; the store rejects a zero-cost allotment before any write.
- `sellInvestment` and `updateInvestmentPrice` both enforce `status === 'active'`.
- `updateInvestment` reconciles the relevant transaction pointer for each edit branch:
  - `active → active` → reconciles the buy transaction and recomputes `investedAmount` / `currentValue`.
  - `applied → applied` → reconciles the apply (block) transaction.
  - `sold → sold` → reconciles the sell transaction and recomputes `investedAmount` / `currentValue`.
  - The store explicitly rejects any attempt to edit buy-side fields (`name`, `symbol`, `type`, `units`, `buyPrice`, `accountId`, `date`) on a `sold`, `not_allotted`, or transitioning-to-`sold` position. This keeps the buy transaction perfectly synchronised with the stored `investedAmount`.
- The `accountId` is used symmetrically: **funds the buy** and **receives the sell proceeds**, mirroring the loan model.

### 5. Deleting an Account (Cascade)

`deleteAccount` is the most complex operation. It:

1. Identifies loans whose **home account** is the deleted one → marks them for deletion.
2. Identifies payments routed through the account → marks them for deletion.
3. Identifies investments funded by the account → marks them (and *all four* of their linked transactions: buy, apply, refund, sell) for deletion.
4. Collects every transaction that references any of: the account itself, a deleted loan, a deleted payment, a deleted investment.
5. **Reverses** each collected transaction's effects on **surviving** accounts.
6. **Restores** `remainingAmount` on loans whose *payment* is being removed but whose *loan* survives. **All payments to the same loan are aggregated first**, so a loan with two removed payments has both amounts restored — not just the last one.
7. **Nulls out dangling pointers** on surviving investments that referenced any removed transaction. A surviving investment can only hit this path if it moved to a different funding account after a transition (e.g. IPO applied on X, allotted on Y — then X is deleted). Without this, the investment would carry stale `linked*TransactionId` values.
8. Deletes transactions, loans, payments, investments, and finally the account — all committed via `commitInChunks` so a large account doesn't blow the 500-op batch cap.

### 6. Deleting Everything (Wipe)

`clearCloudData` (Delete All Data):

- Uses `commitInChunks` — safe for accounts with hundreds of transactions, loans, payments, and investments.
- **Resets** the preferences doc to `DEFAULT_PREFERENCES` instead of deleting it (the doc doubles as the "already seeded" marker, so deleting it would trigger a re-seed).
- The wipe confirmation is a **`ConfirmDialog`** — focus-trapped, keyboard-accessible, and shown with an explicit "Working…" state while the commit runs.

### 7. Offline-First Sync

```mermaid
flowchart LR
    UI[UI action] --> Store[Zustand]
    Store -->|writeBatch| Cache[(IndexedDB<br/>persistent cache)]
    Cache -.->|when online| FS[(Firestore)]
    FS -.->|onSnapshot| Cache
    Cache -->|onSnapshot| Store
    Store --> UI

    SW[Service Worker] -.->|precache shell| UI
    SW -.->|CacheFirst 1y| Fonts[fonts.gstatic.com]
```

- **Firestore SDK** is initialized with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`, so writes go to IndexedDB first and sync when connectivity returns. Snapshots still fire from cache while offline.
- `initializeFirestore` is wrapped in a `try/catch` that falls back to `getFirestore` — Vite HMR re-initialising the module no longer throws *"Firestore has already been initialized"*.
- **Workbox** adds an HTTP cache layer for fonts (`CacheFirst`, 30 entries, 1 year). No runtime cache is registered for Firestore itself — the SDK's WebChannel responses are streams and cannot be cached by Workbox, and the SDK's own IndexedDB layer already handles offline reads/writes correctly.
- An online/offline banner in the **Settings** tab reflects `navigator.onLine` (polled every 5s as a Safari fallback).

### 8. PWA Update Lifecycle

```mermaid
sequenceDiagram
    participant SW as Service Worker
    participant Main as main.tsx
    participant User

    SW->>Main: onOfflineReady (first install only)
    Main->>User: toast "Kalcy installed. Works offline." (once per browser)

    Note over SW: Background check every 60 min
    SW->>Main: onNeedRefresh
    Main->>User: toast "New version available" [Reload]
    User->>SW: updateSW(true)
    SW->>SW: skipWaiting + clientsClaim
```

- `registerType: 'autoUpdate'` means a new SW is installed silently.
- The `onOfflineReady` toast is deduplicated with a `localStorage` key (`kalcy.offlineReadySeen`) so it doesn't nag on every visit.
- `clientsClaim()` + `self.skipWaiting()` activate the new worker immediately.

### 9. Theme Resolution

```mermaid
flowchart TD
    P[preferences.theme] --> Q{value}
    Q -- light --> R[remove .dark]
    Q -- dark --> S[add .dark]
    Q -- system --> T[matchMedia prefers-color-scheme]
    T --> U{dark?}
    U -- yes --> S
    U -- no --> R
    R & S --> V[documentElement classList]
```

`ThemeProvider` reads `preferences.theme` from the store and applies the `dark` class to `<html>`. When `system` is selected, it subscribes to `matchMedia` and re-applies on change.

---

## State Management

`useStore` (Zustand) is the single source of truth for the running app.

```mermaid
graph TD
    subgraph Store["useStore (Zustand)"]
        D[Data slices:<br/>accounts, categories, transactions,<br/>budgets, loans, loanPayments,<br/>investments, preferences]
        A[Actions:<br/>CRUD for each slice + auth]
    end

    App[React Components] -->|useStore(s => s.x)| D
    App -->|useStore(useShallow(s => ({...})))| D
    App -->|useStore(s => s.action)| A
    A -->|writeBatch| FS[(Firestore)]
    FS -->|onSnapshot| D
```

**Guiding principles:**

- **No optimistic local mutation** — the store only writes to Firestore; Firestore pushes the truth back via `onSnapshot`.
- **Every multi-doc write is a `writeBatch`** — no partial state.
- **Batch commits are chunked at 400 ops** via `commitInChunks` so the Firestore 500-op cap is never hit; a large cascade or full wipe no longer fails atomically.
- **Balance changes always use `increment()`**, never absolute values, so concurrent edits from multiple tabs can't clobber each other.
- **Linked records are guarded in the store, not just the UI.** `updateTransaction` throws for linked rows; `deleteTransaction` dispatches to the parent's delete function. A modified client or new caller cannot accidentally corrupt a loan or investment.
- **Derived values are pure functions** in `src/lib/finance.ts` (e.g. `getMonthlyTotals`, `getBudgetProgress`, `getLoansSummary`, `getInvestmentsSummary`, `getInvestmentPnl`, `getTotalNetWorth`) — they never touch Firestore, they just consume the current arrays.
- **Loan transactions are linked** via `linkedLoanId` (the parent loan) and `linkedPaymentId` (the specific repayment). Investment transactions are linked via the four fields listed in the [Investment transaction tracking](#investment-transaction-tracking) section. This makes cascading deletes deterministic.
- **Denormalized values are recomputed on write.** `investedAmount` (`units × buyPrice`) and `currentValue` (`units × currentPrice`) are always recomputed inside the store when the underlying units or prices change — so list rendering and sum-based analytics never need to re-derive them.
- **Preference writes use `merge: true`.** A stale `preferences` snapshot from another tab can no longer revert concurrent changes.
- **Restore Defaults uses `merge: true`.** Renamed seeds or a customised default account survive the operation.
- **Selective subscription.** Components that read many slices at once (e.g. `BudgetsView`, `LendingView`, `AccountsTab`, `InvestmentsView`, `CategoriesView`, `TransactionsTab`) use `useShallow` from `zustand/react/shallow` to subscribe to just the fields they need. This prevents a snapshot from one collection from re-rendering every other tab in the background.

### Listener teardown

```ts
// setUser(null) or sign-out:
clearUnsubs();         // unsubscribes all 8 onSnapshot listeners
clearLocalState();     // wipes arrays + resets preferences to DEFAULT
```

---

## Design System

Themes are driven by CSS variables in `src/index.css`, consumed by Tailwind via `hsl(var(--token))`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--primary` | `158 64% 42%` (teal) | `158 64% 52%` | Brand, FAB, active nav |
| `--expense` | `0 76% 60%` (red) | `0 72% 55%` | Negative amounts |
| `--income` | `142 71% 45%` (green) | `142 71% 50%` | Positive amounts |
| `--transfer` | `212 92% 55%` (blue) | `212 92% 60%` | Transfers |
| `--warning` | `38 92% 50%` (amber) | `38 92% 55%` | Budget ≥ 80% |
| `--radius` | `1.25rem` | same | Very round UI |

**UI vocabulary:**

- Bottom sheets (Vaul) for all data entry — never modal forms on mobile. Heights use `dvh` to correctly handle mobile browser UI (URL bars).
- Rounded-3xl cards with `border-border/40` hairlines
- Gradient hero cards (`from-primary to-primary/70`) for balance/budget/net-worth/portfolio headers
- Layout-animated nav pill (`layoutId="nav-pill"`) for tab transitions
- Lucide icons resolved by **string name** through `icon-map.tsx`, so Firestore can store `icon: "UtensilsCrossed"` and the UI finds the component
- Every destructive action uses the shared `ConfirmDialog` (Radix Dialog), never a toast — this gives keyboard focus trapping and consistent `role="dialog"` semantics. The dialog **awaits the `onConfirm` promise**, keeps itself open on failure, and shows a "Working…" state while the write is in flight, so a rejected batch (e.g. a quota error) is visible rather than silent.
- Investment types share the same icon registry — `INVESTMENT_TYPES` in `icon-map.tsx` maps each type to `{ label, icon, color }` for consistent rendering across cards, charts, and pickers

---

## PWA & Offline Strategy

Configured in `vite.config.ts`:

```ts
VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'Kalcy',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#3f7a6f',
    background_color: '#ffffff',
    icons: [/* 64, 192, 512, maskable 512 */],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/__/],
    runtimeCaching: [
      { urlPattern: fonts.gstatic, handler: 'CacheFirst', maxAge: 1y },
    ],
  },
  devOptions: { enabled: true, type: 'module' },
})
```

**Layered caching:**

| Layer | What it caches | TTL / Limit |
|---|---|---|
| Precache (Workbox) | App shell (JS/CSS/HTML/SVG/PNG/ICO/WOFF2) | Versioned by build hash |
| Runtime — Fonts | `fonts.gstatic.com` assets | 30 entries / 1y |
| Firestore SDK (IndexedDB) | All Firestore reads/writes | Persistent, multi-tab |

The SDK-level persistence is what makes the app **truly offline-capable**. There is **no Workbox runtime route for `firestore.googleapis.com`** — Firestore's WebChannel uses streamed responses that Workbox cannot cache, and the SDK's IndexedDB layer already handles everything Workbox would have attempted.

`dev-dist/` (the dev-mode service worker output) is generated by `npm run dev` and is **gitignored** — don't commit it.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start Vite dev server (SW enabled in dev) |
| `npm run build` | Type-check (`tsc`) then produce a production build |
| `npm run preview` | Serve the production build locally |
| `npm run generate-pwa-assets` | Regenerate maskable / apple / PWA icons from the SVG |

---

## Conventions & Invariants

- **Path alias:** `@/*` → `src/*` (both in `vite.config.ts` and `tsconfig.json`).
- **No `any` leaking into components:** Firestore listener callbacks narrow doc data to the domain types in `types.ts`.
- **CSV safety:** `csvField()` prefixes formula-injection starters (`= + - @` and tabs) with `'`, and doubles embedded quotes before wrapping the cell.
- **Date handling:** all timestamps are stored as `number` (epoch ms). `formatDateKey` / `parseLocalDate` exist specifically to avoid the UTC shift from `new Date('YYYY-MM-DD')`.
- **Date input validation:** Forms do not trust `<input type="date" />` blindly. They use a `parseDateInput` helper that strictly validates the `YYYY-MM-DD` shape and returns `null` on failure. This prevents `NaN` timestamps from being written to Firestore (where they would be silently coerced to `null`).
- **Month navigation:** Changing months in pickers/views normalises to the first of the month (`new Date(y, m + dir, 1)`). This prevents the classic JS date-overflow bug where navigating "next" from Jan 31 (e.g. via `setMonth()`) incorrectly lands on March 3 instead of February.
- **Loan exclusion:** all auto-generated loan transactions carry `isExcludedFromStats: true` and `isExcludedFromBudget: true` so they don't distort spending analytics or budgets.
- **Investment exclusion:** same policy — buys, sells, and IPO blocks/refunds are balance-sheet moves, not consumption. They appear in the transaction list but are filtered out of stats and budgets. Daily-view and calendar-view headers honour `isExcludedFromStats` so their per-day totals agree with the monthly totals.
- **Denormalization discipline:** `investedAmount` and `currentValue` on `Investment` are recomputed by `addInvestment`, `updateInvestment`, `updateInvestmentPrice`, and `sellInvestment` — never written by the UI directly.
- **Investment transaction tracking** uses four explicit pointers (`linkedTransactionId`, `linkedApplyTransactionId`, `linkedRefundTransactionId`, `linkedSellTransactionId`). Every one of them must be reversed in `deleteInvestment`, and the relevant pointer must be reconciled in the matching `updateInvestment` edit branch. If you add a new transition that moves cash, add a matching field **and** an edit branch. When a transaction is removed by any other path (e.g. account deletion), the pointer on any surviving investment must be **nulled** — not left dangling.
- **Sold investments are read-locked on the buy side.** `InvestmentForm` disables `type`, `status`, `name`, `symbol`, `units`, `buyPrice`, `accountId`, and purchase `date` when `status === 'sold'`, because `store.ts`'s `isEditingSold` branch only reconciles the sell transaction. Sale price, sale date, and note remain editable. The store explicitly enforces this via `INVESTMENT_BUY_SIDE_FIELDS` and throws if bypassed.
- **Net worth formula:**

  ```
  netWorth = Σ(accounts where isIncludedInTotal).balance
           + Σ(loans active).remainingAmount (lent − borrowed)
           + Σ(investments).currentValue (active)
           + Σ(investments).appliedAmount (IPO applied, funds still blocked)
  ```

  Buying an investment swaps cash for an asset, so it is **net-worth neutral at purchase time**. Only price appreciation/depreciation and realized P&L move the needle. **Blocked IPO capital contributes to net worth but not to unrealized P&L** — `getInvestmentsSummary` tracks `blockedValue` separately from `currentValue` / `totalInvested`, and the portfolio header surfaces it as a distinct line.
- **Form remounting:** `TransactionSheet`, `LoanSheet`, `AccountSheet`, `BudgetSheet`, `CategorySheet`, and the investment sheets all remount their inner form on open (`key={open ? id : 'closed'}`) so local state never goes stale between openings. `TransferDialog` explicitly resets its internal state on open to match this behaviour.
- **Zustand subscriptions:** use `useShallow` whenever a component selects more than one field from the store. Selecting the entire store (`const { a, b, c, ... } = useStore()`) will re-render the component on *any* collection change and is a bug, not a style preference.
- **Destructive actions** must use `<ConfirmDialog>` (Radix Dialog). Toasts (Sonner) are not focus-trapped and are not accessible for destructive confirmations. The dialog awaits the returned promise; rejections keep the dialog open so the user can retry or cancel.
- **Deleting a category** recursively removes its descendants (BFS) so grandchildren are never orphaned.
- **Large writes must go through `commitInChunks`.** Firestore rejects a `writeBatch` above 500 ops. `commitInChunks` splits at 400. If you add a new bulk operation (a cascade delete, a wipe, a bulk import), wire it through `commitInChunks` rather than a raw `writeBatch`.
- **`formatCurrencyCompact`** uses `Intl.NumberFormat` with `notation: 'compact'` — avoids the `"1000.0K"` bug at the million boundary.
- **`hideBalances` defaults to `true`.** The eye button on any hero card toggles a session-wide unhide; the flag is intentionally not persisted so a fresh tab starts with balances hidden.

---

## Known Limitations

- **Invite-only by design.** There is no sign-up UI; users must be created manually in Firebase Console → Authentication. Access is revoked by deleting the Auth user.
- **Carry-over budgets** are stored but not yet applied in `getBudgetProgress` — the flag is forward-compatible.
- **Recurring transactions** are not implemented (categories include a `Repeat` icon, but no scheduler exists).
- **Multi-currency conversion** is not supported — one currency per user (set in Settings); account-level currency field exists but is informational.
- **Receipt uploads** (`receiptUrl`) are typed and stored but there is no upload UI yet.
- **`monthlyStartDay` preference** is stored but the aggregation currently uses calendar months.
- **Investment prices are manual.** There is no market-data feed yet — you update `currentPrice` per position. A future version could add a scheduled cloud function that fetches quotes from a provider (Alpha Vantage, Yahoo Finance, etc.) and calls `updateInvestmentPrice`.
- **Investment quantities cannot be split.** Selling always sells the full position. Partial sells would require splitting the record into "sold lot" + "remaining position" (or tracking lots) — deliberately out of scope for v1.
- **Sold investments cannot be un-sold.** The state machine treats `sold` as terminal. If a sale was recorded in error, the correct recovery is to delete the position and re-create it as active — which reverses the buy, refund, and sell transactions exactly.
- **No `allowlist` collection.** Earlier versions of the README mentioned one; it was removed. Access control is Firebase Auth + Firestore `isOwner(uid)` rules only.
- **`resetToSampleData`** exists in the store but is not wired to any UI. It's retained for a future "Load Sample Data" feature. `restoreDefaults` (the UI-facing path) is the one to use if you're re-seeding.
- **`favicon-32x32.png` and `favicon-16x16.png` are not shipped.** Modern browsers use the SVG favicon declared in `index.html`; the PNG fallbacks were removed to avoid 404s. If you need them for legacy browsers, generate them and add them to `public/`.

---

## License

This project is **open source** and released under the [MIT License](LICENSE).

You are free to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the software — as long as the original copyright notice and permission notice are included in all copies or substantial portions of the software.

See the [`LICENSE`](LICENSE) file for the full text.

---

<p align="center">
  <img src="public/kalcy-logo.svg" alt="Kalcy" width="160" />
  <br/>
  <em>Track it. Budget it. Invest it. Own it.</em>
</p>
