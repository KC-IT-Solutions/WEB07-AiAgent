import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'trace'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogStream = 'application' | 'model-inference';

const FILE_NAMES: Record<LogStream, string> = {
  application: 'application.log',
  'model-inference': 'model-inference.log',
};
const LEVEL_PRIORITY = new Map(LOG_LEVELS.map((level, index) => [level, index]));
const SECRET_KEY = /api[-_]?key|authorization|cookie|password|secret|session|token/i;

function redactString(value: string): string {
  return value
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/(https?:\/\/)[^:/@\s]+:[^@\s]+@/gi, '$1[REDACTED]@')
    .replace(/(api[-_]?key|password|secret|token)=([^&\s]+)/gi, '$1=[REDACTED]');
}

function redact(value: unknown, key = '', seen = new WeakSet<object>()): unknown {
  if (SECRET_KEY.test(key)) {
    return '[REDACTED]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, '', seen));
  }
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  if (seen.has(value)) {
    return '[CIRCULAR]';
  }
  seen.add(value);
  const redacted: Record<string, unknown> = {};
  for (const [field, fieldValue] of Object.entries(value)) {
    redacted[field] = redact(fieldValue, field, seen);
  }
  return redacted;
}

export class StructuredLogger {
  private level: LogLevel;
  private readonly enabledStreams: Record<LogStream, boolean>;
  private pendingWrite: Promise<void> = Promise.resolve();
  readonly rootPath: string;

  constructor(
    rootPath: string,
    level: LogLevel = 'info',
    enabledStreams: Partial<Record<LogStream, boolean>> = {},
  ) {
    this.rootPath = resolve(rootPath);
    this.level = level;
    this.enabledStreams = {
      application: enabledStreams.application ?? true,
      'model-inference': enabledStreams['model-inference'] ?? true,
    };
  }

  async initialize(clearManagedLogs = false): Promise<void> {
    await mkdir(this.rootPath, { recursive: true });
    if (clearManagedLogs) {
      await Promise.all(
        Object.values(FILE_NAMES).map((fileName) =>
          writeFile(resolve(this.rootPath, fileName), '', 'utf8'),
        ),
      );
    } else {
      const enabledFiles = Object.entries(FILE_NAMES).filter(
        ([stream]) => this.enabledStreams[stream as LogStream],
      );
      await Promise.all(
        enabledFiles.map(([, fileName]) =>
          appendFile(resolve(this.rootPath, fileName), '', 'utf8'),
        ),
      );
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  setStreamEnabled(stream: LogStream, enabled: boolean): void {
    this.enabledStreams[stream] = enabled;
  }

  async application(
    level: LogLevel,
    event: string,
    fields: Record<string, unknown> = {},
  ): Promise<void> {
    await this.write('application', level, event, fields);
  }

  async model(
    level: LogLevel,
    event: string,
    fields: Record<string, unknown> = {},
  ): Promise<void> {
    await this.write('model-inference', level, event, fields);
  }

  private async write(
    stream: LogStream,
    level: LogLevel,
    event: string,
    fields: Record<string, unknown>,
  ): Promise<void> {
    if (
      !this.enabledStreams[stream] ||
      (LEVEL_PRIORITY.get(level) ?? 0) > (LEVEL_PRIORITY.get(this.level) ?? 0)
    ) {
      return;
    }
    const entry = redact({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...fields,
    });
    const line = `${JSON.stringify(entry)}\n`;
    const filePath = resolve(this.rootPath, FILE_NAMES[stream]);
    const operation = this.pendingWrite.then(async () => {
      await mkdir(this.rootPath, { recursive: true });
      await appendFile(filePath, line, 'utf8');
    });
    this.pendingWrite = operation.catch((error) => {
      process.stderr.write(
        `[logger] write failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    });
    await operation;
  }
}
