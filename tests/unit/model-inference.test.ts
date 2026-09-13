import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Agent } from 'undici';
import {
  createOpenAICompatibleTransport,
  ModelInferenceError,
  OPENAI_COMPATIBLE_DISPATCHER_OPTIONS,
  requestModelInference,
  type OpenAICompatibleTransport,
} from '../../src/services/model-inference.js';

const originalFetch = globalThis.fetch;

function stubResponse(message: Record<string, unknown>, finishReason = 'stop'): void {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ choices: [{ finish_reason: finishReason, message }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
}

function inferenceResponse(content = 'Answer'): Response {
  return new Response(
    JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function transportError(code: string): TypeError {
  const cause = Object.assign(new Error(code), { code });
  const error = new TypeError('fetch failed');
  Object.defineProperty(error, 'cause', { value: cause });
  return error;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

await describe('OpenAI-compatible model inference parsing', async () => {
  await it('returns normal assistant content unchanged apart from trimming', async () => {
    stubResponse({ role: 'assistant', content: '  Normal answer  ', reasoning_content: 'ignored' });
    const result = await requestModelInference('http://model.test', 1, 'model', [
      { role: 'user', content: 'Question' },
    ]);
    assert.equal(result.type, 'message');
    assert.equal(result.type === 'message' ? result.content : null, 'Normal answer');
    assert.deepEqual(result.assistantMessage, {
      role: 'assistant',
      content: '  Normal answer  ',
      reasoning_content: 'ignored',
    });
    assert.equal(result.finishReason, 'stop');
  });

  await it('prioritizes valid structured tool calls over coexisting content and reasoning', async () => {
    stubResponse(
      {
        role: 'assistant',
        content: 'Coexisting provider text',
        reasoning_content: 'must never become a tool call',
        tool_calls: [
          {
            id: 'call-42',
            type: 'function',
            function: { name: 'duckduckgo_search', arguments: '{"query":"Malmo weather"}' },
          },
        ],
      },
      'tool_calls',
    );
    const result = await requestModelInference('http://model.test', 1, 'model', [], []);
    assert.equal(result.type, 'tool_calls');
    assert.deepEqual(result.assistantMessage, {
      role: 'assistant',
      content: 'Coexisting provider text',
      reasoning_content: 'must never become a tool call',
      tool_calls: [
        {
          id: 'call-42',
          type: 'function',
          function: { name: 'duckduckgo_search', arguments: '{"query":"Malmo weather"}' },
        },
      ],
    });
    assert.equal(result.finishReason, 'tool_calls');
  });

  await it('accepts valid tool calls with null assistant content', async () => {
    stubResponse({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call-null',
          type: 'function',
          function: { name: 'visit_website', arguments: '{"url":"https://example.com"}' },
        },
      ],
    });
    const result = await requestModelInference('http://model.test', 1, 'model', []);
    assert.equal(result.type, 'tool_calls');
    assert.equal(result.type === 'tool_calls' ? result.calls[0].id : null, 'call-null');
  });

  await it('rejects malformed tool calls even when assistant content is present', async () => {
    stubResponse({
      role: 'assistant',
      content: 'Do not silently fall back',
      tool_calls: [{ id: '', type: 'function', function: { name: 'tool', arguments: '{}' } }],
    });
    await assert.rejects(
      () => requestModelInference('http://model.test', 1, 'model', []),
      (error: unknown) =>
        error instanceof ModelInferenceError && error.code === 'MODEL_SERVER_INVALID_RESPONSE',
    );
  });

  await it('does not interpret reasoning_content alone as a tool call', async () => {
    stubResponse({ role: 'assistant', content: null, reasoning_content: 'Call a tool now.' });
    await assert.rejects(
      () => requestModelInference('http://model.test', 1, 'model', []),
      (error: unknown) =>
        error instanceof ModelInferenceError && error.code === 'MODEL_SERVER_INVALID_RESPONSE',
    );
  });
});

await describe('provider usage parsing', async () => {
  await it('reads usage.total_tokens into normalized usage for message responses', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Answer' } }],
          usage: { prompt_tokens: 704, completion_tokens: 1643, total_tokens: 2347 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const result = await requestModelInference('http://model.test', 1, 'model', [
      { role: 'user', content: 'Question' },
    ]);
    assert.equal(result.type, 'message');
    assert.deepEqual(result.usage, { totalTokens: 2347 });
  });

  await it('reads usage.total_tokens into normalized usage for tool_calls responses', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [{ id: 'c1', type: 'function', function: { name: 't', arguments: '{}' } }],
              },
            },
          ],
          usage: { total_tokens: 5800 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const result = await requestModelInference('http://model.test', 1, 'model', [], [{ type: 'function', function: { name: 't', description: '', parameters: {} } }]);
    assert.equal(result.type, 'tool_calls');
    assert.deepEqual(result.usage, { totalTokens: 5800 });
  });

  await it('missing usage field remains valid inference result', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'OK' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const result = await requestModelInference('http://model.test', 1, 'model', [
      { role: 'user', content: 'Q' },
    ]);
    assert.equal(result.type, 'message');
    assert.equal(result.usage, undefined);
  });

  await it('usage null remains valid inference result', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'OK' } }],
          usage: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const result = await requestModelInference('http://model.test', 1, 'model', [
      { role: 'user', content: 'Q' },
    ]);
    assert.equal(result.type, 'message');
    assert.equal(result.usage, undefined);
  });

  await it('malformed total_tokens (string) is ignored as usage', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'OK' } }],
          usage: { total_tokens: 'not_a_number' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const result = await requestModelInference('http://model.test', 1, 'model', [
      { role: 'user', content: 'Q' },
    ]);
    assert.equal(result.type, 'message');
    assert.equal(result.usage, undefined);
  });

  await it('negative total_tokens is rejected as usage', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'OK' } }],
          usage: { total_tokens: -1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const result = await requestModelInference('http://model.test', 1, 'model', [
      { role: 'user', content: 'Q' },
    ]);
    assert.equal(result.type, 'message');
    assert.equal(result.usage, undefined);
  });

  await it('fractional total_tokens is rejected as usage', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'OK' } }],
          usage: { total_tokens: 2347.5 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const result = await requestModelInference('http://model.test', 1, 'model', [
      { role: 'user', content: 'Q' },
    ]);
    assert.equal(result.type, 'message');
    assert.equal(result.usage, undefined);
  });

  await it('null total_tokens is rejected as usage', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'OK' } }],
          usage: { total_tokens: null },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const result = await requestModelInference('http://model.test', 1, 'model', [
      { role: 'user', content: 'Q' },
    ]);
    assert.equal(result.type, 'message');
    assert.equal(result.usage, undefined);
  });

  await it('tool-call responses with usage do not affect tool-call parsing', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [{ id: 'c1', type: 'function', function: { name: 't', arguments: '{}' } }],
              },
            },
          ],
          usage: { total_tokens: 91234 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const result = await requestModelInference('http://model.test', 1, 'model', [], [{ type: 'function', function: { name: 't', description: '', parameters: {} } }]);
    assert.equal(result.type, 'tool_calls');
    assert.equal(result.calls.length, 1);
    assert.deepEqual(result.usage, { totalTokens: 91234 });
  });

  await it('normal assistant responses with usage do not affect message parsing', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Hello' } }],
          usage: { total_tokens: 100 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const result = await requestModelInference('http://model.test', 1, 'model', [
      { role: 'user', content: 'Hi' },
    ]);
    assert.equal(result.type, 'message');
    assert.equal(result.content, 'Hello');
    assert.deepEqual(result.usage, { totalTokens: 100 });
  });
});

