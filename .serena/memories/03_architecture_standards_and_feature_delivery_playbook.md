# Smart Finance IA — Arquitetura Atual e Playbook de Entrega de Funcionalidades

## 1) Estado atual da arquitetura (fonte da verdade para novas implementações)

O projeto está consolidado em arquitetura **feature-based modular** no frontend e
**handlers especializados** no backend.

### Frontend (raiz `src/`)
- Entrada principal: `src/app.js` (injeção de dependências + wiring dos fluxos).
- Orquestração de casos de uso: `src/application/flows/`.
- Features por domínio:
  - `src/features/dashboard/`
  - `src/features/transactions/`
  - `src/features/goals/`
  - `src/features/ai/`
  - `src/features/admin/`
- Serviços compartilhados em `src/services/` (auth, firebase, open-finance, IA etc).
- Regras utilitárias de domínio em `src/utils/` (especialmente transações).

### Backend (`backend/cloud-functions/src/`)
- Arquitetura segmentada por responsabilidade:
  - `handlers/` (entrada HTTP por função)
  - `core/` (base, autenticação, CORS, utilitários comuns)
  - `ai/`, `admin/`, `open-finance/`, `maintenance/` (módulos de domínio)
- Ponto crítico: preservar contratos JSON dos endpoints utilizados pelo frontend.

---

## 2) Padrões de código observados e que DEVEM ser mantidos

1. **Composição por registro de métodos**
   - Ex.: `DashboardView` e `TransactionRepository` usam arquivos `register*Methods`.
   - Evitar classes gigantes; adicionar novos comportamentos em módulos `methods/`.

2. **Fluxos de aplicação como camada de orquestração**
   - Manter regra: UI dispara evento → flow orquestra → services/repository executam.
   - Evitar lógica de negócio acoplada diretamente em componentes de UI.

3. **Segurança server-side obrigatória**
   - Toda ação sensível valida token e autorização no backend.
   - Frontend pode ter bloqueio de UX, mas decisão final é do servidor.

4. **IA com fallback e custo controlado**
   - Priorizar memória/reaproveitamento antes de chamadas IA.
   - Sempre prever fallback determinístico quando o modelo falhar.

5. **Mudanças incrementais e reversíveis**
   - Preferir PRs pequenas por fluxo funcional.
   - Sempre deixar claro impacto em auth, transações, dashboard, IA e admin.

---

## 3) Contratos e regras sensíveis (não quebrar)

- Isolamento por usuário (`userId`) em Firestore e backend.
- Regras de deduplicação de transações e consistência de hash.
- Regras de parcelas/transferências e propagação de categoria.
- Contrato do endpoint admin `getAdminDashboard`:
  - campos principais: `totals`, `dailyUsage`, `highlights`, `users`.
- Proxy backend para integrações sensíveis (IA/Open Finance).

---

## 4) Playbook para implementar nova funcionalidade sem sair do padrão

1. Definir o domínio da feature (dashboard, transactions, goals, ai, admin).
2. Criar/ajustar fluxo em `src/application/flows/` ou `src/features/<domínio>/flows/`.
3. Colocar regras de negócio em `services/` e/ou `utils/`, não na camada de view.
4. Se houver UI complexa, dividir em `methods/` e registrar na classe principal.
5. Se houver backend, manter autenticação, CORS e resposta JSON estável.
6. Validar regressão mínima:
   - login/isolamento de dados,
   - importação + deduplicação,
   - categorização (memória + IA),
   - dashboard/filtros,
   - regras de parcelas/transferências,
   - fallback da IA.

---

## 5) Checklist curto para agentes antes de codar

- A mudança respeita a Constituição (`.specify/memory/constitution.md`)?
- A implementação segue padrão modular por feature/methods?
- Algum contrato backend↔frontend foi alterado? Se sim, atualizar ambos.
- Existe risco de custo adicional de IA? Se sim, justificar e mitigar.
- Existe plano de rollback simples?

Se qualquer resposta acima for "não" ou "incerto", revisar o plano antes de implementar.
