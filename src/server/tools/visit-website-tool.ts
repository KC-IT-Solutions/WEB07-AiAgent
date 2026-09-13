import { load } from 'cheerio';
import {
  VISIT_WEBSITE_TOOL_NAME,
  InvalidToolArgumentsError,
  RecoverableToolError,
  type RegisteredTool,
  type ToolSettings,
  type VisitWebsiteSettings,
} from '../tool-types.js';
import type { StructuredLogger } from '../logging/logger.js';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_FIND_TERMS = 10;
const MAX_FIND_TERM_LENGTH = 100;
const MAX_LABEL_LENGTH = 200;
const SNIPPET_CONTEXT_LENGTH = 240;
const MAX_HTML_LENGTH = 1_000_000;

export interface VisitWebsiteBrowserProfile {
  readonly id: string;
  readonly headers: Readonly<Record<string, string>>;
}

export const VISIT_WEBSITE_BROWSER_PROFILES: readonly VisitWebsiteBrowserProfile[] = [
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
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
    },
  },
];

export type VisitWebsiteBrowserProfileSelector = () => VisitWebsiteBrowserProfile;

export function selectVisitWebsiteBrowserProfile(): VisitWebsiteBrowserProfile {
  const index = Math.floor(Math.random() * VISIT_WEBSITE_BROWSER_PROFILES.length);
  return VISIT_WEBSITE_BROWSER_PROFILES[index] ?? VISIT_WEBSITE_BROWSER_PROFILES[0];
}

interface VisitWebsiteArguments {
  url: URL;
  findInPage: string[];
}

export interface WebsiteLink {
  label: string;
  url: string;
}

export interface WebsiteImage {
  alt: string;
  url: string;
}

export interface VisitWebsiteResponse {
  url: string;
  title: string;
  headings: { h1: string; h2: string[]; h3: string[] };
  content: string;
  links: WebsiteLink[];
  images: WebsiteImage[];
}

export type WebsiteTransport = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status?: number; url?: string; text(): Promise<string> }>;

