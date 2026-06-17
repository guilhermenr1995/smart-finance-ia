# Transaction rules

- `src/utils/transaction-utils.js` centralizes the sensitive transaction logic:
  - dedup keys / hash generation (`generateTransactionHash`, `generateTransactionDedupKey`, `getTransactionTitleDedupKeys`)
  - title/date/value normalization
  - installment grouping (`getInstallmentInfo`, `getInstallmentGroupKey`)
  - transfer / open-finance detection (`isTransferTransactionTitle`, `isOpenFinanceTransaction`, `normalizeTransactionEntryType`)
  - display/search helpers (`matchesTransactionSearch`, `getDisplayCategory`, `getTransactionOriginLabel`, `getTransactionNetValue`)
  - statement classification (`isIncomeOrIgnoredStatement`, `isLikelyCheckingExpenseTitle`, `detectBaseCategory`)
  - dashboard summary helpers (`TransactionQueryService`)

- Import / categorization order:
  - `src/services/category-memory-service.js` is the first pass.
  - `src/features/transactions/flows/transaction-import-flow.js` applies memory categories during import before insert.
  - `src/features/ai/flows/ai-flow.js` uses memory first and only then AI for unresolved cases.

- Critical import rule:
  - Checking-account boleto / fatura payments must stay as expenses, not get swallowed by the "income or ignored statement" path.
  - Keep `isLikelyCheckingExpenseTitle` aligned with that behavior.

- Stability rule:
  - Dedup/hash behavior is shared by import, dashboard views, AI candidate selection, and Open Finance sync.
  - Changing title normalization or hash generation has wide blast radius; treat it as a domain contract.

- Category memory behavior:
  - Exact match first, similarity second.
  - Memory is used to reduce AI cost and should stay fast / deterministic.

- Related memories:
  - `mem:frontend/transactions`
  - `mem:backend/open-finance`
  - `mem:frontend/dashboard`
