# Frontend module map

- App shell:
  - `index.html` is the main SPA shell.
  - `firebase.json` rewrites `**` to `/index.html`.
  - `/admin` redirects to `/admin.html`.
  - `/termos` redirects to `/termos-de-uso.html`.

- Entrypoints:
  - `src/app.js` wires dependencies and owns `SmartFinanceApplication`.
  - `src/admin.js` is the admin page entry.

- Detailed module docs:
  - `mem:frontend/app-shell` for the runtime bootstrap and app-wide orchestration.
  - `mem:frontend/dashboard` for dashboard rendering and UI composition.
  - `mem:frontend/transactions` for import, manual transaction, and repository flows.
  - `mem:frontend/ai` for question validation and AI orchestration.
  - `mem:frontend/open-finance` for connection and sync UX.
  - `mem:frontend/goals` for goal CRUD and auto-generation.
  - `mem:frontend/admin` for the admin dashboard.

- Shared UI/domain helpers:
  - `src/services/category-memory-service.js` is the first-pass categorization engine.
  - `src/utils/transaction-utils.js` is the central transaction rule helper.
  - `src/utils/goal-utils.js` supports goal scoping and monthly calculations.

- Navigation rule:
  - Prefer adding behavior in `flows/`, `services/`, `utils/`, or dashboard `methods/` modules instead of inflating `src/app.js` or the dashboard shell.

- Use this memory as the index when you need the next file to inspect for frontend work.
