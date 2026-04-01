import {
  DEFAULT_BANK_ACCOUNT,
  buildManualCategoryMetadata,
  buildPlatformCategorySource,
  generateTransactionDedupKey,
  generateTransactionHash,
  getInstallmentGroupKey,
  getInstallmentInfo,
  getTransactionTitleMatchKey,
  normalizeBankAccountName,
  parseManualAmount,
  resolveManualTransactionDate
} from './transaction-flow-helpers.js';

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

