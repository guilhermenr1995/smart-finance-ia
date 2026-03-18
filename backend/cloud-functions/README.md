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
- Regra de uso: **máximo de 3 análises por dia por usuário autenticado**.

## Segurança aplicada

- Firebase Auth obrigatório (header `Authorization: Bearer <id_token>`).
- CORS controlado por `ALLOWED_ORIGINS` em `index.js`.
- Chave Gemini fica no servidor (`.env`), não no frontend.
- Limite diário do Consultor IA validado no backend (Firestore, transacional).

## Estrutura desta pasta

```text
backend/cloud-functions/
  index.js              # implementação das duas funções HTTP
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
   - `GEMINI_MODEL=gemini-3.1-flash-lite` (ou modelo disponível no seu projeto)
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
```

## Configuração do frontend

No `runtime-config.js`, configure:

```js
ai: {
  proxyUrl: 'https://.../categorizetransactions...',
  consultantProxyUrl: 'https://.../analyzespendinginsights...',
  allowDirectRequest: false,
  directApiKey: ''
}
```

Se `consultantProxyUrl` não for informado, o frontend tenta derivar automaticamente a URL trocando
`categorizetransactions` por `analyzespendinginsights`.

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
- `429 Daily limit reached for AI consultant`: limite diário do Consultor IA atingido.
- `500 Missing GEMINI_API_KEY environment variable`: `.env` ausente ou incompleto.
- Erro de CORS: origem não está em `ALLOWED_ORIGINS`.
- `404 model not found`: ajuste `GEMINI_MODEL` ou use `GEMINI_FALLBACK_MODELS` para fallback automático.

## Observação

Persistência de transações, cache local e UI ficam no frontend + Firestore.
Estas functions cuidam apenas das integrações de IA e proteção de acesso.
