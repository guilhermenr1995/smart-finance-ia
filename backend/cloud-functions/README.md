# Cloud Functions (Smart Finance IA)

Este backend expõe proxies HTTP para IA e para Open Finance.

## Funções

1. `openFinanceProxy` (HTTP)
- Fluxo Open Finance **exclusivo Meu Pluggy**.
- Ações:
  - `list-connections`
  - `connect-bank`
  - `sync-connection`
  - `renew-connection`
  - `revoke-connection`
  - `setup-webhooks`

2. `openFinanceWebhook` (HTTP)
- Endpoint para receber eventos do Pluggy (`transactions/*`, `item/*`).
- Responde rápido com `2xx` e enfileira o evento.

3. `openFinanceWebhookWorker` (Firestore Trigger)
- Processa eventos enfileirados em `open_finance_webhook_events`.
- Faz sync incremental e persiste transações em `transacoes`.

4. `categorizeTransactions`
5. `analyzeSpendingInsights`
6. `getAdminDashboard`

## Persistência Open Finance

- Conexões: `artifacts/{appId}/users/{userId}/open_finance_conexoes`
- Transações importadas: `artifacts/{appId}/users/{userId}/transacoes`
- Fila de webhook: `open_finance_webhook_events`

## Variáveis de ambiente (Open Finance)

Obrigatórias:

- `OPEN_FINANCE_MEU_PLUGGY_CLIENT_ID`
- `OPEN_FINANCE_MEU_PLUGGY_CLIENT_SECRET`

Recomendadas:

- `OPEN_FINANCE_MEU_PLUGGY_API_BASE_URL=https://api.pluggy.ai`
- `OPEN_FINANCE_MEU_PLUGGY_SYNC_FROM_DAYS=60`
- `OPEN_FINANCE_MEU_PLUGGY_ACCOUNT_TYPES=BANK,CREDIT`

Webhook:

- `OPEN_FINANCE_MEU_PLUGGY_WEBHOOK_ENABLED=true`
- `OPEN_FINANCE_MEU_PLUGGY_WEBHOOK_SECRET=<segredo>`
- `OPEN_FINANCE_MEU_PLUGGY_WEBHOOK_HEADER_NAME=x-open-finance-webhook-secret`
- `OPEN_FINANCE_MEU_PLUGGY_WEBHOOK_ALLOW_UNSIGNED=true` (somente testes)
- `OPEN_FINANCE_MEU_PLUGGY_WEBHOOK_AUTOCONFIG=false`
- `OPEN_FINANCE_MEU_PLUGGY_WEBHOOK_URL=https://<...>/openFinanceWebhook`

## Variáveis removidas (não usadas)

Estas variáveis não fazem mais parte da arquitetura:

- `OPEN_FINANCE_UPSTREAM_URL`
- `OPEN_FINANCE_UPSTREAM_API_KEY`
- `OPEN_FINANCE_ALLOW_FALLBACK`
- `OPEN_FINANCE_PLUGGY_ITEM_IDS`

## Como preencher as credenciais do Meu Pluggy

1. Entre em `https://meu.pluggy.ai/api-guide`.
2. Abra o Dashboard Pluggy da sua aplicação.
3. Copie `Client ID` e `Client Secret` da aplicação.
4. Preencha no `.env`:
   - `OPEN_FINANCE_MEU_PLUGGY_CLIENT_ID`
   - `OPEN_FINANCE_MEU_PLUGGY_CLIENT_SECRET`

## Configuração de webhook no Pluggy (manual)

1. URL: sua função `openFinanceWebhook` (HTTPS pública).
2. Evento: cadastrar pelo menos:
   - `transactions/created`
   - `transactions/updated`
   - `transactions/deleted`
   - `item/updated`
   - `item/error`
   - `item/waiting_user_input`
3. Header customizado:
   - Nome: `x-open-finance-webhook-secret` (ou o nome em `OPEN_FINANCE_MEU_PLUGGY_WEBHOOK_HEADER_NAME`)
   - Valor: mesmo valor de `OPEN_FINANCE_MEU_PLUGGY_WEBHOOK_SECRET`

## Deploy

Na raiz do projeto:

```bash
firebase deploy --only functions
```

Ou somente Open Finance:

```bash
firebase deploy --only functions:openFinanceProxy,functions:openFinanceWebhook,functions:openFinanceWebhookWorker
```
