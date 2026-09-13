import type { Skill, SkillCommand, SkillInput, SkillRecord } from '../skill-types.js';
import { SkillRepositoryError } from '../repositories/skill-repository.js';
import type { SkillRepository } from '../repositories/skill-repository.js';
import type { SkillToolRepository } from '../repositories/skill-tool-repository.js';
import {
  normalizeSkillMarkdown,
  SkillContentStoreError,
  type SkillContentStore,
} from '../stores/skill-content-store.js';
import type { ToolRegistry } from '../tools/tool-registry.js';

const COMMAND_NAME_PATTERN = /^[a-z][a-z0-9_-]*$/;
const RESERVED_COMMAND_NAMES = new Set(['clear', 'new', 'skills']);
const MAX_NAME_LENGTH = 120;
const MAX_COMMAND_NAME_LENGTH = 64;

type SkillErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_COMMAND'
  | 'RESERVED_COMMAND'
  | 'DUPLICATE_COMMAND'
  | 'UNKNOWN_TOOL'
  | 'CONTENT_TOO_LARGE'
  | 'PERSISTENCE_FAILED';

export class SkillError extends Error {
  constructor(readonly code: SkillErrorCode) {
    super(code);
    this.name = 'SkillError';
  }
}

interface SkillLogger {
  application(
    level: 'error' | 'warn' | 'info',
    event: string,
    fields?: Record<string, unknown>,
  ): Promise<void>;
}

function parseInput(value: unknown, registry: Pick<ToolRegistry, 'get'>): SkillInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SkillError('INVALID_INPUT');
  }
  const input = value as Record<string, unknown>;
  const fields = Object.keys(input);
  const expectedFields = ['name', 'commandName', 'markdown', 'requiredTools'];
  if (
    fields.length !== expectedFields.length ||
    expectedFields.some((field) => !fields.includes(field)) ||
    typeof input.name !== 'string' ||
    input.name.trim().length === 0 ||
    input.name.trim().length > MAX_NAME_LENGTH ||
    typeof input.commandName !== 'string' ||
    typeof input.markdown !== 'string' ||
    !Array.isArray(input.requiredTools)
  ) {
    throw new SkillError('INVALID_INPUT');
  }

  const commandName = input.commandName;
  if (commandName.length > MAX_COMMAND_NAME_LENGTH || !COMMAND_NAME_PATTERN.test(commandName)) {
    throw new SkillError('INVALID_COMMAND');
  }
  if (RESERVED_COMMAND_NAMES.has(commandName)) {
    throw new SkillError('RESERVED_COMMAND');
  }

  let markdown: string;
  try {
    markdown = normalizeSkillMarkdown(input.markdown);
  } catch (error) {
    if (error instanceof SkillContentStoreError && error.code === 'INVALID_CONTENT') {
      throw new SkillError('INVALID_INPUT');
    }
    throw error;
  }
  const requiredTools: string[] = [];
  const seenTools = new Set<string>();
  for (const toolName of input.requiredTools) {
    if (typeof toolName !== 'string' || toolName.length === 0) {
      throw new SkillError('INVALID_INPUT');
    }
    if (seenTools.has(toolName)) {
      throw new SkillError('INVALID_INPUT');
    }
    if (!registry.get(toolName)) {
      throw new SkillError('UNKNOWN_TOOL');
    }
    seenTools.add(toolName);
    requiredTools.push(toolName);
  }

  return { name: input.name.trim(), commandName, markdown, requiredTools };
}

export class SkillService {
  constructor(
    private readonly skillRepository: SkillRepository,
    private readonly skillToolRepository: SkillToolRepository,
    private readonly contentStore: SkillContentStore,
    private readonly toolRegistry: Pick<ToolRegistry, 'get'>,
    private readonly logger?: SkillLogger,
  ) {}

  async list(): Promise<Skill[]> {
    try {
      return await Promise.all(this.skillRepository.list().map((record) => this.toSkill(record)));
    } catch (error) {
      await this.logFailure('skill_list_failed', error);
      throw this.mapPersistenceError(error);
    }
  }

  async listAvailable(): Promise<SkillCommand[]> {
    try {
      return this.skillRepository.list().map((record) => ({
        id: record.id,
        commandName: record.commandName,
        name: record.data.name,
      }));
    } catch (error) {
      await this.logFailure('skill_available_list_failed', error);
      throw this.mapPersistenceError(error);
    }
  }

  async get(id: number): Promise<Skill | null> {
    const record = await this.getRecord(id);
    if (!record) {
      return null;
    }
    try {
      return await this.toSkill(record);
    } catch (error) {
      await this.logFailure('skill_read_failed', error, record);
      throw this.mapPersistenceError(error);
    }
  }

  async findCommand(commandName: string): Promise<SkillCommand | null> {
    try {
      const record = this.skillRepository.getByCommandName(commandName);
      return record
        ? { id: record.id, commandName: record.commandName, name: record.data.name }
        : null;
    } catch (error) {
      await this.logFailure('skill_command_lookup_failed', error, undefined, commandName);
      throw this.mapPersistenceError(error);
    }
  }

