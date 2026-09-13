import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/server/database.js';
import { ProjectRepository } from '../../src/server/repositories/project-repository.js';
import { AgentRepository } from '../../src/server/repositories/agent-repository.js';
import { AgentRunRepository } from '../../src/server/repositories/agent-run-repository.js';
import { SkillRepository } from '../../src/server/repositories/skill-repository.js';
import { AgentRunService, AgentRunError } from '../../src/server/services/agent-run-service.js';
import { ModelConnectionInferenceQueue } from '../../src/server/services/model-connection-inference-queue.js';
import { SkillError } from '../../src/server/services/skill-service.js';
import { ModelInferenceError, type ModelInferenceMessage, type ModelInferenceResult, type StreamedModelInferencePartialResult } from '../../src/services/model-inference.js';
import { ProjectFilesystemError } from '../../src/server/services/project-filesystem-service.js';
import { MAX_PROJECT_TEXT_FILE_BYTES } from '../../src/server/stores/project-filesystem-store.js';
import { ToolRegistry } from '../../src/server/tools/tool-registry.js';
import { RunAgentTool } from '../../src/server/tools/run-agent-tool.js';
import { safeExecutionJson } from '../../src/server/agent-execution-safety.js';
import {
  DEFAULT_DUCKDUCKGO_SETTINGS,
  RecoverableToolError,
  type RegisteredTool,
} from '../../src/server/tool-types.js';
import type { Skill } from '../../src/server/skill-types.js';
import type { AgentData, AgentToolConfiguration } from '../../src/server/agent-types.js';
import {
  AGENT_RUNTIME_LIMITS_DEFAULTS,
  type AgentRuntimeLimits,
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
    oversizedSkill?: boolean;
    toolNames?: string[];
    toolConfigurations?: AgentToolConfiguration[];
    tools?: RegisteredTool[];
    filesystem?: Partial<TestFilesystem>;
    agentData?:  Partial<AgentData>;
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
      name: record.data.name,
      markdown: value.markdown,
      requiredTools: value.requiredTools ?? [],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
  agents.replaceSkills(agent.id, [...skills.keys()]);
  agents.replaceTools(agent.id, options.toolNames ?? [], options.toolConfigurations);
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
    {
      get: async (skillId) => {
        if (options.oversizedSkill) throw new SkillError('CONTENT_TOO_LARGE');
        return options.missingSkill ? null : (skills.get(skillId) ?? null);
      },
    },
    registry,
    { getSettings: async () => ({ ...DEFAULT_DUCKDUCKGO_SETTINGS }) },
    undefined,
    undefined,
    options.testNow,
    options.runtimeLimits,
  );
  return { db, agents, runs, project, agent, queue, service, registry, skillRepository, skills };
}

