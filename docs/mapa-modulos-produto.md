# Smart Finance IA - mapa de módulos do produto

Este documento descreve, em uma visão única, como cada sessão do produto se conecta ao valor de negócio e ao funcionamento técnico.

Ele foi pensado para dois usos:

1. orientar quem precisa entender rapidamente o que o produto faz;
2. servir como guia de arquitetura para manutenção, evolução e onboarding técnico.

## Visão geral

O Smart Finance IA centraliza controle financeiro pessoal em um fluxo simples:

```text
Entrada de dados -> normalização -> persistência -> visualização -> IA -> ação -> monitoramento
```

Na prática, o produto combina:

- autenticação segura;
- importação de extratos e sincronização via Open Finance;
- categorização automática com memória + IA;
- dashboard analítico com filtros, metas e comparativos;
- perguntas livres em linguagem natural;
- painel administrativo para observabilidade e manutenção.

## Mapa rápido dos módulos

| Sessão / módulo | Valor de negócio | Como funciona em alto nível | Arquivos principais |
| --- | --- | --- | --- |
| Autenticação e sessão | Protege o acesso e mantém cada base isolada por usuário | Login, cadastro, Google, reset de senha, persistência local e bootstrap de sessão | `index.html`, `src/app.js`, `src/application/flows/auth-flow.js`, `src/services/auth-service.js`, `src/ui/auth-view.js` |
| Importação | Reduz fricção para trazer dados para dentro do produto | Lê CSV/OFX/PDF, deduplica, descarta o que está fora do escopo e grava em lote | `index.html`, `src/features/transactions/flows/transaction-import-flow.js`, `src/features/transactions/services/csv-import/`, `src/services/transaction-repository.js` |
| Guia rápido de exportação | Ajudar o usuário a achar o extrato certo no banco | Exibe passo a passo por instituição para diminuir erro na origem | `index.html`, `src/features/dashboard/ui/dashboard-view/` |
| Filtros avançados | Permite recortes mais úteis para análise | Filtra por período, categoria, origem e tipo de conta | `index.html`, `src/application/flows/dashboard-flow.js`, `src/utils/transaction-utils.js` |
| Gastos por categoria | Mostra concentração e prioridades do orçamento | Pizza/legenda com total do período atual e interação no hover/toque | `index.html`, `src/features/dashboard/ui/dashboard-view/methods/transaction-render-methods.js` |
| Mix de gastos + metas | Ajuda a agir sobre excesso e acompanhar limites | Compara período atual x anterior e cruza com metas mensais | `index.html`, `src/features/goals/flows/goal-flow.js`, `src/utils/goal-utils.js` |
| Consultor IA | Entrega leitura executiva pronta para decisão | Compara período filtrado com o período anterior e gera insights persistidos | `index.html`, `src/features/ai/flows/ai-flow.js`, `backend/cloud-functions/src/handlers/analyze-spending-insights.js` |
| Pergunta livre de finanças | Responde perguntas específicas com flexibilidade | Usa IA com guardrails, formato flexível e evidências do recorte atual | `index.html`, `src/features/ai/flows/ai-flow.js`, `backend/cloud-functions/src/handlers/answer-finance-question.js` |
| Open Finance | Automatiza entrada de dados e mantém a base viva | Conecta Meu Pluggy, sincroniza transações, revoga/exclui conexões e configura webhooks | `index.html`, `src/application/flows/open-finance-flow.js`, `src/services/open-finance-service.js`, `backend/cloud-functions/src/handlers/open-finance-proxy.js` |
| Ritmo do mês | Ajuda a evitar surpresa no fim do período | Mostra gasto diário com quebra por categoria e detalhes por dia | `index.html`, `src/application/flows/dashboard-flow.js` |
| Lançamentos detalhados | Dá controle fino e capacidade de correção | Busca, paginação, edição de descrição/categoria/conta, ignorar e criar transação manual | `index.html`, `src/features/transactions/flows/transaction-management-flow.js` |
| Painel administrativo | Dá visão operacional e ferramentas de manutenção | Autenticação Google restrita, métricas, usuários, uso de IA e ações operacionais | `admin.html`, `src/admin.js`, `src/features/admin/dashboard/`, `backend/cloud-functions/src/handlers/get-admin-dashboard.js` |