  async create(value: unknown): Promise<Skill> {
    const input = parseInput(value, this.toolRegistry);
    let created: SkillRecord;
    try {
      created = this.skillRepository.transaction(() => {
        const record = this.skillRepository.create(input.commandName, { name: input.name });
        this.skillToolRepository.replace(record.id, input.requiredTools);
        return record;
      });
    } catch (error) {
      await this.logFailure('skill_create_database_failed', error, undefined, input.commandName);
      throw this.mapPersistenceError(error);
    }

    try {
      await this.contentStore.write(created.id, input.markdown);
    } catch (error) {
      try {
        this.skillRepository.transaction(() => this.skillRepository.delete(created.id));
      } catch (compensationError) {
        await this.logFailure('skill_create_compensation_failed', compensationError, created);
      }
      await this.logFailure('skill_content_write_failed', error, created);
      throw new SkillError('PERSISTENCE_FAILED');
    }
    return this.buildSkill(created, input.markdown, input.requiredTools);
  }

  async update(id: number, value: unknown): Promise<Skill | null> {
    const input = parseInput(value, this.toolRegistry);
    const existing = await this.getRecord(id);
    if (!existing) {
      return null;
    }

    let previousMarkdown: string;
    try {
      previousMarkdown = await this.contentStore.read(id);
      await this.contentStore.write(id, input.markdown);
    } catch (error) {
      await this.logFailure('skill_content_update_failed', error, existing);
      throw new SkillError('PERSISTENCE_FAILED');
    }

    let updated: SkillRecord | null;
    try {
      updated = this.skillRepository.transaction(() => {
        const record = this.skillRepository.update(id, input.commandName, { name: input.name });
        if (record) {
          this.skillToolRepository.replace(id, input.requiredTools);
        }
        return record;
      });
    } catch (error) {
      try {
        await this.contentStore.write(id, previousMarkdown);
      } catch (restoreError) {
        await this.logFailure('skill_update_restore_failed', restoreError, existing);
      }
      await this.logFailure('skill_update_database_failed', error, existing);
      throw this.mapPersistenceError(error);
    }
    return updated ? this.buildSkill(updated, input.markdown, input.requiredTools) : null;
  }

  async delete(id: number): Promise<boolean> {
    const existing = await this.getRecord(id);
    if (!existing) {
      return false;
    }

    let previousMarkdown: string;
    try {
      previousMarkdown = await this.contentStore.read(id);
      await this.contentStore.delete(id);
    } catch (error) {
      await this.logFailure('skill_content_delete_failed', error, existing);
      throw new SkillError('PERSISTENCE_FAILED');
    }

    try {
      return this.skillRepository.transaction(() => this.skillRepository.delete(id));
    } catch (error) {
      try {
        await this.contentStore.write(id, previousMarkdown);
      } catch (restoreError) {
        await this.logFailure('skill_delete_restore_failed', restoreError, existing);
      }
      await this.logFailure('skill_delete_database_failed', error, existing);
      throw new SkillError('PERSISTENCE_FAILED');
    }
  }

  private async getRecord(id: number): Promise<SkillRecord | null> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new SkillError('INVALID_INPUT');
    }
    try {
      return this.skillRepository.getById(id);
    } catch (error) {
      await this.logFailure('skill_database_read_failed', error, undefined, undefined, id);
      throw this.mapPersistenceError(error);
    }
  }

  private async toSkill(record: SkillRecord): Promise<Skill> {
    const markdown = await this.contentStore.read(record.id);
    const requiredTools = this.skillToolRepository
      .listBySkillId(record.id)
      .map((tool) => tool.toolName);
    return this.buildSkill(record, markdown, requiredTools);
  }

  private buildSkill(
    record: SkillRecord,
    markdown: string,
    requiredTools: readonly string[],
  ): Skill {
    return {
      id: record.id,
      commandName: record.commandName,
      name: record.data.name,
      markdown,
      requiredTools: [...requiredTools],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private mapPersistenceError(error: unknown): SkillError {
    if (error instanceof SkillError) {
      return error;
    }
    if (error instanceof SkillRepositoryError && error.code === 'DUPLICATE_COMMAND') {
      return new SkillError('DUPLICATE_COMMAND');
    }
    if (error instanceof SkillContentStoreError && error.code === 'INVALID_CONTENT') {
      return new SkillError('CONTENT_TOO_LARGE');
    }
    return new SkillError('PERSISTENCE_FAILED');
  }

  private async logFailure(
    event: string,
    error: unknown,
    skill?: SkillRecord,
    commandName?: string,
    skillId?: number,
  ): Promise<void> {
    try {
      await this.logger?.application('error', event, {
        ...(skill ? { skillId: skill.id, commandName: skill.commandName } : {}),
        ...(skillId ? { skillId } : {}),
        ...(commandName ? { commandName } : {}),
        error: error instanceof Error ? error.message : 'Unknown Skill error',
      });
    } catch {
      // Logging failure must not replace the persistence error being reported.
    }
  }
}
