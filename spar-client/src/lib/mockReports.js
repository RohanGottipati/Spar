const CHECKOUT_BUG_SCENARIO_ID = 'duplicate-orders';

// Canned report for demos of the checkout bug scenario. Off unless
// VITE_CHECKOUT_BENCHMARK_REPORT=true, so real sessions always hit /api/reports.
export function isCheckoutBugBenchmarkScenario(scenario) {
  return import.meta.env.VITE_CHECKOUT_BENCHMARK_REPORT === 'true'
    && scenario?.id === CHECKOUT_BUG_SCENARIO_ID;
}

export function buildCheckoutBugBenchmarkReport({ scenario } = {}) {
  return {
    verdict: 'Hire',
    verdictSummary: 'You traced the duplicate charges to the retry inside the payment catch block and removed it instead of masking the symptom. Your reasoning was clear and evidence-driven. Tighten the idempotency story earlier in the session to move into a strong hire.',
    dimensions: [
      {
        key: 'code_behavior',
        label: 'Code Behavior',
        score: 8,
        maxScore: 10,
        summary: 'Opened the order route first, read the catch block closely, and confirmed the duplicate insert before editing.',
      },
      {
        key: 'communication_quality',
        label: 'Communication Quality',
        score: 8,
        maxScore: 10,
        summary: 'Stated a hypothesis up front and narrated each step against the code you were reading.',
      },
      {
        key: 'interviewer_dynamic',
        label: 'Interviewer Dynamic',
        score: 7,
        maxScore: 10,
        summary: 'Took follow-up questions well, though the concurrency follow-up needed a nudge before you engaged with it.',
      },
      {
        key: 'bug_fix_quality',
        label: 'Bug Fix Quality',
        score: 8,
        maxScore: 10,
        summary: 'Removed the silent retry and returned an error to the client; idempotency key handling was described but only partly implemented.',
      },
    ],
    nextSteps: [
      'Bring up idempotency keys as soon as you see money moving twice.',
      'Describe how you would test the fix under concurrent requests before you are asked.',
      'Separate the incident fix from follow-up hardening when you summarise your change.',
    ],
    sessionMeta: {
      durationSeconds: 1260,
      timeToFirstEditSeconds: 410,
      filesOpened: 4,
      utteranceCount: 18,
    },
    scenarioSummary: {
      title: scenario?.title || 'Checkout Bug',
      company: scenario?.company || 'E-commerce Platform',
      difficulty: scenario?.difficulty || 'medium',
      bugExplanation: scenario?.bugExplanation,
      fixSummary: scenario?.fixSummary,
    },
    dashboard: {
      heading: 'Duplicate charges stopped at the source',
      summary: 'The payment failure path no longer creates a second order, so a flaky payment provider can no longer double-charge customers.',
      deliveredFixes: [
        'Removed the retry that created a second order and re-ran payment inside the catch block.',
        'Returned an explicit error to the client when the payment call fails.',
        'Started idempotency key checking at the top of the order handler.',
      ],
      regressionNet: [
        'Simulate a payment timeout and assert exactly one order row exists.',
        'Send parallel requests with the same idempotency key and assert only one order is created.',
        'Assert the client receives an error status when payment fails.',
      ],
      preventedRisks: [
        { label: 'Bug Location', value: `${scenario?.bugLocation || 'routes/orders.js'}:${scenario?.bugLine || 28}`, tone: 'warning' },
        { label: 'Customer Impact', value: 'Double charges blocked', tone: 'success' },
        { label: 'Open Follow-up', value: 'Finish idempotency keys', tone: 'info' },
      ],
    },
  };
}
