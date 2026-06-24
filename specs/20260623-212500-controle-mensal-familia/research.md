# Research - Controle Mensal Familiar

## Decision 1: Separate budget domain from the transaction domain

- **Decision**: The new page will use a dedicated Firestore namespace and a dedicated repository, with no shared tables or shared write paths with the transaction module.
- **Rationale**: The user asked for a fully apart area. A separate namespace preserves that isolation while still staying inside the current Firebase project and auth model.
- **Alternatives considered**:
  - Reusing the existing transaction collections. Rejected because it would mix planning data with bank data.
  - Creating a second Firebase project. Rejected for v1 because it adds operational overhead and is not necessary to preserve logical separation.

## Decision 2: Month is the top-level workspace unit

- **Decision**: Each budget scenario will be organized around one month key, with owners and records inside that monthly workspace.
- **Rationale**: The product goal is monthly planning and easy replication from one month to the next.
- **Alternatives considered**:
  - A single long-lived budget board with monthly filters. Rejected because replication and month-by-month comparison become harder to reason about.
  - One record list without a month root. Rejected because it would make cloning and monthly summary boundaries fragile.

## Decision 3: Caixinha is a neutral reserve entry

- **Decision**: Caixinha will be modeled as a neutral record type that reduces available income but is not counted as expense or income.
- **Rationale**: This matches the business rule described by the user and keeps the family balance readable.
- **Alternatives considered**:
  - Treating caixinha as a special expense. Rejected because it distorts the meaning of expense and hides the reserve intent.
  - Treating caixinha as income. Rejected because it would overstate the usable balance.

## Decision 4: Owner summaries and family summary are derived views

- **Decision**: Totals will be calculated from the records in the current month and shown as derived summaries instead of being manually entered.
- **Rationale**: Derived summaries avoid inconsistency and keep the page trustworthy.
- **Alternatives considered**:
  - Storing totals as editable fields. Rejected because totals could drift from the records.
  - Recomputing only at replication time. Rejected because the page needs immediate feedback after every edit.

## Decision 5: Replication is an explicit action with overwrite confirmation

- **Decision**: Replication will copy the current month scenario to a target month and require confirmation if the destination already has data.
- **Rationale**: The user wants speed, but also clear control over overwriting an existing scenario.
- **Alternatives considered**:
  - Automatic merge. Rejected because it is ambiguous and easy to misuse.
  - Silent overwrite. Rejected because it is unsafe for a financial planning workflow.

## Decision 6: Reuse the current visual language

- **Decision**: The new page will keep the yellow/black brutalist language and the same authenticated shell as the rest of the app.
- **Rationale**: This keeps the experience coherent and reduces cognitive load.
- **Alternatives considered**:
  - A new visual theme. Rejected because this is a new area, not a new brand.
  - A plain spreadsheet-like UI. Rejected because the request explicitly aims to replace the spreadsheet experience.
