import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import type { ProjectRootStore } from './project-root-store.js';

export const MAX_PROJECT_TEXT_FILE_BYTES = 1024 * 1024;

export interface ProjectFileEntry {
  name: string;
  relativePath: string;
  type: 'file' | 'directory';
  size?: number;
  modifiedAt: number;
}

export interface ProjectDirectoryListing {
  relativePath: string;
  entries: ProjectFileEntry[];
}

export interface ProjectTextFile {
  relativePath: string;
  content: string;
  size: number;
}

export interface ProjectFileWriteResult {
  relativePath: string;
  size: number;
}

export interface ProjectFileDownload {
  relativePath: string;
  size: number;
  stream: Readable;
}

export type ProjectFilesystemStoreErrorCode =
  | 'PROJECT_PATH_INVALID'
  | 'PROJECT_PATH_ESCAPE'
  | 'PROJECT_FILE_NOT_FOUND'
  | 'PROJECT_FILE_TOO_LARGE'
  | 'PROJECT_FILE_CONFLICT'
  | 'PROJECT_FILE_UNSUPPORTED'
  | 'PROJECT_FILESYSTEM_FAILED';

export class ProjectFilesystemStoreError extends Error {
  constructor(
    readonly code: ProjectFilesystemStoreErrorCode,
    readonly limitBytes?: number,
  ) {
    super(code);
    this.name = 'ProjectFilesystemStoreError';
  }
}

export interface ProjectFilesystemStore {
  listDirectory(userId: number, projectId: number, path: string): Promise<ProjectDirectoryListing>;
  readFile(userId: number, projectId: number, path: string): Promise<ProjectTextFile>;
  writeFile(
    userId: number,
    projectId: number,
    path: string,
    content: string,
    signal?: AbortSignal,
  ): Promise<ProjectFileWriteResult>;
  writeBinaryFile(
    userId: number,
    projectId: number,
    path: string,
    content: Buffer,
  ): Promise<ProjectFileWriteResult>;
  openFileDownload(userId: number, projectId: number, path: string): Promise<ProjectFileDownload>;
  createDirectory(userId: number, projectId: number, path: string): Promise<ProjectFileEntry>;
  deleteEntry(userId: number, projectId: number, path: string): Promise<void>;
  renameEntry(
    userId: number,
    projectId: number,
    sourcePath: string,
    destinationPath: string,
  ): Promise<ProjectFileEntry>;
}

interface ResolvedEntry {
  lexicalPath: string;
  canonicalPath: string;
}

function isFileSystemError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function normalizeRelativePath(value: string, allowRoot: boolean): string {
  if (
    typeof value !== 'string' ||
    value.length > 2_048 ||
    value.includes('\0') ||
    value.includes('\\') ||
    value.includes(':') ||
    value.startsWith('/') ||
    isAbsolute(value) ||
    /^[a-zA-Z]:/.test(value) ||
    /%(?:2e|2f|5c)/i.test(value)
  ) {
    throw new ProjectFilesystemStoreError('PROJECT_PATH_INVALID');
  }
  if (value === '') {
    if (allowRoot) {
      return '';
    }
    throw new ProjectFilesystemStoreError('PROJECT_PATH_INVALID');
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new ProjectFilesystemStoreError(
      segments.includes('..') ? 'PROJECT_PATH_ESCAPE' : 'PROJECT_PATH_INVALID',
    );
  }
  return segments.join('/');
}

