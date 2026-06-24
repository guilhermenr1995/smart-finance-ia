# Feature Specification: Controle Mensal Familiar

**Feature Branch**: `20260623-212500-controle-mensal-familia`  
**Created**: 2026-06-23  
**Status**: Draft  
**Input**: User description: "Crie uma página totalmente nova no app para controle manual de gastos do mês, separada do controle de transações, com novos dados, novas telas, criação de Donos, novo registro de receitas/despesas, edição intuitiva, totais por dono e família, reserva de caixinha que reduz disponibilidade, replicação do cenário para outro mês e a melhor usabilidade possível para abandonar a planilha."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Estruturar o mês e os donos (Priority: P1)

Como pessoa que controla o orçamento da família, quero abrir uma página própria do controle mensal, criar os donos das receitas/despesas e enxergar o resumo principal do mês para ter uma visão clara de quem participa do cenário.

**Why this priority**: Sem a estrutura do mês e dos donos, o restante do controle não funciona. Esta é a base de todo o fluxo.

**Independent Test**: Pode ser testado criando um mês vazio, adicionando dois donos e verificando se o painel passa a mostrar a estrutura do mês e os cartões de resumo.

**Acceptance Scenarios**:

1. **Given** que o usuário está autenticado, **When** ele acessa a nova página, **Then** ele vê a visão mensal do controle familiar sem dados da área de transações.
2. **Given** que não existem donos cadastrados para o mês, **When** o usuário cria um dono, **Then** o dono aparece na sessão de estrutura do mês e fica disponível para uso nos registros.
3. **Given** que já existem donos e registros no mês, **When** a página é recarregada, **Then** a estrutura volta exatamente como estava.

---

### User Story 2 - Registrar receitas, despesas e caixinha (Priority: P1)

Como pessoa que administra o orçamento, quero criar registros manuais de receita, despesa e reserva de caixinha para montar o cenário mensal sem depender de planilha.

**Why this priority**: O objetivo central da página é registrar os valores do mês de forma simples e rápida.

**Independent Test**: Pode ser testado adicionando um registro de receita, um de despesa e um de caixinha e confirmando que os totais são atualizados imediatamente.

**Acceptance Scenarios**:

1. **Given** que existe pelo menos um dono, **When** o usuário abre "Novo registro", informa nome, valor, tipo e dono e salva, **Then** o registro é criado e aparece na listagem do mês.
2. **Given** que o usuário cria um registro do tipo caixinha, **When** o sistema recalcula os totais, **Then** o valor é descontado da receita disponível do dono e do total da família, sem ser tratado como despesa.
3. **Given** que um registro foi criado com erro, **When** o usuário edita nome, valor ou dono, **Then** a mudança é refletida na mesma hora nos totais e na listagem.

---

### User Story 3 - Entender saldo, gasto e poupança (Priority: P1)

Como pessoa que controla o orçamento, quero ver o resultado por dono e o acumulado geral para saber claramente quanto será gasto, quanto será poupado e onde o orçamento está apertando.

**Why this priority**: A principal entrega de valor é transformar números soltos em uma leitura executiva e acionável do mês.

**Independent Test**: Pode ser testado com entradas conhecidas e validando se os totais por dono e o acumulado geral batem com as operações registradas.

**Acceptance Scenarios**:

1. **Given** que um dono possui receitas e despesas, **When** o sistema exibe o resumo, **Then** ele mostra receita bruta, despesas, caixinha e saldo disponível daquele dono.
2. **Given** que existem múltiplos donos, **When** o sistema calcula o acumulado da família, **Then** ele mostra os totais consolidados e o saldo final mensal.
3. **Given** que o saldo mensal fica negativo, **When** o resumo é exibido, **Then** o sistema deixa isso evidente sem esconder o déficit.

---

### User Story 4 - Replicar o cenário mensal (Priority: P2)

Como pessoa que mantém o orçamento mês a mês, quero replicar o cenário do mês vigente para o próximo mês para ganhar velocidade e evitar retrabalho.

**Why this priority**: A replicação reduz muito o esforço operacional depois que a estrutura estiver pronta.

**Independent Test**: Pode ser testado copiando um mês pronto para outro mês e verificando se donos, registros e valores foram reproduzidos.

**Acceptance Scenarios**:

1. **Given** que existe um mês configurado, **When** o usuário escolhe replicar para outro mês, **Then** o novo mês recebe a mesma estrutura inicial.
2. **Given** que o mês de destino já possui dados, **When** o usuário tenta replicar, **Then** o sistema pede confirmação explícita antes de substituir o cenário existente.
3. **Given** que a replicação termina, **When** o usuário abre o mês novo, **Then** ele encontra os mesmos donos e registros do mês copiado, prontos para ajuste.

