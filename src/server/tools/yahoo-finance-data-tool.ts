import {
  YAHOO_FINANCE_DATA_TOOL_NAME,
  InvalidToolArgumentsError,
  RecoverableToolError,
  type RegisteredTool,
  type ToolSettings,
} from '../tool-types.js';

const REQUEST_TIMEOUT_MS = 10_000;

export interface YahooFinanceObservation {
  date: string;
  close: number;
}

export interface YahooFinanceDataResponse {
  symbol: string;
  currency: string | null;
  exchange: string | null;
  exchangeName: string | null;
  instrumentType: string | null;
  timezone: string | null;
  currentPrice: number | null;
  previousClose: number | null;
  observations: YahooFinanceObservation[];
}

export type YahooFinanceTransport = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;

export class YahooFinanceDataError extends InvalidToolArgumentsError {
  constructor() {
    super('Yahoo Finance data retrieval failed');
    this.name = 'YahooFinanceDataError';
  }
}

function parseArguments(value: unknown): { symbol: string; years: number } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new YahooFinanceDataError();
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'symbol' && key !== 'years')) {
    throw new YahooFinanceDataError();
  }
  if (typeof input.symbol !== 'string' || input.symbol.trim().length === 0) {
    throw new YahooFinanceDataError();
  }
  if (typeof input.years !== 'number' || !Number.isInteger(input.years)) {
    throw new YahooFinanceDataError();
  }
  if (input.years < 1 || input.years > 10) {
    throw new YahooFinanceDataError();
  }
  return { symbol: input.symbol.trim(), years: input.years };
}

function calculatePeriods(years: number, now: Date): { period1: string; period2: string } {
  const period2 = Math.floor(now.getTime() / 1000);
  const period1Date = new Date(now);
  period1Date.setFullYear(period1Date.getFullYear() - years);
  const period1 = Math.floor(period1Date.getTime() / 1000);
  return { period1: String(period1), period2: String(period2) };
}

function parseYahooResponse(data: unknown): YahooFinanceDataResponse | null {
  if (typeof data !== 'object' || data === null) {
    throw new RecoverableToolError(
      'YAHOO_FINANCE_DATA_FAILED',
      'Unexpected response from the financial data provider.',
    );
  }

  const chart = (data as Record<string, unknown>).chart;
  if (typeof chart !== 'object' || chart === null) {
    throw new RecoverableToolError(
      'YAHOO_FINANCE_DATA_FAILED',
      'Unexpected response from the financial data provider.',
    );
  }

  const chartRecord = chart as Record<string, unknown>;

  // Check for Yahoo structured error
  if (chartRecord.error !== undefined && chartRecord.error !== null) {
    throw new RecoverableToolError(
      'YAHOO_FINANCE_DATA_FAILED',
      'The financial data provider returned an error.',
    );
  }

  const result = chartRecord.result;
  if (!Array.isArray(result) || result.length === 0) {
    throw new RecoverableToolError(
      'YAHOO_FINANCE_DATA_FAILED',
      'Unexpected response from the financial data provider.',
    );
  }

  const resultItem = result[0];
  if (typeof resultItem !== 'object' || resultItem === null) {
    throw new RecoverableToolError(
      'YAHOO_FINANCE_DATA_FAILED',
      'Unexpected response from the financial data provider.',
    );
  }

  const resultRecord = resultItem as Record<string, unknown>;

  // Parse meta
  const metaRaw = resultRecord.meta;
  if (typeof metaRaw !== 'object' || metaRaw === null) {
    throw new RecoverableToolError(
      'YAHOO_FINANCE_DATA_FAILED',
      'Unexpected response from the financial data provider.',
    );
  }
  const meta = metaRaw as Record<string, unknown>;

  const getStringField = (field: string): string | null => {
    const val = meta[field];
    if (typeof val === 'string' && val.length > 0) return val;
    return null;
  };

  const getNumberField = (field: string): number | null => {
    const val = meta[field];
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    return null;
  };

  const symbol = getStringField('symbol') ?? null;
  const currency = getStringField('currency') ?? null;
  const exchange = getStringField('exchangeName') ?? null;
  const exchangeName = getStringField('fullExchangeName') ?? getStringField('exchangeName');
  const instrumentType = getStringField('instrumentType') ?? null;
  const timezone = getStringField('exchangeTimezoneName') ?? getStringField('timezone');
  const currentPrice = getNumberField('regularMarketPrice') ?? null;
  const previousClose = getNumberField('chartPreviousClose') ?? null;

  // Parse timestamps
  const timestampsRaw = resultRecord.timestamp;
  if (!Array.isArray(timestampsRaw)) {
    throw new RecoverableToolError(
      'YAHOO_FINANCE_DATA_FAILED',
      'Unexpected response from the financial data provider.',
    );
  }
  const timestamps: number[] = [];
  for (const ts of timestampsRaw) {
    if (typeof ts !== 'number' || !Number.isFinite(ts)) {
      throw new RecoverableToolError(
        'YAHOO_FINANCE_DATA_FAILED',
        'Unexpected response from the financial data provider.',
      );
    }
    timestamps.push(ts);
  }

  // Parse quote indicators
  const indicatorsRaw = resultRecord.indicators;
  if (typeof indicatorsRaw !== 'object' || indicatorsRaw === null) {
    throw new RecoverableToolError(
      'YAHOO_FINANCE_DATA_FAILED',
      'Unexpected response from the financial data provider.',
    );
  }
  const indicators = indicatorsRaw as Record<string, unknown>;

  // Parse quote indicator
  const quoteArray = indicators.quote;
  if (!Array.isArray(quoteArray) || quoteArray.length === 0) {
    throw new RecoverableToolError(
      'YAHOO_FINANCE_DATA_FAILED',
      'Unexpected response from the financial data provider.',
    );
  }
  const quoteData = quoteArray[0] as Record<string, unknown>;

  // Parse close values from quote data
  const closeRaw = quoteData.close;
  if (!Array.isArray(closeRaw)) {
    throw new RecoverableToolError(
      'YAHOO_FINANCE_DATA_FAILED',
      'Unexpected response from the financial data provider.',
    );
  }
  const closeValues: (number | null)[] = [];
  for (const v of closeRaw) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      closeValues.push(v);
    } else {
      closeValues.push(null);
    }
  }

  // Build observations by index
  const observations: YahooFinanceObservation[] = [];
  const len = timestamps.length;
  for (let i = 0; i < len; i++) {
    const closeVal = closeValues[i];
    if (closeVal === null || !Number.isFinite(closeVal)) continue;

    const dateStr = formatDateFromTimestamp(timestamps[i], timezone);

    observations.push({
      date: dateStr,
      close: closeVal,
    });
  }

  return {
    symbol: symbol ?? '',
    currency,
    exchange,
    exchangeName,
    instrumentType,
    timezone,
    currentPrice,
    previousClose,
    observations,
  };
}

