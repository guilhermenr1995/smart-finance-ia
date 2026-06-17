# Backend core

- Shared plumbing:
  - `backend/cloud-functions/src/core/base.js` owns `onRequest` imports, Firestore/auth bootstrap, CORS, preflight handling, request authentication, and common constants.
  - `backend/cloud-functions/src/core/domain-utils.js` contains transaction/domain normalization, amounts, dates, labels, dedup, matching, and summary helpers.
  - `backend/cloud-functions/src/core/gemini-services.js` handles Gemini request orchestration, model fallback, daily consultant usage, and JSON prompt helpers.
  - `backend/cloud-functions/src/core/external-services.js` wraps the external integrations used by handlers.

- Important helpers:
  - `setCorsHeaders`
  - `handlePreflightAndMethod`
  - `authenticateRequest`
  - `requestGeminiWithRetry`
  - `buildModelCandidates`
  - `safeParseJson`
  - `resolveInsightKey`
  - `getDateKeyInTimezone`
  - `isAdminRequest`
  - `uniqueNonEmpty`

- Data / security contracts:
  - server-side auth is authoritative
  - CORS and `Authorization: Bearer <Firebase ID token>` behavior must be preserved for public HTTP handlers
  - retryable status logic exists for Gemini and should be reused rather than duplicated
  - insight keys and daily usage keys are shared contracts

- When to start here:
  - any new Cloud Function handler
  - auth / CORS changes
  - Gemini model routing or fallback changes
  - helper reuse across handlers

- Related memories:
  - `mem:backend/routes`
  - `mem:backend/ai`
  - `mem:backend/open-finance`
  - `mem:backend/maintenance`