function requireMessageContent(
  message: ModelInferenceMessage | undefined,
): string {
  if (!message || typeof message.content !== 'string') {
    assert.fail('Expected model message content to be a string');
  }
  return message.content;
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

await describe('AgentRunService', () => {
  it('runs configured pre-run inputs sequentially in deterministic tool order and composes one user message', async () => {
    const executions: Array<{ tool: string; value: string }> = [];
    const requests: ModelInferenceMessage[][] = [];
    let providerTools: Parameters<TestInferenceRequester>[4] = [];
    const files = new Map([
      ['inputs/z.json', '[{"value":"z-first"},{"value":"z-second"}]'],
      ['inputs/a.json', '[{"value":"a-only"}]'],
      ['tasks/current.md', 'Resolved file task'],
    ]);
    const context = setup(
      async (_baseUrl, _timeout, _modelId, messages, tools) => {
        requests.push(structuredClone(messages));
        providerTools = tools;
        return { type: 'message', content: 'Done' };
      },
      {
        toolNames: [],
        toolConfigurations: [
          { toolName: 'z_tool', preRunInputFile: 'inputs/z.json' },
          { toolName: 'a_tool', preRunInputFile: 'inputs/a.json' },
        ],
        tools: [
          createTestTool('z_tool', async (value) => {
            const input = value as { value: string };
            executions.push({ tool: 'z_tool', value: input.value });
            return { source: 'z', value: input.value };
          }),
          createTestTool('a_tool', async (value) => {
            const input = value as { value: string };
            executions.push({ tool: 'a_tool', value: input.value });
            return { source: 'a', value: input.value };
          }),
        ],
        agentData: {
          assignmentSource: 'file',
          assignment: 'Persisted inline fallback',
          assignmentFilePath: 'tasks/current.md',
          projectFilesystemPermissions: {
            list: false,
            read: false,
            write: false,
            createDirectory: false,
            rename: false,
            delete: false,
          },
        },
        filesystem: {
          readFile: async (_projectId, path) => {
            const content = files.get(String(path));
            if (content === undefined) throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND');
            return { relativePath: String(path), content, size: content.length };
          },
        },
      },
    );
    const originalTask = files.get('tasks/current.md')!;
    await context.service.start(context.project.id, context.agent.id);
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');

    assert.deepEqual(executions, [
      { tool: 'a_tool', value: 'a-only' },
      { tool: 'z_tool', value: 'z-first' },
      { tool: 'z_tool', value: 'z-second' },
    ]);
    assert.equal(requests.length, 1);
    assert.deepEqual(providerTools, []);
    assert.equal(requests[0].length, 2);
    assert.deepEqual(requests[0].map((message) => message.role), ['system', 'user']);
    const userContent = requireMessageContent(requests[0][1]);
    assert.ok(userContent.indexOf('Tool: a_tool') < userContent.indexOf('Tool: z_tool'));
    assert.ok(userContent.indexOf('"value":"z-first"') < userContent.indexOf('"value":"z-second"'));
    assert.ok(userContent.indexOf('Tool-provided user information:') < userContent.indexOf('Agent task:'));
    assert.ok(userContent.endsWith(`Agent task:\n\n${originalTask}`));
    assert.equal(userContent.includes('tool_call_id'), false);
    assert.equal(context.agent.data.assignment, 'Persisted inline fallback');
    const execution = context.service.execution(context.project.id, context.agent.id, context.service.latest(context.project.id, context.agent.id)!.id)!;
    assert.equal(execution[0]?.eventType, 'user_task');
    if (execution[0]?.eventType !== 'user_task') assert.fail('Expected user task');
    assert.equal(execution[0].data.content, originalTask);
    assert.deepEqual(
      execution.map((event) => event.eventType),
      [
        'user_task',
        'pre_run_tool_call',
        'pre_run_tool_result',
        'pre_run_tool_call',
        'pre_run_tool_result',
        'pre_run_tool_call',
        'pre_run_tool_result',
        'final_result',
      ],
    );
    const preRunEvents = execution.filter(
      (event) =>
        event.eventType === 'pre_run_tool_call' || event.eventType === 'pre_run_tool_result',
    );
    assert.deepEqual(
      preRunEvents.map((event) => ({
        eventType: event.eventType,
        toolName: event.data.toolName,
        inputFile: event.data.inputFile,
        callIndex: event.data.callIndex,
      })),
      [
        { eventType: 'pre_run_tool_call', toolName: 'a_tool', inputFile: 'inputs/a.json', callIndex: 1 },
        { eventType: 'pre_run_tool_result', toolName: 'a_tool', inputFile: 'inputs/a.json', callIndex: 1 },
        { eventType: 'pre_run_tool_call', toolName: 'z_tool', inputFile: 'inputs/z.json', callIndex: 1 },
        { eventType: 'pre_run_tool_result', toolName: 'z_tool', inputFile: 'inputs/z.json', callIndex: 1 },
        { eventType: 'pre_run_tool_call', toolName: 'z_tool', inputFile: 'inputs/z.json', callIndex: 2 },
        { eventType: 'pre_run_tool_result', toolName: 'z_tool', inputFile: 'inputs/z.json', callIndex: 2 },
      ],
    );
    assert.equal(preRunEvents[0].eventType, 'pre_run_tool_call');
    if (preRunEvents[0].eventType !== 'pre_run_tool_call') assert.fail('Expected pre-run call');
    assert.equal(preRunEvents[0].data.arguments, '{"value":"a-only"}');
    assert.equal('toolCallId' in preRunEvents[0].data, false);
    assert.equal(preRunEvents[1].eventType, 'pre_run_tool_result');
    if (preRunEvents[1].eventType !== 'pre_run_tool_result') assert.fail('Expected pre-run result');
    assert.equal(preRunEvents[1].data.result, '{"source":"a","value":"a-only"}');
    assert.equal('toolCallId' in preRunEvents[1].data, false);
    context.db.close();
  });

  it('stores a truncated FRED-like pre-run event while sending the complete raw result to the model', async () => {
    const observations = Array.from({ length: 201 }, (_, index) => ({
      date: `observation-${String(index).padStart(3, '0')}`,
      value: index,
    }));
    const rawResult = {
      seriesId: 'UNRATE',
      title: 'Unemployment Rate',
      units: 'Percent',
      frequency: 'Monthly',
      observations,
    };
    const requests: ModelInferenceMessage[][] = [];
    const context = setup(
      async (_baseUrl, _timeout, _modelId, messages) => {
        requests.push(structuredClone(messages));
        return { type: 'message', content: 'Done' };
      },
      {
        toolNames: [],
        toolConfigurations: [{ toolName: 'fred_data', preRunInputFile: 'inputs/fred.json' }],
        tools: [createTestTool('fred_data', async () => rawResult)],
        filesystem: {
          readFile: async () => ({
            relativePath: 'inputs/fred.json',
            content: '[{"value":"UNRATE"}]',
            size: 21,
          }),
        },
      },
    );

    await context.service.start(context.project.id, context.agent.id);
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');

    assert.equal(rawResult.observations.length, 201);
    assert.equal(JSON.stringify(rawResult).includes('[ITEMS TRUNCATED]'), false);
    assert.equal(safeExecutionJson({ observations: observations.slice(0, 200) }).includes('[ITEMS TRUNCATED]'), false);
    assert.equal(safeExecutionJson(rawResult).includes('[ITEMS TRUNCATED]'), true);

    const execution = context.service.execution(
      context.project.id,
      context.agent.id,
      context.service.latest(context.project.id, context.agent.id)!.id,
    )!;
    const event = execution.find((item) => item.eventType === 'pre_run_tool_result');
    assert.ok(event && event.eventType === 'pre_run_tool_result');
    const storedResult = JSON.parse(event.data.result) as { observations: unknown[] };
    assert.equal(storedResult.observations.length, 201);
    assert.equal(storedResult.observations[0], '[ITEMS TRUNCATED]');
    assert.deepEqual(storedResult.observations[1], observations[1]);
    assert.deepEqual(storedResult.observations[200], observations[200]);
    assert.equal(event.data.result.includes('observation-000'), false);
    assert.equal(event.data.result.includes('observation-200'), true);

    const userContent = requireMessageContent(requests[0]?.[1]);
    const resultStart = userContent.indexOf('Result:\n') + 'Result:\n'.length;
    const resultEnd = userContent.indexOf('\n\nAgent task:');
    const modelResult = JSON.parse(userContent.slice(resultStart, resultEnd)) as {
      observations: Array<{ date: string; value: number }>;
    };
    assert.equal(modelResult.observations.length, 201);
    assert.deepEqual(modelResult.observations[200], observations[200]);
    assert.equal(userContent.includes('[ITEMS TRUNCATED]'), false);
    context.db.close();
  });

  it('delivers pre-run results completely at and below the model-context character limit', async () => {
    for (const serializedLength of [
      AGENT_RUNTIME_LIMITS_DEFAULTS.toolResultCharacters - 1,
      AGENT_RUNTIME_LIMITS_DEFAULTS.toolResultCharacters,
    ]) {
      const result = 'x'.repeat(serializedLength - 2);
      let userContent = '';
      const context = setup(
        async (_baseUrl, _timeout, _modelId, messages) => {
          userContent = requireMessageContent(messages[1]);
          return { type: 'message', content: 'Done' };
        },
        {
          toolNames: [],
          toolConfigurations: [{ toolName: 'boundary_tool', preRunInputFile: 'inputs/boundary.json' }],
          tools: [createTestTool('boundary_tool', async () => result)],
          filesystem: {
            readFile: async () => ({
              relativePath: 'inputs/boundary.json',
              content: '[{"value":"boundary"}]',
              size: 22,
            }),
          },
        },
      );

      const run = await context.service.start(context.project.id, context.agent.id);
      await waitFor(() => context.service.get(context.project.id, context.agent.id, run.id)?.status === 'done');
      assert.equal(userContent.includes(JSON.stringify(result)), true);
      assert.equal(userContent.includes('"truncated":true'), false);
      context.db.close();
    }
  });

  it('fails an oversized pre-run result before inference with sanitized size metadata', async () => {
    const oversizedResult = 'sensitive-result-'.repeat(2_001);
    const actualCharacters = JSON.stringify(oversizedResult).length;
    let inferenceCount = 0;
    const context = setup(
      async () => {
        inferenceCount += 1;
        return { type: 'message', content: 'Must not run' };
      },
      {
        toolNames: [],
        toolConfigurations: [{ toolName: 'large_tool', preRunInputFile: 'inputs/large.json' }],
        tools: [createTestTool('large_tool', async () => oversizedResult)],
        filesystem: {
          readFile: async () => ({
            relativePath: 'inputs/large.json',
            content: '[{"value":"large"}]',
            size: 19,
          }),
        },
      },
    );

    const run = await context.service.start(context.project.id, context.agent.id);
    await waitFor(() => context.service.get(context.project.id, context.agent.id, run.id)?.status === 'error');
    const failed = context.service.get(context.project.id, context.agent.id, run.id)!;
    assert.equal(inferenceCount, 0);
    assert.deepEqual(failed.safeError, {
      stage: 'pre_run_initialization',
      code: 'TOOL_RESULT_TOO_LARGE',
      message: 'The tool result exceeded the maximum size allowed for model context.',
      toolName: 'large_tool',
      inputFile: 'inputs/large.json',
      callIndex: 1,
      actualCharacters,
      limitCharacters: AGENT_RUNTIME_LIMITS_DEFAULTS.toolResultCharacters,
    });
    const execution = context.service.execution(context.project.id, context.agent.id, run.id)!;
    assert.deepEqual(execution.map((event) => event.eventType), [
      'user_task',
      'pre_run_tool_call',
      'pre_run_tool_result',
    ]);
    assert.equal(JSON.stringify(failed.safeError).includes('sensitive-result'), false);
    assert.equal(execution.some((event) => event.eventType === 'final_result'), false);
    context.db.close();
  });

  it('uses configured tool-result limits at exact, raised, and lowered boundaries', async () => {
    for (const testCase of [
      { limit: 40_000, serializedLength: 33_000, expectedStatus: 'done' },
      { limit: 1_000, serializedLength: 1_000, expectedStatus: 'done' },
      { limit: 1_000, serializedLength: 1_001, expectedStatus: 'error' },
    ] as const) {
      let requestCount = 0;
      const context = setup(
        async () => {
          requestCount += 1;
          return { type: 'message', content: 'Done' };
        },
        {
          toolNames: [],
          toolConfigurations: [
            { toolName: 'configured_limit_tool', preRunInputFile: 'inputs/configured.json' },
          ],
          tools: [
            createTestTool('configured_limit_tool', async () =>
              'x'.repeat(testCase.serializedLength - 2),
            ),
          ],
          filesystem: {
            readFile: async () => ({
              relativePath: 'inputs/configured.json',
              content: '[{"value":"configured"}]',
              size: 24,
            }),
          },
          runtimeLimits: {
            getAgentRuntimeLimits: async () => ({
              ...AGENT_RUNTIME_LIMITS_DEFAULTS,
              toolResultCharacters: testCase.limit,
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
      assert.equal(requestCount, testCase.expectedStatus === 'done' ? 1 : 0);
      if (testCase.expectedStatus === 'error') {
        assert.equal(terminal.safeError?.code, 'TOOL_RESULT_TOO_LARGE');
        assert.equal(terminal.safeError?.actualCharacters, testCase.serializedLength);
        assert.equal(terminal.safeError?.limitCharacters, testCase.limit);
      }
      context.db.close();
    }
  });

  it('does not let a provider invoke a tool configured only for pre-run', async () => {
    const executions: string[] = [];
    const requests: Array<{
      messages: ModelInferenceMessage[];
      tools: Parameters<TestInferenceRequester>[4];
    }> = [];
    let round = 0;
    const context = setup(
      async (_baseUrl, _timeout, _modelId, messages, tools) => {
        requests.push({ messages: structuredClone(messages), tools });
        round += 1;
        if (round === 1) {
          const calls = [
            {
              id: 'provider-call-1',
              type: 'function' as const,
              function: { name: 'pre_tool', arguments: '{"value":"model"}' },
            },
          ];
          return {
            type: 'tool_calls',
            calls,
            assistantMessage: { role: 'assistant', content: null, tool_calls: calls },
          };
        }
        return { type: 'message', content: 'Done' };
      },
      {
        toolNames: [],
        toolConfigurations: [
          { toolName: 'pre_tool', preRunInputFile: 'inputs/pre.json' },
        ],
        agentData: {
          projectFilesystemPermissions: {
            list: false,
            read: false,
            write: false,
            createDirectory: false,
            rename: false,
            delete: false,
          },
        },
        tools: [
          createTestTool('pre_tool', async (value) => {
            executions.push((value as { value: string }).value);
            return { ok: true };
          }),
        ],
        filesystem: {
          readFile: async () => ({
            relativePath: 'inputs/pre.json',
            content: '[{"value":"pre"}]',
            size: 17,
          }),
        },
      },
    );
    await context.service.start(context.project.id, context.agent.id);
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');

    assert.deepEqual(executions, ['pre']);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0].tools, []);
    assert.ok(requireMessageContent(requests[0].messages[1]).includes('Tool: pre_tool'));
    assert.deepEqual(requests[1].messages[requests[1].messages.length - 1], {
      role: 'tool',
      tool_call_id: 'provider-call-1',
      content:
        '{"ok":false,"error":{"code":"TOOL_NOT_AVAILABLE","message":"The requested tool is not available."}}',
    });
    const execution = context.service.execution(
      context.project.id,
      context.agent.id,
      context.service.latest(context.project.id, context.agent.id)!.id,
    )!;
    const preRunEvents = execution.filter((event) => event.eventType.startsWith('pre_run_tool_'));
    assert.equal(preRunEvents.length, 2);
    assert.ok(preRunEvents.every((event) => !('toolCallId' in event.data)));
    const modelCall = execution.find((event) => event.eventType === 'tool_call');
    assert.equal(modelCall?.eventType === 'tool_call' && modelCall.data.toolCallId, 'provider-call-1');
    context.db.close();
  });

  it('supports pre-run and later model-requested execution for the same enabled tool', async () => {
    const executions: string[] = [];
    let round = 0;
    const context = setup(
      async (_baseUrl, _timeout, _modelId, _messages, tools) => {
        assert.deepEqual((tools ?? []).map((tool) => tool.function.name), ['both_tool']);
        round += 1;
        if (round === 1) {
          const calls = [
            {
              id: 'both-call-1',
              type: 'function' as const,
              function: { name: 'both_tool', arguments: '{"value":"model"}' },
            },
          ];
          return {
            type: 'tool_calls',
            calls,
            assistantMessage: { role: 'assistant', content: null, tool_calls: calls },
          };
        }
        return { type: 'message', content: 'Done' };
      },
      {
        toolNames: ['both_tool'],
        toolConfigurations: [
          { toolName: 'both_tool', preRunInputFile: 'inputs/both.json' },
        ],
        agentData: {
          projectFilesystemPermissions: {
            list: false,
            read: false,
            write: false,
            createDirectory: false,
            rename: false,
            delete: false,
          },
        },
        tools: [
          createTestTool('both_tool', async (value) => {
            executions.push((value as { value: string }).value);
            return { ok: true };
          }),
        ],
        filesystem: {
          readFile: async () => ({
            relativePath: 'inputs/both.json',
            content: '[{"value":"pre"}]',
            size: 17,
          }),
        },
      },
    );
    await context.service.start(context.project.id, context.agent.id);
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    assert.deepEqual(executions, ['pre', 'model']);
    context.db.close();
  });

  it('accepts an empty pre-run array without calls or changing initial user content', async () => {
    let toolCalls = 0;
    let messages: ModelInferenceMessage[] = [];
    const context = setup(
      async (_baseUrl, _timeout, _modelId, value) => {
        messages = structuredClone(value);
        return { type: 'message', content: 'Done' };
      },
      {
        toolNames: ['empty_tool'],
        toolConfigurations: [{ toolName: 'empty_tool', preRunInputFile: 'inputs/empty.json' }],
        tools: [createTestTool('empty_tool', async () => { toolCalls += 1; return {}; })],
        filesystem: {
          readFile: async () => ({ relativePath: 'inputs/empty.json', content: '[]', size: 2 }),
        },
      },
    );
    await context.service.start(context.project.id, context.agent.id);
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    assert.equal(toolCalls, 0);
    assert.equal(requireMessageContent(messages[1]), 'Do the work');
    assert.equal(
      context.service
        .execution(context.project.id, context.agent.id, context.service.latest(context.project.id, context.agent.id)!.id)
        ?.some(
          (event) =>
            event.eventType === 'pre_run_tool_call' || event.eventType === 'pre_run_tool_result',
        ),
      false,
    );
    context.db.close();
  });

  it('fails malformed or inaccessible pre-run files before first inference', async () => {
    const cases: Array<{ name: string; readFile: TestFilesystem['readFile']; code: string }> = [
      {
        name: 'missing',
        readFile: async () => { throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND'); },
        code: 'PRE_RUN_INPUT_FILE_UNAVAILABLE',
      },
      {
        name: 'unreadable',
        readFile: async () => { throw new ProjectFilesystemError('PROJECT_FILESYSTEM_FAILED'); },
        code: 'PRE_RUN_INPUT_FILE_UNAVAILABLE',
      },
      {
        name: 'too large',
        readFile: async () => { throw new ProjectFilesystemError('PROJECT_FILE_TOO_LARGE'); },
        code: 'PRE_RUN_INPUT_TOO_LARGE',
      },
      {
        name: 'outside',
        readFile: async () => { throw new ProjectFilesystemError('PROJECT_PATH_ESCAPE'); },
        code: 'PRE_RUN_INPUT_FILE_OUTSIDE_PROJECT',
      },
      {
        name: 'invalid JSON',
        readFile: async () => ({ relativePath: 'inputs/test.json', content: '[', size: 1 }),
        code: 'PRE_RUN_INPUT_INVALID_JSON',
      },
      {
        name: 'non-array',
        readFile: async () => ({ relativePath: 'inputs/test.json', content: '{}', size: 2 }),
        code: 'PRE_RUN_INPUT_NOT_ARRAY',
      },
      {
        name: 'non-object item',
        readFile: async () => ({ relativePath: 'inputs/test.json', content: '[1]', size: 3 }),
        code: 'PRE_RUN_INPUT_ITEM_NOT_OBJECT',
      },
      {
        name: 'schema-invalid item',
        readFile: async () => ({ relativePath: 'inputs/test.json', content: '[{}]', size: 4 }),
        code: 'PRE_RUN_ARGUMENTS_INVALID',
      },
    ];
    for (const testCase of cases) {
      let inferenceCount = 0;
      let executionCount = 0;
      const context = setup(
        async () => { inferenceCount += 1; return { type: 'message', content: 'Unexpected' }; },
        {
          toolNames: [],
          toolConfigurations: [{ toolName: 'pre_tool', preRunInputFile: 'inputs/test.json' }],
          tools: [createTestTool('pre_tool', async () => { executionCount += 1; return {}; })],
          filesystem: { readFile: testCase.readFile },
        },
      );
      const run = await context.service.start(context.project.id, context.agent.id);
      await waitFor(() => context.service.get(context.project.id, context.agent.id, run.id)?.status === 'error');
      assert.equal(inferenceCount, 0, testCase.name);
      assert.equal(executionCount, 0, testCase.name);
      assert.equal(
        context.service.get(context.project.id, context.agent.id, run.id)?.safeError?.code,
        testCase.code,
        testCase.name,
      );
      const errorEntry = context.service.errors(context.project.id, context.agent.id)?.[0];
      assert.equal(errorEntry?.stage, 'pre_run_initialization', testCase.name);
      assert.equal(errorEntry?.toolName, 'pre_tool', testCase.name);
      assert.equal(errorEntry?.inputFile, 'inputs/test.json', testCase.name);
      if (testCase.name === 'non-object item' || testCase.name === 'schema-invalid item') {
        assert.equal(errorEntry?.callIndex, 1, testCase.name);
        assert.equal(typeof errorEntry?.arguments, 'string', testCase.name);
      } else {
        assert.equal(errorEntry?.callIndex, undefined, testCase.name);
        assert.equal(errorEntry?.arguments, undefined, testCase.name);
      }
      assert.equal(typeof errorEntry?.errorCode, 'string', testCase.name);
      assert.equal(typeof errorEntry?.errorName, 'string', testCase.name);
      assert.equal(typeof errorEntry?.errorMessage, 'string', testCase.name);
      context.db.close();
    }
  });

  it('fails a later pre-run invocation without inference or partial provider context', async () => {
    const executed: string[] = [];
    let inferenceCount = 0;
    const context = setup(
      async () => { inferenceCount += 1; return { type: 'message', content: 'Unexpected' }; },
      {
        toolNames: [],
        toolConfigurations: [{ toolName: 'pre_tool', preRunInputFile: 'inputs/test.json' }],
        tools: [createTestTool('pre_tool', async (value) => {
          const input = value as { value: string };
          executed.push(input.value);
          if (input.value === 'second') throw new RecoverableToolError('WEB_SEARCH_FAILED', 'failed');
          return { value: input.value };
        })],
        filesystem: {
          readFile: async () => ({
            relativePath: 'inputs/test.json',
            content: '[{"value":"first"},{"value":"second"},{"value":"third"}]',
            size: 58,
          }),
        },
      },
    );
    const run = await context.service.start(context.project.id, context.agent.id);
    await waitFor(() => context.service.get(context.project.id, context.agent.id, run.id)?.status === 'error');
    assert.deepEqual(executed, ['first', 'second']);
    assert.equal(inferenceCount, 0);
    assert.equal(
      context.service.get(context.project.id, context.agent.id, run.id)?.safeError?.code,
      'PRE_RUN_TOOL_EXECUTION_FAILED',
    );
    const execution = context.service.execution(context.project.id, context.agent.id, run.id)!;
    assert.deepEqual(execution.map((event) => event.eventType), [
      'user_task',
      'pre_run_tool_call',
      'pre_run_tool_result',
      'pre_run_tool_call',
    ]);
    assert.equal(
      execution.some((event) => event.eventType === 'tool_call' || event.eventType === 'tool_result'),
      false,
    );
    assert.equal(execution.some((event) => event.eventType === 'final_result'), false);
    const errorEntry = context.service.errors(context.project.id, context.agent.id)?.[0];
    assert.equal(errorEntry?.stage, 'pre_run_initialization');
    assert.equal(errorEntry?.toolName, 'pre_tool');
    assert.equal(errorEntry?.inputFile, 'inputs/test.json');
    assert.equal(errorEntry?.callIndex, 2);
    assert.equal(errorEntry?.arguments, '{"value":"second"}');
    assert.equal(errorEntry?.errorCode, 'WEB_SEARCH_FAILED');
    assert.equal(errorEntry?.errorName, 'RecoverableToolError');
    assert.equal(typeof errorEntry?.errorMessage, 'string');
    context.db.close();
  });

  it('logs an unavailable configured pre-run tool before inference', async () => {
    let inferenceCount = 0;
    const context = setup(
      async () => {
        inferenceCount += 1;
        return { type: 'message', content: 'Unexpected' };
      },
      {
        toolNames: [],
        toolConfigurations: [
          { toolName: 'missing_tool', preRunInputFile: 'inputs/missing-tool.json' },
        ],
      },
    );
    const run = await context.service.start(context.project.id, context.agent.id);
    await waitFor(
      () => context.service.get(context.project.id, context.agent.id, run.id)?.status === 'error',
    );
    assert.equal(inferenceCount, 0);
    assert.deepEqual(context.service.errors(context.project.id, context.agent.id)?.[0], {
      runId: run.id,
      timestamp: context.service.get(context.project.id, context.agent.id, run.id)?.completedAt,
      stage: 'pre_run_initialization',
      code: 'PRE_RUN_TOOL_UNAVAILABLE',
      message: 'A configured pre-run tool is unavailable.',
      toolName: 'missing_tool',
      inputFile: 'inputs/missing-tool.json',
      errorCode: 'PRE_RUN_TOOL_UNAVAILABLE',
      errorName: 'PreRunInitializationError',
      errorMessage: 'A configured pre-run tool is unavailable.',
    });
    context.db.close();
  });

  it('does not write a result file when final-result persistence is disabled', async () => {
    let writeCount = 0;
    const context = setup(async () => ({ type: 'message', content: 'Final only' }), {
      filesystem: {
        writeFile: async () => {
          writeCount += 1;
          return { relativePath: 'unexpected.md', size: 10 };
        },
      },
    });
    await context.service.start(context.project.id, context.agent.id, { task: 'Do not save' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    assert.equal(writeCount, 0);
    assert.equal(
      context.runs
        .listEvents(1, context.project.id, context.agent.id, context.service.latest(context.project.id, context.agent.id)!.id)!
        .some((event) => event.eventType.startsWith('result_file_')),
      false,
    );
    context.db.close();
  });

  it('writes only the final result to root and nested Project destinations before completion', async () => {
    for (const destination of [
      { directory: '', filename: 'result.md', expectedPath: 'result.md', expectedDirectories: [] },
      {
        directory: 'reports/daily',
        filename: 'result.md',
        expectedPath: 'reports/daily/result.md',
        expectedDirectories: ['reports', 'reports/daily'],
      },
    ]) {
      const files = new Map<string, string>([[destination.expectedPath, 'previous result']]);
      const directories: string[] = [];
      const writes: Array<{ projectId: number; path: string; content: string }> = [];
      const context = setup(
        async () => ({
          type: 'message',
          content: 'Final result as-is\n',
          assistantMessage: {
            role: 'assistant',
            content: 'Final result as-is\n',
            reasoning_content: 'private reasoning',
          },
        }),
        {
          agentData: {
            saveResultToFile: true,
            resultDirectory: destination.directory,
            resultFilename: destination.filename,
          },
          filesystem: {
            createDirectory: async (_projectId, value) => {
              const path = String((value as Record<string, unknown>).path);
              directories.push(path);
              return {
                name: path.split('/').pop()!,
                relativePath: path,
                type: 'directory',
                modifiedAt: 1,
              };
            },
            writeFile: async (projectId, value) => {
              const input = value as Record<string, unknown>;
              const path = String(input.path);
              const content = String(input.content);
              assert.equal(context.service.latest(context.project.id, context.agent.id)?.status, 'running');
              writes.push({ projectId, path, content });
              files.set(path, content);
              return { relativePath: path, size: content.length };
            },
          },
        },
      );
      const started = await context.service.start(context.project.id, context.agent.id, {
        task: 'Generate output',
      });
      await waitFor(() => context.service.get(context.project.id, context.agent.id, started.id)?.status === 'done');

      assert.deepEqual(directories, destination.expectedDirectories);
      assert.deepEqual(writes, [
        {
          projectId: context.project.id,
          path: destination.expectedPath,
          content: 'Final result as-is\n',
        },
      ]);
      assert.equal(files.get(destination.expectedPath), 'Final result as-is\n');
      assert.equal(files.get(destination.expectedPath)?.includes('private reasoning'), false);
      const operationalEvents = context.runs.listEvents(
        1,
        context.project.id,
        context.agent.id,
        started.id,
      )!;
      assert.ok(
        operationalEvents.findIndex((event) => event.eventType === 'result_file_write_started') <
          operationalEvents.findIndex((event) => event.eventType === 'result_file_written'),
      );
      assert.ok(
        operationalEvents.findIndex((event) => event.eventType === 'result_file_written') <
          operationalEvents.findIndex((event) => event.eventType === 'run_completed'),
      );
      assert.equal(JSON.stringify(operationalEvents).includes('Final result as-is'), false);
      context.db.close();
    }
  });

  it('fails safely when ProjectFilesystemService rejects the configured result destination', async () => {
    const unsafeDirectory = '../outside/C:\\private';
    const context = setup(
      async () => ({
        type: 'message',
        content: 'Generated result',
        assistantMessage: {
          role: 'assistant',
          content: 'Generated result',
          reasoning_content: 'diagnostic reasoning',
        },
      }),
      {
        agentData: {
          saveResultToFile: true,
          resultDirectory: unsafeDirectory,
          resultFilename: 'result.md',
        },
        filesystem: {
          createDirectory: async () => {
            throw new ProjectFilesystemError('PROJECT_PATH_ESCAPE');
          },
        },
      },
    );
    const started = await context.service.start(context.project.id, context.agent.id, {
      task: 'Attempt unsafe output',
    });
    await waitFor(() => context.service.get(context.project.id, context.agent.id, started.id)?.status === 'error');

    const failed = context.service.get(context.project.id, context.agent.id, started.id);
    assert.deepEqual(failed?.safeError, {
      stage: 'result_file_write',
      code: 'RESULT_FILE_WRITE_FAILED',
      message: 'The Agent final result could not be saved to the Project file.',
    });
    assert.equal(failed?.status, 'error');
    assert.equal(
      context.service
        .execution(context.project.id, context.agent.id, started.id)
        ?.find((event) => event.eventType === 'final_result')?.data.content,
      'Generated result',
    );
    const serializedLogs = JSON.stringify({
      events: context.service.events(context.project.id, context.agent.id, started.id),
      errors: context.service.errors(context.project.id, context.agent.id),
    });
    assert.equal(serializedLogs.includes(unsafeDirectory), false);
    assert.equal(serializedLogs.includes('Generated result'), false);
    assert.equal(serializedLogs.includes('diagnostic reasoning'), false);
    context.db.close();
  });

  it('makes the run error with a safe result-file stage when the text write fails', async () => {
    const internalFailure = 'C:\\private\\project result write stack detail';
    const context = setup(async () => ({ type: 'message', content: 'Keep for diagnostics' }), {
      agentData: {
        saveResultToFile: true,
        resultDirectory: '',
        resultFilename: 'result.md',
      },
      filesystem: {
        writeFile: async () => {
          throw new Error(internalFailure);
        },
      },
    });
    const started = await context.service.start(context.project.id, context.agent.id, {
      task: 'Fail the write',
    });
    await waitFor(() => context.service.get(context.project.id, context.agent.id, started.id)?.status === 'error');

    assert.deepEqual(context.service.get(context.project.id, context.agent.id, started.id)?.safeError, {
      stage: 'result_file_write',
      code: 'RESULT_FILE_WRITE_FAILED',
      message: 'The Agent final result could not be saved to the Project file.',
    });
    assert.equal(
      JSON.stringify(context.service.errors(context.project.id, context.agent.id)).includes(internalFailure),
      false,
    );
    assert.equal(
      context.runs
        .listEvents(1, context.project.id, context.agent.id, started.id)!
        .some((event) => event.eventType === 'run_completed'),
      false,
    );
    context.db.close();
  });

  it('does not write a final result after cancellation wins', async () => {
    let resolveRequest: ((result: ModelInferenceResult) => void) | undefined;
    let writeCount = 0;
    const context = setup(
      () => new Promise<ModelInferenceResult>((resolve) => (resolveRequest = resolve)),
      {
        agentData: {
          saveResultToFile: true,
          resultDirectory: '',
          resultFilename: 'result.md',
        },
        filesystem: {
          writeFile: async () => {
            writeCount += 1;
            return { relativePath: 'result.md', size: 4 };
          },
        },
      },
    );
    const started = await context.service.start(context.project.id, context.agent.id, {
      task: 'Cancel before result',
    });
    await waitFor(() => resolveRequest !== undefined);
    assert.equal(context.service.cancel(context.project.id, context.agent.id, started.id).status, 'cancelled');
    resolveRequest?.({ type: 'message', content: 'Late result' });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(writeCount, 0);
    assert.equal(context.service.get(context.project.id, context.agent.id, started.id)?.status, 'cancelled');
    assert.equal(context.runs.complete(started.id, 'Stale result'), false);
    context.db.close();
  });

  it('does not commit an in-flight final-result write after cancellation', async () => {
    let writeStarted = false;
    let persisted = false;
    const context = setup(async () => ({ type: 'message', content: 'Do not persist' }), {
      agentData: {
        saveResultToFile: true,
        resultDirectory: '',
        resultFilename: 'result.md',
      },
      filesystem: {
        writeFile: async (_projectId, _value, signal) => {
          writeStarted = true;
          await new Promise<void>((resolve) => {
            if (signal?.aborted) {
              resolve();
              return;
            }
            signal?.addEventListener('abort', () => resolve(), { once: true });
          });
          signal?.throwIfAborted();
          persisted = true;
          return { relativePath: 'result.md', size: 14 };
        },
      },
    });
    const started = await context.service.start(context.project.id, context.agent.id, {
      task: 'Cancel during write',
    });
    await waitFor(() => writeStarted);
    assert.equal(context.service.cancel(context.project.id, context.agent.id, started.id).status, 'cancelled');
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(persisted, false);
    assert.equal(context.service.get(context.project.id, context.agent.id, started.id)?.status, 'cancelled');
    assert.equal(
      context.runs
        .listEvents(1, context.project.id, context.agent.id, started.id)!
        .some((event) => event.eventType === 'result_file_written'),
      false,
    );
    context.db.close();
  });

  it('chains A to B to C with distinct runs, stable original task, safe handoffs, and each Agent configuration', async () => {
    const captured: Array<{
      modelId: string;
      messages: Parameters<TestInferenceRequester>[3];
      tools: Parameters<TestInferenceRequester>[4];
    }> = [];
    const writes: Array<{ path: string; content: string }> = [];
    let aRound = 0;
    const chainTool = createTestTool('chain_tool', async () => ({ used: true }));
    const context = setup(
      async (_baseUrl, _timeout, modelId, messages, tools) => {
        captured.push({ modelId, messages: structuredClone(messages), tools });
        if (modelId === 'configured-agent-model') {
          aRound += 1;
          if (aRound === 1) {
            const calls = [
              {
                id: 'a-tool-1',
                type: 'function' as const,
                function: {
                  name: 'project_list_directory',
                  arguments: '{"path":"tool-internal-marker"}',
                },
              },
            ];
            return {
              type: 'tool_calls',
              calls,
              assistantMessage: {
                role: 'assistant',
                content: null,
                reasoning_content: 'reasoning-internal-marker',
                tool_calls: calls,
              },
            };
          }
          return { type: 'message', content: 'A final result' };
        }
        if (modelId === 'b-model') return { type: 'message', content: 'B final result' };
        return { type: 'message', content: 'C final result' };
      },
      {
        testNow: () => new Date(2026, 7, 30),
        tools: [chainTool],
        filesystem: {
          readFile: async (_projectId, path) => {
            assert.equal(path, 'tasks/b-review.md');
            const content = 'Perform the B-specific review';
            return { relativePath: String(path), content, size: content.length };
          },
          writeFile: async (_projectId, value) => {
            const input = value as Record<string, unknown>;
            assert.equal(context.service.latest(context.project.id, c.id), null);
            assert.equal(context.service.latest(context.project.id, b.id)?.status, 'running');
            writes.push({ path: String(input.path), content: String(input.content) });
            return { relativePath: String(input.path), size: String(input.content).length };
          },
        },
      },
    );
    const skillRecord = context.skillRepository.create('chain-skill', { name: 'Chain Skill' });
    context.skills.set(skillRecord.id, {
      id: skillRecord.id,
      commandName: skillRecord.commandName,
      name: skillRecord.data.name,
      markdown: 'B skill instructions',
      requiredTools: ['chain_tool'],
      createdAt: skillRecord.createdAt,
      updatedAt: skillRecord.updatedAt,
    });
    const b = context.agents.create(context.project.id, {
      ...baseAgentData,
      name: 'Agent B',
      instructions: 'B own instructions',
      assignmentSource: 'file',
      assignment: 'B inline fallback',
      assignmentFilePath: 'tasks/b-review.md',
      modelId: 'b-model',
      triggerNextAgent: true,
      saveResultToFile: true,
      resultFilename: 'b-result.md',
    });
    const c = context.agents.create(context.project.id, {
      ...baseAgentData,
      name: 'Agent C',
      instructions: 'C own instructions',
      assignment: 'Complete the C-specific delivery',
      modelId: 'c-model',
    });
    context.agents.replaceSkills(b.id, [skillRecord.id]);
    context.agents.replaceTools(b.id, ['chain_tool']);
    const originalTask = 'Complete the original user task';
    assert.ok(
      context.agents.update(1, context.project.id, context.agent.id, {
        ...context.agent.data,
        assignment: originalTask,
        triggerNextAgent: true,
      }, b.id),
    );
    assert.ok(context.agents.update(1, context.project.id, b.id, b.data, c.id));

    const aRun = await context.service.start(context.project.id, context.agent.id, {
      task: originalTask,
    });
    await waitFor(() => context.service.latest(context.project.id, c.id)?.status === 'done');
    const bRun = context.service.latest(context.project.id, b.id)!;
    const cRun = context.service.latest(context.project.id, c.id)!;

    assert.notEqual(aRun.id, bRun.id);
    assert.notEqual(bRun.id, cRun.id);
    assert.deepEqual(
      {
        triggeredByRunId: bRun.triggeredByRunId,
        previousAgentId: bRun.previousAgentId,
        chainRootRunId: bRun.chainRootRunId,
      },
      { triggeredByRunId: aRun.id, previousAgentId: context.agent.id, chainRootRunId: aRun.id },
    );
    assert.deepEqual(
      {
        triggeredByRunId: cRun.triggeredByRunId,
        previousAgentId: cRun.previousAgentId,
        chainRootRunId: cRun.chainRootRunId,
      },
      { triggeredByRunId: bRun.id, previousAgentId: b.id, chainRootRunId: aRun.id },
    );
    assert.equal(context.runs.getById(1, context.project.id, b.id, bRun.id)?.data.originalTask, originalTask);
    assert.equal(context.runs.getById(1, context.project.id, c.id, cRun.id)?.data.originalTask, originalTask);
    assert.ok(bRun.task.includes(originalTask));
    assert.ok(bRun.task.includes('Perform the B-specific review'));
    assert.ok(bRun.task.includes('Name: Runner'));
    assert.ok(bRun.task.includes('A final result'));
    assert.ok(cRun.task.includes(originalTask));
    assert.ok(cRun.task.includes('Complete the C-specific delivery'));
    assert.ok(cRun.task.includes('Name: Agent B'));
    assert.ok(cRun.task.includes('B final result'));
    assert.equal(cRun.task.includes('A final result'), false);
    for (const forbidden of ['reasoning-internal-marker', 'tool-internal-marker', 'tool_call', 'run_completed']) {
      assert.equal(bRun.task.includes(forbidden), false);
    }
    const bRequest = captured.find((request) => request.modelId === 'b-model')!;
    assert.deepEqual(bRequest.messages.slice(0, 2), [
      { role: 'system', content: 'B own instructions\n\n# Skill: chain-skill\n\nB skill instructions\n\nCurrent date: 2026-08-30' },
      { role: 'user', content: bRun.task },
    ]);
    assert.ok(bRequest.tools?.some((tool) => tool.function.name === 'chain_tool'));
    assert.deepEqual(writes, [{ path: 'b-result.md', content: 'B final result' }]);
    const aEvents = context.service.events(context.project.id, context.agent.id, aRun.id)!;
    assert.ok(
      aEvents.findIndex((event) => event.eventType === 'run_completed') <
        aEvents.findIndex((event) => event.eventType === 'next_agent_trigger_started'),
    );
    assert.equal(JSON.stringify(aEvents).includes('A final result'), false);
    assert.equal(context.runs.listEvents(2, context.project.id, context.agent.id, aRun.id), null);
    const firstBExecutionEvent = context.service.execution(context.project.id, b.id, bRun.id)?.[0];
    assert.ok(firstBExecutionEvent?.eventType === 'user_task');
    assert.equal(firstBExecutionEvent.data.content, bRun.task);
    context.db.close();
  });

  it('records an automatic-chain target Assignment overflow without target inference', async () => {
    let sourceInferenceCount = 0;
    let targetInferenceCount = 0;
    const context = setup(async (_baseUrl, _timeout, modelId) => {
      if (modelId === 'target-model') {
        targetInferenceCount += 1;
        return { type: 'message', content: 'Must not run' };
      }
      sourceInferenceCount += 1;
      return { type: 'message', content: 'Source complete' };
    });
    const target = context.agents.create(context.project.id, {
      ...baseAgentData,
      name: 'Oversized automatic target',
      assignment: 'x'.repeat(AGENT_RUNTIME_LIMITS_DEFAULTS.assignmentCharacters + 1),
      modelId: 'target-model',
    });
    assert.ok(
      context.agents.update(
        1,
        context.project.id,
        context.agent.id,
        { ...context.agent.data, triggerNextAgent: true },
        target.id,
      ),
    );

    const sourceRun = await context.service.start(context.project.id, context.agent.id);
    await waitFor(() => context.service.latest(context.project.id, target.id)?.status === 'error');
    const targetRun = context.service.latest(context.project.id, target.id)!;
    assert.equal(context.service.get(context.project.id, context.agent.id, sourceRun.id)?.status, 'done');
    assert.equal(sourceInferenceCount, 1);
    assert.equal(targetInferenceCount, 0);
    assert.equal(targetRun.safeError?.code, 'ASSIGNMENT_TOO_LARGE');
    assert.equal(
      targetRun.safeError?.limitCharacters,
      AGENT_RUNTIME_LIMITS_DEFAULTS.assignmentCharacters,
    );
    context.db.close();
  });

  it('runs the configured Agent concurrently, waits outside the model queue, and returns only Done', async () => {
    let sourceRound = 0;
    const capturedSourceMessages: ModelInferenceMessage[][] = [];
    const writes: Array<{ path: string; content: string }> = [];
    const context = setup(
      async (_baseUrl, _timeout, modelId, messages, tools) => {
        if (modelId === 'target-model') {
          assert.equal(context.service.latest(context.project.id, context.agent.id)?.status, 'running');
          assert.equal(context.service.latest(context.project.id, target.id)?.status, 'running');
          return { type: 'message', content: 'Target private final result' };
        }
        sourceRound += 1;
        capturedSourceMessages.push(structuredClone(messages));
        const runnerDefinition = tools?.find((tool) => tool.function.name === 'run_agent');
        assert.deepEqual(runnerDefinition?.function.parameters, {
          type: 'object',
          properties: {},
          additionalProperties: false,
        });
        assert.equal(JSON.stringify(runnerDefinition).includes('targetAgentId'), false);
        if (sourceRound === 1) {
          const calls = [{
            id: 'run-target-1',
            type: 'function' as const,
            function: { name: 'run_agent', arguments: '{}' },
          }];
          return {
            type: 'tool_calls',
            calls,
            assistantMessage: { role: 'assistant', content: null, tool_calls: calls },
          };
        }
        return { type: 'message', content: 'Caller continued' };
      },
      {
        tools: [new RunAgentTool()],
        filesystem: {
          writeFile: async (_projectId, value) => {
            const input = value as Record<string, unknown>;
            writes.push({ path: String(input.path), content: String(input.content) });
            return { relativePath: String(input.path), size: String(input.content).length };
          },
        },
      },
    );
    const target = context.agents.create(context.project.id, {
      ...baseAgentData,
      name: 'Target',
      instructions: 'Target instructions',
      assignment: 'Target persisted assignment',
      modelId: 'target-model',
      saveResultToFile: true,
      resultFilename: 'target-result.md',
    });
    context.agents.replaceTools(context.agent.id, ['run_agent'], [
      { toolName: 'run_agent', preRunInputFile: null, targetAgentId: target.id },
    ]);

    const callerRun = await context.service.start(context.project.id, context.agent.id);
    await waitFor(() => context.service.get(context.project.id, context.agent.id, callerRun.id)?.status === 'done');
    const targetRun = context.service.latest(context.project.id, target.id)!;
    assert.notEqual(targetRun.id, callerRun.id);
    assert.equal(targetRun.task, 'Target persisted assignment');
    assert.equal(targetRun.finalResult, 'Target private final result');
    assert.equal(capturedSourceMessages.length, 2);
    const toolMessage = capturedSourceMessages[1].find((message) => message.role === 'tool');
    assert.deepEqual(toolMessage, {
      role: 'tool',
      tool_call_id: 'run-target-1',
      content: '{"status":"Done"}',
    });
    assert.equal(JSON.stringify(toolMessage).includes('Target private final result'), false);
    assert.equal(context.service.latest(context.project.id, context.agent.id)?.finalResult, 'Caller continued');
    assert.equal(context.service.execution(context.project.id, target.id, targetRun.id)?.[0]?.eventType, 'user_task');
    assert.ok(context.service.events(context.project.id, context.agent.id, callerRun.id)?.some(
      (event) =>
        event.eventType === 'agent_runner_target_completed' &&
        event.data.targetAgentId === target.id &&
        event.data.targetRunId === targetRun.id &&
        event.data.terminalTargetStatus === 'done',
    ));
    assert.deepEqual(writes, [
      { path: 'target-result.md', content: 'Target private final result' },
    ]);
    context.db.close();
  });

  it('records an Agent Runner target Assignment overflow on the target run', async () => {
    let sourceRound = 0;
    let targetInferenceCount = 0;
    const context = setup(
      async (_baseUrl, _timeout, modelId) => {
        if (modelId === 'target-model') {
          targetInferenceCount += 1;
          return { type: 'message', content: 'Must not run' };
        }
        sourceRound += 1;
        if (sourceRound === 1) {
          const calls = [{
            id: 'run-large-target',
            type: 'function' as const,
            function: { name: 'run_agent', arguments: '{}' },
          }];
          return {
            type: 'tool_calls',
            calls,
            assistantMessage: { role: 'assistant', content: null, tool_calls: calls },
          };
        }
        return { type: 'message', content: 'Caller continued' };
      },
      { tools: [new RunAgentTool()] },
    );
    const target = context.agents.create(context.project.id, {
      ...baseAgentData,
      name: 'Large target',
      assignment: 'x'.repeat(AGENT_RUNTIME_LIMITS_DEFAULTS.assignmentCharacters + 1),
      modelId: 'target-model',
    });
    context.agents.replaceTools(context.agent.id, ['run_agent'], [
      { toolName: 'run_agent', preRunInputFile: null, targetAgentId: target.id },
    ]);

    const callerRun = await context.service.start(context.project.id, context.agent.id);
    await waitFor(() => context.service.get(context.project.id, context.agent.id, callerRun.id)?.status === 'done');
    const targetRun = context.service.latest(context.project.id, target.id)!;
    assert.equal(targetInferenceCount, 0);
    assert.equal(targetRun.status, 'error');
    assert.equal(targetRun.task, '');
    assert.equal(targetRun.safeError?.code, 'ASSIGNMENT_TOO_LARGE');
    assert.equal(
      targetRun.safeError?.actualCharacters,
      AGENT_RUNTIME_LIMITS_DEFAULTS.assignmentCharacters + 1,
    );
    const runnerResult = context.service
      .execution(context.project.id, context.agent.id, callerRun.id)
      ?.find((event) => event.eventType === 'tool_result');
    assert.equal(runnerResult?.eventType === 'tool_result' && runnerResult.data.result, '{"status":"Error"}');
    context.db.close();
  });

  it('maps target errors, cancellation, missing configuration, and active targets to Error', async () => {
    const runScenario = async (
      targetMode: 'error' | 'cancel' | 'active' | 'missing' | 'unconfigured',
    ): Promise<void> => {
      let sourceRound = 0;
      const context = setup(
        async (_baseUrl, _timeout, modelId, _messages, _tools, _transport, signal) => {
          if (modelId === 'target-model') {
            if (targetMode === 'error') throw new Error('target failed');
            if (targetMode === 'cancel') {
              return new Promise((_resolve, reject) => {
                signal?.addEventListener(
                  'abort',
                  () => reject(new DOMException('cancelled', 'AbortError')),
                  { once: true },
                );
              });
            }
          }
          sourceRound += 1;
          if (sourceRound === 1) {
            const calls = [{
              id: `runner-${targetMode}`,
              type: 'function' as const,
              function: { name: 'run_agent', arguments: '{}' },
            }];
            return {
              type: 'tool_calls',
              calls,
              assistantMessage: { role: 'assistant', content: null, tool_calls: calls },
            };
          }
          return { type: 'message', content: 'Caller done' };
        },
        { tools: [new RunAgentTool()] },
      );
      const target = context.agents.create(context.project.id, {
        ...baseAgentData,
        name: 'Target',
        modelId: 'target-model',
      });
      context.agents.replaceTools(
        context.agent.id,
        ['run_agent'],
        targetMode === 'unconfigured'
          ? []
          : [{ toolName: 'run_agent', preRunInputFile: null, targetAgentId: target.id }],
      );
      if (targetMode === 'active') {
        assert.ok(context.runs.create(1, context.project.id, target.id, 'Already active'));
      } else if (targetMode === 'missing') {
        assert.equal(context.agents.delete(1, context.project.id, target.id), true);
      }
      const callerRun = await context.service.start(context.project.id, context.agent.id);
      if (targetMode === 'cancel') {
        await waitFor(() => context.service.latest(context.project.id, target.id)?.status === 'running');
        const targetRun = context.service.latest(context.project.id, target.id)!;
        context.service.cancel(context.project.id, target.id, targetRun.id);
      }
      await waitFor(() => context.service.get(context.project.id, context.agent.id, callerRun.id)?.status === 'done');
      const resultEvent = context.service
        .execution(context.project.id, context.agent.id, callerRun.id)
        ?.find((event) => event.eventType === 'tool_result');
      assert.equal(resultEvent?.eventType, 'tool_result');
      if (resultEvent?.eventType === 'tool_result') {
        assert.equal(resultEvent.data.result, '{"status":"Error"}');
        assert.equal(resultEvent.data.status, 'failed');
      }
      if (targetMode === 'active') context.runs.cancel(context.service.latest(context.project.id, target.id)!.id);
      context.db.close();
    };

    for (const mode of ['error', 'cancel', 'active', 'missing', 'unconfigured'] as const) {
      await runScenario(mode);
    }
  });

  it('rejects direct and multi-Agent Runner cycles while allowing each caller to continue', async () => {
    const rounds = new Map<string, number>();
    const context = setup(
      async (_baseUrl, _timeout, modelId) => {
        const round = (rounds.get(modelId) ?? 0) + 1;
        rounds.set(modelId, round);
        if (round === 1) {
          const calls = [{
            id: `${modelId}-runner`,
            type: 'function' as const,
            function: { name: 'run_agent', arguments: '{}' },
          }];
          return {
            type: 'tool_calls',
            calls,
            assistantMessage: { role: 'assistant', content: null, tool_calls: calls },
          };
        }
        return { type: 'message', content: `${modelId} done` };
      },
      { tools: [new RunAgentTool()] },
    );
    const b = context.agents.create(context.project.id, {
      ...baseAgentData,
      name: 'B',
      modelId: 'b-model',
    });
    const c = context.agents.create(context.project.id, {
      ...baseAgentData,
      name: 'C',
      modelId: 'c-model',
    });
    context.agents.replaceTools(context.agent.id, ['run_agent'], [
      { toolName: 'run_agent', preRunInputFile: null, targetAgentId: b.id },
    ]);
    context.agents.replaceTools(b.id, ['run_agent'], [
      { toolName: 'run_agent', preRunInputFile: null, targetAgentId: context.agent.id },
    ]);

    const twoAgentRun = await context.service.start(context.project.id, context.agent.id);
    await waitFor(
      () =>
        context.service.get(context.project.id, context.agent.id, twoAgentRun.id)?.status === 'done',
    );
    const bRun = context.service.latest(context.project.id, b.id)!;
    const indirectCycleResult = context.service
      .execution(context.project.id, b.id, bRun.id)
      ?.find((event) => event.eventType === 'tool_result');
    assert.equal(indirectCycleResult?.eventType, 'tool_result');
    if (indirectCycleResult?.eventType === 'tool_result') {
      assert.equal(indirectCycleResult.data.result, '{"status":"Error"}');
    }
    assert.equal(
      context.runs.getLatest(1, context.project.id, context.agent.id)?.id,
      twoAgentRun.id,
    );

    context.agents.replaceTools(b.id, ['run_agent'], [
      { toolName: 'run_agent', preRunInputFile: null, targetAgentId: c.id },
    ]);
    context.agents.replaceTools(c.id, ['run_agent'], [
      { toolName: 'run_agent', preRunInputFile: null, targetAgentId: context.agent.id },
    ]);
    rounds.clear();
    const aRun = await context.service.start(context.project.id, context.agent.id);
    await waitFor(
      () => context.service.get(context.project.id, context.agent.id, aRun.id)?.status === 'done',
    );
    const cRun = context.service.latest(context.project.id, c.id)!;
    const cycleResult = context.service
      .execution(context.project.id, c.id, cRun.id)
      ?.find((event) => event.eventType === 'tool_result');
    assert.equal(cycleResult?.eventType, 'tool_result');
    if (cycleResult?.eventType === 'tool_result') {
      assert.equal(cycleResult.data.result, '{"status":"Error"}');
    }
    assert.equal(context.runs.getLatest(1, context.project.id, context.agent.id)?.id, aRun.id);

    context.agents.replaceTools(context.agent.id, ['run_agent'], [
      { toolName: 'run_agent', preRunInputFile: null, targetAgentId: context.agent.id },
    ]);
    rounds.clear();
    const directRun = await context.service.start(context.project.id, context.agent.id);
    await waitFor(() => context.service.get(context.project.id, context.agent.id, directRun.id)?.status === 'done');
    const directResult = context.service
      .execution(context.project.id, context.agent.id, directRun.id)
      ?.find((event) => event.eventType === 'tool_result');
    assert.equal(directResult?.eventType, 'tool_result');
    if (directResult?.eventType === 'tool_result') {
      assert.equal(directResult.data.result, '{"status":"Error"}');
    }
    context.db.close();
  });

  it('does not chain after result-file failure, provider error, or cancellation', async () => {
    const fileFailure = setup(async () => ({ type: 'message', content: 'A result' }), {
      agentData: { saveResultToFile: true, resultFilename: 'result.md' },
      filesystem: { writeFile: async () => { throw new Error('write failed'); } },
    });
    const fileTarget = fileFailure.agents.create(fileFailure.project.id, {
      ...baseAgentData,
      name: 'File target',
    });
    fileFailure.agents.update(1, fileFailure.project.id, fileFailure.agent.id, {
      ...fileFailure.agent.data,
      triggerNextAgent: true,
    }, fileTarget.id);
    await fileFailure.service.start(fileFailure.project.id, fileFailure.agent.id, { task: 'Write first' });
    await waitFor(() => fileFailure.service.latest(fileFailure.project.id, fileFailure.agent.id)?.status === 'error');
    assert.equal(fileFailure.service.latest(fileFailure.project.id, fileTarget.id), null);
    fileFailure.db.close();

    const providerFailure = setup(async () => { throw new Error('provider failed'); });
    const errorTarget = providerFailure.agents.create(providerFailure.project.id, {
      ...baseAgentData,
      name: 'Error target',
    });
    providerFailure.agents.update(1, providerFailure.project.id, providerFailure.agent.id, {
      ...providerFailure.agent.data,
      triggerNextAgent: true,
    }, errorTarget.id);
    await providerFailure.service.start(providerFailure.project.id, providerFailure.agent.id, { task: 'Fail' });
    await waitFor(() => providerFailure.service.latest(providerFailure.project.id, providerFailure.agent.id)?.status === 'error');
    assert.equal(providerFailure.service.latest(providerFailure.project.id, errorTarget.id), null);
    providerFailure.db.close();

    let resolveRequest: ((result: ModelInferenceResult) => void) | undefined;
    const cancellation = setup(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const cancelTarget = cancellation.agents.create(cancellation.project.id, {
      ...baseAgentData,
      name: 'Cancel target',
    });
    cancellation.agents.update(1, cancellation.project.id, cancellation.agent.id, {
      ...cancellation.agent.data,
      triggerNextAgent: true,
    }, cancelTarget.id);
    const run = await cancellation.service.start(cancellation.project.id, cancellation.agent.id, { task: 'Cancel' });
    await waitFor(() => resolveRequest !== undefined);
    cancellation.service.cancel(cancellation.project.id, cancellation.agent.id, run.id);
    resolveRequest?.({ type: 'message', content: 'Late result' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(cancellation.service.latest(cancellation.project.id, cancelTarget.id), null);
    cancellation.db.close();
  });

  it('skips chaining safely when the target is active or disappears during execution', async () => {
    let resolveActive: ((result: ModelInferenceResult) => void) | undefined;
    const active = setup(() => new Promise((resolve) => { resolveActive = resolve; }));
    const activeTarget = active.agents.create(active.project.id, { ...baseAgentData, name: 'Busy target' });
    active.agents.update(1, active.project.id, active.agent.id, {
      ...active.agent.data,
      triggerNextAgent: true,
    }, activeTarget.id);
    const existingTargetRun = active.runs.create(1, active.project.id, activeTarget.id, 'Already running');
    assert.ok(existingTargetRun);
    const activeSource = await active.service.start(active.project.id, active.agent.id, { task: 'Try busy target' });
    await waitFor(() => resolveActive !== undefined);
    resolveActive?.({ type: 'message', content: 'Source done' });
    await waitFor(() => active.service.get(active.project.id, active.agent.id, activeSource.id)?.status === 'done');
    assert.equal(active.runs.getLatest(1, active.project.id, activeTarget.id)?.id, existingTargetRun.id);
    assert.ok(active.service.events(active.project.id, active.agent.id, activeSource.id)?.some(
      (event) => event.eventType === 'next_agent_trigger_skipped' && event.data.status === 'active_run_exists',
    ));
    active.runs.cancel(existingTargetRun.id);
    active.db.close();

    let resolveMissing: ((result: ModelInferenceResult) => void) | undefined;
    const missing = setup(() => new Promise((resolve) => { resolveMissing = resolve; }));
    const missingTarget = missing.agents.create(missing.project.id, { ...baseAgentData, name: 'Removed target' });
    missing.agents.update(1, missing.project.id, missing.agent.id, {
      ...missing.agent.data,
      triggerNextAgent: true,
    }, missingTarget.id);
    const missingSource = await missing.service.start(missing.project.id, missing.agent.id, { task: 'Lose target' });
    await waitFor(() => resolveMissing !== undefined);
    assert.equal(missing.agents.delete(1, missing.project.id, missingTarget.id), true);
    resolveMissing?.({ type: 'message', content: 'Still done' });
    await waitFor(() => missing.service.get(missing.project.id, missing.agent.id, missingSource.id)?.status === 'done');
    assert.ok(missing.service.events(missing.project.id, missing.agent.id, missingSource.id)?.some(
      (event) => event.eventType === 'next_agent_trigger_failed' && event.data.status === 'target_missing',
    ));
    missing.db.close();
  });

  it('prevents an execution-time cycle even when repository writes bypass configuration validation', async () => {
    const context = setup(async (_baseUrl, _timeout, modelId) => ({
      type: 'message',
      content: modelId === 'b-model' ? 'B done' : 'A done',
    }));
    const b = context.agents.create(context.project.id, {
      ...baseAgentData,
      name: 'Agent B',
      modelId: 'b-model',
      triggerNextAgent: true,
    });
    context.agents.update(1, context.project.id, context.agent.id, {
      ...context.agent.data,
      triggerNextAgent: true,
    }, b.id);
    context.agents.update(1, context.project.id, b.id, b.data, context.agent.id);
    const aRun = await context.service.start(context.project.id, context.agent.id, { task: 'Cycle safely' });
    await waitFor(() => context.service.latest(context.project.id, b.id)?.status === 'done');
    const bRun = context.service.latest(context.project.id, b.id)!;
    assert.equal(context.runs.getLatest(1, context.project.id, context.agent.id)?.id, aRun.id);
    assert.ok(context.service.events(context.project.id, b.id, bRun.id)?.some(
      (event) => event.eventType === 'next_agent_trigger_skipped' && event.data.status === 'cycle_detected',
    ));
    context.db.close();
  });

  it('persists explicit provider reasoning and the final result without changing inference context', async () => {
    const captured: Array<Parameters<TestInferenceRequester>> = [];
    const context = setup(async (...parameters) => {
      captured.push(parameters);
      return {
        type: 'message',
        content: 'Final result',
        assistantMessage: { role: 'assistant', content: 'Final result', reasoning_content: 'hidden' },
      };
    }, { testNow: () => new Date(2026, 7, 30) });
    const started = await context.service.start(context.project.id, context.agent.id, {
      task: 'Do the work',
    });
    assert.equal(started.status, 'running');
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    const completed = context.service.latest(context.project.id, context.agent.id);
    assert.equal(completed?.finalResult, 'Final result');
    assert.equal(captured[0]?.[2], 'configured-agent-model');
    assert.deepEqual(captured[0]?.[3], [
      { role: 'system', content: 'Inline instructions\n\nCurrent date: 2026-08-30' },
      { role: 'user', content: 'Do the work' },
    ]);
    assert.deepEqual(
      captured[0]?.[4]?.map((definition) => definition.function.name),
      [
        'project_list_directory',
        'project_read_file',
      ],
    );
    assert.equal(captured[0]?.[7], 'server-secret');
    assert.ok(!JSON.stringify(completed).includes('hidden'));
    assert.deepEqual(
      context.service.execution(context.project.id, context.agent.id, started.id)?.map((event) => ({
        eventType: event.eventType,
        data: event.data,
      })),
      [
        { eventType: 'user_task', data: { content: 'Do the work' } },
        { eventType: 'reasoning', data: { content: 'hidden' } },
        { eventType: 'final_result', data: { content: 'Final result' } },
      ],
    );
    context.db.close();
  });

  it('does not invent reasoning or execute tool-like reasoning text', async () => {
    let executions = 0;
    const tool = createTestTool('reasoning_tool', async () => {
      executions += 1;
      return { used: true };
    });
    const withReasoning = setup(
      async () => ({
        type: 'message',
        content: 'No tool was called',
        assistantMessage: {
          role: 'assistant',
          content: 'No tool was called',
          reasoning_content:
            '{"tool_calls":[{"function":{"name":"reasoning_tool","arguments":"{\\"value\\":\\"unsafe\\"}"}}]}',
        },
      }),
      { toolNames: ['reasoning_tool'], tools: [tool] },
    );
    const reasonedRun = await withReasoning.service.start(
      withReasoning.project.id,
      withReasoning.agent.id,
      { task: 'Reason only' },
    );
    await waitFor(
      () =>
        withReasoning.service.get(withReasoning.project.id, withReasoning.agent.id, reasonedRun.id)
          ?.status === 'done',
    );
    assert.equal(executions, 0);
    assert.equal(
      withReasoning.service
        .execution(withReasoning.project.id, withReasoning.agent.id, reasonedRun.id)
        ?.filter((event) => event.eventType === 'tool_call').length,
      0,
    );
    withReasoning.db.close();

    const withoutReasoning = setup(async () => ({ type: 'message', content: 'Plain result' }));
    const plainRun = await withoutReasoning.service.start(
      withoutReasoning.project.id,
      withoutReasoning.agent.id,
      { task: 'No reasoning returned' },
    );
    await waitFor(
      () =>
        withoutReasoning.service.get(
          withoutReasoning.project.id,
          withoutReasoning.agent.id,
          plainRun.id,
        )?.status === 'done',
    );
    assert.equal(
      withoutReasoning.service
        .execution(withoutReasoning.project.id, withoutReasoning.agent.id, plainRun.id)
        ?.some((event) => event.eventType === 'reasoning'),
      false,
    );
    withoutReasoning.db.close();
  });

  it('loads selected Skills deterministically and deduplicates explicit and required tools', async () => {
    const captured: Array<Parameters<TestInferenceRequester>> = [];
    const tool = createTestTool('shared_tool', async () => ({ used: true }));
    const context = setup(
      async (...parameters) => {
        captured.push(parameters);
        return { type: 'message', content: 'Skill result' };
      },
      {
        testNow: () => new Date(2026, 7, 30),
        skills: [
          { commandName: 'first', markdown: 'First instructions', requiredTools: ['shared_tool'] },
          { commandName: 'second', markdown: 'Second instructions', requiredTools: ['shared_tool'] },
        ],
        toolNames: ['shared_tool'],
        tools: [tool],
      },
    );
    await context.service.start(context.project.id, context.agent.id, { task: 'Use Skills' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    assert.deepEqual(captured[0]?.[3], [
      {
        role: 'system',
        content:
          'Inline instructions\n\n# Skill: first\n\nFirst instructions\n\n# Skill: second\n\nSecond instructions\n\nCurrent date: 2026-08-30',
      },
      { role: 'user', content: 'Do the work' },
    ]);
    assert.equal(
      captured[0]?.[4]?.filter((definition) => definition.function.name === 'shared_tool').length,
      1,
    );
    assert.equal(context.agent.data.instructions.includes('First instructions'), false);
    const eventTypes = context.runs
      .listEvents(1, context.project.id, context.agent.id, context.service.latest(context.project.id, context.agent.id)!.id)!
      .map((event) => event.eventType);
    assert.ok(eventTypes.includes('skills_loaded'));
    assert.ok(eventTypes.includes('tools_resolved'));
    context.db.close();
  });

  it('fails safely when a persisted selected Skill cannot be loaded', async () => {
    let requestCount = 0;
    const context = setup(
      async () => {
        requestCount += 1;
        return { type: 'message', content: 'Must not run' };
      },
      { skills: [{ commandName: 'missing', markdown: 'Unavailable' }], missingSkill: true },
    );
    await context.service.start(context.project.id, context.agent.id, { task: 'Load Skill' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'error');
    assert.equal(requestCount, 0);
    assert.deepEqual(context.service.latest(context.project.id, context.agent.id)?.safeError, {
      stage: 'skill_load',
      code: 'SKILL_UNAVAILABLE',
      message: 'A selected Skill could not be loaded.',
    });
    context.db.close();
  });

  it('maps an oversized selected Skill to an explicit size error before inference', async () => {
    let requestCount = 0;
    const context = setup(
      async () => {
        requestCount += 1;
        return { type: 'message', content: 'Must not run' };
      },
      {
        skills: [{ commandName: 'large-skill', markdown: 'Oversized persisted content' }],
        oversizedSkill: true,
      },
    );
    const run = await context.service.start(context.project.id, context.agent.id);
    await waitFor(() => context.service.get(context.project.id, context.agent.id, run.id)?.status === 'error');
    assert.equal(requestCount, 0);
    assert.deepEqual(context.service.get(context.project.id, context.agent.id, run.id)?.safeError, {
      stage: 'skill_load',
      code: 'SKILL_TOO_LARGE',
      message: 'A selected Skill is too large.',
    });
    context.db.close();
  });

  it('fails tool resolution when a selected Skill requires an unavailable tool', async () => {
    let requestCount = 0;
    const context = setup(
      async () => {
        requestCount += 1;
        return { type: 'message', content: 'Must not run' };
      },
      {
        skills: [
          {
            commandName: 'stale-tool-skill',
            markdown: 'Use the required tool.',
            requiredTools: ['removed_tool'],
          },
        ],
      },
    );
    await context.service.start(context.project.id, context.agent.id, { task: 'Resolve tools' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'error');
    assert.equal(requestCount, 0);
    assert.deepEqual(context.service.latest(context.project.id, context.agent.id)?.safeError, {
      stage: 'tool_resolution',
      code: 'TOOL_RESOLUTION_FAILED',
      message: 'The Agent tools could not be resolved.',
    });
    context.db.close();
  });

  it('preserves chronology across multiple tool rounds and releases the inference slot for tools', async () => {
    const capturedMessages: unknown[] = [];
    const externalExecutions: unknown[] = [];
    const filesystemCalls: Array<{ operation: string; projectId: number; value: unknown }> = [];
    const queueHolder: { current?: ModelConnectionInferenceQueue } = {};
    const external = createTestTool('external_tool', async (value) => {
      externalExecutions.push(value);
      return { external: 'result' };
    });
    let round = 0;
    const context = setup(
      async (_baseUrl, _timeout, _modelId, messages) => {
        capturedMessages.push(structuredClone(messages));
        round += 1;
        if (round === 1) {
          const calls = [
            {
              id: 'read-1',
              type: 'function' as const,
              function: { name: 'project_read_file', arguments: '{"path":"src/input.txt"}' },
            },
            {
              id: 'write-1',
              type: 'function' as const,
              function: {
                name: 'project_write_file',
                arguments: '{"path":"src/output.txt","content":"created"}',
              },
            },
          ];
          return {
            type: 'tool_calls',
            calls,
            assistantMessage: {
              role: 'assistant',
              content: null,
              reasoning_content: 'inspect the Project file first',
              tool_calls: calls,
            },
          };
        }
        if (round === 2) {
          const calls = [
            {
              id: 'external-1',
              type: 'function' as const,
              function: { name: 'external_tool', arguments: '{"value":"continue"}' },
            },
          ];
          return {
            type: 'tool_calls',
            calls,
            assistantMessage: { role: 'assistant', content: 'Calling external tool', tool_calls: calls },
          };
        }
        return { type: 'message', content: 'Final after tools' };
      },
      {
        agentData: {
          saveResultToFile: true,
          resultDirectory: '',
          resultFilename: 'final.md',
          projectFilesystemPermissions: {
            list: true,
            read: true,
            write: true,
            createDirectory: false,
            rename: false,
            delete: false,
          },
        },
        toolNames: ['external_tool'],
        tools: [external],
        filesystem: {
          readFile: async (projectId, path) => {
            filesystemCalls.push({ operation: 'read', projectId, value: path });
            assert.ok(queueHolder.current);
            const release = await queueHolder.current.acquire(connection.id);
            release();
            return { relativePath: String(path), content: 'input', size: 5 };
          },
          writeFile: async (projectId, value) => {
            filesystemCalls.push({ operation: 'write', projectId, value });
            const input = value as Record<string, unknown>;
            return {
              relativePath: String(input.path),
              size: String(input.content).length,
            };
          },
        },
      },
    );
    queueHolder.current = context.queue;
    const started = await context.service.start(context.project.id, context.agent.id, {
      task: 'Use several tools',
    });
    await waitFor(() => context.service.get(context.project.id, context.agent.id, started.id)?.status === 'done');
    assert.equal(context.service.get(context.project.id, context.agent.id, started.id)?.finalResult, 'Final after tools');
    assert.deepEqual(
      filesystemCalls.map((call) => ({ operation: call.operation, projectId: call.projectId })),
      [
        { operation: 'read', projectId: context.project.id },
        { operation: 'write', projectId: context.project.id },
        { operation: 'write', projectId: context.project.id },
      ],
    );
    assert.deepEqual(filesystemCalls[filesystemCalls.length - 1]?.value, {
      path: 'final.md',
      content: 'Final after tools',
    });
    assert.deepEqual(externalExecutions, [{ value: 'continue' }]);
    const secondRound = capturedMessages[1] as Array<Record<string, unknown>>;
    assert.deepEqual(secondRound.slice(-3).map((message) => message.role), ['assistant', 'tool', 'tool']);
    const thirdRound = capturedMessages[2] as Array<Record<string, unknown>>;
    assert.deepEqual(thirdRound.slice(-2).map((message) => message.role), ['assistant', 'tool']);
    const serializedContext = JSON.stringify(capturedMessages);
    assert.equal(serializedContext.includes('inspect the Project file first'), false);
    const events = context.runs.listEvents(1, context.project.id, context.agent.id, started.id)!;
    assert.equal(events.filter((event) => event.eventType === 'tool_call_started').length, 3);
    assert.equal(events.filter((event) => event.eventType === 'tool_call_completed').length, 3);
    assert.ok(!JSON.stringify(events).includes('inspect the Project file first'));
    assert.ok(!JSON.stringify(events).includes('server-secret'));
    const execution = context.service.execution(
      context.project.id,
      context.agent.id,
      started.id,
    )!;
    assert.deepEqual(
      execution.map((event) => event.eventType),
      [
        'user_task',
        'reasoning',
        'tool_call',
        'tool_result',
        'tool_call',
        'tool_result',
        'assistant_message',
        'tool_call',
        'tool_result',
        'final_result',
      ],
    );
    assert.equal(
      execution.find((event) => event.eventType === 'user_task')?.data.content,
      'Do the work',
    );
    assert.equal(
      execution.find((event) => event.eventType === 'final_result')?.data.content,
      'Final after tools',
    );
    assert.deepEqual(
      execution
        .filter((event) => event.eventType === 'tool_call')
        .map((event) => JSON.parse(event.data.arguments) as unknown),
      [
        { path: 'src/input.txt' },
        { path: 'src/output.txt', content: 'created' },
        { value: 'continue' },
      ],
    );
    context.db.close();
  });

  it('bounds and redacts structured tool arguments and results in the execution transcript', async () => {
    let round = 0;
    const requests: ModelInferenceMessage[][] = [];
    const tool = createTestTool('safe_display_tool', async () => ({
      apiKey: 'result-secret',
      projectRoot: 'C:\\private\\project',
      observations: Array.from({ length: 201 }, (_, index) => ({ index })),
    }));
    const context = setup(
      async (_baseUrl, _timeout, _modelId, messages) => {
        requests.push(structuredClone(messages));
        round += 1;
        if (round === 2) return { type: 'message', content: 'Finished safely' };
        const calls = [
          {
            id: 'safe-1',
            type: 'function' as const,
            function: {
              name: 'safe_display_tool',
              arguments:
                '{"value":"C:\\\\private\\\\project Authorization: Bearer argument-secret"}',
            },
          },
        ];
        return {
          type: 'tool_calls' as const,
          calls,
          assistantMessage: { role: 'assistant' as const, content: null, tool_calls: calls },
        };
      },
      { toolNames: ['safe_display_tool'], tools: [tool] },
    );
    const run = await context.service.start(context.project.id, context.agent.id, {
      task: 'Keep transcript safe',
    });
    await waitFor(
      () => context.service.get(context.project.id, context.agent.id, run.id)?.status === 'done',
    );
    const serialized = JSON.stringify(
      context.service.execution(context.project.id, context.agent.id, run.id),
    );
    assert.equal(serialized.includes('argument-secret'), false);
    assert.equal(serialized.includes('result-secret'), false);
    assert.equal(serialized.includes('C:\\\\private\\\\project'), false);
    assert.equal(serialized.includes('[REDACTED]'), true);
    assert.equal(serialized.includes('[REDACTED_PATH]'), true);
    const toolResult = context.service
      .execution(context.project.id, context.agent.id, run.id)
      ?.find((event) => event.eventType === 'tool_result');
    assert.ok(toolResult && toolResult.eventType === 'tool_result');
    const displayedResult = JSON.parse(toolResult.data.result) as { observations: unknown[] };
    assert.equal(displayedResult.observations.length, 201);
    assert.equal(displayedResult.observations[0], '[ITEMS TRUNCATED]');
    assert.deepEqual(displayedResult.observations[1], { index: 1 });
    assert.deepEqual(displayedResult.observations[200], { index: 200 });
    assert.equal(toolResult.data.result.includes('"index":0'), false);
    const modelToolMessage = requests[1]?.find((message) => message.role === 'tool');
    assert.ok(modelToolMessage && modelToolMessage.role === 'tool');
    const modelResult = JSON.parse(modelToolMessage.content) as { observations: Array<{ index: number }> };
    assert.equal(modelResult.observations.length, 201);
    assert.deepEqual(modelResult.observations[0], { index: 0 });
    assert.deepEqual(modelResult.observations[200], { index: 200 });
    assert.equal(modelToolMessage.content.includes('[ITEMS TRUNCATED]'), false);
    assert.equal(context.service.get(context.project.id, context.agent.id, run.id)?.status, 'done');
    context.db.close();
  });

  it('fails an oversized ordinary tool result without a truncated tool message or another inference', async () => {
    const requests: ModelInferenceMessage[][] = [];
    const oversizedResult = {
      content: 'x'.repeat(AGENT_RUNTIME_LIMITS_DEFAULTS.toolResultCharacters),
    };
    let round = 0;
    const context = setup(
      async (_baseUrl, _timeout, _modelId, messages) => {
        requests.push(structuredClone(messages));
        round += 1;
        if (round > 1) return { type: 'message', content: 'Must not run' };
        const calls = [{
          id: 'large-call-1',
          type: 'function' as const,
          function: { name: 'large_result_tool', arguments: '{"value":"large"}' },
        }];
        return {
          type: 'tool_calls',
          calls,
          assistantMessage: { role: 'assistant', content: null, tool_calls: calls },
        };
      },
      {
        toolNames: ['large_result_tool'],
        tools: [createTestTool('large_result_tool', async () => oversizedResult)],
      },
    );

    const run = await context.service.start(context.project.id, context.agent.id);
    await waitFor(() => context.service.get(context.project.id, context.agent.id, run.id)?.status === 'error');
    const failed = context.service.get(context.project.id, context.agent.id, run.id)!;
    assert.equal(requests.length, 1);
    assert.equal(requests.some((messages) => messages.some((message) => message.role === 'tool')), false);
    assert.equal(failed.safeError?.code, 'TOOL_RESULT_TOO_LARGE');
    assert.equal(failed.safeError?.toolName, 'large_result_tool');
    assert.equal(failed.safeError?.actualCharacters, JSON.stringify(oversizedResult).length);
    assert.equal(
      failed.safeError?.limitCharacters,
      AGENT_RUNTIME_LIMITS_DEFAULTS.toolResultCharacters,
    );
    const execution = context.service.execution(context.project.id, context.agent.id, run.id)!;
    assert.deepEqual(execution.map((event) => event.eventType), [
      'user_task',
      'tool_call',
      'tool_result',
    ]);
    const events = context.runs.listEvents(1, context.project.id, context.agent.id, run.id)!;
    assert.equal(events.some((event) => event.eventType === 'tool_call_started'), true);
    assert.equal(
      events.some(
        (event) => event.eventType === 'tool_call_failed' && event.data.status === 'result_too_large',
      ),
      true,
    );
    context.db.close();
  });

  it('returns malformed and unavailable tool calls to the model without making them fatal', async () => {
    const captured: Array<Array<Record<string, unknown>>> = [];
    let round = 0;
    const context = setup(
      async (_baseUrl, _timeout, _modelId, messages) => {
        captured.push(structuredClone(messages) as Array<Record<string, unknown>>);
        round += 1;
        if (round === 1) {
          const calls = [
            {
              id: 'unknown-1',
              type: 'function' as const,
              function: { name: 'stale_tool', arguments: '{}' },
            },
            {
              id: 'invalid-1',
              type: 'function' as const,
              function: { name: 'project_read_file', arguments: '{not-json' },
            },
          ];
          return {
            type: 'tool_calls',
            calls,
            assistantMessage: { role: 'assistant', content: null, tool_calls: calls },
          };
        }
        return { type: 'message', content: 'Corrected' };
      },
      { toolNames: ['stale_tool'] },
    );
    const started = await context.service.start(context.project.id, context.agent.id, {
      task: 'Correct failures',
    });
    await waitFor(() => context.service.get(context.project.id, context.agent.id, started.id)?.status === 'done');
    const toolResults = captured[1]!.filter((message) => message.role === 'tool');
    assert.equal(toolResults.length, 2);
    assert.equal(JSON.stringify(toolResults).includes('TOOL_NOT_AVAILABLE'), true);
    assert.equal(JSON.stringify(toolResults).includes('INVALID_TOOL_ARGUMENTS'), true);
    assert.equal(context.service.errors(context.project.id, context.agent.id)?.length, 0);
    const events = context.runs.listEvents(1, context.project.id, context.agent.id, started.id)!;
    assert.equal(events.filter((event) => event.eventType === 'tool_call_failed').length, 2);
    context.db.close();
  });

  it('continues after recoverable tool failure but terminates on internal tool failure', async () => {
    let recoverableRound = 0;
    const recoverableTool = createTestTool('recoverable_tool', async () => {
      throw new RecoverableToolError('WEB_SEARCH_FAILED', 'Search was unavailable.');
    });
    const recoverable = setup(
      async () => {
        recoverableRound += 1;
        if (recoverableRound === 1) {
          const calls = [
            {
              id: 'recoverable-1',
              type: 'function' as const,
              function: { name: 'recoverable_tool', arguments: '{"value":"search"}' },
            },
          ];
          return {
            type: 'tool_calls',
            calls,
            assistantMessage: { role: 'assistant', content: null, tool_calls: calls },
          };
        }
        return { type: 'message', content: 'Recovered' };
      },
      { toolNames: ['recoverable_tool'], tools: [recoverableTool] },
    );
    const recoverableRun = await recoverable.service.start(
      recoverable.project.id,
      recoverable.agent.id,
      { task: 'Recover' },
    );
    await waitFor(
      () =>
        recoverable.service.get(recoverable.project.id, recoverable.agent.id, recoverableRun.id)
          ?.status === 'done',
    );
    assert.equal(recoverable.service.errors(recoverable.project.id, recoverable.agent.id)?.length, 0);
    recoverable.db.close();

    const fatalTool = createTestTool('fatal_tool', async () => {
      throw new Error('sensitive internal detail');
    });
    const fatal = setup(
      async () => {
        const calls = [
          {
            id: 'fatal-1',
            type: 'function' as const,
            function: { name: 'fatal_tool', arguments: '{"value":"fail"}' },
          },
        ];
        return {
          type: 'tool_calls',
          calls,
          assistantMessage: { role: 'assistant', content: null, tool_calls: calls },
        };
      },
      { toolNames: ['fatal_tool'], tools: [fatalTool] },
    );
    await fatal.service.start(fatal.project.id, fatal.agent.id, { task: 'Fail internally' });
    await waitFor(() => fatal.service.latest(fatal.project.id, fatal.agent.id)?.status === 'error');
    assert.deepEqual(fatal.service.latest(fatal.project.id, fatal.agent.id)?.safeError, {
      stage: 'tool_execution_internal',
      code: 'TOOL_EXECUTION_INTERNAL_ERROR',
      message: 'The Agent tool could not be executed.',
    });
    assert.equal(JSON.stringify(fatal.service.errors(fatal.project.id, fatal.agent.id)).includes('sensitive'), false);
    fatal.db.close();
  });

  it('has no arbitrary tool-round cutoff', async () => {
    let round = 0;
    const context = setup(async () => {
      round += 1;
      if (round > 12) return { type: 'message', content: 'Finished after many rounds' };
      const calls = [
        {
          id: `round-${round}`,
          type: 'function' as const,
          function: { name: 'project_list_directory', arguments: '{"path":""}' },
        },
      ];
      return {
        type: 'tool_calls',
        calls,
        assistantMessage: { role: 'assistant', content: null, tool_calls: calls },
      };
    });
    await context.service.start(context.project.id, context.agent.id, { task: 'Keep working' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    assert.equal(round, 13);
    assert.equal(context.service.latest(context.project.id, context.agent.id)?.finalResult, 'Finished after many rounds');
    context.db.close();
  });

  it('requires a saved assignment, ignores client task input, and rejects inaccessible or active Agents', async () => {
    const unassigned = setup(async () => ({ type: 'message', content: 'Must not run' }), {
      agentData: { assignment: '   ' },
    });
    await assert.rejects(
      () => unassigned.service.start(unassigned.project.id, unassigned.agent.id),
      (error: unknown) => error instanceof AgentRunError && error.code === 'INVALID_INPUT',
    );
    assert.equal(unassigned.service.latest(unassigned.project.id, unassigned.agent.id), null);
    unassigned.db.close();

    let resolveRequest: ((result: ModelInferenceResult) => void) | undefined;
    const context = setup(
      () => new Promise<ModelInferenceResult>((resolve) => (resolveRequest = resolve)),
    );
    const first = await context.service.start(context.project.id, context.agent.id, {
      task: 'Client override attempt',
    });
    assert.equal(first.task, 'Do the work');
    assert.equal(
      context.runs.getById(1, context.project.id, context.agent.id, first.id)?.data.originalTask,
      'Do the work',
    );
    await assert.rejects(
      () => context.service.start(context.project.id, context.agent.id, { task: 'Second' }),
      (error: unknown) => error instanceof AgentRunError && error.code === 'ACTIVE_RUN_EXISTS',
    );
    context.service.cancel(
      context.project.id,
      context.agent.id,
      context.service.latest(context.project.id, context.agent.id)!.id,
    );
    resolveRequest?.({ type: 'message', content: 'Late' });
    context.db.close();

    const forbidden = setup(async () => ({ type: 'message', content: 'No' }), { userId: 2 });
    await assert.rejects(
      () => forbidden.service.start(forbidden.project.id, forbidden.agent.id, { task: 'Forbidden' }),
      (error: unknown) => error instanceof AgentRunError && error.code === 'AGENT_NOT_FOUND',
    );
    forbidden.db.close();
  });

  it('pauses at a checkpoint, resumes, and can cancel running or paused runs terminally', async () => {
    const context = setup(async () => ({ type: 'message', content: 'Completed' }));
    const pausedRun = await context.service.start(context.project.id, context.agent.id, { task: 'Pause' });
    context.service.pause(context.project.id, context.agent.id, pausedRun.id);
    await waitFor(() => context.service.get(context.project.id, context.agent.id, pausedRun.id)?.status === 'paused');
    assert.equal(context.service.resume(context.project.id, context.agent.id, pausedRun.id).status, 'running');
    await waitFor(() => context.service.get(context.project.id, context.agent.id, pausedRun.id)?.status === 'done');
    assert.throws(
      () => context.service.cancel(context.project.id, context.agent.id, pausedRun.id),
      (error: unknown) => error instanceof AgentRunError && error.code === 'INVALID_TRANSITION',
    );

    const cancelled = await context.service.start(context.project.id, context.agent.id, { task: 'Cancel' });
    assert.equal(context.service.cancel(context.project.id, context.agent.id, cancelled.id).status, 'cancelled');
    assert.equal(context.runs.complete(cancelled.id, 'Stale result'), false);

    const pausedCancellation = await context.service.start(context.project.id, context.agent.id, {
      task: 'Pause then cancel',
    });
    context.service.pause(context.project.id, context.agent.id, pausedCancellation.id);
    await waitFor(
      () =>
        context.service.get(context.project.id, context.agent.id, pausedCancellation.id)?.status ===
        'paused',
    );
    assert.equal(
      context.service.cancel(context.project.id, context.agent.id, pausedCancellation.id).status,
      'cancelled',
    );
    context.db.close();
  });

  it('uses file instructions, the configured default model, and the shared connection queue', async () => {
    let requested = false;
    let messages: unknown;
    const context = setup(
      async (_baseUrl, _timeout, _modelId, value) => {
        requested = true;
        messages = value;
        return { type: 'message', content: 'Done' };
      },
      { fileInstructions: 'File instructions', allowModelSelection: true, testNow: () => new Date(2026, 7, 30) },
    );
    const release = await context.queue.acquire(connection.id);
    await context.service.start(context.project.id, context.agent.id, { task: 'Queued' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(requested, false);
    assert.equal(context.queue.waitingCount(connection.id), 1);
    release();
    await waitFor(() => requested);
    assert.deepEqual(messages, [
      { role: 'system', content: 'File instructions\n\nCurrent date: 2026-08-30' },
      { role: 'user', content: 'Do the work' },
    ]);
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    context.db.close();
  });

  it('uses no Agent instructions without reading the inactive file and preserves merged system context', async () => {
    const readPaths: string[] = [];
    let messages: ModelInferenceMessage[] = [];
    const context = setup(
      async (_baseUrl, _timeout, _modelId, value) => {
        messages = structuredClone(value);
        return { type: 'message', content: 'Done' };
      },
      {
        testNow: () => new Date(2026, 7, 30),
        skills: [{ commandName: 'none-skill', markdown: 'Skill context remains' }],
        agentData: {
          instructionSource: 'none',
          instructions: 'Inactive inline instructions must not appear',
          instructionFilePath: 'missing/inactive.md',
          attachedProjectFiles: ['attached/context.txt'],
        },
        filesystem: {
          readFile: async (_projectId, path) => {
            readPaths.push(String(path));
            if (path !== 'attached/context.txt') {
              throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND');
            }
            return {
              relativePath: 'attached/context.txt',
              content: 'Attached context remains',
              size: 24,
            };
          },
        },
      },
    );
    const run = await context.service.start(context.project.id, context.agent.id);
    await waitFor(() => context.service.get(context.project.id, context.agent.id, run.id)?.status === 'done');

    assert.deepEqual(readPaths, ['attached/context.txt']);
    assert.equal(messages.filter((message) => message.role === 'system').length, 1);
    assert.deepEqual(messages, [
      {
        role: 'system',
        content:
          '# Skill: none-skill\n\nSkill context remains\n\nAttached Project files:\n\n' +
          JSON.stringify([{ path: 'attached/context.txt', content: 'Attached context remains' }]) +
          '\n\nCurrent date: 2026-08-30',
      },
      { role: 'user', content: 'Do the work' },
    ]);
    const systemContent = requireMessageContent(messages[0]);
    assert.equal(systemContent.includes('Inactive inline instructions'), false);
    assert.equal(systemContent.includes('missing/inactive.md'), false);
    assert.equal(systemContent.includes('No instructions'), false);
    assert.equal(systemContent.includes('Instructions:'), false);
    assert.equal(
      context.runs
        .listEvents(1, context.project.id, context.agent.id, run.id)
        ?.filter((event) => event.eventType === 'instructions_loaded').length,
      1,
    );
    context.db.close();
  });

  it('keeps an Agent task path unchanged and reads replacement content on the next run', async () => {
    const providerTasks: string[] = [];
    let taskContent = 'First task file content';
    const context = setup(
      async (_baseUrl, _timeout, _modelId, messages) => {
        providerTasks.push(requireMessageContent(messages[1]));
        return { type: 'message', content: 'Done' };
      },
      {
        agentData: {
          assignmentSource: 'file',
          assignment: 'Inline fallback must not run',
          assignmentFilePath: 'tasks/current.txt',
          projectFilesystemPermissions: {
            list: false,
            read: false,
            write: false,
            createDirectory: false,
            rename: false,
            delete: false,
          },
        },
        filesystem: {
          readFile: async (_projectId, path) => {
            assert.equal(path, 'tasks/current.txt');
            return { relativePath: String(path), content: taskContent, size: taskContent.length };
          },
        },
      },
    );
    const configuredPath = context.agent.data.assignmentFilePath;
    assert.equal(configuredPath, 'tasks/current.txt');
    const first = await context.service.start(context.project.id, context.agent.id);
    await waitFor(() => context.service.get(context.project.id, context.agent.id, first.id)?.status === 'done');
    taskContent = 'Updated task file content';
    const second = await context.service.start(context.project.id, context.agent.id);
    await waitFor(() => context.service.get(context.project.id, context.agent.id, second.id)?.status === 'done');

    assert.deepEqual(providerTasks, ['First task file content', 'Updated task file content']);
    assert.equal(context.agent.data.assignmentFilePath, configuredPath);
    assert.equal(first.task, 'First task file content');
    assert.equal(second.task, 'Updated task file content');
    for (const run of [first, second]) {
      const event = context.service.execution(context.project.id, context.agent.id, run.id)?.[0];
      assert.equal(event?.eventType, 'user_task');
      if (event?.eventType !== 'user_task') assert.fail('Expected user task');
      assert.equal(event.data.content, run.task);
      assert.equal(run.task.includes('tasks/current.txt'), false);
    }
    context.db.close();
  });

  it('fails oversized inline and file Assignments explicitly before inference', async () => {
    for (const assignmentSource of ['inline', 'file'] as const) {
      let requestCount = 0;
      const oversizedAssignment = 'x'.repeat(
        AGENT_RUNTIME_LIMITS_DEFAULTS.assignmentCharacters + 1,
      );
      const context = setup(
        async () => {
          requestCount += 1;
          return { type: 'message', content: 'Must not run' };
        },
        {
          agentData: assignmentSource === 'inline'
            ? { assignmentSource, assignment: oversizedAssignment }
            : {
                assignmentSource,
                assignment: 'Inline fallback',
                assignmentFilePath: 'tasks/large.md',
              },
          ...(assignmentSource === 'file'
            ? {
                filesystem: {
                  readFile: async () => ({
                    relativePath: 'tasks/large.md',
                    content: oversizedAssignment,
                    size: oversizedAssignment.length,
                  }),
                },
              }
            : {}),
        },
      );

      const failed = await context.service.start(context.project.id, context.agent.id);
      assert.equal(failed.status, 'error');
      assert.equal(failed.safeError?.code, 'ASSIGNMENT_TOO_LARGE');
      assert.equal(
        failed.safeError?.actualCharacters,
        AGENT_RUNTIME_LIMITS_DEFAULTS.assignmentCharacters + 1,
      );
      assert.equal(
        failed.safeError?.limitCharacters,
        AGENT_RUNTIME_LIMITS_DEFAULTS.assignmentCharacters,
      );
      assert.equal(requestCount, 0);
      assert.equal(failed.task, '');
      context.db.close();
    }
  });

  it('delivers an Assignment exactly at the runtime character limit completely', async () => {
    const exactAssignment = 'x'.repeat(AGENT_RUNTIME_LIMITS_DEFAULTS.assignmentCharacters);
    let deliveredTask = '';
    const context = setup(
      async (_baseUrl, _timeout, _modelId, messages) => {
        deliveredTask = requireMessageContent(messages[1]);
        return { type: 'message', content: 'Done' };
      },
      { agentData: { assignmentSource: 'inline', assignment: exactAssignment } },
    );
    const run = await context.service.start(context.project.id, context.agent.id);
    await waitFor(() => context.service.get(context.project.id, context.agent.id, run.id)?.status === 'done');
    assert.equal(deliveredTask, exactAssignment);
    assert.equal(deliveredTask.length, AGENT_RUNTIME_LIMITS_DEFAULTS.assignmentCharacters);
    context.db.close();
  });

  it('maps a Project filesystem Assignment size overflow separately from unavailable files', async () => {
    let requestCount = 0;
    const context = setup(
      async () => {
        requestCount += 1;
        return { type: 'message', content: 'Must not run' };
      },
      {
        agentData: {
          assignmentSource: 'file',
          assignment: 'Inline fallback',
          assignmentFilePath: 'tasks/too-large.md',
        },
        filesystem: {
          readFile: async () => {
            throw new ProjectFilesystemError(
              'PROJECT_FILE_TOO_LARGE',
              MAX_PROJECT_TEXT_FILE_BYTES,
            );
          },
        },
      },
    );

    const failed = await context.service.start(context.project.id, context.agent.id);
    assert.equal(failed.status, 'error');
    assert.equal(failed.safeError?.code, 'ASSIGNMENT_TOO_LARGE');
    assert.equal(failed.safeError?.inputFile, 'tasks/too-large.md');
    assert.equal(failed.safeError?.limitBytes, MAX_PROJECT_TEXT_FILE_BYTES);
    assert.equal(requestCount, 0);
    context.db.close();
  });

  it('fails missing and unsafe task files before inference without inline fallback', async () => {
    for (const assignmentFilePath of ['tasks/missing.md', '../unsafe.md', 'tasks/unsupported.json']) {
      let requestCount = 0;
      let readCount = 0;
      const context = setup(
        async () => {
          requestCount += 1;
          return { type: 'message', content: 'Must not run' };
        },
        {
          agentData: {
            assignmentSource: 'file',
            assignment: 'Inline fallback must not run',
            assignmentFilePath,
          },
          filesystem: {
            readFile: async () => {
              readCount += 1;
              throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND');
            },
          },
        },
      );
      const failed = await context.service.start(context.project.id, context.agent.id);
      assert.equal(failed.status, 'error');
      assert.deepEqual(failed.safeError, {
        stage: 'assignment_file_load',
        code: 'ASSIGNMENT_FILE_UNAVAILABLE',
        message: 'The configured task file could not be loaded.',
      });
      assert.equal(requestCount, 0);
      assert.equal(readCount, assignmentFilePath === 'tasks/missing.md' ? 1 : 0);
      assert.equal(failed.task, '');
      assert.equal(JSON.stringify(context.service.execution(context.project.id, context.agent.id, failed.id)).includes('Inline fallback'), false);
      context.db.close();
    }
  });

  it('fails a newly hidden persisted model before inference without fallback', async () => {
    let requestCount = 0;
    const context = setup(
      async () => {
        requestCount += 1;
        return { type: 'message', content: 'Must not run' };
      },
      { modelVisible: false, allowModelSelection: true },
    );
    await context.service.start(context.project.id, context.agent.id, { task: 'Blocked' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'error');
    assert.equal(requestCount, 0);
    assert.equal(context.service.latest(context.project.id, context.agent.id)?.safeError?.code, 'MODEL_NOT_ALLOWED');
    assert.equal(context.agent.data.modelId, 'configured-agent-model');
    assert.equal(context.agent.data.allowModelSelection, true);
    context.db.close();
  });

  it('stores sanitized instruction and provider failures and keeps successful runs out of errors', async () => {
    const missing = setup(async () => ({ type: 'message', content: 'Never' }), {
      fileInstructions: 'missing',
    });
    await missing.service.start(missing.project.id, missing.agent.id, { task: 'Missing file' });
    await waitFor(() => missing.service.latest(missing.project.id, missing.agent.id)?.status === 'error');
    assert.deepEqual(missing.service.latest(missing.project.id, missing.agent.id)?.safeError, {
      stage: 'instruction_file_load',
      code: 'INSTRUCTION_FILE_UNAVAILABLE',
      message: 'The configured instruction file could not be loaded.',
    });
    missing.db.close();

    const provider = setup(async () => {
      throw new ModelInferenceError('MODEL_SERVER_TIMEOUT', 'raw provider detail');
    });
    await provider.service.start(provider.project.id, provider.agent.id, { task: 'Timeout' });
    await waitFor(() => provider.service.latest(provider.project.id, provider.agent.id)?.status === 'error');
    const errors = provider.service.errors(provider.project.id, provider.agent.id);
    assert.equal(errors?.length, 1);
    assert.equal(errors?.[0]?.message, 'The model provider request timed out.');
    assert.ok(!JSON.stringify(errors).includes('raw provider detail'));
    provider.db.close();
  });

  it('fails oversized inline and filesystem-bounded instruction content before inference', async () => {
    const cases: Array<{
      agentData: Partial<AgentData>;
      filesystem?: Partial<TestFilesystem>;
      actual?: number;
      limitBytes?: number;
    }> = [
      {
        agentData: {
          instructionSource: 'inline',
          instructions: 'x'.repeat(
            AGENT_RUNTIME_LIMITS_DEFAULTS.inlineInstructionsCharacters + 1,
          ),
        },
        actual: AGENT_RUNTIME_LIMITS_DEFAULTS.inlineInstructionsCharacters + 1,
      },
      {
        agentData: {
          instructionSource: 'file',
          instructions: '',
          instructionFilePath: 'instructions/too-large.md',
        },
        filesystem: {
          readFile: async () => {
            throw new ProjectFilesystemError(
              'PROJECT_FILE_TOO_LARGE',
              MAX_PROJECT_TEXT_FILE_BYTES,
            );
          },
        },
        limitBytes: MAX_PROJECT_TEXT_FILE_BYTES,
      },
    ];
    for (const testCase of cases) {
      let requestCount = 0;
      const context = setup(
        async () => {
          requestCount += 1;
          return { type: 'message', content: 'Must not run' };
        },
        { agentData: testCase.agentData, filesystem: testCase.filesystem },
      );
      const run = await context.service.start(context.project.id, context.agent.id);
      await waitFor(() => context.service.get(context.project.id, context.agent.id, run.id)?.status === 'error');
      const failed = context.service.get(context.project.id, context.agent.id, run.id)!;
      assert.equal(failed.safeError?.code, 'INSTRUCTION_TOO_LARGE');
      assert.equal(failed.safeError?.actualCharacters, testCase.actual);
      assert.equal(
        failed.safeError?.limitCharacters,
        testCase.actual ? AGENT_RUNTIME_LIMITS_DEFAULTS.inlineInstructionsCharacters : undefined,
      );
      assert.equal(failed.safeError?.limitBytes, testCase.limitBytes);
      assert.equal(
        failed.safeError?.inputFile,
        testCase.limitBytes ? 'instructions/too-large.md' : undefined,
      );
      assert.equal(requestCount, 0);
      context.db.close();
    }
  });

  it('delivers inline instructions exactly at their character limit completely', async () => {
    const exactInstructions = 'x'.repeat(
      AGENT_RUNTIME_LIMITS_DEFAULTS.inlineInstructionsCharacters,
    );
    let deliveredInstructions = '';
    const context = setup(
      async (_baseUrl, _timeout, _modelId, messages) => {
        deliveredInstructions = requireMessageContent(messages[0]);
        return { type: 'message', content: 'Done' };
      },
      { agentData: { instructionSource: 'inline', instructions: exactInstructions } },
    );
    const run = await context.service.start(context.project.id, context.agent.id);
    await waitFor(() => context.service.get(context.project.id, context.agent.id, run.id)?.status === 'done');
    assert.equal(deliveredInstructions.startsWith(exactInstructions), true);
    assert.equal(deliveredInstructions.includes('[CONTENT TRUNCATED]'), false);
    context.db.close();
  });

  it('honors configured Assignment and inline Instructions boundaries', async () => {
    for (const kind of ['assignment', 'instructions'] as const) {
      for (const offset of [0, 1] as const) {
        const limit = 1_500;
        let requestCount = 0;
        const context = setup(
          async () => {
            requestCount += 1;
            return { type: 'message', content: 'Done' };
          },
          {
            agentData:
              kind === 'assignment'
                ? { assignment: 'x'.repeat(limit + offset) }
                : { instructionSource: 'inline', instructions: 'x'.repeat(limit + offset) },
            runtimeLimits: {
              getAgentRuntimeLimits: async () => ({
                ...AGENT_RUNTIME_LIMITS_DEFAULTS,
                assignmentCharacters: limit,
                inlineInstructionsCharacters: limit,
              }),
            },
          },
        );
        const run = await context.service.start(context.project.id, context.agent.id);
        if (offset === 0) {
          await waitFor(
            () => context.service.get(context.project.id, context.agent.id, run.id)?.status === 'done',
          );
          assert.equal(requestCount, 1);
        } else {
          await waitFor(
            () => context.service.get(context.project.id, context.agent.id, run.id)?.status === 'error',
          );
          const failed = context.service.get(context.project.id, context.agent.id, run.id)!;
          assert.equal(
            failed.safeError?.code,
            kind === 'assignment' ? 'ASSIGNMENT_TOO_LARGE' : 'INSTRUCTION_TOO_LARGE',
          );
          assert.equal(failed.safeError?.actualCharacters, limit + 1);
          assert.equal(failed.safeError?.limitCharacters, limit);
          assert.equal(requestCount, 0);
        }
        context.db.close();
      }
    }
  });

  it('keeps a runtime-limit snapshot for a run and applies updates to the next run', async () => {
    let currentLimits: AgentRuntimeLimits = {
      ...AGENT_RUNTIME_LIMITS_DEFAULTS,
      inlineInstructionsCharacters: 2_000,
    };
    let requestCount = 0;
    const context = setup(
      async () => {
        requestCount += 1;
        return { type: 'message', content: 'Done' };
      },
      {
        agentData: { instructionSource: 'inline', instructions: 'x'.repeat(1_500) },
        runtimeLimits: { getAgentRuntimeLimits: async () => ({ ...currentLimits }) },
      },
    );

    const first = await context.service.start(context.project.id, context.agent.id);
    currentLimits = { ...currentLimits, inlineInstructionsCharacters: 1_000 };
    await waitFor(
      () => context.service.get(context.project.id, context.agent.id, first.id)?.status === 'done',
    );
    const second = await context.service.start(context.project.id, context.agent.id);
    await waitFor(
      () => context.service.get(context.project.id, context.agent.id, second.id)?.status === 'error',
    );

    assert.equal(requestCount, 1);
    assert.equal(
      context.service.get(context.project.id, context.agent.id, second.id)?.safeError
        ?.limitCharacters,
      1_000,
    );
    context.db.close();
  });

  it('clears terminal history, rejects active or inaccessible Agents, and maps delete failures', async () => {
    const context = setup(async () => ({ type: 'message', content: 'Unused' }));
    const terminal = context.runs.create(1, context.project.id, context.agent.id, 'Terminal');
    assert.ok(terminal);
    assert.equal(context.runs.complete(terminal.id, 'Done'), true);
    assert.equal(context.service.clear(context.project.id, context.agent.id), 1);
    assert.equal(context.service.get(context.project.id, context.agent.id, terminal.id), null);
    assert.equal(context.runs.listEvents(1, context.project.id, context.agent.id, terminal.id), null);
    assert.equal(context.service.clear(context.project.id, context.agent.id), 0);

    const active = context.runs.create(1, context.project.id, context.agent.id, 'Active');
    assert.ok(active);
    assert.throws(
      () => context.service.clear(context.project.id, context.agent.id),
      (error: unknown) => error instanceof AgentRunError && error.code === 'ACTIVE_RUN_EXISTS',
    );
    assert.equal(context.runs.requestPause(active.id), true);
    assert.equal(context.runs.pauseAtCheckpoint(active.id), 'paused');
    assert.throws(
      () => context.service.clear(context.project.id, context.agent.id),
      (error: unknown) => error instanceof AgentRunError && error.code === 'ACTIVE_RUN_EXISTS',
    );
    assert.equal(context.runs.cancel(active.id), true);
    context.db.exec(`
      CREATE TRIGGER fail_run_clear
      BEFORE DELETE ON agent_runs
      BEGIN
        SELECT RAISE(ABORT, 'forced clear failure');
      END
    `);
    assert.throws(
      () => context.service.clear(context.project.id, context.agent.id),
      (error: unknown) => error instanceof AgentRunError && error.code === 'PERSISTENCE_FAILED',
    );
    assert.ok(context.service.get(context.project.id, context.agent.id, active.id));
    context.db.exec('DROP TRIGGER fail_run_clear');
    assert.equal(context.service.clear(context.project.id, context.agent.id), 1);
    assert.throws(
      () => context.service.clear(context.project.id, context.agent.id + 10_000),
      (error: unknown) => error instanceof AgentRunError && error.code === 'AGENT_NOT_FOUND',
    );
    context.db.close();

    const forbidden = setup(async () => ({ type: 'message', content: 'Unused' }), { userId: 2 });
    const ownedRun = forbidden.runs.create(1, forbidden.project.id, forbidden.agent.id, 'Owned');
    assert.ok(ownedRun);
    assert.equal(forbidden.runs.complete(ownedRun.id, 'Done'), true);
    assert.throws(
      () => forbidden.service.clear(forbidden.project.id, forbidden.agent.id),
      (error: unknown) => error instanceof AgentRunError && error.code === 'AGENT_NOT_FOUND',
    );
    assert.ok(forbidden.runs.getById(1, forbidden.project.id, forbidden.agent.id, ownedRun.id));
    forbidden.db.close();
  });

  it('latestTotalTokens starts unset and is populated from first inference round', async () => {
    const context = setup(async () => ({ type: 'message', content: 'Done', usage: { totalTokens: 2347 } }));
    await context.service.start(context.project.id, context.agent.id, { task: 'Token test' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    const run = context.service.latest(context.project.id, context.agent.id);
    assert.equal(run?.latestTotalTokens, 2347);
    context.db.close();
  });

  it('second inference round replaces first totalTokens value rather than accumulating', async () => {
    let callCount = 0;
    const tool = createTestTool('t', async () => ({ ok: true }));
    const context = setup(async (): Promise<ModelInferenceResult> => {
      if (callCount === 0) {
        callCount += 1;
        const calls = [{ id: 'c1', type: 'function' as const, function: { name: 't', arguments: '{}' } }];
        return { type: 'tool_calls', calls, assistantMessage: { role: 'assistant', content: '', tool_calls: calls }, usage: { totalTokens: 2347 } };
      }
      return { type: 'message', content: 'Done', usage: { totalTokens: 5800 } };
    }, { tools: [tool] });
    await context.service.start(context.project.id, context.agent.id, { task: 'Multi round' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    const run = context.service.latest(context.project.id, context.agent.id);
    assert.equal(run?.latestTotalTokens, 5800);
    context.db.close();
  });

  it('inference without usage does not reset previously known totalTokens', async () => {
    let callCount = 0;
    const tool = createTestTool('t', async () => ({ ok: true }));
    const context = setup(async (): Promise<ModelInferenceResult> => {
      if (callCount === 0) {
        callCount += 1;
        const calls = [{ id: 'c1', type: 'function' as const, function: { name: 't', arguments: '{}' } }];
        return { type: 'tool_calls', calls, assistantMessage: { role: 'assistant', content: '', tool_calls: calls }, usage: { totalTokens: 3000 } };
      }
      return { type: 'message', content: 'Done' };
    }, { tools: [tool] });
    await context.service.start(context.project.id, context.agent.id, { task: 'Partial usage' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    const run = context.service.latest(context.project.id, context.agent.id);
    assert.equal(run?.latestTotalTokens, 3000);
    context.db.close();
  });

  it('new agent run does not inherit totalTokens from older run', async () => {
    const context = setup(async () => ({ type: 'message', content: 'Done', usage: { totalTokens: 9999 } }));
    await context.service.start(context.project.id, context.agent.id, { task: 'First' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    assert.equal(context.service.latest(context.project.id, context.agent.id)?.latestTotalTokens, 9999);

    const secondContext = setup(async () => ({ type: 'message', content: 'Second' }));
    await secondContext.service.start(secondContext.project.id, secondContext.agent.id, { task: 'Second' });
    await waitFor(() => secondContext.service.latest(secondContext.project.id, secondContext.agent.id)?.status === 'done');
    assert.equal(secondContext.service.latest(secondContext.project.id, secondContext.agent.id)?.latestTotalTokens, null);
    context.db.close();
    secondContext.db.close();
  });

  it('legacy run data without latestTotalTokens still loads correctly', async () => {
    const context = setup(async () => ({ type: 'message', content: 'Done' }));
    const created = context.runs.create(1, context.project.id, context.agent.id, 'Legacy');
    assert.ok(created);
    assert.equal(created.data.latestTotalTokens, null);
    context.db.close();
  });

  it('multi-round tool execution continues to work with usage present', async () => {
    let callCount = 0;
    const tool = createTestTool('t', async () => ({ ok: true }));
    const context = setup(async (): Promise<ModelInferenceResult> => {
      if (callCount < 2) {
        callCount += 1;
        const calls = [{ id: `c${callCount}`, type: 'function' as const, function: { name: 't', arguments: '{}' } }];
        return { type: 'tool_calls', calls, assistantMessage: { role: 'assistant', content: '', tool_calls: calls }, usage: { totalTokens: 1000 + callCount * 500 } };
      }
      return { type: 'message', content: 'Final', usage: { totalTokens: 2500 } };
    }, { tools: [tool] });
    await context.service.start(context.project.id, context.agent.id, { task: 'Multi tool' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
    const run = context.service.latest(context.project.id, context.agent.id);
    assert.equal(run?.latestTotalTokens, 2500);
    context.db.close();
  });
});

// TASK-0128: Streaming inference cancellation tests
await describe('AgentRunService streaming cancellation', () => {
  it('normal streamed inference completes successfully with accumulated content', async () => {
    const context = setup(async (): Promise<ModelInferenceResult> => ({
      type: 'message',
      content: 'Streamed result complete',
      assistantMessage: {
        role: 'assistant',
        content: 'Streamed result complete',
        reasoning_content: 'full reasoning chain',
      },
    }));
    const started = await context.service.start(context.project.id, context.agent.id, { task: 'Stream test' });
    await waitFor(() => context.service.get(context.project.id, context.agent.id, started.id)?.status === 'done');
    assert.equal(context.service.latest(context.project.id, context.agent.id)?.finalResult, 'Streamed result complete');
    const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
    assert.ok(execution.find((e) => e.eventType === 'reasoning'));
    assert.ok(execution.find((e) => e.eventType === 'final_result'));
    context.db.close();
  });

  it('partial reasoning is preserved when Cancel occurs during inference', async () => {
    let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
    const context = setup(
      (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
    );
    const started = await context.service.start(context.project.id, context.agent.id, { task: 'Cancel with reasoning' });
    await waitFor(() => resolveRequest !== undefined);
    // Simulate cancelled inference with partial reasoning
    context.service.cancel(context.project.id, context.agent.id, started.id);
    resolveRequest?.({
      type: 'cancelled',
      reasoningContent: 'partial reasoning received before cancel',
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(context.service.get(context.project.id, context.agent.id, started.id)?.status, 'cancelled');
    const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
    const cancelledEvent = execution.find((e) => e.eventType === 'inference_cancelled');
    assert.ok(cancelledEvent);
    if (cancelledEvent.eventType === 'inference_cancelled') {
      assert.equal(cancelledEvent.data.reasoning, 'partial reasoning received before cancel');
    }
    context.db.close();
  });

  it('partial assistant content is preserved when Cancel occurs', async () => {
    let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
    const context = setup(
      (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
    );
    const started = await context.service.start(context.project.id, context.agent.id, { task: 'Cancel with content' });
    await waitFor(() => resolveRequest !== undefined);
    context.service.cancel(context.project.id, context.agent.id, started.id);
    resolveRequest?.({
      type: 'cancelled',
      reasoningContent: 'some thinking',
      content: 'partial assistant content here',
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(context.service.get(context.project.id, context.agent.id, started.id)?.status, 'cancelled');
    const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
    const cancelledEvent = execution.find((e) => e.eventType === 'inference_cancelled');
    assert.ok(cancelledEvent);
    if (cancelledEvent.eventType === 'inference_cancelled') {
      assert.equal(cancelledEvent.data.content, 'partial assistant content here');
      assert.equal(cancelledEvent.data.reasoning, 'some thinking');
    }
    context.db.close();
  });

  it('cancel aborts provider request promptly and terminates execution', async () => {
    let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
    const context = setup(
      (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
    );
    const started = await context.service.start(context.project.id, context.agent.id, { task: 'Abort test' });
    await waitFor(() => resolveRequest !== undefined);
    context.service.cancel(context.project.id, context.agent.id, started.id);
    // Resolve with any result - it should be ignored because cancel already happened
    resolveRequest?.({ type: 'message', content: 'Late result that should not matter' });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(context.service.get(context.project.id, context.agent.id, started.id)?.status, 'cancelled');
    // Verify no final_result execution event was written
    const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
    assert.equal(execution.some((e) => e.eventType === 'final_result'), false);
    context.db.close();
  });

  it('no tool call executes after cancellation', async () => {
    let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
    let toolExecuted = false;
    const tool = createTestTool('test_tool', async () => {
      toolExecuted = true;
      return { executed: true };
    });
    const context = setup(
      (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
      { toolNames: ['test_tool'], tools: [tool] },
    );
    const started = await context.service.start(context.project.id, context.agent.id, { task: 'No exec after cancel' });
    await waitFor(() => resolveRequest !== undefined);
    context.service.cancel(context.project.id, context.agent.id, started.id);
    // Simulate cancelled inference with tool calls in partial data - they should NOT execute
    resolveRequest?.({
      type: 'cancelled',
      content: 'partial',
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(toolExecuted, false);
    assert.equal(context.service.get(context.project.id, context.agent.id, started.id)?.status, 'cancelled');
    const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
    assert.equal(execution.some((e) => e.eventType === 'tool_call'), false);
    context.db.close();
  });

  it('incomplete streamed tool call is discarded safely on cancellation', async () => {
    let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
    const context = setup(
      (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
    );
    const started = await context.service.start(context.project.id, context.agent.id, { task: 'Incomplete tool call' });
    await waitFor(() => resolveRequest !== undefined);
    context.service.cancel(context.project.id, context.agent.id, started.id);
    // Simulate cancelled inference - partial data should not include executable tool calls
    resolveRequest?.({
      type: 'cancelled',
      content: 'partial with incomplete args',
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(context.service.get(context.project.id, context.agent.id, started.id)?.status, 'cancelled');
    const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
    // No tool_call events should exist for cancelled inference
    assert.equal(execution.some((e) => e.eventType === 'tool_call'), false);
    context.db.close();
  });

  it('no final result is saved after cancellation', async () => {
    let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
    const context = setup(
      (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
    );
    const started = await context.service.start(context.project.id, context.agent.id, { task: 'No result on cancel' });
    await waitFor(() => resolveRequest !== undefined);
    context.service.cancel(context.project.id, context.agent.id, started.id);
    resolveRequest?.({ type: 'cancelled', content: 'partial data' });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(context.service.get(context.project.id, context.agent.id, started.id)?.finalResult, null);
    const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
    assert.equal(execution.some((e) => e.eventType === 'final_result'), false);
    context.db.close();
  });

  it('no result file is written after cancellation', async () => {
    let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
    let writeCount = 0;
    const context = setup(
      (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
      {
        agentData: { saveResultToFile: true, resultFilename: 'result.md' },
        filesystem: {
          writeFile: async () => {
            writeCount += 1;
            return { relativePath: 'result.md', size: 0 };
          },
        },
      },
    );
    const started = await context.service.start(context.project.id, context.agent.id, { task: 'No file on cancel' });
    await waitFor(() => resolveRequest !== undefined);
    context.service.cancel(context.project.id, context.agent.id, started.id);
    resolveRequest?.({ type: 'cancelled', content: 'partial' });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(writeCount, 0);
    const operationalEvents = context.runs.listEvents(1, context.project.id, context.agent.id, started.id)!;
    assert.equal(operationalEvents.some((e) => e.eventType === 'result_file_written'), false);
    context.db.close();
  });

  it('no next Agent is triggered after cancellation', async () => {
    let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
    const context = setup(
      (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
    );
    const nextAgent = context.agents.create(context.project.id, { ...baseAgentData, name: 'Next' });
    context.agents.update(1, context.project.id, context.agent.id, {
      ...context.agent.data,
      triggerNextAgent: true,
    }, nextAgent.id);
    const started = await context.service.start(context.project.id, context.agent.id, { task: 'No chain on cancel' });
    await waitFor(() => resolveRequest !== undefined);
    context.service.cancel(context.project.id, context.agent.id, started.id);
    resolveRequest?.({ type: 'cancelled', content: 'partial' });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(context.service.latest(context.project.id, nextAgent.id), null);
    const operationalEvents = context.runs.listEvents(1, context.project.id, context.agent.id, started.id)!;
    assert.equal(operationalEvents.some((e) => e.eventType === 'next_agent_trigger_started'), false);
    context.db.close();
  });

  it('cancelled run remains cancelled not failed', async () => {
    let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
    const context = setup(
      (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
    );
    const started = await context.service.start(context.project.id, context.agent.id, { task: 'Stay cancelled' });
    await waitFor(() => resolveRequest !== undefined);
    context.service.cancel(context.project.id, context.agent.id, started.id);
    resolveRequest?.({ type: 'cancelled', reasoningContent: 'partial' });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(context.service.get(context.project.id, context.agent.id, started.id)?.status, 'cancelled');
    // Verify it is not in error log
    const errors = context.service.errors(context.project.id, context.agent.id);
    assert.equal(errors?.length ?? 0, 0);
    context.db.close();
  });

  it('cancel before first chunk produces clean cancelled execution', async () => {
    let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
    const context = setup(
      (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
    );
    const started = await context.service.start(context.project.id, context.agent.id, { task: 'Early cancel' });
    await waitFor(() => resolveRequest !== undefined);
    context.service.cancel(context.project.id, context.agent.id, started.id);
    // Cancel with no partial data at all
    resolveRequest?.({ type: 'cancelled' });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(context.service.get(context.project.id, context.agent.id, started.id)?.status, 'cancelled');
    const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
    const cancelledEvent = execution.find((e) => e.eventType === 'inference_cancelled');
    assert.ok(cancelledEvent);
    // Clean cancellation - no partial data
    if (cancelledEvent.eventType === 'inference_cancelled') {
      assert.equal(cancelledEvent.data.reasoning, undefined);
      assert.equal(cancelledEvent.data.content, undefined);
    }
    context.db.close();
  });

  it('normal multi-round inference remains working with streaming', async () => {
    let round = 0;
    const tool = createTestTool('multi_tool', async () => ({ step: true }));
    const context = setup(async (): Promise<ModelInferenceResult> => {
      round += 1;
      if (round === 1) {
        const calls = [{ id: 'm1', type: 'function' as const, function: { name: 'multi_tool', arguments: '{}' } }];
        return {
          type: 'tool_calls',
          calls,
          assistantMessage: { role: 'assistant', content: null, tool_calls: calls },
        };
      }
      if (round === 2) {
        const calls = [{ id: 'm2', type: 'function' as const, function: { name: 'multi_tool', arguments: '{}' } }];
        return {
          type: 'tool_calls',
          calls,
          assistantMessage: { role: 'assistant', content: null, tool_calls: calls },
        };
      }
      return { type: 'message', content: 'Multi-round done' };
    }, { toolNames: ['multi_tool'], tools: [tool] });
    const started = await context.service.start(context.project.id, context.agent.id, { task: 'Multi round streaming' });
    await waitFor(() => context.service.get(context.project.id, context.agent.id, started.id)?.status === 'done');

    assert.equal(round, 3);
    assert.equal(context.service.latest(context.project.id, context.agent.id)?.finalResult, 'Multi-round done');
    const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
    assert.equal(execution.filter((e) => e.eventType === 'tool_call').length, 2);
    context.db.close();
  });

  it('usage and finishReason captured when available on cancelled inference', async () => {
    let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
    const context = setup(
      (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
    );
    const started = await context.service.start(context.project.id, context.agent.id, { task: 'Usage on cancel' });
    await waitFor(() => resolveRequest !== undefined);
    context.service.cancel(context.project.id, context.agent.id, started.id);
    resolveRequest?.({
      type: 'cancelled',
      reasoningContent: 'partial reasoning',
      content: 'partial content',
      finishReason: 'length',
      usage: { totalTokens: 1500 },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(context.service.get(context.project.id, context.agent.id, started.id)?.status, 'cancelled');
    const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
    const cancelledEvent = execution.find((e) => e.eventType === 'inference_cancelled');
    assert.ok(cancelledEvent);
    if (cancelledEvent.eventType === 'inference_cancelled') {
      assert.equal(cancelledEvent.data.finishReason, 'length');
      assert.equal(cancelledEvent.data.totalTokens, 1500);
    }
    context.db.close();
  });

  it('no usage requirement when provider does not send it on cancelled inference', async () => {
    let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
    const context = setup(
      (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
    );
    const started = await context.service.start(context.project.id, context.agent.id, { task: 'No usage cancel' });
    await waitFor(() => resolveRequest !== undefined);
    context.service.cancel(context.project.id, context.agent.id, started.id);
    // No usage field at all - should still work fine
    resolveRequest?.({
      type: 'cancelled',
      reasoningContent: 'partial without usage',
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(context.service.get(context.project.id, context.agent.id, started.id)?.status, 'cancelled');
    const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
    const cancelledEvent = execution.find((e) => e.eventType === 'inference_cancelled');
    assert.ok(cancelledEvent);
    if (cancelledEvent.eventType === 'inference_cancelled') {
      assert.equal(cancelledEvent.data.reasoning, 'partial without usage');
      // totalTokens should be absent when not provided
      assert.equal(cancelledEvent.data.totalTokens, undefined);
    }
    context.db.close();
  });

  describe('TASK-0133 cancelled inference preserves partial execution transcript', () => {
    it('cancelled inference with partial reasoning writes a reasoning event', async () => {
      let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
      const context = setup(
        (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
      );
      const started = await context.service.start(context.project.id, context.agent.id, { task: 'Cancel with reasoning' });
      await waitFor(() => resolveRequest !== undefined);
      context.service.cancel(context.project.id, context.agent.id, started.id);
      resolveRequest?.({ type: 'cancelled', reasoningContent: 'partial reasoning text' });
      await new Promise<void>((resolve) => setImmediate(resolve));

      const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
      assert.equal(execution.find((e) => e.eventType === 'reasoning')?.data.content, 'partial reasoning text');
      assert.ok(execution.find((e) => e.eventType === 'inference_cancelled'));
    });

    it('cancelled inference with partial assistant content writes an assistant_message event', async () => {
      let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
      const context = setup(
        (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
      );
      const started = await context.service.start(context.project.id, context.agent.id, { task: 'Cancel with content' });
      await waitFor(() => resolveRequest !== undefined);
      context.service.cancel(context.project.id, context.agent.id, started.id);
      resolveRequest?.({ type: 'cancelled', content: 'partial assistant text' });
      await new Promise<void>((resolve) => setImmediate(resolve));

      const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
      assert.equal(execution.find((e) => e.eventType === 'assistant_message')?.data.content, 'partial assistant text');
    });

    it('when both reasoning and content exist ordering is reasoning then assistant_message then inference_cancelled', async () => {
      let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
      const context = setup(
        (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
      );
      const started = await context.service.start(context.project.id, context.agent.id, { task: 'Both partial' });
      await waitFor(() => resolveRequest !== undefined);
      context.service.cancel(context.project.id, context.agent.id, started.id);
      resolveRequest?.({ type: 'cancelled', reasoningContent: 'partial reasoning', content: 'partial content' });
      await new Promise<void>((resolve) => setImmediate(resolve));

      const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
      assert.deepEqual(
        execution.map((e) => e.eventType),
        ['user_task', 'reasoning', 'assistant_message', 'inference_cancelled'],
      );
    });

    it('whitespace-only reasoning does not create a reasoning event', async () => {
      let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
      const context = setup(
        (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
      );
      const started = await context.service.start(context.project.id, context.agent.id, { task: 'Whitespace reasoning' });
      await waitFor(() => resolveRequest !== undefined);
      context.service.cancel(context.project.id, context.agent.id, started.id);
      resolveRequest?.({ type: 'cancelled', reasoningContent: '   ' });
      await new Promise<void>((resolve) => setImmediate(resolve));

      const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
      assert.equal(execution.some((e) => e.eventType === 'reasoning'), false);
    });

    it('whitespace-only content does not create an assistant_message event', async () => {
      let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
      const context = setup(
        (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
      );
      const started = await context.service.start(context.project.id, context.agent.id, { task: 'Whitespace content' });
      await waitFor(() => resolveRequest !== undefined);
      context.service.cancel(context.project.id, context.agent.id, started.id);
      resolveRequest?.({ type: 'cancelled', content: '\t\n  ' });
      await new Promise<void>((resolve) => setImmediate(resolve));

      const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
      assert.equal(execution.some((e) => e.eventType === 'assistant_message'), false);
    });

    it('cancelled partial content never creates final_result', async () => {
      let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
      const context = setup(
        (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
      );
      const started = await context.service.start(context.project.id, context.agent.id, { task: 'No final result' });
      await waitFor(() => resolveRequest !== undefined);
      context.service.cancel(context.project.id, context.agent.id, started.id);
      resolveRequest?.({ type: 'cancelled', content: 'partial data' });
      await new Promise<void>((resolve) => setImmediate(resolve));

      const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
      assert.equal(execution.some((e) => e.eventType === 'final_result'), false);
    });

    it('cancelled partial content never becomes run.finalResult', async () => {
      let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
      const context = setup(
        (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
      );
      const started = await context.service.start(context.project.id, context.agent.id, { task: 'No run result' });
      await waitFor(() => resolveRequest !== undefined);
      context.service.cancel(context.project.id, context.agent.id, started.id);
      resolveRequest?.({ type: 'cancelled', content: 'partial data' });
      await new Promise<void>((resolve) => setImmediate(resolve));

      assert.equal(context.service.get(context.project.id, context.agent.id, started.id)?.finalResult, null);
    });

    it('cancelled inference does not execute tools', async () => {
      let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
      let toolExecuted = false;
      const tool = createTestTool('cancel_tool', async () => {
        toolExecuted = true;
        return { executed: true };
      });
      const context = setup(
        (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
        { toolNames: ['cancel_tool'], tools: [tool] },
      );
      const started = await context.service.start(context.project.id, context.agent.id, { task: 'No tool exec' });
      await waitFor(() => resolveRequest !== undefined);
      context.service.cancel(context.project.id, context.agent.id, started.id);
      resolveRequest?.({ type: 'cancelled', content: 'partial' });
      await new Promise<void>((resolve) => setImmediate(resolve));

      assert.equal(toolExecuted, false);
      const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
      assert.equal(execution.some((e) => e.eventType === 'tool_call'), false);
    });

    it('cancelled inference does not trigger next Agent', async () => {
      let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
      const context = setup(
        (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
      );
      const nextAgent = context.agents.create(context.project.id, { ...baseAgentData, name: 'Next' });
      context.agents.update(1, context.project.id, context.agent.id, {
        ...context.agent.data,
        triggerNextAgent: true,
      }, nextAgent.id);
      const started = await context.service.start(context.project.id, context.agent.id, { task: 'No chain' });
      await waitFor(() => resolveRequest !== undefined);
      context.service.cancel(context.project.id, context.agent.id, started.id);
      resolveRequest?.({ type: 'cancelled', content: 'partial' });
      await new Promise<void>((resolve) => setImmediate(resolve));

      assert.equal(context.service.latest(context.project.id, nextAgent.id), null);
    });

    it('existing finishReason and token usage remain on inference_cancelled', async () => {
      let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
      const context = setup(
        (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
      );
      const started = await context.service.start(context.project.id, context.agent.id, { task: 'Metadata cancel' });
      await waitFor(() => resolveRequest !== undefined);
      context.service.cancel(context.project.id, context.agent.id, started.id);
      resolveRequest?.({
        type: 'cancelled',
        reasoningContent: 'partial reasoning',
        content: 'partial content',
        finishReason: 'length',
        usage: { totalTokens: 1500 },
      });
      await new Promise<void>((resolve) => setImmediate(resolve));

      const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
      const cancelledEvent = execution.find((e) => e.eventType === 'inference_cancelled');
      assert.ok(cancelledEvent);
      if (cancelledEvent.eventType === 'inference_cancelled') {
        assert.equal(cancelledEvent.data.finishReason, 'length');
        assert.equal(cancelledEvent.data.totalTokens, 1500);
      }
    });

    it('clean cancellation with no partial output creates no reasoning or assistant_message events', async () => {
      let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
      const context = setup(
        (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
      );
      const started = await context.service.start(context.project.id, context.agent.id, { task: 'Clean cancel' });
      await waitFor(() => resolveRequest !== undefined);
      context.service.cancel(context.project.id, context.agent.id, started.id);
      resolveRequest?.({ type: 'cancelled' });
      await new Promise<void>((resolve) => setImmediate(resolve));

      const execution = context.service.execution(context.project.id, context.agent.id, started.id)!;
      assert.equal(execution.some((e) => e.eventType === 'reasoning'), false);
      assert.equal(execution.some((e) => e.eventType === 'assistant_message'), false);
    });

    it('run remains terminally cancelled after partial output preservation', async () => {
      let resolveRequest: ((value: ModelInferenceResult | StreamedModelInferencePartialResult) => void) | undefined;
      const context = setup(
        (): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> => new Promise((resolve) => (resolveRequest = resolve)),
      );
      const started = await context.service.start(context.project.id, context.agent.id, { task: 'Terminal cancel' });
      await waitFor(() => resolveRequest !== undefined);
      context.service.cancel(context.project.id, context.agent.id, started.id);
      resolveRequest?.({ type: 'cancelled', reasoningContent: 'partial', content: 'partial' });
      await new Promise<void>((resolve) => setImmediate(resolve));

      assert.equal(context.service.get(context.project.id, context.agent.id, started.id)?.status, 'cancelled');
      assert.equal(context.runs.complete(started.id, 'Stale result'), false);
    });
  });

  describe('current date system message', () => {
    it('injects exactly one current-date system message with no Skills or attachments', async () => {
      const captured: Array<Parameters<TestInferenceRequester>> = [];
      const context = setup(async (...parameters) => {
        captured.push(parameters);
        return { type: 'message', content: 'Done' };
      }, { testNow: () => new Date(2026, 7, 30) });
      await context.service.start(context.project.id, context.agent.id, { task: 'Date test' });
      await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
      const messages = captured[0]?.[3] as ModelInferenceMessage[];
      assert.equal(messages.length, 2);
      assert.deepEqual(messages[0], { role: 'system', content: 'Inline instructions\n\nCurrent date: 2026-08-30' });
      assert.deepEqual(messages[1], { role: 'user', content: 'Do the work' });
      context.db.close();
    });

    it('uses local calendar getters not UTC semantics', async () => {
      const capturedDate = new Date(2026, 7, 30);
      let usedGetters = false;
      const fakeNow = (): Date => {
        usedGetters = true;
        return capturedDate;
      };
      const context = setup(async () => ({ type: 'message', content: 'Done' }), { testNow: fakeNow });
      await context.service.start(context.project.id, context.agent.id, { task: 'Local date' });
      await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
      assert.equal(usedGetters, true);
      context.db.close();
    });

    it('keeps Agent instructions as first system message', async () => {
      const captured: Array<Parameters<TestInferenceRequester>> = [];
      const context = setup(async (...parameters) => {
        captured.push(parameters);
        return { type: 'message', content: 'Done' };
      }, { testNow: () => new Date(2026, 8, 15) });
      await context.service.start(context.project.id, context.agent.id, { task: 'Ordering' });
      await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
      const messages = captured[0]?.[3] as ModelInferenceMessage[];
      assert.equal(messages[0].role, 'system');
      assert.ok(requireMessageContent(messages[0]).startsWith('Inline instructions'));
      context.db.close();
    });

    it('places Skill context before date message', async () => {
      const captured: Array<Parameters<TestInferenceRequester>> = [];
      const tool = createTestTool('skill_tool', async () => ({ ok: true }));
      const context = setup(async (...parameters) => {
        captured.push(parameters);
        return { type: 'message', content: 'Done' };
      }, {
        testNow: () => new Date(2026, 7, 30),
        skills: [{ commandName: 'test-skill', markdown: 'Skill context here' }],
        toolNames: ['skill_tool'],
        tools: [tool],
      });
      await context.service.start(context.project.id, context.agent.id, { task: 'With skill' });
      await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
      const messages = captured[0]?.[3] as ModelInferenceMessage[];
      const systemContent = requireMessageContent(messages[0]);
      const datePos = systemContent.indexOf('Current date:');
      const skillPos = systemContent.indexOf('# Skill: test-skill');
      assert.ok(skillPos >= 0, 'Skill context must be present');
      assert.ok(datePos > skillPos, 'Date must come after skill context in merged message');
      context.db.close();
    });

    it('places Attached Project files context before date message', async () => {
      const captured: Array<Parameters<TestInferenceRequester>> = [];
      const context = setup(
        async (...parameters) => {
          captured.push(parameters);
          return { type: 'message', content: 'Done' };
        },
        {
          testNow: () => new Date(2026, 7, 30),
          agentData: { attachedProjectFiles: ['docs/spec.md'] },
          filesystem: {
            readFile: async (_projectId, path) => {
              if (path === 'docs/spec.md') {
                return { relativePath: 'docs/spec.md', content: 'Spec\n', size: 5 };
              }
              throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND');
            },
          },
        },
      );
      await context.service.start(context.project.id, context.agent.id, { task: 'With files' });
      await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
      const messages = captured[0]?.[3] as ModelInferenceMessage[];
      const systemContent = requireMessageContent(messages[0]);
      const datePos = systemContent.indexOf('Current date:');
      const filesPos = systemContent.indexOf('Attached Project files:');
      assert.ok(filesPos >= 0, 'Attached files context must be present');
      assert.ok(datePos > filesPos, 'Date must come after attached files context in merged message');
      context.db.close();
    });

    it('places date as final system message before user task', async () => {
      const captured: Array<Parameters<TestInferenceRequester>> = [];
      const context = setup(async (...parameters) => {
        captured.push(parameters);
        return { type: 'message', content: 'Done' };
      }, { testNow: () => new Date(2026, 7, 30) });
      await context.service.start(context.project.id, context.agent.id, { task: 'Final system' });
      await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
      const messages = captured[0]?.[3] as ModelInferenceMessage[];
      assert.equal(messages.length, 2);
      assert.ok(requireMessageContent(messages[0]).endsWith('Current date: 2026-08-30'));
      assert.equal(messages[1].role, 'user');
      context.db.close();
    });

    it('retains exact same captured date across multiple tool rounds', async () => {
      const roundMessages: Array<ModelInferenceMessage[]> = [];
      let round = 0;
      const context = setup(async (_baseUrl, _timeout, _modelId, messages) => {
        roundMessages.push([...messages]);
        round += 1;
        if (round === 1) {
          const calls = [{ id: 't1', type: 'function' as const, function: { name: 'multi_tool', arguments: '{}' } }];
          return { type: 'tool_calls', calls, assistantMessage: { role: 'assistant', content: null, tool_calls: calls } };
        }
        if (round === 2) {
          const calls = [{ id: 't2', type: 'function' as const, function: { name: 'multi_tool', arguments: '{}' } }];
          return { type: 'tool_calls', calls, assistantMessage: { role: 'assistant', content: null, tool_calls: calls } };
        }
        return { type: 'message', content: 'Final' };
      }, {
        testNow: () => new Date(2026, 7, 30),
        toolNames: ['multi_tool'],
        tools: [createTestTool('multi_tool', async () => ({ round }))],
      });
      await context.service.start(context.project.id, context.agent.id, { task: 'Multi-round' });
      await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
      for (const msgs of roundMessages) {
        const systemContent = requireMessageContent(msgs[0]);
        assert.ok(systemContent.endsWith('Current date: 2026-08-30'));
      }
      context.db.close();
    });

    it('does not change date when simulated clock shifts mid-run', async () => {
      let callCount = 0;
      const shiftingNow = (): Date => {
        callCount += 1;
        if (callCount === 1) return new Date(2026, 7, 30);
        return new Date(2026, 8, 1);
      };
      const roundMessages: Array<ModelInferenceMessage[]> = [];
      let round = 0;
      const context = setup(async (_baseUrl, _timeout, _modelId, messages) => {
        roundMessages.push([...messages]);
        round += 1;
        if (round === 1) {
          const calls = [{ id: 'midnight-1', type: 'function' as const, function: { name: 'cross_tool', arguments: '{}' } }];
          return { type: 'tool_calls', calls, assistantMessage: { role: 'assistant', content: null, tool_calls: calls } };
        }
        return { type: 'message', content: 'Past midnight' };
      }, {
        testNow: shiftingNow,
        toolNames: ['cross_tool'],
        tools: [createTestTool('cross_tool', async () => ({ crossed: true }))],
      });
      await context.service.start(context.project.id, context.agent.id, { task: 'Cross midnight' });
      await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
      for (const msgs of roundMessages) {
        const systemContent = requireMessageContent(msgs[0]);
        assert.ok(systemContent.endsWith('Current date: 2026-08-30'));
      }
      context.db.close();
    });

    it('does not persist date into Agent configuration', async () => {
      const context = setup(async () => ({ type: 'message', content: 'Done' }), { testNow: () => new Date(2026, 7, 30) });
      await context.service.start(context.project.id, context.agent.id, { task: 'No persist' });
      await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
      const agentData = JSON.stringify(context.agent.data);
      assert.equal(agentData.includes('Current date'), false);
      assert.equal(agentData.includes('2026-08-30'), false);
      context.db.close();
    });

    it('ordinary Agent run behavior remains unchanged with date injection', async () => {
      const captured: Array<Parameters<TestInferenceRequester>> = [];
      const context = setup(async (...parameters) => {
        captured.push(parameters);
        return { type: 'message', content: 'Normal result' };
      }, { testNow: () => new Date(2026, 7, 30) });
      await context.service.start(context.project.id, context.agent.id, { task: 'Ordinary run' });
      await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
      const completed = context.service.latest(context.project.id, context.agent.id);
      assert.equal(completed?.finalResult, 'Normal result');
      assert.equal(completed?.status, 'done');
      const messages = captured[0]?.[3] as ModelInferenceMessage[];
      assert.equal(messages.length, 2);
      assert.ok(requireMessageContent(messages[0]).includes('Current date:'));
      context.db.close();
    });

    it('instructions plus skill produce exactly one merged system message', async () => {
      const captured: Array<Parameters<TestInferenceRequester>> = [];
      const tool = createTestTool('merge_tool', async () => ({ ok: true }));
      const context = setup(async (...parameters) => {
        captured.push(parameters);
        return { type: 'message', content: 'Done' };
      }, {
        testNow: () => new Date(2026, 7, 30),
        skills: [{ commandName: 'merge-skill', markdown: 'Skill merge context' }],
        toolNames: ['merge_tool'],
        tools: [tool],
      });
      await context.service.start(context.project.id, context.agent.id, { task: 'Merge test' });
      await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
      const messages = captured[0]?.[3] as ModelInferenceMessage[];
      assert.equal(messages.length, 2);
      assert.equal(messages[0].role, 'system');
      assert.equal(messages[1].role, 'user');
      const systemContent = requireMessageContent(messages[0]);
      assert.ok(systemContent.startsWith('Inline instructions'));
      assert.ok(systemContent.includes('# Skill: merge-skill'));
      assert.ok(systemContent.endsWith('Current date: 2026-08-30'));
      context.db.close();
    });

    it('instructions plus attachments produce exactly one merged system message', async () => {
      const captured: Array<Parameters<TestInferenceRequester>> = [];
      const context = setup(
        async (...parameters) => {
          captured.push(parameters);
          return { type: 'message', content: 'Done' };
        },
        {
          testNow: () => new Date(2026, 7, 30),
          agentData: { attachedProjectFiles: ['attached/readme.md'] },
          filesystem: {
            readFile: async (_projectId, path) => {
              if (path === 'attached/readme.md') {
                return { relativePath: 'attached/readme.md', content: 'Attached content\n', size: 17 };
              }
              throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND');
            },
          },
        },
      );
      await context.service.start(context.project.id, context.agent.id, { task: 'Attachments merge' });
      await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
      const messages = captured[0]?.[3] as ModelInferenceMessage[];
      assert.equal(messages.length, 2);
      assert.equal(messages[0].role, 'system');
      assert.equal(messages[1].role, 'user');
      const systemContent = requireMessageContent(messages[0]);
      assert.ok(systemContent.startsWith('Inline instructions'));
      assert.ok(systemContent.includes('Attached Project files:'));
      assert.ok(systemContent.endsWith('Current date: 2026-08-30'));
      context.db.close();
    });

    it('instructions plus skill plus attachments produce exactly one merged system message', async () => {
      const captured: Array<Parameters<TestInferenceRequester>> = [];
      const tool = createTestTool('full_tool', async () => ({ ok: true }));
      const context = setup(
        async (...parameters) => {
          captured.push(parameters);
          return { type: 'message', content: 'Done' };
        },
        {
          testNow: () => new Date(2026, 7, 30),
          skills: [{ commandName: 'full-skill', markdown: 'Full skill context' }],
          toolNames: ['full_tool'],
          tools: [tool],
          agentData: { attachedProjectFiles: ['attached/data.md'] },
          filesystem: {
            readFile: async (_projectId, path) => {
              if (path === 'attached/data.md') {
                return { relativePath: 'attached/data.md', content: 'Data\n', size: 5 };
              }
              throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND');
            },
          },
        },
      );
      await context.service.start(context.project.id, context.agent.id, { task: 'Full merge' });
      await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
      const messages = captured[0]?.[3] as ModelInferenceMessage[];
      assert.equal(messages.length, 2);
      assert.equal(messages[0].role, 'system');
      assert.equal(messages[1].role, 'user');
      const systemContent = requireMessageContent(messages[0]);
      const instructionsPos = systemContent.indexOf('Inline instructions');
      const skillPos = systemContent.indexOf('# Skill: full-skill');
      const filesPos = systemContent.indexOf('Attached Project files:');
      const datePos = systemContent.indexOf('Current date:');
      assert.ok(instructionsPos === 0, 'Instructions must be first');
      assert.ok(skillPos > instructionsPos, 'Skill must come after instructions');
      assert.ok(filesPos > skillPos, 'Attachments must come after skill');
      assert.ok(datePos > filesPos, 'Date must come last');
      context.db.close();
    });

    it('merged sections are separated by exactly two newlines', async () => {
      const captured: Array<Parameters<TestInferenceRequester>> = [];
      const tool = createTestTool('sep_tool', async () => ({ ok: true }));
      const context = setup(
        async (...parameters) => {
          captured.push(parameters);
          return { type: 'message', content: 'Done' };
        },
        {
          testNow: () => new Date(2026, 7, 30),
          skills: [{ commandName: 'sep-skill', markdown: 'Sep skill' }],
          toolNames: ['sep_tool'],
          tools: [tool],
          agentData: { attachedProjectFiles: ['attached/sep.md'] },
          filesystem: {
            readFile: async (_projectId, path) => {
              if (path === 'attached/sep.md') {
                return { relativePath: 'attached/sep.md', content: 'Sep\n', size: 4 };
              }
              throw new ProjectFilesystemError('PROJECT_FILE_NOT_FOUND');
            },
          },
        },
      );
      await context.service.start(context.project.id, context.agent.id, { task: 'Separator test' });
      await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
      const systemContent = captured[0]?.[3][0].content as string;
      assert.ok(systemContent.includes('Inline instructions\n\n# Skill: sep-skill'));
      assert.ok(systemContent.includes('# Skill: sep-skill\n\nSep skill\n\nAttached Project files:'));
      assert.ok(systemContent.includes('Attached Project files:\n\n' + JSON.stringify([{ path: 'attached/sep.md', content: 'Sep\n' }]) + '\n\nCurrent date: 2026-08-30'));
      context.db.close();
    });

    it('missing optional sections do not create extra blank separators', async () => {
      const captured: Array<Parameters<TestInferenceRequester>> = [];
      const context = setup(async (...parameters) => {
        captured.push(parameters);
        return { type: 'message', content: 'Done' };
      }, { testNow: () => new Date(2026, 7, 30) });
      await context.service.start(context.project.id, context.agent.id, { task: 'No extras' });
      await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
      const systemContent = captured[0]?.[3][0].content as string;
      assert.equal(systemContent, 'Inline instructions\n\nCurrent date: 2026-08-30');
      assert.ok(!systemContent.includes('\n\n\n'), 'Must not have triple newlines from missing sections');
      context.db.close();
    });

    it('agent task remains a separate user message after merged system', async () => {
      const captured: Array<Parameters<TestInferenceRequester>> = [];
      const context = setup(async (...parameters) => {
        captured.push(parameters);
        return { type: 'message', content: 'Done' };
      }, { testNow: () => new Date(2026, 7, 30) });
      await context.service.start(context.project.id, context.agent.id, { task: 'Separate user message' });
      await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
      const messages = captured[0]?.[3] as ModelInferenceMessage[];
      assert.equal(messages.length, 2);
      assert.equal(messages[0].role, 'system');
      assert.equal(messages[1].role, 'user');
      assert.equal(messages[1].content, 'Do the work');
      context.db.close();
    });

    it('multiple tool rounds retain the same original merged system message', async () => {
      const roundMessages: Array<ModelInferenceMessage[]> = [];
      let round = 0;
      const context = setup(async (_baseUrl, _timeout, _modelId, messages) => {
        roundMessages.push([...messages]);
        round += 1;
        if (round <= 2) {
          const calls = [{ id: `r${round}`, type: 'function' as const, function: { name: 'retain_tool', arguments: '{}' } }];
          return { type: 'tool_calls', calls, assistantMessage: { role: 'assistant', content: null, tool_calls: calls } };
        }
        return { type: 'message', content: 'Final' };
      }, {
        testNow: () => new Date(2026, 7, 30),
        toolNames: ['retain_tool'],
        tools: [createTestTool('retain_tool', async () => ({ round }))] ,
      });
      await context.service.start(context.project.id, context.agent.id, { task: 'Retain test' });
      await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
      const originalSystem = roundMessages[0]![0].content;
      for (const msgs of roundMessages) {
        assert.equal(msgs[0].role, 'system');
        assert.equal(msgs[0].content, originalSystem);
        assert.equal(msgs[1]?.role, 'user');
      }
      context.db.close();
    });

    it('no additional system messages appear later in provider chronology', async () => {
      const allRounds: Array<ModelInferenceMessage[]> = [];
      let round = 0;
      const context = setup(async (_baseUrl, _timeout, _modelId, messages) => {
        allRounds.push([...messages]);
        round += 1;
        if (round === 1) {
          const calls = [{ id: 'no-sys-1', type: 'function' as const, function: { name: 'project_list_directory', arguments: '{}' } }];
          return { type: 'tool_calls', calls, assistantMessage: { role: 'assistant', content: null, tool_calls: calls } };
        }
        return { type: 'message', content: 'Final' };
      }, { testNow: () => new Date(2026, 7, 30) });
      await context.service.start(context.project.id, context.agent.id, { task: 'No extra system' });
      await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');
      for (const msgs of allRounds) {
        const systemMessages = msgs.filter((m) => m.role === 'system');
        assert.equal(systemMessages.length, 1, 'Each round must have exactly one system message');
      }
      context.db.close();
    });

    it('initial provider messages contain only merged system and user before any tool rounds', async () => {
      const captured: Array<Parameters<TestInferenceRequester>> = [];
      const context = setup(async (...parameters) => {
        captured.push(parameters);
        return { type: 'message', content: 'Done' };
      }, { testNow: () => new Date(2026, 7, 30) });
      await context.service.start(context.project.id, context.agent.id, { task: 'Initial shape' });
      await waitFor(() => captured.length > 0);
      const messages = captured[0]?.[3] as ModelInferenceMessage[];
      assert.equal(messages.length, 2);
      assert.deepEqual(messages[0], { role: 'system', content: messages[0].content });
      assert.equal(messages[0].role, 'system');
      assert.equal(messages[1].role, 'user');
      context.db.close();
    });
  });
});
