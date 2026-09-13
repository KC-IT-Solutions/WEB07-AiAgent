import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function formatTokenCount(totalTokens: number): string {
  if (totalTokens < 1000) return String(totalTokens);
  if (totalTokens < 1_000_000) return `${(totalTokens / 1_000).toFixed(1)}k`;
  return `${(totalTokens / 1_000_000).toFixed(1)}m`;
}

describe('formatTokenCount', () => {
  it('renders small values as integers', () => {
    assert.equal(formatTokenCount(704), '704');
    assert.equal(formatTokenCount(999), '999');
    assert.equal(formatTokenCount(0), '0');
  });

  it('renders thousands with one decimal and k suffix', () => {
    assert.equal(formatTokenCount(1_000), '1.0k');
    assert.equal(formatTokenCount(2_347), '2.3k');
    assert.equal(formatTokenCount(5_800), '5.8k');
    assert.equal(formatTokenCount(999_999), '1000.0k');
  });

  it('renders millions with one decimal and m suffix', () => {
    assert.equal(formatTokenCount(1_000_000), '1.0m');
    assert.equal(formatTokenCount(1_234_567), '1.2m');
    assert.equal(formatTokenCount(9_876_543), '9.9m');
  });

  it('renders exact boundary values correctly', () => {
    assert.equal(formatTokenCount(91_234), '91.2k');
    assert.equal(formatTokenCount(14_700), '14.7k');
  });
});
