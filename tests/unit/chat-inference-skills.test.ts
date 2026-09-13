import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createTestDatabase } from '../../src/server/database.js';
import { ChatRepository } from '../../src/server/repositories/chat-repository.js';
import { ChatSkillRepository } from '../../src/server/repositories/chat-skill-repository.js';
import { ModelConnectionRepository } from '../../src/server/repositories/model-connection-repository.js';
import { SkillRepository } from '../../src/server/repositories/skill-repository.js';
import { SkillToolRepository } from '../../src/server/repositories/skill-tool-repository.js';
import { ToolSettingsRepository } from '../../src/server/repositories/tool-settings-repository.js';
import { StructuredLogger } from '../../src/server/logging/logger.js';
import {
  ChatInferenceError,
  ChatInferenceService,
} from '../../src/server/services/chat-inference-service.js';
import { ChatService } from '../../src/server/services/chat-service.js';
import { ModelConnectionService } from '../../src/server/services/model-connection-service.js';
import { ToolSettingsService } from '../../src/server/services/tool-settings-service.js';
import { FileChatMessageStore } from '../../src/server/stores/chat-message-store.js';
import {
  FileSkillContentStore,
  SkillContentStoreError,
  type SkillContentStore,
} from '../../src/server/stores/skill-content-store.js';
import { ToolRegistry } from '../../src/server/tools/tool-registry.js';
import {
  DUCKDUCKGO_TOOL_NAME,
  VISIT_WEBSITE_TOOL_NAME,
  type RegisteredTool,
} from '../../src/server/tool-types.js';
import type {
  ModelInferenceMessage,
  ModelInferenceResult,
  ModelToolDefinition,
} from '../../src/services/model-inference.js';

function registeredTool(name: string, executions: string[]): RegisteredTool {
  return {
    name,
    displayName: name,
    description: `Definition for ${name}`,
    inputSchema: { type: 'object', additionalProperties: true },
    execute: async () => {
      executions.push(name);
      return { ok: true };
    },
  };
}

async function setupSkills(registryNames = [DUCKDUCKGO_TOOL_NAME, VISIT_WEBSITE_TOOL_NAME]) {
  const db = createTestDatabase();
  const root = mkdtempSync(resolve(tmpdir(), 'web07-inference-skills-'));
  const chatService = new ChatService(
    new ChatRepository(db),
    new FileChatMessageStore(resolve(root, 'history')),
  );
  const modelConnectionService = new ModelConnectionService(new ModelConnectionRepository(db));
  modelConnectionService.isModelVisible = async () => true;
  const connection = await modelConnectionService.createConnection({
    name: 'Stub',
    baseUrl: 'http://model.test',
    timeoutMinutes: 1,
    modelId: null,
    enabled: true,
  });
  const chat = await chatService.createChat({ title: 'Skill inference' });
  await chatService.updateChat(chat.id, {
    modelConnectionId: connection.id,
    modelId: 'stub-model',
  });
  const executions: string[] = [];
  const registry = new ToolRegistry(
    registryNames.map((name) => registeredTool(name, executions)),
  );
  const toolSettingsService = new ToolSettingsService(
    new ToolSettingsRepository(db),
    registry,
  );
  const skills = new SkillRepository(db);
  const skillTools = new SkillToolRepository(db);
  const chatSkills = new ChatSkillRepository(db);
  const contentStore = new FileSkillContentStore(resolve(root, 'skills'));

  const activate = async (
    commandName: string,
    markdown: string,
    requiredTools: string[] = [],
  ) => {
    const skill = skills.create(commandName, { name: commandName });
    skillTools.replace(skill.id, requiredTools);
    await contentStore.write(skill.id, markdown);
    chatSkills.add(chat.id, skill.id);
    return skill;
  };

  return {
    db,
    root,
    chat,
    chatService,
    modelConnectionService,
    registry,
    toolSettingsService,
    skills,
    skillTools,
    chatSkills,
    contentStore,
    executions,
    activate,
  };
}

type SkillSetup = Awaited<ReturnType<typeof setupSkills>>;