## Sessões do dashboard principal

### 1. Autenticação e sessão

**Objetivo de negócio**

- controlar quem entra no produto;
- garantir que cada usuário veja apenas a sua própria base;
- reduzir atrito no acesso com e-mail/senha ou Google.

**Como funciona**

- o login pode ser por e-mail/senha ou Google;
- a sessão fica persistida localmente para evitar login repetido;
- ao abrir a aplicação, o estado é restaurado antes de carregar a dashboard;
- ao sair, o estado do usuário é limpo e as assinaturas de push são removidas.

**Pontos técnicos relevantes**

- `src/services/auth-service.js` encapsula Firebase Auth;
- `src/application/flows/auth-flow.js` coordena login, cadastro, reset e logout;
- o fluxo inicial de sessão chama `bootstrapSession()` e depois sincroniza a base;
- no produto principal, o estado vazio precisa voltar para um modo seguro sempre que não houver usuário autenticado.

**Arquivos principais**

- `src/app.js`
- `src/services/auth-service.js`
- `src/ui/auth-view.js`
- `src/application/flows/auth-flow.js`

### 2. Importação de dados

**Objetivo de negócio**

- transformar arquivos do banco em dados utilizáveis dentro do produto;
- eliminar a maior parte do trabalho manual de cadastramento;
- tornar o app útil mesmo sem Open Finance.

**Como funciona**

- o usuário escolhe entre cartão e conta corrente;
- o arquivo pode ser CSV, OFX ou PDF;
- a aplicação sincroniza a base antes de importar;
- o parser identifica transações válidas, ignora duplicados e descarta entradas fora do escopo de despesas;
- a memória de categoria reaproveita classificações anteriores do mesmo usuário.

**Pontos técnicos relevantes**

- a importação grava transações em lote via repository;
- hashes e `dedupKey` evitam duplicidades;
- o overlay mostra diagnóstico de leitura, linhas inválidas, regras de negócio e duplicados;
- a importação também registra métricas de uso.

**Arquivos principais**

- `src/features/transactions/flows/transaction-import-flow.js`
- `src/features/transactions/services/csv-import/`
- `src/services/category-memory-service.js`
- `src/services/transaction-repository.js`

### 3. Guia rápido de exportação

**Objetivo de negócio**

- reduzir falhas na origem dos dados;
- ajudar o usuário a encontrar a exportação correta do extrato;
- encurtar o tempo entre "quero importar" e "consigo importar".

**Como funciona**

- o usuário escolhe o banco;
- o app mostra um guia rápido com os passos mais relevantes;
- o conteúdo é pensado para ser consultado sem sair da dashboard.

**Pontos técnicos relevantes**

- o módulo usa um conjunto de guias por banco;
- a prioridade de qualidade da importação é OFX, depois CSV e, se necessário, PDF detalhado;
- é uma camada de suporte, não uma fonte de dados.

**Arquivos principais**

- `index.html`
- `src/features/dashboard/ui/dashboard-view/`

### 4. Filtros avançados

**Objetivo de negócio**

- permitir perguntas e análises em recortes mais úteis;
- evitar que o usuário fique preso ao total bruto do mês;
- dar flexibilidade para explorar categoria, origem e tipo de conta.

**Como funciona**

- o período é controlado por início e fim;
- a dashboard permite filtrar por categoria, origem e tipo de transação;
- os filtros atualizam os gráficos, a lista de lançamentos e os módulos de IA.

**Pontos técnicos relevantes**

- o fluxo de dashboard calcula o conjunto visível e o período anterior equivalente;
- ao mudar filtro, o resultado da pergunta livre de IA é limpo para não ficar fora de contexto;
- a busca pode usar base local do recorte atual ou a base global do cliente.

**Arquivos principais**

- `index.html`
- `src/application/flows/dashboard-flow.js`
- `src/utils/transaction-utils.js`

### 5. Gastos por categoria

**Objetivo de negócio**

- mostrar rapidamente onde está a concentração do gasto;
- revelar categorias dominantes e possíveis excessos;
- ajudar a decidir onde agir primeiro.

**Como funciona**

