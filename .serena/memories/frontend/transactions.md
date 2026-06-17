# Frontend transactions

- Main flows:
  - `src/features/transactions/flows/transaction-import-flow.js` handles CSV/PDF/OFX import, cloud sync before import, memory-based category application, dedup, and persistence.
  - `src/features/transactions/flows/transaction-management-flow.js` handles manual creation, category edits, bank account edits, activation toggles, and bulk assignment helpers.
  - `src/features/transactions/flows/transaction-flow.js` is only a re-export layer.

- Shared transaction helpers:
  - `src/features/transactions/flows/transaction-flow-helpers.js` holds normalization and reusable helpers for manual transactions, account names, installment grouping, dedup keys, and category metadata.
  - `src/utils/transaction-utils.js` is the domain contract for dedup, normalization, installment logic, transfer detection, search helpers, statement classification, and summary helpers.

- Import stack:
  - `src/features/transactions/services/csv-import/csv-import-service.js` routes parsing work.
  - `file-parse-methods.js` handles file type detection and parsing.
  - `csv-layout-methods.js` resolves CSV layout, signed checking values, and column mapping.
  - `pdf-methods.js` extracts PDF lines into transactions.
  - OFX parsing is handled in the file-parse layer.
  - `src/services/category-memory-service.js` is applied before insert to reduce AI cost.

- Repository layer:
  - `src/features/transactions/services/transaction-repository/transaction-repository.js` is the real repository implementation.
  - `src/services/transaction-repository.js` is the top-level wrapper entry.

- Important behavioral contract:
  - checking-account boleto and fatura payments must remain expenses during import and must not be swallowed by an income/ignored branch.
  - dedup keys and hashes are shared across import, dashboard, AI candidate selection, and Open Finance sync.
  - changing normalization can have a wide blast radius.

- Use this memory when the work involves import files, duplicate detection, manual transactions, category propagation, or bank account assignment.

- Related memories:
  - `mem:frontend/app-shell`
  - `mem:domain/transaction-rules`
  - `mem:frontend/dashboard`
