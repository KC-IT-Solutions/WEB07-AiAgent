import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  VISIT_WEBSITE_BROWSER_PROFILES,
  VisitWebsiteError,
  VisitWebsiteTool,
  extractWebsiteContent,
  type VisitWebsiteBrowserProfile,
  type WebsiteTransport,
} from '../../src/server/tools/visit-website-tool.js';
import { parseVisitWebsiteSettings } from '../../src/server/tool-types.js';
import { RecoverableToolError } from '../../src/server/tool-types.js';

const SETTINGS = {
  enabledForChat: true,
  contentLimit: 200,
  maxLinks: 2,
  maxImages: 1,
};

function getProfile(id: string): VisitWebsiteBrowserProfile {
  const profile = VISIT_WEBSITE_BROWSER_PROFILES.find((candidate) => candidate.id === id);
  assert.ok(profile);
  return profile;
}

function assertProfileHeaders(
  init: RequestInit,
  profile: VisitWebsiteBrowserProfile,
  referer: string,
): void {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(profile.headers)) {
    assert.equal(headers.get(name), value);
  }
  assert.equal(headers.get('Referer'), referer);
  assert.equal(headers.get('Origin'), null);
}

await describe('Visit Website tool', async () => {
  await it('defines a unique pool of coherent browser navigation profiles', () => {
    assert.ok(VISIT_WEBSITE_BROWSER_PROFILES.length >= 5);
    assert.ok(VISIT_WEBSITE_BROWSER_PROFILES.length <= 8);
    assert.equal(
      new Set(VISIT_WEBSITE_BROWSER_PROFILES.map((profile) => profile.id)).size,
      VISIT_WEBSITE_BROWSER_PROFILES.length,
    );

    const requiredHeaders = [
      'User-Agent',
      'Accept',
      'Accept-Language',
      'Accept-Encoding',
      'Connection',
      'Upgrade-Insecure-Requests',
      'Sec-Fetch-Dest',
      'Sec-Fetch-Mode',
      'Sec-Fetch-Site',
      'Sec-Fetch-User',
    ];
    for (const profile of VISIT_WEBSITE_BROWSER_PROFILES) {
      assert.match(profile.id, /^[a-z]+-[a-z]+$/);
      for (const header of requiredHeaders) {
        assert.ok(profile.headers[header]?.trim(), `${profile.id} is missing ${header}`);
      }
      const userAgent = profile.headers['User-Agent'] ?? '';
      if (profile.id.startsWith('firefox-')) {
        assert.match(userAgent, /Firefox\//);
        assert.doesNotMatch(userAgent, /AppleWebKit|Chrome\//);
      } else if (profile.id === 'safari-macos') {
        assert.match(userAgent, /Version\/.*Safari\//);
        assert.doesNotMatch(userAgent, /Chrome\//);
      } else {
        assert.match(userAgent, /AppleWebKit.*Chrome\//);
        assert.equal(userAgent.includes('Edg/'), profile.id === 'edge-windows');
      }
      assert.equal(profile.headers['sec-ch-ua'], undefined);
      assert.equal(profile.headers.Referer, undefined);
      assert.equal(profile.headers.Origin, undefined);
    }
  });

  await it('performs a controlled GET and extracts bounded structured content', async () => {
    let requestedUrl = '';
    let requestedInit: RequestInit = {};
    const diagnostics: Array<Record<string, unknown>> = [];
    const selectedProfile = getProfile('firefox-linux');
    const transport: WebsiteTransport = async (url, init) => {
      requestedUrl = url;
      requestedInit = init;
      return {
        ok: true,
        url: 'https://example.com/page',
        text: async () => `
          <html><head><title> Example title </title><style>.hidden {}</style></head>
          <body><h1>Main heading</h1><h2>First section</h2><h3>Detail</h3>
          <script>secretScript()</script><noscript>hidden fallback</noscript>
          <p>Alpha   beta and useful target information after extra whitespace.</p>
          <a href="/one"> One link </a><a href="https://example.com/one">Duplicate</a>
          <a href="https://two.example/path">Two</a><a href="https://three.example/path">Three</a>
          <a href="javascript:alert(1)">Unsafe</a>
          <img src="/image.png" alt=" Main image "><img src="https://two.example/image.png">
          </body></html>`,
      };
    };

    const result = await new VisitWebsiteTool(
      transport,
      undefined,
      {
        application: async (_level, _event, fields) => {
          diagnostics.push(fields ?? {});
        },
      },
      () => selectedProfile,
    ).execute(
      { url: 'https://example.com/page', findInPage: ['target'] },
      SETTINGS,
    );

    assert.equal(requestedUrl, 'https://example.com/page');
    assert.equal(requestedInit.method, 'GET');
    assertProfileHeaders(requestedInit, selectedProfile, 'https://example.com/');
    assert.equal(diagnostics[0]?.browserProfile, 'firefox-linux');
    assert.equal(result.title, 'Example title');
    assert.deepEqual(result.headings, {
      h1: 'Main heading',
      h2: ['First section'],
      h3: ['Detail'],
    });
    assert.match(result.content, /useful target information/);
    assert.ok(!result.content.includes('secretScript'));
    assert.ok(!result.content.includes('hidden fallback'));
    assert.ok(!result.content.includes('  '));
    assert.ok(result.content.length <= SETTINGS.contentLimit);
    assert.deepEqual(result.links, [
      { label: 'One link', url: 'https://example.com/one' },
      { label: 'Two', url: 'https://two.example/path' },
    ]);
    assert.deepEqual(result.images, [
      { alt: 'Main image', url: 'https://example.com/image.png' },
    ]);
  });

  await it('can select different profiles across executions and safely derives each referer', async () => {
    const requestInits: RequestInit[] = [];
    const selectedProfiles = [getProfile('chrome-windows'), getProfile('safari-macos')];
    let selectorCallCount = 0;
    const tool = new VisitWebsiteTool(
      async (url, init) => {
        requestInits.push(init);
        return { ok: true, url, text: async () => '<html><body>Readable page</body></html>' };
      },
      undefined,
      undefined,
      () => {
        const profile = selectedProfiles[selectorCallCount];
        selectorCallCount += 1;
        assert.ok(profile);
        return profile;
      },
    );

    await tool.execute(
      { url: 'https://example.com/article?next=%0D%0AX-Injected%3Ayes' },
      SETTINGS,
    );
    await tool.execute({ url: 'https://news.example.org/path?query=value' }, SETTINGS);

    assert.equal(selectorCallCount, 2);
    assertProfileHeaders(requestInits[0]!, selectedProfiles[0]!, 'https://example.com/');
    assertProfileHeaders(requestInits[1]!, selectedProfiles[1]!, 'https://news.example.org/');
    assert.doesNotMatch(
      new Headers(requestInits[0]!.headers).get('Referer') ?? '',
      /article|next|X-Injected|\r|\n/,
    );
  });

  await it('falls back to bounded leading content when terms do not match', () => {
    const result = extractWebsiteContent(
      `<body><p>${'word '.repeat(100)}</p></body>`,
      new URL('https://example.com/'),
      SETTINGS,
      ['missing'],
    );
    assert.ok(result.content.length > 0 && result.content.length <= SETTINGS.contentLimit);
  });

  await it('rejects malformed, unsafe, local, and unexpected arguments', async () => {
    const tool = new VisitWebsiteTool(async () => ({ ok: true, text: async () => '' }));
    for (const value of [
      { url: '' },
      { url: 'not a URL' },
      { url: 'file:///tmp/data' },
      { url: 'javascript:alert(1)' },
      { url: 'http://localhost/private' },
      { url: 'http://127.0.0.1/private' },
      { url: 'http://10.0.0.1/private' },
      { url: 'http://192.168.1.2/private' },
      { url: 'https://example.com', method: 'POST' },
      { url: 'https://example.com', findInPage: [''] },
      { url: 'https://example.com', findInPage: Array(11).fill('term') },
    ]) {
      await assert.rejects(() => tool.execute(value, SETTINGS), VisitWebsiteError);
    }
  });

  await it('turns non-OK, network, and timeout failures into controlled errors', async () => {
    const nonOk = new VisitWebsiteTool(async () => ({
      ok: false,
      status: 403,
      text: async () => '',
    }));
    const network = new VisitWebsiteTool(async () => {
      throw new Error('private transport detail');
    });
    const timeoutTransport: WebsiteTransport = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    await assert.rejects(() => nonOk.execute({ url: 'https://example.com' }, SETTINGS), {
      code: 'WEBSITE_FETCH_FAILED',
      safeMessage: 'Unable to retrieve the requested webpage.',
      metadata: { status: 403 },
    });
    await assert.rejects(() => network.execute({ url: 'https://example.com' }, SETTINGS), {
      code: 'WEBSITE_FETCH_FAILED',
      safeMessage: 'Unable to retrieve the requested webpage.',
    });
    await assert.rejects(
      () => new VisitWebsiteTool(timeoutTransport, 1).execute({ url: 'https://example.com' }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError &&
        error.code === 'WEBSITE_FETCH_FAILED' &&
        error.metadata?.reason === 'timeout',
    );
  });

  await it('propagates cancellation to the active request and stops processing', async () => {
    const controller = new AbortController();
    let requestWasAborted = false;
    const transport: WebsiteTransport = async (_url, init) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener(
          'abort',
          () => {
            requestWasAborted = true;
            reject(new Error('aborted'));
          },
          { once: true },
        );
      });
    };
    const visit = new VisitWebsiteTool(transport).execute(
      { url: 'https://example.com/' },
      SETTINGS,
      controller.signal,
    );

    controller.abort();
    await assert.rejects(visit, {
      code: 'WEBSITE_FETCH_FAILED',
      safeMessage: 'Unable to retrieve the requested webpage.',
    });
    assert.equal(requestWasAborted, true);
  });

  await it('classifies unreadable empty page content as recoverable', async () => {
    const tool = new VisitWebsiteTool(async () => ({
      ok: true,
      url: 'https://example.com/empty',
      text: async () => '<html><body><script>onlyScript()</script></body></html>',
    }));
    await assert.rejects(
      () => tool.execute({ url: 'https://example.com/empty' }, SETTINGS),
      (error: unknown) =>
        error instanceof RecoverableToolError && error.code === 'WEBSITE_FETCH_FAILED',
    );
  });

  await it('validates all persisted setting boundaries', () => {
    assert.deepEqual(parseVisitWebsiteSettings(SETTINGS), SETTINGS);
    for (const contentLimit of [199, 10_001, 1.5]) {
      assert.equal(parseVisitWebsiteSettings({ ...SETTINGS, contentLimit }), null);
    }
    for (const maxLinks of [-1, 41, 1.5]) {
      assert.equal(parseVisitWebsiteSettings({ ...SETTINGS, maxLinks }), null);
    }
    for (const maxImages of [-1, 21, 1.5]) {
      assert.equal(parseVisitWebsiteSettings({ ...SETTINGS, maxImages }), null);
    }
    assert.ok(parseVisitWebsiteSettings({ ...SETTINGS, contentLimit: 10_000, maxLinks: 0, maxImages: 0 }));
  });
});
