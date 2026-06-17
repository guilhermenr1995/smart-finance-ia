# Backend open finance

- HTTP / worker entrypoints:
  - `backend/cloud-functions/src/handlers/open-finance-proxy.js` is the public bridge for connection lifecycle actions.
  - `backend/cloud-functions/src/handlers/open-finance-webhook.js` handles the HTTP webhook endpoint and the Firestore worker that processes queued events.

- Pluggy client:
  - `backend/cloud-functions/src/open-finance/meu-pluggy-client.js` manages Meu Pluggy authentication, item lookup/update, account listing, transaction listing, webhook calls, and sync helpers.
  - It caches the API key and normalizes error payloads.

- Sync engine:
  - `backend/cloud-functions/src/open-finance/meu-pluggy-sync.js` maps Pluggy data into app records, deduplicates transactions, builds transaction titles, manages webhook events, and persists synced data.
  - It contains the core logic for classifying Open Finance statements and deciding what to import.

- Push notifications:
  - `backend/cloud-functions/src/open-finance/meu-pluggy-push.js` registers/unregisters FCM subscriptions and sends notifications when new Open Finance transactions arrive.

- Cleanup:
  - `backend/cloud-functions/src/open-finance/open-finance-cleanup.js` deletes Open Finance records and orphaned artifacts for a user or connection.

- Provider contract:
  - the supported provider in this repo is Meu Pluggy
  - transaction mapping, dedup, and status mapping are sensitive contracts
  - webhook enablement, secret validation, and event queue behavior matter for reliability

- Use this memory when touching Open Finance connection flow, webhook processing, sync behavior, notification delivery, or cleanup.

- Related memories:
  - `mem:frontend/open-finance`
  - `mem:backend/routes`
  - `mem:backend/core`
