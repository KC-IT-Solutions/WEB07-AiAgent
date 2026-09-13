import { load } from 'cheerio';
import { performance } from 'node:perf_hooks';
import {
  DUCKDUCKGO_TOOL_NAME,
  InvalidToolArgumentsError,
  RecoverableToolError,
  type RegisteredTool,
  type ToolSettings,
} from '../tool-types.js';
import type { StructuredLogger } from '../logging/logger.js';

const SEARCH_URL = 'https://html.duckduckgo.com/html/';
const FALLBACK_SEARCH_URL = 'https://duckduckgo.com/html/';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECT_UNWRAPS = 3;
const GENERIC_REDIRECT_PARAMETERS = ['u', 'url', 'target'] as const;

export interface DuckDuckGoBrowserProfile {
  readonly id: string;
  readonly headers: Readonly<Record<string, string>>;
}

export const DUCKDUCKGO_BROWSER_PROFILES: readonly DuckDuckGoBrowserProfile[] = [
  {
    id: 'chrome-windows',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
      Referer: 'https://duckduckgo.com/',
      Origin: 'https://duckduckgo.com',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    },
  },
  {
    id: 'edge-windows',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
      Referer: 'https://duckduckgo.com/',
      Origin: 'https://duckduckgo.com',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    },
  },
  {
    id: 'firefox-windows',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
      Referer: 'https://duckduckgo.com/',
      Origin: 'https://duckduckgo.com',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
    },
  },
  {
    id: 'chrome-macos',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
      Referer: 'https://duckduckgo.com/',
      Origin: 'https://duckduckgo.com',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    },
  },
  {
    id: 'safari-macos',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
      Referer: 'https://duckduckgo.com/',
      Origin: 'https://duckduckgo.com',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
    },
  },
  {
    id: 'chrome-linux',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
      Referer: 'https://duckduckgo.com/',
      Origin: 'https://duckduckgo.com',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    },
  },
  {
    id: 'firefox-linux',
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
      Referer: 'https://duckduckgo.com/',
      Origin: 'https://duckduckgo.com',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
    },
  },
];

export type DuckDuckGoBrowserProfileSelector = () => DuckDuckGoBrowserProfile;

export function selectDuckDuckGoBrowserProfile(): DuckDuckGoBrowserProfile {
  const index = Math.floor(Math.random() * DUCKDUCKGO_BROWSER_PROFILES.length);
  return DUCKDUCKGO_BROWSER_PROFILES[index] ?? DUCKDUCKGO_BROWSER_PROFILES[0];
}

type SearchResponseClassification = 'VALID_RESULTS' | 'VALID_NO_RESULTS' | 'UNUSABLE_RESPONSE';

interface ClassifiedSearchResponse {
  classification: SearchResponseClassification;
  results: DuckDuckGoSearchResult[];
  diagnostics: DuckDuckGoFilteringDiagnostics;
  recognizedResultPage: boolean;
  recognizedNoResults: boolean;
}

interface DuckDuckGoFilteringDiagnostics {
  filteredAdCount: number;
  filteredRedirectCount: number;
  filteredInternalCount: number;
  duplicateResultCount: number;
}

interface ParsedDuckDuckGoResults {
  results: DuckDuckGoSearchResult[];
  diagnostics: DuckDuckGoFilteringDiagnostics;
}

type RejectedResultReason = 'ad' | 'internal' | 'redirect' | 'invalid';

type NormalizedResultUrl = { url: string } | { reason: RejectedResultReason };

export interface DuckDuckGoSearchResult {
  title: string;
  url: string;
}

export interface DuckDuckGoSearchResponse {
  query: string;
  results: DuckDuckGoSearchResult[];
}

export type SearchTransport = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status?: number; text(): Promise<string> }>;

export type DuckDuckGoWait = (delayMs: number, signal?: AbortSignal) => Promise<void>;

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
}

const waitForDelay: DuckDuckGoWait = (delayMs, signal) =>
  new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(finish, delayMs);
    const abort = (): void => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      reject(
        signal ? abortReason(signal) : new DOMException('The operation was aborted', 'AbortError'),
      );
    };
    function finish(): void {
      signal?.removeEventListener('abort', abort);
      resolve();
    }
    if (signal?.aborted) {
      abort();
    } else {
      signal?.addEventListener('abort', abort, { once: true });
    }
  });

