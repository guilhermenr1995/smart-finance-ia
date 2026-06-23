# Quickstart - Controle Mensal Familiar

## Goal

Validate the new monthly family control page from the user's point of view.

## Manual Validation Flow

1. Open the new page while logged in with a normal user account.
2. Confirm that the login shell is the same as the main app and that the monthly workspace is isolated from the transactions dashboard.
3. Create at least two owners.
4. Add one income, one expense, and one caixinha reserve.
5. Edit a record and verify that the owner totals and family totals update immediately.
6. Replicate the current month to the next month.
7. Open the target month and confirm that owners and records were copied.
8. Attempt to replicate again into a month that already has content and confirm that the overwrite warning appears.

## What to Check

- The page opens with the current month selected.
- Owner summaries and the family summary stay easy to read.
- Caixinha reduces available income without being classified as an expense.
- The new module does not show transaction data from the main dashboard.
- The main app keeps a clear entry point to this page in the header.

## Implementation Guidance for Future Work

- Keep the monthly budget repository isolated from the transaction repository.
- Recompute visible totals after every change instead of waiting for a separate refresh action.
- Preserve the existing yellow/black visual language.
- Treat replication as a deliberate user action with confirmation when the destination already has data.
