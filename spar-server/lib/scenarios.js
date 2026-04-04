const fs = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');

const SCENARIOS_PATH = path.join(__dirname, '..', '..', 'spar-client', 'src', 'data', 'scenarios.js');

let scenariosCache = {
  promise: null,
  revision: null,
};

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function getVisibleFilesMap(scenario) {
  return Object.fromEntries(
    getVisibleFiles(scenario).map(({ path: filePath, content }) => [filePath, content])
  );
}

function validateScenario(scenario, index) {
  if (!scenario || typeof scenario !== 'object') {
    throw new Error(`Scenario at index ${index} must be an object`);
  }

  const requiredStrings = ['id', 'title', 'company', 'description', 'difficulty', 'bugLocation', 'bugExplanation', 'fixSummary'];
  requiredStrings.forEach((key) => {
    if (!isNonEmptyString(scenario[key])) {
      throw new Error(`Scenario "${scenario.id || `#${index}`}" is missing ${key}`);
    }
  });

  if (scenario.id !== scenario.id.trim()) {
    throw new Error(`Scenario "${scenario.id}" must not contain leading or trailing whitespace`);
  }

  if (!Number.isFinite(scenario.timeLimit) || scenario.timeLimit <= 0) {
    throw new Error(`Scenario "${scenario.id}" must define a positive timeLimit`);
  }

  if (!Number.isInteger(scenario.bugLine) || scenario.bugLine <= 0) {
    throw new Error(`Scenario "${scenario.id}" must define a positive integer bugLine`);
  }

  if (!scenario.files || typeof scenario.files !== 'object' || Array.isArray(scenario.files)) {
    throw new Error(`Scenario "${scenario.id}" must define a files map`);
  }

  if (!getVisibleFiles(scenario).length) {
    throw new Error(`Scenario "${scenario.id}" must include at least one visible file`);
  }

  if (!getAnswerKeyFiles(scenario).length) {
    throw new Error(`Scenario "${scenario.id}" must include at least one answer key file`);
  }
}

function validateScenarioCollection(scenarios) {
  if (!Array.isArray(scenarios)) {
    throw new Error('Scenario module did not export a scenarios array');
  }

  const seenIds = new Set();
  scenarios.forEach((scenario, index) => {
    validateScenario(scenario, index);
    if (seenIds.has(scenario.id)) {
      throw new Error(`Duplicate scenario id "${scenario.id}"`);
    }
    seenIds.add(scenario.id);
  });

  return scenarios;
}

async function getScenarioRevision() {
  const stats = await fs.stat(SCENARIOS_PATH);
  return `${stats.mtimeMs}:${stats.size}`;
}

function shouldReuseScenarioCache() {
  return process.env.NODE_ENV === 'production' && scenariosCache.promise;
}

async function loadScenarios() {
  if (shouldReuseScenarioCache()) {
    return scenariosCache.promise;
  }

  const revision = await getScenarioRevision();
  if (scenariosCache.promise && scenariosCache.revision === revision) {
    return scenariosCache.promise;
  }

  const moduleUrl = `${pathToFileURL(SCENARIOS_PATH).href}?v=${encodeURIComponent(revision)}`;
  scenariosCache = {
    revision,
    promise: import(moduleUrl)
      .then((mod) => validateScenarioCollection(mod?.scenarios))
      .catch((err) => {
        if (scenariosCache.revision === revision) {
          scenariosCache = {
            promise: null,
            revision: null,
          };
        }
        throw err;
      }),
  };

  return scenariosCache.promise;
}

async function getScenarioById(id) {
  const scenarios = await loadScenarios();
  return scenarios.find((scenario) => scenario.id === id) || null;
}

function isAnswerKeyFile(filename) {
  return filename.includes('.fixed.');
}

function getVisibleFiles(scenario) {
  return Object.entries(scenario.files || {})
    .filter(([filename]) => !isAnswerKeyFile(filename))
    .map(([pathName, content]) => ({ path: pathName, content }));
}

function getAnswerKeyFiles(scenario) {
  return Object.entries(scenario.files || {})
    .filter(([filename]) => isAnswerKeyFile(filename))
    .map(([pathName, content]) => ({ path: pathName, content }));
}

function buildLiveScenarioContext(scenario) {
  return {
    scenarioId: scenario.id,
    title: scenario.title,
    company: scenario.company,
    difficulty: scenario.difficulty,
    description: scenario.description,
    timeLimitSeconds: scenario.timeLimit,
    visibleFiles: getVisibleFiles(scenario),
  };
}

function buildClientScenario(scenario) {
  return {
    id: scenario.id,
    title: scenario.title,
    company: scenario.company,
    description: scenario.description,
    difficulty: scenario.difficulty,
    timeLimit: scenario.timeLimit,
    files: getVisibleFilesMap(scenario),
  };
}

async function listClientScenarios() {
  const scenarios = await loadScenarios();
  return scenarios.map(buildClientScenario);
}

function buildScenarioAnswerKey(scenario) {
  return {
    bugLocation: scenario.bugLocation || null,
    bugLine: scenario.bugLine || null,
    bugExplanation: scenario.bugExplanation || '',
    fixSummary: scenario.fixSummary || '',
    fixedFiles: getAnswerKeyFiles(scenario),
  };
}

module.exports = {
  buildLiveScenarioContext,
  buildScenarioAnswerKey,
  buildClientScenario,
  getScenarioById,
  getVisibleFiles,
  listClientScenarios,
  loadScenarios,
  validateScenarioCollection,
};