function formatDateFromTimestamp(timestampSeconds: number, providerTimezone: string | null): string {
  const date = new Date(timestampSeconds * 1000);

  if (!providerTimezone) {
    return formatUTCDate(date);
  }

  try {
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: providerTimezone }));
    return tzDate.toISOString().slice(0, 10);
  } catch {
    return formatUTCDate(date);
  }
}

function formatUTCDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function yahooRequest(
  transport: YahooFinanceTransport,
  url: string,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await transport(url, { method: 'GET', signal });

  if (!response.ok) {
    throw new RecoverableToolError(
      'YAHOO_FINANCE_DATA_FAILED',
      'Unable to retrieve financial data.',
      response.status === undefined ? undefined : { status: response.status },
    );
  }

  let rawData: unknown;
  try {
    rawData = await response.json();
  } catch {
    throw new RecoverableToolError(
      'YAHOO_FINANCE_DATA_FAILED',
      'Unable to retrieve financial data.',
    );
  }

  return rawData;
}

export class YahooFinanceDataTool implements RegisteredTool {
  readonly name = YAHOO_FINANCE_DATA_TOOL_NAME;
  readonly displayName = 'Yahoo Finance Data';
  readonly description =
    'Retrieves historical daily close prices from Yahoo Finance for a known instrument symbol. Returns instrument metadata and close-price history.';
  readonly inputSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'The Yahoo Finance symbol (e.g. AAPL, ^GSPC, EURUSD=X, BTC-USD).',
      },
      years: {
        type: 'integer',
        description: 'Number of years of history to retrieve (1-10).',
      },
    },
    required: ['symbol', 'years'],
    additionalProperties: false,
  };

  constructor(
    private readonly transport: YahooFinanceTransport = fetch,
    private readonly timeoutMs: number = REQUEST_TIMEOUT_MS,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    argumentsValue: unknown,
    _settings: ToolSettings,
    signal?: AbortSignal,
  ): Promise<YahooFinanceDataResponse> {
    const { symbol, years } = parseArguments(argumentsValue);

    const { period1, period2 } = calculatePeriods(years, this.now());

    const params = new URLSearchParams({
      useYfid: 'true',
      interval: '1d',
      includePrePost: 'false',
      lang: 'en-US',
      period1,
      period2,
    });

    const encodedSymbol = encodeURIComponent(symbol);
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?${params.toString()}`;

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
      const rawData = await yahooRequest(this.transport, url, controller.signal);
      const parsed = parseYahooResponse(rawData);
      if (!parsed) {
        throw new RecoverableToolError(
          'YAHOO_FINANCE_DATA_FAILED',
          'Unexpected response from the financial data provider.',
        );
      }

      // Use input symbol as fallback only when provider metadata is absent
      if (!parsed.symbol && symbol) {
        parsed.symbol = symbol;
      }

      return parsed;
    } catch (error) {
      if (error instanceof RecoverableToolError) throw error;
      throw new RecoverableToolError(
        'YAHOO_FINANCE_DATA_FAILED',
        'Unable to retrieve financial data.',
        timedOut ? { reason: 'timeout' } : undefined,
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
}
