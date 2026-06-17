# Backend route map

- Export surface:
  - `backend/cloud-functions/index.js` exports the deployed functions:
    - `openFinanceProxy`
    - `openFinanceWebhook`
    - `openFinanceWebhookWorker`
    - `categorizeTransactions`
    - `analyzeSpendingInsights`
    - `answerFinanceQuestion`
    - `getAdminDashboard`
    - `maintenanceDeduplicateTransactions`
    - `maintenanceResetUserJourney`
    - `maintenanceDeleteOpenFinanceTransactions`

- Handler layout:
  - HTTP handlers live in `backend/cloud-functions/src/handlers/*.js`.
  - Most use `onRequest(...)`.
  - `backend/cloud-functions/src/handlers/open-finance-webhook.js` also defines `onDocumentCreated(...)` for the Firestore worker.

- Detailed backend docs:
  - `mem:backend/core` for auth, CORS, Gemini retries, and shared helpers.
  - `mem:backend/ai` for finance Q&A, spending insights, and report normalization.
  - `mem:backend/open-finance` for Pluggy sync, webhooks, push notifications, and cleanup.
  - `mem:backend/admin` for admin dashboard data aggregation.
  - `mem:backend/maintenance` for dedup and journey-reset operations.

- High-value handlers:
  - `backend/cloud-functions/src/handlers/answer-finance-question.js` is the largest handler; it contains validation, projection context, deterministic fallback, and the Gemini answer path.
  - `backend/cloud-functions/src/handlers/analyze-spending-insights.js` provides the comparative insight endpoint.
  - `backend/cloud-functions/src/handlers/get-admin-dashboard.js` is admin-only and server-authoritative for authorization.
  - `backend/cloud-functions/src/handlers/open-finance-webhook.js` handles the webhook plus the Firestore worker.

- Security boundary:
  - Server-side auth is authoritative.
  - Client-side checks are only UX; do not rely on frontend allowlists for security.
  - Preserve CORS + `Authorization: Bearer <Firebase ID token>` behavior for public HTTP handlers.

- Use this memory when you need to navigate from an exported function to the correct backend family.