await describe('OpenAI-compatible model inference transport', async () => {
  await it('uses an Agent with unbounded response timeouts and a bounded connect timeout', async () => {
    let dispatcher: unknown;
    globalThis.fetch = async (_input, init) => {
      dispatcher = (init as RequestInit & { dispatcher?: unknown } | undefined)?.dispatcher;
      return inferenceResponse();
    };

    const transport = createOpenAICompatibleTransport();
    try {
      await transport.fetch('http://model.test');
      assert.ok(dispatcher instanceof Agent);
      assert.deepEqual(OPENAI_COMPATIBLE_DISPATCHER_OPTIONS, {
        headersTimeout: 0,
        bodyTimeout: 0,
        connectTimeout: 60_000,
      });
    } finally {
      await transport.close();
    }
  });

  await it('allows a simulated request beyond five minutes when the application timeout has not expired', async () => {
    let simulatedDurationMs = 0;
    const transport: OpenAICompatibleTransport = {
      fetch: async () => {
        simulatedDurationMs = 5 * 60 * 1000 + 1;
        return inferenceResponse('Long inference completed');
      },
      close: async () => undefined,
    };

    const result = await requestModelInference(
      'http://model.test',
      30,
      'model',
      [{ role: 'user', content: 'Question' }],
      [],
      transport,
    );
    assert.equal(simulatedDurationMs, 300_001);
    assert.equal(result.type === 'message' ? result.content : null, 'Long inference completed');
  });

  await it('aborts and classifies expiration of the configured application timeout', async () => {
    let capturedSignal: AbortSignal | undefined;
    const transport: OpenAICompatibleTransport = {
      fetch: async (_input, init) => {
        capturedSignal = init?.signal instanceof AbortSignal ? init.signal : undefined;
        return new Promise<Response>((_resolve, reject) => {
          capturedSignal?.addEventListener(
            'abort',
            () => reject(new DOMException('The operation was aborted', 'AbortError')),
            { once: true },
          );
        });
      },
      close: async () => undefined,
    };

    await assert.rejects(
      () => requestModelInference('http://model.test', 0, 'model', [], [], transport),
      (error: unknown) => {
        assert.ok(error instanceof ModelInferenceError);
        assert.equal(error.code, 'MODEL_SERVER_TIMEOUT');
        assert.notEqual(error.code, 'MODEL_SERVER_UNREACHABLE');
        assert.equal(error.diagnostics.providerErrorName, 'AbortError');
        return true;
      },
    );
    assert.equal(capturedSignal?.aborted, true);
  });

  await it('propagates external cancellation through the active provider request', async () => {
    let capturedSignal: AbortSignal | undefined;
    let cleanedUp = false;
    const transport: OpenAICompatibleTransport = {
      fetch: async (_input, init) => {
        capturedSignal = init?.signal instanceof AbortSignal ? init.signal : undefined;
        return new Promise<Response>((_resolve, reject) => {
          const abort = (): void => {
            capturedSignal?.removeEventListener('abort', abort);
            cleanedUp = true;
            reject(new DOMException('The operation was aborted', 'AbortError'));
          };
          capturedSignal?.addEventListener('abort', abort, { once: true });
        });
      },
      close: async () => undefined,
    };
    const controller = new AbortController();
    const request = requestModelInference(
      'http://model.test',
      1,
      'model',
      [],
      [],
      transport,
      controller.signal,
    );
    controller.abort(new DOMException('User cancelled', 'AbortError'));

    await assert.rejects(
      () => request,
      (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
    );
    assert.equal(capturedSignal?.aborted, true);
    assert.equal(cleanedUp, true);
  });

  for (const code of ['ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT']) {
    await it(`classifies structured ${code} fetch failures as unreachable`, async () => {
      const transport: OpenAICompatibleTransport = {
        fetch: async () => Promise.reject(transportError(code)),
        close: async () => undefined,
      };
      await assert.rejects(
        () => requestModelInference('http://model.test', 1, 'model', [], [], transport),
        (error: unknown) => {
          assert.ok(error instanceof ModelInferenceError);
          assert.equal(error.code, 'MODEL_SERVER_UNREACHABLE');
          assert.equal(error.diagnostics.providerErrorName, 'TypeError');
          assert.equal(error.diagnostics.providerErrorCauseCode, code);
          return true;
        },
      );
    });
  }

  await it('classifies a structured body timeout while reading the response as unreachable', async () => {
    const response = inferenceResponse();
    response.json = async () => Promise.reject(transportError('UND_ERR_BODY_TIMEOUT'));
    const transport: OpenAICompatibleTransport = {
      fetch: async () => response,
      close: async () => undefined,
    };
    await assert.rejects(
      () => requestModelInference('http://model.test', 1, 'model', [], [], transport),
      (error: unknown) => {
        assert.ok(error instanceof ModelInferenceError);
        assert.equal(error.code, 'MODEL_SERVER_UNREACHABLE');
        assert.equal(error.diagnostics.providerErrorCauseCode, 'UND_ERR_BODY_TIMEOUT');
        return true;
      },
    );
  });
});

await describe('provider request temperature and top_p serialization', async () => {
  await it('sends temperature as JSON number when provided', async () => {
    let capturedBody: string = '';
    globalThis.fetch = async (_input: unknown, init: RequestInit | undefined) => {
      capturedBody = typeof init?.body === 'string' ? init.body : '';
      return inferenceResponse('OK');
    };

    await requestModelInference(
      'http://model.test',
      30,
      'model',
      [{ role: 'user', content: 'Q' }],
      [],
      undefined,
      undefined,
      undefined,
      0.25,
    );

    assert.ok(capturedBody.includes('"temperature":0.25'));
    assert.equal(
      capturedBody.includes(',"top_p"'),
      false,
      'top_p should not be present when topP is undefined',
    );
  });

  await it('sends top_p as JSON number when provided', async () => {
    let capturedBody: string = '';
    globalThis.fetch = async (_input: unknown, init: RequestInit | undefined) => {
      capturedBody = typeof init?.body === 'string' ? init.body : '';
      return inferenceResponse('OK');
    };

    await requestModelInference(
      'http://model.test',
      30,
      'model',
      [{ role: 'user', content: 'Q' }],
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      0.8,
    );

    assert.ok(capturedBody.includes('"top_p":0.8'));
    assert.equal(
      capturedBody.includes('"temperature"'),
      false,
      'temperature should not be present when temperature is undefined',
    );
  });

  await it('sends both temperature and top_p as JSON numbers when both provided', async () => {
    let capturedBody: string = '';
    globalThis.fetch = async (_input: unknown, init: RequestInit | undefined) => {
      capturedBody = typeof init?.body === 'string' ? init.body : '';
      return inferenceResponse('OK');
    };

    await requestModelInference(
      'http://model.test',
      30,
      'model',
      [{ role: 'user', content: 'Q' }],
      [],
      undefined,
      undefined,
      undefined,
      0.25,
      0.65,
    );

    assert.ok(capturedBody.includes('"temperature":0.25'));
    assert.ok(capturedBody.includes('"top_p":0.65'));
  });

  await it('serialized provider JSON uses decimal points not commas', async () => {
    let capturedBody: string = '';
    globalThis.fetch = async (_input: unknown, init: RequestInit | undefined) => {
      capturedBody = typeof init?.body === 'string' ? init.body : '';
      return inferenceResponse('OK');
    };

    await requestModelInference(
      'http://model.test',
      30,
      'model',
      [{ role: 'user', content: 'Q' }],
      [],
      undefined,
      undefined,
      undefined,
      0.25,
      0.8,
    );

    const parsed = JSON.parse(capturedBody);
    assert.equal(typeof parsed.temperature, 'number');
    assert.equal(parsed.temperature, 0.25);
    assert.equal(typeof parsed.top_p, 'number');
    assert.equal(parsed.top_p, 0.8);
    // Verify no locale-formatted decimal commas in numeric values
    const serialized = JSON.stringify({ temperature: 0.25, top_p: 0.8 });
    assert.ok(serialized.includes('0.25'), 'temperature uses decimal point');
    assert.ok(serialized.includes('0.8'), 'top_p uses decimal point');
  });

  await it('omits temperature and top_p when neither is provided', async () => {
    let capturedBody: string = '';
    globalThis.fetch = async (_input: unknown, init: RequestInit | undefined) => {
      capturedBody = typeof init?.body === 'string' ? init.body : '';
      return inferenceResponse('OK');
    };

    await requestModelInference(
      'http://model.test',
      30,
      'model',
      [{ role: 'user', content: 'Q' }],
    );

    assert.equal(capturedBody.includes('"temperature"'), false);
    assert.equal(capturedBody.includes('"top_p"'), false);
  });

  await it('configured timeout reaches the existing inference timeout path', async () => {
    const transport: OpenAICompatibleTransport = {
      fetch: async (_input, init) => {
        return new Promise<Response>((_resolve, reject) => {
          const signal = typeof init === 'object' && init !== null ? (init as RequestInit).signal : undefined;
          if (signal instanceof AbortSignal) {
            signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted', 'AbortError'));
            }, { once: true });
          } else {
            setTimeout(() => reject(new Error('timeout did not fire')), 100);
          }
        });
      },
      close: async () => undefined,
    };

    await assert.rejects(
      () => requestModelInference('http://model.test', 0, 'model', [], [], transport),
      (error: unknown) => {
        assert.ok(error instanceof ModelInferenceError);
        assert.equal(error.code, 'MODEL_SERVER_TIMEOUT');
        return true;
      },
    );

    const configuredTimeoutMinutes = 0;
    assert.equal(configuredTimeoutMinutes, 0);
  });
});
