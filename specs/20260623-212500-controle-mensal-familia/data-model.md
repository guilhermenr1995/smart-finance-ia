# Data Model - Controle Mensal Familiar

## Overview

The new module is centered on a monthly workspace. Each workspace belongs to one authenticated user and contains:

- the month context;
- the list of owners;
- the list of manual budget records;
- derived totals for owner-level and family-level views.

## Entities

### MonthlyBudgetWorkspace

Represents the budget plan for one month.

| Field | Purpose | Rules |
| --- | --- | --- |
| `monthKey` | Identifies the month in `YYYY-MM` format | Required, unique per user |
| `label` | Human-readable month label | Required |
| `sourceMonthKey` | Original month when the workspace was replicated | Optional |
| `status` | Indicates whether the month is active or replicated | Required |
| `notes` | General notes for the month | Optional |
| `createdAt` | Creation timestamp | Required |
| `updatedAt` | Last update timestamp | Required |

### Owner

Represents a family member or responsible person in the monthly plan.

| Field | Purpose | Rules |
| --- | --- | --- |
| `ownerId` | Stable identifier | Required |
| `name` | Display name | Required, unique per month |
| `order` | Visual ordering in the page | Required |
| `active` | Indicates if the owner is shown | Required |
| `createdAt` | Creation timestamp | Required |
| `updatedAt` | Last update timestamp | Required |

### BudgetRecord

Represents a manual monthly record.

| Field | Purpose | Rules |
| --- | --- | --- |
| `recordId` | Stable identifier | Required |
| `monthKey` | Parent month | Required |
| `ownerId` | Responsible owner | Required |
| `type` | `income`, `expense`, or `reserve` | Required |
| `name` | Record label | Required |
| `amount` | Monetary value | Required, positive |
| `notes` | Supporting text | Optional |
| `order` | Visual ordering | Required |
| `createdAt` | Creation timestamp | Required |
| `updatedAt` | Last update timestamp | Required |

### MonthlySummary

Derived view used only for display.

| Field | Purpose |
| --- | --- |
| `grossIncomeByOwner` | Total receipts per owner |
| `expenseTotalByOwner` | Total expenses per owner |
| `reserveTotalByOwner` | Total caixinha per owner |
| `netAvailableByOwner` | Income minus expenses minus reserve |
| `familyGrossIncome` | Sum of all owner incomes |
| `familyExpenseTotal` | Sum of all owner expenses |
| `familyReserveTotal` | Sum of all owner reserves |
| `familyNetAvailable` | Family income minus expenses minus reserve |
| `projectedSavings` | Positive remainder after all deductions |
| `projectedDeficit` | Negative remainder when deductions exceed income |

## Relationships

- One `MonthlyBudgetWorkspace` has many `Owner` records.
- One `MonthlyBudgetWorkspace` has many `BudgetRecord` entries.
- Every `BudgetRecord` belongs to exactly one `Owner`.
- `MonthlySummary` is always derived from the records of the selected month.

## Validation Rules

- Month keys must follow `YYYY-MM`.
- Owner names must not be empty.
- Budget record names must not be empty.
- Amounts must be greater than zero.
- Every record must belong to one owner.
- Caixinha records must behave as reserve entries and not as expenses.
- Replication must preserve the owner structure and record values, while creating a fresh month workspace.

## Storage Notes

- The module should use a dedicated collection tree under the authenticated user's namespace.
- Transaction data, AI insights, goals, and other existing domains must remain untouched.
- Any totals shown in the UI are derived values and should not be edited directly.