export class DuckDuckGoRequestScheduler {
  private tail: Promise<void> = Promise.resolve();
  private lastRequestStartedAt: number | null = null;
  private cooldownUntil = 0;

  constructor(
    private readonly now: () => number = () => performance.now(),
    private readonly wait: DuckDuckGoWait = waitForDelay,
  ) {}

  schedule<T extends { status?: number }>(
    requestDelayMs: number,
    cooldownAfter202Ms: number,
    signal: AbortSignal | undefined,
    request: () => Promise<T>,
  ): Promise<{ response: T; pacingWaitMs: number }> {
    const queued = this.tail.then(async () => {
      signal?.throwIfAborted();
      const currentTime = this.now();
      // The queued request's captured delay governs spacing from the previous global start.
      const pacingUntil =
        this.lastRequestStartedAt === null
          ? currentTime
          : this.lastRequestStartedAt + requestDelayMs;
      const waitMs = Math.max(0, Math.max(pacingUntil, this.cooldownUntil) - currentTime);
      if (waitMs > 0) {
        await this.wait(waitMs, signal);
      }
      signal?.throwIfAborted();
      this.lastRequestStartedAt = this.now();
      const response = await request();
      if (response.status === 202) {
        this.cooldownUntil = Math.max(this.cooldownUntil, this.now() + cooldownAfter202Ms);
      }
      return { response, pacingWaitMs: waitMs };
    });
    this.tail = queued.then(
      () => undefined,
      () => undefined,
    );

    if (!signal) {
      return queued;
    }
    return new Promise((resolve, reject) => {
      const abort = (): void => reject(abortReason(signal));
      if (signal.aborted) {
        abort();
      } else {
        signal.addEventListener('abort', abort, { once: true });
      }
      void queued.then(
        (result) => {
          signal.removeEventListener('abort', abort);
          resolve(result);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', abort);
          reject(error);
        },
      );
    });
  }
}

const sharedDuckDuckGoRequestScheduler = new DuckDuckGoRequestScheduler();

export class DuckDuckGoSearchError extends InvalidToolArgumentsError {
  constructor() {
    super('DuckDuckGo search failed');
    this.name = 'DuckDuckGoSearchError';
  }
}

function createDuckDuckGoRequestHeaders(
  browserProfile: DuckDuckGoBrowserProfile,
): Record<string, string> {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...browserProfile.headers,
  };
}

function parseArguments(value: unknown): { query: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DuckDuckGoSearchError();
  }
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => key !== 'query') ||
    typeof input.query !== 'string' ||
    input.query.trim().length === 0 ||
    input.query.trim().length > 500
  ) {
    throw new DuckDuckGoSearchError();
  }
  return { query: input.query.trim() };
}

function isDuckDuckGoHost(hostname: string): boolean {
  return hostname === 'duckduckgo.com' || hostname.endsWith('.duckduckgo.com');
}

function isDomainOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isKnownAdUrl(parsed: URL): boolean {
  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();
  return (
    (isDuckDuckGoHost(hostname) && pathname === '/y.js') ||
    (hostname === 'www.bing.com' &&
      (pathname === '/aclick' ||
        pathname.startsWith('/aclick/') ||
        pathname === '/alink' ||
        pathname.startsWith('/alink/'))) ||
    isDomainOrSubdomain(hostname, 'doubleclick.net') ||
    isDomainOrSubdomain(hostname, 'googleadservices.com')
  );
}

function getRedirectTarget(parsed: URL): { present: boolean; value: string | null } {
  if (isDuckDuckGoHost(parsed.hostname) && parsed.searchParams.has('uddg')) {
    return { present: true, value: parsed.searchParams.get('uddg') };
  }
  for (const parameter of GENERIC_REDIRECT_PARAMETERS) {
    if (parsed.searchParams.has(parameter)) {
      return { present: true, value: parsed.searchParams.get(parameter) };
    }
  }
  return { present: false, value: null };
}