- um gráfico de pizza mostra a composição do período filtrado;
- a legenda detalha o peso de cada categoria;
- no desktop e no celular, o gráfico aceita interação para exibir detalhes.

**Pontos técnicos relevantes**

- os dados vêm do resumo do período atual;
- a renderização é feita no componente de dashboard com tratamento de tooltip e acessibilidade;
- esse bloco também alimenta a leitura de metas e dos módulos de IA.

**Arquivos principais**

- `index.html`
- `src/features/dashboard/ui/dashboard-view/methods/transaction-render-methods.js`

### 6. Mix de gastos + metas mensais

**Objetivo de negócio**

- comparar o período atual com o anterior de forma acionável;
- dar contexto para metas mensais;
- mostrar o que cresceu, o que caiu e o que está puxando o resultado.

**Como funciona**

- o mix exibe barras horizontais por categoria;
- o painel lateral mostra metas mensais do período de referência;
- o usuário pode gerar metas automáticas, criar uma meta manual ou excluir metas do mês.

**Pontos técnicos relevantes**

- o sistema calcula o mês de referência com base no filtro atual;
- metas têm escopo por conta (`all`, `Crédito`, `Conta`);
- metas automáticas usam histórico para sugerir limites;
- meses já encerrados não podem ser editados nem receber novas metas.

**Arquivos principais**

- `index.html`
- `src/features/goals/flows/goal-flow.js`
- `src/features/goals/flows/goal-flow-helpers.js`
- `src/utils/goal-utils.js`

### 7. Consultor IA

**Objetivo de negócio**

- gerar uma leitura executiva pronta para decisão;
- destacar aumentos, reduções e alertas relevantes;
- reduzir tempo de análise manual.

**Como funciona**

- o usuário aciona o consultor IA manualmente;
- o serviço compara o período filtrado com o período anterior equivalente;
- a resposta é persistida por chave de filtro para reaproveitamento posterior.

**Pontos técnicos relevantes**

- `src/features/ai/flows/ai-flow.js` monta o contexto e faz a chamada;
- `src/services/ai-consultant-service.js` lida com retry e endpoint remoto;
- o backend devolve um payload estruturado com `insights`, `usage` e possíveis alertas;
- o consultor é diferente da pergunta livre: aqui a resposta é mais guiada e orientada a insight.

**Arquivos principais**

- `index.html`
- `src/features/ai/flows/ai-flow.js`
- `src/features/ai/flows/ai-flow-helpers.js`
- `backend/cloud-functions/src/handlers/analyze-spending-insights.js`

### 8. Pergunta livre de finanças

**Objetivo de negócio**

- permitir perguntas específicas, como causadores, desvios, ranking e comparação mês a mês;
- tornar a IA mais útil em linguagem natural;
- sair do formato engessado de respostas fixas.

**Como funciona**

- o usuário escreve uma pergunta livre sobre o período filtrado;
- a pergunta é validada por tamanho, escopo financeiro e guardrails de segurança;
- o backend envia o recorte de transações e pede uma resposta adaptada ao pedido;
- a interface renderiza a resposta com mais flexibilidade, aceitando parágrafos, headings e listas.

**Pontos técnicos relevantes**

- o campo da pergunta aceita até 500 caracteres;
- o backend mantém limite de resposta maior para permitir detalhamento;
- quando a pergunta pede causadores ou comparação, a IA é orientada a listar exatamente os itens que puxaram o resultado;
- a UI mostra também evidências e metadados da base usada;
- perguntas fora do contexto financeiro são bloqueadas.

**Arquivos principais**

- `index.html`
- `src/features/ai/flows/ai-flow.js`
- `backend/cloud-functions/src/handlers/answer-finance-question.js`
- `src/features/dashboard/ui/dashboard-view/methods/ai-methods.js`

### 9. Open Finance

**Objetivo de negócio**

- automatizar a entrada de dados;
- manter a base atualizada sem depender só de importação manual;
- ampliar a recorrência de uso do produto.

**Como funciona**

- a UI atual suporta a conexão com Meu Pluggy;
- o usuário informa o Item ID da conexão;
- o app sincroniza a conexão, lista status e permite revogação ou exclusão;
- webhooks podem manter o fluxo atualizado sem ação manual do usuário.

