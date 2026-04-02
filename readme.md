# Smart Finance IA

Aplicação web + PWA para controle financeiro pessoal com foco em execução rápida:
- importar extratos,
- organizar automaticamente com IA,
- acompanhar metas,
- analisar gastos por categoria e por dia,
- operar tudo em um dashboard único (mobile e desktop).

## Visão do produto (estado atual)

O fluxo principal da aplicação hoje é:
1. Login (e-mail/senha ou Google).
2. Importação de dados (CSV, OFX, PDF) e/ou sincronização via Open Finance.
3. Organização automática por categorias (memória + IA).
4. Gestão diária no dashboard com filtros, metas e análise visual.

A dashboard do usuário está estruturada em seções por acordeon, com foco em clareza e baixa fricção:
- `1` Importação e guia rápido.
- `2` Filtros avançados.
- `3` Gastos por categoria (pizza).
- `4` Mix de gastos + metas mensais.
- `5` Consultor IA.
- `6` Open Finance.
- `7` Ritmo do mês (gasto diário com detalhamento por transação).
- `8` Lançamentos detalhados.

Além disso, existe um painel administrativo em `/admin` para métricas e manutenção operacional.

## Principais funcionalidades

### Autenticação e sessão

- Login com e-mail/senha.
- Cadastro com e-mail/senha.
- Login com Google.
- Recuperação de senha por e-mail.
- Persistência local de sessão.
- Isolamento de dados por usuário.

### Importação e qualidade de dados

- Importação de `CSV`, `OFX` e `PDF`.
- Seleção da conta bancária de destino na importação.
- Regras de descarte para transações fora do escopo (ex.: receitas para o fluxo de despesas).
- Deduplicação (`hash` e chave derivada de data/título/valor).
- Diagnóstico de importação no overlay (lidos, inválidos, descartados e duplicados).

### Categorização inteligente

- Reaproveitamento de memória de categoria do próprio usuário.
- Categorização por IA apenas para itens pendentes.
- Persistência de metadados de categorização por transação.
- Propagação de categoria para cenários correlatos (ex.: séries de parcelas).

### Dashboard financeira (usuário)

- Barra superior flutuante com:
  - total filtrado,
  - período (`início` e `fim`),
  - tipo de transação (`Todos`, `Crédito`, `Conta`).
- Filtros avançados por categoria e origem.
- Pizza por categoria com interação de hover/click (desktop/mobile).
- Mix de gastos em barras horizontais + metas mensais na lateral.
- Ritmo do mês por dia com detalhamento de transações do dia selecionado.
- Lista de lançamentos com:
  - paginação,
  - busca inteligente,
  - ignorar/reativar,
  - edição de categoria,
  - edição de conta,
  - edição de título,
  - criação manual de transação.

### Metas mensais

- CRUD de metas por categoria.
- Escopo por tipo (`all`, `Crédito`, `Conta`).
- Geração automática de metas.
- Exclusão individual e exclusão por mês/escopo.

### Consultor IA

- Análise comparativa entre período atual e período anterior.
- Insights de aumento/redução por categoria.
- Persistência dos insights por chave de filtro.

### Open Finance

- Conexão de contas bancárias compatíveis.
- Renovação e revogação de consentimento.
- Sincronização de transações via proxy backend.
- Atualização de status das conexões no dashboard.

### Painel administrativo (`/admin`)

- Controle de acesso por e-mails permitidos + autenticação Google.
- KPIs de produto e operação.
- Gráficos de uso diário.
- Listagem de usuários com paginação e busca.
- Ações de manutenção:
  - deduplicação,
  - reset de jornada.

## Arquitetura atual (feature-based)

A base foi reorganizada para reduzir acoplamento e evitar arquivos monolíticos.

### Princípios aplicados

- Organização por domínio/feature.
- Métodos de UI segmentados por responsabilidade.
- Flows de aplicação desacoplados do rendering.
- Serviços especializados por contexto.

### Estrutura de pastas

```text
smart-finance-ia/
  index.html
  admin.html
  runtime-config.js
  runtime-config.example.js
  src/
    app.js
    admin.js
    application/flows/
      auth-flow.js
      dashboard-flow.js
      data-sync-flow.js
      open-finance-flow.js
      ...
    features/
      dashboard/ui/dashboard-view/
        dashboard-view.js
        shared.js
        methods/
          core-methods.js
          bind-events-core-methods.js
          bind-events-modal-methods.js
          interaction-methods.js
          render-summary-methods.js
          render-engagement-methods.js
          transaction-render-methods.js
          pagination-goals-methods.js
          ai-methods.js
          modal-methods.js
      transactions/
        flows/
        services/
      goals/
        flows/
      ai/
        flows/
      admin/dashboard/
        admin-dashboard-app.js
        methods/
    services/
    state/
    utils/
    constants/
  backend/cloud-functions/
    index.js
    src/handlers/
```

## Backend (Cloud Functions)

Funções expostas atualmente:

- `openFinanceProxy`
- `categorizeTransactions`
- `analyzeSpendingInsights`
- `getAdminDashboard`
- `maintenanceDeduplicateTransactions`
- `maintenanceResetUserJourney`

## Configuração

### 1) Frontend

```bash
cp runtime-config.example.js runtime-config.js
```

Preencha o `runtime-config.js` com:
- credenciais Firebase,
- URLs das funções de IA,
- URL do proxy de Open Finance,
- URLs do painel/admin manutenção,
- e-mails permitidos para admin.

### 2) Backend Functions

```bash
cd backend/cloud-functions
npm install
```

Observação:
- Runtime configurado para Node `22` no backend (`engines.node`).

## Rodando localmente

Para desenvolvimento do frontend, use um servidor HTTP simples na raiz do projeto:

```bash
python3 -m http.server 5173
```

Acesse:
- `http://localhost:5173`
- Admin: `http://localhost:5173/admin`

## Deploy

Na raiz do projeto:

```bash
firebase deploy --only hosting
firebase deploy --only firestore:rules
firebase deploy --only functions
```

## Open Finance real (sem mocks)

Existe um guia prático no repositório:

- `tutorial_open_finance_real_sem_mock.md`

Esse documento cobre um caminho de integração real com custo inicial baixo para piloto pequeno.

## Segurança

- Não versionar segredos (`.env`, tokens, chaves privadas).
- Não expor API key de IA no frontend de produção.
- Proteger dados por usuário nas regras do Firestore.
- Usar proxy backend para integrações sensíveis.

## Observações

- O produto é focado em despesas e tomada de decisão rápida.
- O app foi otimizado para evitar rolagem horizontal e manter boa usabilidade em mobile/desktop.
- Para revisão de regressão, a recomendação operacional é validar primeiro os arquivos e fluxos alterados.