function isAbsoluteHttpUrl(value: string): boolean {
  if (/%(?![0-9a-f]{2})/i.test(value)) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeResultUrl(rawHref: string): NormalizedResultUrl {
  let candidate = rawHref.startsWith('//') ? `https:${rawHref}` : rawHref;

  for (let unwrapCount = 0; ; unwrapCount += 1) {
    let parsed: URL;
    try {
      parsed = new URL(candidate, SEARCH_URL);
    } catch {
      return { reason: 'invalid' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { reason: 'invalid' };
    }
    if (isKnownAdUrl(parsed)) {
      return { reason: 'ad' };
    }

    const redirectTarget = getRedirectTarget(parsed);
    if (redirectTarget.present) {
      if (
        unwrapCount >= MAX_REDIRECT_UNWRAPS ||
        !redirectTarget.value ||
        !isAbsoluteHttpUrl(redirectTarget.value)
      ) {
        return { reason: 'redirect' };
      }
      candidate = redirectTarget.value;
      continue;
    }
    if (isDuckDuckGoHost(parsed.hostname)) {
      return { reason: 'internal' };
    }
    return { url: parsed.toString() };
  }
}

function createFilteringDiagnostics(): DuckDuckGoFilteringDiagnostics {
  return {
    filteredAdCount: 0,
    filteredRedirectCount: 0,
    filteredInternalCount: 0,
    duplicateResultCount: 0,
  };
}

function extractResultsWithDiagnostics(html: string, limit: number): ParsedDuckDuckGoResults {
  const $ = load(html);
  const results: DuckDuckGoSearchResult[] = [];
  const diagnostics = createFilteringDiagnostics();
  const seen = new Set<string>();

  $('.result').each((_index, element) => {
    if (results.length >= limit) {
      return;
    }
    if ($(element).hasClass('result--ad')) {
      diagnostics.filteredAdCount += 1;
      return;
    }
    const link = $(element).find('.result__a').first();
    const rawHref = link.attr('href');
    const title = link.text().replace(/\s+/g, ' ').trim();
    if (!rawHref || !title) {
      return;
    }
    if (/(?:ad_provider|ad_domain|duckduckgo\.com\/y\.js)/i.test(rawHref)) {
      diagnostics.filteredAdCount += 1;
      return;
    }
    const normalized = normalizeResultUrl(rawHref);
    if ('reason' in normalized) {
      if (normalized.reason === 'ad') diagnostics.filteredAdCount += 1;
      if (normalized.reason === 'internal') diagnostics.filteredInternalCount += 1;
      if (normalized.reason === 'redirect') diagnostics.filteredRedirectCount += 1;
      return;
    }
    if (seen.has(normalized.url)) {
      diagnostics.duplicateResultCount += 1;
      return;
    }
    seen.add(normalized.url);
    results.push({ title, url: normalized.url });
  });

  return { results, diagnostics };
}

export function extractDuckDuckGoResults(html: string, limit: number): DuckDuckGoSearchResult[] {
  return extractResultsWithDiagnostics(html, limit).results;
}

function classifySearchResponse(html: string, limit: number): ClassifiedSearchResponse {
  const $ = load(html);
  const { results, diagnostics } = extractResultsWithDiagnostics(html, limit);
  const recognizedResultPage =
    $('.result').length > 0 && $('.result .result__a, .result__body .result__a').length > 0;
  const recognizedNoResults =
    $('#links .no-results, #links .no-results__message, .results .no-results, .results--no-results')
      .length > 0;

  if (recognizedResultPage && results.length > 0) {
    return {
      classification: 'VALID_RESULTS',
      results,
      diagnostics,
      recognizedResultPage,
      recognizedNoResults: false,
    };
  }
  if (recognizedNoResults) {
    return {
      classification: 'VALID_NO_RESULTS',
      results: [],
      diagnostics,
      recognizedResultPage: true,
      recognizedNoResults: true,
    };
  }
  return {
    classification: 'UNUSABLE_RESPONSE',
    results: [],
    diagnostics,
    recognizedResultPage,
    recognizedNoResults: false,
  };
}

export class DuckDuckGoSearchTool implements RegisteredTool {
  readonly name = DUCKDUCKGO_TOOL_NAME;
  readonly displayName = 'DuckDuckGo Search';
  readonly description = 'Searches the public web with DuckDuckGo and returns search-result links.';
  readonly inputSchema: Record<string, unknown> = {
    type: 'object',
    properties: { query: { type: 'string', description: 'The public web search query.' } },
    required: ['query'],
    additionalProperties: false,
  };

  constructor(
    private readonly transport: SearchTransport = fetch,
    private readonly timeoutMs: number = REQUEST_TIMEOUT_MS,
    private readonly logger?: Pick<StructuredLogger, 'application'>,
    private readonly browserProfileSelector: DuckDuckGoBrowserProfileSelector = selectDuckDuckGoBrowserProfile,
    private readonly scheduler: DuckDuckGoRequestScheduler = sharedDuckDuckGoRequestScheduler,
  ) {}

  async execute(
    argumentsValue: unknown,
    settings: ToolSettings,
    signal?: AbortSignal,
  ): Promise<DuckDuckGoSearchResponse> {
    const { query } = parseArguments(argumentsValue);
    if (!('pageSize' in settings)) {
      throw new DuckDuckGoSearchError();
    }
    const browserProfile = this.browserProfileSelector();
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
      for (const [attemptIndex, url] of [SEARCH_URL, FALLBACK_SEARCH_URL].entries()) {
        const fallbackUsed = attemptIndex === 1;
        const { response, pacingWaitMs } = await this.scheduler.schedule(
          settings.requestDelayMs,
          settings.cooldownAfter202Ms,
          controller.signal,
          () =>
            this.transport(url, {
              method: 'POST',
              headers: createDuckDuckGoRequestHeaders(browserProfile),
              body: new URLSearchParams({
                q: query,
                kp:
                  settings.safeSearch === 'strict'
                    ? '1'
                    : settings.safeSearch === 'off'
                      ? '-2'
                      : '-1',
              }),
              signal: controller.signal,
            }),
        );
        if (!response.ok) {
          throw new RecoverableToolError(
            'WEB_SEARCH_FAILED',
            'Unable to complete the web search.',
            response.status === undefined ? undefined : { status: response.status },
          );
        }

        let html: string;
        try {
          html = await response.text();
        } catch {
          throw new RecoverableToolError(
            'WEB_SEARCH_FAILED',
            'Unable to complete the web search.',
            { reason: 'unreadable' },
          );
        }
        const classified = classifySearchResponse(html, settings.pageSize);
        try {
          await this.logger?.application('debug', 'duckduckgo_search_response', {
            responseStatus: response.status ?? null,
            responseBytes: Buffer.byteLength(html, 'utf8'),
            parsedResultCount: classified.results.length,
            recognizedResultPage: classified.recognizedResultPage,
            recognizedNoResults: classified.recognizedNoResults,
            fallbackUsed,
            classification: classified.classification,
            browserProfile: browserProfile.id,
            requestDelayMs: settings.requestDelayMs,
            cooldownAfter202Ms: settings.cooldownAfter202Ms,
            pacingWaitMs,
            filteredAdCount: classified.diagnostics.filteredAdCount,
            filteredRedirectCount: classified.diagnostics.filteredRedirectCount,
            filteredInternalCount: classified.diagnostics.filteredInternalCount,
            duplicateResultCount: classified.diagnostics.duplicateResultCount,
          });
        } catch {
          // Logging failures must not replace the tool result.
        }

        if (classified.classification !== 'UNUSABLE_RESPONSE') {
          return { query, results: classified.results };
        }
        if (fallbackUsed) {
          throw new RecoverableToolError(
            'SEARCH_RESPONSE_UNUSABLE',
            'Search provider returned an unusable response.',
          );
        }
      }
      throw new RecoverableToolError(
        'SEARCH_RESPONSE_UNUSABLE',
        'Search provider returned an unusable response.',
      );
    } catch (error) {
      if (error instanceof RecoverableToolError) {
        throw error;
      }
      throw new RecoverableToolError(
        'WEB_SEARCH_FAILED',
        'Unable to complete the web search.',
        timedOut ? { reason: 'timeout' } : undefined,
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
}
