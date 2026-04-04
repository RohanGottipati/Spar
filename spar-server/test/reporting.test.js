const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildReportDossier,
  sanitizeAnalyzerOutput,
  sanitizeFinalReport,
} = require('../lib/reporting');

function createScenario() {
  return {
    id: 'duplicate-orders',
    title: 'Checkout Bug',
    company: 'E-commerce Platform',
    description: 'Orders are duplicating in production.',
    difficulty: 'Mid-level',
    timeLimit: 2400,
    visibleFiles: [
      { path: 'routes/orders.js', content: 'broken code' },
    ],
    answerKey: {
      bugLocation: 'routes/orders.js',
      bugLine: 28,
      bugExplanation: 'The catch block retries and duplicates the order.',
      fixSummary: 'Remove the retry and return an error.',
      fixedFiles: [
        { path: 'routes/orders.js.fixed.js', content: 'fixed code' },
      ],
    },
  };
}

test('buildReportDossier derives the expected session metrics', () => {
  const dossier = buildReportDossier({
    scenario: createScenario(),
    tracker: {
      startedAt: 1_000,
      finishedAt: 31_000,
      firstEditAt: 6_000,
      activeFileAtFinish: 'routes/orders.js',
      fileOpens: [
        { file: 'routes/orders.js', ts: 1_000 },
        { file: 'db/index.js', ts: 4_000 },
      ],
      editorEvents: [
        {
          file: 'routes/orders.js',
          ts: 6_000,
          versionId: 2,
          changes: [{ rangeOffset: 0, rangeLength: 0, text: 'fix' }],
        },
      ],
      utterances: [
        { ts: 2_000, text: 'I am looking at the retry path.', source: 'voice' },
      ],
      chatHistory: [
        { ts: 1_500, role: 'assistant', content: 'Where do you want to start?' },
        { ts: 2_000, role: 'user', content: 'I am looking at the retry path.' },
      ],
      finalFiles: {
        'routes/orders.js': 'updated content',
      },
    },
  });

  assert.equal(dossier.derived.durationSeconds, 30);
  assert.equal(dossier.derived.timeToFirstEditSeconds, 5);
  assert.equal(dossier.derived.filesOpened, 2);
  assert.equal(dossier.derived.utteranceCount, 1);
  assert.equal(dossier.derived.assistantQuestionCount, 1);
  assert.equal(dossier.derived.readBeforeEdit, true);
});

test('sanitizeFinalReport falls back to analyzer output when synthesis JSON is invalid', () => {
  const dossier = buildReportDossier({
    scenario: createScenario(),
    tracker: {
      startedAt: 1_000,
      finishedAt: 11_000,
      fileOpens: [{ file: 'routes/orders.js', ts: 1_000 }],
      editorEvents: [],
      utterances: [],
      chatHistory: [],
      finalFiles: {},
    },
  });

  const analyses = {
    code_behavior: sanitizeAnalyzerOutput('code_behavior', JSON.stringify({
      score: 7,
      summary: 'You read before editing.',
      strengths: ['Read code first'],
      concerns: ['Could explore one more file'],
      evidence: ['Opened orders and db files'],
    })),
    communication_quality: sanitizeAnalyzerOutput('communication_quality', JSON.stringify({
      score: 6,
      summary: 'Communication was decent but sparse.',
      strengths: ['Explained one hypothesis'],
      concerns: ['Needed more narration'],
      evidence: ['Only a few utterances'],
    })),
    interviewer_dynamic: sanitizeAnalyzerOutput('interviewer_dynamic', JSON.stringify({
      score: 5,
      summary: 'You answered prompts but did not go very deep.',
      strengths: ['Responded to interviewer'],
      concerns: ['Needed deeper follow-through'],
      evidence: ['Short replies'],
    })),
    bug_fix_quality: sanitizeAnalyzerOutput('bug_fix_quality', JSON.stringify({
      score: 8,
      summary: 'The fix addresses the duplicate-order root cause.',
      strengths: ['Removed the retry path'],
      concerns: ['Could still add idempotency'],
      evidence: ['Final file removed duplicate charge flow'],
    })),
  };

  const report = sanitizeFinalReport('not valid json', dossier, analyses);

  assert.equal(report.dimensions.length, 4);
  assert.equal(report.dimensions[0].score, 7);
  assert.equal(report.nextSteps.length, 3);
  assert.ok(typeof report.verdict === 'string' && report.verdict.length > 0);
});
