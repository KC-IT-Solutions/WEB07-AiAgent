import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAssistantMarkdown, safeLinkHref, type MarkdownNode } from '../MarkdownRenderer.js';

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

  await it('should render bold text', () => {
    const paragraph = parseAssistantMarkdown('Use **bold** text.')[0];
    assert.ok(childTypes(paragraph).includes('strong'));
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
  });

  await it('should reject javascript links', () => {
    assert.equal(safeLinkHref('javascript:alert(1)'), null);
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
    assert.ok(content.includes("button.setAttribute('aria-label', label)"));
    assert.ok(content.includes('button.title = label'));
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

  await it('should keep accessible model labels in the composer', () => {
    assert.ok(content.includes("connectionLabel.textContent = 'Model connection'"));
    assert.ok(content.includes("connectionLabel.htmlFor = 'chat-model-connection'"));
    assert.ok(content.includes("modelLabel.textContent = 'Model'"));
    assert.ok(content.includes("modelLabel.htmlFor = 'chat-model'"));
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

  await it('should create user message elements with proper class', () => {
    assert.ok(
      content.includes('chat-user-message'),
      'Should create user message elements with class chat-user-message',
    );
  });

  await it('should POST only the message to the active persisted chat inference endpoint', () => {
    assert.ok(
      content.includes('`/api/chats/${chatId}/inference`'),
      'Should POST messages to the persisted chat inference endpoint',
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
  });

  await it('should render assistant messages', () => {
    assert.ok(
      content.includes('chat-assistant-message'),
      'Should render assistant messages with class chat-assistant-message',
    );
    assert.ok(content.includes("messageDiv.className = 'chat-assistant-message'"));
    assert.ok(content.includes('messageDiv.appendChild(createAssistantMarkdown(text))'));
  });

  await it('should keep normal user message styling separate from the loading indicator', () => {
    assert.ok(content.includes("messageDiv.className = 'chat-user-message'"));
    assert.ok(chatCss.includes('.chat-user-message {'));
    assert.ok(!chatCss.includes('.chat-user-message,\n.chat-thinking-indicator'));
  });

  await it('should display three animated dots in a dedicated thinking bubble', () => {
    const waitingSection = extractSection(
      "const waitingMessage = document.createElement('div')",
      'messageArea.appendChild(waitingMessage)',
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

  await it('should handle API errors with error message', () => {
    assert.ok(
      content.includes('chat-error-message'),
      'Should render error messages with class chat-error-message',
    );
    assert.ok(content.includes('Unable to get a response.'));
    assert.ok(!content.includes('Stub response:'));
  });

  await it('should validate inference responses before rendering assistant output', () => {
    assert.ok(content.includes('const data: unknown = await response.json()'));
    assert.ok(content.includes('const message = (data as Record<string, unknown>).message'));
    assert.ok(content.includes("typeof message === 'string' && message.trim().length > 0"));
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
    assert.ok(content.includes('input.disabled = !activeChat'));
    assert.ok(content.includes('sendButton.disabled = !activeChat'));
    assert.ok(content.includes('Select a saved chat to send a message.'));
  });

  await it('should not render a late response after the active chat changes', () => {
    assert.ok(content.includes('if (isActiveChat && !isActiveChat(activeChat.id))'));
    assert.ok(content.includes('return;'));
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
});
