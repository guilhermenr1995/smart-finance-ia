# Frontend AI

- Main flow:
  - `src/features/ai/flows/ai-flow.js` owns the user-facing AI experience.
  - It orchestrates question validation, consultant generation, category sync, projection intent detection, and UI-facing AI responses.

- AI helpers:
  - `src/features/ai/flows/ai-flow-helpers.js` builds deterministic insights, outlier stats, top merchants, quantiles, and rounding helpers.
  - These helpers are used to keep AI responses grounded in data.

- Service layer:
  - `src/services/ai-consultant-service.js` calls the backend question/consultant endpoints.
  - `src/services/ai-categorization-service.js` handles AI-assisted categorization.

- Question policy:
  - The free-form question field should stay permissive for legitimate finance language.
  - Projection, future, forecast, estimate, and "same pattern" wording should be accepted and classified as projection intent when appropriate.
  - Guardrails should block obvious abuse, but not over-block real finance questions.
  - The current max length is 500 characters.

- UI rendering:
  - `src/features/dashboard/ui/dashboard-view/methods/ai-methods.js` renders consultant blocks, projection output, lists, tips, alerts, and category highlights.

- What belongs here:
  - consultant UX
  - finance question validation
  - projection intent routing
  - AI categorization orchestration
  - deterministic fallback presentation

- What does not belong here:
  - backend model routing
  - Open Finance sync internals
  - transaction import parsing

- Related memories:
  - `mem:ai/consultant`
  - `mem:backend/ai`
  - `mem:frontend/dashboard`
  - `mem:frontend/app-shell`
