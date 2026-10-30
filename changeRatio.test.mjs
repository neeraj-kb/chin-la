import test from 'node:test';
import assert from 'node:assert/strict';
import { changeRatio } from './src/lib/changeRatio.mjs';

test('treats the first observed frame as a change', () => {
  assert.equal(changeRatio(null, new Uint8Array([1, 2, 3])), 1);
});

test('reports no change for matching screen fingerprints', () => {
  assert.equal(changeRatio(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])), 0);
});

test('ignores tiny luminance noise and counts meaningful pixel changes', () => {
  assert.equal(changeRatio(new Uint8Array([2, 7, 12, 14]), new Uint8Array([3, 10, 12, 17])), 0.5);
});

test('treats fingerprints of different dimensions as a full change', () => {
  assert.equal(changeRatio(new Uint8Array([1]), new Uint8Array([1, 2])), 1);
});
