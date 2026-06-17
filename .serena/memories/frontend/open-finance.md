# Frontend open finance

- Main flow:
  - `src/application/flows/open-finance-flow.js` handles load, connect, sync, renew, revoke, and delete operations for Open Finance.
  - It also hydrates and persists the Meu Pluggy item ID in localStorage.

- Service layer:
  - `src/services/open-finance-service.js` is the transport wrapper for the backend bridge.
  - `src/services/push-notification-service.js` and `src/services/pwa-service.js` support push registration and web app notification setup.

- Provider contract:
  - The current frontend only supports the `meu-pluggy` bank code.
  - Connection setup requires the Meu Pluggy item ID.
  - The UI uses `MEU_PLUGGY_ITEM_STORAGE_KEY` and `MEU_PLUGGY_INPUT_ID` to persist the item ID.

- User-visible behavior:
  - On connect/sync, the app refreshes dashboard data, persistence cache, and push subscriptions.
  - On delete, it forces a full cloud refresh because the connection removal can delete linked transactions and orphaned categories.

- What belongs here:
  - connection lifecycle
  - item ID persistence
  - sync and revoke UX
  - push notification bootstrap

- What does not belong here:
  - Pluggy API request logic
  - webhook worker logic
  - transaction mapping internals

- Related memories:
  - `mem:backend/open-finance`
  - `mem:frontend/transactions`
  - `mem:frontend/app-shell`
