import type { ProjectRepository } from '../repositories/project-repository.js';
import {
  ProjectFilesystemStoreError,
  type ProjectDirectoryListing,
  type ProjectFileDownload,
  type ProjectFileEntry,
  type ProjectFileWriteResult,
  type ProjectFilesystemStore,
  type ProjectFilesystemStoreErrorCode,
  type ProjectTextFile,
} from '../stores/project-filesystem-store.js';

export const DEFAULT_PROJECT_FILE_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

export type ProjectFilesystemErrorCode = 'PROJECT_NOT_FOUND' | ProjectFilesystemStoreErrorCode;

export class ProjectFilesystemError extends Error {
  constructor(readonly code: ProjectFilesystemErrorCode) {
    super(code);
    this.name = 'ProjectFilesystemError';
  }
}

function requireRecord(value: unknown, expectedFields: string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProjectFilesystemError('PROJECT_PATH_INVALID');
  }
  const input = value as Record<string, unknown>;
  const fields = Object.keys(input);
  if (
    fields.length !== expectedFields.length ||
    expectedFields.some((field) => !fields.includes(field))
  ) {
    throw new ProjectFilesystemError('PROJECT_PATH_INVALID');
  }
  return input;
}

function requireString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ProjectFilesystemError('PROJECT_PATH_INVALID');
  }
  return value;
}

function requireUploadFilename(value: unknown): string {
  const filename = requireString(value);
  if (
    filename.length === 0 ||
    filename.length > 255 ||
    filename === '.' ||
    filename === '..' ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes(':') ||
    [...filename].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    }) ||
    /%(?:2e|2f|5c)/i.test(filename)
  ) {
    throw new ProjectFilesystemError('PROJECT_PATH_INVALID');
  }
  return filename;
}

export class ProjectFilesystemService {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly filesystem: ProjectFilesystemStore,
    private readonly currentUserId: () => number,
    private readonly maxUploadBytes = DEFAULT_PROJECT_FILE_UPLOAD_MAX_BYTES,
  ) {}

  async listDirectory(projectId: number, path: unknown): Promise<ProjectDirectoryListing> {
    const userId = this.requireOwnedProject(projectId);
    return this.run(() => this.filesystem.listDirectory(userId, projectId, requireString(path)));
  }

  async readFile(projectId: number, path: unknown): Promise<ProjectTextFile> {
    const userId = this.requireOwnedProject(projectId);
    return this.run(() => this.filesystem.readFile(userId, projectId, requireString(path)));
  }

  async writeFile(
    projectId: number,
    value: unknown,
    signal?: AbortSignal,
  ): Promise<ProjectFileWriteResult> {
    const userId = this.requireOwnedProject(projectId);
    const input = requireRecord(value, ['path', 'content']);
    return this.run(() =>
      this.filesystem.writeFile(
        userId,
        projectId,
        requireString(input.path),
        requireString(input.content),
        signal,
      ),
    );
  }

  async uploadFile(
    projectId: number,
    directory: unknown,
    filename: unknown,
    content: unknown,
  ): Promise<ProjectFileWriteResult> {
    const userId = this.requireOwnedProject(projectId);
    const targetDirectory = requireString(directory);
    const safeFilename = requireUploadFilename(filename);
    if (!Buffer.isBuffer(content)) {
      throw new ProjectFilesystemError('PROJECT_PATH_INVALID');
    }
    if (content.byteLength > this.maxUploadBytes) {
      throw new ProjectFilesystemError('PROJECT_FILE_TOO_LARGE');
    }
    const path = targetDirectory ? `${targetDirectory}/${safeFilename}` : safeFilename;
    return this.run(() => this.filesystem.writeBinaryFile(userId, projectId, path, content));
  }

  async openFileDownload(projectId: number, path: unknown): Promise<ProjectFileDownload> {
    const userId = this.requireOwnedProject(projectId);
    return this.run(() =>
      this.filesystem.openFileDownload(userId, projectId, requireString(path)),
    );
  }

  async createDirectory(projectId: number, value: unknown): Promise<ProjectFileEntry> {
    const userId = this.requireOwnedProject(projectId);
    const input = requireRecord(value, ['path']);
    return this.run(() =>
      this.filesystem.createDirectory(userId, projectId, requireString(input.path)),
    );
  }

  async deleteEntry(projectId: number, value: unknown): Promise<void> {
    const userId = this.requireOwnedProject(projectId);
    const input = requireRecord(value, ['path']);
    await this.run(() => this.filesystem.deleteEntry(userId, projectId, requireString(input.path)));
  }

  async renameEntry(projectId: number, value: unknown): Promise<ProjectFileEntry> {
    const userId = this.requireOwnedProject(projectId);
    const input = requireRecord(value, ['sourcePath', 'destinationPath']);
    return this.run(() =>
      this.filesystem.renameEntry(
        userId,
        projectId,
        requireString(input.sourcePath),
        requireString(input.destinationPath),
      ),
    );
  }

  private requireOwnedProject(projectId: number): number {
    const userId = this.currentUserId();
    if (!this.repository.getById(userId, projectId)) {
      throw new ProjectFilesystemError('PROJECT_NOT_FOUND');
    }
    return userId;
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ProjectFilesystemError) {
        throw error;
      }
      if (error instanceof ProjectFilesystemStoreError) {
        throw new ProjectFilesystemError(error.code);
      }
      throw new ProjectFilesystemError('PROJECT_FILESYSTEM_FAILED');
    }
  }
}
