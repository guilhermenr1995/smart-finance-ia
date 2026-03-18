# Publicação na Play Store (MVP)

Guia objetivo para publicar o Smart Finance IA em Android com PWA + TWA, com foco em baixo custo e baixo risco.

## 1) Preparar infraestrutura (web + dados + IA)

1. Configurar projeto Firebase com:
- Authentication (Email/Senha e Google).
- Firestore.
- Hosting.
- Cloud Functions (proxy de IA).
2. Aplicar regras de segurança (`firestore.rules`).
3. Subir função proxy de IA (`backend/cloud-functions`) e configurar segredo da API Gemini no servidor.
4. Atualizar `runtime-config.js` com:
- `firebase.*`
- `ai.proxyUrl`
- `ai.allowDirectRequest = false` (produção).

## 2) Publicar a PWA em HTTPS

1. Inicializar Hosting:
- `firebase init hosting`
2. Deploy:
- `firebase deploy --only hosting,firestore:rules`
3. Validar em produção:
- login/cadastro/logout;
- importação CSV;
- atualização de categoria;
- IA via proxy;
- instalação PWA no Android.

## 3) Criar conta Play Console (requisitos atuais)

1. Criar conta no Play Console.
2. Pagar taxa de registro de **US$ 25 (one-time)**.
3. Escolher tipo de conta:
- `Personal` ou `Organization`.
4. Concluir verificação de identidade e dados de contato.
5. Se conta pessoal nova, cumprir requisitos extras antes de produção:
- teste fechado com **mínimo 12 testers por 14 dias contínuos**;
- verificação de dispositivo Android real pelo app móvel do Play Console.

## 4) Empacotar a PWA como app Android (TWA)

1. Gerar projeto Android via Bubblewrap:
- `npm i -g @bubblewrap/cli`
- `bubblewrap init --manifest=<url-do-manifest>`
- `bubblewrap build`
2. Configurar associação de domínio com Digital Asset Links:
- publicar `https://seu-dominio/.well-known/assetlinks.json`.
3. Gerar **AAB** (Android App Bundle) para upload na Play Console.

## 5) Preparar o app no Play Console

1. Criar aplicativo no Play Console.
2. Enviar AAB na trilha de teste (recomendado começar por interna/fechada).
3. Completar conteúdo obrigatório:
- política de privacidade pública;
- formulário de Data safety;
- seção de exclusão de conta/dados (se o app permite criação de conta);
- classificação de conteúdo e demais formulários de compliance.
4. Depois da validação, promover para produção.

## 6) Go-live e operação

1. Ativar monitoramento de custo e alertas (Firebase/GCP).
2. Acompanhar leituras/escritas Firestore e chamadas da função de IA.
3. Publicar updates em ciclos curtos e usar trilhas de teste antes de produção.

## Estratégia de hospedagem recomendada para seu cenário (<100 usuários ativos)

- `Firebase Hosting + Firestore + Authentication + Functions` é a combinação mais simples para MVP e escala automática.
- O plano gratuito cobre boa parte do início; quando necessário, migrar para Blaze mantendo a mesma arquitetura.

## Referências oficiais

- Play Console: Get started (taxa e onboarding): https://support.google.com/googleplay/android-developer/answer/6112435
- Requisitos de conta para criar perfil: https://support.google.com/googleplay/android-developer/answer/13628312
- Teste obrigatório para contas pessoais novas: https://support.google.com/googleplay/android-developer/answer/14151465
- Verificação de dispositivo para contas novas: https://support.google.com/googleplay/android-developer/answer/14316361
- Trilhas de teste (internal/closed/open): https://support.google.com/googleplay/android-developer/answer/9845334
- Publicar app e status de revisão: https://support.google.com/googleplay/android-developer/answer/9859751
- Data safety (inclui apps sem coleta): https://support.google.com/googleplay/android-developer/answer/10787469
- Exclusão de conta/dados: https://support.google.com/googleplay/android-developer/answer/13327111
- Upload no Play Console + Play App Signing obrigatório: https://developer.android.com/studio/publish/upload-bundle
- TWA Quick Start (Bubblewrap + assetlinks): https://developer.chrome.com/docs/android/trusted-web-activity/quick-start
- Firebase Hosting Quickstart: https://firebase.google.com/docs/hosting/quickstart
- Firebase Pricing (Spark/Blaze e cotas): https://firebase.google.com/pricing
