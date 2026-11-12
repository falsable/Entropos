import { describe, it } from 'node:test';
import assert from 'node:assert';
import { measuredAggregate } from '../src/server/measuredAggregate';

describe('measuredAggregate', () => {
  it('returns null sum and zero counts for an empty list', () => {
    const result = measuredAggregate([]);
    assert.strictEqual(result.sum, null);
    assert.strictEqual(result.measuredCount, 0);
    assert.strictEqual(result.totalCount, 0);
  });

  it('returns null sum when every value is missing', () => {
    const result = measuredAggregate([null, undefined, NaN, Infinity, -Infinity]);
    assert.strictEqual(result.sum, null);
    assert.strictEqual(result.measuredCount, 0);
    assert.strictEqual(result.totalCount, 5);
  });

  it('skips missing values in a mixed list but still counts them in totalCount', () => {
    const result = measuredAggregate([1, null, 2, undefined, NaN, 3]);
    assert.strictEqual(result.sum, 6);
    assert.strictEqual(result.measuredCount, 3);
    assert.strictEqual(result.totalCount, 6);
  });

  it('treats 0 as a measured value', () => {
    const result = measuredAggregate([0, null, 5]);
    assert.strictEqual(result.sum, 5);
    assert.strictEqual(result.measuredCount, 2);
    assert.strictEqual(result.totalCount, 3);
  });
});
