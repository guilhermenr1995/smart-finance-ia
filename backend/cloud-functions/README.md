# Cloud Functions (AI Proxy)

Este diretório contém o backend serverless do Smart Finance IA para chamadas de IA.
Ele não é um backend completo da aplicação, mas sim um conjunto de proxies HTTP seguros.

## Funções disponíveis

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

## Observação

Persistência de transações, cache local e UI ficam no frontend + Firestore.
Estas functions cuidam apenas das integrações de IA e proteção de acesso.
