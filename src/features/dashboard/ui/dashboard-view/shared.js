import { CATEGORIES } from '../../../../constants/categories.js';
import { toBrDate } from '../../../../utils/date-utils.js';
import { getMonthBounds, getMonthKeyFromDate } from '../../../../utils/goal-utils.js';
import { escapeHtml, formatCompactCurrency, formatCurrencyBRL } from '../../../../utils/format-utils.js';
import {
  getDisplayCategory,
  isOpenFinanceTransaction,
  sortTransactionsByDateDesc
} from '../../../../utils/transaction-utils.js';

export {
  CATEGORIES,
  toBrDate,
  getMonthBounds,
  getMonthKeyFromDate,
  escapeHtml,
  formatCompactCurrency,
  formatCurrencyBRL,
  getDisplayCategory,
  isOpenFinanceTransaction,
  sortTransactionsByDateDesc
};

export function normalizeForSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export const DEFAULT_BANK_ACCOUNT = 'Padrão';
export const DEFAULT_PAGE_SIZE = 10;
export const BANK_GUIDE_STORAGE_KEY = 'smart-finance-bank-guide';

export const BANK_EXPORT_GUIDES = {
  nubank: {
    label: 'Nubank',
    formats: 'Conta OFX | Cartão CSV',
    steps: [
      'Abra Conta ou Cartão no app.',
      'Entre em Extrato/Fatura e ajuste o período.',
      'Use Exportar/Compartilhar e salve em OFX (conta) ou CSV (fatura).'
    ]
  },
  itau: {
    label: 'Itaú',
    formats: 'Conta e Cartão em PDF | OFX no internet banking (quando disponível)',
    steps: [
      'No app: Conta > Extrato > selecione o período > Compartilhar/Salvar PDF.',
      'Para cartão: Cartões > Fatura > Baixar/Compartilhar PDF.',
      'No internet banking web, procure por Extrato com opção de exportação OFX para importação estruturada.'
    ]
  },
  bradesco: {
    label: 'Bradesco',
    formats: 'OFX ou PDF',
    steps: [
      'Acesse Extrato por período na conta desejada.',
      'Abra o menu de ações e escolha Exportar/Download.',
      'Priorize OFX; se não houver, use o PDF detalhado.'
    ]
  },
  santander: {
    label: 'Santander',
    formats: 'OFX/CSV/PDF',
    steps: [
      'Entre em Conta Corrente > Extrato no período desejado.',
      'Use Exportar/Download no extrato.',
      'Se OFX/CSV não estiver disponível no app, use o PDF detalhado.'
    ]
  },
  'banco-do-brasil': {
    label: 'Banco do Brasil',
    formats: 'OFX ou PDF',
    steps: [
      'Acesse Conta > Extratos e selecione o período.',
      'Use Download/Exportação do extrato.',
      'Priorize OFX; caso não exista, utilize o PDF detalhado.'
    ]
  },
  caixa: {
    label: 'Caixa',
    formats: 'OFX/PDF',
    steps: [
      'Abra Extrato detalhado ou Movimentações da conta.',
      'No menu do extrato, escolha Compartilhar/Exportar.',
      'Se CSV não existir, importe OFX ou PDF detalhado.'
    ]
  },
  inter: {
    label: 'Inter',
    formats: 'OFX/PDF',
    steps: [
      'Entre em Extrato/Movimentações e defina o período.',
      'Use Compartilhar/Exportar no extrato.',
      'Caso CSV não esteja disponível, use OFX ou PDF.'
    ]
  },
  outros: {
    label: 'Outros bancos',
    formats: 'CSV/OFX/PDF',
    steps: [
      'Procure por Extrato, Movimentações ou Histórico no período desejado.',
      'Use opções como Exportar, Download ou Compartilhar.',
      'Priorize OFX, depois CSV; se não houver, use PDF detalhado.'
    ]
  }
};

export function normalizeBankAccountName(value) {
  const name = String(value || '').trim();
  return name || DEFAULT_BANK_ACCOUNT;
}
