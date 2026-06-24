# Controle Mensal Familiar

## Objetivo

Criar uma área separada do app principal para controle mensal manual da família, com dados próprios, cálculo imediato e fluxo muito rápido de preenchimento.

## Direção de Produto

- visão por mês, não por extrato;
- donos editáveis;
- registros de receita, despesa e caixinha;
- totais por dono e totais da família;
- réplica mensal com confirmação quando houver conteúdo no destino;
- experiência intuitiva para substituir planilha.

## Melhorias de Usabilidade na Versão Atual

- atalhos de mês anterior, atual e próximo;
- botão de lançamento rápido por dono;
- modal de registro com valor em formato brasileiro;
- botão de `Salvar e novo` para entrada contínua de dados;
- estado vazio com instruções diretas;
- resumo mensal com leitura imediata.

## Regras de Negócio Essenciais

- caixinha é controlada separadamente e não impacta receita, despesa ou saldo;
- todo registro pertence a um dono;
- todo mês fica isolado no próprio namespace do Firestore;
- replicação copia estrutura, nomes e valores para o mês destino.

## Observação Técnica

O módulo usa autenticação existente, shell visual existente e uma coleção separada em Firestore para não misturar o domínio de controle mensal com transações do dashboard principal.
