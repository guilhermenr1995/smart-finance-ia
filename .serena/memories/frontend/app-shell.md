# Frontend app shell

- Boot path:
  - `src/app.js` creates `SmartFinanceApplication` and wires the runtime services, views, and flows.
  - `src/admin.js` is the separate entry for the admin experience.
  - `index.html` is the SPA shell loaded by hosting rewrites.

- Core runtime modules:
  - `src/application/flows/auth-flow.js`
  - `src/application/flows/dashboard-flow.js`
  - `src/application/flows/data-sync-flow.js`
  - `src/application/flows/goal-flow.js`
  - `src/application/flows/open-finance-flow.js`
  - `src/application/flows/transaction-flow.js`
  - `src/application/flows/ai-flow.js`
  - `src/services/*` for auth, Firebase, repository, AI, CSV import, cache, push, PWA, and Open Finance.

- What belongs here:
  - startup orchestration
  - app-wide dependency wiring
  - auth bootstrap and session restore
  - cloud sync and cache hydration
  - cross-cutting state refresh flows

- What does not belong here:
  - dashboard rendering details
  - transaction import/parsing rules
  - AI question policy
  - Open Finance provider specifics
  - admin dashboard business logic

- Use this memory when you need the first file to inspect for application bootstrap or runtime composition.

- Related memories:
  - `mem:frontend/map`
  - `mem:frontend/dashboard`
  - `mem:frontend/transactions`
  - `mem:frontend/ai`
  - `mem:frontend/open-finance`
  - `mem:frontend/goals`
  - `mem:frontend/admin`
