import test from 'node:test';
import assert from 'node:assert/strict';
import { publicReason } from '../src/server/publicView';

const generic = 'Routed to m1 · Balanced workload';

test('publicReason fails closed when the reason is missing or not a string', () => {
  for (const reason of [undefined, null, 42]) {
    assert.equal(publicReason({ selectedModel: 'm1', reason } as never), generic);
  }
});

test('publicReason keeps a safe reason and hides any other', () => {
  assert.equal(publicReason({ selectedModel: 'm1', reason: 'Matched Custom Rule: x' }), 'Matched Custom Rule: x');
  assert.equal(publicReason({ selectedModel: 'm1', reason: 'entropy 0.4' }), generic);
});
