# Fluxo Open Finance — Jornada do Cliente + Arquitetura Interna

Este documento descreve o fluxo ponta a ponta da integração Open Finance para o Smart Finance IA, cobrindo:

1. Jornada do usuário (UX)
2. Fluxo técnico de endpoints e integrações
3. Ciclo de vida de consentimento
4. Sincronização de transações e deduplicação
5. Tratamento de erros e reconexão

---

## 1) Jornada do cliente (alto nível)

```mermaid
flowchart TD
    A[Usuário autenticado no app] --> B[Dashboard > Conectar Banco]
    B --> C[Seleciona banco: Nubank / Itaú / Bradesco / BB]
    C --> D[Resumo simples: o que será compartilhado]
    D --> E[Usuário confirma consentimento]
    E --> F[Redirecionamento para fluxo de autorização do banco/provedor]
    F --> G[Usuário autentica no banco e aprova]
    G --> H[Retorno ao app com status da conexão]
    H --> I[Sync inicial de transações]
    I --> J[Dashboard atualizado]
    J --> K[Sync incremental automático]
    K --> L[Insights/Módulos usam dados atualizados]

    G -->|Negado/expirado| M[Status: conexão não autorizada]
    M --> N[CTA: tentar novamente]
```

---

## 2) Arquitetura técnica (componentes)

```mermaid
flowchart LR
    UI[Frontend PWA\nDashboard + Fluxo Conectar Banco]
    API[Cloud Functions\nOpenFinance Orchestrator]
    DB[(Firestore\nconsents, connections, sync_logs, transacoes)]
    SCH[Scheduler/Jobs\nSync incremental]
    AGG[Provedor Agregador\nOpen Finance Brasil]
    BANKS[Bancos\nNubank / Itaú / Bradesco / BB]

    UI -->|POST iniciar conexão| API
    API -->|Criar sessão de consentimento| AGG
    UI -->|Redirecionamento usuário| AGG
    AGG -->|Autenticação/autorização| BANKS
    AGG -->|Callback/token/consent status| API
    API --> DB
    API -->|Sync inicial| AGG
    AGG -->|Transações normalizadas| API
    API -->|Deduplicação + persistência| DB
    SCH -->|Dispara sync incremental| API
    DB --> UI
```

---

## 3) Sequência detalhada (conectar + sync inicial)

```mermaid
sequenceDiagram
    participant U as Usuário
    participant FE as Frontend (PWA)
    participant BE as Backend (Cloud Functions)
    participant AG as Agregador Open Finance
    participant BK as Banco Transmissor
    participant FS as Firestore

    U->>FE: Clicar "Conectar banco"
    FE->>BE: POST /openfinance/connect/start {bank, scopes}
    BE->>AG: Criar sessão/intent de consentimento
    AG-->>BE: consentIntentId + authUrl
    BE-->>FE: authUrl
    FE->>U: Abrir fluxo de autorização
    U->>BK: Autentica e aprova consentimento
    BK->>AG: Retorna aprovação
    AG->>BE: Callback (consentId/status/tokens)
    BE->>FS: Persistir consentimento + conexão
    BE->>AG: Buscar contas/recursos autorizados
    AG-->>BE: Lista de contas + metadados
    BE->>AG: Buscar transações históricas iniciais
    AG-->>BE: Transações
    BE->>BE: Normalizar + deduplicar
    BE->>FS: Salvar transações + sync checkpoint
    BE-->>FE: Status conexão=ATIVA + resumo sync
    FE->>U: Mostrar sucesso e dados atualizados
```

---

## 4) Fluxo de sincronização incremental

```mermaid
flowchart TD
    A[Scheduler dispara job] --> B[Seleciona conexões ativas]
    B --> C[Verifica consentimento válido]
    C -->|Sim| D[Busca transações desde último cursor]
    D --> E[Normaliza + deduplica]
    E --> F[Persistir transações]
    F --> G[Atualiza cursor/checkpoint]
    G --> H[Atualiza métricas e health da conexão]

    C -->|Não| I[Marca conexão: expirada]
    I --> J[Notifica frontend para CTA reconectar]
```

