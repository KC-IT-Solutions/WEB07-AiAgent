import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const APP_ORIGIN = 'http://chat.test';
const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
};

function streamEvents(inferenceId: string, suffix: string): string {
  const markdown = [
    `## Response ${suffix}`,
    '',
    '| A | B |',
    '|---|---|',
    `| **C ${suffix}** | ${`${suffix} wide content `.repeat(30)} |`,
    '',
    'This is **important**.',
    '',
    '[safe](https://example.com) [bad](javascript:alert(1))',
    '',
    '<script>window.markdownScriptExecuted = true</script>',
    '',
    `${suffix} content `.repeat(120),
  ].join('\n');
  if (suffix === '3') {
    return [
      {
        type: 'assistant',
        sequence: 1,
        inferenceId,
        event: { type: 'assistant', content: markdown, createdAt: 5 },
        final: true,
      },
      { type: 'done', sequence: 2, inferenceId },
    ]
      .map((event) => JSON.stringify(event))
      .join('\n');
  }

  return [
    {
      type: 'reasoning',
      sequence: 1,
      inferenceId,
      event: { type: 'reasoning', content: `Reasoning ${suffix}`.repeat(20), createdAt: 2 },
      final: false,
    },
    {
      type: 'tool_call',
      sequence: 2,
      inferenceId,
      event: {
        type: 'tool_call',
        toolCallId: `call-${suffix}`,
        toolName: 'browser_test',
        arguments: { query: suffix.repeat(100) },
        createdAt: 3,
      },
      final: false,
    },
    {
      type: 'tool_result',
      sequence: 3,
      inferenceId,
      event: {
        type: 'tool_result',
        toolCallId: `call-${suffix}`,
        toolName: 'browser_test',
        result: { text: suffix.repeat(200) },
        success: true,
        createdAt: 4,
      },
      final: false,
    },
    {
      type: 'assistant',
      sequence: 4,
      inferenceId,
      event: {
        type: 'assistant',
        content: markdown,
        createdAt: 5,
      },
      final: true,
    },
    { type: 'done', sequence: 5, inferenceId },
  ]
    .map((event) => JSON.stringify(event))
    .join('\n');
}

