import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DUCKDUCKGO_BROWSER_PROFILES,
  DuckDuckGoRequestScheduler,
  DuckDuckGoSearchError,
  DuckDuckGoSearchTool,
  extractDuckDuckGoResults,
  type DuckDuckGoBrowserProfile,
  type SearchTransport,
} from '../../src/server/tools/duckduckgo-search-tool.js';
import { parseDuckDuckGoSettings } from '../../src/server/tool-types.js';
import { RecoverableToolError } from '../../src/server/tool-types.js';

const SETTINGS = {
  enabledForChat: true,
  pageSize: 2,
  safeSearch: 'moderate' as const,
  requestDelayMs: 0,
  cooldownAfter202Ms: 0,
};

function createFakeScheduler() {
  let currentTime = 0;
  const waits: number[] = [];
  const scheduler = new DuckDuckGoRequestScheduler(
    () => currentTime,
    async (delayMs, signal) => {
      signal?.throwIfAborted();
      waits.push(delayMs);
      currentTime += delayMs;
    },
  );
  return { scheduler, waits, now: () => currentTime };
}

function getProfile(id: string): DuckDuckGoBrowserProfile {
  const profile = DUCKDUCKGO_BROWSER_PROFILES.find((candidate) => candidate.id === id);
  assert.ok(profile);
  return profile;
}

function assertProfileHeaders(init: RequestInit, profile: DuckDuckGoBrowserProfile): void {
  const headers = new Headers(init.headers);
  assert.equal(headers.get('Content-Type'), 'application/x-www-form-urlencoded');
  for (const [name, value] of Object.entries(profile.headers)) {
    assert.equal(headers.get(name), value);
  }
}

