import { getInstallmentGroupKey, getInstallmentInfo, getTransactionTitleMatchKey } from '../../utils/transaction-utils.js';

export async function importCsv(app, file, accountType) {
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

    const isPdfFile = /\.pdf$/i.test(file.name || '');
    const fileContent = isPdfFile ? await file.arrayBuffer() : await file.text();
    const existingHashes = new Set(app.state.transactions.map((transaction) => transaction.hash));
    const parseResult = await app.csvImportService.parseFileContent(file.name, fileContent, accountType, existingHashes);

    if (parseResult.transactions.length === 0) {
      app.overlayView.log('Nenhuma transação nova foi identificada.');
      app.overlayView.log(`Itens ignorados: ${parseResult.skipped}`);
      setTimeout(() => app.overlayView.hide(), 1000);
      return;
    }

    const memoryApplied = app.categoryMemoryService.applyMemoryToTransactions(
      parseResult.transactions,
      app.state.transactions,
      { onlyOthers: true }
    );
    const transactionsToInsert = memoryApplied.transactions;

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

    app.overlayView.log(
      `Importação concluída: ${transactionsToInsert.length} novos lançamentos, ${parseResult.skipped} ignorados.`
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

    const updates = [...updatesByDocId].map(([nextDocId, nextCategory]) => ({
      docId: nextDocId,
      category: nextCategory
    }));

    if (updates.length === 1) {
      await app.repository.updateCategory(app.state.user.uid, docId, normalizedCategory);
    } else {
      await app.repository.batchUpdateCategories(app.state.user.uid, updates, { batchSize: 100 });
    }

    app.setTransactionsAndRefresh(
      app.state.transactions.map((transaction) =>
        updatesByDocId.has(transaction.docId) ? { ...transaction, category: updatesByDocId.get(transaction.docId) } : transaction
      )
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