test('Chat owns runtime scrolling and preserves autoscroll intent', async ({ page }) => {
  test.setTimeout(20_000);
  await page.setViewportSize({ width: 900, height: 600 });

  const pendingStreams: Array<() => void> = [];
  let streamCount = 0;
  const historyMessages = Array.from({ length: 36 }, (_, index) => ({
    type: index % 2 === 0 ? 'user' : 'assistant',
    content: `History message ${index}: ${'tall browser content '.repeat(18)}`,
    createdAt: index + 1,
  }));
  historyMessages.push({
    type: 'assistant',
    content: '| History A | History B |\n|---|---|\n| **History C** | History D |',
    createdAt: 37,
  });

  await page.route(`${APP_ORIGIN}/**`, async (route) => {
    const requestUrl = new URL(route.request().url());
    const { pathname } = requestUrl;

    if (pathname === '/api/chats') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            createdAt: 1,
            updatedAt: 1,
            data: { title: 'Runtime scroll chat', modelConnectionId: null, modelId: null },
          },
        ]),
      });
      return;
    }
    if (pathname === '/api/me') {
      await route.fulfill({ contentType: 'application/json', body: '{"isAdmin":false}' });
      return;
    }
    if (pathname === '/api/chats/1/messages') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ messages: historyMessages }),
      });
      return;
    }
    if (pathname === '/api/settings/chat') {
      await route.fulfill({
        contentType: 'application/json',
        body: '{"showReasoning":true,"showToolCalls":true}',
      });
      return;
    }
    if (pathname === '/api/model-connections') {
      await route.fulfill({ contentType: 'application/json', body: '[]' });
      return;
    }
    if (pathname === '/api/chats/1/inference/stream') {
      streamCount += 1;
      await new Promise<void>((release) => pendingStreams.push(release));
      await route.fulfill({
        contentType: 'application/x-ndjson',
        body:
          streamCount === 4
            ? JSON.stringify({
                type: 'error',
                sequence: 1,
                inferenceId: 'inference-4',
                error: 'Controlled browser test failure',
              })
            : streamEvents(`inference-${streamCount}`, String(streamCount)),
      });
      return;
    }

    const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
    const filePath = resolve('dist/client', relativePath);
    await route.fulfill({
      contentType: MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
      body: await readFile(filePath),
    });
  });

  await page.goto(APP_ORIGIN);
  await page.getByRole('button', { name: 'Toggle saved chats' }).click();
  await page.getByRole('button', { name: /Runtime scroll chat/ }).click();
  await expect(page.getByTestId('message-input')).toBeEnabled();
  await expect(page.getByText(/History message 35:/)).toBeVisible();
  const historyTable = page.getByRole('table').filter({ hasText: 'History A' });
  await expect(historyTable).toBeVisible();
  await expect(historyTable.getByRole('columnheader', { name: 'History A' })).toBeVisible();
  await expect(historyTable.getByText('History C', { exact: true })).toHaveCSS(
    'font-weight',
    '700',
  );

  const messageArea = page.getByTestId('message-area');
  const scrollAnchor = page.getByTestId('chat-scroll-anchor');
  await expect
    .poll(() =>
      messageArea.evaluate(
        (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThanOrEqual(1);

  const initialMetrics = await messageArea.evaluate((element) => ({
    clientHeight: element.clientHeight,
    minHeight: getComputedStyle(element).minHeight,
    overflowAnchor: getComputedStyle(element).overflowAnchor,
    overflowY: getComputedStyle(element).overflowY,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
  const mainMetrics = await page.locator('main').evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(initialMetrics.minHeight).toBe('0px');
  expect(initialMetrics.overflowAnchor).toBe('none');
  expect(initialMetrics.overflowY).toBe('auto');
  expect(initialMetrics.scrollHeight).toBeGreaterThan(initialMetrics.clientHeight);
  expect(initialMetrics.scrollHeight - initialMetrics.clientHeight - initialMetrics.scrollTop).toBeLessThanOrEqual(1);
  expect(mainMetrics.scrollHeight - mainMetrics.clientHeight).toBeLessThanOrEqual(1);
  expect(await messageArea.evaluate((element) => element.lastElementChild?.className)).toBe('chat-scroll-anchor');
  await expect(scrollAnchor).toBeAttached();

  await messageArea.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.getByTestId('message-input').fill('Local send forces latest');
  await page.getByTestId('send-button').click();
  await expect.poll(() => pendingStreams.length).toBe(1);
  await expect(page.getByRole('status', { name: 'Thinking' })).toBeVisible();
  await expect
    .poll(() =>
      messageArea.evaluate(
        (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThanOrEqual(1);

  pendingStreams.shift()?.();
  await expect(page.getByText('Response 1')).toBeVisible();
  await expect(page.getByText('Reasoning', { exact: true })).toBeVisible();
  await expect(page.getByText('Tool: browser_test', { exact: true })).toBeVisible();
  await expect(page.getByText('Tool result: browser_test', { exact: true })).toBeVisible();
  const toolRoundResponse = page.locator('.chat-assistant-message').filter({ hasText: 'Response 1' });
  await expect(toolRoundResponse.getByRole('table')).toBeVisible();
  await expect(toolRoundResponse.getByText('C 1', { exact: true })).toHaveCSS(
    'font-weight',
    '700',
  );
  await expect(toolRoundResponse.getByText('important', { exact: true })).toHaveCSS(
    'font-weight',
    '700',
  );
  const safeLink = toolRoundResponse.getByRole('link', { name: 'safe' });
  await expect(safeLink).toHaveAttribute('href', 'https://example.com');
  await expect(safeLink).toHaveAttribute('target', '_blank');
  await expect(safeLink).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(toolRoundResponse.getByRole('link', { name: 'bad' })).toHaveCount(0);
  await expect(toolRoundResponse.locator('script')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, 'markdownScriptExecuted'))).toBeUndefined();
  await expect
    .poll(() =>
      messageArea.evaluate(
        (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThanOrEqual(1);

  await page.getByTestId('message-input').fill('Manual reading position is preserved');
  await page.getByTestId('send-button').click();
  await expect.poll(() => pendingStreams.length).toBe(1);
  await expect
    .poll(() =>
      messageArea.evaluate(
        (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThanOrEqual(1);
  await messageArea.evaluate((element) => {
    element.scrollTop = 0;
  });
  pendingStreams.shift()?.();
  await expect(page.getByText('Response 2')).toBeVisible();
  const scrolledUpMetrics = await messageArea.evaluate((element) => ({
    distanceFromBottom: element.scrollHeight - element.clientHeight - element.scrollTop,
    scrollTop: element.scrollTop,
  }));
  expect(scrolledUpMetrics.distanceFromBottom).toBeGreaterThan(96);
  expect(scrolledUpMetrics.scrollTop).toBeLessThanOrEqual(1);

  await page.getByTestId('message-input').fill('Returning near bottom resumes following');
  await page.getByTestId('send-button').click();
  await expect.poll(() => pendingStreams.length).toBe(1);
  await expect
    .poll(() =>
      messageArea.evaluate(
        (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThanOrEqual(1);
  await messageArea.evaluate((element) => {
    element.scrollTop = element.scrollHeight - element.clientHeight - 48;
  });
  pendingStreams.shift()?.();
  await expect(page.getByText('Response 3')).toBeVisible();
  const directResponse = page.locator('.chat-assistant-message').filter({ hasText: 'Response 3' });
  await expect(directResponse.getByRole('table')).toBeVisible();
  const layoutMetrics = await directResponse.evaluate((element) => {
    const tableContainer = element.querySelector('.chat-markdown-table');
    return {
      assistantWidth: element.getBoundingClientRect().width,
      messageAreaWidth: element.parentElement?.getBoundingClientRect().width ?? 0,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      tableScrollable: (tableContainer?.scrollWidth ?? 0) >= (tableContainer?.clientWidth ?? 0),
    };
  });
  expect(layoutMetrics.assistantWidth).toBeLessThanOrEqual(layoutMetrics.messageAreaWidth);
  expect(layoutMetrics.pageOverflow).toBeLessThanOrEqual(1);
  expect(layoutMetrics.tableScrollable).toBe(true);
  await expect
    .poll(() =>
      messageArea.evaluate(
        (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThanOrEqual(1);

  await page.getByTestId('message-input').fill('Visible error follows latest');
  await page.getByTestId('send-button').click();
  await expect.poll(() => pendingStreams.length).toBe(1);
  pendingStreams.shift()?.();
  await expect(page.getByText(/Unable to get a response\./)).toBeVisible();
  await expect
    .poll(() =>
      messageArea.evaluate(
        (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThanOrEqual(1);
});
