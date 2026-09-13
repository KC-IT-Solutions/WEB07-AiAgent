import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/server/database.js';
import { ProjectRepository } from '../../src/server/repositories/project-repository.js';
import { AgentRepository } from '../../src/server/repositories/agent-repository.js';
import { AgentRunRepository } from '../../src/server/repositories/agent-run-repository.js';
import { SkillRepository } from '../../src/server/repositories/skill-repository.js';
import { AgentRunService } from '../../src/server/services/agent-run-service.js';
import { ModelConnectionInferenceQueue } from '../../src/server/services/model-connection-inference-queue.js';
import type { ModelInferenceResult } from '../../src/services/model-inference.js';
import { ProjectFilesystemError } from '../../src/server/services/project-filesystem-service.js';
import { ToolRegistry } from '../../src/server/tools/tool-registry.js';
import {
  DEFAULT_DUCKDUCKGO_SETTINGS,
  type RegisteredTool,
} from '../../src/server/tool-types.js';
import type { Skill } from '../../src/server/skill-types.js';
import type { AgentData } from '../../src/server/agent-types.js';
import {
  AGENT_RUNTIME_LIMITS_DEFAULTS,
  type AgentRuntimeLimitsProvider,
} from '../../src/server/runtime-limits.js';

const connection = {
  id: 7,
  userId: 1,
  createdAt: 1,
  updatedAt: 1,
  hasApiKey: true,
  data: {
    name: 'Local',
    baseUrl: 'http://model.test',
    timeoutMinutes: 1,
    modelId: 'connection-default',
    enabled: true,
    filterConfigured: false,
    visibleModelIds: [],
    modelDescriptions: {},
  },
};

const defaultPermissions = {
  list: true,
  read: true,
  write: false,
  createDirectory: false,
  rename: false,
  delete: false,
} as const;

const baseAgentData = {
  name: 'Runner',
  description: '',
  instructionSource: 'inline' as const,
  instructions: 'Inline instructions',
  instructionFilePath: '',
  assignmentSource: 'inline' as const,
  assignment: 'Do the work',
  assignmentFilePath: '',
  modelConnectionId: connection.id,
  modelId: 'configured-agent-model',
  allowModelSelection: false,
  triggerNextAgent: false,
  saveResultToFile: false,
  resultDirectory: '',
  resultFilename: '',
  projectFilesystemPermissions: defaultPermissions,
};

type TestInferenceRequester = NonNullable<ConstructorParameters<typeof AgentRunService>[6]>;
type TestFilesystem = ConstructorParameters<typeof AgentRunService>[2];

interface TestSkill {
  commandName: string;
  markdown: string;
  requiredTools?: string[];
}

async function waitFor(assertion: () => boolean): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (assertion()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.fail('Timed out waiting for Agent run state');
}

