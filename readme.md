# Smart Finance IA

Aplicação web/PWA para gestão de despesas pessoais com foco em praticidade:
- importar extratos em CSV/OFX/PDF,
- categorizar com inteligência (memória + IA),
- comparar períodos,
- acompanhar metas,
- e operar tudo em mobile com boa usabilidade.

## Proposta de valor

- Fluxo simples para usuário final: importa arquivo, sincroniza categorias e acompanha gastos.
- Redução de custo operacional com memória interna e cache local (menos chamadas de IA/Firestore).
- Base preparada para escala (painel gerencial, métricas de uso, manutenção por usuário).

## Funcionalidades implementadas

### 1) Autenticação e sessão

- Login com e-mail/senha.
- Cadastro com e-mail/senha.
- Login com Google.
- Esqueci senha (reset por e-mail).
- Logout.
- Persistência de sessão (`LOCAL`) e sincronização de perfil de uso.
- Loading de autenticação para melhorar UX no login.
- Isolamento de dados por usuário autenticado.

### 2) Importação de transações (CSV, OFX e PDF)

- Importa:
  - CSV de cartão e conta,
  - OFX,
  - PDF de extrato (inclui formatos bancários comuns e layouts genéricos com tabela/texto estruturado).
- Conta bancária da importação: usuário escolhe a conta e todas as transações do arquivo entram nela.
- Regras de qualidade na importação:
  - ignora receitas/créditos indevidos para o objetivo do app (foco em despesas),
  - ignora estornos/pagamentos/linhas inválidas,
  - deduplica por `hash` e `dedupKey` (`date + title + value`).
- Diagnóstico de importação no overlay:
  - total lido,
  - inválidos,
  - descartados por regra,
  - duplicados.
- Reaproveita categoria pelo histórico do usuário já na importação (antes de IA).

### 3) Categorização inteligente em camadas

- Camada 1 (sem IA): memória de categorias do próprio usuário.
- Camada 2 (com IA): Gemini via Cloud Function proxy para itens ainda pendentes.
- Processamento em lotes com retry/backoff para 429/5xx.
- Persistência de metadados de categorização por transação:
  - `categorySource`,
  - `categoryAutoAssigned`,
  - `categoryManuallyEdited`,
  - `lastCategoryUpdateAt`.
- Métricas de uso (sync de IA) registradas por dia.

### 4) Regras avançadas de parcelas e consistência de categoria

- Transações que começam com `Transferência` nunca são tratadas como parcela.
- Exibição do mix usa categoria visual (`Parcelas`) com regra consistente.
- Ao editar categoria de uma transação parcelada, a categoria é propagada para a série relacionada.
- Ao definir categoria manualmente, transações equivalentes em `Outros` (mesmo título normalizado) também são atualizadas.

### 5) CRUD de categorias e contas bancárias

- Categorias:
  - base padrão + categorias do usuário,
  - criação inline no seletor (`+ Criar ...`).
- Contas bancárias:
  - conta default `Padrão`,
  - criação por usuário,
  - troca por transação,
  - seleção para importação em lote.

### 6) Lançamentos manuais e edição de descrição

- Botão `+` para criar transação manual com:
  - descrição,
  - categoria,
  - conta bancária,
  - valor,
  - tipo (`Crédito`/`Conta`).
- Edição inline da descrição (abre modal ao clicar no título).
- Validação de duplicidade também em criação/edição manual (mesma data + descrição + valor).

### 7) Dashboard do usuário

- Filtros superiores:
  - período (`data início`/`data fim`),
  - tipo de conta (`Tudo`, `Crédito`, `Conta`).
  - padrão de abertura: primeiro dia do mês atual até o dia vigente.
- Busca inteligente na seção de lançamentos:
  - por descrição,
  - por valor,
  - por categoria,
  - com opção de buscar apenas no período filtrado ou na base inteira do usuário.
- Totalizador da busca:
  - total encontrado,
  - total da base ativa,
  - percentual de representatividade.
- Mix de gastos:
  - barra amarela (período atual),
  - barra cinza (mesmo range do período anterior),
  - marcador de meta.
- Lista de lançamentos detalhados:
  - paginação,
  - ignorar/reativar (soft ignore),
  - edição de categoria,
  - edição de conta,
  - edição de descrição.

### 8) Metas mensais

- CRUD de metas por categoria.
- Metas segmentadas por escopo:
  - `Tudo`,
  - `Crédito`,
  - `Conta`.
- Geração automática de metas com análise comportamental recente.
- Edição individual de meta.
- Exclusão:
  - individual,
  - todas as metas do mês/escopo filtrado.
- Criação/edição bloqueada para meses já encerrados.
- Exibição no mix com referência mensal consistente.
- A referência de meta no mix usa o mês completo (evita distorção ao trocar apenas o dia final do filtro dentro do mesmo mês).

### 9) Consultor IA

- Botão dedicado para análise comparativa `período atual vs período anterior`.
- Insights focados em controle de gasto:
  - categorias que aumentaram e principais transações que contribuíram,
  - categorias que reduziram e provável motivo da redução,
  - alertas práticos.
- Persistência dos insights em Firestore por chave de filtro/período.
- Nova consulta no mesmo dia/período sobrescreve o insight anterior.
- Fallback determinístico se IA estiver indisponível.
- Registro de uso diário em métricas.

### 10) UX, mobile e PWA

