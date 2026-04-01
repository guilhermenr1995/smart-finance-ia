import { getGoalScopeLabel, getMonthBounds, normalizeGoalScope } from '../../../utils/goal-utils.js';
import {
  buildAutomaticGoalSuggestions,
  isMonthClosed,
  mergeMonthlyGoals,
  normalizeCategoryKey,
  resolveGoalScope,
  resolveReferenceMonthKey
} from './goal-flow-helpers.js';

export async function saveMonthlyGoal(app, payload = {}) {
  if (!app.state.user) {
    return false;
  }

  const category = String(payload.category || '').trim();
  const targetValue = Number(payload.targetValue || 0);
  const monthKey = String(payload.monthKey || resolveReferenceMonthKey(app)).trim();
  const goalScope = resolveGoalScope(app, payload.accountScope);

  if (!category) {
    app.authView.showMessage('Selecione uma categoria para a meta.', 'error');
    return false;
  }

  if (!Number.isFinite(targetValue) || targetValue <= 0) {
    app.authView.showMessage('Informe um valor mensal válido para a meta.', 'error');
    return false;
  }

  if (isMonthClosed(monthKey)) {
    app.authView.showMessage('Não é possível criar/editar metas para meses já encerrados.', 'error');
    return false;
  }

  try {
    const saved = await app.repository.upsertMonthlyGoal(app.state.user.uid, {
      docId: payload.docId,
      monthKey,
      category,
      accountScope: goalScope,
      targetValue,
      source: payload.source === 'auto' ? 'auto' : 'manual',
      rationale: payload.rationale || '',
      active: true
    });

    if (!app.state.userCategories.some((item) => normalizeCategoryKey(item) === normalizeCategoryKey(category))) {
      try {
        await app.repository.createCategory(app.state.user.uid, category);
      } catch (categoryError) {
        console.warn('Falha ao sincronizar categoria ao salvar meta:', categoryError);
      }
      app.state.setUserCategories([...app.state.userCategories, category]);
    }

    app.state.upsertMonthlyGoal(saved);
    app.persistTransactionsCache();
    app.refreshDashboard();
    app.authView.showMessage('Meta mensal salva com sucesso.', 'success');
    return true;
  } catch (error) {
    app.authView.showMessage(app.normalizeError(error), 'error');
    return false;
  }
}

export async function deleteMonthlyGoal(app, goalDocId) {
  if (!app.state.user) {
    return false;
  }

  const safeDocId = String(goalDocId || '').trim();
  if (!safeDocId) {
    return false;
  }

  try {
    await app.repository.deleteMonthlyGoal(app.state.user.uid, safeDocId);
    app.state.removeMonthlyGoal(safeDocId);
    app.persistTransactionsCache();
    app.refreshDashboard();
    app.authView.showMessage('Meta removida com sucesso.', 'success');
    return true;
  } catch (error) {
    app.authView.showMessage(app.normalizeError(error), 'error');
    return false;
  }
}

