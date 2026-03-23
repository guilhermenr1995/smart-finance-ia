import {
  generateTransactionDedupKey,
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
    const synced = await app.syncDataFromCloud({ force: true, showOverlay: false });
    if (!synced) {
      throw new Error('Não foi possível sincronizar sua base antes da importação. Tente novamente em instantes.');
    }

    const importBankAccount = normalizeBankAccountName(bankAccountName);
    app.overlayView.log(`Base sincronizada com sucesso (${app.state.transactions.length} lançamento(s) atuais).`);

    const isPdfFile = /\.pdf$/i.test(file.name || '');
    const fileContent = isPdfFile ? await file.arrayBuffer() : await file.text();
    const existingHashes = new Set();
    app.state.transactions.forEach((transaction) => {
      const transactionHash = String(transaction?.hash || '').trim();
      const transactionDedupKey =
        String(transaction?.dedupKey || '').trim() || generateTransactionDedupKey(transaction || {});

      if (transactionHash) {
        existingHashes.add(transactionHash);
      }

      if (transactionDedupKey) {
        existingHashes.add(transactionDedupKey);
      }
    });
    const parseResult = await app.csvImportService.parseFileContent(file.name, fileContent, accountType, existingHashes);
    const diagnostics = parseResult?.diagnostics || {};
    const importedAt = new Date().toISOString();

    if (parseResult.transactions.length === 0) {
      app.overlayView.log('Nenhuma transação nova foi identificada.');
      app.overlayView.log(`Itens ignorados: ${parseResult.skipped}`);
      if (diagnostics && typeof diagnostics === 'object') {
        const delimiter = diagnostics.delimiter === '\t' ? 'TAB' : diagnostics.delimiter || '-';
        const totalRows = Number(diagnostics.totalRows || 0);
        const skippedInvalidRows = Number(diagnostics.skippedInvalidRows || 0);
        const skippedIgnoredRows = Number(diagnostics.skippedIgnoredRows || 0);
        const skippedDuplicateRows = Number(diagnostics.skippedDuplicateRows || 0);
        const fieldMapping = diagnostics.fieldMapping || {};
        app.overlayView.log(
          `Diagnóstico: origem=${diagnostics.sourceType || '-'} | delimitador=${delimiter} | válidas=${Number(
            diagnostics.importedRows || 0
          )}`
        );
        if (diagnostics.sourceType === 'csv') {
          const parseMode = String(fieldMapping.parseMode || '-').trim();
          const toColumnLabel = (value) => {
            const index = Number(value);
            return Number.isInteger(index) && index >= 0 ? String(index + 1) : '-';
          };
          app.overlayView.log(
            `Mapeamento CSV: data=${toColumnLabel(fieldMapping.dateIndex)} | descrição=${toColumnLabel(
              fieldMapping.titleIndex
            )} | valor=${toColumnLabel(fieldMapping.valueIndex)} | modo=${parseMode}`
          );
        }
        app.overlayView.log(
          `Descartes: inválidas=${skippedInvalidRows} | regra negócio=${skippedIgnoredRows} | duplicadas=${skippedDuplicateRows}`
        );
        if (totalRows > 0 && skippedInvalidRows === totalRows) {
          app.overlayView.log('Dica: o formato do CSV não foi reconhecido. Tente exportar novamente ou usar OFX/PDF.');
        } else if (totalRows > 0 && skippedIgnoredRows === totalRows) {
          app.overlayView.log('Dica: os lançamentos foram lidos como receitas/estornos e foram descartados pelas regras.');
        } else if (totalRows > 0 && skippedDuplicateRows === totalRows) {
          app.overlayView.log('Dica: todos os itens já existem na base (mesma descrição, data e valor).');
        }
      }
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
      const normalizedTransaction = {
        ...transaction,
        hash: String(transaction.hash || '').trim() || generateTransactionHash(transaction),
        dedupKey: String(transaction.dedupKey || '').trim() || generateTransactionDedupKey(transaction)
      };

      if (!autoSuggestion) {
        return normalizedTransaction;
      }

      return {
        ...normalizedTransaction,
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
    if (diagnostics && typeof diagnostics === 'object') {
      app.overlayView.log(
        `Detalhe ignorados: inválidas=${Number(diagnostics.skippedInvalidRows || 0)} | regra negócio=${Number(
          diagnostics.skippedIgnoredRows || 0
        )} | duplicadas=${Number(diagnostics.skippedDuplicateRows || 0)}`
      );
    }
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
  const dedupKey = generateTransactionDedupKey(transaction);
  const alreadyExists = app.state.transactions.some((existing) => {
    const existingHash = String(existing?.hash || '').trim();
    const existingDedupKey = String(existing?.dedupKey || '').trim() || generateTransactionDedupKey(existing || {});
    return existingHash === hash || existingDedupKey === dedupKey;
  });
  if (alreadyExists) {
    app.authView.showMessage('Essa transação já existe na base (mesma descrição, data e valor).', 'error');
    return false;
  }

  try {
    const inserted = await app.repository.createTransaction(app.state.user.uid, { ...transaction, hash, dedupKey });
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
    const currentTransaction = app.state.transactions.find((transaction) => transaction.docId === docId);
    if (!currentTransaction) {
      app.authView.showMessage('Transação não encontrada para edição.', 'error');
      return false;
    }

    const nextSnapshot = {
      ...currentTransaction,
      title: normalizedTitle
    };
    const nextHash = generateTransactionHash(nextSnapshot);
    const nextDedupKey = generateTransactionDedupKey(nextSnapshot);
    const hasDuplicate = app.state.transactions.some((transaction) => {
      if (transaction.docId === docId) {
        return false;
      }

      const transactionDedupKey =
        String(transaction?.dedupKey || '').trim() || generateTransactionDedupKey(transaction || {});
      return transactionDedupKey === nextDedupKey;
    });

    if (hasDuplicate) {
      app.authView.showMessage(
        'Já existe outra transação com a mesma descrição, data e valor. Ajuste a descrição para evitar duplicidade.',
        'error'
      );
      return false;
    }

    await app.repository.updateTitle(app.state.user.uid, docId, {
      title: normalizedTitle,
      hash: nextHash,
      dedupKey: nextDedupKey
    });
    app.setTransactionsAndRefresh(
      app.state.transactions.map((transaction) =>
        transaction.docId === docId
          ? { ...transaction, title: normalizedTitle, hash: nextHash, dedupKey: nextDedupKey }
          : transaction
      )
    );
    return true;
  } catch (error) {
    app.authView.showMessage(app.normalizeError(error), 'error');
    return false;
  }
}
