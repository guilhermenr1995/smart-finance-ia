# AI consultant behavior

- `src/features/ai/flows/ai-flow.js` owns the user-facing AI flows:
  - `askAiFinanceQuestion`
  - `runAiConsultant`
  - `syncCategoriesWithAi`
  - `validateAiFinanceQuestion`
  - projection / future intent detection

- Free-form finance questions should stay permissive for legitimate business intent.
  - Accept projection / future / forecast wording.
  - Accept boleto, pagamento, fatura, saldo, planejamento, and similar finance vocabulary.
  - Keep malicious / injection filters, but avoid over-blocking real questions.

- Question policy:
  - `AI_FINANCE_QUESTION_MAX_LENGTH` is 500 chars.
  - Projection questions should be classified with `questionIntent: 'projection'` when applicable.
  - Keep the guardrails light enough that the assistant can answer useful follow-ups without being blocked too early.

- Projection behavior:
  - Use a projection context for future questions instead of treating them like generic Q&A.
  - Weight historical averages so outliers do not pull the forecast upward too much.
  - Exceptional transactions should get lower weight than normal-pattern transactions.
  - The goal is a practical estimate, not a naive mean.

- Backend counterpart:
  - `mem:backend/ai` covers the backend Q&A and spending-insights handlers, deterministic report builders, and normalization rules.
  - The backend must keep a deterministic fallback so projection questions still produce a grounded answer when Gemini is blocked or unavailable.

- UI rendering:
  - `src/features/dashboard/ui/dashboard-view/methods/ai-methods.js` renders the AI consultant blocks, including projection, tips, alerts, and category highlights.

- Related memories:
  - `mem:frontend/ai`
  - `mem:backend/ai`
  - `mem:frontend/dashboard`
