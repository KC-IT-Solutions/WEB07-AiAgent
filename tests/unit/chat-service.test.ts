import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/server/database.js';
import { ChatRepository } from '../../src/server/repositories/chat-repository.js';
import { ChatService } from '../../src/server/services/chat-service.js';

const CHAT_INPUT = {
  title: 'Service chat',
  modelConnectionId: null,
  modelId: null,
} as const;

await describe('ChatService', () => {
  it('enforces UserId 1 for create, list, get, update, and delete operations', async () => {
    const db = createTestDatabase();
    const repository = new ChatRepository(db);
    const service = new ChatService(repository);
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
  });
});
