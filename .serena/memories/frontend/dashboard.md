# Frontend dashboard

- Main view:
  - `src/features/dashboard/ui/dashboard-view/dashboard-view.js` is a thin shell.
  - `src/features/dashboard/ui/dashboard-view/methods/register-methods.js` composes the dashboard mixins.

- Dashboard method modules:
  - `core-methods.js` handles filters, pagination, initial setup, category options, and bank guide state.
  - `render-summary-methods.js` renders summary cards and the category pie chart.
  - `transaction-render-methods.js` renders transactions, category stats, and category charts.
  - `interaction-methods.js` contains user interaction helpers.
  - `modal-methods.js` contains create/edit modal behavior.
  - `pagination-goals-methods.js` handles goals pagination and goal-related UI slices.
  - `render-engagement-methods.js` renders engagement and prompt blocks.
  - `ai-methods.js` renders consultant blocks, projection blocks, lists, tips, alerts, and category highlights.
  - `bind-events-core-methods.js` and `bind-events-modal-methods.js` attach DOM events.

- Data source:
  - `src/application/flows/dashboard-flow.js` builds visible transactions, summary totals, previous-period comparison, goal scope, rhythm by day, and pending AI counts.
  - It is the right place to inspect when dashboard aggregates feel wrong.

- What belongs here:
  - filters and search behavior
  - summary cards, charts, and dashboard sections
  - transaction table rendering
  - modal and interaction flows for the dashboard
  - AI consultant presentation on the dashboard

- What does not belong here:
  - transaction import parsing
  - AI validation policy
  - backend query construction
  - Open Finance sync internals

- Use this memory before editing any dashboard card, table, chart, modal, or filter behavior.

- Related memories:
  - `mem:frontend/app-shell`
  - `mem:frontend/transactions`
  - `mem:frontend/ai`
  - `mem:domain/transaction-rules`
  - `mem:ai/consultant`
