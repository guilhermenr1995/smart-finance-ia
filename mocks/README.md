# Mocks de Demonstração (Smart Finance IA)

Arquivos criados para apresentação com dados fake (jan/2026 a mar/2026):

- `mock_transacoes_cartao_jan_mar_2026.csv` (42 transações)
- `mock_transacoes_conta_jan_mar_2026.ofx` (42 transações)
- `mock_extrato_pdf_jan_mar_2026.pdf` (42 transações em texto no PDF)

## Dicas de importação

- CSV e OFX: devem funcionar diretamente pelos botões de importação do app.
- PDF: arquivo gerado com linhas no formato `dd/mm/yyyy descricao valor` para facilitar parsing.
- Para melhor demo, importe primeiro CSV/OFX e depois PDF para mostrar deduplicação e categorização.
