# Implementation Plan: Controle Mensal Familiar

**Branch**: `20260623-212500-controle-mensal-familia` | **Date**: 2026-06-23 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/20260623-212500-controle-mensal-familia/spec.md`

## Summary

Create a standalone monthly family budget page with its own data domain, its own collections, and its own UI flow. The page will let the user manage owners, create manual income/expense/reserve records, view owner and family totals, and replicate the current month into another month without touching the transaction dashboard data.

## Technical Context

**Language/Version**: HTML, CSS, JavaScript ES modules; Firebase Cloud Functions on Node 22 for the existing backend  
**Primary Dependencies**: Firebase Auth, Firestore, the existing dashboard shell/styles, shared UI patterns already in the repo  
**Storage**: Firestore in a dedicated user namespace for the family budget module; local state only for transient UI concerns  
**Testing**: Browser smoke validation, syntax/import validation, Firestore rules review, Firebase hosting deploy check  
**Target Platform**: Web application / PWA  
**Project Type**: Multi-page web application  
**Performance Goals**: The user should be able to open the monthly workspace, edit records, and see totals update immediately for normal monthly-sized datasets  
**Constraints**: Keep the module fully separate from transaction data, preserve the current auth model, keep the yellow/black visual language, support mobile screens cleanly  
**Scale/Scope**: One authenticated user, one monthly workspace at a time, with a family-sized set of owners and records per month

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
| --- | --- | --- |
| Value diário ao usuário e foco em despesas | PASS | This feature turns the spreadsheet workflow into a dedicated monthly planning experience. |
| Segurança e isolamento de dados são inegociáveis | PASS | The module will use its own Firestore namespace and keep user isolation intact. |
| IA em camadas com custo controlado e fallback confiável | PASS | No new AI dependency is required for v1. |
| Integridade das regras financeiras e rastreabilidade | PASS | Totals are derived from records and replication keeps provenance by month. |
| Simplicidade operacional, evolução incremental e qualidade verificável | PASS | Scope is split into clear phases and the data model is easy to validate. |

## Project Structure

### Documentation (this feature)

```text
specs/20260623-212500-controle-mensal-familia/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/
│   └── requirements.md
└── spec.md

docs/plans/
└── controle-mensal-familia.md
```

### Source Code (repository root)

```text
controle-familiar-mensal.html
src/
├── controle-familiar-mensal.js
├── state/
│   └── family-budget-state.js
├── application/
│   └── flows/
│       └── family-budget-flow.js
├── features/
│   └── family-budget/
│       ├── family-budget-app.js
│       ├── services/
│       │   └── family-budget-repository/
│       ├── ui/
│       │   └── family-budget-view/
│       └── utils/
└── ui/
    └── auth-view.js

firestore.rules
index.html
src/app.js
src/ui/auth-view.js
```

**Structure Decision**: Keep the new experience as a separate HTML entry point with its own bootstrap file and its own feature folder. Reuse the existing authentication shell and styling language, but isolate all budget data in a dedicated repository and Firestore namespace so the transaction domain stays untouched.

## Complexity Tracking

No constitution violations require justification at this stage.

## Phase 0: Research Outcome

The planning decisions already converge on the key implementation choices:

- separate monthly workspace per user;
- dedicated data namespace for the family budget domain;
- record types limited to income, expense, and reserve;
- reserve treated as a neutral deduction from available income;
- replication as an explicit overwrite-confirmed action;
- existing visual language and auth model reused for consistency.

## Phase 1: Design Notes

### UI composition

- Add a button in the main app header that opens the new monthly family page.
- Build a page header with the month selector, a "Novo registro" action, a month replication action, and a clear back-navigation button.
- Use a top-level owner section, summary cards, and a records area grouped by owner.

### Calculations

- Owner balance = income - expense - reserve.
- Family balance = sum of all owner balances.
- Reserve is not an expense category; it is a deduction from available money.
- Projection cards should be derived from the current month records only.

### Data boundaries

- Do not reuse transaction caches or transaction collections.
- Keep Firestore access behind a dedicated repository so the budget domain can evolve independently.
- Add explicit rules for the new namespace and keep them user-scoped.

### Replication

- Replicate owners and records from the source month to the target month.
- Preserve the source month as provenance metadata.
- Require confirmation if the target month already contains data.

## Future Implementation Order

1. Create the page shell and navigation entry point.
2. Build the dedicated budget state and repository.
3. Implement owner creation and editing.
4. Implement record creation, editing, and removal.
5. Implement owner and family summaries.
6. Implement month replication.
7. Add validation, rules, and deploy.

