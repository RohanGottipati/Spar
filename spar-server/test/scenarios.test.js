const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getScenarioById,
  listClientScenarios,
  loadScenarios,
  validateScenarioCollection,
} = require('../lib/scenarios');

test('current scenario catalog is valid and every id resolves', async () => {
  const scenarios = await loadScenarios();

  assert.ok(Array.isArray(scenarios));
  assert.ok(scenarios.length > 0);

  for (const scenario of scenarios) {
    const resolved = await getScenarioById(scenario.id);
    assert.equal(resolved?.id, scenario.id);
  }
});

test('client scenario catalog contains only launchable client-safe data', async () => {
  const scenarios = await loadScenarios();
  const clientScenarios = await listClientScenarios();

  assert.equal(clientScenarios.length, scenarios.length);

  for (const clientScenario of clientScenarios) {
    assert.ok(typeof clientScenario.id === 'string' && clientScenario.id.length > 0);
    assert.ok(clientScenario.files && typeof clientScenario.files === 'object');
    assert.equal('bugExplanation' in clientScenario, false);
    assert.equal('fixSummary' in clientScenario, false);

    const fileNames = Object.keys(clientScenario.files);
    assert.ok(fileNames.length > 0);
    assert.equal(fileNames.some((filename) => filename.includes('.fixed.')), false);
  }
});

test('validateScenarioCollection rejects duplicate or malformed scenarios', () => {
  assert.throws(() => {
    validateScenarioCollection([
      {
        id: 'duplicate-orders',
        title: 'One',
        company: 'Acme',
        description: 'Broken flow',
        difficulty: 'easy',
        timeLimit: 300,
        files: {
          'routes/a.js': 'module.exports = {};',
          'routes/a.fixed.js': 'module.exports = {};',
        },
        bugLocation: 'routes/a.js',
        bugLine: 1,
        bugExplanation: 'Bug',
        fixSummary: 'Fix',
      },
      {
        id: 'duplicate-orders',
        title: 'Two',
        company: 'Acme',
        description: 'Still broken',
        difficulty: 'easy',
        timeLimit: 300,
        files: {
          'routes/b.js': 'module.exports = {};',
          'routes/b.fixed.js': 'module.exports = {};',
        },
        bugLocation: 'routes/b.js',
        bugLine: 1,
        bugExplanation: 'Bug',
        fixSummary: 'Fix',
      },
    ]);
  }, /Duplicate scenario id/);

  assert.throws(() => {
    validateScenarioCollection([
      {
        id: 'missing-files',
        title: 'Missing files',
        company: 'Acme',
        description: 'Broken',
        difficulty: 'easy',
        timeLimit: 300,
        files: {},
        bugLocation: 'routes/a.js',
        bugLine: 1,
        bugExplanation: 'Bug',
        fixSummary: 'Fix',
      },
    ]);
  }, /at least one visible file/);
});
