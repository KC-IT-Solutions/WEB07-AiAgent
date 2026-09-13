const RESERVED_KEYS = new Set(['timestamp', 'level', 'event']);

function formatValue(value: unknown, indent: string): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const lines = value.map((item) => `${indent}  ${formatValue(item, indent + '  ')}`);
    return '[\n' + lines.join('\n') + '\n' + indent + ']';
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    const lines = entries.map(([k, v]) => `${indent}  ${k}: ${formatValue(v, indent + '  ')}`);
    return '{\n' + lines.join('\n') + '\n' + indent + '}';
  }
  return String(value);
}

function formatEntry(entry: Record<string, unknown>): string {
  const timestamp = entry.timestamp;
  const level = (entry.level ?? 'unknown').toString().toUpperCase();
  const event = entry.event ? String(entry.event) : '';

  const timeStr = (() => {
    if (typeof timestamp !== 'string') return String(timestamp);
    try {
      const d = new Date(timestamp);
      if (!isNaN(d.getTime())) {
        const pad = (n: number, len = 2): string => String(n).padStart(len, '0');
        const y = d.getFullYear();
        const mo = pad(d.getMonth() + 1);
        const da = pad(d.getDate());
        const hh = pad(d.getHours());
        const mm = pad(d.getMinutes());
        const ss = pad(d.getSeconds());
        const frac = d.getMilliseconds();
        const tzOffMin = d.getTimezoneOffset();
        const tzSign = tzOffMin <= 0 ? '+' : '-';
        const tzH = pad(Math.abs(tzOffMin) / 60);
        const tzM = pad(Math.abs(tzOffMin) % 60);
        return `${y}-${mo}-${da} ${hh}:${mm}:${ss}.${String(frac).padStart(3, '0')} ${tzSign}${tzH}:${tzM}`;
      }
    } catch {
      // fall through to raw timestamp
    }
    return timestamp;
  })();

  const parts: string[] = [];
  parts.push(`${timeStr}  ${level.padEnd(8)}  ${event}`);

  const fields = Object.entries(entry).filter(
    ([key]) => !RESERVED_KEYS.has(key),
  );
  if (fields.length > 0) {
    for (const [key, value] of fields) {
      parts.push(`  ${key}: ${formatValue(value, '    ')}`);
    }
  }

  return parts.join('\n');
}

export function formatReadableLog(content: string): string {
  if (!content.trim()) return '';

  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  const formatted: string[] = [];

  for (const raw of lines) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        formatted.push(formatEntry(parsed));
      } else {
        formatted.push(raw);
      }
    } catch {
      formatted.push(raw.trim());
    }
  }

  return formatted.join('\n\n');
}