- Layout otimizado para mobile (incluindo telas com maior densidade de informação).
- Tooltips de ajuda e guias rápidos de exportação por banco em modal.
- PWA instalável (`manifest` + `service-worker` + botão de instalação).

### 11) Painel gerencial separado (`/admin`)

- Acesso somente para e-mails administradores permitidos e login Google.
- KPIs operacionais:
  - usuários cadastrados,
  - ativos 7d/30d,
  - transações importadas/manuais,
  - uso de IA,
  - aderência da automação,
  - pendências de categorização.
- Gráficos de uso diário:
  - Sync IA vs Consultor IA,
  - Importadas vs Manuais.
- Listagem de usuários com:
  - paginação,
  - busca por e-mail,
  - datas de cadastro/último acesso,
  - métricas por usuário,
  - taxa de aderência da categorização automática.
- Ações administrativas por usuário:
  - `Remover duplicados`,
  - `Resetar jornada` (hard reset da jornada mantendo cadastro).

## Cloud Functions (backend)

Funções HTTP atuais:

1. `categorizeTransactions`
- Proxy seguro para categorização IA.

2. `analyzeSpendingInsights`
- Gera insights do consultor IA.
- Persiste resultado em `consultor_insights`.

3. `getAdminDashboard`
- Retorna métricas agregadas para o painel gerencial.

4. `maintenanceDeduplicateTransactions`
- Deduplicação administrativa por usuário (ou lote).

5. `maintenanceResetUserJourney`
- Reset administrativo completo da jornada do usuário (transações, categorias, contas, metas, insights e métricas), preservando cadastro.

## Arquitetura técnica

- Frontend: HTML + JavaScript ES Modules + CSS utilitário.
- Backend serverless: Firebase Cloud Functions (Node 22).
- Auth: Firebase Authentication.
- Banco: Cloud Firestore.
- IA: Gemini via proxy (produção).
- Hosting: Firebase Hosting.
- App mobile: PWA.

## Estrutura do projeto

```text
smart-finance-ia/
  index.html
  admin.html
  runtime-config.js
  runtime-config.example.js
  manifest.webmanifest
  service-worker.js
  firestore.rules
  firebase.json
  src/
    app.js
    admin.js
    application/flows/
    services/
    state/
    ui/
    utils/
    constants/
  backend/
    cloud-functions/
      index.js
      package.json
      .env.example
```

## Modelo de dados (Firestore)

Prefixo base:

`artifacts/{appId}/users/{userId}`

Coleções principais:

- `transacoes`
  - campos relevantes:
    - `date`, `title`, `value`, `category`, `accountType`, `bankAccount`, `active`
    - `hash`, `dedupKey`
    - `createdBy`, `createdAt`
    - `categorySource`, `categoryAutoAssigned`, `categoryManuallyEdited`, `lastCategoryUpdateAt`

- `categorias`
  - `name`, `normalizedName`, `createdAt`

- `contas_bancarias`
  - `name`, `normalizedName`, `createdAt`

- `metas_mensais`
  - `monthKey`, `periodStart`, `periodEnd`, `category`, `accountScope`, `targetValue`, `source`, `rationale`, `active`

- `consultor_insights`
  - `key`, `filters`, `currentPeriod`, `previousPeriod`, `insights`, `generatedAt`, `updatedAt`, `model`

- `metrics_daily`
  - `dateKey`, `aiCategorizationRuns`, `aiConsultantRuns`, `importOperations`, `importedTransactions`, `manualTransactions`

Documento de perfil de usuário:

- `artifacts/{appId}/users/{userId}`
  - `createdAt`, `lastAccessAt`, `providerIds`, totais agregados de uso/importação.

## Configuração local (didático)

### Pré-requisitos

- Node.js 22 (principalmente para Cloud Functions).
- Firebase CLI instalado e autenticado.
- Projeto Firebase com Authentication + Firestore + Functions + Hosting.

### 1) Configurar frontend

```bash
cp runtime-config.example.js runtime-config.js
```

Preencha `runtime-config.js` com:
- credenciais Firebase do projeto,
- URLs das Cloud Functions (`proxyUrl`, `consultantProxyUrl`, `dashboardProxyUrl`, manutenção).

### 2) Configurar Cloud Functions

```bash
cd backend/cloud-functions
npm install
cp .env.example .env
```

Preencha `.env` com sua chave Gemini e modelo disponível no seu projeto.

### 3) Voltar para a raiz

```bash
cd ../..
```

### 4) Rodar localmente (frontend)

Use servidor HTTP (não usar `file://`):

```bash
python3 -m http.server 5173
```

ou

```bash
npx http-server . -p 5173
```

Acesse:

`http://localhost:5173`

## Deploy (resumo)

Na raiz do projeto:

```bash
firebase deploy --only hosting
firebase deploy --only firestore:rules
firebase deploy --only functions
```

Rota do painel admin após deploy:

`/admin`

## Segurança e boas práticas

- Não versionar segredos (`.env`, chaves privadas, runtime local real).
- Usar IA via proxy no backend (não expor API key no frontend em produção).
- Firestore protegido por regras de acesso por usuário autenticado.
- Repositório já possui `.gitignore` para arquivos sensíveis comuns.

## Observações operacionais

- O app é focado em gestão de despesas (não em controle de receitas).
- Cache local + memória de categorias ajudam a reduzir custo e latência.
- Em caso de chave exposta, faça rotação imediata.