function createService(
  setup: SkillSetup,
  requester: (
    baseUrl: string,
    timeoutMinutes: number,
    modelId: string,
    messages: ModelInferenceMessage[],
    tools?: ModelToolDefinition[],
  ) => Promise<ModelInferenceResult>,
  options: {
    logger?: StructuredLogger;
    contentStore?: Pick<SkillContentStore, 'read'>;
    now?: () => Date;
  } = {},
): ChatInferenceService {
  return new ChatInferenceService(
    setup.chatService,
    setup.modelConnectionService,
    setup.toolSettingsService,
    setup.registry,
    requester,
    options.logger,
    setup.chatSkills,
    setup.skillTools,
    options.contentStore ?? setup.contentStore,
    options.now,
  );
}

await describe('active Skills in Chat inference', async () => {
  await it('adds only the fixed date system message when no Skill is active without persistence or streaming', async () => {
    const setup = await setupSkills();
    await setup.chatService.appendMessage(setup.chat.id, {
      type: 'assistant',
      content: 'Existing answer',
      createdAt: 1,
    });
    let captured: ModelInferenceMessage[] = [];
    const streamedTypes: string[] = [];
    const service = createService(
      setup,
      async (_url, _timeout, _model, messages) => {
        captured = structuredClone(messages);
        return { type: 'message', content: 'Final' };
      },
      { now: () => new Date(2026, 7, 23, 12) },
    );

    await service.infer(setup.chat.id, 'Current question', (event) => {
      streamedTypes.push(event.type);
    });

    assert.deepEqual(captured, [
      { role: 'system', content: 'Current date: 2026-08-23' },
      { role: 'assistant', content: 'Existing answer' },
      { role: 'user', content: 'Current question' },
    ]);
    assert.deepEqual(streamedTypes, ['assistant']);
    const history = await setup.chatService.listMessages(setup.chat.id);
    assert.deepEqual(history?.map((event) => event.type), ['assistant', 'user', 'assistant']);
    assert.ok(
      !history?.some(
        (event) => 'content' in event && event.content === 'Current date: 2026-08-23',
      ),
    );
    setup.db.close();
  });

  await it('keeps deterministic Skill context before the fixed date without persistence', async () => {
    const setup = await setupSkills();
    await setup.chatService.appendMessage(setup.chat.id, {
      type: 'user',
      content: 'Earlier question',
      createdAt: 1,
    });
    await setup.activate('news-compiler', 'Always compile exactly five news items.');
    await setup.activate('research', 'Use primary sources only.');
    let captured: ModelInferenceMessage[] = [];
    const service = createService(
      setup,
      async (_url, _timeout, _model, messages) => {
        captured = structuredClone(messages);
        return { type: 'message', content: 'Final' };
      },
      { now: () => new Date(2026, 7, 23, 12) },
    );

    await service.infer(setup.chat.id, 'Current question');

    assert.deepEqual(captured.map((message) => message.role), [
      'system',
      'system',
      'user',
      'user',
    ]);
    const system = captured[0];
    assert.ok(system?.role === 'system');
    assert.equal(
      system.content,
      '# Skill: news-compiler\n\nAlways compile exactly five news items.\n\n# Skill: research\n\nUse primary sources only.',
    );
    assert.ok(system.content.indexOf('news-compiler') < system.content.indexOf('research'));
    assert.equal(system.content.match(/Always compile exactly five news items\./g)?.length, 1);
    assert.equal(system.content.match(/Use primary sources only\./g)?.length, 1);
    assert.deepEqual(captured[1], { role: 'system', content: 'Current date: 2026-08-23' });
    assert.deepEqual(captured.slice(2), [
      { role: 'user', content: 'Earlier question' },
      { role: 'user', content: 'Current question' },
    ]);
    const history = await setup.chatService.listMessages(setup.chat.id);
    assert.deepEqual(history?.map((event) => event.type), ['user', 'user', 'assistant']);
    assert.ok(!history?.some((event) => 'content' in event && event.content.includes('# Skill:')));
    setup.db.close();
  });

  await it('captures one date across midnight and keeps it last among system messages in every round', async () => {
    const setup = await setupSkills();
    await setup.activate('research', 'Search deliberately.', [DUCKDUCKGO_TOOL_NAME]);
    const calls = ['skill-call-1', 'skill-call-2'].map((id) => ({
      id,
      type: 'function' as const,
      function: { name: DUCKDUCKGO_TOOL_NAME, arguments: '{}' },
    }));
    const captured: ModelInferenceMessage[][] = [];
    let clockCalls = 0;
    const service = createService(
      setup,
      async (_url, _timeout, _model, messages) => {
        captured.push(structuredClone(messages));
        if (captured.length <= 2) {
          const call = calls[captured.length - 1];
          return {
            type: 'tool_calls',
            calls: [call],
            assistantMessage: { role: 'assistant', content: null, tool_calls: [call] },
          };
        }
        return { type: 'message', content: 'Final' };
      },
      {
        now: () => {
          clockCalls += 1;
          return clockCalls === 1
            ? new Date(2026, 7, 23, 23, 59)
            : new Date(2026, 7, 24, 0, 1);
        },
      },
    );

    await service.infer(setup.chat.id, 'Start');

    assert.equal(captured.length, 3);
    assert.equal(clockCalls, 1);
    for (const messages of captured) {
      const systemMessages = messages.filter((candidate) => candidate.role === 'system');
      assert.equal(systemMessages.length, 2);
      assert.deepEqual(systemMessages[1], {
        role: 'system',
        content: 'Current date: 2026-08-23',
      });
      assert.deepEqual(messages.slice(0, 2), captured[0].slice(0, 2));
    }
    assert.deepEqual(captured[2].map((candidate) => candidate.role), [
      'system',
      'system',
      'user',
      'assistant',
      'tool',
      'assistant',
      'tool',
    ]);
    assert.deepEqual(captured[2].slice(2), [
      { role: 'user', content: 'Start' },
      { role: 'assistant', content: null, tool_calls: [calls[0]] },
      { role: 'tool', tool_call_id: 'skill-call-1', content: '{"ok":true}' },
      { role: 'assistant', content: null, tool_calls: [calls[1]] },
      { role: 'tool', tool_call_id: 'skill-call-2', content: '{"ok":true}' },
    ]);
    setup.db.close();
  });

  await it('unions disabled required tools after normal tools and de-duplicates definitions', async () => {
    const setup = await setupSkills();
    await setup.toolSettingsService.updateSettings(DUCKDUCKGO_TOOL_NAME, {
      enabledForChat: true,
      pageSize: 5,
      safeSearch: 'moderate',
    });
    await setup.activate('first', 'First.', [VISIT_WEBSITE_TOOL_NAME]);
    await setup.activate('second', 'Second.', [
      VISIT_WEBSITE_TOOL_NAME,
      DUCKDUCKGO_TOOL_NAME,
    ]);
    let capturedTools: ModelToolDefinition[] = [];
    const service = createService(setup, async (_url, _timeout, _model, _messages, tools = []) => {
      capturedTools = structuredClone(tools);
      return { type: 'message', content: 'Final' };
    });

    await service.infer(setup.chat.id, 'Use available tools');

    assert.deepEqual(
      capturedTools.map((tool) => tool.function.name),
      [DUCKDUCKGO_TOOL_NAME, VISIT_WEBSITE_TOOL_NAME],
    );
    assert.deepEqual(setup.executions, []);
    assert.equal(
      (await setup.toolSettingsService.getSettings(VISIT_WEBSITE_TOOL_NAME)).enabledForChat,
      false,
    );
    setup.db.close();
  });

  await it('fails before the provider when a persisted required tool is not registered', async () => {
    const setup = await setupSkills([DUCKDUCKGO_TOOL_NAME]);
    const skill = await setup.activate('broken-tool', 'Do not execute.', []);
    setup.db
      .prepare(
        `INSERT INTO skill_tools (skill_id, tool_name, created_at, updated_at, data)
         VALUES (?, ?, 1, 1, '{}')`,
      )
      .run(skill.id, VISIT_WEBSITE_TOOL_NAME);
    let providerCalls = 0;
    const service = createService(setup, async () => {
      providerCalls += 1;
      return { type: 'message', content: 'Must not run' };
    });

    await assert.rejects(
      () => service.infer(setup.chat.id, 'Fail safely'),
      (error: unknown) =>
        error instanceof ChatInferenceError && error.code === 'SKILL_REQUIRED_TOOL_MISSING',
    );
    assert.equal(providerCalls, 0);
    assert.deepEqual(setup.executions, []);
    setup.db.close();
  });

  await it('classifies invalid persisted Skill metadata before provider construction', async () => {
    const setup = await setupSkills();
    const skill = await setup.activate('invalid-stored', 'Never loaded.');
    setup.db.prepare('UPDATE skills SET data = ? WHERE id = ?').run('{}', skill.id);
    let providerCalls = 0;
    const service = createService(setup, async () => {
      providerCalls += 1;
      return { type: 'message', content: 'Must not run' };
    });

    await assert.rejects(
      () => service.infer(setup.chat.id, 'Fail safely'),
      (error: unknown) =>
        error instanceof ChatInferenceError && error.code === 'SKILL_DATA_INVALID',
    );
    assert.equal(providerCalls, 0);
    setup.db.close();
  });

  for (const failure of ['missing', 'unreadable'] as const) {
    await it(`fails safely with bounded diagnostics when Skill content is ${failure}`, async () => {
      const setup = await setupSkills();
      const skill = setup.skills.create(`${failure}-content`, { name: `${failure} content` });
      setup.chatSkills.add(setup.chat.id, skill.id);
      const logRoot = resolve(setup.root, 'logs');
      const logger = new StructuredLogger(logRoot, 'debug');
      const failingStore: Pick<SkillContentStore, 'read'> =
        failure === 'missing'
          ? setup.contentStore
          : {
              read: async () => {
                throw new SkillContentStoreError('READ_FAILED');
              },
            };
      let providerCalls = 0;
      const service = createService(
        setup,
        async () => {
          providerCalls += 1;
          return { type: 'message', content: 'Must not run' };
        },
        { logger, contentStore: failingStore },
      );

      await assert.rejects(
        () => service.infer(setup.chat.id, 'Fail safely'),
        (error: unknown) => {
          assert.ok(error instanceof ChatInferenceError);
          assert.equal(error.code, 'SKILL_CONTENT_UNAVAILABLE');
          assert.equal(error.message.includes(setup.root), false);
          return true;
        },
      );
      assert.equal(providerCalls, 0);
      const logText = readFileSync(resolve(logRoot, 'model-inference.log'), 'utf8');
      const entries = logText
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const diagnostic = entries.find((entry) => entry.event === 'active_skill_resolution_failed');
      assert.equal(diagnostic?.skillId, skill.id);
      assert.equal(diagnostic?.commandName, `${failure}-content`);
      assert.equal(diagnostic?.stage, 'skill_content');
      assert.equal(logText.includes(setup.root), false);
      setup.db.close();
    });
  }

  await it('logs bounded Skill and effective-tool metadata on every model round', async () => {
    const setup = await setupSkills();
    await setup.activate('logged-skill', 'Log metadata only.', [VISIT_WEBSITE_TOOL_NAME]);
    const logRoot = resolve(setup.root, 'logs');
    const logger = new StructuredLogger(logRoot, 'debug');
    const service = createService(
      setup,
      async () => ({ type: 'message', content: 'Final' }),
      { logger },
    );

    await service.infer(setup.chat.id, 'Log this');

    const entries = readFileSync(resolve(logRoot, 'model-inference.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const request = entries.find((entry) => entry.event === 'model_request');
    assert.equal(request?.activeSkillCount, 1);
    assert.deepEqual(request?.activeSkillCommands, ['logged-skill']);
    assert.equal(request?.effectiveToolCount, 1);
    assert.equal(
      request?.skillContextBytes,
      Buffer.byteLength('# Skill: logged-skill\n\nLog metadata only.'),
    );
    setup.db.close();
  });
});
