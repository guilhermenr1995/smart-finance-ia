# Fluxo Ritmo do Mês — Jornada do Cliente + Arquitetura + Execução Speckit

Este documento detalha o fluxo completo da abordagem 1 (`apresentacao_speckit_1.md`) para a feature **Ritmo do Mês**, cobrindo:

1. Jornada do usuário (UX)
2. Pipeline técnico de dados (importação, categorização, consolidação)
3. Cálculo do ritmo e semáforo
4. Geração de ação prática (reduzir R$ X em Y dias)
5. Nova sessão: gráfico diário por categoria (foco em leitura rápida)
6. Fluxo de execução Speckit (do constitution ao implement)

---

## 1) Jornada do cliente (alto nível)

```mermaid
flowchart TD
    A[Usuário acessa dashboard] --> B[Seleciona período do mês atual]
    B --> C[Visualiza bloco Ritmo do Mês]
    C --> D[Comparação: gasto realizado vs gasto esperado até hoje]
    D --> E[Visualização por escopo: Tudo / Crédito / Conta / Categoria]
    E --> F[Semáforo: Verde / Amarelo / Vermelho]
    F --> G[Insight acionável: reduzir R$ X em Y dias]
    G --> H[Usuário ajusta comportamento e acompanha evolução diária]

    A --> I[Se não houver dados]
    I --> J[CTA: importar OFX/CSV/PDF]
```

---

## 2) Arquitetura técnica (componentes atuais do app)

```mermaid
flowchart LR
    UI[Frontend PWA\nDashboard + Filtros]
    FLOWS[Application Flows\ndashboard-flow / transaction-flow / ai-flow]
    SERVICES[Services\ntransaction-repository\ncategory-memory\nai-categorization]
    UTILS[Utils\ntransaction-utils\ndate-utils\nformat-utils]
    DB[(Firestore\ntransacoes/metas/categorias)]
    IA[Cloud Functions\nProxy Gemini]

    UI --> FLOWS
    FLOWS --> SERVICES
    SERVICES --> DB
    SERVICES --> IA
    FLOWS --> UTILS
    UTILS --> FLOWS
    DB --> FLOWS
    FLOWS --> UI
```

---

## 3) Pipeline de dados para alimentar Ritmo do Mês

```mermaid
flowchart TD
    A[Importação OFX/CSV/PDF] --> B[Normalização de transações]
    B --> C[Deduplicação por hash/dedupKey]
    C --> D[Classificação por conta/tipo/categoria]
    D --> E[Memória de categoria]
    E --> F{Ainda pendente?}
    F -->|Sim| G[Categorização por IA]
    F -->|Não| H[Persistir]
    G --> H[Persistir]
    H --> I[Conjunto consolidado do mês]
    I --> J[Cálculo Ritmo do Mês]
    J --> K[Renderização no dashboard]
```

---

## 4) Cálculo do Ritmo do Mês (lógica funcional)

```mermaid
flowchart TD
    A[Entrada: transações ativas do mês] --> B[Filtrar por escopo\nTudo/Crédito/Conta/Categoria]
    B --> C[Somar gasto realizado até hoje]
    C --> D[Obter orçamento/meta mensal do escopo]
    D --> E[Calcular gasto esperado até hoje\nmeta_mensal * (dia_atual / total_dias_mes)]
    E --> F[Comparar realizado vs esperado]
    F --> G{Faixa de risco}
    G -->|<= esperado| H[Verde: dentro do ritmo]
    G -->|levemente acima| I[Amarelo: atenção]
    G -->|bem acima| J[Vermelho: acima do ritmo]
    H --> K[Gerar recomendação]
    I --> K
    J --> K
```

---

## 5) Cálculo da recomendação prática (R$ X em Y dias)

```mermaid
flowchart LR
    A[Meta mensal do escopo] --> B[Realizado até hoje]
    B --> C[Saldo disponível para o mês\nmeta - realizado]
    C --> D[Dias restantes no mês = Y]
    D --> E[Orçamento diário recomendado restante]
    E --> F[Gap para voltar ao alvo = X]
    F --> G[Mensagem: "Para fechar no alvo, reduza R$ X em Y dias"]
```

---

## 6) Estados de UI do módulo Ritmo do Mês

