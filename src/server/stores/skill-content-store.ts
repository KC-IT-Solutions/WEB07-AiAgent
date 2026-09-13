import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export const MAX_SKILL_MARKDOWN_BYTES = 256 * 1024;

export interface SkillContentStore {
  read(skillId: number): Promise<string>;
  write(skillId: number, markdown: string): Promise<void>;
  delete(skillId: number): Promise<void>;
}

export type SkillContentStoreErrorCode =
  'INVALID_ID' | 'INVALID_CONTENT' | 'NOT_FOUND' | 'READ_FAILED' | 'WRITE_FAILED' | 'DELETE_FAILED';

export class SkillContentStoreError extends Error {
  constructor(readonly code: SkillContentStoreErrorCode) {
    super(code);
    this.name = 'SkillContentStoreError';
  }
}

function isFileSystemError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

export function normalizeSkillMarkdown(markdown: string): string {
  if (typeof markdown !== 'string') {
    throw new SkillContentStoreError('INVALID_CONTENT');
  }
  const normalized = markdown.replace(/\r\n?/g, '\n');
  if (Buffer.byteLength(normalized, 'utf8') > MAX_SKILL_MARKDOWN_BYTES) {
    throw new SkillContentStoreError('INVALID_CONTENT');
  }
  return normalized;
}

export class FileSkillContentStore implements SkillContentStore {
  private readonly rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = resolve(rootPath);
  }

  async read(skillId: number): Promise<string> {
    const filePath = this.getFilePath(skillId);
    try {
      return normalizeSkillMarkdown(await readFile(filePath, 'utf8'));
    } catch (error) {
      if (error instanceof SkillContentStoreError) {
        throw error;
      }
      throw new SkillContentStoreError(
        isFileSystemError(error, 'ENOENT') ? 'NOT_FOUND' : 'READ_FAILED',
      );
    }
  }

  async write(skillId: number, markdown: string): Promise<void> {
    const filePath = this.getFilePath(skillId);
    const temporaryPath = `${filePath}.tmp`;
    const normalized = normalizeSkillMarkdown(markdown);
    try {
      await mkdir(this.rootPath, { recursive: true });
      await writeFile(temporaryPath, normalized, 'utf8');
      await rename(temporaryPath, filePath);
    } catch {
      try {
        await unlink(temporaryPath);
      } catch (cleanupError) {
        if (!isFileSystemError(cleanupError, 'ENOENT')) {
          throw new SkillContentStoreError('WRITE_FAILED');
        }
      }
      throw new SkillContentStoreError('WRITE_FAILED');
    }
  }

  async delete(skillId: number): Promise<void> {
    const filePath = this.getFilePath(skillId);
    try {
      await unlink(filePath);
    } catch (error) {
      if (!isFileSystemError(error, 'ENOENT')) {
        throw new SkillContentStoreError('DELETE_FAILED');
      }
    }
  }

  private getFilePath(skillId: number): string {
    if (!Number.isSafeInteger(skillId) || skillId <= 0) {
      throw new SkillContentStoreError('INVALID_ID');
    }
    const filePath = resolve(this.rootPath, `skill-${skillId}.md`);
    const pathWithinRoot = relative(this.rootPath, filePath);
    if (pathWithinRoot.startsWith('..') || isAbsolute(pathWithinRoot)) {
      throw new SkillContentStoreError('INVALID_ID');
    }
    return filePath;
  }
}
