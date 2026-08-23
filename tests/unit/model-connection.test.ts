import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { testConnection } from '../../src/services/model-connection.js';

type FetchMock = (input: unknown, init?: RequestInit) => Promise<unknown>;

const originalFetch = global.fetch;

await describe('testConnection service', () => {
  beforeEach(() => {
    (globalThis as unknown as Record<string, unknown>).fetch = originalFetch;
  });

  afterEach(() => {
    (globalThis as unknown as Record<string, unknown>).fetch = originalFetch;
  });

  it('should return connected=true with model IDs on success', async () => {
    const mockFetch: FetchMock = async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: 'model-a', object: 'model', owned_by: 'owner1' },
          { id: 'model-b', object: 'model', owned_by: 'owner2' },
        ],
      }),
    });
    (globalThis as unknown as Record<string, unknown>).fetch = mockFetch;

    const result = await testConnection('http://localhost:1234', undefined, 1);

    assert.strictEqual(result.connected, true);
    assert.deepStrictEqual(result.models, ['model-a', 'model-b']);
    assert.strictEqual(result.error, undefined);
  });

  it('should handle trailing slash in base URL', async () => {
    let capturedUrl = '';

    const mockFetch: FetchMock = async (input) => {
      if (input instanceof URL) {
        capturedUrl = input.href;
      } else if (typeof input === 'string') {
        capturedUrl = input;
      }
      return {
        ok: true,
        json: async () => ({
          data: [{ id: 'slash-model', object: 'model', owned_by: 'test' }],
        }),
      };
    };
    (globalThis as unknown as Record<string, unknown>).fetch = mockFetch;

    await testConnection('http://localhost:1234/', undefined, 1);

    assert.strictEqual(capturedUrl, 'http://localhost:1234/v1/models');
  });

  it('should handle multiple trailing slashes', async () => {
    let capturedUrl = '';

    const mockFetch: FetchMock = async (input) => {
      if (input instanceof URL) {
        capturedUrl = input.href;
      } else if (typeof input === 'string') {
        capturedUrl = input;
      }
      return {
        ok: true,
        json: async () => ({
          data: [{ id: 'multi-slash', object: 'model', owned_by: 'test' }],
        }),
      };
    };
    (globalThis as unknown as Record<string, unknown>).fetch = mockFetch;

    await testConnection('http://localhost:1234///', undefined, 1);

    assert.strictEqual(capturedUrl, 'http://localhost:1234/v1/models');
  });

  it('should return connected=false for invalid base URL', async () => {
    const result = await testConnection('not-a-valid-url', undefined, 1);

    assert.strictEqual(result.connected, false);
    assert.deepStrictEqual(result.models, []);
    assert.strictEqual(result.error, 'Invalid base URL');
  });

  it('should return connected=false for connection failure', async () => {
    const mockFetch: FetchMock = async () => {
      throw new Error('network error');
    };
    (globalThis as unknown as Record<string, unknown>).fetch = mockFetch;

    const result = await testConnection('http://localhost:1234', undefined, 1);

    assert.strictEqual(result.connected, false);
    assert.deepStrictEqual(result.models, []);
    assert.ok(result.error);
    assert.notStrictEqual(result.error, 'network error');
  });

  it('should return connected=false on non-ok response', async () => {
    const mockFetch: FetchMock = async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' }),
    });
    (globalThis as unknown as Record<string, unknown>).fetch = mockFetch;

    const result = await testConnection('http://localhost:1234', undefined, 1);

    assert.strictEqual(result.connected, false);
    assert.strictEqual(result.error, 'Connection failed with status 500');
  });

  it('should include Authorization header when API key is provided', async () => {
    let capturedHeaders: Record<string, string> = {};

    const mockFetch: FetchMock = async (_input, init) => {
      if (init && init.headers) {
        capturedHeaders = init.headers as Record<string, string>;
      }
      return {
        ok: true,
        json: async () => ({
          data: [{ id: 'auth-model', object: 'model', owned_by: 'test' }],
        }),
      };
    };
    (globalThis as unknown as Record<string, unknown>).fetch = mockFetch;

    const result = await testConnection('http://localhost:1234', 'secret-key-123', 1);

    assert.strictEqual(result.connected, true);
    assert.strictEqual(capturedHeaders['Authorization'], 'Bearer secret-key-123');
  });

  it('should not include Authorization header when API key is empty', async () => {
    let capturedHeaders: Record<string, string> = {};

    const mockFetch: FetchMock = async (_input, init) => {
      if (init && init.headers) {
        capturedHeaders = init.headers as Record<string, string>;
      }
      return {
        ok: true,
        json: async () => ({
          data: [{ id: 'no-auth-model', object: 'model', owned_by: 'test' }],
        }),
      };
    };
    (globalThis as unknown as Record<string, unknown>).fetch = mockFetch;

    const result = await testConnection('http://localhost:1234', '', 1);

    assert.strictEqual(result.connected, true);
    assert.strictEqual(capturedHeaders['Authorization'], undefined);
  });

  it('should not include Authorization header when API key is whitespace', async () => {
    let capturedHeaders: Record<string, string> = {};

    const mockFetch: FetchMock = async (_input, init) => {
      if (init && init.headers) {
        capturedHeaders = init.headers as Record<string, string>;
      }
      return {
        ok: true,
        json: async () => ({
          data: [{ id: 'ws-model', object: 'model', owned_by: 'test' }],
        }),
      };
    };
    (globalThis as unknown as Record<string, unknown>).fetch = mockFetch;

    const result = await testConnection('http://localhost:1234', '   ', 1);

    assert.strictEqual(result.connected, true);
    assert.strictEqual(capturedHeaders['Authorization'], undefined);
  });

  it('should return empty models array when no models available', async () => {
    const mockFetch: FetchMock = async () => ({
      ok: true,
      json: async () => ({ data: [] }),
    });
    (globalThis as unknown as Record<string, unknown>).fetch = mockFetch;

    const result = await testConnection('http://localhost:1234', undefined, 1);

    assert.strictEqual(result.connected, true);
    assert.deepStrictEqual(result.models, []);
  });

  it('should filter out invalid model entries', async () => {
    const mockFetch: FetchMock = async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: 'valid-model', object: 'model', owned_by: 'test' },
          null,
          { object: 'model', owned_by: 'test' },
          { id: 123, object: 'model', owned_by: 'test' },
          { id: 'another-valid', object: 'model', owned_by: 'test' },
        ],
      }),
    });
    (globalThis as unknown as Record<string, unknown>).fetch = mockFetch;

    const result = await testConnection('http://localhost:1234', undefined, 1);

    assert.strictEqual(result.connected, true);
    assert.deepStrictEqual(result.models, ['valid-model', 'another-valid']);
  });

  it('should handle non-array data response', async () => {
    const mockFetch: FetchMock = async () => ({
      ok: true,
      json: async () => ({ data: 'not-an-array' }),
    });
    (globalThis as unknown as Record<string, unknown>).fetch = mockFetch;

    const result = await testConnection('http://localhost:1234', undefined, 1);

    assert.strictEqual(result.connected, true);
    assert.deepStrictEqual(result.models, []);
  });

  it('should use AbortController for timeout', async () => {
    let capturedSignal: AbortSignal | null | undefined;

    const mockFetch: FetchMock = async (_input, init) => {
      if (init) {
        capturedSignal = init.signal;
      }
      return {
        ok: true,
        json: async () => ({ data: [] }),
      };
    };
    (globalThis as unknown as Record<string, unknown>).fetch = mockFetch;

    await testConnection('http://localhost:1234', undefined, 5);

    assert.ok(capturedSignal instanceof AbortSignal);
  });
});
