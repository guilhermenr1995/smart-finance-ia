# Tutorial: Open Finance real (sem mock) com custo zero inicial

Data deste guia: 2026-04-01

## 1) Contexto realista (importante)

Para integrar Open Finance **diretamente** no Brasil (sem agregador), você precisa ser instituição autorizada/supervisionada pelo Banco Central ou operar dentro da estrutura regulada de participantes.

Para o seu cenário agora (não gastar dinheiro, até ~10 usuários), o caminho mais viável é usar um agregador com plano gratuito inicial e conectar seu backend ao agregador.

## 2) Opção recomendada para começar sem custo

No momento deste guia, a opção mais viável é:

- **Belvo (plano Test)**: indica acesso gratuito com sandbox e limite de links de dados reais (até 25 links).

Para até 10 usuários (1 a 2 conexões por usuário), isso costuma ser suficiente para piloto.

## 3) Arquitetura sugerida para o seu projeto

Use o fluxo abaixo:

1. Frontend chama `openFinanceProxy` (já existe no seu projeto).
2. `openFinanceProxy` chama um **upstream real** (`OPEN_FINANCE_UPSTREAM_URL`).
3. O upstream integra com Belvo (Widget + APIs de links/transactions).
4. `openFinanceProxy` persiste conexões/transações no Firestore (já implementado).

Em termos de arquivos já existentes:

- [open-finance-proxy.js](/home/guilherme/src/smart-finance-ia/backend/cloud-functions/src/handlers/open-finance-proxy.js)
- [open-finance-services.js](/home/guilherme/src/smart-finance-ia/backend/cloud-functions/src/core/open-finance-services.js)
- [runtime-config.js](/home/guilherme/src/smart-finance-ia/runtime-config.js)

## 4) Passo a passo prático

### Passo 4.1) Criar conta Belvo e habilitar ambiente

1. Criar conta na Belvo.
2. Ativar plano gratuito inicial (Test).
3. Pegar credenciais de API (`Secret ID` e `Secret Password`) para sandbox e produção (quando aprovado).

### Passo 4.2) Criar upstream real (adapter)

Suba um serviço HTTP simples (Cloud Run ou uma Function separada) com endpoint:

- `POST /open-finance`

Esse endpoint recebe:

```json
{
  "provider": "belvo",
  "action": "connect-bank",
  "appId": "smart-finance-production-v1",
  "bankCode": "nubank",
  "context": { "userId": "firebase-uid" }
}
```

E responde no formato esperado pelo seu `openFinanceProxy`:

```json
{
  "connection": {
    "id": "belvo-link-id",
    "status": "pending",
    "consentUrl": "https://widget.belvo.io/?access_token=...",
    "consentExpiresAt": "2026-07-01T00:00:00.000Z"
  },
  "transactions": []
}
```

### Passo 4.3) Mapear ações do seu contrato para Belvo

Implemente no upstream:

1. `connect-bank`
- Gera `access_token` do Hosted Widget (`POST /api/token/`).
- Retorna `consentUrl` para abrir o widget.
- Quando houver sucesso no callback do widget, salve o `link.id`.

2. `list-connections`
- Lista conexões do usuário a partir dos links Belvo (por `external_id`/mapeamento interno).

3. `sync-connection`
- Busca transações da conexão (`/api/transactions/`).
- Normaliza para `{ date, title, value, category, accountType }`.

4. `renew-connection`
- Usa fluxo de update/consent (Hosted Widget Update Mode ou renovação via consent).

5. `revoke-connection`
- Revoga/exclui o link no agregador e marca status `revoked`.

### Passo 4.4) Usar webhooks (recomendado)

Configure webhooks de agregação da Belvo para:

- saber quando histórico foi carregado,
- detectar consentimento perto de expirar,
- evitar sincronização “cego”.

## 5) Configurar seu backend atual para modo real (sem mock)

No `backend/cloud-functions/.env` (ou variáveis de ambiente em produção), use:

```bash
OPEN_FINANCE_PROVIDER=belvo
OPEN_FINANCE_UPSTREAM_URL=https://SEU-UPSTREAM-REAL/open-finance
OPEN_FINANCE_UPSTREAM_API_KEY=SUA_CHAVE_INTERNA
OPEN_FINANCE_ALLOW_FALLBACK=false
```

`OPEN_FINANCE_ALLOW_FALLBACK=false` é o ponto que garante operação **sem fallback/mock**.

Depois, deploy:

```bash
firebase deploy --only functions --project smart-finance-ia-f6593
```

## 6) Configurar frontend

No [runtime-config.js](/home/guilherme/src/smart-finance-ia/runtime-config.js), confira:

```js
openFinance: {
  proxyUrl: 'https://openfinanceproxy-yfnvp33coq-uc.a.run.app',
  supportedBanks: ['nubank', 'itau', 'bradesco', 'banco-do-brasil']
}
```

Ou seja: o frontend continua chamando sua função `openFinanceProxy`; quem muda é o upstream real por trás dela.

## 7) Checklist de validação (produção real)

1. `connect-bank` abre consentimento real do banco.
2. `list-connections` retorna conexão criada com status coerente.
3. `sync-connection` traz transações reais e persiste no Firestore.
4. `renew-connection` renova consentimento sem erro.
5. `revoke-connection` revoga e impede sync posterior.
6. `OPEN_FINANCE_ALLOW_FALLBACK=false` em produção.

## 8) Estimativa de custo zero para até 10 usuários

Se cada usuário conectar 1-2 bancos:

- até 10 usuários ≈ 10-20 links
- dentro do limite de 25 links reais do plano gratuito indicado pela Belvo (no momento desta escrita).

## 9) Limitações e quando evoluir

- Quando chegar perto do limite de links reais, você precisará migrar de plano.
- Se quiser escala/SLA alto, trate o upstream como serviço dedicado (logs, retries, fila, observabilidade).

## 10) Referências oficiais usadas

- Banco Central (participação no Open Finance):
  - https://www.bcb.gov.br/estabilidadefinanceira/openfinance_participantes
- Belvo (planos e preços):
  - https://belvo.com/plans-and-pricing/
  - https://belvo.com/pt-br/planos-precos/
- Belvo API docs (widget, links, transações, webhooks):
  - https://developers.belvo.com/apis/belvoopenapispec
  - https://developers.belvo.com/apis/belvoopenapispec/widget-access-token
  - https://developers.belvo.com/apis/belvoopenapispec/links
  - https://developers.belvo.com/apis/belvoopenapispec/transactions/retrievetransactions
  - https://developers.belvo.com/products/aggregation_brazil/ofda-widget-introduction
  - https://developers.belvo.com/products/aggregation_brazil/ofda-widget-startup-configuration
  - https://developers.belvo.com/developer_resources/resources-webhooks-aggregation
- Pluggy (Open Finance como feature premium):
  - https://docs.pluggy.ai/docs/open-finance-regulated

