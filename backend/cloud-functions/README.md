# Cloud Functions (AI Proxy)

Este diretório contém o backend serverless do Smart Finance IA para chamadas de IA.
Ele não é um backend completo da aplicação, mas sim um conjunto de proxies HTTP seguros.

## Funções disponíveis

### 0) `openFinanceProxy`

- Objetivo: integração de Open Finance via agregador externo, com fallback embedded opcional para continuidade operacional.
- Ações suportadas (via `action` no body):
  - `list-connections`
  - `connect-bank`
  - `sync-connection`
  - `renew-connection`
  - `revoke-connection`
- Persistência:
  - conexões em `artifacts/{appId}/users/{userId}/open_finance_conexoes`
  - transações importadas em `artifacts/{appId}/users/{userId}/transacoes`
- Segurança operacional:
  - se `OPEN_FINANCE_PROVIDER` estiver `mock`/`disabled`, a função bloqueia (503)
  - se `OPEN_FINANCE_PROVIDER` não estiver entre os suportados (`pluggy`, `belvo`), a função bloqueia (503)
  - se `OPEN_FINANCE_UPSTREAM_URL` estiver ausente/placeholder e `OPEN_FINANCE_ALLOW_FALLBACK=false`, a função bloqueia (503)

### 1) `categorizeTransactions`

- Objetivo: categorizar transações com Gemini.
- Entrada: lista de itens + categorias permitidas.
- Saída: mapeamento `{ "index": "categoria" }`.

### 2) `analyzeSpendingInsights`

- Objetivo: gerar insights comparando período atual vs período anterior.
- Entrada: snapshot agregado de gastos dos dois períodos.
- Saída: resumo com aumentos, reduções e recomendações práticas.
- Regra de uso: limite diário previsto no backend (no momento, validação desativada temporariamente).
- Persistência: salva insight por período/filtro em `artifacts/{appId}/users/{userId}/consultor_insights/{insightKey}`.

### 3) `getAdminDashboard`

- Objetivo: retornar métricas gerenciais da plataforma para painel admin separado.
- Entrada: `appId`.
- Saída: visão agregada com:
  - usuários (cadastro + último acesso),
  - uso diário de IA (sincronização e consultor),
  - volume de transações por usuário,
  - aderência da categorização automática (aceita vs revisada manualmente).
- Segurança: acesso permitido somente para e-mail admin autorizado, autenticado via Google.

## Segurança aplicada

- Firebase Auth obrigatório (header `Authorization: Bearer <id_token>`).
- CORS controlado por `ALLOWED_ORIGINS` em `index.js`.
- Chave Gemini fica no servidor (`.env`), não no frontend.
- Estrutura de limite diário do Consultor IA pronta no backend (Firestore, transacional), com validação temporariamente desativada.

## Estrutura desta pasta

```text
backend/cloud-functions/
  index.js              # implementação das funções HTTP
  package.json          # dependências da function
  .env.example          # exemplo de variáveis locais
  .env                  # variáveis reais (NÃO versionar)
```

## Pré-requisitos

- Node.js 22
- Firebase CLI instalado e autenticado
- Projeto Firebase selecionado (`firebase use <project-id>`)

## Configuração local

1. Entrar na pasta:
   - `cd backend/cloud-functions`

2. Instalar dependências:
   - `npm install`

3. Criar `.env` local:
   - `cp .env.example .env`

4. Preencher variáveis:
   - `GEMINI_API_KEY=...`
   - `GEMINI_MODEL=gemini-2.5-flash-lite` (ou modelo disponível no seu projeto)
   - `GEMINI_FALLBACK_MODELS=gemini-2.5-flash-lite,gemini-2.5-flash,gemini-2.0-flash` (opcional, recomendado)
   - `OPEN_FINANCE_PROVIDER=pluggy` (suportados: `pluggy` ou `belvo`)
   - `OPEN_FINANCE_UPSTREAM_URL=https://seu-backend-open-finance.example.com/open-finance`
   - `OPEN_FINANCE_UPSTREAM_API_KEY=...` (se o upstream exigir)
   - `OPEN_FINANCE_ALLOW_FALLBACK=true` (opcional; padrão `true`)

