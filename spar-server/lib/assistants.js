const { createAssistant, listAssistants } = require('./backboard');

const ASSISTANT_SPECS = {
  liveInterviewer: {
    name: 'spar-live-interviewer-v1',
    systemPrompt: [
      'You are Alex, a senior engineer running a live debugging interview inside Spar.',
      'The thread may contain a seeded session-context message with scenario details and code files.',
      'Your job is to pressure-test the candidate while they think out loud and edit code.',
      'Rules:',
      '- Ask one short follow-up question or challenge per reply.',
      '- Maximum 2 sentences and 35 words.',
      '- Do not reveal the bug, the fix, or the hidden answer key.',
      '- Push on evidence, tradeoffs, edge cases, and debugging discipline.',
      '- If the candidate is heading the right direction, go deeper instead of praising them.',
      '- Sound human, concise, and slightly demanding. No bullet lists.',
    ].join('\n'),
  },
  codeBehavior: {
    name: 'spar-report-code-behavior-v1',
    systemPrompt: [
      'You evaluate a candidate debugging session for code-reading and debugging behavior.',
      'Return strict JSON only.',
      'Schema:',
      '{"key":"code_behavior","label":"Code Behavior","score":0,"maxScore":10,"summary":"","strengths":[],"concerns":[],"evidence":[]}',
      'Score from 0 to 10.',
      'Use candidate-facing but direct language.',
    ].join('\n'),
  },
  communicationQuality: {
    name: 'spar-report-communication-v1',
    systemPrompt: [
      'You evaluate how clearly the candidate communicated while debugging.',
      'Return strict JSON only.',
      'Schema:',
      '{"key":"communication_quality","label":"Communication Quality","score":0,"maxScore":10,"summary":"","strengths":[],"concerns":[],"evidence":[]}',
      'Score from 0 to 10.',
      'Use candidate-facing but direct language.',
    ].join('\n'),
  },
  interviewerDynamic: {
    name: 'spar-report-interviewer-dynamic-v1',
    systemPrompt: [
      'You evaluate the interaction quality between the candidate and interviewer.',
      'Return strict JSON only.',
      'Schema:',
      '{"key":"interviewer_dynamic","label":"Interviewer Dynamic","score":0,"maxScore":10,"summary":"","strengths":[],"concerns":[],"evidence":[]}',
      'Score from 0 to 10.',
      'Use candidate-facing but direct language.',
    ].join('\n'),
  },
  bugFixQuality: {
    name: 'spar-report-bug-fix-quality-v1',
    systemPrompt: [
      'You evaluate the final bug fix quality against the scenario answer key.',
      'Return strict JSON only.',
      'Schema:',
      '{"key":"bug_fix_quality","label":"Bug Fix Quality","score":0,"maxScore":10,"summary":"","strengths":[],"concerns":[],"evidence":[]}',
      'Score from 0 to 10.',
      'Use candidate-facing but direct language.',
    ].join('\n'),
  },
  synthesizer: {
    name: 'spar-report-synthesizer-v1',
    systemPrompt: [
      'You synthesize Spar interview analyzer outputs into the final candidate-facing report.',
      'Return strict JSON only and do not wrap it in markdown.',
      'Required schema:',
      '{"dimensions":[{"key":"","label":"","score":0,"maxScore":10,"summary":""}],"verdict":"","verdictSummary":"","nextSteps":["","",""],"sessionMeta":{"durationSeconds":0,"timeToFirstEditSeconds":null,"filesOpened":0,"utteranceCount":0}}',
      'Verdict must be one of: Strong Hire, Hire, Leaning Hire, Leaning No Hire, No Hire.',
      'Exactly four visible dimensions are allowed in the final report.',
    ].join('\n'),
  },
};

let assistantCache = null;
let assistantCachePromise = null;

function hasAllAssistantIds(value) {
  if (!value) {
    return false;
  }

  return Object.keys(ASSISTANT_SPECS).every((key) => typeof value[key] === 'string' && value[key].length > 0);
}

async function ensureAssistants() {
  if (hasAllAssistantIds(assistantCache)) {
    return assistantCache;
  }

  if (assistantCachePromise) {
    return assistantCachePromise;
  }

  assistantCachePromise = (async () => {
    let existingAssistants = [];

    try {
      existingAssistants = await listAssistants();
    } catch (err) {
      console.warn('Failed to list Backboard assistants, creating missing assistants directly:', err.message);
    }

    const nextCache = {};

    for (const [key, spec] of Object.entries(ASSISTANT_SPECS)) {
      const existing = existingAssistants.find((assistant) => assistant?.name === spec.name && typeof assistant?.assistant_id === 'string');

      if (existing) {
        nextCache[key] = existing.assistant_id;
        continue;
      }

      const created = await createAssistant({
        name: spec.name,
        system_prompt: spec.systemPrompt,
      });

      nextCache[key] = created.assistant_id;
    }

    assistantCache = nextCache;
    return nextCache;
  })();

  try {
    return await assistantCachePromise;
  } finally {
    if (!hasAllAssistantIds(assistantCache)) {
      assistantCachePromise = null;
    }
  }
}

function getAssistantSpecs() {
  return ASSISTANT_SPECS;
}

module.exports = {
  ensureAssistants,
  getAssistantSpecs,
};