---

## 5) Estados de conexão (UX + backend)

```mermaid
stateDiagram-v2
    [*] --> NAO_CONECTADA
    NAO_CONECTADA --> AGUARDANDO_AUTORIZACAO: iniciar conexão
    AGUARDANDO_AUTORIZACAO --> ATIVA: consentimento autorizado + sync inicial OK
    AGUARDANDO_AUTORIZACAO --> FALHA_AUTORIZACAO: usuário negou/timeout

    ATIVA --> SINCRONIZANDO: job/manual sync
    SINCRONIZANDO --> ATIVA: sync concluído
    SINCRONIZANDO --> ERRO_TEMPORARIO: indisponibilidade/transiente

    ERRO_TEMPORARIO --> SINCRONIZANDO: retry automático
    ERRO_TEMPORARIO --> RECONEXAO_NECESSARIA: erro persistente/token inválido

    ATIVA --> EXPIRADA: consentimento expirou
    EXPIRADA --> RECONEXAO_NECESSARIA: ação do sistema
    RECONEXAO_NECESSARIA --> AGUARDANDO_AUTORIZACAO: usuário reconecta

    ATIVA --> REVOGADA: usuário revoga
    REVOGADA --> NAO_CONECTADA
```

---

## 6) Endpoints sugeridos (backend)

```mermaid
flowchart TD
    A[POST /openfinance/connect/start] --> A1[Cria intent de consentimento e retorna authUrl]
    B[GET /openfinance/connect/callback] --> B1[Recebe retorno autorização e ativa conexão]
    C[POST /openfinance/sync/manual] --> C1[Dispara sync sob demanda]
    D[POST /openfinance/sync/scheduled] --> D1[Uso interno por scheduler]
    E[POST /openfinance/connect/renew] --> E1[Renova consentimento]
    F[POST /openfinance/connect/revoke] --> F1[Revoga conexão]
    G[GET /openfinance/connections] --> G1[Listar conexões e status para frontend]
    H[GET /openfinance/connections/:id/health] --> H1[Detalhes de última sync/erros]
```

---

## 7) Regras de deduplicação e reconciliação

```mermaid
flowchart LR
    A[Transação recebida do Open Finance] --> B[Normalizar: data, descrição, valor, tipo, conta]
    B --> C[Gerar dedupKey/hash canônico]
    C --> D{Já existe no histórico?}
    D -->|Não| E[Inserir transação]
    D -->|Sim, igual| F[Ignorar duplicata]
    D -->|Sim, similar com diferença de metadado| G[Atualizar metadados mantendo integridade]
```

---

## 8) UX de erro e recuperação (mensagens acionáveis)

```mermaid
flowchart TD
    A[Erro de sincronização] --> B{Tipo de erro}
    B -->|Consentimento expirado| C[Mostrar: "Conexão expirou" + botão Reconectar]
    B -->|Banco indisponível| D[Mostrar: "Banco indisponível no momento" + tentar novamente]
    B -->|Falha temporária rede| E[Retry automático + feedback não intrusivo]
    B -->|Permissão insuficiente| F[Mostrar: "Aprovação incompleta" + refazer conexão]
    C --> G[Fluxo reconexão]
    D --> H[Nova tentativa manual]
    E --> I[Recuperação automática]
    F --> G
```

---

## 9) Observações de produto

1. Para MVP com menor fricção, priorizar agregador com cobertura dos bancos alvo.
2. Manter contrato interno desacoplado para troca de provedor sem quebrar frontend.
3. Tratar Open Finance como fonte contínua de dados (não evento único de importação).
4. Toda comunicação com usuário deve privilegiar clareza e ação imediata.
