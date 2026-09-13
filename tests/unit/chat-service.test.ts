import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createTestDatabase } from '../../src/server/database.js';
import { ChatRepository } from '../../src/server/repositories/chat-repository.js';
import { ChatService } from '../../src/server/services/chat-service.js';
import { FileChatMessageStore } from '../../src/server/stores/chat-message-store.js';

const CHAT_INPUT = {
  title: 'Service chat',
  modelConnectionId: null,
  modelId: null,
} as const;

await describe('ChatService', () => {
  it('enforces UserId 1 for create, list, get, update, and delete operations', async () => {
    const db = createTestDatabase();
    const repository = new ChatRepository(db);
    const historyRoot = await mkdtemp(resolve(tmpdir(), 'web07-chat-service-'));
    const service = new ChatService(repository, new FileChatMessageStore(historyRoot));
    const ownChat = await service.createChat({ ...CHAT_INPUT });
    const otherChat = await repository.create(2, { ...CHAT_INPUT, title: 'Other user chat' });

    assert.strictEqual(ownChat.userId, 1);
    assert.deepStrictEqual(
      (await service.listChats()).map((chat) => chat.id),
      [ownChat.id],
    );
    assert.strictEqual((await service.getChatById(ownChat.id))?.id, ownChat.id);
    assert.strictEqual(await service.getChatById(otherChat.id), null);

    const updated = await service.updateChat(ownChat.id, {
      modelConnectionId: 4,
      modelId: 'service-model',
    });
    assert.ok(updated);
    assert.strictEqual(updated.data.title, ownChat.data.title);
    assert.strictEqual(updated.data.modelConnectionId, 4);
    assert.strictEqual(updated.data.modelId, 'service-model');
    assert.strictEqual(await service.updateChat(otherChat.id, { title: 'Forbidden' }), null);

    assert.strictEqual(await service.deleteChat(otherChat.id), false);
    assert.ok(await repository.getById(2, otherChat.id));
    assert.strictEqual(await service.deleteChat(ownChat.id), true);
    assert.strictEqual(await repository.getById(1, ownChat.id), null);

    const row = db.prepare('SELECT user_id FROM chats WHERE id = ?').get(otherChat.id) as {
      user_id: number;
    };
    assert.strictEqual(row.user_id, 2);
    db.close();
    await rm(historyRoot, { recursive: true, force: true });
  });

  it('copies defaults into new chats without changing existing chats', async () => {
    const db = createTestDatabase();
    const repository = new ChatRepository(db);
    const historyRoot = await mkdtemp(resolve(tmpdir(), 'web07-chat-defaults-'));
    let defaults: { defaultModelConnectionId: number | null; defaultModelId: string | null } = {
      defaultModelConnectionId: 7,
      defaultModelId: 'default/model',
    };
    const service = new ChatService(repository, new FileChatMessageStore(historyRoot), {
      getDefaultsForNewChat: async () => defaults,
    });
    const first = await service.createChat({ title: 'First' });
    defaults = { defaultModelConnectionId: 8, defaultModelId: null };
    const second = await service.createChat({ title: 'Second' });

    assert.deepEqual(first.data, {
      title: 'First',
      modelConnectionId: 7,
      modelId: 'default/model',
    });
    assert.deepEqual(second.data, { title: 'Second', modelConnectionId: 8, modelId: null });
    assert.deepEqual((await service.getChatById(first.id))?.data, first.data);
    db.close();
    await rm(historyRoot, { recursive: true, force: true });
  });

  it('clears only owned message history and preserves chat metadata', async () => {
    const db = createTestDatabase();
    const repository = new ChatRepository(db);
    const historyRoot = await mkdtemp(resolve(tmpdir(), 'web07-chat-clear-'));
    const store = new FileChatMessageStore(historyRoot);
    const service = new ChatService(repository, store);
    const ownChat = await service.createChat({ title: 'Keep metadata' });
    const otherChat = await repository.create(2, {
      title: 'Other',
      modelConnectionId: null,
      modelId: null,
    });
    await service.updateChat(ownChat.id, { modelConnectionId: 4, modelId: 'keep/model' });
    await service.appendMessage(ownChat.id, { type: 'reasoning', content: 'Clear me', createdAt: 1 });
    await service.appendMessage(ownChat.id, {
      type: 'tool_call',
      toolCallId: 'clear-call',
      toolName: 'search',
      arguments: { query: 'clear' },
      createdAt: 2,
    });
    await service.appendMessage(ownChat.id, {
      type: 'tool_result',
      toolCallId: 'clear-call',
      toolName: 'search',
      result: { results: [] },
      success: true,
      createdAt: 3,
    });
    await store.appendMessage(2, otherChat.id, {
      type: 'user',
      content: 'Private',
      createdAt: 1,
    });

    assert.equal(await service.clearMessages(otherChat.id), false);
    assert.equal(await service.clearMessages(ownChat.id), true);
    assert.equal(await service.clearMessages(ownChat.id), true);
    assert.deepEqual(await service.listMessages(ownChat.id), []);
    const privateEvent = (await store.listMessages(2, otherChat.id))[0];
    assert.equal(privateEvent.type === 'user' ? privateEvent.content : null, 'Private');
    assert.deepEqual((await service.getChatById(ownChat.id))?.data, {
      title: 'Keep metadata',
      modelConnectionId: 4,
      modelId: 'keep/model',
    });
    db.close();
    await rm(historyRoot, { recursive: true, force: true });
  });
});
