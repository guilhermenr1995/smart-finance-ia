# Backend AI

- Finance question handler:
  - `backend/cloud-functions/src/handlers/answer-finance-question.js` is the main Q&A endpoint.
  - It validates free-form questions, detects projection intent, applies malicious-pattern guardrails, builds contextual datasets, and returns flexible answers grounded in the dataset.
  - Legacy sectioned answers are flattened before reaching the UI so the presentation can stay adaptive.
  - It keeps a deterministic fallback so blocked or failed Gemini calls still return something useful.

- Spending insights handler:
  - `backend/cloud-functions/src/handlers/analyze-spending-insights.js` produces comparative insights for a current period versus a previous period.
  - It can return cached insight documents when available.
  - It merges Gemini narrative with a deterministic baseline.

- Deterministic insight builders:
  - `backend/cloud-functions/src/ai/report-insights.js` builds the base consultant report, category comparisons, overview, alerts, and fallback actions.
  - `backend/cloud-functions/src/ai/report-insights-support.js` builds category drivers and merges narrative with deterministic data.
  - `backend/cloud-functions/src/ai/report-normalization.js` sanitizes periods, metrics, merchants, transactions, outliers, and projections.

- Categorization endpoint:
  - `backend/cloud-functions/src/handlers/categorize-transactions.js` asks Gemini to categorize transaction batches.

- Behavior rules:
  - future / projection questions should be accepted when they are clearly finance-related
  - outliers should not dominate projections or average calculations
  - fallback answers should remain practical and natural rather than forcing a fixed response template
  - answers should be grounded in the provided period and transaction context

- Use this memory when touching question validation, projections, spending insights, fallback logic, or report normalization.

- Related memories:
  - `mem:ai/consultant`
  - `mem:frontend/ai`
  - `mem:backend/core`
