# Smart Finance IA — Contexto do Painel Administrativo (Gerencial)

## 1) Objetivo do painel gerencial

O painel administrativo existe para acompanhar a **saúde operacional da plataforma** com foco em:
- adoção (usuários ativos),
- volume de uso (transações importadas/manuais),
- eficiência da automação (aceitação da categorização automática),
- consumo de IA (sincronização e consultor por dia),
- identificação de gargalos (usuários com pendências de categoria e baixa atividade).

Entrada da interface: `admin.html` + `src/admin.js`.

---

## 2) Fluxo de autenticação e autorização

### Frontend (`src/admin.js`)
1. Login via Google (`signInWithPopup`).
2. Bloqueio inicial por whitelist de e-mails no cliente:
   - `DEFAULT_ADMIN_EMAILS` + `config.admin.allowedEmails`.
3. Se aprovado no frontend, chama endpoint administrativo com token Firebase (`Authorization: Bearer <idToken>`).

### Backend (`backend/cloud-functions/index.js`)
1. Valida token (`authenticateRequest`).
2. Revalida privilégio admin no servidor (`isAdminRequest`) com regras:
   - e-mail presente,
   - provider = `google.com`,
   - e-mail dentro de allowed list (default + env `ADMIN_ALLOWED_EMAILS`).
3. Se não autorizado: `403 Forbidden`.

> Regra importante: a autorização verdadeira é sempre a do backend.

---

## 3) Endpoint administrativo

Função Cloud Function: `getAdminDashboard`.

### Requisição
- Método: `POST`
- Body mínimo:
```json
{ "appId": "smart-finance-production-v1" }
```
- Headers:
  - `Content-Type: application/json`
  - `Authorization: Bearer <Firebase ID Token>`

### Resposta (alto nível)
- `generatedAt`, `appId`, `admin`
- `totals` (agregados globais)
- `dailyUsage` (uso IA por dia)
- `highlights` (insights operacionais rápidos)
- `users` (lista detalhada por usuário)

---

## 4) Métricas retornadas pelo backend

### Totais principais
- `users`, `activeUsers7d`, `activeUsers30d`
- `transactions`, `importedTransactions`, `manualTransactions`
- `pendingCategorization`
- `aiCategorizationRuns`, `aiConsultantRuns`
- `automationAcceptedRate`, `automationOverrideRate`
- `averageTransactionsPerUser`

### Séries diárias
- `dailyUsage.aiCategorizationRunsByDay[]`
- `dailyUsage.aiConsultantRunsByDay[]`

### Highlights
- `usersWithNoTransactions`
- `usersWithPendingCategorization`
- `topUsersByVolume[]`

### Por usuário (`users[]`)
- identificação: `uid`, `email`, `displayName`, datas
- uso transacional: `transactions.*`
- uso IA: `aiUsage.*`
- automação: `automation.*` (aceitas/revisadas/taxa)

---

## 5) Fontes de dados do painel

`getAdminDashboard` agrega dados de:
1. `artifacts/{appId}/users` (perfil)
2. `collectionGroup('metrics_daily')` (uso diário IA/importações)
3. `artifacts/{appId}/users/{userId}/transacoes` (estatísticas por usuário)

O backend produz visão consolidada para o frontend não precisar orquestrar múltiplas consultas.

---

## 6) Renderização no frontend admin

`src/admin.js` organiza visualmente em 4 blocos:
1. **Summary cards** (visão executiva)
2. **Uso diário de IA** (sincronização e consultor)
3. **Top usuários por volume**
4. **Tabela/cartões de usuários** com métricas detalhadas

Arquivo de layout: `admin.html`.

---

## 7) Resolução da URL do endpoint admin

A URL pode vir de 3 formas (`resolveAdminDashboardUrl`):
1. `config.admin.dashboardProxyUrl` (preferencial)
2. derivação de `config.ai.consultantProxyUrl` substituindo `analyzespendinginsights` por `getadmindashboard`
3. derivação de `config.ai.proxyUrl` substituindo `categorizetransactions` por `getadmindashboard`

Se nenhuma existir, o painel apresenta erro orientando configurar runtime-config.

---

## 8) Riscos/atenções para manutenção

1. **Drift de contrato JSON** entre backend e frontend admin pode quebrar cards/listas.
2. **Whitelist client-side** é só UX; segurança é server-side.
3. **Mudanças em `metrics_daily`** impactam séries diárias e totais.
4. **Consultas por usuário** podem crescer com base grande; monitorar custo/latência.
5. `runtime-config.js` precisa conter bloco `admin` em produção para reduzir acoplamento por URL derivada.

---

## 9) Checklist para mudanças no painel gerencial

Ao alterar qualquer parte do painel admin, validar:
1. login Google no `admin.html`.
2. bloqueio de não-admin no frontend e backend.
3. chamada ao endpoint com token válido.
4. renderização de cards com payload completo e payload parcial.
5. fallback amigável quando endpoint retorna erro.
6. consistência das métricas de automação (accepted vs override).
7. série diária de IA exibindo ordenação correta e sem quebrar com array vazio.

---

## 10) Prompt recomendado para agentes (usar antes de tarefas admin)

"Leia `02_admin_dashboard_context_and_operations.md` e trate como contexto obrigatório. Preserve segurança server-side de autorização admin, contrato JSON de `getAdminDashboard`, e consistência das métricas operacionais (totals/dailyUsage/highlights/users)."