export class VisitWebsiteError extends InvalidToolArgumentsError {
  constructor() {
    super('Website visit failed');
    this.name = 'VisitWebsiteError';
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function parsePublicHttpUrl(value: string, base?: URL): URL | null {
  try {
    const url = base ? new URL(value, base) : new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      /^(?:127|10|0)\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname === '::1' ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd') ||
      hostname.startsWith('fe80:')
    ) {
      return null;
    }
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function parseArguments(value: unknown): VisitWebsiteArguments {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new VisitWebsiteError();
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'url' && key !== 'findInPage')) {
    throw new VisitWebsiteError();
  }
  if (typeof input.url !== 'string' || input.url.trim().length === 0) {
    throw new VisitWebsiteError();
  }
  const url = parsePublicHttpUrl(input.url.trim());
  if (!url) {
    throw new VisitWebsiteError();
  }
  const findInPageValue = input.findInPage ?? [];
  if (!Array.isArray(findInPageValue) || findInPageValue.length > MAX_FIND_TERMS) {
    throw new VisitWebsiteError();
  }
  const findInPage: string[] = [];
  for (const term of findInPageValue) {
    if (
      typeof term !== 'string' ||
      term.trim().length === 0 ||
      term.trim().length > MAX_FIND_TERM_LENGTH
    ) {
      throw new VisitWebsiteError();
    }
    findInPage.push(term.trim());
  }
  return { url, findInPage };
}

function createVisitWebsiteRequestHeaders(
  browserProfile: VisitWebsiteBrowserProfile,
  url: URL,
): Record<string, string> {
  return {
    ...browserProfile.headers,
    Referer: `${url.origin}/`,
  };
}

function boundedText(values: string[], limit: number): string[] {
  return values
    .map((value) => normalizeText(value).slice(0, MAX_LABEL_LENGTH))
    .filter(Boolean)
    .slice(0, limit);
}

function targetedContent(content: string, terms: string[], limit: number): string {
  if (terms.length === 0) {
    return content.slice(0, limit).trim();
  }
  const lowerContent = content.toLowerCase();
  const snippets: string[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    const index = lowerContent.indexOf(term.toLowerCase());
    if (index === -1) {
      continue;
    }
    const start = Math.max(0, index - SNIPPET_CONTEXT_LENGTH);
    const end = Math.min(content.length, index + term.length + SNIPPET_CONTEXT_LENGTH);
    const snippet = content.slice(start, end).trim();
    if (!seen.has(snippet)) {
      seen.add(snippet);
      snippets.push(snippet);
    }
  }
  const result = snippets.join(' ... ');
  return (result || content).slice(0, limit).trim();
}

export function extractWebsiteContent(
  html: string,
  pageUrl: URL,
  settings: VisitWebsiteSettings,
  findInPage: string[] = [],
): VisitWebsiteResponse {
  const $ = load(html);
  $('script, style, noscript, template').remove();
  const title = normalizeText($('title').first().text()).slice(0, MAX_LABEL_LENGTH);
  const headings = {
    h1: normalizeText($('h1').first().text()).slice(0, MAX_LABEL_LENGTH),
    h2: boundedText($('h2').map((_index, element) => $(element).text()).get(), 20),
    h3: boundedText($('h3').map((_index, element) => $(element).text()).get(), 20),
  };
  const bodyText = normalizeText($('body').text());
  const links: WebsiteLink[] = [];
  const seenLinks = new Set<string>();
  if (settings.maxLinks > 0) {
    $('a[href]').each((_index, element) => {
      if (links.length >= settings.maxLinks) return;
      const url = parsePublicHttpUrl($(element).attr('href') ?? '', pageUrl);
      if (!url || seenLinks.has(url.toString())) return;
      seenLinks.add(url.toString());
      links.push({
        label: normalizeText($(element).text()).slice(0, MAX_LABEL_LENGTH),
        url: url.toString(),
      });
    });
  }
  const images: WebsiteImage[] = [];
  const seenImages = new Set<string>();
  if (settings.maxImages > 0) {
    $('img[src]').each((_index, element) => {
      if (images.length >= settings.maxImages) return;
      const url = parsePublicHttpUrl($(element).attr('src') ?? '', pageUrl);
      if (!url || seenImages.has(url.toString())) return;
      seenImages.add(url.toString());
      images.push({
        alt: normalizeText($(element).attr('alt') ?? '').slice(0, MAX_LABEL_LENGTH),
        url: url.toString(),
      });
    });
  }
  return {
    url: pageUrl.toString(),
    title,
    headings,
    content: targetedContent(bodyText, findInPage, settings.contentLimit),
    links,
    images,
  };
}

export class VisitWebsiteTool implements RegisteredTool {
  readonly name = VISIT_WEBSITE_TOOL_NAME;
  readonly displayName = 'Visit Website';
  readonly description = 'Reads bounded structured content from a specific public webpage.';
  readonly inputSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The absolute HTTP or HTTPS webpage URL.' },
      findInPage: {
        type: 'array',
        description: 'Optional terms to locate in the page.',
        items: { type: 'string' },
        maxItems: MAX_FIND_TERMS,
      },
    },
    required: ['url'],
    additionalProperties: false,
  };

  constructor(
    private readonly transport: WebsiteTransport = fetch,
    private readonly timeoutMs: number = REQUEST_TIMEOUT_MS,
    private readonly logger?: Pick<StructuredLogger, 'application'>,
    private readonly browserProfileSelector: VisitWebsiteBrowserProfileSelector = selectVisitWebsiteBrowserProfile,
  ) {}

  async execute(
    argumentsValue: unknown,
    settings: ToolSettings,
    signal?: AbortSignal,
  ): Promise<VisitWebsiteResponse> {
    const { url, findInPage } = parseArguments(argumentsValue);
    if (!('contentLimit' in settings)) {
      throw new VisitWebsiteError();
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
      const response = await this.transport(url.toString(), {
        method: 'GET',
        headers: createVisitWebsiteRequestHeaders(browserProfile, url),
        signal: controller.signal,
      });
      try {
        await this.logger?.application('debug', 'visit_website_response', {
          responseStatus: response.status ?? null,
          browserProfile: browserProfile.id,
        });
      } catch {
        // Logging failures must not replace the tool result.
      }
      if (!response.ok) {
        throw new RecoverableToolError(
          'WEBSITE_FETCH_FAILED',
          'Unable to retrieve the requested webpage.',
          response.status === undefined ? undefined : { status: response.status },
        );
      }
      const finalUrl = response.url ? parsePublicHttpUrl(response.url) : url;
      if (!finalUrl) {
        throw new RecoverableToolError(
          'WEBSITE_FETCH_FAILED',
          'Unable to retrieve the requested webpage.',
        );
      }
      const html = (await response.text()).slice(0, MAX_HTML_LENGTH);
      const result = extractWebsiteContent(html, finalUrl, settings, findInPage);
      if (
        result.title.length === 0 &&
        result.headings.h1.length === 0 &&
        result.headings.h2.length === 0 &&
        result.headings.h3.length === 0 &&
        result.content.length === 0
      ) {
        throw new RecoverableToolError(
          'WEBSITE_FETCH_FAILED',
          'Unable to retrieve the requested webpage.',
        );
      }
      return result;
    } catch (error) {
      if (error instanceof RecoverableToolError) throw error;
      throw new RecoverableToolError(
        'WEBSITE_FETCH_FAILED',
        'Unable to retrieve the requested webpage.',
        timedOut ? { reason: 'timeout' } : undefined,
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
}
