---

description: "Template de tarefas para implementação da feature"
---

# Tarefas: [NOME_DA_FEATURE]

**Entrada**: Artefatos de design em `/specs/[###-nome-da-feature]/`
**Pré-requisitos**: `plan.md` (obrigatório), `spec.md` (obrigatório para histórias), `research.md`, `data-model.md`, `contracts/`

**Testes**: Os exemplos abaixo incluem tarefas de teste. Testes são OPCIONAIS — inclua somente quando solicitado na especificação.

**Organização**: As tarefas são agrupadas por história de usuário para permitir implementação e validação independentes.

## Formato: `[ID] [P?] [História] Descrição`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependências)
- **[História]**: história de usuário relacionada (ex.: US1, US2, US3)
- Inclua caminhos exatos de arquivo na descrição

## Convenções de caminho

- **Projeto único**: `src/`, `tests/` na raiz
- **Aplicação web**: `backend/src/`, `frontend/src/`
- **Mobile**: `api/src/`, `ios/src/` ou `android/src/`
- Os caminhos abaixo assumem projeto único — ajuste conforme a estrutura definida no `plan.md`

<!--
  IMPORTANTE: As tarefas abaixo são EXEMPLOS para ilustrar o formato.
  O comando /speckit.tasks deve substituir por tarefas reais da feature.
-->

## Fase 1: Setup (Infraestrutura Compartilhada)

**Objetivo**: inicializar projeto e preparar estrutura básica

- [ ] T001 Criar estrutura do projeto conforme plano de implementação
- [ ] T002 Inicializar projeto [linguagem] com dependências de [framework]
- [ ] T003 [P] Configurar lint e formatação

---

## Fase 2: Fundação (Pré-requisitos Bloqueantes)

**Objetivo**: infraestrutura base que DEVE estar pronta antes de qualquer história

**⚠️ CRÍTICO**: nenhuma história de usuário começa antes desta fase

- [ ] T004 Configurar esquema de dados e estratégia de migração
- [ ] T005 [P] Implementar base de autenticação/autorização
- [ ] T006 [P] Configurar roteamento e middleware
- [ ] T007 Criar modelos/entidades base compartilhados
- [ ] T008 Configurar tratamento de erros e logging
- [ ] T009 Configurar variáveis de ambiente e perfis

**Checkpoint**: fundação pronta — histórias podem começar

---

## Fase 3: História de Usuário 1 - [Título] (Prioridade: P1) 🎯 MVP

**Objetivo**: [valor entregue por esta história]

**Teste Independente**: [como validar esta história sem depender das demais]

### Testes da História 1 (OPCIONAL — apenas se solicitado) ⚠️

> Escreva estes testes primeiro e garanta que falhem antes da implementação.

- [ ] T010 [P] [US1] Teste de contrato para [endpoint] em tests/contract/test_[nome].py
- [ ] T011 [P] [US1] Teste de integração da jornada em tests/integration/test_[nome].py

### Implementação da História 1

- [ ] T012 [P] [US1] Criar modelo [Entidade1] em src/models/[entidade1].py
- [ ] T013 [P] [US1] Criar modelo [Entidade2] em src/models/[entidade2].py
- [ ] T014 [US1] Implementar [Serviço] em src/services/[servico].py (depende de T012, T013)
- [ ] T015 [US1] Implementar [endpoint/feature] em src/[local]/[arquivo].py
- [ ] T016 [US1] Adicionar validações e tratamento de erro
- [ ] T017 [US1] Adicionar logging das operações da história

**Checkpoint**: História 1 funcional e testável isoladamente

---

## Fase 4: História de Usuário 2 - [Título] (Prioridade: P2)

**Objetivo**: [valor entregue por esta história]

**Teste Independente**: [como validar esta história sem depender das demais]

### Testes da História 2 (OPCIONAL — apenas se solicitado) ⚠️

- [ ] T018 [P] [US2] Teste de contrato para [endpoint] em tests/contract/test_[nome].py
- [ ] T019 [P] [US2] Teste de integração da jornada em tests/integration/test_[nome].py

