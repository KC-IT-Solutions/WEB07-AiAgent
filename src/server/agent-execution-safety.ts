const MAX_EXECUTION_CONTENT_LENGTH = 32_000;
const MAX_STRUCTURED_ITEMS = 200;
const MAX_STRUCTURED_DEPTH = 20;
const REDACTED = '[REDACTED]';
const REDACTED_PATH = '[REDACTED_PATH]';

const SENSITIVE_KEY = /authorization|cookie|credential|password|passwd|secret|token|api[_-]?key/i;
const WINDOWS_ABSOLUTE_PATH = /[A-Za-z]:[\\/](?:[^\\/\s"'`]+[\\/])*[^\\/\s"'`]*/g;
const POSIX_ABSOLUTE_PATH = /(^|[\s("'`])\/(?:[^/\s"'`]+\/)*[^/\s"'`]*/g;
const INLINE_CREDENTIAL =
  /\b(?:authorization|api[_-]?key|password|passwd|secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi;

function redactText(value: string): string {
  return value
    .replace(INLINE_CREDENTIAL, REDACTED)
    .replace(WINDOWS_ABSOLUTE_PATH, REDACTED_PATH)
    .replace(POSIX_ABSOLUTE_PATH, (_match, prefix: string) => `${prefix}${REDACTED_PATH}`);
}

export function safeExecutionText(value: string): string {
  const redacted = redactText(value);
  if (redacted.length <= MAX_EXECUTION_CONTENT_LENGTH) return redacted;
  return `${redacted.slice(0, MAX_EXECUTION_CONTENT_LENGTH - 20)}\n[CONTENT TRUNCATED]`;
}

function sanitizeStructuredValue(value: unknown, depth: number): unknown {
  if (depth >= MAX_STRUCTURED_DEPTH) return '[DEPTH TRUNCATED]';
  if (typeof value === 'string') return safeExecutionText(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_STRUCTURED_ITEMS)
      .map((item) => sanitizeStructuredValue(item, depth + 1));
    if (value.length > MAX_STRUCTURED_ITEMS) items.push('[ITEMS TRUNCATED]');
    return items;
  }
  if (typeof value !== 'object') return String(value);
  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_STRUCTURED_ITEMS);
  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of entries) {
    sanitized[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitizeStructuredValue(item, depth + 1);
  }
  if (Object.keys(value as Record<string, unknown>).length > MAX_STRUCTURED_ITEMS) {
    sanitized.truncated = true;
  }
  return sanitized;
}

export function safeExecutionJson(value: unknown): string {
  const serialized = JSON.stringify(sanitizeStructuredValue(value, 0)) ?? 'null';
  if (serialized.length <= MAX_EXECUTION_CONTENT_LENGTH) return serialized;

  let previewLength = MAX_EXECUTION_CONTENT_LENGTH - 64;
  let bounded = JSON.stringify({ truncated: true, preview: serialized.slice(0, previewLength) });
  while (bounded.length > MAX_EXECUTION_CONTENT_LENGTH && previewLength > 0) {
    previewLength -= Math.max(1, bounded.length - MAX_EXECUTION_CONTENT_LENGTH);
    bounded = JSON.stringify({ truncated: true, preview: serialized.slice(0, previewLength) });
  }
  return bounded;
}

export function safeToolArgumentsJson(rawArguments: string): string {
  try {
    return safeExecutionJson(JSON.parse(rawArguments) as unknown);
  } catch {
    return JSON.stringify({ invalid: true });
  }
}
