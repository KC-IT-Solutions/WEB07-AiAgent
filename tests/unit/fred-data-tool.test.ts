import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FredDataError, FredDataTool, type FredTransport } from '../../src/server/tools/fred-data-tool.js';
import { RecoverableToolError } from '../../src/server/tool-types.js';
import { ToolRegistry } from '../../src/server/tools/tool-registry.js';
import { DuckDuckGoSearchTool } from '../../src/server/tools/duckduckgo-search-tool.js';
import { VisitWebsiteTool } from '../../src/server/tools/visit-website-tool.js';

const SETTINGS = { enabledForChat: false };

const mockSeriesMetadata = {
  seriess: [
    {
      id: 'UNRATE',
      title: 'Unemployment Rate',
      units: 'Percent',
      frequency: 'Monthly',
      seasonal_adjustment: 'Seasonally Adjusted',
      observation_start: '1948-01-01',
      observation_end: '2026-07-01',
      last_updated: '2026-08-07 07:44:02-05',
    },
  ],
};

const mockObservations = {
  observations: [
    { date: '2025-06-01', value: '3.6' },
    { date: '2025-07-01', value: '4.2' },
  ],
};

function createDualTransport(
  metadataResponse: { ok: boolean; status?: number; json(): Promise<unknown> },
  observationsResponse: { ok: boolean; status?: number; json(): Promise<unknown> },
): FredTransport {
  let callCount = 0;
  return async () => {
    const response = callCount === 0 ? metadataResponse : observationsResponse;
    callCount++;
    return response;
  };
}

function createTrackingDualTransport(
  onMetadata: (url: string) => void,
  onObservations: (url: string) => void,
): { transport: FredTransport } {
  let callCount = 0;
  const transport: FredTransport = async (url) => {
    if (callCount === 0) {
      callCount++;
      onMetadata(url);
      return { ok: true, json: async () => mockSeriesMetadata };
    } else {
      onObservations(url);
      return { ok: true, json: async () => mockObservations };
    }
  };
  return { transport };
}