**Pontos técnicos relevantes**

- o serviço front-end chama um proxy backend, nunca a API sensível direto do browser;
- o fluxo também registra push subscriptions quando necessário;
- excluir uma conexão remove a conexão, transações vinculadas e categorias órfãs relacionadas ao Open Finance;
- a integração usa armazenamento local do Item ID para facilitar retomada.

**Arquivos principais**

- `index.html`
- `src/application/flows/open-finance-flow.js`
- `src/services/open-finance-service.js`
- `backend/cloud-functions/src/handlers/open-finance-proxy.js`
- `backend/cloud-functions/src/handlers/open-finance-webhook.js`

### 10. Ritmo do mês

**Objetivo de negócio**

- ajudar o usuário a perceber cedo quando o mês está acelerando demais;
- dar visibilidade diária do gasto para evitar surpresa no fechamento;
- mostrar quais categorias puxam o ritmo do dia.

**Como funciona**

- o gráfico diário mostra o total por dia;
- cada dia pode detalhar a composição por categoria e os lançamentos daquele dia;
- o filtro de categoria também influencia a leitura.

**Pontos técnicos relevantes**

- a série diária é construída a partir das transações consideradas no resumo;
- o cálculo depende do período filtrado e do estado atual da dashboard;
- a sessão é um apoio analítico, não um ponto de escrita de dados.

**Arquivos principais**

- `index.html`
- `src/application/flows/dashboard-flow.js`

### 11. Lançamentos detalhados

**Objetivo de negócio**

- dar governança fina sobre a base;
- permitir correções manuais sem sair do produto;
- manter a lista auditável e pesquisável.

**Como funciona**

- a lista suporta paginação;
- a busca pode filtrar por descrição, valor, categoria ou origem;
- o usuário pode ignorar/reactivar lançamentos;
- também consegue editar descrição, categoria e conta bancária, além de criar transações manuais.

**Pontos técnicos relevantes**

- a busca pode operar sobre a base visível ou sobre a base global do cliente;
- cada card de transação carrega badges de origem, conta e tipo;
- o módulo é sensível para consistência, porque altera o que aparece nos gráficos e na IA;
- a criação manual também gera hash e `dedupKey` para evitar duplicidade.

**Arquivos principais**

- `index.html`
- `src/features/transactions/flows/transaction-management-flow.js`
- `src/features/dashboard/ui/dashboard-view/methods/transaction-render-methods.js`

### 12. Painel administrativo

**Objetivo de negócio**

- observar saúde do produto;
- entender uso real por usuários;
- executar manutenção de base quando necessário;
- manter suporte operacional sem acessar o app do cliente.

**Como funciona**

- o acesso é feito por login Google;
- apenas e-mails permitidos podem entrar;
- o painel exibe KPIs, gráficos de uso, listas de usuários e ações de manutenção por usuário;
- as ações administrativas podem deduplicar, limpar Open Finance ou resetar a jornada inteira.

**Pontos técnicos relevantes**

- o admin vive em página separada (`/admin`);
- os dados vêm de uma função backend agregadora;
- o painel de usuários tem busca e paginação;
- o desenho separa leitura operacional de ações destrutivas, com status próprio por usuário.

**Arquivos principais**

- `admin.html`
- `src/admin.js`
- `src/features/admin/dashboard/`
- `backend/cloud-functions/src/handlers/get-admin-dashboard.js`
- `backend/cloud-functions/src/handlers/maintenance-deduplicate-transactions.js`
- `backend/cloud-functions/src/handlers/maintenance-reset-user-journey.js`
- `backend/cloud-functions/src/handlers/maintenance-delete-open-finance-transactions.js`

## Camada técnica transversal

### Frontend shell e composição

- `src/app.js` é a entrada principal da aplicação do usuário.
- `src/admin.js` é a entrada separada do painel administrativo.
- a UI é montada por classes de view e por módulos de método registrados dinamicamente.
- o layout principal vive em `index.html`, enquanto o admin vive em `admin.html`.

### Estado e sincronização

