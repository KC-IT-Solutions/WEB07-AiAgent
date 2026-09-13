import type { ProjectFilesystemService } from '../services/project-filesystem-service.js';

export const PROJECT_FILESYSTEM_TOOL_NAMES = [
  'project_list_directory',
  'project_read_file',
  'project_write_file',
  'project_create_directory',
  'project_rename',
  'project_delete',
] as const;

export interface ProjectFilesystemTool {
  name: (typeof PROJECT_FILESYSTEM_TOOL_NAMES)[number];
  description: string;
  inputSchema: Record<string, unknown>;
  execute(argumentsValue: unknown): Promise<unknown>;
}

type AgentProjectFilesystem = Pick<
  ProjectFilesystemService,
  'listDirectory' | 'readFile' | 'writeFile' | 'createDirectory' | 'renameEntry' | 'deleteEntry'
>;

function requireObject(
  value: unknown,
  expectedFields: readonly string[],
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Invalid Project tool arguments');
  }
  const input = value as Record<string, unknown>;
  const fields = Object.keys(input);
  if (
    fields.length !== expectedFields.length ||
    expectedFields.some((field) => !fields.includes(field)) ||
    expectedFields.some((field) => typeof input[field] !== 'string')
  ) {
    throw new TypeError('Invalid Project tool arguments');
  }
  return input;
}

const pathProperty = {
  type: 'string',
  description: 'A path relative to the Project root. Use an empty string for the root.',
};

const singlePathSchema = {
  type: 'object',
  properties: { path: pathProperty },
  required: ['path'],
  additionalProperties: false,
};

export function createProjectFilesystemTools(
  filesystem: AgentProjectFilesystem,
  projectId: number,
): ProjectFilesystemTool[] {
  const boundary =
    'Paths are relative to the Project root, never absolute; use "" for the root, and the Project boundary cannot be escaped.';
  return [
    {
      name: 'project_list_directory',
      description: `Lists files and directories in a Project directory. ${boundary}`,
      inputSchema: singlePathSchema,
      execute: async (value) => {
        const input = requireObject(value, ['path']);
        const listing = await filesystem.listDirectory(projectId, input.path);
        return {
          path: listing.relativePath,
          entries: listing.entries.map((entry) => ({ name: entry.name, type: entry.type })),
        };
      },
    },
    {
      name: 'project_read_file',
      description: `Reads a bounded UTF-8 text file from the Project. ${boundary}`,
      inputSchema: singlePathSchema,
      execute: async (value) => {
        const input = requireObject(value, ['path']);
        const file = await filesystem.readFile(projectId, input.path);
        return { path: file.relativePath, content: file.content, size: file.size };
      },
    },
    {
      name: 'project_write_file',
      description: `Creates or replaces a bounded UTF-8 text file in the Project. ${boundary}`,
      inputSchema: {
        type: 'object',
        properties: { path: pathProperty, content: { type: 'string' } },
        required: ['path', 'content'],
        additionalProperties: false,
      },
      execute: async (value) => {
        const input = requireObject(value, ['path', 'content']);
        const result = await filesystem.writeFile(projectId, input);
        return { path: result.relativePath, size: result.size };
      },
    },
    {
      name: 'project_create_directory',
      description: `Creates one Project directory whose parent already exists. ${boundary}`,
      inputSchema: singlePathSchema,
      execute: async (value) => {
        const input = requireObject(value, ['path']);
        const result = await filesystem.createDirectory(projectId, input);
        return { path: result.relativePath, type: result.type };
      },
    },
    {
      name: 'project_rename',
      description: `Renames or moves a file or directory within the same Project. ${boundary}`,
      inputSchema: {
        type: 'object',
        properties: { sourcePath: pathProperty, destinationPath: pathProperty },
        required: ['sourcePath', 'destinationPath'],
        additionalProperties: false,
      },
      execute: async (value) => {
        const input = requireObject(value, ['sourcePath', 'destinationPath']);
        const result = await filesystem.renameEntry(projectId, input);
        return { path: result.relativePath, type: result.type };
      },
    },
    {
      name: 'project_delete',
      description: `Deletes a Project file or directory using Project Files recursive-directory semantics. ${boundary}`,
      inputSchema: singlePathSchema,
      execute: async (value) => {
        const input = requireObject(value, ['path']);
        await filesystem.deleteEntry(projectId, input);
        return { path: input.path, deleted: true };
      },
    },
  ];
}
