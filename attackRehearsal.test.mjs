import assert from 'node:assert/strict';
import test from 'node:test';
import { drawRandomQuestions } from './src/lib/attackRehearsal.mjs';

const bank = Array.from({ length: 100 }, (_, index) => ({ id: `q${String(index + 1).padStart(3, '0')}` }));

test('a practice round contains five unique questions from the bank', () => {
  const round = drawRandomQuestions(bank, [], 5, () => 0.42);
  assert.equal(round.length, 5);
  assert.equal(new Set(round.map(({ id }) => id)).size, 5);
  assert.ok(round.every((question) => bank.some(({ id }) => id === question.id)));
});

test('the next round avoids every question from the immediately previous round', () => {
  const firstRound = drawRandomQuestions(bank, [], 5, () => 0.17);
  const nextRound = drawRandomQuestions(bank, firstRound.map(({ id }) => id), 5, () => 0.73);
  const previousIds = new Set(firstRound.map(({ id }) => id));
  assert.equal(nextRound.length, 5);
  assert.ok(nextRound.every(({ id }) => !previousIds.has(id)));
});
