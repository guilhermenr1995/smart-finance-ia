# Backend maintenance

- HTTP handlers:
  - `backend/cloud-functions/src/handlers/maintenance-deduplicate-transactions.js` deduplicates a user transaction collection.
  - `backend/cloud-functions/src/handlers/maintenance-reset-user-journey.js` resets the user journey across collections.
  - `backend/cloud-functions/src/handlers/maintenance-delete-open-finance-transactions.js` removes Open Finance data for a user.

- Legacy helpers:
  - `backend/cloud-functions/src/maintenance/dedup-legacy.js` contains the heavy dedup and legacy reset helpers.
  - `backend/cloud-functions/src/maintenance/reset-user-journey.js` contains shared journey reset helpers.

- Behavior contracts:
  - these endpoints are admin / support operations, not normal product flows
  - batch deletes must remain safe and bounded
  - server-side auth and admin checks are mandatory
  - the reset logic touches multiple collections and should be treated as destructive

- Use this memory when working on cleanup scripts, admin maintenance tools, dedup jobs, or journey resets.

- Related memories:
  - `mem:frontend/admin`
  - `mem:backend/routes`
  - `mem:backend/core`
