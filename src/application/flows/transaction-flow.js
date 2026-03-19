import {
  generateTransactionHash,
  getInstallmentGroupKey,
  getInstallmentInfo,
  getTransactionTitleMatchKey
} from '../../utils/transaction-utils.js';

const DEFAULT_BANK_ACCOUNT = 'Padrão';

function normalizeBankAccountName(value) {
  const name = String(value || '').trim();
  return name || DEFAULT_BANK_ACCOUNT;
}

function parseManualAmount(value) {
  const sanitized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .trim();
  if (!sanitized) {
    return Number.NaN;
  }

  let normalized = sanitized;
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');

  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = normalized.replace(/,/g, '');
  }

  return Number.parseFloat(normalized);
}

function resolveManualTransactionDate(app) {
  const fallbackDate = new Date().toISOString().slice(0, 10);
  const filteredEndDate = String(app.state?.filters?.endDate || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(filteredEndDate) ? filteredEndDate : fallbackDate;
}

function buildPlatformCategorySource(rawSource) {
  const source = String(rawSource || 'memory').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return `platform-${source || 'memory'}`;
}

function buildManualCategoryMetadata(existingTransaction, nextCategory, updatedAt) {
  const previousCategory = String(existingTransaction?.category || '');
  const changedCategory = previousCategory !== String(nextCategory || '');
  const wasAutoAssigned = Boolean(existingTransaction?.categoryAutoAssigned);

  return {
    categorySource: 'manual',
    categoryAutoAssigned: wasAutoAssigned,
    categoryManuallyEdited: wasAutoAssigned ? Boolean(existingTransaction?.categoryManuallyEdited) || changedCategory : false,
    lastCategoryUpdateAt: updatedAt
  };
}

export async function importCsv(app, file, accountType, bankAccountName = DEFAULT_BANK_ACCOUNT) {
  if (!file) {
    return;
  }

  if (!app.state.user) {
    app.authView.showMessage('Faça login para importar arquivos.', 'error');
    return;
  }

  app.dashboardView.setBusy(true);
  app.overlayView.show(`Importando ${accountType}...`);

  try {
    await app.syncDataFromCloud({ force: false, showOverlay: false });
    const importBankAccount = normalizeBankAccountName(bankAccountName);

    const isPdfFile = /\.pdf$/i.test(file.name || '');
    const fileContent = isPdfFile ? await file.arrayBuffer() : await file.text();
    const existingHashes = new Set(app.state.transactions.map((transaction) => transaction.hash));
    const parseResult = await app.csvImportService.parseFileContent(file.name, fileContent, accountType, existingHashes);
    const importedAt = new Date().toISOString();

    if (parseResult.transactions.length === 0) {
      app.overlayView.log('Nenhuma transação nova foi identificada.');
      app.overlayView.log(`Itens ignorados: ${parseResult.skipped}`);
      setTimeout(() => app.overlayView.hide(), 1000);
      return;
    }

    const memoryApplied = app.categoryMemoryService.applyMemoryToTransactions(
      parseResult.transactions.map((transaction) => ({
        ...transaction,
        bankAccount: importBankAccount,
        createdBy: 'import',
        createdAt: importedAt,
        categorySource: 'import-default',
        categoryAutoAssigned: false,
        categoryManuallyEdited: false,
        lastCategoryUpdateAt: importedAt
      })),
      app.state.transactions,
      { onlyOthers: true }
    );
    const autoAssignedByIndex = new Map(memoryApplied.updates.map((update) => [update.index, update]));
    const transactionsToInsert = memoryApplied.transactions.map((transaction, index) => {
      const autoSuggestion = autoAssignedByIndex.get(index);
      if (!autoSuggestion) {
        return transaction;
      }

      return {
        ...transaction,
        categorySource: buildPlatformCategorySource(autoSuggestion.source),
        categoryAutoAssigned: true,
        categoryManuallyEdited: false,
        lastCategoryUpdateAt: importedAt
      };
    });

    if (memoryApplied.updates.length > 0) {
      app.overlayView.log(
        `Memória interna aplicou ${memoryApplied.updates.length} categoria(s) automaticamente no momento da importação.`
      );
    }

    const insertedTransactions = await app.repository.bulkInsert(app.state.user.uid, transactionsToInsert, {
      batchSize: 100,
      onProgress: (done, total) => {
        app.overlayView.log(`Importados ${done}/${total} lançamentos.`);
      }
    });

    app.setTransactionsAndRefresh([...app.state.transactions, ...insertedTransactions]);
    try {
      await app.repository.recordUsageMetrics(app.state.user.uid, {
        importOperations: 1,
        importedTransactions: insertedTransactions.length
      });
    } catch (usageError) {
      console.warn('Falha ao registrar métricas de importação:', usageError);
    }

    app.overlayView.log(
      `Importação concluída: ${transactionsToInsert.length} novos lançamentos na conta "${importBankAccount}", ${parseResult.skipped} ignorados.`
    );
    setTimeout(() => app.overlayView.hide(), 900);
  } catch (error) {
    app.overlayView.showError(app.normalizeError(error));
  } finally {
    app.dashboardView.setBusy(false);
  }
}

export async function toggleActive(app, docId, currentState) {
  if (!app.state.user) {
    return;
  }

  try {
    await app.repository.toggleActive(app.state.user.uid, docId, currentState);
    const nextState = !currentState;
    app.setTransactionsAndRefresh(
      app.state.transactions.map((transaction) =>
        transaction.docId === docId ? { ...transaction, active: nextState } : transaction
      )
    );
  } catch (error) {
    app.authView.showMessage(app.normalizeError(error), 'error');
  }
}

export async function updateCategory(app, docId, category) {
  if (!app.state.user) {
    return;
  }

  const normalizedCategory = String(category || '').trim();
  if (!normalizedCategory) {
    app.authView.showMessage('Categoria inválida.', 'error');
    return;
  }

  try {
    const targetTransaction = app.state.transactions.find((transaction) => transaction.docId === docId);
    const transactionsById = new Map(app.state.transactions.map((transaction) => [transaction.docId, transaction]));
    const updatesByDocId = new Map([[docId, normalizedCategory]]);

    if (targetTransaction) {
      const targetTitleKey = getTransactionTitleMatchKey(targetTransaction.title);
      const targetGroupKey = getInstallmentGroupKey(targetTransaction.title);
      const targetInstallmentInfo = getInstallmentInfo(targetTransaction.title);

      app.state.transactions.forEach((transaction) => {
        if (transaction.docId === docId) {
          return;
        }

        const isSameAccountType = transaction.accountType === targetTransaction.accountType;
        const transactionGroupKey = getInstallmentGroupKey(transaction.title);
        const transactionInstallmentInfo = getInstallmentInfo(transaction.title);
        const isSameInstallmentSeries =
          Boolean(targetGroupKey) &&
          Boolean(targetInstallmentInfo) &&
          isSameAccountType &&
          Boolean(transactionGroupKey) &&
          Boolean(transactionInstallmentInfo) &&
          transactionGroupKey === targetGroupKey &&
          transactionInstallmentInfo.total === targetInstallmentInfo.total;

        if (isSameInstallmentSeries) {
          updatesByDocId.set(transaction.docId, normalizedCategory);
          return;
        }

        if (transaction.category !== 'Outros') {
          return;
        }

        const transactionTitleKey = getTransactionTitleMatchKey(transaction.title);
        const isSameTitle = Boolean(targetTitleKey) && transactionTitleKey === targetTitleKey;
        if (isSameTitle) {
          updatesByDocId.set(transaction.docId, normalizedCategory);
        }
      });
    }

    const manualUpdatedAt = new Date().toISOString();
    const updates = [...updatesByDocId].map(([nextDocId, nextCategory]) => {
      const currentTransaction = transactionsById.get(nextDocId);
      return {
        docId: nextDocId,
        category: nextCategory,
        metadata: buildManualCategoryMetadata(currentTransaction, nextCategory, manualUpdatedAt)
      };
    });

    if (updates.length === 1) {
      await app.repository.updateCategory(app.state.user.uid, docId, normalizedCategory, updates[0].metadata);
    } else {
      await app.repository.batchUpdateCategories(app.state.user.uid, updates, { batchSize: 100 });
    }

    const updatesMap = new Map(updates.map((update) => [update.docId, update]));
    app.setTransactionsAndRefresh(
      app.state.transactions.map((transaction) => {
        const update = updatesMap.get(transaction.docId);
        if (!update) {
          return transaction;
        }

        return {
          ...transaction,
          category: update.category,
          ...(update.metadata || {})
        };
      })
    );
  } catch (error) {
    app.authView.showMessage(app.normalizeError(error), 'error');
  }
}

export async function createAndAssignCategory(app, docId, categoryName) {
  if (!app.state.user) {
    return;
  }

  const name = String(categoryName || '').trim();
  if (!name) {
    app.authView.showMessage('Informe um nome para a categoria.', 'error');
    return;
  }

  try {
    const createdName = await app.repository.createCategory(app.state.user.uid, name);
    if (!app.state.userCategories.some((category) => category.toLowerCase() === createdName.toLowerCase())) {
      app.state.setUserCategories([...app.state.userCategories, createdName]);
    }

    await updateCategory(app, docId, createdName);
  } catch (error) {
    app.authView.showMessage(app.normalizeError(error), 'error');
  }
}

export async function updateBankAccount(app, docId, bankAccountName) {
  if (!app.state.user) {
    return;
  }

  const normalizedBankAccount = normalizeBankAccountName(bankAccountName);
  if (!normalizedBankAccount) {
    app.authView.showMessage('Conta bancária inválida.', 'error');
    return;
  }

  try {
    await app.repository.updateBankAccount(app.state.user.uid, docId, normalizedBankAccount);
    app.setTransactionsAndRefresh(
      app.state.transactions.map((transaction) =>
        transaction.docId === docId ? { ...transaction, bankAccount: normalizedBankAccount } : transaction
      )
    );
  } catch (error) {
    app.authView.showMessage(app.normalizeError(error), 'error');
  }
}

export async function createBankAccount(app, bankAccountName) {
  if (!app.state.user) {
    return null;
  }

  const name = normalizeBankAccountName(bankAccountName);
  if (!name) {
    app.authView.showMessage('Informe um nome para a conta bancária.', 'error');
    return null;
  }

  try {
    const createdName = await app.repository.createBankAccount(app.state.user.uid, name);
    if (!app.state.userBankAccounts.some((account) => account.toLowerCase() === createdName.toLowerCase())) {
      app.state.setUserBankAccounts([...app.state.userBankAccounts, createdName]);
      app.refreshDashboard();
    }

    return createdName;
  } catch (error) {
    app.authView.showMessage(app.normalizeError(error), 'error');
    return null;
  }
}

export async function createAndAssignBankAccount(app, docId, bankAccountName) {
  if (!app.state.user) {
    return;
  }

  const createdName = await createBankAccount(app, bankAccountName);
  if (!createdName) {
    return;
  }

  await updateBankAccount(app, docId, createdName);
}

export async function createManualTransaction(app, payload = {}) {
  if (!app.state.user) {
    return false;
  }

  const title = String(payload.title || '').trim();
  const category = String(payload.category || '').trim() || 'Outros';
  const bankAccount = normalizeBankAccountName(payload.bankAccount);
  const accountType = payload.accountType === 'Crédito' ? 'Crédito' : 'Conta';
  const parsedAmount = parseManualAmount(payload.value);
  const value = Math.abs(parsedAmount);

  if (!title) {
    app.authView.showMessage('Informe a descrição da transação.', 'error');
    return false;
  }

  if (!Number.isFinite(value) || value <= 0) {
    app.authView.showMessage('Informe um valor válido maior que zero.', 'error');
    return false;
  }

  const date = resolveManualTransactionDate(app);
  const transaction = {
    date,
    title,
    value,
    category,
    accountType,
    bankAccount,
    active: true,
    createdBy: 'manual',
    createdAt: new Date().toISOString(),
    categorySource: 'manual',
    categoryAutoAssigned: false,
    categoryManuallyEdited: false,
    lastCategoryUpdateAt: new Date().toISOString()
  };
  const hash = generateTransactionHash(transaction);
  const alreadyExists = app.state.transactions.some((existing) => existing.hash === hash);
  if (alreadyExists) {
    app.authView.showMessage('Essa transação já existe na base (mesmo título, data, valor e tipo).', 'error');
    return false;
  }

  try {
    const inserted = await app.repository.createTransaction(app.state.user.uid, { ...transaction, hash });
    app.setTransactionsAndRefresh([...app.state.transactions, inserted]);
    try {
      await app.repository.recordUsageMetrics(app.state.user.uid, {
        manualTransactions: 1
      });
    } catch (usageError) {
      console.warn('Falha ao registrar transação manual em métricas:', usageError);
    }
    app.authView.showMessage('Transação criada com sucesso.', 'success');
    return true;
  } catch (error) {
    app.authView.showMessage(app.normalizeError(error), 'error');
    return false;
  }
}

export async function updateTransactionDescription(app, docId, title) {
  if (!app.state.user) {
    return false;
  }

  const normalizedTitle = String(title || '').trim();
  if (!normalizedTitle) {
    app.authView.showMessage('Descrição inválida.', 'error');
    return false;
  }

  try {
    await app.repository.updateTitle(app.state.user.uid, docId, normalizedTitle);
    app.setTransactionsAndRefresh(
      app.state.transactions.map((transaction) =>
        transaction.docId === docId ? { ...transaction, title: normalizedTitle } : transaction
      )
    );
    return true;
  } catch (error) {
    app.authView.showMessage(app.normalizeError(error), 'error');
    return false;
  }
}