## Checklist de produção — Open Finance

Antes de publicar em produção, valide este checklist:

1. `OPEN_FINANCE_PROVIDER` definido para um provider real suportado (`pluggy` ou `belvo`).
2. `OPEN_FINANCE_UPSTREAM_URL` apontando para um backend agregador ativo (HTTPS) com contrato compatível.
3. `OPEN_FINANCE_UPSTREAM_API_KEY` preenchida quando o upstream exigir autenticação por chave.
4. Deploy da função `openFinanceProxy` realizado com sucesso.
5. `runtime-config.js` com `openFinance.proxyUrl` apontando para a URL pública da função deployada.
6. Teste autenticado das ações `list-connections`, `connect-bank`, `sync-connection`, `renew-connection` e `revoke-connection`.
7. Se desejar operação estritamente real (sem fallback), definir `OPEN_FINANCE_ALLOW_FALLBACK=false`.

Se o upstream ficar indisponível e `OPEN_FINANCE_ALLOW_FALLBACK=true`, o backend mantém o fluxo operacional via modo embedded.

5. Voltar para a raiz:
   - `cd ../..`

## Deploy

Na raiz do projeto:

```bash
firebase deploy --only functions
```

Ou apenas uma função específica:

```bash
firebase deploy --only functions:categorizeTransactions
firebase deploy --only functions:analyzeSpendingInsights
firebase deploy --only functions:getAdminDashboard
firebase deploy --only functions:openFinanceProxy
```

## Configuração do frontend

No `runtime-config.js`, configure:

```js
ai: {
  proxyUrl: 'https://.../categorizetransactions...',
  consultantProxyUrl: 'https://.../analyzespendinginsights...',
  allowDirectRequest: false,
  directApiKey: ''
},
admin: {
  dashboardProxyUrl: 'https://.../getadmindashboard...'
}
```

Se `consultantProxyUrl` não for informado, o frontend tenta derivar automaticamente a URL trocando
`categorizetransactions` por `analyzespendinginsights`.

Para o painel admin, se `dashboardProxyUrl` não for informado, o frontend tenta derivar automaticamente
trocando `analyzespendinginsights` ou `categorizetransactions` por `getadmindashboard`.

## Contrato da API

### `POST openFinanceProxy`

Body base:

```json
{
  "appId": "smart-finance-production-v1",
  "action": "connect-bank"
}
```

#### Exemplo `connect-bank`

Request:

```json
{
  "appId": "smart-finance-production-v1",
  "action": "connect-bank",
  "bankCode": "nubank"
}
```

Response (resumo):

```json
{
  "connectionId": "nubank",
  "providerConnectionId": "conn_123",
  "authorizationUrl": "https://consent.provider.com/...",
  "insertedCount": 12,
  "skippedCount": 2,
  "connections": []
}
```

#### Exemplo `sync-connection`

Request:

```json
{
  "appId": "smart-finance-production-v1",
  "action": "sync-connection",
  "connectionId": "nubank"
}
```

#### Exemplo `renew-connection`

Request:

```json
{
  "appId": "smart-finance-production-v1",
  "action": "renew-connection",
  "connectionId": "nubank"
}
```

#### Exemplo `revoke-connection`

Request:

```json
{
  "appId": "smart-finance-production-v1",
  "action": "revoke-connection",
  "connectionId": "nubank"
}
```

#### Contrato esperado do upstream (agregador)

`openFinanceProxy` envia um `POST` para `OPEN_FINANCE_UPSTREAM_URL` com payload:

```json
{
  "provider": "pluggy",
  "action": "connect-bank",
  "appId": "smart-finance-production-v1",
  "bankCode": "nubank",
  "bankName": "Nubank",
  "context": { "userId": "firebase-uid" }
}
```

Resposta mínima esperada do upstream:

