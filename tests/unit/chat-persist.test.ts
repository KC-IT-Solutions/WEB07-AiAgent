import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Database } from 'better-sqlite3';
import { createTestDatabase } from '../../src/server/database.js';
import { ChatRepository } from '../../src/server/repositories/chat-repository.js';

const CHAT_INPUT = {
  title: 'New chat',
  modelConnectionId: 1,
  modelId: 'qwen/qwen3.6-27b',
} as const;

await describe('ChatRepository', () => {
  let db: Database;
  let repository: ChatRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repository = new ChatRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates a chat with relational ownership and valid JSON data', async () => {
    const chat = await repository.create(1, { ...CHAT_INPUT });
    const row = db
      .prepare('SELECT user_id, data, json_valid(data) AS valid FROM chats WHERE id = ?')
      .get(chat.id) as { user_id: number; data: string; valid: number };
    const data = JSON.parse(row.data) as Record<string, unknown>;

    assert.strictEqual(row.user_id, 1);
    assert.strictEqual(row.valid, 1);
    assert.strictEqual(data.title, 'New chat');
    assert.strictEqual(data.modelConnectionId, 1);
    assert.strictEqual(data.modelId, 'qwen/qwen3.6-27b');
    assert.strictEqual(data.userId, undefined);
  });

  it('persists nullable model selection properties', async () => {
    const created = await repository.create(1, {
      title: 'No model selected',
      modelConnectionId: null,
      modelId: null,
    });

    const found = await repository.getById(1, created.id);

    assert.ok(found);
    assert.strictEqual(found.data.title, 'No model selected');
    assert.strictEqual(found.data.modelConnectionId, null);
    assert.strictEqual(found.data.modelId, null);
  });

  it('lists only chats owned by the requested user', async () => {
    await repository.create(1, { ...CHAT_INPUT, title: 'User 1 chat' });
    await repository.create(2, { ...CHAT_INPUT, title: 'User 2 chat' });

    const chats = await repository.listByUserId(1);

    assert.strictEqual(chats.length, 1);
    assert.strictEqual(chats[0].userId, 1);
    assert.strictEqual(chats[0].data.title, 'User 1 chat');
  });

  it('gets a chat by id only for its owner', async () => {
    const ownChat = await repository.create(1, { ...CHAT_INPUT, title: 'Own chat' });
    const otherChat = await repository.create(2, { ...CHAT_INPUT, title: 'Other chat' });

    assert.strictEqual((await repository.getById(1, ownChat.id))?.data.title, 'Own chat');
    assert.strictEqual(await repository.getById(1, otherChat.id), null);
  });

  it('updates chat JSON for its owner while preserving creation metadata', async () => {
    const created = await repository.create(1, { ...CHAT_INPUT });

    const updated = await repository.update(1, created.id, {
      title: created.data.title,
      modelConnectionId: 7,
      modelId: 'updated-model',
    });

    assert.ok(updated);
    assert.strictEqual(updated.createdAt, created.createdAt);
    assert.ok(updated.updatedAt > created.updatedAt);
    assert.strictEqual(updated.data.modelConnectionId, 7);
    assert.strictEqual(updated.data.modelId, 'updated-model');

    const row = db
      .prepare('SELECT created_at, updated_at, data FROM chats WHERE id = ?')
      .get(created.id) as { created_at: number; updated_at: number; data: string };
    assert.strictEqual(row.created_at, created.createdAt);
    assert.strictEqual(row.updated_at, updated.updatedAt);
    assert.deepStrictEqual(JSON.parse(row.data), updated.data);
  });

  it('cannot update a chat owned by another user', async () => {
    const otherChat = await repository.create(2, { ...CHAT_INPUT, title: 'Other user chat' });

    const updated = await repository.update(1, otherChat.id, {
      title: 'Changed',
      modelConnectionId: 8,
      modelId: 'forbidden-model',
    });

    assert.strictEqual(updated, null);
    assert.deepStrictEqual(await repository.getById(2, otherChat.id), otherChat);
  });

  it('deletes a chat owned by the requested user', async () => {
    const chat = await repository.create(1, { ...CHAT_INPUT });

    assert.strictEqual(await repository.delete(1, chat.id), true);
    assert.strictEqual(await repository.getById(1, chat.id), null);
  });

  it('cannot delete a chat owned by another user', async () => {
    const otherChat = await repository.create(2, { ...CHAT_INPUT });

    assert.strictEqual(await repository.delete(1, otherChat.id), false);
    assert.deepStrictEqual(await repository.getById(2, otherChat.id), otherChat);
  });
});
