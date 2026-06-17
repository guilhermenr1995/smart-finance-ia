# Backend admin

- Data aggregator:
  - `backend/cloud-functions/src/admin/dashboard-data.js` builds the operational payload for the admin dashboard.
  - It merges usage series, parses dates, and summarizes transaction collections for the admin view.

- HTTP facade:
  - `backend/cloud-functions/src/handlers/get-admin-dashboard.js` is the public admin endpoint.
  - It authenticates the request, validates admin access, and returns the aggregated payload.

- Payload shape:
  - the admin frontend expects consolidated totals, daily usage, highlights, and per-user summaries
  - changes here must stay in sync with `frontend/admin`

- Security rule:
  - backend auth is the source of truth for admin access
  - client allowlists are only UX

- Use this memory when changing admin metrics, daily usage series, summary cards, or backend admin authorization glue.

- Related memories:
  - `mem:frontend/admin`
  - `mem:backend/routes`
  - `mem:backend/core`