### Implementação da História 2

- [ ] T020 [P] [US2] Criar modelo [Entidade] em src/models/[entidade].py
- [ ] T021 [US2] Implementar [Serviço] em src/services/[servico].py
- [ ] T022 [US2] Implementar [endpoint/feature] em src/[local]/[arquivo].py
- [ ] T023 [US2] Integrar com componentes da História 1 (se necessário)

**Checkpoint**: Histórias 1 e 2 funcionando de forma independente

---

## Fase 5: História de Usuário 3 - [Título] (Prioridade: P3)

**Objetivo**: [valor entregue por esta história]

**Teste Independente**: [como validar esta história sem depender das demais]

### Testes da História 3 (OPCIONAL — apenas se solicitado) ⚠️

- [ ] T024 [P] [US3] Teste de contrato para [endpoint] em tests/contract/test_[nome].py
- [ ] T025 [P] [US3] Teste de integração da jornada em tests/integration/test_[nome].py

### Implementação da História 3

- [ ] T026 [P] [US3] Criar modelo [Entidade] em src/models/[entidade].py
- [ ] T027 [US3] Implementar [Serviço] em src/services/[servico].py
- [ ] T028 [US3] Implementar [endpoint/feature] em src/[local]/[arquivo].py

**Checkpoint**: todas as histórias planejadas funcionais

---

## Fase N: Acabamento e Itens Transversais

**Objetivo**: melhorias que afetam várias histórias

- [ ] TXXX [P] Atualizar documentação em docs/
- [ ] TXXX Limpeza de código e refatoração
- [ ] TXXX Otimização de performance
- [ ] TXXX [P] Testes unitários adicionais (se solicitado) em tests/unit/
- [ ] TXXX Reforço de segurança
- [ ] TXXX Validar o passo a passo do quickstart.md

---

## Dependências e Ordem de Execução

### Dependências por fase

- **Fase 1 (Setup)**: sem dependências
- **Fase 2 (Fundação)**: depende da Fase 1 e bloqueia as histórias
- **Fases de História (3+)**: dependem da Fase 2
- **Fase final (Acabamento)**: depende das histórias concluídas

### Dependências entre histórias

- **US1 (P1)**: inicia após Fundação
- **US2 (P2)**: inicia após Fundação
- **US3 (P3)**: inicia após Fundação

### Ordem dentro de cada história

- Testes (se houver) antes da implementação
- Modelos antes de serviços
- Serviços antes de endpoints/UI
- Implementação base antes de integração

### Oportunidades de paralelismo

- Tarefas com [P] podem rodar em paralelo
- Após Fundação, histórias podem evoluir em paralelo conforme capacidade do time

---

## Exemplo de Paralelismo (US1)

```bash
# Executar testes da US1 em paralelo (se houver)
Task: "Teste de contrato para [endpoint] em tests/contract/test_[nome].py"
Task: "Teste de integração da jornada em tests/integration/test_[nome].py"

# Executar criação de modelos da US1 em paralelo
Task: "Criar modelo [Entidade1] em src/models/[entidade1].py"
Task: "Criar modelo [Entidade2] em src/models/[entidade2].py"
```

---

## Estratégia de Implementação

### MVP primeiro (apenas US1)

1. Concluir Fase 1
2. Concluir Fase 2
3. Concluir US1
4. Parar e validar US1 isoladamente
5. Demonstrar/entregar MVP

### Entrega incremental

1. Setup + Fundação
2. US1 → validar → entregar
3. US2 → validar → entregar
4. US3 → validar → entregar

### Estratégia com time paralelo

1. Time conclui Setup + Fundação
2. Depois:
   - Dev A: US1
   - Dev B: US2
   - Dev C: US3

---

## Observações

- Evite tarefas vagas
- Evite conflitos no mesmo arquivo em paralelo
- Garanta que cada história possa ser validada isoladamente
- Faça commits por tarefa (ou bloco lógico)