export async function generateAutomaticMonthlyGoals(app) {
  if (!app.state.user) {
    return false;
  }

  const targetMonthKey = resolveReferenceMonthKey(app);
  const goalScope = resolveGoalScope(app);
  const goalScopeLabel = getGoalScopeLabel(goalScope);
  if (isMonthClosed(targetMonthKey)) {
    app.authView.showMessage('A geração automática só é permitida para o mês atual ou meses futuros.', 'error');
    return false;
  }

  const generation = buildAutomaticGoalSuggestions(app, targetMonthKey, goalScope);
  if (generation.monthKeys.length < 2) {
    app.authView.showMessage('Você precisa de pelo menos 1 período anterior para gerar metas automáticas.', 'error');
    return false;
  }

  if (generation.suggestions.length === 0) {
    app.authView.showMessage('Não encontramos dados suficientes para gerar metas automáticas neste momento.', 'error');
    return false;
  }

  const existingGoalsInMonth = (app.state.monthlyGoals || []).filter(
    (goal) =>
      goal.active !== false &&
      goal.monthKey === targetMonthKey &&
      normalizeGoalScope(goal.accountScope) === goalScope
  );
  const suggestionsToPersist = generation.suggestions.map((suggestion) => ({
    ...suggestion,
    monthKey: targetMonthKey,
    accountScope: goalScope
  }));

  app.dashboardView.setBusy(true);
  app.overlayView.show('Gerando metas automáticas...');

  try {
    const existingDocIds = existingGoalsInMonth.map((goal) => String(goal.docId || '').trim()).filter(Boolean);
    if (existingDocIds.length > 0) {
      await app.repository.batchDeleteMonthlyGoals(app.state.user.uid, existingDocIds, {
        batchSize: 100,
        onProgress: (done, total) => {
          app.overlayView.log(`Limpando metas anteriores ${done}/${total}.`);
        }
      });
    }

    const upsertedGoals = await app.repository.batchUpsertMonthlyGoals(app.state.user.uid, suggestionsToPersist, {
      batchSize: 60,
      onProgress: (done, total) => {
        app.overlayView.log(`Metas automáticas ${done}/${total} aplicadas.`);
      }
    });

    const goalsOutsideTargetScope = (app.state.monthlyGoals || []).filter(
      (goal) =>
        !(goal?.active !== false && goal.monthKey === targetMonthKey && normalizeGoalScope(goal.accountScope) === goalScope)
    );
    const mergedGoals = mergeMonthlyGoals(goalsOutsideTargetScope, upsertedGoals);
    app.state.setMonthlyGoals(mergedGoals);
    app.persistTransactionsCache();
    app.refreshDashboard();
    const targetMonthLabel = getMonthBounds(targetMonthKey).label;
    app.overlayView.log(`Metas automáticas criadas para ${targetMonthLabel} (${goalScopeLabel}).`);
    app.overlayView.log(`Histórico analisado: ${generation.monthKeys.length} mês(es).`);
    setTimeout(() => app.overlayView.hide(), 900);
    app.authView.showMessage('Metas automáticas geradas com sucesso.', 'success');
    return true;
  } catch (error) {
    app.overlayView.showError(app.normalizeError(error));
    return false;
  } finally {
    app.dashboardView.setBusy(false);
  }
}

export async function deleteMonthlyGoalsForReferenceMonth(app) {
  if (!app.state.user) {
    return false;
  }

  const monthKey = resolveReferenceMonthKey(app);
  const monthLabel = getMonthBounds(monthKey).label;
  const goalScope = resolveGoalScope(app);
  const goalScopeLabel = getGoalScopeLabel(goalScope);
  const goalsInReferenceMonth = (app.state.monthlyGoals || []).filter(
    (goal) =>
      goal?.active !== false &&
      String(goal?.monthKey || '').trim() === monthKey &&
      normalizeGoalScope(goal.accountScope) === goalScope
  );
  const goalDocIds = goalsInReferenceMonth.map((goal) => String(goal.docId || '').trim()).filter(Boolean);

  if (goalDocIds.length === 0) {
    app.authView.showMessage(`Nenhuma meta encontrada para ${monthLabel} (${goalScopeLabel}).`, 'info');
    return true;
  }

  app.dashboardView.setBusy(true);
  app.overlayView.show(`Removendo metas de ${monthLabel} (${goalScopeLabel})...`);

  try {
    const result = await app.repository.batchDeleteMonthlyGoals(app.state.user.uid, goalDocIds, {
      batchSize: 100,
      onProgress: (done, total) => {
        app.overlayView.log(`Metas do mês removidas: ${done}/${total}.`);
      }
    });

    const removedCount = Number(result?.removed || 0);
    const removedDocIdSet = new Set(goalDocIds);
    const remainingGoals = (app.state.monthlyGoals || []).filter((goal) => !removedDocIdSet.has(goal.docId));
    app.state.setMonthlyGoals(remainingGoals);
    app.persistTransactionsCache();
    app.refreshDashboard();
    setTimeout(() => app.overlayView.hide(), 900);

    if (removedCount <= 0) {
      app.authView.showMessage(`Nenhuma meta encontrada para ${monthLabel}.`, 'info');
      return true;
    }

    app.authView.showMessage(
      `${removedCount} meta(s) de ${monthLabel} (${goalScopeLabel}) removida(s) com sucesso.`,
      'success'
    );
    return true;
  } catch (error) {
    app.overlayView.showError(app.normalizeError(error));
    return false;
  } finally {
    app.dashboardView.setBusy(false);
  }
}