```json
{
  "connection": {
    "id": "conn_123",
    "status": "pending",
    "consentUrl": "https://consent.provider.com/...",
    "consentExpiresAt": "2026-06-30T00:00:00.000Z"
  },
  "transactions": [
    {
      "date": "2026-03-30",
      "title": "UBER *TRIP",
      "value": 23.9,
      "category": "Transporte",
      "accountType": "Conta"
    }
  ]
}
```

### `POST categorizeTransactions`

Body:

```json
{
  "items": [{ "index": 0, "title": "UBER TRIP" }],
  "categories": ["Alimentação", "Transporte", "Outros"]
}
```

Resposta:

```json
{
  "mapping": {
    "0": "Transporte"
  }
}
```

### `POST analyzeSpendingInsights`

Body (resumido):

```json
{
  "appId": "smart-finance-production-v1",
  "filters": {
    "startDate": "2026-03-02",
    "endDate": "2026-04-03",
    "accountType": "all",
    "category": "all"
  },
  "currentPeriod": {
    "startDate": "2026-03-02",
    "endDate": "2026-04-03",
    "total": 2500.0,
    "count": 62,
    "categoryBreakdown": [{ "category": "Transporte", "total": 380.0 }],
    "topTransactions": [{ "title": "Ribeirao Shopping", "value": 290.0 }]
  },
  "previousPeriod": {
    "startDate": "2026-02-02",
    "endDate": "2026-03-03",
    "total": 2100.0,
    "count": 57,
    "categoryBreakdown": [{ "category": "Transporte", "total": 260.0 }],
    "topTransactions": [{ "title": "Posto XPTO", "value": 170.0 }]
  }
}
```

### `POST getAdminDashboard`

Body:

```json
{
  "appId": "smart-finance-production-v1"
}
```

Resposta (resumo):

```json
{
  "generatedAt": "2026-03-19T12:00:00.000Z",
  "totals": {
    "users": 18,
    "activeUsers7d": 11,
    "importedTransactions": 1520,
    "aiCategorizationRuns": 94,
    "aiConsultantRuns": 27,
    "automationAcceptedRate": 82.4
  },
  "dailyUsage": {
    "aiCategorizationRunsByDay": [{ "dateKey": "2026-03-19", "count": 9 }],
    "aiConsultantRunsByDay": [{ "dateKey": "2026-03-19", "count": 4 }]
  },
  "users": [
    {
      "email": "cliente@dominio.com",
      "createdAt": "2026-03-10T10:00:00.000Z",
      "lastAccessAt": "2026-03-19T08:12:00.000Z",
      "transactions": { "imported": 120, "total": 125 },
      "automation": { "autoAcceptedTransactions": 88, "autoOverriddenTransactions": 14 }
    }
  ]
}
```

Resposta:

```json
{
  "insights": {
    "overview": "...",
    "increased": [{ "category": "Transporte", "current": 380, "previous": 260, "delta": 120, "insight": "..." }],
    "reduced": [],
    "criticalActions": ["..."],
    "dispensableCuts": ["..."]
  },
  "usage": {
    "limit": 3,
    "used": 1,
    "remaining": 2,
    "dateKey": "2026-03-18"
  }
}
```

## Erros comuns

- `401 Missing Authorization token`: token não enviado.
- `401 Invalid or expired Authorization token`: token inválido/expirado.
- `429 Daily limit reached for AI consultant`: pode ocorrer se a validação diária for reativada.
- `500 Missing GEMINI_API_KEY environment variable`: `.env` ausente ou incompleto.
- Erro de CORS: origem não está em `ALLOWED_ORIGINS`.
- `404 model not found`: ajuste `GEMINI_MODEL` ou use `GEMINI_FALLBACK_MODELS` para fallback automático.
- `403 Forbidden` em `getAdminDashboard`: usuário autenticado sem e-mail admin Google permitido.
- `503` no `openFinanceProxy`: backend bloqueado por provider inválido (`mock`/`disabled`) ou fallback desabilitado com upstream ausente/placeholder.

## Observação

Persistência de transações, cache local e UI ficam no frontend + Firestore.
Estas functions cuidam apenas das integrações de IA e proteção de acesso.
