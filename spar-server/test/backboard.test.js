const test = require('node:test');
const assert = require('node:assert/strict');
const { extractContent } = require('../lib/backboard');

test('extractContent reads nested Backboard response envelopes', () => {
  const nestedResponse = {
    data: {
      result: {
        message: {
          content: [
            { text: { value: 'First line' } },
            { text: 'Second line' },
          ],
        },
      },
    },
  };

  assert.equal(extractContent(nestedResponse), 'First line\nSecond line');
});

test('extractContent reads choice-style assistant responses', () => {
  const choiceResponse = {
    choices: [
      {
        message: {
          content: 'Candidate-facing answer',
        },
      },
    ],
  };

  assert.equal(extractContent(choiceResponse), 'Candidate-facing answer');
});