await describe('FredData tool', async () => {
  const fixedNow = new Date('2026-01-15T00:00:00Z');

  const createTool = (transport?: FredTransport, timeoutMs?: number) =>
    new FredDataTool(transport, timeoutMs, () => fixedNow);

  await it('is registered in ToolRegistry with correct name', async () => {
    const registry = new ToolRegistry([
      new DuckDuckGoSearchTool(),
      new VisitWebsiteTool(),
      createTool(),
    ]);
    assert.ok(registry.get('fred_data'));
    assert.equal(registry.get('fred_data')!.name, 'fred_data');
  });

  await it('exposes correct display name and description', () => {
    const tool = createTool();
    assert.equal(tool.displayName, 'FRED Data');
    assert.ok(tool.description.toLowerCase().includes('fred'));
  });

  await it('input schema requires seriesId and years', () => {
    const tool = createTool();
    assert.deepEqual(tool.inputSchema.required, ['seriesId', 'years']);
    assert.equal(tool.inputSchema.additionalProperties, false);
  });

  await it('accepts years=1', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => mockSeriesMetadata },
      { ok: true, json: async () => ({ observations: [{ date: '2025-06-01', value: 100 }] }) },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      const result = await createTool(transport).execute({ seriesId: 'CPIAUCSL', years: 1 }, SETTINGS);
      assert.equal(result.seriesId, 'CPIAUCSL');
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('accepts years=10', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => mockSeriesMetadata },
      { ok: true, json: async () => ({ observations: [{ date: '2016-01-01', value: 50 }] }) },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      const result = await createTool(transport).execute({ seriesId: 'UNRATE', years: 10 }, SETTINGS);
      assert.equal(result.seriesId, 'UNRATE');
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('rejects years=0', async () => {
    await assert.rejects(
      () => createTool().execute({ seriesId: 'CPIAUCSL', years: 0 }, SETTINGS),
      FredDataError,
    );
  });

  await it('rejects years=11', async () => {
    await assert.rejects(
      () => createTool().execute({ seriesId: 'CPIAUCSL', years: 11 }, SETTINGS),
      FredDataError,
    );
  });

  await it('rejects non-integer years', async () => {
    await assert.rejects(
      () => createTool().execute({ seriesId: 'CPIAUCSL', years: 2.5 }, SETTINGS),
      FredDataError,
    );
  });

  await it('rejects empty seriesId', async () => {
    await assert.rejects(
      () => createTool().execute({ seriesId: '  ', years: 1 }, SETTINGS),
      FredDataError,
    );
  });

  // --- Metadata request tests ---

  await it('metadata request uses /fred/series endpoint', async () => {
    let metadataUrl = '';
    const { transport } = createTrackingDualTransport(
      (url) => { metadataUrl = url; },
      () => {},
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      await createTool(transport).execute({ seriesId: 'UNRATE', years: 3 }, SETTINGS);
      assert.ok(metadataUrl.includes('/fred/series'));
      assert.ok(!metadataUrl.includes('/series/observations'));
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('metadata request includes series_id', async () => {
    let metadataUrl = '';
    const { transport } = createTrackingDualTransport(
      (url) => { metadataUrl = url; },
      () => {},
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      await createTool(transport).execute({ seriesId: 'UNRATE', years: 3 }, SETTINGS);
      assert.ok(metadataUrl.includes('series_id=UNRATE'));
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('metadata request includes file_type=json', async () => {
    let metadataUrl = '';
    const { transport } = createTrackingDualTransport(
      (url) => { metadataUrl = url; },
      () => {},
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      await createTool(transport).execute({ seriesId: 'CPIAUCSL', years: 1 }, SETTINGS);
      assert.ok(metadataUrl.includes('file_type=json'));
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('metadata request uses server-side FRED_API_KEY', async () => {
    let metadataUrl = '';
    const { transport } = createTrackingDualTransport(
      (url) => { metadataUrl = url; },
      () => {},
    );
    const originalKey = process.env.FRED_API_KEY;
    try {
      process.env.FRED_API_KEY = 'test-api-key-123';
      await createTool(transport).execute({ seriesId: 'CPIAUCSL', years: 1 }, SETTINGS);
      assert.ok(metadataUrl.includes('api_key=test-api-key-123'));
    } finally {
      process.env.FRED_API_KEY = originalKey;
    }
  });

  await it('metadata is requested before observations', async () => {
    const urls: string[] = [];
    const transport: FredTransport = async (url) => {
      urls.push(url);
      if (urls.length === 1) {
        return { ok: true, json: async () => mockSeriesMetadata };
      }
      return { ok: true, json: async () => mockObservations };
    };
    process.env.FRED_API_KEY = 'test-key';
    try {
      await createTool(transport).execute({ seriesId: 'UNRATE', years: 3 }, SETTINGS);
      assert.equal(urls.length, 2);
      assert.ok(urls[0].includes('/fred/series'));
      assert.ok(!urls[0].includes('/series/observations'));
      assert.ok(urls[1].includes('/series/observations'));
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('metadata failure prevents observations request', async () => {
    let callCount = 0;
    const transport: FredTransport = async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: false, status: 404, json: async () => undefined };
      }
      return { ok: true, json: async () => mockObservations };
    };
    process.env.FRED_API_KEY = 'test-key';
    try {
      await assert.rejects(
        () => createTool(transport).execute({ seriesId: 'UNRATE', years: 3 }, SETTINGS),
        (error: unknown) =>
          error instanceof RecoverableToolError &&
          error.code === 'FRED_DATA_FAILED' &&
          (error as RecoverableToolError).metadata?.status === 404,
      );
      assert.equal(callCount, 1);
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  // --- Metadata field mapping tests ---

  await it('title is mapped correctly', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => mockSeriesMetadata },
      { ok: true, json: async () => mockObservations },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      const result = await createTool(transport).execute({ seriesId: 'UNRATE', years: 3 }, SETTINGS);
      assert.equal(result.title, 'Unemployment Rate');
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('units is mapped correctly', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => mockSeriesMetadata },
      { ok: true, json: async () => mockObservations },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      const result = await createTool(transport).execute({ seriesId: 'UNRATE', years: 3 }, SETTINGS);
      assert.equal(result.units, 'Percent');
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('frequency is mapped correctly', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => mockSeriesMetadata },
      { ok: true, json: async () => mockObservations },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      const result = await createTool(transport).execute({ seriesId: 'UNRATE', years: 3 }, SETTINGS);
      assert.equal(result.frequency, 'Monthly');
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('seasonal_adjustment maps to seasonalAdjustment', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => mockSeriesMetadata },
      { ok: true, json: async () => mockObservations },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      const result = await createTool(transport).execute({ seriesId: 'UNRATE', years: 3 }, SETTINGS);
      assert.equal(result.seasonalAdjustment, 'Seasonally Adjusted');
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('observation_start maps to observationStart', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => mockSeriesMetadata },
      { ok: true, json: async () => mockObservations },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      const result = await createTool(transport).execute({ seriesId: 'UNRATE', years: 3 }, SETTINGS);
      assert.equal(result.observationStart, '1948-01-01');
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('observation_end maps to observationEnd', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => mockSeriesMetadata },
      { ok: true, json: async () => mockObservations },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      const result = await createTool(transport).execute({ seriesId: 'UNRATE', years: 3 }, SETTINGS);
      assert.equal(result.observationEnd, '2026-07-01');
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('last_updated maps to lastUpdated', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => mockSeriesMetadata },
      { ok: true, json: async () => mockObservations },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      const result = await createTool(transport).execute({ seriesId: 'UNRATE', years: 3 }, SETTINGS);
      assert.equal(result.lastUpdated, '2026-08-07 07:44:02-05');
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('final response contains all required metadata fields', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => mockSeriesMetadata },
      { ok: true, json: async () => mockObservations },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      const result = await createTool(transport).execute({ seriesId: 'UNRATE', years: 3 }, SETTINGS);
      assert.equal(result.seriesId, 'UNRATE');
      assert.equal(result.title, 'Unemployment Rate');
      assert.equal(result.units, 'Percent');
      assert.equal(result.frequency, 'Monthly');
      assert.equal(result.seasonalAdjustment, 'Seasonally Adjusted');
      assert.equal(result.observationStart, '1948-01-01');
      assert.equal(result.observationEnd, '2026-07-01');
      assert.equal(result.lastUpdated, '2026-08-07 07:44:02-05');
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  // --- Observations behavior preserved tests ---

  await it('observations remain unchanged in shape', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => mockSeriesMetadata },
      {
        ok: true,
        json: async () => ({
          observations: [
            { date: '2025-06-01', value: '123.45' },
            { date: '2025-07-01', value: '124.50' },
          ],
        }),
      },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      const result = await createTool(transport).execute({ seriesId: 'CPIAUCSL', years: 1 }, SETTINGS);
      assert.equal(result.observations.length, 2);
      assert.equal(result.observations[0].date, '2025-06-01');
      assert.equal(result.observations[0].value, 123.45);
      assert.equal(typeof result.observations[0].value, 'number');
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('observation ordering remains preserved', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => mockSeriesMetadata },
      {
        ok: true,
        json: async () => ({
          observations: [
            { date: '2025-01-01', value: '1' },
            { date: '2025-02-01', value: '2' },
            { date: '2025-03-01', value: '3' },
          ],
        }),
      },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      const result = await createTool(transport).execute({ seriesId: 'CPIAUCSL', years: 1 }, SETTINGS);
      assert.deepEqual(result.observations.map((o) => o.value), [1, 2, 3]);
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('non-numeric observation values remain filtered', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => mockSeriesMetadata },
      {
        ok: true,
        json: async () => ({
          observations: [
            { date: '2025-06-01', value: '100' },
            { date: '2025-07-01', value: '.' },
            { date: '2025-08-01', value: null },
            { date: '2025-09-01', value: '200' },
          ],
        }),
      },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      const result = await createTool(transport).execute({ seriesId: 'CPIAUCSL', years: 1 }, SETTINGS);
      assert.equal(result.observations.length, 2);
      assert.equal(result.observations[0].value, 100);
      assert.equal(result.observations[1].value, 200);
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  // --- Metadata error handling tests ---

  await it('malformed metadata JSON fails safely', async () => {
    const transport: FredTransport = async () => ({
      ok: true,
      json: async () => { throw new Error('unexpected token'); },
    });
    process.env.FRED_API_KEY = 'test-key';
    try {
      await assert.rejects(
        () => createTool(transport).execute({ seriesId: 'CPIAUCSL', years: 1 }, SETTINGS),
        (error: unknown) =>
          error instanceof RecoverableToolError && error.code === 'FRED_DATA_FAILED',
      );
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('malformed metadata shape fails safely', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => ({ not_series: 'wrong' }) },
      { ok: true, json: async () => mockObservations },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      await assert.rejects(
        () => createTool(transport).execute({ seriesId: 'CPIAUCSL', years: 1 }, SETTINGS),
        (error: unknown) =>
          error instanceof RecoverableToolError && error.code === 'FRED_DATA_FAILED',
      );
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('empty series metadata array fails safely', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => ({ seriess: [] }) },
      { ok: true, json: async () => mockObservations },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      await assert.rejects(
        () => createTool(transport).execute({ seriesId: 'CPIAUCSL', years: 1 }, SETTINGS),
        (error: unknown) =>
          error instanceof RecoverableToolError && error.code === 'FRED_DATA_FAILED',
      );
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('metadata non-2xx fails safely', async () => {
    const transport: FredTransport = async () => ({ ok: false, status: 500, json: async () => undefined });
    process.env.FRED_API_KEY = 'test-key';
    try {
      await assert.rejects(
        () => createTool(transport).execute({ seriesId: 'CPIAUCSL', years: 1 }, SETTINGS),
        (error: unknown) =>
          error instanceof RecoverableToolError &&
          error.code === 'FRED_DATA_FAILED' &&
          (error as RecoverableToolError).metadata?.status === 500,
      );
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('observations non-2xx still fails safely', async () => {
    const counter = { n: 0 };
    const transport: FredTransport = async () => {
      counter.n++;
      if (counter.n === 1) {
        return { ok: true, json: async () => mockSeriesMetadata };
      }
      return { ok: false, status: 503, json: async () => undefined };
    };
    process.env.FRED_API_KEY = 'test-key';
    try {
      await assert.rejects(
        () => createTool(transport).execute({ seriesId: 'CPIAUCSL', years: 1 }, SETTINGS),
        (error: unknown) =>
          error instanceof RecoverableToolError &&
          error.code === 'FRED_DATA_FAILED' &&
          (error as RecoverableToolError).metadata?.status === 503,
      );
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  // --- Security tests ---

  await it('API key is absent from Tool output', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => mockSeriesMetadata },
      { ok: true, json: async () => ({ observations: [{ date: '2025-01-01', value: '100' }] }) },
    );
    const originalKey = process.env.FRED_API_KEY;
    try {
      process.env.FRED_API_KEY = 'secret-key-do-not-expose';
      const result = await createTool(transport).execute(
        { seriesId: 'CPIAUCSL', years: 1 },
        SETTINGS,
      );
      const serialized = JSON.stringify(result);
      assert.ok(!serialized.includes('secret-key-do-not-expose'));
      assert.ok(!serialized.includes('FRED_API_KEY'));
    } finally {
      process.env.FRED_API_KEY = originalKey;
    }
  });

  await it('API key is absent from safe errors', async () => {
    const transport: FredTransport = async () => ({ ok: false, status: 401, json: async () => undefined });
    const originalKey = process.env.FRED_API_KEY;
    try {
      process.env.FRED_API_KEY = 'secret-key-do-not-expose';
      await assert.rejects(
        () => createTool(transport).execute({ seriesId: 'CPIAUCSL', years: 1 }, SETTINGS),
        (error: unknown) =>
          error instanceof RecoverableToolError &&
          !String(error).includes('secret-key-do-not-expose'),
      );
    } finally {
      process.env.FRED_API_KEY = originalKey;
    }
  });

  // --- Existing validation tests preserved ---

  await it('uses the supplied FRED series ID in metadata request', async () => {
    let metadataUrl = '';
    const { transport } = createTrackingDualTransport(
      (url) => { metadataUrl = url; },
      () => {},
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      await createTool(transport).execute({ seriesId: 'UNRATE', years: 3 }, SETTINGS);
      assert.ok(metadataUrl.includes('series_id=UNRATE'));
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('observation_start reflects requested years deterministically in observations request', async () => {
    let obsUrl = '';
    const { transport } = createTrackingDualTransport(
      () => {},
      (url) => { obsUrl = url; },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      await createTool(transport).execute({ seriesId: 'CPIAUCSL', years: 5 }, SETTINGS);
      assert.ok(obsUrl.includes('observation_start=2021-01-15'));
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('observations request uses file_type=json', async () => {
    let obsUrl = '';
    const { transport } = createTrackingDualTransport(
      () => {},
      (url) => { obsUrl = url; },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      await createTool(transport).execute({ seriesId: 'CPIAUCSL', years: 1 }, SETTINGS);
      assert.ok(obsUrl.includes('file_type=json'));
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  // --- Existing error handling tests preserved ---

  await it('missing FRED_API_KEY fails safely', async () => {
    const originalKey = process.env.FRED_API_KEY;
    try {
      delete process.env.FRED_API_KEY;
      await assert.rejects(
        () => createTool().execute({ seriesId: 'CPIAUCSL', years: 1 }, SETTINGS),
        (error: unknown) =>
          error instanceof RecoverableToolError &&
          error.code === 'FRED_DATA_FAILED' &&
          !String(error).includes('FRED_API_KEY'),
      );
    } finally {
      process.env.FRED_API_KEY = originalKey;
    }
  });

  await it('network failure produces controlled Tool failure', async () => {
    const transport: FredTransport = async () => {
      throw new Error('private network detail');
    };
    await assert.rejects(
      () => createTool(transport).execute({ seriesId: 'CPIAUCSL', years: 1 }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError &&
        error.code === 'FRED_DATA_FAILED' &&
        !String(error).includes('private network detail'),
    );
  });

  await it('non-2xx FRED response produces controlled Tool failure', async () => {
    const transport: FredTransport = async () => ({ ok: false, status: 401, json: async () => undefined });
    await assert.rejects(
      () => createTool(transport).execute({ seriesId: 'CPIAUCSL', years: 1 }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError &&
        error.code === 'FRED_DATA_FAILED' &&
        error.metadata?.status === 401,
    );
  });

  await it('existing external tools remain functional', async () => {
    const registry = new ToolRegistry([
      new DuckDuckGoSearchTool(),
      new VisitWebsiteTool(),
      createTool(),
    ]);
    assert.equal(registry.list().length, 3);
    assert.ok(registry.get('duckduckgo_search'));
    assert.ok(registry.get('visit_website'));
    assert.ok(registry.get('fred_data'));
  });

  await it('rejects additional properties in input', async () => {
    await assert.rejects(
      () => createTool().execute({ seriesId: 'CPIAUCSL', years: 1, extra: true }, SETTINGS),
      FredDataError,
    );
  });

  await it('aborts on signal and produces controlled error', async () => {
    const transport: FredTransport = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener(
          'abort',
          () => reject(new Error('aborted')),
          { once: true },
        );
      });
    const controller = new AbortController();
    const exec = createTool(transport).execute(
      { seriesId: 'CPIAUCSL', years: 1 },
      SETTINGS,
      controller.signal,
    );
    controller.abort();
    await assert.rejects(exec, { code: 'FRED_DATA_FAILED' });
  });

  await it('handles timeout with controlled error', async () => {
    const transport: FredTransport = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener(
          'abort',
          () => reject(new Error('aborted')),
          { once: true },
        );
      });
    await assert.rejects(
      () => createTool(transport, 1).execute({ seriesId: 'CPIAUCSL', years: 1 }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError &&
        error.code === 'FRED_DATA_FAILED' &&
        error.metadata?.reason === 'timeout',
    );
  });

  await it('handles malformed JSON response gracefully', async () => {
    const transport: FredTransport = async () => ({
      ok: true,
      json: async () => { throw new Error('unexpected token'); },
    });
    await assert.rejects(
      () => createTool(transport).execute({ seriesId: 'CPIAUCSL', years: 1 }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError && error.code === 'FRED_DATA_FAILED',
    );
  });

  await it('handles FRED error response with observations array gracefully', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => mockSeriesMetadata },
      {
        ok: true,
        json: async () => ({
          errors: [{ code: 'INVALID_SERIES_ID' }],
          observations: [],
        }),
      },
    );
    const result = await createTool(transport).execute({ seriesId: 'INVALID', years: 1 }, SETTINGS);
    assert.equal(result.observations.length, 0);
  });

  // --- Metadata missing field tests ---

  await it('missing title in metadata fails safely', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => ({ seriess: [{ id: 'X', units: 'Pct', frequency: 'Monthly', seasonal_adjustment: 'None', observation_start: '2000-01-01', observation_end: '2026-01-01', last_updated: '2026-01-01' }] }) },
      { ok: true, json: async () => mockObservations },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      await assert.rejects(
        () => createTool(transport).execute({ seriesId: 'X', years: 1 }, SETTINGS),
        (error: unknown) =>
          error instanceof RecoverableToolError && error.code === 'FRED_DATA_FAILED',
      );
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('missing seasonal_adjustment in metadata fails safely', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => ({ seriess: [{ id: 'X', title: 'Test', units: 'Pct', frequency: 'Monthly', observation_start: '2000-01-01', observation_end: '2026-01-01', last_updated: '2026-01-01' }] }) },
      { ok: true, json: async () => mockObservations },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      await assert.rejects(
        () => createTool(transport).execute({ seriesId: 'X', years: 1 }, SETTINGS),
        (error: unknown) =>
          error instanceof RecoverableToolError && error.code === 'FRED_DATA_FAILED',
      );
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('empty string metadata field fails safely', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => ({ seriess: [{ id: 'X', title: '', units: 'Pct', frequency: 'Monthly', seasonal_adjustment: 'None', observation_start: '2000-01-01', observation_end: '2026-01-01', last_updated: '2026-01-01' }] }) },
      { ok: true, json: async () => mockObservations },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      await assert.rejects(
        () => createTool(transport).execute({ seriesId: 'X', years: 1 }, SETTINGS),
        (error: unknown) =>
          error instanceof RecoverableToolError && error.code === 'FRED_DATA_FAILED',
      );
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  // --- Regression tests for TASK-0109: seriess property shape ---

  await it('rejects response using series instead of seriess as malformed', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => ({ series: [{ id: 'X', title: 'Test', units: 'Pct', frequency: 'Monthly', seasonal_adjustment: 'None', observation_start: '2000-01-01', observation_end: '2026-01-01', last_updated: '2026-01-01' }] }) },
      { ok: true, json: async () => mockObservations },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      await assert.rejects(
        () => createTool(transport).execute({ seriesId: 'X', years: 1 }, SETTINGS),
        (error: unknown) =>
          error instanceof RecoverableToolError && error.code === 'FRED_DATA_FAILED',
      );
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('missing seriess property fails safely', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => ({ not_seriess: 'wrong' }) },
      { ok: true, json: async () => mockObservations },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      await assert.rejects(
        () => createTool(transport).execute({ seriesId: 'X', years: 1 }, SETTINGS),
        (error: unknown) =>
          error instanceof RecoverableToolError && error.code === 'FRED_DATA_FAILED',
      );
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('malformed seriess (not an array) fails safely', async () => {
    const transport = createDualTransport(
      { ok: true, json: async () => ({ seriess: 'not-an-array' }) },
      { ok: true, json: async () => mockObservations },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      await assert.rejects(
        () => createTool(transport).execute({ seriesId: 'X', years: 1 }, SETTINGS),
        (error: unknown) =>
          error instanceof RecoverableToolError && error.code === 'FRED_DATA_FAILED',
      );
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('valid GDP metadata response maps correctly via seriess', async () => {
    const gdpMetadata = {
      seriess: [
        {
          id: 'GDP',
          title: 'Gross Domestic Product',
          units: 'Billions of Chained 2012 Dollars',
          frequency: 'Quarterly',
          seasonal_adjustment: 'Seasonally Adjusted Annual Rate',
          observation_start: '1947-01-01',
          observation_end: '2026-04-01',
          last_updated: '2026-08-01 07:35:00-05',
        },
      ],
    };
    const transport = createDualTransport(
      { ok: true, json: async () => gdpMetadata },
      { ok: true, json: async () => mockObservations },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      const result = await createTool(transport).execute({ seriesId: 'GDP', years: 3 }, SETTINGS);
      assert.equal(result.seriesId, 'GDP');
      assert.equal(result.title, 'Gross Domestic Product');
      assert.equal(result.units, 'Billions of Chained 2012 Dollars');
      assert.equal(result.frequency, 'Quarterly');
      assert.equal(result.seasonalAdjustment, 'Seasonally Adjusted Annual Rate');
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('valid GDPC1 metadata response maps correctly via seriess', async () => {
    const gdpc1Metadata = {
      seriess: [
        {
          id: 'GDPC1',
          title: 'GDP Price and Percent of Potential GDP',
          units: 'Percent of Chained Dollars',
          frequency: 'Quarterly',
          seasonal_adjustment: 'Seasonally Adjusted Annual Rate',
          observation_start: '1947-01-01',
          observation_end: '2026-04-01',
          last_updated: '2026-08-01 07:35:00-05',
        },
      ],
    };
    const transport = createDualTransport(
      { ok: true, json: async () => gdpc1Metadata },
      { ok: true, json: async () => mockObservations },
    );
    process.env.FRED_API_KEY = 'test-key';
    try {
      const result = await createTool(transport).execute({ seriesId: 'GDPC1', years: 3 }, SETTINGS);
      assert.equal(result.seriesId, 'GDPC1');
      assert.equal(result.title, 'GDP Price and Percent of Potential GDP');
      assert.equal(result.units, 'Percent of Chained Dollars');
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('metadata success proceeds to observations request', async () => {
    let obsCalled = false;
    const transport: FredTransport = async (url) => {
      if (!url.includes('/series/observations')) {
        return { ok: true, json: async () => mockSeriesMetadata };
      }
      obsCalled = true;
      return { ok: true, json: async () => mockObservations };
    };
    process.env.FRED_API_KEY = 'test-key';
    try {
      await createTool(transport).execute({ seriesId: 'UNRATE', years: 3 }, SETTINGS);
      assert.equal(obsCalled, true);
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });

  await it('metadata failure with wrong property prevents observations request', async () => {
    let obsCalled = false;
    const transport: FredTransport = async (url) => {
      if (!url.includes('/series/observations')) {
        return { ok: true, json: async () => ({ series: [{ id: 'X' }] }) };
      }
      obsCalled = true;
      return { ok: true, json: async () => mockObservations };
    };
    process.env.FRED_API_KEY = 'test-key';
    try {
      await assert.rejects(
        () => createTool(transport).execute({ seriesId: 'X', years: 1 }, SETTINGS),
        (error: unknown) => error instanceof RecoverableToolError && error.code === 'FRED_DATA_FAILED',
      );
      assert.equal(obsCalled, false);
    } finally {
      delete process.env.FRED_API_KEY;
    }
  });
});