- `src/state/app-state.js` concentra o estado global do usuário;
- `src/application/flows/data-sync-flow.js` faz a ponte entre Firestore, cache local e tela;
- `src/services/local-cache-service.js` guarda um snapshot por usuário no `localStorage` com tempo de validade;
- a aplicação prioriza uma primeira pintura rápida e depois substitui pelo dado sincronizado.

### Serviços centrais

- `src/services/firebase-service.js`: inicializa Firebase e valida configuração obrigatória.
- `src/services/auth-service.js`: encapsula login, cadastro, Google, reset e logout.
- `src/services/transaction-repository.js`: acesso a transações, categorias, metas, métricas e coleções relacionadas.
- `src/services/category-memory-service.js`: reaproveita categorias já aprendidas.
- `src/services/ai-consultant-service.js`: chama os endpoints de IA com retry e tratamento de resposta.
- `src/services/open-finance-service.js`: conversa com o proxy de Open Finance e com webhooks/push.
- `src/services/csv-import-service.js`: interpreta CSV/OFX/PDF e retorna diagnóstico de importação.
- `src/services/pwa-service.js`: registra service worker e gerencia instalação do app.
- `src/services/push-notification-service.js`: gerencia push subscription.

### Flows de aplicação

- `src/application/flows/auth-flow.js`: orquestra autenticação e limpeza de sessão.
- `src/application/flows/dashboard-flow.js`: monta o resumo, filtros, metas, IA e tabelas visíveis.
- `src/application/flows/data-sync-flow.js`: sincroniza dados do backend e persiste cache local.
- `src/application/flows/open-finance-flow.js`: conecta, sincroniza, revoga e exclui conexões.
- `src/features/transactions/flows/transaction-flow.js`: importa, altera e cria lançamentos.
- `src/features/ai/flows/ai-flow.js`: executa o consultor IA e a pergunta livre de finanças.
- `src/features/goals/flows/goal-flow.js`: salva, remove e gera metas automáticas.

### Back-end Cloud Functions

As funções exportadas hoje em `backend/cloud-functions/index.js` são:

- `openFinanceProxy`: proxy seguro para operações sensíveis de Open Finance.
- `openFinanceWebhook`: entrada para webhooks do provedor.
- `openFinanceWebhookWorker`: processamento assíncrono dos eventos recebidos.
- `categorizeTransactions`: categorização inteligente de transações.
- `analyzeSpendingInsights`: geração de insights do consultor IA.
- `answerFinanceQuestion`: resposta livre e flexível para perguntas financeiras.
- `getAdminDashboard`: agregação de métricas e dados operacionais do admin.
- `maintenanceDeduplicateTransactions`: remoção de duplicados.
- `maintenanceResetUserJourney`: reset completo da jornada de um usuário.
- `maintenanceDeleteOpenFinanceTransactions`: limpeza de transações de origem Open Finance.

### Persistência e dados

- o produto usa Firestore como fonte principal;
- os principais domínios persistidos são transações, categorias, contas bancárias, metas mensais, insights de IA, conexões Open Finance e perfil do usuário;
- o cache local evita recarregar tudo em toda navegação, mas tem validade curta para não degradar consistência;
- a escrita sensível sempre passa por repository ou função backend, nunca pela UI diretamente.

### PWA, notificações e experiência

- o app registra service worker para suporte de PWA;
- notificações push são usadas para acompanhar eventos relevantes;
- o overlay de carregamento é usado em operações longas para dar feedback claro ao usuário;
- isso reduz a sensação de travamento em importações, sync e manutenção.

## Pontos de atenção de negócio e engenharia

- a experiência do produto depende muito da qualidade do recorte de dados;
- a IA é útil quando responde a perguntas específicas, não quando tenta ser genérica demais;
- Open Finance precisa seguir sempre o caminho de proxy/backend;
- ações administrativas devem continuar separadas da navegação normal do cliente;
- importação e sincronização precisam preservar deduplicação, consistência e origem dos dados.

## Resumo executivo

O produto é, ao mesmo tempo:

- um dashboard financeiro de uso diário;
- uma camada de automação para entrada e categorização de dados;
- um assistente analítico com IA;
- uma base operacional com monitoramento e manutenção.

Essa combinação só funciona bem quando cada sessão cumpre o seu papel:

- entrada simples;
- análise rápida;
- decisão acionável;
- controle operacional.
