import type { Project, ProjectInput, ProjectRecord, ProjectUpdateInput } from '../project-types.js';
import type { ProjectRepository } from '../repositories/project-repository.js';
import type { ProjectRootStore } from '../stores/project-root-store.js';

const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2_000;

type ProjectErrorCode = 'INVALID_INPUT' | 'PERSISTENCE_FAILED';

export class ProjectError extends Error {
  constructor(readonly code: ProjectErrorCode) {
    super(code);
    this.name = 'ProjectError';
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProjectError('INVALID_INPUT');
  }
  return value as Record<string, unknown>;
}

function parseName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ProjectError('INVALID_INPUT');
  }
  const name = value.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    throw new ProjectError('INVALID_INPUT');
  }
  return name;
}

function parseDescription(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ProjectError('INVALID_INPUT');
  }
  const description = value.trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ProjectError('INVALID_INPUT');
  }
  return description;
}

function parseCreateInput(value: unknown): ProjectInput {
  const input = requireRecord(value);
  const fields = Object.keys(input);
  if (
    fields.length < 1 ||
    fields.length > 2 ||
    !fields.includes('name') ||
    fields.some((field) => field !== 'name' && field !== 'description')
  ) {
    throw new ProjectError('INVALID_INPUT');
  }
  return {
    name: parseName(input.name),
    description: input.description === undefined ? '' : parseDescription(input.description),
  };
}

function parseUpdateInput(value: unknown): ProjectUpdateInput {
  const input = requireRecord(value);
  const fields = Object.keys(input);
  if (fields.length === 0 || fields.some((field) => field !== 'name' && field !== 'description')) {
    throw new ProjectError('INVALID_INPUT');
  }
  return {
    ...('name' in input ? { name: parseName(input.name) } : {}),
    ...('description' in input ? { description: parseDescription(input.description) } : {}),
  };
}

function toProject(record: ProjectRecord): Project {
  return {
    id: record.id,
    name: record.data.name,
    description: record.data.description,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class ProjectService {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly rootStore: ProjectRootStore,
    private readonly currentUserId: () => number,
  ) {}

  async create(value: unknown): Promise<Project> {
    const input = parseCreateInput(value);
    const userId = this.currentUserId();
    const pending: { record: ProjectRecord | null } = { record: null };
    try {
      const created = this.repository.transaction(() => {
        const record = this.repository.create(userId, input);
        pending.record = record;
        this.rootStore.createRoot(userId, record.id);
        return record;
      });
      return toProject(created);
    } catch {
      if (pending.record) {
        try {
          this.rootStore.deleteRoot(userId, pending.record.id);
        } catch {
          // Preserve the original persistence failure.
        }
      }
      throw new ProjectError('PERSISTENCE_FAILED');
    }
  }

  async list(): Promise<Project[]> {
    return this.repository.listByUserId(this.currentUserId()).map(toProject);
  }

  async get(id: number): Promise<Project | null> {
    const record = this.repository.getById(this.currentUserId(), id);
    return record ? toProject(record) : null;
  }

  async update(id: number, value: unknown): Promise<Project | null> {
    const input = parseUpdateInput(value);
    const userId = this.currentUserId();
    const existing = this.repository.getById(userId, id);
    if (!existing) {
      return null;
    }
    const updated = this.repository.update(userId, id, {
      name: input.name ?? existing.data.name,
      description: input.description ?? existing.data.description,
    });
    return updated ? toProject(updated) : null;
  }

  async delete(id: number): Promise<boolean> {
    const userId = this.currentUserId();
    if (!this.repository.getById(userId, id)) {
      return false;
    }
    try {
      return this.repository.transaction(() => {
        if (!this.repository.delete(userId, id)) {
          return false;
        }
        this.rootStore.deleteRoot(userId, id);
        return true;
      });
    } catch {
      throw new ProjectError('PERSISTENCE_FAILED');
    }
  }
}