function isWithinRoot(root: string, target: string, allowRoot: boolean): boolean {
  const fromRoot = relative(root, target);
  if (fromRoot === '') {
    return allowRoot;
  }
  return fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

export class FileProjectFilesystemStore implements ProjectFilesystemStore {
  constructor(private readonly rootStore: ProjectRootStore) {}

  async listDirectory(
    userId: number,
    projectId: number,
    path: string,
  ): Promise<ProjectDirectoryListing> {
    const relativePath = normalizeRelativePath(path, true);
    const root = this.getRoot(userId, projectId);
    const directory = await this.resolveExisting(root, relativePath, true);
    try {
      if (!(await stat(directory.canonicalPath)).isDirectory()) {
        throw new ProjectFilesystemStoreError('PROJECT_FILE_UNSUPPORTED');
      }
      const names = await readdir(directory.lexicalPath);
      const entries: ProjectFileEntry[] = [];
      for (const name of names) {
        const childRelativePath = relativePath ? `${relativePath}/${name}` : name;
        const child = await this.resolveExisting(root, childRelativePath, false);
        const metadata = await stat(child.canonicalPath);
        if (!metadata.isFile() && !metadata.isDirectory()) {
          throw new ProjectFilesystemStoreError('PROJECT_FILE_UNSUPPORTED');
        }
        entries.push({
          name,
          relativePath: childRelativePath,
          type: metadata.isDirectory() ? 'directory' : 'file',
          ...(metadata.isFile() ? { size: metadata.size } : {}),
          modifiedAt: Math.trunc(metadata.mtimeMs),
        });
      }
      entries.sort(
        (left, right) =>
          (left.type === right.type ? 0 : left.type === 'directory' ? -1 : 1) ||
          left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }) ||
          left.name.localeCompare(right.name, 'en'),
      );
      return { relativePath, entries };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async readFile(userId: number, projectId: number, path: string): Promise<ProjectTextFile> {
    const relativePath = normalizeRelativePath(path, false);
    const root = this.getRoot(userId, projectId);
    const target = await this.resolveExisting(root, relativePath, false);
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      if (!(await stat(target.canonicalPath)).isFile()) {
        throw new ProjectFilesystemStoreError('PROJECT_FILE_UNSUPPORTED');
      }
      handle = await open(target.canonicalPath, 'r');
      const buffer = Buffer.alloc(MAX_PROJECT_TEXT_FILE_BYTES + 1);
      let size = 0;
      while (size < buffer.length) {
        const result = await handle.read(buffer, size, buffer.length - size, null);
        if (result.bytesRead === 0) {
          break;
        }
        size += result.bytesRead;
      }
      if (size > MAX_PROJECT_TEXT_FILE_BYTES) {
        throw new ProjectFilesystemStoreError(
          'PROJECT_FILE_TOO_LARGE',
          MAX_PROJECT_TEXT_FILE_BYTES,
        );
      }
      const bytes = buffer.subarray(0, size);
      const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (content.includes('\0')) {
        throw new ProjectFilesystemStoreError('PROJECT_FILE_UNSUPPORTED');
      }
      return { relativePath, content, size };
    } catch (error) {
      if (error instanceof TypeError) {
        throw new ProjectFilesystemStoreError('PROJECT_FILE_UNSUPPORTED');
      }
      throw this.mapError(error);
    } finally {
      await handle?.close();
    }
  }

  async writeFile(
    userId: number,
    projectId: number,
    path: string,
    content: string,
    signal?: AbortSignal,
  ): Promise<ProjectFileWriteResult> {
    const relativePath = normalizeRelativePath(path, false);
    if (typeof content !== 'string' || content.includes('\0')) {
      throw new ProjectFilesystemStoreError('PROJECT_FILE_UNSUPPORTED');
    }
    const size = Buffer.byteLength(content, 'utf8');
    if (size > MAX_PROJECT_TEXT_FILE_BYTES) {
      throw new ProjectFilesystemStoreError(
        'PROJECT_FILE_TOO_LARGE',
        MAX_PROJECT_TEXT_FILE_BYTES,
      );
    }
    const root = this.getRoot(userId, projectId);
    const lexicalPath = this.resolveLexical(root, relativePath, false);
    await this.requireExistingDirectory(root, dirname(lexicalPath));
    try {
      const existing = await this.resolveExisting(root, relativePath, false);
      if (!(await stat(existing.canonicalPath)).isFile()) {
        throw new ProjectFilesystemStoreError('PROJECT_FILE_UNSUPPORTED');
      }
    } catch (error) {
      if (!(error instanceof ProjectFilesystemStoreError && error.code === 'PROJECT_FILE_NOT_FOUND')) {
        throw this.mapError(error);
      }
    }

    const temporaryPath = resolve(dirname(lexicalPath), `.${basename(lexicalPath)}.${randomUUID()}.tmp`);
    try {
      signal?.throwIfAborted();
      const handle = await open(temporaryPath, 'wx');
      try {
        await handle.writeFile(content, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      signal?.throwIfAborted();
      await rename(temporaryPath, lexicalPath);
      return { relativePath, size };
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw this.mapError(error);
    }
  }

  async writeBinaryFile(
    userId: number,
    projectId: number,
    path: string,
    content: Buffer,
  ): Promise<ProjectFileWriteResult> {
    const relativePath = normalizeRelativePath(path, false);
    const root = this.getRoot(userId, projectId);
    const lexicalPath = this.resolveLexical(root, relativePath, false);
    await this.requireExistingDirectory(root, dirname(lexicalPath));
    try {
      const existing = await this.resolveExisting(root, relativePath, false);
      if (!(await stat(existing.canonicalPath)).isFile()) {
        throw new ProjectFilesystemStoreError('PROJECT_FILE_CONFLICT');
      }
    } catch (error) {
      if (!(error instanceof ProjectFilesystemStoreError && error.code === 'PROJECT_FILE_NOT_FOUND')) {
        throw this.mapError(error);
      }
    }
    const temporaryPath = resolve(dirname(lexicalPath), `.${basename(lexicalPath)}.${randomUUID()}.tmp`);
    try {
      const handle = await open(temporaryPath, 'wx');
      try {
        await handle.writeFile(content);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporaryPath, lexicalPath);
      return { relativePath, size: content.byteLength };
    } catch (error) {
      throw this.mapError(error);
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  async openFileDownload(
    userId: number,
    projectId: number,
    path: string,
  ): Promise<ProjectFileDownload> {
    const relativePath = normalizeRelativePath(path, false);
    const root = this.getRoot(userId, projectId);
    const target = await this.resolveExisting(root, relativePath, false);
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      handle = await open(target.canonicalPath, 'r');
      const metadata = await handle.stat();
      if (!metadata.isFile()) {
        throw new ProjectFilesystemStoreError('PROJECT_FILE_UNSUPPORTED');
      }
      const stream = handle.createReadStream({ autoClose: true });
      handle = null;
      return { relativePath, size: metadata.size, stream };
    } catch (error) {
      throw this.mapError(error);
    } finally {
      await handle?.close();
    }
  }

  async createDirectory(
    userId: number,
    projectId: number,
    path: string,
  ): Promise<ProjectFileEntry> {
    const relativePath = normalizeRelativePath(path, false);
    const root = this.getRoot(userId, projectId);
    const lexicalPath = this.resolveLexical(root, relativePath, false);
    await this.requireExistingDirectory(root, dirname(lexicalPath));
    try {
      await mkdir(lexicalPath);
      const metadata = await stat(lexicalPath);
      return {
        name: basename(lexicalPath),
        relativePath,
        type: 'directory',
        modifiedAt: Math.trunc(metadata.mtimeMs),
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async deleteEntry(userId: number, projectId: number, path: string): Promise<void> {
    const relativePath = normalizeRelativePath(path, false);
    const root = this.getRoot(userId, projectId);
    const target = await this.resolveExisting(root, relativePath, false);
    try {
      await rm(target.lexicalPath, { recursive: true });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async renameEntry(
    userId: number,
    projectId: number,
    sourcePath: string,
    destinationPath: string,
  ): Promise<ProjectFileEntry> {
    const normalizedSource = normalizeRelativePath(sourcePath, false);
    const normalizedDestination = normalizeRelativePath(destinationPath, false);
    const root = this.getRoot(userId, projectId);
    const source = await this.resolveExisting(root, normalizedSource, false);
    const sourceMetadata = await stat(source.canonicalPath).catch((error: unknown) => {
      throw this.mapError(error);
    });
    if (
      sourceMetadata.isDirectory() &&
      normalizedDestination.startsWith(`${normalizedSource}/`)
    ) {
      throw new ProjectFilesystemStoreError('PROJECT_PATH_INVALID');
    }
    const destination = this.resolveLexical(root, normalizedDestination, false);
    await this.requireExistingDirectory(root, dirname(destination));
    try {
      await lstat(destination);
      throw new ProjectFilesystemStoreError('PROJECT_FILE_CONFLICT');
    } catch (error) {
      if (!isFileSystemError(error, 'ENOENT')) {
        throw this.mapError(error);
      }
    }
    try {
      await rename(source.lexicalPath, destination);
      const metadata = await stat(destination);
      return {
        name: basename(destination),
        relativePath: normalizedDestination,
        type: metadata.isDirectory() ? 'directory' : 'file',
        ...(metadata.isFile() ? { size: metadata.size } : {}),
        modifiedAt: Math.trunc(metadata.mtimeMs),
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private getRoot(userId: number, projectId: number): string {
    try {
      return this.rootStore.getCanonicalProjectRoot(userId, projectId);
    } catch {
      throw new ProjectFilesystemStoreError('PROJECT_PATH_ESCAPE');
    }
  }

  private resolveLexical(root: string, relativePath: string, allowRoot: boolean): string {
    const target = resolve(root, ...relativePath.split('/'));
    if (!isWithinRoot(root, target, allowRoot)) {
      throw new ProjectFilesystemStoreError('PROJECT_PATH_ESCAPE');
    }
    return target;
  }

  private async resolveExisting(
    root: string,
    relativePath: string,
    allowRoot: boolean,
  ): Promise<ResolvedEntry> {
    const lexicalPath = this.resolveLexical(root, relativePath, allowRoot);
    try {
      await lstat(lexicalPath);
      const canonicalPath = await realpath(lexicalPath);
      if (!isWithinRoot(root, canonicalPath, allowRoot)) {
        throw new ProjectFilesystemStoreError('PROJECT_PATH_ESCAPE');
      }
      return { lexicalPath, canonicalPath };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private async requireExistingDirectory(root: string, parentPath: string): Promise<void> {
    if (!isWithinRoot(root, parentPath, true)) {
      throw new ProjectFilesystemStoreError('PROJECT_PATH_ESCAPE');
    }
    let nearestExisting = parentPath;
    while (true) {
      try {
        await lstat(nearestExisting);
        break;
      } catch (error) {
        if (!isFileSystemError(error, 'ENOENT')) {
          throw this.mapError(error);
        }
        const next = dirname(nearestExisting);
        if (next === nearestExisting) {
          throw new ProjectFilesystemStoreError('PROJECT_PATH_ESCAPE');
        }
        nearestExisting = next;
      }
    }
    const canonicalParent = await realpath(nearestExisting).catch((error: unknown) => {
      throw this.mapError(error);
    });
    if (!isWithinRoot(root, canonicalParent, true)) {
      throw new ProjectFilesystemStoreError('PROJECT_PATH_ESCAPE');
    }
    if (nearestExisting !== parentPath) {
      throw new ProjectFilesystemStoreError('PROJECT_FILE_NOT_FOUND');
    }
    if (!(await stat(canonicalParent)).isDirectory()) {
      throw new ProjectFilesystemStoreError('PROJECT_FILE_UNSUPPORTED');
    }
  }

  private mapError(error: unknown): ProjectFilesystemStoreError {
    if (error instanceof ProjectFilesystemStoreError) {
      return error;
    }
    if (isFileSystemError(error, 'ENOENT')) {
      return new ProjectFilesystemStoreError('PROJECT_FILE_NOT_FOUND');
    }
    if (isFileSystemError(error, 'EEXIST')) {
      return new ProjectFilesystemStoreError('PROJECT_FILE_CONFLICT');
    }
    return new ProjectFilesystemStoreError('PROJECT_FILESYSTEM_FAILED');
  }
}
