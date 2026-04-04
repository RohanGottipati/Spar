const path = require('path');
const { pathToFileURL } = require('url');

const SCENARIOS_PATH = path.join(__dirname, '..', '..', 'spar-client', 'src', 'data', 'scenarios.js');

let scenariosPromise = null;

async function loadScenarios() {
  if (!scenariosPromise) {
    const moduleUrl = pathToFileURL(SCENARIOS_PATH).href;
    scenariosPromise = import(moduleUrl).then((mod) => {
      if (!Array.isArray(mod?.scenarios)) {
        throw new Error('Scenario module did not export a scenarios array');
      }

      return mod.scenarios;
    });
  }

  return scenariosPromise;
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
  getScenarioById,
  getVisibleFiles,
  loadScenarios,
};
