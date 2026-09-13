import {
  FRED_DATA_TOOL_NAME,
  InvalidToolArgumentsError,
  RecoverableToolError,
  type RegisteredTool,
  type ToolSettings,
} from '../tool-types.js';

const REQUEST_TIMEOUT_MS = 10_000;

export interface FredObservation {
  date: string;
  value: number;
}

export interface FredSeriesMetadata {
  title: string;
  units: string;
  frequency: string;
  seasonalAdjustment: string;
  observationStart: string;
  observationEnd: string;
  lastUpdated: string;
}

export interface FredDataResponse {
  seriesId: string;
  title: string;
  units: string;
  frequency: string;
  seasonalAdjustment: string;
  observationStart: string;
  observationEnd: string;
  lastUpdated: string;
  observations: FredObservation[];
}

export type FredTransport = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;

export class FredDataError extends InvalidToolArgumentsError {
  constructor() {
    super('FRED data retrieval failed');
    this.name = 'FredDataError';
  }
}

function parseArguments(value: unknown): { seriesId: string; years: number } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FredDataError();
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'seriesId' && key !== 'years')) {
    throw new FredDataError();
  }
  if (typeof input.seriesId !== 'string' || input.seriesId.trim().length === 0) {
    throw new FredDataError();
  }
  if (typeof input.years !== 'number' || !Number.isInteger(input.years)) {
    throw new FredDataError();
  }
  if (input.years < 1 || input.years > 10) {
    throw new FredDataError();
  }
  return { seriesId: input.seriesId.trim(), years: input.years };
}

function calculateObservationStart(years: number, now: Date): string {
  const date = new Date(now);
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function parseFredResponse(data: unknown): FredObservation[] {
  if (typeof data !== 'object' || data === null || !('observations' in data)) {
    throw new RecoverableToolError(
      'FRED_DATA_FAILED',
      'Unexpected response from the economic data provider.',
    );
  }

  const observations = (data as Record<string, unknown>).observations;
  if (!Array.isArray(observations)) {
    throw new RecoverableToolError(
      'FRED_DATA_FAILED',
      'Unexpected response from the economic data provider.',
    );
  }

  const result: FredObservation[] = [];
  for (const obs of observations) {
    if (typeof obs !== 'object' || obs === null) continue;
    const record = obs as Record<string, unknown>;
    const dateValue = record.date;
    const valueField = record.value;

    if (typeof dateValue !== 'string') continue;

    if (valueField == null || typeof valueField === 'undefined') continue;
    const numericValue = Number(valueField);
    if (!Number.isFinite(numericValue)) continue;

    result.push({ date: dateValue, value: numericValue });
  }

  return result;
}

function parseFredMetadata(data: unknown): FredSeriesMetadata {
  if (typeof data !== 'object' || data === null) {
    throw new RecoverableToolError(
      'FRED_DATA_FAILED',
      'Unexpected response from the economic data provider.',
    );
  }

  const seriesCollection = (data as Record<string, unknown>).seriess;
  if (!Array.isArray(seriesCollection) || seriesCollection.length === 0) {
    throw new RecoverableToolError(
      'FRED_DATA_FAILED',
      'Unexpected response from the economic data provider.',
    );
  }

  const series = seriesCollection[0];
  if (typeof series !== 'object' || series === null) {
    throw new RecoverableToolError(
      'FRED_DATA_FAILED',
      'Unexpected response from the economic data provider.',
    );
  }

  const record = series as Record<string, unknown>;

  const requiredFredKeys: readonly string[] = [
    'title',
    'units',
    'frequency',
    'seasonal_adjustment',
    'observation_start',
    'observation_end',
    'last_updated',
  ];

  for (const fredKey of requiredFredKeys) {
    const value = record[fredKey];
    if (typeof value !== 'string' || value.length === 0) {
      throw new RecoverableToolError(
        'FRED_DATA_FAILED',
        'Unexpected response from the economic data provider.',
      );
    }
  }

  return {
    title: record.title as string,
    units: record.units as string,
    frequency: record.frequency as string,
    seasonalAdjustment: record.seasonal_adjustment as string,
    observationStart: record.observation_start as string,
    observationEnd: record.observation_end as string,
    lastUpdated: record.last_updated as string,
  };
}

async function fredRequest(
  transport: FredTransport,
  url: string,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await transport(url, { method: 'GET', signal });

  if (!response.ok) {
    throw new RecoverableToolError(
      'FRED_DATA_FAILED',
      'Unable to retrieve economic data.',
      response.status === undefined ? undefined : { status: response.status },
    );
  }

  let rawData: unknown;
  try {
    rawData = await response.json();
  } catch {
    throw new RecoverableToolError(
      'FRED_DATA_FAILED',
      'Unable to retrieve economic data.',
    );
  }

  return rawData;
}

export class FredDataTool implements RegisteredTool {
  readonly name = FRED_DATA_TOOL_NAME;
  readonly displayName = 'FRED Data';
  readonly description =
    'Retrieves series metadata and historical macroeconomic observations from FRED for a known series ID.';
  readonly inputSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      seriesId: {
        type: 'string',
        description: 'The FRED series identifier (e.g. CPIAUCSL, UNRATE).',
      },
      years: {
        type: 'integer',
        description: 'Number of years of history to retrieve (1-10).',
      },
    },
    required: ['seriesId', 'years'],
    additionalProperties: false,
  };

  constructor(
    private readonly transport: FredTransport = fetch,
    private readonly timeoutMs: number = REQUEST_TIMEOUT_MS,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    argumentsValue: unknown,
    _settings: ToolSettings,
    signal?: AbortSignal,
  ): Promise<FredDataResponse> {
    const { seriesId, years } = parseArguments(argumentsValue);

    const apiKey = process.env.FRED_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) {
      throw new RecoverableToolError(
        'FRED_DATA_FAILED',
        'Economic data API key is not configured.',
      );
    }

    const observationStart = calculateObservationStart(years, this.now());
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      abort();
    }, this.timeoutMs);

    try {
      const metadataParams = new URLSearchParams({
        series_id: seriesId,
        file_type: 'json',
        api_key: apiKey,
      });
      const metadataUrl = `https://api.stlouisfed.org/fred/series?${metadataParams.toString()}`;

      const metadataRaw = await fredRequest(this.transport, metadataUrl, controller.signal);
      const metadata = parseFredMetadata(metadataRaw);

      const obsParams = new URLSearchParams({
        series_id: seriesId,
        observation_start: observationStart,
        file_type: 'json',
        api_key: apiKey,
      });
      const observationsUrl = `https://api.stlouisfed.org/fred/series/observations?${obsParams.toString()}`;

      const obsRaw = await fredRequest(this.transport, observationsUrl, controller.signal);
      const observations = parseFredResponse(obsRaw);

      return { seriesId, ...metadata, observations };
    } catch (error) {
      if (error instanceof RecoverableToolError) throw error;
      throw new RecoverableToolError(
        'FRED_DATA_FAILED',
        'Unable to retrieve economic data.',
        timedOut ? { reason: 'timeout' } : undefined,
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
}
