import { lexer, type Token } from 'marked';

export type MarkdownNode =
  | { type: 'text'; text: string }
  | { type: 'paragraph'; children: MarkdownNode[] }
  | { type: 'heading'; level: number; children: MarkdownNode[] }
  | { type: 'strong' | 'emphasis' | 'inlineCode'; children: MarkdownNode[] }
  | { type: 'list'; ordered: boolean; start?: number; children: MarkdownNode[] }
  | { type: 'listItem' | 'blockquote'; children: MarkdownNode[] }
  | { type: 'codeBlock'; text: string; language?: string }
  | { type: 'link'; href: string | null; children: MarkdownNode[] }
  | { type: 'lineBreak' };

function textNode(text: string): MarkdownNode {
  return { type: 'text', text };
}

function parseInlineContent(tokens: Token[] | undefined, text: string): MarkdownNode[] {
  return tokens ? parseInlineTokens(tokens) : [textNode(text)];
}

function parseInlineTokens(tokens: Token[]): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'text':
        nodes.push(
          ...('tokens' in token && token.tokens
            ? parseInlineTokens(token.tokens)
            : [textNode(token.text)]),
        );
        break;
      case 'escape':
        nodes.push(textNode(token.text));
        break;
      case 'strong':
        nodes.push({ type: 'strong', children: parseInlineContent(token.tokens, token.text) });
        break;
      case 'em':
        nodes.push({ type: 'emphasis', children: parseInlineContent(token.tokens, token.text) });
        break;
      case 'codespan':
        nodes.push({ type: 'inlineCode', children: [textNode(token.text)] });
        break;
      case 'br':
        nodes.push({ type: 'lineBreak' });
        break;
      case 'link':
        nodes.push({
          type: 'link',
          href: safeLinkHref(token.href),
          children: parseInlineContent(token.tokens, token.text),
        });
        break;
      case 'image':
        nodes.push(textNode(token.text));
        break;
      case 'html':
        nodes.push(textNode(token.raw));
        break;
      default:
        nodes.push(textNode(token.raw));
    }
  }

  return nodes;
}

function parseBlockTokens(tokens: Token[]): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'space':
        break;
      case 'paragraph':
        nodes.push({
          type: 'paragraph',
          children: parseInlineContent(token.tokens, token.text),
        });
        break;
      case 'heading':
        nodes.push({
          type: 'heading',
          level: Math.min(Math.max(token.depth, 1), 6),
          children: parseInlineContent(token.tokens, token.text),
        });
        break;
      case 'list':
        nodes.push({
          type: 'list',
          ordered: token.ordered,
          ...(token.ordered && typeof token.start === 'number' ? { start: token.start } : {}),
          children: token.items.map((item: { tokens: Token[] }) => ({
            type: 'listItem' as const,
            children: parseBlockTokens(item.tokens),
          })),
        });
        break;
      case 'blockquote':
        nodes.push({
          type: 'blockquote',
          children: token.tokens ? parseBlockTokens(token.tokens) : [textNode(token.text)],
        });
        break;
      case 'code': {
        const language = token.lang?.trim().split(/\s+/, 1)[0];
        nodes.push({
          type: 'codeBlock',
          text: token.text,
          ...(language && /^[A-Za-z0-9_+-]+$/.test(language) ? { language } : {}),
        });
        break;
      }
      case 'html':
        nodes.push({ type: 'paragraph', children: [textNode(token.raw)] });
        break;
      case 'text':
        nodes.push(...parseInlineTokens(token.tokens ?? [token]));
        break;
      default:
        nodes.push(textNode(token.raw));
    }
  }

  return nodes;
}

export function safeLinkHref(href: string): string | null {
  try {
    const url = new URL(href, 'https://markdown.invalid/');
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? href : null;
  } catch {
    return null;
  }
}

export function parseAssistantMarkdown(markdown: string): MarkdownNode[] {
  return parseBlockTokens(lexer(markdown));
}

function appendChildren(element: Node, children: MarkdownNode[], ownerDocument: Document): void {
  for (const child of children) {
    element.appendChild(renderNode(child, ownerDocument));
  }
}

function createContainer(
  tagName: 'p' | 'strong' | 'em' | 'code' | 'li' | 'blockquote' | 'span',
  children: MarkdownNode[],
  ownerDocument: Document,
): HTMLElement {
  const element = ownerDocument.createElement(tagName);
  appendChildren(element, children, ownerDocument);
  return element;
}

function renderNode(node: MarkdownNode, ownerDocument: Document): Node {
  switch (node.type) {
    case 'text':
      return ownerDocument.createTextNode(node.text);
    case 'paragraph':
      return createContainer('p', node.children, ownerDocument);
    case 'heading': {
      const headingTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
      const heading = ownerDocument.createElement(headingTags[node.level - 1]);
      appendChildren(heading, node.children, ownerDocument);
      return heading;
    }
    case 'strong':
      return createContainer('strong', node.children, ownerDocument);
    case 'emphasis':
      return createContainer('em', node.children, ownerDocument);
    case 'inlineCode':
      return createContainer('code', node.children, ownerDocument);
    case 'list': {
      const list = ownerDocument.createElement(node.ordered ? 'ol' : 'ul');
      if (node.start !== undefined && node.start !== 1) {
        list.setAttribute('start', String(node.start));
      }
      appendChildren(list, node.children, ownerDocument);
      return list;
    }
    case 'listItem':
      return createContainer('li', node.children, ownerDocument);
    case 'blockquote':
      return createContainer('blockquote', node.children, ownerDocument);
    case 'codeBlock': {
      const pre = ownerDocument.createElement('pre');
      const code = ownerDocument.createElement('code');
      code.textContent = node.text;
      if (node.language) {
        code.className = `language-${node.language}`;
      }
      pre.appendChild(code);
      return pre;
    }
    case 'link': {
      if (node.href === null) {
        return createContainer('span', node.children, ownerDocument);
      }
      const link = ownerDocument.createElement('a');
      link.setAttribute('href', node.href);
      appendChildren(link, node.children, ownerDocument);
      return link;
    }
    case 'lineBreak':
      return ownerDocument.createElement('br');
  }
}

export function createAssistantMarkdown(markdown: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  appendChildren(fragment, parseAssistantMarkdown(markdown), document);
  return fragment;
}
