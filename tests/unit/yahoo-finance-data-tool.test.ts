import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { YahooFinanceDataError, YahooFinanceDataTool, type YahooFinanceTransport } from '../../src/server/tools/yahoo-finance-data-tool.js';
import { RecoverableToolError } from '../../src/server/tool-types.js';
import { ToolRegistry } from '../../src/server/tools/tool-registry.js';
import { DuckDuckGoSearchTool } from '../../src/server/tools/duckduckgo-search-tool.js';
import { VisitWebsiteTool } from '../../src/server/tools/visit-website-tool.js';

const SETTINGS = { enabledForChat: false };

function createMockYahooResponse(
  timestamps: number[],
  closeValues: (number | null)[],
) {
  return {
    chart: {
      result: [
        {
          meta: {
            symbol: '^GSPC',
            currency: 'USD',
            exchangeName: 'SNP',
            fullExchangeName: 'SNP',
            instrumentType: 'INDEX',
            timezone: 'EDT',
            exchangeTimezoneName: 'America/New_York',
            regularMarketPrice: 7720.13,
            chartPreviousClose: 6481.4,
          },
          timestamp: timestamps,
          indicators: {
            quote: [
              {
                close: closeValues,
              },
            ],
          },
        },
      ],
    },
  };
}

await describe('YahooFinanceData tool', async () => {
  const fixedNow = new Date('2026-08-27T12:00:00Z');
  const createTool = (transport?: YahooFinanceTransport, timeoutMs?: number) =>
    new YahooFinanceDataTool(transport, timeoutMs, () => fixedNow);

  // --- Basic registration and schema tests ---

  await it('is registered in ToolRegistry with correct name', async () => {
    const registry = new ToolRegistry([
      new DuckDuckGoSearchTool(),
      new VisitWebsiteTool(),
      createTool(),
    ]);
    assert.ok(registry.get('yahoo_finance_data'));
    assert.equal(registry.get('yahoo_finance_data')!.name, 'yahoo_finance_data');
  });

  await it('exposes correct display name and description', () => {
    const tool = createTool();
    assert.equal(tool.displayName, 'Yahoo Finance Data');
    assert.ok(tool.description.toLowerCase().includes('close prices'));
  });

  await it('input schema requires symbol and years', () => {
    const tool = createTool();
    assert.deepEqual(tool.inputSchema.required, ['symbol', 'years']);
    assert.equal(tool.inputSchema.additionalProperties, false);
  });

  // --- Input validation tests ---

  await it('rejects missing symbol', async () => {
    await assert.rejects(
      () => createTool().execute({ years: 1 }, SETTINGS),
      YahooFinanceDataError,
    );
  });

  await it('rejects empty symbol', async () => {
    await assert.rejects(
      () => createTool().execute({ symbol: '  ', years: 1 }, SETTINGS),
      YahooFinanceDataError,
    );
  });

  await it('rejects missing years', async () => {
    await assert.rejects(
      () => createTool().execute({ symbol: 'AAPL' }, SETTINGS),
      YahooFinanceDataError,
    );
  });

  await it('accepts years=1', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse(
        [1724601600],
        [230.97],
      ),
    });
    const result = await createTool(transport).execute({ symbol: '^GSPC', years: 1 }, SETTINGS);
    assert.equal(result.symbol, '^GSPC');
  });

  await it('accepts years=10', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse(
        [1567296000],
        [203],
      ),
    });
    const result = await createTool(transport).execute({ symbol: '^GSPC', years: 10 }, SETTINGS);
    assert.equal(result.symbol, '^GSPC');
  });

  await it('rejects years=0', async () => {
    await assert.rejects(
      () => createTool().execute({ symbol: 'AAPL', years: 0 }, SETTINGS),
      YahooFinanceDataError,
    );
  });

  await it('rejects years=11', async () => {
    await assert.rejects(
      () => createTool().execute({ symbol: 'AAPL', years: 11 }, SETTINGS),
      YahooFinanceDataError,
    );
  });

  await it('rejects non-integer years', async () => {
    await assert.rejects(
      () => createTool().execute({ symbol: 'AAPL', years: 2.5 }, SETTINGS),
      YahooFinanceDataError,
    );
  });

  await it('rejects additional properties in input', async () => {
    await assert.rejects(
      () => createTool().execute({ symbol: 'AAPL', years: 1, extra: true }, SETTINGS),
      YahooFinanceDataError,
    );
  });

  // --- Request construction tests ---

  await it('symbol is URL-encoded in request', async () => {
    let capturedUrl = '';
    const transport: YahooFinanceTransport = async (url) => {
      capturedUrl = url;
      return { ok: true, json: async () => createMockYahooResponse([], []) };
    };
    await createTool(transport).execute({ symbol: 'EURUSD=X', years: 2 }, SETTINGS);
    assert.ok(capturedUrl.includes('EURUSD%3DX'));
  });

  await it('uses interval=1d parameter', async () => {
    let capturedUrl = '';
    const transport: YahooFinanceTransport = async (url) => {
      capturedUrl = url;
      return { ok: true, json: async () => createMockYahooResponse([], []) };
    };
    await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.ok(capturedUrl.includes('interval=1d'));
  });

  await it('uses includePrePost=false parameter', async () => {
    let capturedUrl = '';
    const transport: YahooFinanceTransport = async (url) => {
      capturedUrl = url;
      return { ok: true, json: async () => createMockYahooResponse([], []) };
    };
    await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.ok(capturedUrl.includes('includePrePost=false'));
  });

  await it('uses useYfid=true parameter', async () => {
    let capturedUrl = '';
    const transport: YahooFinanceTransport = async (url) => {
      capturedUrl = url;
      return { ok: true, json: async () => createMockYahooResponse([], []) };
    };
    await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.ok(capturedUrl.includes('useYfid=true'));
  });

  // --- Date range tests ---

  await it('period1 is calculated correctly for years=5', async () => {
    let capturedUrl = '';
    const transport: YahooFinanceTransport = async (url) => {
      capturedUrl = url;
      return { ok: true, json: async () => createMockYahooResponse([], []) };
    };
    await createTool(transport).execute({ symbol: 'AAPL', years: 5 }, SETTINGS);
    const expectedPeriod1 = Math.floor(new Date('2021-08-27T12:00:00Z').getTime() / 1000);
    assert.ok(capturedUrl.includes(`period1=${expectedPeriod1}`));
  });

  await it('period2 is calculated correctly', async () => {
    let capturedUrl = '';
    const transport: YahooFinanceTransport = async (url) => {
      capturedUrl = url;
      return { ok: true, json: async () => createMockYahooResponse([], []) };
    };
    await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    const expectedPeriod2 = Math.floor(fixedNow.getTime() / 1000);
    assert.ok(capturedUrl.includes(`period2=${expectedPeriod2}`));
  });

  // --- Metadata mapping tests ---

  await it('metadata symbol is mapped correctly', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse([], []),
    });
    const result = await createTool(transport).execute({ symbol: '^GSPC', years: 1 }, SETTINGS);
    assert.equal(result.symbol, '^GSPC');
  });

  await it('currency is mapped correctly', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse([], []),
    });
    const result = await createTool(transport).execute({ symbol: '^GSPC', years: 1 }, SETTINGS);
    assert.equal(result.currency, 'USD');
  });

  await it('exchange is mapped from exchangeName field', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse([], []),
    });
    const result = await createTool(transport).execute({ symbol: '^GSPC', years: 1 }, SETTINGS);
    assert.equal(result.exchange, 'SNP');
  });

  await it('exchangeName is mapped from fullExchangeName field', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse([], []),
    });
    const result = await createTool(transport).execute({ symbol: '^GSPC', years: 1 }, SETTINGS);
    assert.equal(result.exchangeName, 'SNP');
  });

  await it('instrumentType is mapped correctly', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse([], []),
    });
    const result = await createTool(transport).execute({ symbol: '^GSPC', years: 1 }, SETTINGS);
    assert.equal(result.instrumentType, 'INDEX');
  });

  await it('timezone is mapped from exchangeTimezoneName field', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse([], []),
    });
    const result = await createTool(transport).execute({ symbol: '^GSPC', years: 1 }, SETTINGS);
    assert.equal(result.timezone, 'America/New_York');
  });

  await it('currentPrice is mapped from regularMarketPrice field', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse([], []),
    });
    const result = await createTool(transport).execute({ symbol: '^GSPC', years: 1 }, SETTINGS);
    assert.equal(result.currentPrice, 7720.13);
  });

  await it('previousClose is mapped from chartPreviousClose field', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse([], []),
    });
    const result = await createTool(transport).execute({ symbol: '^GSPC', years: 1 }, SETTINGS);
    assert.equal(result.previousClose, 6481.4);
  });

  // --- Observation contract tests (date + close only) ---

  await it('observations contain only date and close fields', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse(
        [1724601600],
        [230.97],
      ),
    });
    const result = await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.equal(result.observations.length, 1);
    const obsKeys = Object.keys(result.observations[0]);
    assert.deepEqual(obsKeys.sort(), ['close', 'date']);
  });

  await it('open is not present in observations', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse(
        [1724601600],
        [230.97],
      ),
    });
    const result = await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.ok(!('open' in result.observations[0]));
  });

  await it('high is not present in observations', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse(
        [1724601600],
        [230.97],
      ),
    });
    const result = await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.ok(!('high' in result.observations[0]));
  });

  await it('low is not present in observations', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse(
        [1724601600],
        [230.97],
      ),
    });
    const result = await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.ok(!('low' in result.observations[0]));
  });

  await it('adjustedClose is not present in observations', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse(
        [1724601600],
        [230.97],
      ),
    });
    const result = await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.ok(!('adjustedClose' in result.observations[0]));
  });

  await it('volume is not present in observations', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse(
        [1724601600],
        [230.97],
      ),
    });
    const result = await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.ok(!('volume' in result.observations[0]));
  });

  // --- Close value tests ---

  await it('valid close values are preserved', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse(
        [1724601600],
        [230.97],
      ),
    });
    const result = await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.equal(result.observations[0].close, 230.97);
  });

  await it('timestamps and close values remain correctly paired by index', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse(
        [1724601600, 1724688000, 1724774400],
        [105, 205, 305],
      ),
    });
    const result = await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.equal(result.observations.length, 3);
    assert.deepEqual(result.observations.map((o) => o.close), [105, 205, 305]);
    // Verify dates are in order (timestamps are ascending)
    assert.ok(result.observations[0].date < result.observations[1].date);
    assert.ok(result.observations[1].date < result.observations[2].date);
  });

  await it('null close rows are skipped', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse(
        [1724601600, 1724688000],
        [null, 230.97],
      ),
    });
    const result = await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.equal(result.observations.length, 1);
    assert.equal(result.observations[0].close, 230.97);
  });

  await it('non-numeric close rows are skipped', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => ({
        chart: {
          result: [
            {
              meta: {
                symbol: 'AAPL',
                currency: 'USD',
                exchangeName: 'NMS',
                fullExchangeName: 'NasdaqGS',
                instrumentType: 'EQUITY',
                timezone: 'EDT',
                exchangeTimezoneName: 'America/New_York',
                regularMarketPrice: 231.59,
                chartPreviousClose: 230.49,
              },
              timestamp: [1724601600, 1724688000],
              indicators: {
                quote: [{ close: ['not_a_number', 230.97] }],
              },
            },
          ],
        },
      }),
    });
    const result = await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.equal(result.observations.length, 1);
    assert.equal(result.observations[0].close, 230.97);
  });

  await it('non-finite close rows are skipped', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse(
        [1724601600, 1724688000],
        [Infinity, 230.97],
      ),
    });
    const result = await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.equal(result.observations.length, 1);
    assert.equal(result.observations[0].close, 230.97);
  });

  // --- Ordering test ---

  await it('observation ordering preserved', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse(
        [1724601600, 1724688000, 1724774400],
        [105, 205, 305],
      ),
    });
    const result = await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.equal(result.observations.length, 3);
    assert.deepEqual(result.observations.map((o) => o.close), [105, 205, 305]);
  });

  // --- Error handling tests ---

  await it('network failure is recoverable', async () => {
    const transport: YahooFinanceTransport = async () => {
      throw new Error('private network detail');
    };
    await assert.rejects(
      () => createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError &&
        error.code === 'YAHOO_FINANCE_DATA_FAILED' &&
        !String(error).includes('private network detail'),
    );
  });

  await it('timeout is recoverable', async () => {
    const transport: YahooFinanceTransport = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener(
          'abort',
          () => reject(new Error('aborted')),
          { once: true },
        );
      });
    await assert.rejects(
      () => createTool(transport, 1).execute({ symbol: 'AAPL', years: 1 }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError &&
        error.code === 'YAHOO_FINANCE_DATA_FAILED' &&
        error.metadata?.reason === 'timeout',
    );
  });

  await it('non-2xx response is recoverable', async () => {
    const transport: YahooFinanceTransport = async () => ({ ok: false, status: 500, json: async () => undefined });
    await assert.rejects(
      () => createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError &&
        error.code === 'YAHOO_FINANCE_DATA_FAILED' &&
        error.metadata?.status === 500,
    );
  });

  await it('malformed JSON is recoverable', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => { throw new Error('unexpected token'); },
    });
    await assert.rejects(
      () => createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError &&
        error.code === 'YAHOO_FINANCE_DATA_FAILED',
    );
  });

  await it('malformed chart shape is recoverable', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => ({ not_chart: 'wrong' }),
    });
    await assert.rejects(
      () => createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError &&
        error.code === 'YAHOO_FINANCE_DATA_FAILED',
    );
  });

  await it('empty result is recoverable', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => ({ chart: { result: [] } }),
    });
    await assert.rejects(
      () => createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError &&
        error.code === 'YAHOO_FINANCE_DATA_FAILED',
    );
  });

  await it('Yahoo structured error is recoverable', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => ({ chart: { error: { code: 'NOT_FOUND' } } }),
    });
    await assert.rejects(
      () => createTool(transport).execute({ symbol: 'INVALID', years: 1 }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError &&
        error.code === 'YAHOO_FINANCE_DATA_FAILED',
    );
  });

  // --- Abort signal test ---

  await it('aborts on signal and produces controlled error', async () => {
    const transport: YahooFinanceTransport = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener(
          'abort',
          () => reject(new Error('aborted')),
          { once: true },
        );
      });
    const controller = new AbortController();
    const exec = createTool(transport).execute(
      { symbol: 'AAPL', years: 1 },
      SETTINGS,
      controller.signal,
    );
    controller.abort();
    await assert.rejects(exec, { code: 'YAHOO_FINANCE_DATA_FAILED' });
  });

  // --- No live provider call test ---

  await it('no live provider call is made in tests', async () => {
    let called = false;
    const transport: YahooFinanceTransport = async () => {
      called = true;
      return { ok: true, json: async () => createMockYahooResponse([], []) };
    };
    await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.equal(called, true);
  });

  // --- Existing external tools remain functional test ---

  await it('existing external tools remain functional', async () => {
    const registry = new ToolRegistry([
      new DuckDuckGoSearchTool(),
      new VisitWebsiteTool(),
      createTool(),
    ]);
    assert.equal(registry.list().length, 3);
    assert.ok(registry.get('duckduckgo_search'));
    assert.ok(registry.get('visit_website'));
    assert.ok(registry.get('yahoo_finance_data'));
  });

  // --- Missing data arrays test ---

  await it('missing quote indicators fails safely', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => ({ chart: { result: [{ meta: {}, timestamp: [], indicators: {} }]} }),
    });
    await assert.rejects(
      () => createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError &&
        error.code === 'YAHOO_FINANCE_DATA_FAILED',
    );
  });

  await it('malformed timestamp array fails safely', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => ({ chart: { result: [{ meta: {}, timestamp: ['not_a_number'], indicators: { quote: [{}] } }] }}),
    });
    await assert.rejects(
      () => createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError &&
        error.code === 'YAHOO_FINANCE_DATA_FAILED',
    );
  });

  // --- Missing meta fields return null test ---

  await it('missing optional metadata returns null', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => ({
        chart: {
          result: [
            {
              meta: { symbol: 'TEST' },
              timestamp: [],
              indicators: { quote: [{ close: [] }] },
            },
          ],
        },
      }),
    });
    const result = await createTool(transport).execute({ symbol: 'TEST', years: 1 }, SETTINGS);
    assert.equal(result.currency, null);
    assert.equal(result.exchange, null);
    assert.equal(result.exchangeName, null);
    assert.equal(result.instrumentType, null);
    assert.equal(result.timezone, null);
    assert.equal(result.currentPrice, null);
    assert.equal(result.previousClose, null);
  });

  // --- Deterministic time handling test ---

  await it('deterministic current time handling', async () => {
    let capturedUrl = '';
    const transport: YahooFinanceTransport = async (url) => {
      capturedUrl = url;
      return { ok: true, json: async () => createMockYahooResponse([], []) };
    };
    await createTool(transport).execute({ symbol: 'AAPL', years: 3 }, SETTINGS);
    const expectedPeriod2 = Math.floor(fixedNow.getTime() / 1000);
    assert.ok(capturedUrl.includes(`period2=${expectedPeriod2}`));
  });

  // --- Symbol fallback test ---

  await it('uses input symbol when provider metadata lacks symbol', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => ({
        chart: {
          result: [
            {
              meta: {},
              timestamp: [],
              indicators: { quote: [{ close: [] }] },
            },
          ],
        },
      }),
    });
    const result = await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.equal(result.symbol, 'AAPL');
  });

  // --- Missing result array test ---

  await it('missing result array fails safely', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => ({ chart: {} }),
    });
    await assert.rejects(
      () => createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError &&
        error.code === 'YAHOO_FINANCE_DATA_FAILED',
    );
  });

  // --- Missing indicators test ---

  await it('missing indicators object fails safely', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => ({ chart: { result: [{ meta: {}, timestamp: [] }] } }),
    });
    await assert.rejects(
      () => createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError &&
        error.code === 'YAHOO_FINANCE_DATA_FAILED',
    );
  });

  // --- Missing meta object test ---

  await it('missing meta object fails safely', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => ({ chart: { result: [{ timestamp: [], indicators: { quote: [{ close: [] }] } }] } }),
    });
    await assert.rejects(
      () => createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError &&
        error.code === 'YAHOO_FINANCE_DATA_FAILED',
    );
  });

  // --- Missing timestamp array test ---

  await it('missing timestamp fails safely', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => ({ chart: { result: [{ meta: {}, indicators: { quote: [{ close: [] }] } }] } }),
    });
    await assert.rejects(
      () => createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError &&
        error.code === 'YAHOO_FINANCE_DATA_FAILED',
    );
  });

  // --- Empty observations result test ---

  await it('returns empty observations when no valid close data', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse(
        [1724601600],
        [null],
      ),
    });
    const result = await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.equal(result.observations.length, 0);
  });

  // --- URL base test ---

  await it('uses correct Yahoo Finance chart endpoint base', async () => {
    let capturedUrl = '';
    const transport: YahooFinanceTransport = async (url) => {
      capturedUrl = url;
      return { ok: true, json: async () => createMockYahooResponse([], []) };
    };
    await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.ok(capturedUrl.startsWith('https://query2.finance.yahoo.com/v8/finance/chart/'));
  });

  // --- lang parameter test ---

  await it('uses lang=en-US parameter', async () => {
    let capturedUrl = '';
    const transport: YahooFinanceTransport = async (url) => {
      capturedUrl = url;
      return { ok: true, json: async () => createMockYahooResponse([], []) };
    };
    await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.ok(capturedUrl.includes('lang=en-US'));
  });

  // --- Special characters in symbol test ---

  await it('handles special characters in symbol safely', async () => {
    let capturedUrl = '';
    const transport: YahooFinanceTransport = async (url) => {
      capturedUrl = url;
      return { ok: true, json: async () => createMockYahooResponse([], []) };
    };
    await createTool(transport).execute({ symbol: '^GSPC', years: 1 }, SETTINGS);
    assert.ok(capturedUrl.includes('%5EGSPC'));
  });

  // --- Complete response test (date + close only) ---

  await it('returns complete response with metadata and date/close observations', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => createMockYahooResponse(
        [1724601600],
        [230.97],
      ),
    });
    const result = await createTool(transport).execute({ symbol: '^GSPC', years: 1 }, SETTINGS);
    assert.equal(result.symbol, '^GSPC');
    assert.equal(result.currency, 'USD');
    assert.equal(result.exchange, 'SNP');
    assert.equal(result.exchangeName, 'SNP');
    assert.equal(result.instrumentType, 'INDEX');
    assert.equal(result.timezone, 'America/New_York');
    assert.equal(result.currentPrice, 7720.13);
    assert.equal(result.previousClose, 6481.4);
    assert.equal(result.observations.length, 1);
    assert.ok(result.observations[0].date.startsWith('2024-'));
    assert.equal(result.observations[0].close, 230.97);
  });

  // --- Yahoo metadata mapping fallback tests ---

  await it('exchangeName falls back to exchangeName when fullExchangeName absent', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => ({
        chart: {
          result: [
            {
              meta: {
                symbol: 'AAPL',
                currency: 'USD',
                exchangeName: 'NMS',
                instrumentType: 'EQUITY',
                timezone: 'EDT',
                exchangeTimezoneName: 'America/New_York',
                regularMarketPrice: 231.59,
                chartPreviousClose: 230.49,
              },
              timestamp: [],
              indicators: { quote: [{ close: [] }] },
            },
          ],
        },
      }),
    });
    const result = await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.equal(result.exchange, 'NMS');
    assert.equal(result.exchangeName, 'NMS');
  });

  await it('timezone falls back to timezone when exchangeTimezoneName absent', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => ({
        chart: {
          result: [
            {
              meta: {
                symbol: 'AAPL',
                currency: 'USD',
                exchangeName: 'NMS',
                fullExchangeName: 'NasdaqGS',
                instrumentType: 'EQUITY',
                timezone: 'America/New_York',
                regularMarketPrice: 231.59,
                chartPreviousClose: 230.49,
              },
              timestamp: [],
              indicators: { quote: [{ close: [] }] },
            },
          ],
        },
      }),
    });
    const result = await createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS);
    assert.equal(result.timezone, 'America/New_York');
  });

  await it('missing optional metadata returns null with realistic field names', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => ({
        chart: {
          result: [
            {
              meta: { symbol: 'TEST' },
              timestamp: [],
              indicators: { quote: [{ close: [] }] },
            },
          ],
        },
      }),
    });
    const result = await createTool(transport).execute({ symbol: 'TEST', years: 1 }, SETTINGS);
    assert.equal(result.currency, null);
    assert.equal(result.exchange, null);
    assert.equal(result.exchangeName, null);
    assert.equal(result.instrumentType, null);
    assert.equal(result.timezone, null);
    assert.equal(result.currentPrice, null);
    assert.equal(result.previousClose, null);
  });

  await it('chart.error === null is accepted as success', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => ({
        chart: {
          error: null,
          result: [
            {
              meta: {
                symbol: '^GSPC',
                currency: 'USD',
                exchangeName: 'SNP',
                fullExchangeName: 'SNP',
                instrumentType: 'INDEX',
                timezone: 'EDT',
                exchangeTimezoneName: 'America/New_York',
                regularMarketPrice: 7720.13,
                chartPreviousClose: 6481.4,
              },
              timestamp: [],
              indicators: { quote: [{ close: [] }] },
            },
          ],
        },
      }),
    });
    const result = await createTool(transport).execute({ symbol: '^GSPC', years: 1 }, SETTINGS);
    assert.equal(result.symbol, '^GSPC');
    assert.equal(result.currentPrice, 7720.13);
  });

  // --- Close parsing with realistic Yahoo metadata fields ---

  await it('close parsing works with realistic Yahoo metadata fields', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => ({
        chart: {
          result: [
            {
              meta: {
                symbol: '^GSPC',
                currency: 'USD',
                exchangeName: 'SNP',
                fullExchangeName: 'SNP',
                instrumentType: 'INDEX',
                timezone: 'EDT',
                exchangeTimezoneName: 'America/New_York',
                regularMarketPrice: 7720.13,
                chartPreviousClose: 6481.4,
              },
              timestamp: [1724601600],
              indicators: {
                quote: [{ open: [100], high: [110], low: [95], close: [105], volume: [1000] }],
              },
            },
          ],
        },
      }),
    });
    const result = await createTool(transport).execute({ symbol: '^GSPC', years: 1 }, SETTINGS);
    assert.equal(result.observations.length, 1);
    assert.equal(result.observations[0].close, 105);
    // Verify removed fields are absent even when present in provider response
    assert.ok(!('open' in result.observations[0]));
    assert.ok(!('high' in result.observations[0]));
    assert.ok(!('low' in result.observations[0]));
    assert.ok(!('volume' in result.observations[0]));
  });

  // --- Missing close array in quote fails safely ---

  await it('missing close array in quote fails safely', async () => {
    const transport: YahooFinanceTransport = async () => ({
      ok: true,
      json: async () => ({
        chart: {
          result: [
            {
              meta: {},
              timestamp: [],
              indicators: { quote: [{}] },
            },
          ],
        },
      }),
    });
    await assert.rejects(
      () => createTool(transport).execute({ symbol: 'AAPL', years: 1 }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError &&
        error.code === 'YAHOO_FINANCE_DATA_FAILED',
    );
  });
});