### Edge Cases

- O usuário abre o mês sem nenhum dono cadastrado.
- O usuário tenta criar um registro sem valor ou com valor inválido.
- O usuário tenta criar um registro sem dono.
- O usuário registra uma caixinha maior que a receita disponível do dono.
- O mês de destino da replicação já possui dados e precisa de confirmação antes de substituir.
- Um dono é renomeado e todos os registros associados precisam continuar apontando para ele.
- O usuário recarrega a página no meio de uma edição.
- O mês selecionado não é o mês corrente e o usuário quer voltar rapidamente para o mês atual.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST oferecer uma página própria de controle mensal familiar, separada da área de controle de transações.
- **FR-002**: O sistema MUST manter os dados desse módulo em um namespace totalmente dedicado, sem compartilhar tabelas, coleções visíveis ou lógica de persistência com o domínio de transações.
- **FR-003**: O sistema MUST reutilizar a mesma autenticação do app principal, mas exibir apenas os dados do orçamento familiar do usuário autenticado.
- **FR-004**: O sistema MUST permitir criar, editar e listar donos do orçamento mensal.
- **FR-005**: O sistema MUST permitir criar registros mensais do tipo receita, despesa e caixinha com nome, valor e dono.
- **FR-006**: O sistema MUST permitir editar nome, valor, tipo e dono de cada registro de forma simples e direta.
- **FR-007**: O sistema MUST permitir remover registros com confirmação explícita quando necessário.
- **FR-008**: O sistema MUST calcular, para cada dono, receita bruta, despesas, caixinha e saldo disponível.
- **FR-009**: O sistema MUST calcular o acumulado geral da família com as mesmas métricas consolidadas.
- **FR-010**: O sistema MUST tratar caixinha como reserva neutra, descontando seu valor da receita disponível do dono e do acumulado geral, sem classificá-la como despesa.
- **FR-011**: O sistema MUST apresentar um resumo mensal claro com foco em gasto previsto, economia prevista e eventual déficit.
- **FR-012**: O sistema MUST permitir replicar integralmente o cenário do mês vigente para outro mês, copiando estrutura, donos e registros.
- **FR-013**: O sistema MUST solicitar confirmação quando a replicação puder sobrescrever dados já existentes no mês de destino.
- **FR-014**: O sistema MUST abrir no mês corrente por padrão e permitir alternar para outros meses com facilidade.
- **FR-015**: O sistema MUST incluir um botão de navegação no cabeçalho do app principal para acessar a nova página.
- **FR-016**: O sistema MUST manter a experiência responsiva e consistente com o estilo visual atual do produto.

### Key Entities *(include if feature involves data)*

- **MonthlyBudgetWorkspace**: representa o cenário de um mês específico, com metadados, mês de referência e origem de replicação.
- **Owner**: pessoa ou responsável financeiro associado às receitas, despesas e reservas do mês.
- **BudgetRecord**: item mensal que pode ser receita, despesa ou caixinha, sempre associado a um dono.
- **MonthlySummary**: visão derivada que consolida totais por dono e totais da família.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um usuário autenticado consegue criar a estrutura do mês e pelo menos um dono em menos de 2 minutos.
- **SC-002**: Um usuário consegue registrar uma receita, uma despesa e uma caixinha em menos de 90 segundos após abrir a página.
- **SC-003**: O resumo por dono e o acumulado geral refletem corretamente as alterações logo após cada salvamento.
- **SC-004**: A replicação de um mês completo para o mês seguinte pode ser concluída em uma única ação, com confirmação clara quando houver risco de sobrescrita.
- **SC-005**: Pelo menos 9 em cada 10 usuários de teste conseguem entender, sem ajuda adicional, a diferença entre despesa e caixinha depois de visualizar a tela.
- **SC-006**: Nenhum registro do controle de transações aparece no novo módulo e nenhum dado do novo módulo aparece no dashboard de transações.

## Assumptions

- O módulo será mensal e planejado, não um extrato bancário transacional.
- A caixinha será registrada como reserva vinculada a um dono, para abatimento do saldo disponível.
- A primeira versão não precisa de previsão estatística avançada; a projeção será derivada do cenário cadastrado.
- A separação de dados será feita por um namespace próprio no banco do projeto, com isolamento por usuário e por mês.
- O app principal continuará sendo a porta de entrada para o novo módulo, com acesso por botão no cabeçalho.
