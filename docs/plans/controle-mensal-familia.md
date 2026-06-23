# Plano de Produto e Técnica: Controle Mensal Familiar

## Objetivo

Criar uma nova área do app para controle manual mensal das finanças da família. Essa área deve funcionar como um produto separado do dashboard de transações, com dados próprios, telas próprias e fluxo próprio, para substituir a lógica de planilha por uma experiência mais clara e rápida.

## O que esta nova página precisa resolver

- organizar receitas, despesas e reservas da família mês a mês;
- mostrar quanto cada dono contribui, gasta e poupa;
- deixar evidente quanto sobra ou falta no mês;
- permitir repetir o cenário de um mês para o próximo sem retrabalho;
- manter tudo separado do banco de dados e das telas de transações.

## Princípios de produto

### 1. Separação total do domínio

Esse módulo não deve reaproveitar as tabelas de transações, nem a lógica de importação, categorização ou IA do dashboard atual. Ele deve ter um namespace próprio de dados, um repositório próprio e uma página própria.

### 2. Visão mensal, não extrato

Aqui a unidade principal é o mês. O usuário entra para planejar e acompanhar o cenário mensal da família, não para conferir movimentações bancárias.

### 3. Caixinha como reserva neutra

Caixinha não é despesa nem receita. Ela reduz a receita disponível do dono e da família, mas precisa continuar separada visualmente para não distorcer a leitura do orçamento.

### 4. Leitura rápida e intuitiva

A tela precisa reduzir a sensação de planilha. O usuário deve conseguir entender:

- quem é dono do quê;
- quanto cada dono ganha;
- quanto cada dono gasta;
- quanto cada dono reserva;
- quanto sobra no fim;
- quanto a família inteira está poupando ou gastando.

### 5. Replicação simples

Depois que o cenário estiver montado, o usuário deve conseguir copiar tudo para outro mês com um único comando, mantendo estrutura, nomes e valores.

## Estrutura da experiência

### Cabeçalho do app principal

Adicionar um botão no topo do app principal, no mesmo padrão visual do botão do painel gerencial, apontando para a nova página.

### Página nova

A nova página deve seguir o mesmo shell visual do app atual:

- mesma autenticação;
- mesmo estilo brutalista amarelo/preto;
- mesma sensação de produto;
- navegação clara para voltar ao app principal.

### Ordem sugerida das sessões

1. Cabeçalho do mês e ações rápidas.
2. Sessão de donos.
3. Sessão de resumo familiar.
4. Sessão de resumo por dono.
5. Sessão de caixinha.
6. Sessão de registros detalhados.
7. Ação de replicar para outro mês.

## Modelo mental da tela

### Donos

Os donos são as pessoas que sustentam o orçamento. Cada dono pode ter receitas, despesas e reservas associadas a ele.

### Registros

Os registros são os itens mensais. O usuário cria um registro com:

- nome;
- valor;
- tipo;
- dono.

### Tipos de registro

- Receita
- Despesa
- Caixinha

### Totais que a página deve mostrar

- receita bruta por dono;
- despesa total por dono;
- caixinha por dono;
- saldo disponível por dono;
- receita bruta acumulada da família;
- despesa acumulada da família;
- caixinha acumulada da família;
- saldo final da família;
- projeção de economia ou déficit.

## Fluxo de replicação

1. Usuário seleciona o mês de origem.
2. O sistema oferece a ação de replicar.
3. Usuário escolhe o mês de destino.
4. O sistema avisa quando o mês de destino já tiver dados.
5. O usuário confirma a substituição.
6. O novo mês recebe a mesma estrutura inicial.
7. O usuário ajusta valores e nomes conforme necessário.

## Orientações para a implementação

- Não tocar no domínio de transações além do botão de navegação.
- Manter a nova base separada por coleção/namespace.
- Evitar fórmulas escondidas ou cálculos pouco explicados.
- Recalcular os totais de forma imediata após cada edição.
- Usar os mesmos padrões visuais e de responsividade já existentes no produto.
- Tratar a replicação como operação crítica, sempre com confirmação quando houver risco de sobrescrita.

## Riscos e cuidados

- Misturar o novo domínio com transações vai gerar confusão e atrapalhar manutenção.
- Não deixar a caixinha parecer despesa comum.
- Não depender de processo manual para copiar mês.
- Não esconder déficit ou saldo negativo.
- Não exigir conhecimento técnico do usuário para entender a tela.

## Critério de sucesso do produto

- O usuário consegue abandonar a planilha para o controle mensal.
- O usuário entende rapidamente o saldo de cada dono e da família.
- A repetição mensal passa a ser uma ação de poucos segundos.
- A experiência continua coerente com o restante do app.
