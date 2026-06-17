# Smart Finance IA - Core

- Start here:
  - `mem:frontend/map` for page routing, shell layout, and frontend module discovery.
  - `mem:frontend/app-shell` for startup orchestration, runtime wiring, and app-wide flows.
  - `mem:backend/routes` for Cloud Function exports, handler families, and backend security boundaries.
  - `mem:domain/transaction-rules` for import, dedup, installments, transfer detection, and statement rules.
  - `mem:ai/consultant` for free-question behavior, projections, and user-facing AI guardrails.
  - `mem:frontend/dashboard` for the dashboard view shell, charts, filters, and AI consultant rendering.
  - `mem:frontend/transactions` for import parsing, manual transaction behavior, and transaction repository flows.
  - `mem:frontend/ai` for question validation and frontend AI orchestration.
  - `mem:frontend/open-finance` for connection lifecycle and sync UX.
  - `mem:frontend/goals` for monthly goal CRUD and auto-generation.
  - `mem:frontend/admin` for the admin dashboard UI and maintenance actions.
  - `mem:backend/core` for auth, CORS, Gemini retries, and shared backend helpers.
  - `mem:backend/ai` for Q&A, spending insights, and report normalization.
  - `mem:backend/open-finance` for Pluggy integration, webhook processing, and sync internals.
  - `mem:backend/admin` for admin dashboard data aggregation.
  - `mem:backend/maintenance` for dedup and journey-reset jobs.

- Main entry files:
  - `src/app.js` is the main frontend orchestrator (`SmartFinanceApplication`).
  - `src/admin.js` + `admin.html` are the admin entry.
  - `backend/cloud-functions/index.js` exports the deployed backend functions.
  - `firebase.json` owns hosting redirects and the SPA rewrite.

- Fast navigation heuristic:
  - UI work: start in `frontend/app-shell`, then jump to the specific feature memory.
  - Dashboard work: use `frontend/dashboard`.
  - Transaction/import work: use `frontend/transactions`.
  - AI question or projection work: use `frontend/ai` + `backend/ai`.
  - Open Finance work: use `frontend/open-finance` + `backend/open-finance`.
  - Goal work: use `frontend/goals`.
  - Admin/support work: use `frontend/admin` + `backend/admin` + `backend/maintenance`.

- Baseline rule:
  - Prefer the smallest relevant memory first, then expand only if you need deeper implementation details.
