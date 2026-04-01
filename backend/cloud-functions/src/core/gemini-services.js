const {
  getAuth,
  FieldValue,
  db,
  CONSULTANT_DAILY_LIMIT,
  getDateKeyInTimezone,
  buildModelCandidates,
  requestGeminiWithRetry,
  isNotFoundModelError,
  safeParseJson
} = require('./base');

async function listAllProjectAuthUsers() {
  const users = [];
  let nextPageToken = undefined;

  do {
    const page = await getAuth().listUsers(1000, nextPageToken);
    users.push(...(page.users || []));
    nextPageToken = page.pageToken;
  } while (nextPageToken);

  return users;
}

async function reserveConsultantUsage(userId, appId) {
  const dateKey = getDateKeyInTimezone();
  const usageRef = db.collection('ai_consultant_usage').doc(`${userId}_${dateKey}`);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(usageRef);
    const usedCount = Number(snapshot.data()?.count || 0);

    if (usedCount >= CONSULTANT_DAILY_LIMIT) {
      const limitError = new Error('Daily consultant limit reached');
      limitError.code = 'DAILY_LIMIT_REACHED';
      limitError.usage = {
        limit: CONSULTANT_DAILY_LIMIT,
        used: usedCount,
        remaining: 0,
        dateKey
      };
      throw limitError;
    }

    const nextCount = usedCount + 1;
    const payload = {
      userId,
      appId: appId || null,
      dateKey,
      count: nextCount,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (!snapshot.exists) {
      payload.createdAt = FieldValue.serverTimestamp();
    }

    transaction.set(usageRef, payload, { merge: true });

    return {
      limit: CONSULTANT_DAILY_LIMIT,
      used: nextCount,
      remaining: Math.max(0, CONSULTANT_DAILY_LIMIT - nextCount),
      dateKey
    };
  });
}

async function askGeminiForJson({
  geminiApiKey,
  geminiModel,
  systemInstruction,
  promptText,
  temperature = 0
}) {
  const modelCandidates = buildModelCandidates(geminiModel);
  let lastError = null;

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const candidateModel = modelCandidates[index];
    const geminiResult = await requestGeminiWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          generationConfig: {
            temperature,
            responseMimeType: 'application/json'
          }
        })
      },
      {
        maxRetries: 3,
        baseDelayMs: 450
      }
    );

    if (!geminiResult.ok) {
      const shouldTryNextModel =
        isNotFoundModelError(geminiResult.status, geminiResult.payload) && index < modelCandidates.length - 1;
      if (shouldTryNextModel) {
        continue;
      }

      lastError = {
        ok: false,
        status: geminiResult.status || 500,
        payload: geminiResult.payload,
        model: candidateModel
      };
      break;
    }

    const envelope = safeParseJson(geminiResult.payload);
    const rawText = envelope?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return {
        ok: false,
        status: 502,
        payload: 'Gemini returned an empty response',
        model: candidateModel
      };
    }

    const parsed = safeParseJson(rawText);
    if (!parsed) {
      return {
        ok: false,
        status: 502,
        payload: 'Gemini returned invalid JSON',
        model: candidateModel
      };
    }

    return {
      ok: true,
      data: parsed,
      model: candidateModel
    };
  }

  return (
    lastError || {
      ok: false,
      status: 500,
      payload: 'Gemini request failed on all candidate models',
      model: modelCandidates[0] || geminiModel
    }
  );
}


module.exports = {
  listAllProjectAuthUsers,
  reserveConsultantUsage,
  askGeminiForJson
};
