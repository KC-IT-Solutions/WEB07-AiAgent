import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAssistantMarkdown, safeLinkHref, type MarkdownNode } from '../MarkdownRenderer.js';
import {
  CHAT_NEAR_BOTTOM_THRESHOLD,
  getChatCommand,
  getToolFailureMessage,
  isChatNearBottom,
  isSlashCommand,
  parseChatCommandResult,
  parseChatHistory,
  parseInferenceStreamEvent,
} from '../ChatView.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findProjectRoot(startDir: string): string | null {
  let current = startDir;
  while (current !== dirname(current)) {
    if (existsSync(resolve(current, 'package.json'))) {
      return current;
    }
    current = dirname(current);
  }
  return null;
}

await describe('ChatView', async () => {
  const projectRoot = findProjectRoot(__dirname);
  assert.ok(projectRoot, 'Project root should be found');

  const chatViewPath = resolve(projectRoot, 'src/client/components/chat/ChatView.ts');
  const chatCssPath = resolve(projectRoot, 'src/client/components/chat/chat.css');
  const markdownRendererPath = resolve(
    projectRoot,
    'src/client/components/chat/MarkdownRenderer.ts',
  );
  const content = readFileSync(chatViewPath, 'utf-8');
  const chatCss = readFileSync(chatCssPath, 'utf-8');
  const markdownRenderer = readFileSync(markdownRendererPath, 'utf-8');

  function childTypes(node: MarkdownNode): string[] {
    return 'children' in node ? node.children.map((child) => child.type) : [];
  }

  function extractSection(startMarker: string, endMarker: string): string {
    const start = content.indexOf(startMarker);
    assert.notStrictEqual(start, -1, `Marker should exist: ${startMarker}`);
    const end = content.indexOf(endMarker, start);
    assert.ok(end > start, `Marker should exist after previous marker: ${endMarker}`);
    return content.substring(start, end);
  }

  await it('should have a valid component file exporting createChatView', () => {
    assert.ok(content.includes('export function createChatView'));
  });

  await it('should keep user messages as plain text', () => {
    assert.ok(content.includes('textContent'), 'Must use textContent for rendering user messages');
    assert.ok(!content.includes('innerHTML'), 'Must not use innerHTML for rendering user messages');
    assert.ok(content.includes("if (role === 'assistant')"));
    assert.ok(content.includes('messageDiv.appendChild(createAssistantMarkdown(text))'));
    assert.ok(content.includes('messageText.textContent = text'));
  });

  await it('should validate persisted history and preserve conversation order', () => {
    const messages = parseChatHistory({
      messages: [
        { type: 'user', content: 'First', createdAt: 123 },
        { type: 'reasoning', content: 'Between', createdAt: 123 },
        { type: 'assistant', content: '**Second**', createdAt: 124 },
      ],
    });

    assert.deepEqual(messages, [
      { type: 'user', content: 'First', createdAt: 123 },
      { type: 'reasoning', content: 'Between', createdAt: 123 },
      { type: 'assistant', content: '**Second**', createdAt: 124 },
    ]);
  });

  await it('should accept an empty persisted history without fake messages', () => {
    assert.deepEqual(parseChatHistory({ messages: [] }), []);
  });

  await it('recognizes only exact trimmed context commands', () => {
    assert.equal(getChatCommand('/clear'), 'clear');
    assert.equal(getChatCommand('  /clear\n'), 'clear');
    assert.equal(getChatCommand('/new'), 'new');
    assert.equal(getChatCommand('\t/new '), 'new');
    for (const text of ['hello /clear', '/clear please', '/new project', '/newer']) {
      assert.equal(getChatCommand(text), null);
    }
  });

  await it('routes every slash-prefixed input locally and validates command results', () => {
    for (const text of ['/skills', '  /news-compiler', '/test', '/clear please']) {
      assert.equal(isSlashCommand(text), true);
    }
    assert.equal(isSlashCommand('Compare price/performance'), false);
    assert.deepEqual(
      parseChatCommandResult({
        type: 'command_result',
        command: 'skills',
        message: 'No skills active in this chat.',
      }),
      {
        type: 'command_result',
        command: 'skills',
        message: 'No skills active in this chat.',
      },
    );
    assert.equal(parseChatCommandResult({ type: 'assistant', message: 'fake' }), null);
  });

  await it('handles commands before rendering or posting normal inference', () => {
    const inputSection = extractSection('function createInputArea', 'async function loadChatHistory');
    const commandPosition = inputSection.indexOf('if (isSlashCommand(text))');
    const userPosition = inputSection.indexOf("createMessageElement(text, 'user')");
    const inferencePosition = inputSection.indexOf('sendToApi(activeChat.id, text,');
    assert.ok(commandPosition !== -1 && commandPosition < userPosition);
    assert.ok(commandPosition < inferencePosition);
    assert.ok(inputSection.includes('sendCommandToApi(activeChat.id, text)'));
    assert.ok(inputSection.includes('await createNewChat()'));
    assert.ok(inputSection.includes('messageArea.replaceChildren(scrollAnchor)'));
    assert.ok(inputSection.includes("createMessageElement(result.message, 'command')"));
    assert.ok(!inputSection.substring(commandPosition, userPosition).includes('chat-thinking-indicator'));
  });

  await it('should reject malformed persisted history safely', () => {
    const malformedPayloads: unknown[] = [
      null,
      [],
      {},
      { messages: null },
      { messages: [null] },
      { messages: [{ role: 'system', content: 'Hidden', createdAt: 1 }] },
      { messages: [{ role: 'user', content: 1, createdAt: 1 }] },
      { messages: [{ role: 'assistant', content: 'Reply', createdAt: 1.5 }] },
    ];

    for (const payload of malformedPayloads) {
      assert.equal(parseChatHistory(payload), null);
    }
  });

  await it('validates bounded structured inference stream events', () => {
    const reasoning = parseInferenceStreamEvent({
      type: 'reasoning',
      sequence: 1,
      inferenceId: 'inference-1',
      event: { type: 'reasoning', content: 'Reasoning', createdAt: 1 },
      final: false,
    });
    const done = parseInferenceStreamEvent({
      type: 'done',
      sequence: 2,
      inferenceId: 'inference-1',
    });
    assert.equal(reasoning?.type, 'reasoning');
    assert.equal(reasoning?.sequence, 1);
    assert.deepEqual(done, { type: 'done', sequence: 2, inferenceId: 'inference-1' });

    for (const malformed of [
      { type: 'done', sequence: 0, inferenceId: 'x' },
      { type: 'done', sequence: 1, inferenceId: '' },
      {
        type: 'tool_call',
        sequence: 1,
        inferenceId: 'x',
        event: { type: 'reasoning', content: 'wrong type', createdAt: 1 },
        final: false,
      },
      {
        type: 'reasoning',
        sequence: 1,
        inferenceId: 'x',
        event: { type: 'reasoning', content: 'not final', createdAt: 1 },
        final: true,
      },
      { type: 'error', sequence: 1, inferenceId: 'x', error: '' },
    ]) {
      assert.equal(parseInferenceStreamEvent(malformed), null);
    }
  });

  await it('renders a bounded recoverable tool failure as understandable activity', () => {
    const failureResult = {
      success: false,
      error: {
        code: 'WEBSITE_FETCH_FAILED',
        message: 'Unable to retrieve the requested webpage.',
        status: 403,
      },
    };
    assert.equal(
      getToolFailureMessage(failureResult),
      'Unable to retrieve the requested webpage.',
    );
    assert.equal(getToolFailureMessage({ error: { code: 'FAILED' } }), 'The tool could not complete the request.');
    assert.ok(content.includes('failure.textContent = `Failed: ${getToolFailureMessage(event.result)}`'));
    assert.ok(content.includes("activity.className = 'chat-activity-event chat-activity-sand'"));
    assert.ok(!content.includes("createMessageElement(getToolFailureMessage(event.result), 'error')"));
  });

  await it('should load persisted messages through the existing rendering paths', () => {
    const historySection = extractSection('async function loadChatHistory', 'export function createChatView');
    assert.ok(historySection.includes('`/api/chats/${activeChat.id}/messages`'));
    assert.ok(historySection.includes('parseChatHistory(await response.json())'));
    assert.ok(
      historySection.includes('renderEvent(event, true)'),
      'Persisted events should use the shared lazy event renderer',
    );
    assert.ok(content.includes("messageDiv.appendChild(createAssistantMarkdown(text))"));
    assert.ok(content.includes('messageText.textContent = text'));
    assert.ok(!historySection.includes('createdAt'));
  });

  await it('scrolls initially rendered persisted history to the bottom', () => {
    const historySection = extractSection('async function loadChatHistory', 'export function createChatView');
    assert.ok(historySection.includes('scroller.updateContent('));
    assert.ok(historySection.includes('messageArea.replaceChildren('));
    assert.ok(historySection.includes('scrollAnchor,'));
    assert.ok(historySection.includes('true,'));
  });

  await it('uses one stale-safe animation frame to scroll the persistent bottom anchor', () => {
    const scrollHelper = extractSection('function createChatScroller', 'export interface ChatViewChat');
    const mainContentStyles = chatCss.substring(
      chatCss.indexOf('.chat-main-content {'),
      chatCss.indexOf('.chat-view-container {'),
    );
    const messageAreaStyles = chatCss.substring(
      chatCss.indexOf('.chat-message-area {'),
      chatCss.indexOf('.chat-user-message {'),
    );

    assert.ok(scrollHelper.includes('pendingFrame !== null'));
    assert.ok(scrollHelper.includes('pendingFrame = requestAnimationFrame('));
    assert.ok(scrollHelper.includes('!messageArea.isConnected'));
    assert.ok(scrollHelper.includes('!isCurrentView()'));
    assert.ok(scrollHelper.includes("scrollAnchor.scrollIntoView({ block: 'end', behavior: 'auto' })"));
    assert.ok(!scrollHelper.includes('scrollTop ='));
    assert.ok(mainContentStyles.includes('min-height: 0'));
    assert.ok(messageAreaStyles.includes('min-height: 0'));
    assert.ok(messageAreaStyles.includes('overflow-y: auto'));
    assert.ok(messageAreaStyles.includes('overflow-anchor: none'));
  });

  await it('captures passive follow intent before content mutation', () => {
    const scrollHelper = extractSection('function createChatScroller', 'export interface ChatViewChat');
    const intentPosition = scrollHelper.indexOf('const shouldFollow =');
    const updatePosition = scrollHelper.indexOf('update();');
    const schedulePosition = scrollHelper.indexOf('scheduleScrollToAnchor(forceScroll, previousScrollTop)');
    assert.ok(intentPosition !== -1 && intentPosition < updatePosition);
    assert.ok(updatePosition < schedulePosition);
    assert.ok(scrollHelper.includes('Math.abs(messageArea.scrollTop - scrollTopBeforeUpdate)'));
    assert.ok(scrollHelper.includes('!isChatNearBottom(messageArea)'));
  });

  await it('uses an inclusive deterministic near-bottom threshold', () => {
    const scrollContainer = { scrollHeight: 1_000, scrollTop: 0, clientHeight: 500 };
    scrollContainer.scrollTop =
      scrollContainer.scrollHeight - scrollContainer.clientHeight - CHAT_NEAR_BOTTOM_THRESHOLD;
    assert.equal(isChatNearBottom(scrollContainer), true);

    scrollContainer.scrollTop -= 1;
    assert.equal(isChatNearBottom(scrollContainer), false);
  });

  await it('forces a local user submission to the latest content', () => {
    const inputSection = extractSection('function createInputArea', 'async function loadChatHistory');
    const userAppend = inputSection.indexOf('scrollAnchor.before(userMessage)');
    const forcedUpdate = inputSection.lastIndexOf('scroller.updateContent(', userAppend);
    assert.ok(forcedUpdate !== -1 && forcedUpdate < userAppend);
    assert.ok(inputSection.substring(userAppend, userAppend + 160).includes('true,'));
  });

  await it('should show safe history loading and failure states', () => {
    const historySection = extractSection('async function loadChatHistory', 'export function createChatView');
    assert.ok(historySection.includes("historyStatus.textContent = 'Loading chat history...'"));
    assert.ok(historySection.includes("historyStatus.setAttribute('role', 'alert')"));
    assert.ok(historySection.includes("historyStatus.textContent = 'Failed to load chat history.'"));
    assert.ok(!historySection.includes('chat-thinking-indicator'));
  });

  await it('should ignore stale history and clear the loading view before rendering current messages', () => {
    const historySection = extractSection('async function loadChatHistory', 'export function createChatView');
    const activeCheck = historySection.indexOf('if (isActiveChat && !isActiveChat(activeChat.id))');
    const renderMessages = historySection.indexOf('messageArea.replaceChildren(');
    assert.ok(activeCheck !== -1 && activeCheck < renderMessages);
    assert.ok(historySection.includes('...messages.flatMap'));
  });

  await it('should render assistant paragraphs', () => {
    const nodes = parseAssistantMarkdown('A plain paragraph.');
    assert.deepEqual(
      nodes.map((node) => node.type),
      ['paragraph'],
    );
    assert.deepEqual(childTypes(nodes[0]), ['text']);
  });

  await it('should render headings', () => {
    assert.deepEqual(parseAssistantMarkdown('## Heading')[0], {
      type: 'heading',
      level: 2,
      children: [{ type: 'text', text: 'Heading' }],
    });
  });

  await it('should render ordinary bold text', () => {
    const paragraph = parseAssistantMarkdown('This is **important**.')[0];
    assert.ok(childTypes(paragraph).includes('strong'));
  });

  await it('should render GFM tables with inline Markdown in cells', () => {
    const nodes = parseAssistantMarkdown('| A | B |\n|---|---|\n| **C** | D |');
    assert.equal(nodes.length, 1);
    const table = nodes[0];
    assert.equal(table.type, 'table');
    assert.ok(table.type === 'table');
    assert.equal(table.header.type, 'tableRow');
    assert.deepEqual(childTypes(table.header), ['tableCell', 'tableCell']);
    assert.equal(table.rows.length, 1);
    assert.equal(table.rows[0].type, 'tableRow');
    assert.deepEqual(childTypes(table.rows[0]), ['tableCell', 'tableCell']);
    const firstCell =
      table.rows[0].type === 'tableRow' ? table.rows[0].children[0] : undefined;
    assert.ok(firstCell?.type === 'tableCell');
    assert.deepEqual(childTypes(firstCell), ['strong']);
    assert.ok(!JSON.stringify(nodes).includes('|---|---|'));
  });

  await it('uses the shared safe Markdown renderer for live, tool-round, and history assistants', () => {
    const eventRenderer = extractSection('function createEventRenderer', 'function createMessageArea');
    const inputSection = extractSection('function createInputArea', 'async function loadChatHistory');
    const historySection = extractSection('async function loadChatHistory', 'export function createChatView');
    assert.ok(eventRenderer.includes("event.type !== 'assistant'"));
    assert.ok(eventRenderer.includes("createMessageElement(event.content, 'assistant')"));
    assert.ok(eventRenderer.includes('createAssistantMarkdown(content)'));
    assert.ok(inputSection.includes('const element = renderEvent(streamEvent.event)'));
    assert.ok(historySection.includes('renderEvent(event, true)'));
    assert.ok(!eventRenderer.includes('textContent = event.content'));
  });

  await it('should render italic text', () => {
    const paragraph = parseAssistantMarkdown('Use *italic* text.')[0];
    assert.ok(childTypes(paragraph).includes('emphasis'));
  });

  await it('should render unordered lists', () => {
    const list = parseAssistantMarkdown('- one\n- two')[0];
    assert.equal(list.type, 'list');
    assert.ok('ordered' in list && !list.ordered);
    assert.deepEqual(childTypes(list), ['listItem', 'listItem']);
  });

  await it('should render ordered lists', () => {
    const list = parseAssistantMarkdown('1. one\n2. two')[0];
    assert.equal(list.type, 'list');
    assert.ok('ordered' in list && list.ordered);
    assert.deepEqual(childTypes(list), ['listItem', 'listItem']);
  });

  await it('should render inline code', () => {
    const paragraph = parseAssistantMarkdown('Use `const value = 1` here.')[0];
    assert.ok(childTypes(paragraph).includes('inlineCode'));
  });

  await it('should render fenced code blocks with language metadata', () => {
    const code = parseAssistantMarkdown('```typescript\nconst value = 1;\n```')[0];
    assert.deepEqual(code, {
      type: 'codeBlock',
      text: 'const value = 1;',
      language: 'typescript',
    });
  });

  await it('should render blockquotes', () => {
    const quote = parseAssistantMarkdown('> quoted text')[0];
    assert.equal(quote.type, 'blockquote');
    assert.deepEqual(childTypes(quote), ['paragraph']);
  });

  await it('should allow safe links', () => {
    const paragraph = parseAssistantMarkdown('[example](https://example.com)')[0];
    assert.equal(paragraph.type, 'paragraph');
    assert.deepEqual('children' in paragraph ? paragraph.children[0] : null, {
      type: 'link',
      href: 'https://example.com',
      children: [{ type: 'text', text: 'example' }],
    });
    assert.equal(safeLinkHref('/relative/path'), '/relative/path');
    const linkRenderer = markdownRenderer.substring(
      markdownRenderer.indexOf("case 'link':"),
      markdownRenderer.indexOf("case 'lineBreak':"),
    );
    assert.ok(linkRenderer.includes("link.setAttribute('href', node.href)"));
    assert.ok(linkRenderer.includes("link.setAttribute('target', '_blank')"));
    assert.ok(linkRenderer.includes("link.setAttribute('rel', 'noopener noreferrer')"));
  });

  await it('should reject javascript links', () => {
    assert.equal(safeLinkHref('javascript:alert(1)'), null);
    assert.equal(safeLinkHref('data:text/html,unsafe'), null);
    const paragraph = parseAssistantMarkdown('[unsafe](javascript:alert(1))')[0];
    assert.ok(
      'children' in paragraph &&
        paragraph.children[0].type === 'link' &&
        paragraph.children[0].href === null,
    );
  });

  await it('should render raw script and HTML as harmless text nodes', () => {
    const nodes = parseAssistantMarkdown(
      '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>',
    );
    assert.ok(nodes.every((node) => node.type === 'paragraph'));
    assert.ok(JSON.stringify(nodes).includes('<script>alert(1)</script>'));
    assert.ok(JSON.stringify(nodes).includes('<img src=x onerror=alert(1)>'));
    assert.ok(!markdownRenderer.includes('innerHTML'));
    assert.ok(markdownRenderer.includes('createTextNode'));
  });

  await it('should scope readable horizontal table overflow to assistant Markdown', () => {
    const tableStyles = chatCss.substring(
      chatCss.indexOf('.chat-markdown-table {'),
      chatCss.indexOf('.chat-assistant-message a {'),
    );
    assert.ok(tableStyles.includes('max-width: 100%'));
    assert.ok(tableStyles.includes('overflow-x: auto'));
    assert.ok(tableStyles.includes('border-collapse: collapse'));
    assert.ok(tableStyles.includes('.chat-markdown-table th'));
    assert.ok(tableStyles.includes('.chat-markdown-table td'));
  });

  await it('should render Send as an accessible inline SVG button', () => {
    const sendSection = extractSection(
      'const sendButton = createToolbarButton(',
      "sendButton.setAttribute('data-testid', 'send-button')",
    );

    assert.ok(sendSection.includes("'Send message'"));
    assert.ok(sendSection.includes("'chat-send-button'"));
    assert.ok(sendSection.includes("'m22 2-7 20-4-9-9-4Z'"));
    assert.ok(sendSection.includes("'M22 2 11 13'"));
    assert.ok(!sendSection.includes('textContent'));
    assert.ok(content.includes("document.createElementNS(SVG_NAMESPACE, 'svg')"));
    assert.ok(content.includes("document.createElementNS(SVG_NAMESPACE, 'path')"));
    assert.ok(content.includes("button.type = 'button'"));
    assert.ok(content.includes("button.setAttribute('aria-label', label)"));
    assert.ok(content.includes('button.title = label'));
  });

  await it('should visually integrate composer icon buttons without removing focus styles', () => {
    const buttonStyles = chatCss.substring(
      chatCss.indexOf('.chat-toolbar-icon-button {'),
      chatCss.indexOf('.chat-toolbar-icon-button svg {'),
    );
    const sendStyles = chatCss.substring(
      chatCss.indexOf('.chat-send-button {'),
      chatCss.indexOf('.chat-send-button:hover:not(:disabled) {'),
    );

    assert.ok(buttonStyles.includes('border: 0'));
    assert.ok(buttonStyles.includes('background-color: transparent'));
    assert.ok(!sendStyles.includes('background-color: #007bff'));
    assert.ok(chatCss.includes('.chat-toolbar-icon-button:focus-visible {'));
    assert.ok(chatCss.includes('outline: 2px solid #007bff'));
  });

  await it('should render inert accessible Attach and Export SVG buttons', () => {
    const attachSection = extractSection(
      'const attachButton = createToolbarButton(',
      'const exportButton = createToolbarButton(',
    );
    const exportSection = extractSection(
      'const exportButton = createToolbarButton(',
      'const sendButton = createToolbarButton(',
    );

    assert.ok(attachSection.includes("'Attach file'"));
    assert.ok(attachSection.includes("'chat-placeholder-button chat-attach-button'"));
    assert.ok(exportSection.includes("'Export chat'"));
    assert.ok(exportSection.includes("'chat-placeholder-button chat-export-button'"));
    assert.ok(attachSection.includes("attachButton.setAttribute('data-testid', 'attach-button')"));
    assert.ok(exportSection.includes("exportButton.setAttribute('data-testid', 'export-button')"));

    for (const placeholderSection of [attachSection, exportSection]) {
      assert.ok(!placeholderSection.includes('addEventListener'));
      assert.ok(!placeholderSection.includes('fetch('));
      assert.ok(!placeholderSection.includes("type = 'file'"));
      assert.ok(!placeholderSection.includes("createElement('a')"));
    }

    assert.ok(!content.includes("type = 'file'"));
  });

  await it('should not render a redundant top chat info card', () => {
    const createViewSection = content.substring(content.indexOf('export function createChatView'));

    assert.ok(!createViewSection.includes("headerCard.className = 'chat-card'"));
    assert.ok(!createViewSection.includes('container.appendChild(headerCard)'));
    assert.ok(!createViewSection.includes("document.createElement('h2')"));
    assert.ok(createViewSection.includes('container.appendChild(messageArea)'));
  });

  await it('should render Attach, model controls, Export, and Send in the lower composer row', () => {
    const inputSection = extractSection(
      'function createInputArea',
      'export function createChatView',
    );
    const toolbarSection = inputSection.substring(
      inputSection.indexOf("toolbarRow.className = 'chat-composer-toolbar'"),
      inputSection.indexOf('inputWrapper.appendChild(toolbarRow)'),
    );

    assert.ok(inputSection.includes("messageRow.className = 'chat-composer-message-row'"));
    assert.ok(inputSection.includes('messageRow.appendChild(input)'));
    const toolbarControls = [
      'toolbarRow.appendChild(attachButton)',
      'toolbarRow.appendChild(createModelControls(activeChat, updateModelSelection))',
      'toolbarRow.appendChild(exportButton)',
      'toolbarRow.appendChild(sendButton)',
    ];
    let previousIndex = -1;
    for (const control of toolbarControls) {
      const controlIndex = toolbarSection.indexOf(control);
      assert.ok(controlIndex > previousIndex, `${control} should appear in toolbar order`);
      previousIndex = controlIndex;
    }
    assert.equal(content.match(/connectionSelect\.id = 'chat-model-connection'/g)?.length, 1);
    assert.equal(content.match(/modelSelect\.id = 'chat-model'/g)?.length, 1);
  });

  await it('should use accessible standalone model selects without visible labels', () => {
    assert.ok(!content.includes("connectionLabel.textContent = 'Model connection'"));
    assert.ok(!content.includes("modelLabel.textContent = 'Model'"));
    assert.ok(content.includes("connectionSelect.setAttribute('aria-label', 'Model connection')"));
    assert.ok(content.includes("modelSelect.setAttribute('aria-label', 'Model')"));
  });

  await it('should display centrally resolved selected model descriptions as safe text', () => {
    assert.ok(content.includes('function parseEffectiveModels'));
    assert.ok(content.includes("modelDescription.className = 'chat-model-description'"));
    assert.ok(content.includes('option.dataset.description = model.description'));
    assert.ok(content.includes("modelDescription.textContent = modelSelect.selectedOptions[0]?.dataset.description ?? ''"));
    assert.ok(!content.includes('modelDescription.innerHTML'));
  });

  await it('should display disabled connection and model placeholders', () => {
    const placeholderSection = extractSection(
      'function createSelectPlaceholder',
      'function createModelControls',
    );

    assert.ok(content.includes("createSelectPlaceholder('Select connection')"));
    assert.ok(content.includes("createSelectPlaceholder('Select model')"));
    assert.ok(placeholderSection.includes("createSelectOption('', text)"));
    assert.ok(placeholderSection.includes('option.disabled = true'));
    assert.ok(placeholderSection.includes('option.selected = true'));
  });

  await it('should size model selects to content within bounded toolbar widths', () => {
    const selectStyles = chatCss.substring(
      chatCss.indexOf('.chat-model-control select {'),
      chatCss.indexOf('.chat-model-control select:disabled {'),
    );

    assert.ok(selectStyles.includes('width: auto'));
    assert.ok(selectStyles.includes('field-sizing: content'));
    assert.ok(selectStyles.includes('min-width: 9rem'));
    assert.ok(selectStyles.includes('max-width: min(24rem, 100%)'));
    assert.ok(!chatCss.includes('flex: 0 1 12rem'));
    assert.ok(!chatCss.includes('flex: 1 1 16rem'));
    assert.ok(chatCss.includes('flex-wrap: wrap'));
  });

  await it('should have a text input for messages', () => {
    assert.ok(
      content.includes("type = 'text'") || content.includes('type = "text"'),
      'Should create a text input',
    );
  });

  await it('should handle click event on Send button', () => {
    assert.ok(content.includes('click'), 'Should have a click event listener');
  });

  await it('should handle Enter key to submit', () => {
    assert.ok(
      content.includes('keydown') && content.includes("'Enter'"),
      'Should listen for keydown Enter events',
    );
  });

  await it('should ignore empty and whitespace-only messages', () => {
    assert.ok(
      content.includes('trim') && content.includes('length'),
      'Should trim input and check length before sending',
    );
  });

  await it('should clear input after sending a valid message', () => {
    assert.ok(
      content.includes("value = ''") || content.includes('value = ""'),
      'Should clear input value after sending',
    );
  });

  await it('should create a message area element', () => {
    assert.ok(
      content.includes('chat-message-area'),
      'Should have a message area with class chat-message-area',
    );
  });

  await it('keeps one invisible scroll anchor after all Chat content', () => {
    const areaSection = extractSection('function createMessageArea', 'function createToolbarButton');
    assert.ok(areaSection.includes("scrollAnchor.className = 'chat-scroll-anchor'"));
    assert.ok(areaSection.includes("scrollAnchor.setAttribute('aria-hidden', 'true')"));
    assert.equal(content.match(/messageArea\.appendChild\(scrollAnchor\)/g)?.length, 1);
    assert.ok(content.includes('messageArea.replaceChildren(scrollAnchor)'));
    assert.ok(content.includes('scrollAnchor.before(userMessage)'));
    assert.ok(chatCss.includes('.chat-scroll-anchor {'));
  });

  await it('should create user message elements with proper class', () => {
    assert.ok(
      content.includes('chat-user-message'),
      'Should create user message elements with class chat-user-message',
    );
  });

  await it('should POST only the message to the active persisted chat inference endpoint', () => {
    assert.ok(
      content.includes('`/api/chats/${chatId}/inference/stream`'),
      'Should POST messages to the persisted chat streaming inference endpoint',
    );
    assert.ok(content.includes('POST'), 'Should use POST method for API calls');
    assert.ok(content.includes('JSON.stringify({ message: text })'));
    const requestSection = content.substring(
      content.indexOf('async function sendToApi'),
      content.indexOf('function createInputArea'),
    );
    assert.ok(!requestSection.includes('modelId'));
    assert.ok(!requestSection.includes('modelConnectionId'));
    assert.ok(!requestSection.includes('baseUrl'));
    assert.ok(!requestSection.includes('userId'));
    assert.ok(!requestSection.includes('apiKey'));
    assert.ok(!requestSection.includes("fetch('/api/chat'"));
    assert.ok(requestSection.includes("startsWith('application/x-ndjson')"));
    assert.ok(requestSection.includes('parseInferenceStreamEvent(parsedJson)'));
    assert.ok(requestSection.includes('event.sequence !== sequence + 1'));
    assert.ok(requestSection.includes('event.inferenceId !== inferenceId'));
    assert.ok(requestSection.includes("event.type === 'done' && !finalAssistantReceived"));
    assert.ok(requestSection.includes("finalAssistantReceived && event.type !== 'done'"));
  });

  await it('should render assistant messages', () => {
    assert.ok(
      content.includes('chat-assistant-message'),
      'Should render assistant messages with class chat-assistant-message',
    );
    assert.ok(content.includes("messageDiv.className = 'chat-assistant-message'"));
    assert.ok(content.includes('messageDiv.appendChild(createAssistantMarkdown(text))'));
  });

  await it('centers assistant content without changing Markdown alignment or adding a bubble', () => {
    const styles = chatCss.substring(
      chatCss.indexOf('.chat-assistant-message {'),
      chatCss.indexOf('.chat-assistant-message p,'),
    );
    assert.ok(styles.includes('align-self: center'));
    assert.ok(styles.includes('max-width: var(--conversation-column-width)'));
    assert.ok(styles.includes('background-color: transparent'));
    assert.ok(styles.includes('text-align: left'));
    assert.ok(content.includes('messageDiv.appendChild(createAssistantMarkdown(text))'));
  });

  await it('uses a compact right-aligned light-blue user bubble', () => {
    const styles = chatCss.substring(
      chatCss.indexOf('.chat-user-message {'),
      chatCss.indexOf('.chat-input-wrapper {'),
    );
    assert.ok(styles.includes('align-self: flex-end'));
    assert.ok(styles.includes('background-color: #dbeeff'));
    assert.ok(styles.includes('border-radius: 1rem'));
    assert.ok(styles.includes('max-width: min(75%, 42rem)'));
    assert.ok(styles.includes('margin-right: max(0px, calc((100% - var(--conversation-column-width)) / 2))'));
    assert.ok(content.includes('messageText.textContent = text'));
  });

  await it('aligns the thinking bubble to the centered assistant column', () => {
    const areaStyles = chatCss.substring(
      chatCss.indexOf('.chat-message-area {'),
      chatCss.indexOf('.chat-user-message {'),
    );
    const thinkingStyles = chatCss.substring(
      chatCss.indexOf('.chat-thinking-indicator {'),
      chatCss.indexOf('.chat-thinking-dot {'),
    );
    assert.ok(areaStyles.includes('--conversation-column-width: 48rem'));
    assert.ok(thinkingStyles.includes('align-self: flex-start'));
    assert.ok(thinkingStyles.includes('margin-left: max(0px, calc((100% - var(--conversation-column-width)) / 2))'));
    assert.ok(thinkingStyles.includes('background-color: #dde2e6'));
  });

  await it('should keep normal user message styling separate from the loading indicator', () => {
    assert.ok(content.includes("messageDiv.className = 'chat-user-message'"));
    assert.ok(chatCss.includes('.chat-user-message {'));
    assert.ok(!chatCss.includes('.chat-user-message,\n.chat-thinking-indicator'));
  });

  await it('should display three animated dots in a dedicated thinking bubble', () => {
    const waitingSection = extractSection(
      "const waitingMessage = document.createElement('div')",
      'scrollAnchor.before(waitingMessage)',
    );

    assert.ok(waitingSection.includes("waitingMessage.className = 'chat-thinking-indicator'"));
    assert.ok(waitingSection.includes("waitingMessage.setAttribute('role', 'status')"));
    assert.ok(waitingSection.includes("waitingMessage.setAttribute('aria-label', 'Thinking')"));
    assert.ok(waitingSection.includes('dotIndex < 3'));
    assert.ok(waitingSection.includes("dot.className = 'chat-thinking-dot'"));
    assert.ok(waitingSection.includes("dot.textContent = '.'"));
    assert.ok(waitingSection.includes("dot.setAttribute('aria-hidden', 'true')"));
    assert.ok(waitingSection.includes('waitingMessage.appendChild(dot)'));
    assert.ok(!waitingSection.includes('chat-assistant-message'));
    assert.ok(!content.includes('Thinking...'));
    assert.ok(chatCss.includes('.chat-thinking-indicator {'));
    assert.ok(chatCss.includes('.chat-thinking-dot {'));
    assert.ok(chatCss.includes('animation: chat-thinking-wave'));
    assert.ok(chatCss.includes('.chat-thinking-dot:nth-child(2)'));
    assert.ok(chatCss.includes('.chat-thinking-dot:nth-child(3)'));
    assert.ok(chatCss.includes('@keyframes chat-thinking-wave'));
  });

  await it('should make the thinking bubble and dots larger while keeping compact spacing', () => {
    const indicatorStart = chatCss.indexOf('.chat-thinking-indicator {');
    const indicatorEnd = chatCss.indexOf('.chat-thinking-dot {', indicatorStart);
    const indicatorStyles = chatCss.substring(indicatorStart, indicatorEnd);

    assert.ok(indicatorStart !== -1);
    assert.ok(indicatorStyles.includes('gap: 0.125rem'));
    assert.ok(indicatorStyles.includes('padding: 0.55rem 0.8rem 0.7rem'));
    assert.ok(indicatorStyles.includes('font-size: 1.5rem'));
    assert.ok(indicatorStyles.includes('background-color: #dde2e6'));
    assert.ok(indicatorStyles.includes('color: #343a40'));
    assert.ok(chatCss.includes('transform: translateY(-0.2rem)'));
  });

  await it('should handle API errors with error message', () => {
    assert.ok(
      content.includes('chat-error-message'),
      'Should render error messages with class chat-error-message',
    );
    assert.ok(content.includes('Unable to get a response.'));
    assert.ok(!content.includes('Stub response:'));
  });

  await it('should validate inference responses before rendering assistant output', () => {
    assert.ok(content.includes('const parsedJson: unknown = JSON.parse(line) as unknown'));
    assert.ok(content.includes('parseInferenceStreamEvent(parsedJson)'));
    assert.ok(content.includes('MAX_STREAM_LINE_LENGTH'));
  });

  await it('should prevent duplicate sends and restore the input after inference completes', () => {
    assert.ok(content.includes('let inferenceInProgress = false'));
    assert.ok(content.includes('if (!activeChat || inferenceInProgress || text.length === 0)'));
    assert.ok(content.includes('inferenceInProgress = true'));
    assert.ok(content.includes('input.disabled = true'));
    assert.ok(content.includes('sendButton.disabled = true'));
    assert.ok(content.includes('dotIndex < 3'));
    assert.ok(content.includes('inferenceInProgress = false'));
    assert.ok(content.includes('input.disabled = false'));
    assert.ok(content.includes('sendButton.disabled = false'));
  });

  await it('should keep sending unavailable without an active persisted chat', () => {
    assert.ok(content.includes('input.disabled = !activeChat || historyLoading'));
    assert.ok(content.includes('sendButton.disabled = !activeChat || historyLoading'));
    assert.ok(content.includes('Select a saved chat to send a message.'));
  });

  await it('should append new inference messages after loaded history without reloading it', () => {
    const inputSection = extractSection('function createInputArea', 'async function loadChatHistory');
    assert.ok(inputSection.includes('scrollAnchor.before(userMessage)'));
    assert.ok(inputSection.includes('waitingMessage.before(element)'));
    assert.ok(!inputSection.includes('loadChatHistory('));
    assert.ok(inputSection.includes('sendToApi(activeChat.id, text,'));
  });

  await it('keeps the thinking indicator after each visible stream event until terminal completion', () => {
    const inputSection = extractSection('function createInputArea', 'async function loadChatHistory');
    assert.ok(inputSection.includes('waitingMessage.before(element)'));
    assert.ok(inputSection.includes('if (streamEvent.final) waitingMessage.remove()'));
    assert.ok(inputSection.includes("if (streamEvent.type === 'done')"));
    assert.ok(inputSection.includes('waitingMessage.remove()'));
  });

  await it('renders optional reasoning and tool activity with sand styling in persisted order', () => {
    assert.ok(content.includes("event.type === 'reasoning' && !visibility.showReasoning"));
    assert.ok(content.includes('!visibility.showToolCalls'));
    assert.ok(content.includes("activity.className = 'chat-activity-event chat-activity-sand'"));
    assert.ok(chatCss.includes('.chat-activity-sand {'));
    assert.ok(chatCss.includes('background-color: #f4ecdc'));
    assert.ok(content.includes("document.createElement('details')"));
  });

  await it('defers far-off assistant Markdown with an IntersectionObserver viewport buffer', () => {
    assert.ok(content.includes('new IntersectionObserver('));
    assert.ok(content.includes("rootMargin: '800px 0px'"));
    assert.ok(content.includes('pendingMarkdown.set(shell, event.content)'));
    assert.ok(content.includes('entry.target.replaceChildren(createAssistantMarkdown(content))'));
    assert.ok(chatCss.includes('.chat-lazy-event {'));
  });

  await it('should not render a late response after the active chat changes', () => {
    assert.ok(content.includes('if (isActiveChat && !isActiveChat(activeChat.id))'));
    assert.ok(content.includes('return;'));
    assert.ok(content.includes('const controller = new AbortController()'));
    assert.ok(content.includes('controller.abort()'));
    assert.ok(content.includes('!messageArea.isConnected || !isCurrentChat()'));
  });

  await it('should not make LM Studio or OpenAI calls', () => {
    assert.ok(
      !content.includes('lmstudio') && !content.includes('localhost:1234'),
      'Should not connect to LM Studio',
    );
    assert.ok(
      !content.includes('openai') && !content.includes('api.openai'),
      'Should not use OpenAI API',
    );
  });

  await it('should parse fenced code blocks without including fence characters', () => {
    const code = parseAssistantMarkdown('```python\nprint("hello")\n```')[0];
    assert.equal(code.type, 'codeBlock');
    assert.equal(code.text, 'print("hello")');
    assert.equal(code.language, 'python');
    assert.ok(!code.text.includes('```'));
  });

  await it('should render a Copy button for fenced code blocks', () => {
    const codeBlockStart = markdownRenderer.indexOf("case 'codeBlock':");
    const renderNodeEnd = markdownRenderer.indexOf('export function createAssistantMarkdown');
    const codeBlockSection = markdownRenderer.substring(codeBlockStart, renderNodeEnd);
    assert.ok(codeBlockSection.includes("ownerDocument.createElement('button')"));
    assert.ok(codeBlockSection.includes("button.type = 'button'"));
    assert.ok(codeBlockSection.includes("button.textContent = 'Copy'"));
    assert.ok(codeBlockSection.includes("chat-copy-button"));
    assert.ok(codeBlockSection.includes('navigator.clipboard.writeText'));
    assert.ok(codeBlockSection.includes('node.text'));
  });

  await it('should copy only code text without Markdown fences', () => {
    const codeBlockStart = markdownRenderer.indexOf("case 'codeBlock':");
    const renderNodeEnd = markdownRenderer.indexOf('export function createAssistantMarkdown');
    const codeBlockSection = markdownRenderer.substring(codeBlockStart, renderNodeEnd);
    assert.ok(codeBlockSection.includes('navigator.clipboard.writeText(node.text)'));
    assert.ok(!codeBlockSection.includes('navigator.clipboard.writeText(token.text)'));
  });

  await it('should not render a Copy button for inline code', () => {
    const inlineCodeSection = markdownRenderer.substring(
      markdownRenderer.indexOf("case 'inlineCode':"),
      markdownRenderer.indexOf("case 'list':"),
    );
    assert.ok(!inlineCodeSection.includes("ownerDocument.createElement('button')"));
    assert.ok(!inlineCodeSection.includes('chat-copy-button'));
  });

  await it('should handle clipboard write failures without crashing', () => {
    const codeBlockStart = markdownRenderer.indexOf("case 'codeBlock':");
    const renderNodeEnd = markdownRenderer.indexOf('export function createAssistantMarkdown');
    const codeBlockSection = markdownRenderer.substring(codeBlockStart, renderNodeEnd);
    assert.ok(codeBlockSection.includes('.catch('));
  });

  await it('should scope Copy button styles to chat code blocks', () => {
    assert.ok(chatCss.includes('.chat-code-block-wrapper {'));
    assert.ok(chatCss.includes('.chat-copy-button {'));
    assert.ok(chatCss.includes('.chat-code-block-wrapper:hover .chat-copy-button'));
    assert.ok(chatCss.includes('.chat-copy-button:focus-visible'));
  });

  await it('should keep code block rendering intact with wrapper', () => {
    const codeBlockStart = markdownRenderer.indexOf("case 'codeBlock':");
    const renderNodeEnd = markdownRenderer.indexOf('export function createAssistantMarkdown');
    const codeBlockSection = markdownRenderer.substring(codeBlockStart, renderNodeEnd);
    assert.ok(codeBlockSection.includes("ownerDocument.createElement('pre')"));
    assert.ok(codeBlockSection.includes("ownerDocument.createElement('code')"));
    assert.ok(codeBlockSection.includes('code.textContent = node.text'));
    assert.ok(codeBlockSection.includes('language-'));
    assert.ok(codeBlockSection.includes('wrapper.appendChild(pre)'));
  });

  await it('creates initial restore state and passes it to event renderer and history loader', () => {
    const viewSection = extractSection('export function createChatView', 'return container;');
    assert.ok(viewSection.includes('initialRestoreState'), 'Must create initial restore state object');
    assert.ok(
      viewSection.includes("createEventRenderer(messageArea, scroller, visibility, initialRestoreState)"),
      'Must pass restore state to event renderer',
    );
    const loadCall = viewSection.substring(viewSection.indexOf('void loadChatHistory'));
    assert.ok(loadCall.includes('initialRestoreState'), 'Must pass restore state to history loader');
  });

  await it('enables initial restore flag before rendering persisted messages', () => {
    const historySection = extractSection('async function loadChatHistory', 'export function createChatView');
    const flagSetPos = historySection.indexOf('initialRestoreState.pending = true');
    const renderPos = historySection.indexOf('scroller.updateContent(');
    assert.ok(flagSetPos !== -1, 'Must set initial restore pending flag');
    assert.ok(flagSetPos < renderPos, 'Flag must be set before rendering messages');
  });

  await it('waits for lazy markdown settling after initial history scroll', () => {
    const historySection = extractSection('async function loadChatHistory', 'export function createChatView');
    const scrollPos = historySection.indexOf('scroller.updateContent(');
    const settlePos = historySection.indexOf('await waitForLazySettle(messageArea, initialRestoreState)');
    assert.ok(settlePos !== -1, 'Must await lazy settling after history render');
    assert.ok(scrollPos < settlePos, 'Settling wait must come after scroll trigger');
  });

  await it('uses forceScroll during initial restore markdown materialization', () => {
    const rendererSection = extractSection(
      'function createEventRenderer',
      'function createMessageArea',
    );
    const observerBodyStart = rendererSection.indexOf("typeof IntersectionObserver === 'undefined'");
    const observerBodyEnd = rendererSection.indexOf('{ root: messageArea, rootMargin:', observerBodyStart);
    const observerCallback = rendererSection.substring(observerBodyStart, observerBodyEnd);
    assert.ok(
      observerCallback.includes('const duringRestore = initialRestoreState.pending'),
      'Must check restore state in observer callback',
    );
    assert.ok(
      observerCallback.includes(', duringRestore)'),
      'Must pass duringRestore as forceScroll to scroller.updateContent',
    );
  });

  await it('removes chat-lazy-event class when materializing deferred markdown', () => {
    const rendererSection = extractSection(
      'function createEventRenderer',
      'function createMessageArea',
    );
    assert.ok(
      rendererSection.includes("entry.target.classList.remove('chat-lazy-event')"),
      'Must remove lazy-event class on materialization to release placeholder sizing',
    );
  });

  await it('tracks observable pending shells for initial restore settling', () => {
    const settleFn = extractSection(
      'function waitForLazySettle(',
      'function createEventRenderer',
    );
    assert.ok(
      settleFn.includes('.chat-lazy-event[aria-busy="true"]'),
      'Must query for pending lazy shells by class and busy attribute',
    );
    assert.ok(
      settleFn.includes('getBoundingClientRect()'),
      'Must check observation range using bounding rectangles',
    );
    assert.ok(
      settleFn.includes('requestAnimationFrame(check)'),
      'Must use rAF polling to wait for observable shells to materialize',
    );
    assert.ok(
      settleFn.includes('initialRestoreState.pending = false'),
      'Must clear restore flag when settling completes',
    );
  });

  await it('ends initial restore mode when no observable pending shells remain', () => {
    const settleFn = extractSection(
      'function waitForLazySettle(',
      'function createEventRenderer',
    );
    assert.ok(settleFn.includes('hasObservablePending'), 'Must track whether observable shells exist');
    assert.ok(
      settleFn.includes('if (!hasObservablePending)'),
      'Must end restore when no observable pending shells remain',
    );
  });

  await it('aborts initial restore settling if message area disconnects', () => {
    const settleFn = extractSection(
      'function waitForLazySettle(',
      'function createEventRenderer',
    );
    assert.ok(settleFn.includes('!messageArea.isConnected'), 'Must check connection status');
  });

  await it('keeps CHAT_NEAR_BOTTOM_THRESHOLD unchanged at 96', () => {
    assert.equal(CHAT_NEAR_BOTTOM_THRESHOLD, 96);
  });

  await it('preserves existing near-bottom scroll guard after initial restore settles', () => {
    const scrollHelper = extractSection('function createChatScroller', 'export interface ChatViewChat');
    assert.ok(scrollHelper.includes('!isChatNearBottom(messageArea)'));
    assert.ok(
      scrollHelper.includes('Math.abs(messageArea.scrollTop - scrollTopBeforeUpdate)'),
      'Scroll position tolerance check must remain for non-forced updates',
    );
  });

  await it('root-cause regression: restored lazy shell expansion triggers forced bottom-follow during restore', () => {
    const rendererSection = extractSection(
      'function createEventRenderer',
      'function createMessageArea',
    );
    const observerCallbackStart = rendererSection.indexOf("typeof IntersectionObserver === 'undefined'");
    const observerCallbackEnd = rendererSection.indexOf('{ root: messageArea, rootMargin:', observerCallbackStart);
    const callbackBody = rendererSection.substring(observerCallbackStart, observerCallbackEnd);

    assert.ok(
      callbackBody.includes('duringRestore'),
      'Observer must track whether materialization is during initial restore',
    );
    assert.ok(
      callbackBody.includes(', duringRestore)'),
      'Must pass forceScroll flag to scroller.updateContent for restore-phase materialization',
    );

    const historySection = extractSection('async function loadChatHistory', 'export function createChatView');
    assert.ok(
      historySection.includes('initialRestoreState.pending = true'),
      'History loader must activate initial restore mode before rendering',
    );
    assert.ok(
      historySection.includes('await waitForLazySettle(messageArea, initialRestoreState)'),
      'Must wait for all observable lazy shells to settle before ending restore mode',
    );

    const settleFn = extractSection(
      'function waitForLazySettle(',
      'function createEventRenderer',
    );
    assert.ok(
      settleFn.includes('initialRestoreState.pending = false'),
      'Must deactivate initial restore mode when settling completes',
    );
  });

  await it('eager-render fallback without IntersectionObserver still restores correctly at bottom', () => {
    const rendererSection = extractSection(
      'function createEventRenderer',
      'function createMessageArea',
    );
    assert.ok(
      rendererSection.includes("typeof IntersectionObserver === 'undefined'"),
      'Must check for IntersectionObserver availability',
    );
    assert.ok(
      rendererSection.includes('!deferMarkdown || !observer'),
      'Must fall through to eager rendering when observer is unavailable',
    );
  });

  await it('createEventRenderer accepts initialRestoreState parameter', () => {
    const sigPos = content.indexOf('function createEventRenderer');
    const sigSection = content.substring(sigPos, content.indexOf('): (event: PersistedChatMessage', sigPos) + 50);
    assert.ok(
      sigSection.includes('initialRestoreState'),
      'createEventRenderer must accept initialRestoreState parameter',
    );
  });

  await it('loadChatHistory accepts initialRestoreState parameter', () => {
    const sigPos = content.indexOf('async function loadChatHistory');
    const sigEnd = content.indexOf('): Promise<void>', sigPos);
    const sigSection = content.substring(sigPos, sigEnd);
    assert.ok(
      sigSection.includes('initialRestoreState'),
      'loadChatHistory must accept initialRestoreState parameter',
    );
  });
});