await describe('DuckDuckGo search tool', async () => {
  await it('defines a unique pool of coherent browser navigation profiles', () => {
    assert.ok(DUCKDUCKGO_BROWSER_PROFILES.length >= 5);
    assert.ok(DUCKDUCKGO_BROWSER_PROFILES.length <= 8);
    assert.equal(
      new Set(DUCKDUCKGO_BROWSER_PROFILES.map((profile) => profile.id)).size,
      DUCKDUCKGO_BROWSER_PROFILES.length,
    );

    const requiredHeaders = [
      'User-Agent',
      'Accept',
      'Accept-Language',
      'Accept-Encoding',
      'Connection',
      'Referer',
      'Origin',
      'Upgrade-Insecure-Requests',
      'Sec-Fetch-Dest',
      'Sec-Fetch-Mode',
      'Sec-Fetch-Site',
      'Sec-Fetch-User',
    ];
    for (const profile of DUCKDUCKGO_BROWSER_PROFILES) {
      assert.match(profile.id, /^[a-z]+-[a-z]+$/);
      for (const header of requiredHeaders) {
        assert.ok(profile.headers[header]?.trim(), `${profile.id} is missing ${header}`);
      }
      assert.equal(profile.headers['sec-ch-ua'], undefined);
    }
  });

  await it('validates a query and returns bounded structured results', async () => {
    let requestBody = '';
    let requestUrl = '';
    let requestCount = 0;
    let requestInit: RequestInit | undefined;
    const diagnostics: Array<Record<string, unknown>> = [];
    const transport: SearchTransport = async (url, init) => {
      requestCount += 1;
      requestUrl = url;
      requestBody = String(init.body);
      requestInit = init;
      return {
        ok: true,
        text: async () => `
          <div class="result"><a class="result__a" href="https://one.example/a">One</a></div>
          <div class="result"><a class="result__a" href="https://two.example/b">Two</a></div>
          <div class="result"><a class="result__a" href="https://three.example/c">Three</a></div>`,
      };
    };

    const selectedProfile = getProfile('firefox-linux');
    const response = await new DuckDuckGoSearchTool(
      transport,
      undefined,
      {
        application: async (_level, _event, fields) => {
          diagnostics.push(fields ?? {});
        },
      },
      () => selectedProfile,
    ).execute({ query: '  typescript tools  ' }, SETTINGS);

    assert.equal(response.query, 'typescript tools');
    assert.equal(response.results.length, 2);
    assert.match(requestBody, /q=typescript\+tools/);
    assert.match(requestBody, /kp=-1/);
    assert.equal(requestUrl, 'https://html.duckduckgo.com/html/');
    assert.equal(requestCount, 1);
    assertProfileHeaders(requestInit!, selectedProfile);
    assert.equal(diagnostics[0]?.classification, 'VALID_RESULTS');
    assert.equal(diagnostics[0]?.fallbackUsed, false);
    assert.equal(diagnostics[0]?.browserProfile, 'firefox-linux');
    assert.equal(diagnostics[0]?.filteredAdCount, 0);
    assert.equal(diagnostics[0]?.filteredRedirectCount, 0);
    assert.equal(diagnostics[0]?.filteredInternalCount, 0);
    assert.equal(diagnostics[0]?.duplicateResultCount, 0);
  });

  await it('returns a successful empty result only for an explicit no-results page', async () => {
    let requestCount = 0;
    let selectorCallCount = 0;
    let requestInit: RequestInit | undefined;
    const diagnostics: Array<Record<string, unknown>> = [];
    const selectedProfile = getProfile('firefox-linux');
    const tool = new DuckDuckGoSearchTool(
      async (_url, init) => {
        requestCount += 1;
        requestInit = init;
        return {
          ok: true,
          status: 200,
          text: async () =>
            '<main><div id="links"><div class="no-results">No results.</div></div></main>',
        };
      },
      undefined,
      {
        application: async (_level, _event, fields) => {
          diagnostics.push(fields ?? {});
        },
      },
      () => {
        selectorCallCount += 1;
        return selectedProfile;
      },
    );

    assert.deepEqual(await tool.execute({ query: 'missing phrase' }, SETTINGS), {
      query: 'missing phrase',
      results: [],
    });
    assert.equal(requestCount, 1);
    assert.equal(selectorCallCount, 1);
    assertProfileHeaders(requestInit!, selectedProfile);
    assert.equal(diagnostics[0]?.classification, 'VALID_NO_RESULTS');
    assert.equal(diagnostics[0]?.recognizedNoResults, true);
    assert.equal(diagnostics[0]?.fallbackUsed, false);
    assert.equal(diagnostics[0]?.browserProfile, 'firefox-linux');
  });

  await it('uses one alternate DuckDuckGo request after an unusable response', async () => {
    const urls: string[] = [];
    const requestInits: RequestInit[] = [];
    const diagnostics: Array<Record<string, unknown>> = [];
    let selectorCallCount = 0;
    const selectedProfile = getProfile('chrome-windows');
    const challengeHtml = '<html><title>Challenge</title><p>raw-provider-secret</p></html>';
    const transport: SearchTransport = async (url, init) => {
      urls.push(url);
      requestInits.push(init);
      return urls.length === 1
        ? { ok: true, status: 200, text: async () => challengeHtml }
        : {
            ok: true,
            status: 200,
            text: async () =>
              '<div class="result"><a class="result__a" href="https://fallback.example/news">Fallback result</a></div>',
          };
    };
    const tool = new DuckDuckGoSearchTool(
      transport,
      undefined,
      {
        application: async (_level, _event, fields) => {
          diagnostics.push(fields ?? {});
        },
      },
      () => {
        selectorCallCount += 1;
        return selectedProfile;
      },
    );

    assert.deepEqual(await tool.execute({ query: 'fallback query' }, SETTINGS), {
      query: 'fallback query',
      results: [{ title: 'Fallback result', url: 'https://fallback.example/news' }],
    });
    assert.deepEqual(urls, ['https://html.duckduckgo.com/html/', 'https://duckduckgo.com/html/']);
    assert.equal(requestInits.length, 2);
    assert.equal(selectorCallCount, 1);
    assertProfileHeaders(requestInits[0]!, selectedProfile);
    assertProfileHeaders(requestInits[1]!, selectedProfile);
    assert.deepEqual(
      diagnostics.map((entry) => [entry.classification, entry.fallbackUsed, entry.browserProfile]),
      [
        ['UNUSABLE_RESPONSE', false, 'chrome-windows'],
        ['VALID_RESULTS', true, 'chrome-windows'],
      ],
    );
    assert.doesNotMatch(JSON.stringify(diagnostics), /raw-provider-secret|<html>/);
  });

  await it('paces fallback requests and applies the longer shared HTTP 202 cooldown', async () => {
    const fake = createFakeScheduler();
    const starts: number[] = [];
    let requestCount = 0;
    const tool = new DuckDuckGoSearchTool(
      async () => {
        starts.push(fake.now());
        requestCount += 1;
        return requestCount === 1
          ? { ok: true, status: 202, text: async () => '<html>challenge</html>' }
          : {
              ok: true,
              status: 200,
              text: async () =>
                '<div class="result"><a class="result__a" href="https://example.com/">Result</a></div>',
            };
      },
      undefined,
      undefined,
      undefined,
      fake.scheduler,
    );

    await tool.execute(
      { query: 'cooldown' },
      { ...SETTINGS, requestDelayMs: 1500, cooldownAfter202Ms: 8000 },
    );
    assert.deepEqual(starts, [0, 8000]);
    assert.deepEqual(fake.waits, [8000]);
  });

  await it('paces a fallback after an unusable non-202 response without adding cooldown', async () => {
    const fake = createFakeScheduler();
    const starts: number[] = [];
    let requestCount = 0;
    const tool = new DuckDuckGoSearchTool(
      async () => {
        starts.push(fake.now());
        requestCount += 1;
        return requestCount === 1
          ? { ok: true, status: 200, text: async () => '<html>challenge</html>' }
          : {
              ok: true,
              status: 200,
              text: async () =>
                '<div class="result"><a class="result__a" href="https://example.com/">Result</a></div>',
            };
      },
      undefined,
      undefined,
      undefined,
      fake.scheduler,
    );

    await tool.execute(
      { query: 'paced fallback' },
      { ...SETTINGS, requestDelayMs: 1500, cooldownAfter202Ms: 8000 },
    );
    assert.deepEqual(starts, [0, 1500]);
    assert.deepEqual(fake.waits, [1500]);
  });

  await it('shares normal pacing across independent tool executions and supports zero delay', async () => {
    const fake = createFakeScheduler();
    const pacedStarts: number[] = [];
    const transport: SearchTransport = async () => {
      pacedStarts.push(fake.now());
      return {
        ok: true,
        status: 200,
        text: async () =>
          '<div class="result"><a class="result__a" href="https://example.com/">Result</a></div>',
      };
    };
    const firstTool = new DuckDuckGoSearchTool(
      transport,
      undefined,
      undefined,
      undefined,
      fake.scheduler,
    );
    const secondTool = new DuckDuckGoSearchTool(
      transport,
      undefined,
      undefined,
      undefined,
      fake.scheduler,
    );
    await Promise.all([
      firstTool.execute({ query: 'first' }, { ...SETTINGS, requestDelayMs: 1500 }),
      secondTool.execute({ query: 'second' }, { ...SETTINGS, requestDelayMs: 1500 }),
    ]);
    assert.deepEqual(pacedStarts, [0, 1500]);

    const zeroFake = createFakeScheduler();
    const zeroStarts: number[] = [];
    const zeroTool = new DuckDuckGoSearchTool(
      async () => {
        zeroStarts.push(zeroFake.now());
        return {
          ok: true,
          status: 200,
          text: async () =>
            '<div class="result"><a class="result__a" href="https://example.com/">Result</a></div>',
        };
      },
      undefined,
      undefined,
      undefined,
      zeroFake.scheduler,
    );
    await zeroTool.execute({ query: 'zero one' }, SETTINGS);
    await zeroTool.execute({ query: 'zero two' }, SETTINGS);
    assert.deepEqual(zeroStarts, [0, 0]);
    assert.deepEqual(zeroFake.waits, []);
  });

  await it('applies an HTTP 202 cooldown globally to the next queued request', async () => {
    const fake = createFakeScheduler();
    const starts: number[] = [];
    await fake.scheduler.schedule(0, 8000, undefined, async () => {
      starts.push(fake.now());
      return { status: 202 };
    });
    await fake.scheduler.schedule(1500, 0, undefined, async () => {
      starts.push(fake.now());
      return { status: 200 };
    });
    assert.deepEqual(starts, [0, 8000]);
    assert.deepEqual(fake.waits, [8000]);
  });

  await it('aborts a queued request promptly without fetching and continues the queue', async () => {
    const scheduler = new DuckDuckGoRequestScheduler(
      () => 0,
      async () => undefined,
    );
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const first = scheduler.schedule(0, 0, undefined, async () => {
      markFirstStarted();
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      return { status: 200 };
    });
    await firstStarted;

    const controller = new AbortController();
    let abortedFetchCount = 0;
    const aborted = scheduler.schedule(1500, 0, controller.signal, async () => {
      abortedFetchCount += 1;
      return { status: 200 };
    });
    let laterFetchCount = 0;
    const later = scheduler.schedule(0, 0, undefined, async () => {
      laterFetchCount += 1;
      return { status: 200 };
    });
    controller.abort();
    await assert.rejects(aborted, { name: 'AbortError' });
    assert.equal(abortedFetchCount, 0);
    releaseFirst();
    await first;
    await later;
    assert.equal(abortedFetchCount, 0);
    assert.equal(laterFetchCount, 1);
  });

  await it('fails recoverably after exactly two unusable DuckDuckGo responses', async () => {
    let requestCount = 0;
    const requestInits: RequestInit[] = [];
    const diagnostics: Array<Record<string, unknown>> = [];
    let selectorCallCount = 0;
    const selectedProfile = getProfile('safari-macos');
    const tool = new DuckDuckGoSearchTool(
      async (_url, init) => {
        requestCount += 1;
        requestInits.push(init);
        return {
          ok: true,
          status: 200,
          text: async () => `<html><body>unusable-private-body-${requestCount}</body></html>`,
        };
      },
      undefined,
      {
        application: async (_level, _event, fields) => {
          diagnostics.push(fields ?? {});
        },
      },
      () => {
        selectorCallCount += 1;
        return selectedProfile;
      },
    );

    await assert.rejects(() => tool.execute({ query: 'ordinary query' }, SETTINGS), {
      code: 'SEARCH_RESPONSE_UNUSABLE',
      safeMessage: 'Search provider returned an unusable response.',
    });
    assert.equal(requestCount, 2);
    assert.equal(selectorCallCount, 1);
    assertProfileHeaders(requestInits[0]!, selectedProfile);
    assertProfileHeaders(requestInits[1]!, selectedProfile);
    assert.deepEqual(
      diagnostics.map((entry) => [entry.classification, entry.browserProfile]),
      [
        ['UNUSABLE_RESPONSE', 'safari-macos'],
        ['UNUSABLE_RESPONSE', 'safari-macos'],
      ],
    );
    assert.doesNotMatch(JSON.stringify(diagnostics), /unusable-private-body|<html>/);
  });

  await it('can select different profiles across executions while reusing each during fallback', async () => {
    const userAgents: Array<string | null> = [];
    const selectedProfiles = [getProfile('chrome-windows'), getProfile('firefox-linux')];
    let selectorCallCount = 0;
    let requestCount = 0;
    const transport: SearchTransport = async (_url, init) => {
      requestCount += 1;
      userAgents.push(new Headers(init.headers).get('User-Agent'));
      return {
        ok: true,
        text: async () =>
          requestCount % 2 === 1
            ? '<html><title>Challenge</title></html>'
            : '<div class="result"><a class="result__a" href="https://example.com/">Result</a></div>',
      };
    };
    const tool = new DuckDuckGoSearchTool(transport, undefined, undefined, () => {
      const selected = selectedProfiles[selectorCallCount];
      selectorCallCount += 1;
      assert.ok(selected);
      return selected;
    });

    await tool.execute({ query: 'first query' }, SETTINGS);
    await tool.execute({ query: 'second query' }, SETTINGS);

    assert.equal(selectorCallCount, 2);
    assert.deepEqual(userAgents, [
      selectedProfiles[0]!.headers['User-Agent'],
      selectedProfiles[0]!.headers['User-Agent'],
      selectedProfiles[1]!.headers['User-Agent'],
      selectedProfiles[1]!.headers['User-Agent'],
    ]);
  });

  await it('rejects empty, oversized, and unexpected query arguments', async () => {
    const tool = new DuckDuckGoSearchTool(async () => ({ ok: true, text: async () => '' }));
    await assert.rejects(() => tool.execute({ query: ' ' }, SETTINGS), DuckDuckGoSearchError);
    await assert.rejects(
      () => tool.execute({ query: 'ok', page: 1 }, SETTINGS),
      DuckDuckGoSearchError,
    );
  });

  await it('keeps organic results and unwraps DuckDuckGo redirects without filtering them', () => {
    const target = 'https://example.com/path?a=1';
    const html = `
      <div class="result"><a class="result__a" href="https://organic.example/article">Organic</a></div>
      <div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(target)}">Redirect</a></div>
    `;

    assert.deepEqual(extractDuckDuckGoResults(html, 10), [
      { title: 'Organic', url: 'https://organic.example/article' },
      { title: 'Redirect', url: target },
    ]);
  });

  await it('filters known ad markup, raw markers, and parsed ad destinations', async () => {
    const html = `
      <div class="result result--ad"><a class="result__a" href="https://ads.example/">Class ad</a></div>
      <div class="result"><a class="result__a" href="https://ads.example/?ad_provider=x">Provider ad</a></div>
      <div class="result"><a class="result__a" href="https://ads.example/?ad_domain=x">Domain ad</a></div>
      <div class="result"><a class="result__a" href="https://duckduckgo.com/y.js?ad=x">DDG ad</a></div>
      <div class="result"><a class="result__a" href="https://www.bing.com/aclick?id=1">Bing aclick</a></div>
      <div class="result"><a class="result__a" href="https://www.bing.com/alink?id=2">Bing alink</a></div>
      <div class="result"><a class="result__a" href="https://doubleclick.net/ad">DoubleClick</a></div>
      <div class="result"><a class="result__a" href="https://ad.doubleclick.net/ad">DoubleClick subdomain</a></div>
      <div class="result"><a class="result__a" href="https://googleadservices.com/pagead">Google ads</a></div>
      <div class="result"><a class="result__a" href="https://www.googleadservices.com/pagead">Google ads subdomain</a></div>
      <div class="result"><a class="result__a" href="https://organic.example/">Organic</a></div>`;
    const diagnostics: Array<Record<string, unknown>> = [];
    const response = await new DuckDuckGoSearchTool(
      async () => ({ ok: true, status: 200, text: async () => html }),
      undefined,
      {
        application: async (_level, _event, fields) => {
          diagnostics.push(fields ?? {});
        },
      },
    ).execute({ query: 'ads' }, { ...SETTINGS, pageSize: 10 });

    assert.deepEqual(response.results, [{ title: 'Organic', url: 'https://organic.example/' }]);
    assert.equal(diagnostics[0]?.filteredAdCount, 10);
    assert.equal(diagnostics[0]?.filteredRedirectCount, 0);
    assert.equal(diagnostics[0]?.filteredInternalCount, 0);
    assert.equal(diagnostics[0]?.duplicateResultCount, 0);
  });

  await it('unwraps generic and nested redirects with a hard maximum of three unwraps', async () => {
    const finalTarget = 'https://example.com/story';
    const wrap = (parameter: 'u' | 'url' | 'target', target: string): string =>
      `https://redirect.example/path?${parameter}=${encodeURIComponent(target)}`;
    const nestedTarget = 'https://nested.example/article';
    const depthTarget = 'https://depth.example/three';
    const nested = `//duckduckgo.com/l/?uddg=${encodeURIComponent(wrap('url', nestedTarget))}`;
    const threeWrappers = wrap('u', wrap('url', wrap('target', depthTarget)));
    const fourWrappers = wrap(
      'u',
      wrap('url', wrap('target', wrap('u', 'https://depth.example/four'))),
    );
    const html = `
      <div class="result"><a class="result__a" href="${wrap('url', finalTarget)}">URL</a></div>
      <div class="result"><a class="result__a" href="${wrap('u', 'https://example.com/u')}">U</a></div>
      <div class="result"><a class="result__a" href="${wrap('target', 'https://example.com/target')}">Target</a></div>
      <div class="result"><a class="result__a" href="${nested}">Nested</a></div>
      <div class="result"><a class="result__a" href="${threeWrappers}">Depth three</a></div>
      <div class="result"><a class="result__a" href="${fourWrappers}">Depth four</a></div>`;
    const diagnostics: Array<Record<string, unknown>> = [];
    const response = await new DuckDuckGoSearchTool(
      async () => ({ ok: true, status: 200, text: async () => html }),
      undefined,
      {
        application: async (_level, _event, fields) => {
          diagnostics.push(fields ?? {});
        },
      },
    ).execute({ query: 'redirects' }, { ...SETTINGS, pageSize: 10 });

    assert.deepEqual(response.results, [
      { title: 'URL', url: finalTarget },
      { title: 'U', url: 'https://example.com/u' },
      { title: 'Target', url: 'https://example.com/target' },
      { title: 'Nested', url: nestedTarget },
      { title: 'Depth three', url: depthTarget },
    ]);
    assert.equal(diagnostics[0]?.filteredRedirectCount, 1);
  });

  await it('rejects unsafe and malformed redirect targets without throwing', () => {
    const html = `
      <div class="result"><a class="result__a" href="https://redirect.example/?url=${encodeURIComponent('javascript:alert(1)')}">JavaScript</a></div>
      <div class="result"><a class="result__a" href="https://redirect.example/?target=${encodeURIComponent('file:///etc/passwd')}">File</a></div>
      <div class="result"><a class="result__a" href="https://redirect.example/?u=https%ZZ">Malformed</a></div>
      <div class="result"><a class="result__a" href="javascript:alert(1)">Direct unsafe</a></div>`;

    assert.deepEqual(extractDuckDuckGoResults(html, 10), []);
  });

  await it('deduplicates final targets and keeps the first accepted title and order', async () => {
    const target = 'https://example.com/article';
    const html = `
      <div class="result"><a class="result__a" href="${target}">First title</a></div>
      <div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(target)}">DDG duplicate</a></div>
      <div class="result"><a class="result__a" href="https://redirect.example/?url=${encodeURIComponent(target)}">Generic duplicate</a></div>
      <div class="result"><a class="result__a" href="https://example.org/second">Second</a></div>`;
    const diagnostics: Array<Record<string, unknown>> = [];
    const response = await new DuckDuckGoSearchTool(
      async () => ({ ok: true, status: 200, text: async () => html }),
      undefined,
      {
        application: async (_level, _event, fields) => {
          diagnostics.push(fields ?? {});
        },
      },
    ).execute({ query: 'duplicates' }, { ...SETTINGS, pageSize: 10 });

    assert.deepEqual(response.results, [
      { title: 'First title', url: target },
      { title: 'Second', url: 'https://example.org/second' },
    ]);
    assert.equal(diagnostics[0]?.duplicateResultCount, 2);
  });

  await it('logs exact bounded filtering diagnostics for a mixed result page', async () => {
    const target = 'https://example.com/one';
    const html = `
      <div class="result result--ad"><a class="result__a" href="https://ads.example/">Ad one</a></div>
      <div class="result"><a class="result__a" href="https://www.bing.com/aclick?id=2">Ad two</a></div>
      <div class="result"><a class="result__a" href="https://duckduckgo.com/settings">Internal</a></div>
      <div class="result"><a class="result__a" href="https://redirect.example/?url=https%ZZ">Malformed redirect</a></div>
      <div class="result"><a class="result__a" href="${target}">Organic one</a></div>
      <div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(target)}">Duplicate</a></div>
      <div class="result"><a class="result__a" href="https://example.org/two">Organic two</a></div>`;
    const diagnostics: Array<Record<string, unknown>> = [];
    const response = await new DuckDuckGoSearchTool(
      async () => ({ ok: true, status: 200, text: async () => html }),
      undefined,
      {
        application: async (_level, _event, fields) => {
          diagnostics.push(fields ?? {});
        },
      },
    ).execute({ query: 'mixed' }, { ...SETTINGS, pageSize: 10 });

    assert.deepEqual(response, {
      query: 'mixed',
      results: [
        { title: 'Organic one', url: target },
        { title: 'Organic two', url: 'https://example.org/two' },
      ],
    });
    assert.deepEqual(
      {
        filteredAdCount: diagnostics[0]?.filteredAdCount,
        filteredRedirectCount: diagnostics[0]?.filteredRedirectCount,
        filteredInternalCount: diagnostics[0]?.filteredInternalCount,
        duplicateResultCount: diagnostics[0]?.duplicateResultCount,
      },
      {
        filteredAdCount: 2,
        filteredRedirectCount: 1,
        filteredInternalCount: 1,
        duplicateResultCount: 1,
      },
    );
    assert.doesNotMatch(
      JSON.stringify(diagnostics),
      /ads\.example|bing\.com|redirect\.example|<div/,
    );
  });

  await it('keeps all-filtered markup unusable and logs attempts independently', async () => {
    const diagnostics: Array<Record<string, unknown>> = [];
    let requestCount = 0;
    const tool = new DuckDuckGoSearchTool(
      async () => {
        requestCount += 1;
        return {
          ok: true,
          status: 200,
          text: async () =>
            requestCount === 1
              ? `<div class="result result--ad"><a class="result__a" href="https://ads.example/">Ad</a></div>
                 <div class="result"><a class="result__a" href="https://duckduckgo.com/settings">Internal</a></div>`
              : `<div class="result"><a class="result__a" href="https://redirect.example/?url=https%ZZ">Malformed</a></div>
                 <div class="result"><a class="result__a" href="https://example.com/fallback">Fallback</a></div>`,
        };
      },
      undefined,
      {
        application: async (_level, _event, fields) => {
          diagnostics.push(fields ?? {});
        },
      },
    );

    assert.deepEqual(await tool.execute({ query: 'filtered fallback' }, SETTINGS), {
      query: 'filtered fallback',
      results: [{ title: 'Fallback', url: 'https://example.com/fallback' }],
    });
    assert.deepEqual(
      diagnostics.map((entry) => ({
        classification: entry.classification,
        fallbackUsed: entry.fallbackUsed,
        filteredAdCount: entry.filteredAdCount,
        filteredRedirectCount: entry.filteredRedirectCount,
        filteredInternalCount: entry.filteredInternalCount,
        duplicateResultCount: entry.duplicateResultCount,
      })),
      [
        {
          classification: 'UNUSABLE_RESPONSE',
          fallbackUsed: false,
          filteredAdCount: 1,
          filteredRedirectCount: 0,
          filteredInternalCount: 1,
          duplicateResultCount: 0,
        },
        {
          classification: 'VALID_RESULTS',
          fallbackUsed: true,
          filteredAdCount: 0,
          filteredRedirectCount: 1,
          filteredInternalCount: 0,
          duplicateResultCount: 0,
        },
      ],
    );
  });

  await it('turns non-OK and network failures into controlled errors', async () => {
    const nonOk = new DuckDuckGoSearchTool(async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    }));
    const network = new DuckDuckGoSearchTool(async () => {
      throw new Error('private network detail');
    });
    await assert.rejects(() => nonOk.execute({ query: 'test' }, SETTINGS), {
      code: 'WEB_SEARCH_FAILED',
      safeMessage: 'Unable to complete the web search.',
      metadata: { status: 503 },
    });
    await assert.rejects(() => network.execute({ query: 'test' }, SETTINGS), {
      code: 'WEB_SEARCH_FAILED',
      safeMessage: 'Unable to complete the web search.',
    });
  });

  await it('aborts a timed-out transport with a controlled error', async () => {
    const transport: SearchTransport = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    const tool = new DuckDuckGoSearchTool(transport, 1);
    await assert.rejects(
      () => tool.execute({ query: 'timeout' }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError &&
        error.code === 'WEB_SEARCH_FAILED' &&
        error.metadata?.reason === 'timeout',
    );
  });

  await it('validates page size and safe search settings boundaries', () => {
    assert.deepEqual(parseDuckDuckGoSettings(SETTINGS), SETTINGS);
    for (const pageSize of [0, 11, 1.5]) {
      assert.equal(parseDuckDuckGoSettings({ ...SETTINGS, pageSize }), null);
    }
    assert.equal(parseDuckDuckGoSettings({ ...SETTINGS, safeSearch: 'unsafe' }), null);
    for (const safeSearch of ['strict', 'moderate', 'off']) {
      assert.ok(parseDuckDuckGoSettings({ ...SETTINGS, safeSearch }));
    }
    for (const value of [0, 1, 1500, 8000]) {
      assert.ok(parseDuckDuckGoSettings({ ...SETTINGS, requestDelayMs: value }));
      assert.ok(parseDuckDuckGoSettings({ ...SETTINGS, cooldownAfter202Ms: value }));
    }
    for (const value of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1500', null]) {
      assert.equal(parseDuckDuckGoSettings({ ...SETTINGS, requestDelayMs: value }), null);
      assert.equal(parseDuckDuckGoSettings({ ...SETTINGS, cooldownAfter202Ms: value }), null);
    }
    assert.deepEqual(
      parseDuckDuckGoSettings({
        enabledForChat: true,
        pageSize: 2,
        safeSearch: 'moderate',
      }),
      { ...SETTINGS, requestDelayMs: 1500, cooldownAfter202Ms: 8000 },
    );
  });
});
