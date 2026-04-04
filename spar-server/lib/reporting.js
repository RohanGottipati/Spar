const REPORT_DIMENSIONS = {
  code_behavior: 'Code Behavior',
  communication_quality: 'Communication Quality',
  interviewer_dynamic: 'Interviewer Dynamic',
  bug_fix_quality: 'Bug Fix Quality',
};
const REPORT_DIMENSION_KEYS = Object.keys(REPORT_DIMENSIONS);
const DEFAULT_NEXT_STEPS_BY_DIMENSION = {
  code_behavior: 'Make each debugging step explicit: inspect the code path, state a hypothesis, then validate it before editing.',
  communication_quality: 'Narrate concrete evidence and expected outcomes so your reasoning is easy to follow.',
  interviewer_dynamic: 'Answer the interviewer directly, then connect your response back to the code and production impact.',
  bug_fix_quality: 'Close the loop on root cause, regression risk, and the test you would add after the fix.',
};
const GENERIC_ANALYSIS_FAILURE_STRINGS = new Set([
  'structured analysis failed.',
  'structured analysis was incomplete.',
  'the analysis agent did not return structured output.',
]);

function clampScore(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(10, Math.round(value)));
}

function normalizeShortText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toSeconds(timestamp) {
  return typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : null;
}

function extractJsonObject(text) {
  if (typeof text !== 'string') {
    return null;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch (_err) {
    const fenced = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');

    try {
      return JSON.parse(fenced);
    } catch (_innerErr) {
      const start = fenced.indexOf('{');
      const end = fenced.lastIndexOf('}');

      if (start === -1 || end === -1 || end <= start) {
        return null;
      }

      try {
        return JSON.parse(fenced.slice(start, end + 1));
      } catch (_sliceErr) {
        return null;
      }
    }
  }
}

function buildChangePreview(change) {
  return {
    rangeOffset: change.rangeOffset,
    rangeLength: change.rangeLength,
    textPreview: typeof change.text === 'string' ? change.text.slice(0, 120) : '',
  };
}

function normalizeEditorEvent(event) {
  return {
    file: event.file,
    ts: event.ts,
    versionId: event.versionId,
    isUndoing: Boolean(event.isUndoing),
    isRedoing: Boolean(event.isRedoing),
    changes: Array.isArray(event.changes) ? event.changes.map(buildChangePreview) : [],
  };
}

function normalizeChatMessage(message) {
  return {
    ts: message.ts,
    role: message.role,
    content: message.content,
    source: message.source || null,
  };
}

function normalizeTrackerPayload(rawTracker) {
  const tracker = rawTracker && typeof rawTracker === 'object' ? rawTracker : {};
  const fileOpens = Array.isArray(tracker.fileOpens)
    ? tracker.fileOpens.filter((event) => event && typeof event.file === 'string' && typeof event.ts === 'number')
    : [];
  const editorEvents = Array.isArray(tracker.editorEvents)
    ? tracker.editorEvents.filter((event) => event && typeof event.file === 'string' && typeof event.ts === 'number').map(normalizeEditorEvent)
    : [];
  const utterances = Array.isArray(tracker.utterances)
    ? tracker.utterances.filter((utterance) => utterance && typeof utterance.text === 'string' && typeof utterance.ts === 'number')
    : [];
  const chatHistory = Array.isArray(tracker.chatHistory)
    ? tracker.chatHistory.filter((message) => message && typeof message.content === 'string' && typeof message.role === 'string').map(normalizeChatMessage)
    : [];
  const finalFiles = tracker.finalFiles && typeof tracker.finalFiles === 'object' ? tracker.finalFiles : {};

  return {
    startedAt: toSeconds(tracker.startedAt),
    finishedAt: toSeconds(tracker.finishedAt),
    firstEditAt: toSeconds(tracker.firstEditAt),
    activeFileAtFinish: typeof tracker.activeFileAtFinish === 'string' ? tracker.activeFileAtFinish : null,
    fileOpens,
    editorEvents,
    utterances,
    chatHistory,
    finalFiles,
  };
}

function buildDerivedMetrics(tracker) {
  const startedAt = tracker.startedAt || Date.now();
  const finishedAt = tracker.finishedAt || startedAt;
  const firstEditAt = tracker.firstEditAt;
  const uniqueFilesOpened = Array.from(new Set(tracker.fileOpens.map((event) => event.file)));
  const assistantQuestions = tracker.chatHistory.filter((message) => message.role === 'assistant').length;
  const readBeforeEdit = firstEditAt
    ? tracker.fileOpens.some((event) => event.ts < firstEditAt)
    : tracker.fileOpens.length > 0;

  return {
    durationSeconds: Math.max(0, Math.round((finishedAt - startedAt) / 1000)),
    timeToFirstEditSeconds: firstEditAt ? Math.max(0, Math.round((firstEditAt - startedAt) / 1000)) : null,
    filesOpened: uniqueFilesOpened.length,
    filesOpenedList: uniqueFilesOpened,
    utteranceCount: tracker.utterances.length,
    assistantQuestionCount: assistantQuestions,
    editorEventCount: tracker.editorEvents.length,
    readBeforeEdit,
    activeFileAtFinish: tracker.activeFileAtFinish,
  };
}

function buildReportDossier({ scenario, tracker }) {
  const normalizedTracker = normalizeTrackerPayload(tracker);
  const derived = buildDerivedMetrics(normalizedTracker);

  return {
    scenario: {
      id: scenario.id,
      title: scenario.title,
      company: scenario.company,
      description: scenario.description,
      difficulty: scenario.difficulty,
      timeLimitSeconds: scenario.timeLimit,
      visibleFiles: scenario.visibleFiles,
      answerKey: scenario.answerKey,
    },
    tracker: normalizedTracker,
    derived,
  };
}

function buildAnalyzerPrompt(kind, dossier) {
  const commonInstructions = [
    'Review this debugging session dossier and score the candidate from 0 to 10.',
    'Use only the provided evidence.',
    'Keep the summary under 90 words.',
    'Return strict JSON with keys key, label, score, maxScore, summary, strengths, concerns, evidence.',
    'strengths, concerns, and evidence must each contain 1 to 3 short strings.',
  ];

  const focusByKind = {
    code_behavior: 'Focus on debugging process: code reading, sequence of exploration, edit discipline, and whether they tested hypotheses before changing code.',
    communication_quality: 'Focus on clarity, specificity, and whether the candidate explained reasoning while thinking out loud.',
    interviewer_dynamic: 'Focus on how the candidate handled interviewer prompts, responded to pushback, and collaborated under pressure.',
    bug_fix_quality: 'Focus on whether the final edits actually address the root cause, avoid regressions, and align with the answer key.',
  };

  return [
    ...commonInstructions,
    focusByKind[kind] || '',
    'Session dossier JSON:',
    JSON.stringify(dossier),
  ].join('\n\n');
}

function sanitizeAnalyzerOutput(kind, rawText) {
  const parsed = extractJsonObject(rawText);
  const label = REPORT_DIMENSIONS[kind];

  if (!parsed || typeof parsed !== 'object') {
    return {
      key: kind,
      label,
      score: 0,
      maxScore: 10,
      summary: 'The analysis agent did not return structured output.',
      strengths: [],
      concerns: ['Structured analysis failed.'],
      evidence: [],
      rawText: typeof rawText === 'string' ? rawText : '',
      usedFallback: true,
    };
  }

  return {
    key: kind,
    label,
    score: clampScore(parsed.score),
    maxScore: 10,
    summary: typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : 'Structured analysis was incomplete.',
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.filter(Boolean).slice(0, 3) : [],
    concerns: Array.isArray(parsed.concerns) ? parsed.concerns.filter(Boolean).slice(0, 3) : [],
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence.filter(Boolean).slice(0, 3) : [],
    rawText: typeof rawText === 'string' ? rawText : '',
    usedFallback: false,
  };
}

function buildUniqueNextSteps(candidates) {
  const nextSteps = [];
  const seen = new Set();

  candidates.forEach((candidate) => {
    const normalized = normalizeShortText(candidate);
    if (!normalized) {
      return;
    }

    const dedupeKey = normalized.toLowerCase();
    if (GENERIC_ANALYSIS_FAILURE_STRINGS.has(dedupeKey) || seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    nextSteps.push(normalized);
  });

  return nextSteps;
}

function buildFallbackNextSteps(analyses) {
  const concernSuggestions = REPORT_DIMENSION_KEYS
    .map((key) => analyses[key]?.concerns?.[0] || '')
    .filter(Boolean);
  const defaultSuggestions = REPORT_DIMENSION_KEYS.map((key) => DEFAULT_NEXT_STEPS_BY_DIMENSION[key]);

  return buildUniqueNextSteps([...concernSuggestions, ...defaultSuggestions]).slice(0, 3);
}

function buildAnalysisStatus(analyses, { usedFallbackSynthesis = false } = {}) {
  const failedDimensions = REPORT_DIMENSION_KEYS.filter((key) => analyses[key]?.usedFallback);

  return {
    degraded: failedDimensions.length > 0 || usedFallbackSynthesis,
    failedDimensions,
    usedFallbackSynthesis: Boolean(usedFallbackSynthesis),
  };
}

function buildSynthesizerPrompt({ dossier, analyses }) {
  return [
    'Synthesize the four analyzer outputs into the final Spar report.',
    'Return strict JSON only.',
    'Rules:',
    '- Preserve exactly four dimensions in this order: code_behavior, communication_quality, interviewer_dynamic, bug_fix_quality.',
    '- Each dimension needs key, label, score, maxScore, summary.',
    '- verdict must be one of: Strong Hire, Hire, Leaning Hire, Leaning No Hire, No Hire.',
    '- verdictSummary should be 2 to 4 sentences, direct and candidate-facing.',
    '- nextSteps must contain exactly 3 short coaching bullets with no numbering.',
    '- sessionMeta must use the provided derived metrics.',
    '',
    'Derived metrics:',
    JSON.stringify(dossier.derived),
    '',
    'Analyzer outputs:',
    JSON.stringify(analyses),
  ].join('\n');
}

function sanitizeDimension(dimension, fallback) {
  return {
    key: fallback.key,
    label: typeof dimension?.label === 'string' && dimension.label.trim() ? dimension.label.trim() : fallback.label,
    score: clampScore(dimension?.score),
    maxScore: 10,
    summary: typeof dimension?.summary === 'string' && dimension.summary.trim()
      ? dimension.summary.trim()
      : fallback.summary,
  };
}

function deriveVerdictFromAverage(average) {
  if (average >= 8.5) {
    return 'Strong Hire';
  }

  if (average >= 7) {
    return 'Hire';
  }

  if (average >= 5.5) {
    return 'Leaning Hire';
  }

  if (average >= 4) {
    return 'Leaning No Hire';
  }

  return 'No Hire';
}

function buildFallbackReport({ dossier, analyses }) {
  const dimensions = [
    analyses.code_behavior,
    analyses.communication_quality,
    analyses.interviewer_dynamic,
    analyses.bug_fix_quality,
  ].map((analysis) => ({
    key: analysis.key,
    label: analysis.label,
    score: clampScore(analysis.score),
    maxScore: 10,
    summary: analysis.summary,
  }));

  const average = dimensions.reduce((total, dimension) => total + dimension.score, 0) / dimensions.length;
  const verdict = deriveVerdictFromAverage(average);
  const nextSteps = buildFallbackNextSteps(analyses);

  return {
    dimensions,
    verdict,
    verdictSummary: `You showed a ${verdict.toLowerCase()} level performance overall. The strongest signal came from ${dimensions.slice().sort((a, b) => b.score - a.score)[0].label.toLowerCase()}, while the biggest gap was ${dimensions.slice().sort((a, b) => a.score - b.score)[0].label.toLowerCase()}.`,
    nextSteps,
    sessionMeta: {
      durationSeconds: dossier.derived.durationSeconds,
      timeToFirstEditSeconds: dossier.derived.timeToFirstEditSeconds,
      filesOpened: dossier.derived.filesOpened,
      utteranceCount: dossier.derived.utteranceCount,
    },
    analysisStatus: buildAnalysisStatus(analyses, { usedFallbackSynthesis: true }),
  };
}

function sanitizeFinalReport(rawText, dossier, analyses) {
  const parsed = extractJsonObject(rawText);

  if (!parsed || typeof parsed !== 'object') {
    return buildFallbackReport({ dossier, analyses });
  }

  const fallbackDimensions = [
    analyses.code_behavior,
    analyses.communication_quality,
    analyses.interviewer_dynamic,
    analyses.bug_fix_quality,
  ];
  const parsedDimensions = Array.isArray(parsed.dimensions) ? parsed.dimensions : [];
  const dimensions = fallbackDimensions.map((fallback, index) => sanitizeDimension(parsedDimensions[index], fallback));
  const average = dimensions.reduce((total, dimension) => total + dimension.score, 0) / dimensions.length;
  const verdict = typeof parsed.verdict === 'string' && parsed.verdict.trim()
    ? parsed.verdict.trim()
    : deriveVerdictFromAverage(average);
  const nextSteps = buildUniqueNextSteps(Array.isArray(parsed.nextSteps) ? parsed.nextSteps : []);
  const mergedNextSteps = buildUniqueNextSteps([
    ...nextSteps,
    ...buildFallbackNextSteps(analyses),
  ]).slice(0, 3);

  return {
    dimensions,
    verdict,
    verdictSummary: typeof parsed.verdictSummary === 'string' && parsed.verdictSummary.trim()
      ? parsed.verdictSummary.trim()
      : buildFallbackReport({ dossier, analyses }).verdictSummary,
    nextSteps: mergedNextSteps,
    sessionMeta: {
      durationSeconds: dossier.derived.durationSeconds,
      timeToFirstEditSeconds: dossier.derived.timeToFirstEditSeconds,
      filesOpened: dossier.derived.filesOpened,
      utteranceCount: dossier.derived.utteranceCount,
    },
    analysisStatus: buildAnalysisStatus(analyses),
  };
}

module.exports = {
  buildAnalyzerPrompt,
  buildFallbackReport,
  buildReportDossier,
  buildSynthesizerPrompt,
  normalizeTrackerPayload,
  sanitizeAnalyzerOutput,
  sanitizeFinalReport,
};