function setup(
  request: TestInferenceRequester,
  options: {
    userId?: number;
    fileInstructions?: string;
    allowModelSelection?: boolean;
    modelVisible?: boolean;
    skills?: TestSkill[];
    missingSkill?: boolean;
    toolNames?: string[];
    tools?: RegisteredTool[];
    filesystem?: Partial<TestFilesystem>;
    agentData?: Partial<AgentData>;
    testNow?: () => Date;
    runtimeLimits?: AgentRuntimeLimitsProvider;
  } = {},
) {
  const db = createTestDatabase();
  const projects = new ProjectRepository(db);
  const agents = new AgentRepository(db);
  const runs = new AgentRunRepository(db);
  const project = projects.create(1, { name: 'Project', description: '' });
  const agent = agents.create(project.id, {
    ...baseAgentData,
    ...options.agentData,
    allowModelSelection: options.allowModelSelection ?? false,
    ...(options.fileInstructions === undefined
      ? {}
      : { instructionSource: 'file' as const, instructions: '', instructionFilePath: 'AGENT.md' }),
  });
  const skillRepository = new SkillRepository(db);
  const skills = new Map<number, Skill>();
  for (const value of options.skills ?? []) {
    const record = skillRepository.create(value.commandName, { name: value.commandName });
    skills.set(record.id, {
      id: record.id,
      commandName: record.commandName,
      name: value.commandName,
      markdown: value.markdown,
      requiredTools: value.requiredTools ?? [],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
  agents.replaceSkills(agent.id, [...skills.keys()]);
  agents.replaceTools(agent.id, options.toolNames ?? []);
  const queue = new ModelConnectionInferenceQueue();
  const filesystem: TestFilesystem = {
    listDirectory: async (_projectId, path) => ({ relativePath: String(path), entries: [] }),
    readFile: async () => {
      if (options.fileInstructions === 'missing') {
        throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND');
      }
      const content = options.fileInstructions ?? '';
      return { relativePath: 'AGENT.md', content, size: content.length };
    },
    writeFile: async (_projectId, value) => ({
      relativePath: String((value as Record<string, unknown>).path),
      size: String((value as Record<string, unknown>).content).length,
    }),
    createDirectory: async (_projectId, value) => ({
      name: String((value as Record<string, unknown>).path),
      relativePath: String((value as Record<string, unknown>).path),
      type: 'directory',
      modifiedAt: 1,
    }),
    renameEntry: async (_projectId, value) => ({
      name: String((value as Record<string, unknown>).destinationPath),
      relativePath: String((value as Record<string, unknown>).destinationPath),
      type: 'file',
      size: 1,
      modifiedAt: 1,
    }),
    deleteEntry: async () => undefined,
    ...options.filesystem,
  };
  const registry = new ToolRegistry(options.tools ?? []);
  const service = new AgentRunService(
    runs,
    agents,
    filesystem,
    {
      getConnectionForInference: async () => ({ connection, apiKey: 'server-secret' }),
      isModelVisible: async () => options.modelVisible ?? true,
    },
    queue,
    () => options.userId ?? 1,
    request,
    { get: async (skillId) => (options.missingSkill ? null : (skills.get(skillId) ?? null)) },
    registry,
    { getSettings: async () => ({ ...DEFAULT_DUCKDUCKGO_SETTINGS }) },
    undefined,
    undefined,
    options.testNow,
    options.runtimeLimits,
  );
  return { db, agents, runs, project, agent, queue, service, registry, skillRepository, skills };
}

function parseAttachedFilesContext(content: string): Array<{ path: string; content: string }> {
  const prefix = 'Attached Project files:\n\n';
  const start = content.indexOf(prefix);

  assert.ok(start >= 0, 'Expected serialized attached Project files context');

  const jsonStart = start + prefix.length;
  const dateSeparator = '\n\nCurrent date: ';
  const jsonEnd = content.indexOf(dateSeparator, jsonStart);

  assert.ok(jsonEnd >= 0, 'Expected current-date section after attached Project files context');

  return JSON.parse(
    content.slice(jsonStart, jsonEnd),
  ) as Array<{ path: string; content: string }>;
}

function createTestTool(
  name: string,
  execute: RegisteredTool['execute'],
): RegisteredTool {
  return {
    name,
    displayName: name,
    description: `Executes ${name}.`,
    inputSchema: {
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    },
    execute,
  };
}

await describe('AgentRunService - Attached Project Files', () => {
  it('loads one attached file into initial Agent context', async () => {
    let inferenceCallCount = 0;
    let inferenceMessages: Parameters<TestInferenceRequester>[3] = [];
    const context = setup(
      async (_baseUrl, _timeoutMinutes, _modelId, messages) => {
        inferenceCallCount += 1;
        inferenceMessages = messages;
        return {
          type: 'message',
          content: 'Done',
          assistantMessage: { role: 'assistant', content: 'Done' },
        } as ModelInferenceResult;
      },
      {
        agentData: {
          attachedProjectFiles: ['docs/spec.md'],
        },
        filesystem: {
          readFile: async (_projectId, path) => {
            if (path === 'docs/spec.md') {
              return { relativePath: 'docs/spec.md', content: 'Specification content\n', size: 18 };
            }
            throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND');
          },
        },
      },
    );
    await context.service.start(context.project.id, context.agent.id, { task: 'Review spec' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    assert.equal(inferenceCallCount, 1);
    const attachedMessage = inferenceMessages.find(
      (message) =>
        message.role === 'system' &&
        typeof message.content === 'string' &&
        message.content.includes('Attached Project files:'),
    );
    assert.ok(attachedMessage);
    const attachedContent = attachedMessage.content;
    if (typeof attachedContent !== 'string') assert.fail('Expected attached Project files context');
    assert.deepEqual(parseAttachedFilesContext(attachedContent), [
      { path: 'docs/spec.md', content: 'Specification content\n' },
    ]);
    const systemContent = attachedMessage.content;
    if (typeof systemContent !== 'string') {
      assert.fail('Expected merged system content');
    }

    const instructionsIndex = systemContent.indexOf('Inline instructions');
    const attachedIndex = systemContent.indexOf('Attached Project files:');
    const dateIndex = systemContent.indexOf('Current date:');

    assert.ok(instructionsIndex >= 0);
    assert.ok(
      attachedIndex > instructionsIndex,
      'Attached files must come after Agent instructions',
    );
    assert.ok(
      dateIndex > attachedIndex,
      'Attached files must come before current date',
    );
    assert.equal(inferenceMessages.length, 2);
    assert.equal(inferenceMessages[0]?.role, 'system');
    assert.equal(inferenceMessages[1]?.role, 'user');
    assert.equal(inferenceMessages[1]?.content, 'Do the work');
    context.db.close();
  });

  it('includes multiple attached files in stored order', async () => {
    let inferenceCallCount = 0;
    let inferenceMessages: Parameters<TestInferenceRequester>[3] = [];
    const context = setup(
      async (_baseUrl, _timeoutMinutes, _modelId, messages) => {
        inferenceCallCount += 1;
        inferenceMessages = messages;
        return {
          type: 'message',
          content: 'Done',
          assistantMessage: { role: 'assistant', content: 'Done' },
        } as ModelInferenceResult;
      },
      {
        agentData: {
          attachedProjectFiles: ['docs/spec.md', 'context/domain.txt', 'README.md'],
        },
        filesystem: {
          readFile: async (_projectId, path) => {
            switch (path) {
              case 'docs/spec.md':
                return { relativePath: 'docs/spec.md', content: 'Spec content\n', size: 13 };
              case 'context/domain.txt':
                return { relativePath: 'context/domain.txt', content: 'Domain context\n', size: 15 };
              case 'README.md':
                return { relativePath: 'README.md', content: 'Read me\n', size: 8 };
              default:
                throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND');
            }
          },
        },
      },
    );
    await context.service.start(context.project.id, context.agent.id, { task: 'Review' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    assert.equal(inferenceCallCount, 1);
    const attachedMessage = inferenceMessages.find(
      (message) =>
         message.role === 'system' &&
        typeof message.content === 'string' &&
        message.content.includes('Attached Project files:'),
    );
    assert.ok(attachedMessage);
    const attachedContent = attachedMessage.content;
    if (typeof attachedContent !== 'string') assert.fail('Expected attached Project files context');
    assert.deepEqual(parseAttachedFilesContext(attachedContent), [
      { path: 'docs/spec.md', content: 'Spec content\n' },
      { path: 'context/domain.txt', content: 'Domain context\n' },
      { path: 'README.md', content: 'Read me\n' },
    ]);
    context.db.close();
  });

  it('uses current file contents at run time', async () => {
    let inferenceCallCount = 0;
    let inferenceMessages: Parameters<TestInferenceRequester>[3] = [];
    const context = setup(
      async (_baseUrl, _timeoutMinutes, _modelId, messages) => {
        inferenceCallCount += 1;
        inferenceMessages = messages;
        return {
          type: 'message',
          content: 'Done',
          assistantMessage: { role: 'assistant', content: 'Done' },
        } as ModelInferenceResult;
      },
      {
        agentData: {
          attachedProjectFiles: ['docs/spec.md'],
        },
        filesystem: {
          readFile: async (_projectId, path) => {
            if (path === 'docs/spec.md') {
              return { relativePath: 'docs/spec.md', content: 'Updated spec v2\n', size: 17 };
            }
            throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND');
          },
        },
      },
    );
    await context.service.start(context.project.id, context.agent.id, { task: 'Review' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    assert.equal(inferenceCallCount, 1);
    const attachedMessage = inferenceMessages.find(
      (message) =>
         message.role === 'system' &&
        typeof message.content === 'string' &&
        message.content.includes('Attached Project files:'),
    );
    assert.ok(attachedMessage);
    const attachedContent = attachedMessage.content;
    if (typeof attachedContent !== 'string') assert.fail('Expected attached Project files context');
    assert.deepEqual(parseAttachedFilesContext(attachedContent), [
      { path: 'docs/spec.md', content: 'Updated spec v2\n' },
    ]);
    context.db.close();
  });

  it('leaves existing context behavior unchanged when attachedProjectFiles is empty', async () => {
    let inferenceCallCount = 0;
    let inferenceMessages: Parameters<TestInferenceRequester>[3] = [];
    const context = setup(
      async (_baseUrl, _timeoutMinutes, _modelId, messages) => {
        inferenceCallCount += 1;
        inferenceMessages = messages;
        return {
          type: 'message',
          content: 'Done',
          assistantMessage: { role: 'assistant', content: 'Done' },
        } as ModelInferenceResult;
      },
      {
        agentData: {
          attachedProjectFiles: [],
        },
      },
    );
    await context.service.start(context.project.id, context.agent.id, { task: 'Review' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    assert.equal(inferenceCallCount, 1);
    assert.ok(
      !inferenceMessages.some(
        (message) =>
           message.role === 'system' &&
        typeof message.content === 'string' &&
        message.content.includes('Attached Project files:'),
      ),
    );
    context.db.close();
  });

  it('loads attached files with projectFilesystemPermissions.read=false', async () => {
    let inferenceCallCount = 0;
    let inferenceMessages: Parameters<TestInferenceRequester>[3] = [];
    const readFalsePermissions = {
      list: false,
      read: false,
      write: false,
      createDirectory: false,
      rename: false,
      delete: false,
    } as const;
    const context = setup(
      async (_baseUrl, _timeoutMinutes, _modelId, messages) => {
        inferenceCallCount += 1;
        inferenceMessages = messages;
        return {
          type: 'message',
          content: 'Done',
          assistantMessage: { role: 'assistant', content: 'Done' },
        } as ModelInferenceResult;
      },
      {
        agentData: {
          attachedProjectFiles: ['docs/spec.md'],
          projectFilesystemPermissions: readFalsePermissions,
        },
        filesystem: {
          readFile: async (_projectId, path) => {
            if (path === 'docs/spec.md') {
              return { relativePath: 'docs/spec.md', content: 'Spec content\n', size: 13 };
            }
            throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND');
          },
        },
      },
    );
    await context.service.start(context.project.id, context.agent.id, { task: 'Review' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    assert.equal(inferenceCallCount, 1);
    const attachedMessage = inferenceMessages.find(
      (message) =>
         message.role === 'system' &&
        typeof message.content === 'string' &&
        message.content.includes('Attached Project files:'),
    );
    assert.ok(attachedMessage);
    const attachedContent = attachedMessage.content;
    if (typeof attachedContent !== 'string') assert.fail('Expected attached Project files context');
    assert.deepEqual(parseAttachedFilesContext(attachedContent), [
      { path: 'docs/spec.md', content: 'Spec content\n' },
    ]);
    context.db.close();
  });

  it('keeps project_read_file absent from provider tools when read=false', async () => {
    let inferenceCallCount = 0;
    const readFalsePermissions = {
      list: false,
      read: false,
      write: false,
      createDirectory: false,
      rename: false,
      delete: false,
    } as const;
    const context = setup(
      async (_baseUrl, _timeoutMinutes, _modelId, _messages, tools) => {
        inferenceCallCount += 1;

        assert.ok(
          !(tools ?? []).some(
            (tool) => tool.function.name === 'project_read_file',
          ),
        );

        return {
          type: 'message',
          content: 'Done',
          assistantMessage: { role: 'assistant', content: 'Done' },
        } as ModelInferenceResult;
      },
      {
        agentData: {
          attachedProjectFiles: ['docs/spec.md'],
          projectFilesystemPermissions: readFalsePermissions,
        },
        tools: [createTestTool('test-tool', async () => 'result')],
      },
    );
    await context.service.start(context.project.id, context.agent.id, { task: 'Review' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    assert.equal(inferenceCallCount, 1);
    const run = context.service.get(context.project.id, context.agent.id, context.service.latest(context.project.id, context.agent.id)!.id)!;
    const executionEvents = context.runs.listExecutionEvents(1, context.project.id, context.agent.id, run.id)!;
    const toolCallEvents = executionEvents.filter((event) => event.eventType === 'tool_call');
    const projectReadFileCalls = toolCallEvents.some((event) => event.data.toolName === 'project_read_file');
    assert.ok(!projectReadFileCalls, 'project_read_file should not be available when read permission is false');
    context.db.close();
  });

  it('prevents provider inference when attached file read fails', async () => {
    let inferenceCallCount = 0;
    const context = setup(
      async () => {
        inferenceCallCount += 1;
        return {
          type: 'message',
          content: 'Done',
          assistantMessage: { role: 'assistant', content: 'Done' },
        } as ModelInferenceResult;
      },
      {
        agentData: {
          attachedProjectFiles: ['docs/spec.md'],
        },
        filesystem: {
          readFile: async (_projectId, path) => {
            if (path === 'docs/spec.md') {
              throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND');
            }
            throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND');
          },
        },
      },
    );
    await context.service.start(context.project.id, context.agent.id, { task: 'Review' });
    await waitFor(
      () => context.service.latest(context.project.id, context.agent.id)?.status === 'error',
    );
    assert.equal(inferenceCallCount, 0);
    const latestRun = context.service.latest(context.project.id, context.agent.id);
    assert.ok(latestRun);
    assert.equal(latestRun.status, 'error');
    assert.equal(latestRun.safeError?.stage, 'attached_files_load');
    assert.equal(latestRun.safeError?.code, 'ATTACHED_FILE_UNAVAILABLE');
    context.db.close();
  });

  it('enforces existing Project sandbox and path validation', async () => {
    let inferenceCallCount = 0;
    const context = setup(
      async () => {
        inferenceCallCount += 1;
        return {
          type: 'message',
          content: 'Done',
          assistantMessage: { role: 'assistant', content: 'Done' },
        } as ModelInferenceResult;
      },
      {
        agentData: {
          attachedProjectFiles: ['../../../etc/passwd'],
        },
        filesystem: {
          readFile: async () => {
            throw new ProjectFilesystemError('PROJECT_PATH_INVALID');
          },
        },
      },
    );
    await context.service.start(context.project.id, context.agent.id, { task: 'Review' });
    await waitFor(
      () => context.service.latest(context.project.id, context.agent.id)?.status === 'error',
    );
    assert.equal(inferenceCallCount, 0);
    const latestRun = context.service.latest(context.project.id, context.agent.id);
    assert.ok(latestRun);
    assert.equal(latestRun.status, 'error');
    assert.equal(latestRun.safeError?.stage, 'attached_files_load');
    assert.equal(latestRun.safeError?.code, 'ATTACHED_FILE_UNAVAILABLE');
    context.db.close();
  });

  it('allows file exactly at per-file size limit', async () => {
    let inferenceCallCount = 0;
    const exactSizeContent = 'x'.repeat(AGENT_RUNTIME_LIMITS_DEFAULTS.attachedFileBytes);
    const context = setup(
      async () => {
        inferenceCallCount += 1;
        return {
          type: 'message',
          content: 'Done',
          assistantMessage: { role: 'assistant', content: 'Done' },
        } as ModelInferenceResult;
      },
      {
        agentData: {
          attachedProjectFiles: ['large.txt'],
        },
        filesystem: {
          readFile: async (_projectId, path) => {
            if (path === 'large.txt') {
              return {
                relativePath: 'large.txt',
                content: exactSizeContent,
                size: AGENT_RUNTIME_LIMITS_DEFAULTS.attachedFileBytes,
              };
            }
            throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND');
          },
        },
      },
    );
    await context.service.start(context.project.id, context.agent.id, { task: 'Review' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    assert.equal(inferenceCallCount, 1);
    const latestRun = context.service.latest(context.project.id, context.agent.id);
    assert.ok(latestRun);
    assert.equal(latestRun.status, 'done');
    context.db.close();
  });

  it('rejects file exceeding per-file size limit', async () => {
    let inferenceCallCount = 0;
    const oversizedContent = 'x'.repeat(
      AGENT_RUNTIME_LIMITS_DEFAULTS.attachedFileBytes + 1,
    );
    const context = setup(
      async () => {
        inferenceCallCount += 1;
        return {
          type: 'message',
          content: 'Done',
          assistantMessage: { role: 'assistant', content: 'Done' },
        } as ModelInferenceResult;
      },
      {
        agentData: {
          attachedProjectFiles: ['oversized.txt'],
        },
        filesystem: {
          readFile: async (_projectId, path) => {
            if (path === 'oversized.txt') {
              return {
                relativePath: 'oversized.txt',
                content: oversizedContent,
                size: AGENT_RUNTIME_LIMITS_DEFAULTS.attachedFileBytes + 1,
              };
            }
            throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND');
          },
        },
      },
    );
    await context.service.start(context.project.id, context.agent.id, { task: 'Review' });
    await waitFor(
      () => context.service.latest(context.project.id, context.agent.id)?.status === 'error',
    );
    assert.equal(inferenceCallCount, 0);
    const latestRun = context.service.latest(context.project.id, context.agent.id);
    assert.ok(latestRun);
    assert.equal(latestRun.status, 'error');
    assert.equal(latestRun.safeError?.stage, 'attached_files_load');
    assert.equal(latestRun.safeError?.code, 'ATTACHED_FILE_TOO_LARGE');
    assert.equal(latestRun.safeError?.inputFile, 'oversized.txt');
    assert.equal(
      latestRun.safeError?.actualBytes,
      AGENT_RUNTIME_LIMITS_DEFAULTS.attachedFileBytes + 1,
    );
    assert.equal(latestRun.safeError?.limitBytes, AGENT_RUNTIME_LIMITS_DEFAULTS.attachedFileBytes);
    context.db.close();
  });

  it('maps the Project text read limit to an attached-file size error', async () => {
    let inferenceCallCount = 0;
    const context = setup(
      async () => {
        inferenceCallCount += 1;
        return {
          type: 'message',
          content: 'Done',
          assistantMessage: { role: 'assistant', content: 'Done' },
        } as ModelInferenceResult;
      },
      {
        agentData: { attachedProjectFiles: ['filesystem-large.txt'] },
        filesystem: {
          readFile: async () => { throw new ProjectFilesystemError('PROJECT_FILE_TOO_LARGE'); },
        },
      },
    );
    await context.service.start(context.project.id, context.agent.id, { task: 'Review' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'error');
    const latestRun = context.service.latest(context.project.id, context.agent.id)!;
    assert.equal(inferenceCallCount, 0);
    assert.equal(latestRun.safeError?.code, 'ATTACHED_FILE_TOO_LARGE');
    assert.equal(latestRun.safeError?.inputFile, 'filesystem-large.txt');
    context.db.close();
  });

  it('allows multiple files totaling exactly aggregate limit', async () => {
    let inferenceCallCount = 0;
    const fileSize = AGENT_RUNTIME_LIMITS_DEFAULTS.attachedFileBytes;
    const contents = ['a'.repeat(fileSize), 'b'.repeat(fileSize), 'c'.repeat(fileSize), 'd'.repeat(fileSize)];
    const filePaths = ['fileA.txt', 'fileB.txt', 'fileC.txt', 'fileD.txt'];
    const context = setup(
      async () => {
        inferenceCallCount += 1;
        return {
          type: 'message',
          content: 'Done',
          assistantMessage: { role: 'assistant', content: 'Done' },
        } as ModelInferenceResult;
      },
      {
        agentData: {
          attachedProjectFiles: filePaths,
        },
        filesystem: {
          readFile: async (_projectId, path) => {
            const index = filePaths.indexOf(String(path));
            if (index >= 0) {
              return { relativePath: String(path), content: contents[index], size: fileSize };
            }
            throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND');
          },
        },
      },
    );
    await context.service.start(context.project.id, context.agent.id, { task: 'Review' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    assert.equal(inferenceCallCount, 1);
    const latestRun = context.service.latest(context.project.id, context.agent.id);
    assert.ok(latestRun);
    assert.equal(latestRun.status, 'done');
    context.db.close();
  });

  it('rejects when aggregate size exceeds limit', async () => {
    let inferenceCallCount = 0;
    const fileSize = AGENT_RUNTIME_LIMITS_DEFAULTS.attachedFileBytes;
    const context = setup(
      async () => {
        inferenceCallCount += 1;
        return {
          type: 'message',
          content: 'Done',
          assistantMessage: { role: 'assistant', content: 'Done' },
        } as ModelInferenceResult;
      },
      {
        agentData: {
          attachedProjectFiles: ['fileA.txt', 'fileB.txt', 'fileC.txt', 'fileD.txt', 'fileE.txt'],
        },
        filesystem: {
          readFile: async (_projectId, path) => {
            if (path === 'fileE.txt') {
              return { relativePath: 'fileE.txt', content: 'x', size: 1 };
            }
            return { relativePath: String(path), content: 'x'.repeat(fileSize), size: fileSize };
          },
        },
      },
    );
    await context.service.start(context.project.id, context.agent.id, { task: 'Review' });
    await waitFor(
      () => context.service.latest(context.project.id, context.agent.id)?.status === 'error',
    );
    assert.equal(inferenceCallCount, 0);
    const latestRun = context.service.latest(context.project.id, context.agent.id);
    assert.ok(latestRun);
    assert.equal(latestRun.status, 'error');
    assert.equal(latestRun.safeError?.stage, 'attached_files_load');
    assert.equal(latestRun.safeError?.code, 'ATTACHED_FILES_TOO_LARGE');
    assert.equal(
      latestRun.safeError?.actualBytes,
      AGENT_RUNTIME_LIMITS_DEFAULTS.attachedFilesTotalBytes + 1,
    );
    assert.equal(
      latestRun.safeError?.limitBytes,
      AGENT_RUNTIME_LIMITS_DEFAULTS.attachedFilesTotalBytes,
    );
    assert.equal(latestRun.safeError?.inputFile, 'fileE.txt');
    context.db.close();
  });

  it('honors configured per-file and aggregate attachment boundaries', async () => {
    for (const testCase of [
      { sizes: [2_048], expectedStatus: 'done', expectedCode: undefined },
      { sizes: [2_049], expectedStatus: 'error', expectedCode: 'ATTACHED_FILE_TOO_LARGE' },
      { sizes: [1_500, 1_500], expectedStatus: 'done', expectedCode: undefined },
      { sizes: [1_500, 1_501], expectedStatus: 'error', expectedCode: 'ATTACHED_FILES_TOO_LARGE' },
    ] as const) {
      let inferenceCallCount = 0;
      const filePaths = testCase.sizes.map((_, index) => `configured-${index}.txt`);
      const context = setup(
        async () => {
          inferenceCallCount += 1;
          return { type: 'message', content: 'Done' } as ModelInferenceResult;
        },
        {
          agentData: { attachedProjectFiles: filePaths },
          filesystem: {
            readFile: async (_projectId, path) => {
              const index = filePaths.indexOf(String(path));
              const size = testCase.sizes[index];
              if (size === undefined) throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND');
              return { relativePath: String(path), content: 'x'.repeat(size), size };
            },
          },
          runtimeLimits: {
            getAgentRuntimeLimits: async () => ({
              ...AGENT_RUNTIME_LIMITS_DEFAULTS,
              attachedFileBytes: 2_048,
              attachedFilesTotalBytes: 3_000,
            }),
          },
        },
      );
      const run = await context.service.start(context.project.id, context.agent.id);
      await waitFor(
        () =>
          context.service.get(context.project.id, context.agent.id, run.id)?.status ===
          testCase.expectedStatus,
      );
      const terminal = context.service.get(context.project.id, context.agent.id, run.id)!;
      assert.equal(inferenceCallCount, testCase.expectedStatus === 'done' ? 1 : 0);
      assert.equal(terminal.safeError?.code, testCase.expectedCode);
      if (testCase.expectedCode === 'ATTACHED_FILE_TOO_LARGE') {
        assert.equal(terminal.safeError?.actualBytes, 2_049);
        assert.equal(terminal.safeError?.limitBytes, 2_048);
      }
      if (testCase.expectedCode === 'ATTACHED_FILES_TOO_LARGE') {
        assert.equal(terminal.safeError?.actualBytes, 3_001);
        assert.equal(terminal.safeError?.limitBytes, 3_000);
        assert.equal(terminal.safeError?.inputFile, 'configured-1.txt');
      }
      context.db.close();
    }
  });

  it('does not send partial attachment context when loading fails', async () => {
    let inferenceCallCount = 0;
    let inferenceMessages: Parameters<TestInferenceRequester>[3] = [];
    const context = setup(
      async (_baseUrl, _timeoutMinutes, _modelId, messages) => {
        inferenceCallCount += 1;
        inferenceMessages = messages;
        return {
          type: 'message',
          content: 'Done',
          assistantMessage: { role: 'assistant', content: 'Done' },
        } as ModelInferenceResult;
      },
      {
        agentData: {
          attachedProjectFiles: ['available.txt', 'missing.txt'],
        },
        filesystem: {
          readFile: async (_projectId, path) => {
            if (path === 'available.txt') {
              return { relativePath: 'available.txt', content: 'Available\n', size: 10 };
            }
            throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND');
          },
        },
      },
    );
    await context.service.start(context.project.id, context.agent.id, { task: 'Review' });
    await waitFor(
      () => context.service.latest(context.project.id, context.agent.id)?.status === 'error',
    );
    assert.equal(inferenceCallCount, 0);
    const latestRun = context.service.latest(context.project.id, context.agent.id);
    assert.ok(latestRun);
    assert.equal(latestRun.status, 'error');
    assert.ok(
      !inferenceMessages.some(
        (message) =>
           message.role === 'system' &&
        typeof message.content === 'string' &&
        message.content.includes('Attached Project files:'),
      ),
    );
    context.db.close();
  });

  it('does not affect External Tools and Skills behavior', async () => {
    let inferenceCallCount = 0;
    const context = setup(
      async () => {
        inferenceCallCount += 1;

        if (inferenceCallCount === 1) {
          return {
            type: 'tool_calls',
            calls: [
              {
                id: 'call-1',
                type: 'function',
                function: {
                  name: 'test-tool',
                  arguments: '{"value":"test"}',
                },
              },
            ],
            assistantMessage: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'test-tool',
                    arguments: '{"value":"test"}',
                  },
                },
              ],
            },
          } as ModelInferenceResult;
        }

        return {
          type: 'message',
          content: 'Done',
          assistantMessage: { role: 'assistant', content: 'Done' },
        } as ModelInferenceResult;
      },
      {
        agentData: {
          attachedProjectFiles: ['docs/spec.md'],
        },
        tools: [createTestTool('test-tool', async () => 'tool result')],
        skills: [{ commandName: 'test-skill', markdown: '# Test Skill\n' }],
      },
    );
    await context.service.start(context.project.id, context.agent.id, { task: 'Review' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    assert.equal(inferenceCallCount, 2);
    const run = context.service.get(context.project.id, context.agent.id, context.service.latest(context.project.id, context.agent.id)!.id)!;
    const executionEvents = context.runs.listExecutionEvents(1, context.project.id, context.agent.id, run.id)!;
    const toolCallEvents = executionEvents.filter((event) => event.eventType === 'tool_call');
    assert.ok(toolCallEvents.some((event) => event.data.toolName === 'test-tool'));
    context.db.close();
  });
});

