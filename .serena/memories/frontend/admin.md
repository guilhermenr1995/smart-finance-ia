# Frontend admin

- Entry point:
  - `src/admin.js` bootstraps the admin experience.
  - `src/features/admin/dashboard/index.js` exports `bootstrapAdmin`.

- Core app object:
  - `src/features/admin/dashboard/admin-dashboard-app.js` wires the admin screens, DOM references, state containers, and allowed email checks.

- Method modules:
  - `methods/lifecycle-methods.js` controls startup and page lifecycle.
  - `methods/auth-ui-methods.js` handles login/logout UI state and messages.
  - `methods/dashboard-data-methods.js` loads the server payload.
  - `methods/render-dashboard-methods.js` renders the dashboard cards and summaries.
  - `methods/user-list-methods.js` builds the opportunity users list, filtering, pagination, and top users.
  - `methods/maintenance-methods.js` drives admin maintenance actions.
  - `methods/register-methods.js` composes the mixins.

- Shared helpers:
  - `src/features/admin/dashboard/shared.js` contains admin constants and normalization helpers.

- Access rule:
  - The UI only allows Google-authenticated admins whose email is in the allowed list.
  - Server-side authorization is still the real boundary.

- Use this memory when changing admin metrics, maintenance actions, user tables, access UI, or pagination.

- Related memories:
  - `mem:backend/admin`
  - `mem:backend/routes`
  - `mem:backend/maintenance`
  - `mem:frontend/app-shell`
