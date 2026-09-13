import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { safeExecutionJson } from '../../src/server/agent-execution-safety.js';

const ITEMS_TRUNCATED = '[ITEMS TRUNCATED]';

function sanitizeArray(value: unknown[]): unknown[] {
  return JSON.parse(safeExecutionJson(value)) as unknown[];
}

describe('execution safety structured arrays', () => {
  it('preserves all items in order at the 200-item boundary', () => {
    const input = Array.from({ length: 200 }, (_, index) => index);

    assert.deepEqual(sanitizeArray(input), input);
  });

  it('prepends the marker and preserves indices 1 through 200 for 201 items', () => {
    const input = Array.from({ length: 201 }, (_, index) => index);
    const sanitized = sanitizeArray(input);

    assert.equal(sanitized.length, 201);
    assert.equal(sanitized[0], ITEMS_TRUNCATED);
    assert.deepEqual(sanitized.slice(1), input.slice(1));
    assert.notEqual(sanitized[sanitized.length - 1], ITEMS_TRUNCATED);
  });

  it('prepends the marker and preserves the ordered final 200 of 250 items', () => {
    const input = Array.from({ length: 250 }, (_, index) => index);
    const sanitized = sanitizeArray(input);

    assert.equal(sanitized[0], ITEMS_TRUNCATED);
    assert.deepEqual(sanitized.slice(1), input.slice(50));
    assert.equal(sanitized[1], 50);
    assert.equal(sanitized[200], 249);
  });

  it('applies the same tail-preserving marker placement to nested arrays', () => {
    const nested = Array.from({ length: 201 }, (_, index) => ({ index }));
    const sanitized = JSON.parse(safeExecutionJson({ nested })) as { nested: unknown[] };

    assert.equal(sanitized.nested.length, 201);
    assert.equal(sanitized.nested[0], ITEMS_TRUNCATED);
    assert.deepEqual(sanitized.nested[1], nested[1]);
    assert.deepEqual(sanitized.nested[200], nested[200]);
    assert.notDeepEqual(sanitized.nested[1], nested[0]);
  });
});