```mermaid
stateDiagram-v2
    [*] --> SEM_DADOS
    SEM_DADOS --> CARREGANDO: usuário importa/sincroniza
    CARREGANDO --> PRONTO_VERDE: cálculo concluído (baixo risco)
    CARREGANDO --> PRONTO_AMARELO: cálculo concluído (atenção)
    CARREGANDO --> PRONTO_VERMELHO: cálculo concluído (alto risco)

    PRONTO_VERDE --> FILTRANDO: troca escopo/filtro
    PRONTO_AMARELO --> FILTRANDO
    PRONTO_VERMELHO --> FILTRANDO
    FILTRANDO --> PRONTO_VERDE
    FILTRANDO --> PRONTO_AMARELO
    FILTRANDO --> PRONTO_VERMELHO

    CARREGANDO --> ERRO: falha de dados/cálculo
    ERRO --> CARREGANDO: tentar novamente
```

---

## 7) Nova sessão UX — Gráfico de gastos por dia e categoria

Objetivo da sessão: permitir leitura rápida de **qual categoria mais pesou em cada dia** no período filtrado.

Regras funcionais da sessão:

1. O gráfico considera **todo o intervalo filtrado** na página.
2. O eixo X deve exibir **somente dias com ao menos 1 transação**.
3. Cada barra diária é segmentada por categoria (cores fixas por categoria).
4. Tooltip do dia mostra:
   - total do dia,
   - ranking de categorias do dia,
   - percentual por categoria no dia.
5. Clique/toque em uma cor da legenda aplica filtro rápido por categoria na listagem.

### 7.1 Fluxo da experiência da nova sessão

```mermaid
flowchart TD
    A[Usuário ajusta filtros de período/conta/categoria] --> B[Dashboard recalcula dados do gráfico diário]
    B --> C[Lista apenas dias com transações no intervalo]
    C --> D[Empilha categorias por cor em cada dia]
    D --> E[Renderiza gráfico na seção Ritmo do Mês]
    E --> F[Usuário identifica pico por categoria no dia]
    F --> G[Tooltip detalha total do dia e composição]
    G --> H[Clique na legenda aplica filtro rápido]
```

### 7.2 Pipeline de agregação para o gráfico diário

```mermaid
flowchart LR
    A[Transações filtradas e ativas] --> B[Agrupar por data]
    B --> C[Em cada data, agrupar por categoria]
    C --> D[Somar valores por categoria no dia]
    D --> E[Remover dias sem transação]
    E --> F[Ordenar dias crescentemente]
    F --> G[Montar séries por categoria]
    G --> H[Render do gráfico diário segmentado]
```

### 7.3 Exemplo visual (dias com transação apenas)

> Exemplo ilustrativo com período filtrado em que só houve gasto nos dias 02, 03, 05, 08 e 11.

```mermaid
xychart-beta
    title "Gastos por dia (segmentado por categoria)"
    x-axis [02, 03, 05, 08, 11]
    y-axis "R$" 0 --> 700
    bar "Alimentação" [120, 90, 220, 140, 110]
    bar "Transporte" [60, 30, 50, 80, 40]
    bar "Lazer" [0, 70, 90, 20, 130]
    bar "Moradia" [300, 0, 0, 300, 0]
```

---

## 8) Fluxo Speckit (abordagem 1) para entregar a feature

```mermaid
flowchart TD
    A[/speckit.constitution] --> B[/speckit.specify]
    B --> C[/speckit.clarify opcional]
    C --> D[/speckit.plan]
    D --> E[/speckit.checklist opcional]
    E --> F[/speckit.tasks]
    F --> G[/speckit.analyze opcional]
    G --> H[/speckit.implement]
    H --> I[Validação final\n(testes + revisão + PR)]
```

---

## 9) Fluxo de artefatos gerados no Speckit

```mermaid
flowchart LR
    A[/speckit.specify/] --> B[specs/XXX-ritmo-do-mes/spec.md]
    C[/speckit.plan/] --> D[plan.md + research.md + data-model.md + contracts/ + quickstart.md]
    E[/speckit.tasks/] --> F[tasks.md]
    G[/speckit.analyze/] --> H[relatório de consistência]
    I[/speckit.implement/] --> J[código + ajustes nos módulos existentes]

    B --> D
    D --> F
    F --> J
```

---

## 10) Resultado esperado ao final

```mermaid
mindmap
  root((Ritmo do Mês pronto))
    UX
      Semáforo claro
      Ação prática R$ X em Y dias
      Filtros por escopo
    Dados
      Importação consolidada
      Deduplicação ativa
      Categorização consistente
    Produto
      P1 entregue
      Base para Vazamentos (P2)
      Base para Compromissos (P3)
    Engenharia
      spec/plan/tasks completos
      Implementação rastreável
      Menor retrabalho
```
