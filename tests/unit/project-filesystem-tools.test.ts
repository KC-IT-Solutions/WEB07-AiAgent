import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createProjectFilesystemTools,
  PROJECT_FILESYSTEM_TOOL_NAMES,
} from '../../src/server/tools/project-filesystem-tools.js';
import type { ProjectFilesystemService } from '../../src/server/services/project-filesystem-service.js';

type ToolFilesystem = Pick<
  ProjectFilesystemService,
  'listDirectory' | 'readFile' | 'writeFile' | 'createDirectory' | 'renameEntry' | 'deleteEntry'
>;

await describe('Project filesystem Agent tools', () => {
  it('executes all operations with only the server-supplied Project identity', async () => {
    const calls: Array<{ operation: string; projectId: number; value: unknown }> = [];
    const filesystem: ToolFilesystem = {
      listDirectory: async (projectId, path) => {
        calls.push({ operation: 'list', projectId, value: path });
        return {
          relativePath: String(path),
          entries: [
            { name: 'src', relativePath: 'src', type: 'directory', modifiedAt: 1 },
            { name: 'README.md', relativePath: 'README.md', type: 'file', size: 4, modifiedAt: 1 },
          ],
        };
      },
      readFile: async (projectId, path) => {
        calls.push({ operation: 'read', projectId, value: path });
        return { relativePath: String(path), content: 'text', size: 4 };
      },
      writeFile: async (projectId, value) => {
        calls.push({ operation: 'write', projectId, value });
        return { relativePath: 'src/new.ts', size: 7 };
      },
      createDirectory: async (projectId, value) => {
        calls.push({ operation: 'create', projectId, value });
        return { name: 'new', relativePath: 'src/new', type: 'directory', modifiedAt: 1 };
      },
      renameEntry: async (projectId, value) => {
        calls.push({ operation: 'rename', projectId, value });
        return { name: 'new.ts', relativePath: 'src/new.ts', type: 'file', size: 7, modifiedAt: 1 };
      },
      deleteEntry: async (projectId, value) => {
        calls.push({ operation: 'delete', projectId, value });
      },
    };
    const tools = createProjectFilesystemTools(filesystem, 42);
    assert.deepEqual(tools.map((tool) => tool.name), PROJECT_FILESYSTEM_TOOL_NAMES);
    assert.deepEqual(await tools[0]!.execute({ path: '' }), {
      path: '',
      entries: [
        { name: 'src', type: 'directory' },
        { name: 'README.md', type: 'file' },
      ],
    });
    assert.deepEqual(await tools[1]!.execute({ path: 'README.md' }), {
      path: 'README.md',
      content: 'text',
      size: 4,
    });
    assert.deepEqual(await tools[2]!.execute({ path: 'src/new.ts', content: 'created' }), {
      path: 'src/new.ts',
      size: 7,
    });
    await tools[3]!.execute({ path: 'src/new' });
    await tools[4]!.execute({ sourcePath: 'src/old.ts', destinationPath: 'src/new.ts' });
    await tools[5]!.execute({ path: 'src/old.ts' });
    assert.deepEqual(calls.map((call) => call.projectId), [42, 42, 42, 42, 42, 42]);
    assert.equal(JSON.stringify(calls).includes('userId'), false);
    assert.equal(JSON.stringify(await tools[0]!.execute({ path: '' })).includes('relativePath'), false);
  });

  it('validates every operation before crossing the ProjectFilesystemService boundary', async () => {
    let calls = 0;
    const rejectUnexpected = async (): Promise<never> => {
      calls += 1;
      throw new Error('Must not execute');
    };
    const filesystem: ToolFilesystem = {
      listDirectory: rejectUnexpected,
      readFile: rejectUnexpected,
      writeFile: rejectUnexpected,
      createDirectory: rejectUnexpected,
      renameEntry: rejectUnexpected,
      deleteEntry: rejectUnexpected,
    };
    const tools = createProjectFilesystemTools(filesystem, 42);
    const invalidValues = [
      null,
      { path: 1 },
      { path: '', extra: true },
      { content: 'missing path' },
      { sourcePath: 'src/a.ts' },
      { sourcePath: 'src/a.ts', destinationPath: 1 },
    ];
    for (const tool of tools) {
      for (const value of invalidValues) {
        await assert.rejects(tool.execute(value), TypeError);
      }
    }
    assert.equal(calls, 0);
  });
});
