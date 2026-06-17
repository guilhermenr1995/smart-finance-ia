# Frontend goals

- Main flow:
  - `src/features/goals/flows/goal-flow.js` handles save, delete, automatic generation, and reference-month deletion of monthly goals.
  - `src/features/goals/flows/goal-flow-helpers.js` contains the supporting goal-generation and merge logic.

- Shared helpers:
  - `src/utils/goal-utils.js` provides scope normalization, month helpers, labels, and dashboard-facing goal calculations.

- Behavior rules:
  - Goals cannot be created or edited for closed months.
  - Automatic goal generation depends on enough historical months.
  - Generated goals are scoped by account type and reference month.
  - After saving, deleting, or generating goals, the app refreshes the dashboard and cache.

- Dashboard relationship:
  - The dashboard consumes monthly goals to render progress and scoped totals.
  - Goal handling is therefore part of the dashboard data model even if the controls live elsewhere.

- Use this memory when touching monthly goal CRUD, scope rules, automatic suggestions, or dashboard goal progress.

- Related memories:
  - `mem:frontend/dashboard`
  - `mem:frontend/app-shell`
