import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createTestDatabase } from '../../src/server/database.js';
import { ChatRepository } from '../../src/server/repositories/chat-repository.js';
import { ChatSkillRepository } from '../../src/server/repositories/chat-skill-repository.js';
import { SkillRepository } from '../../src/server/repositories/skill-repository.js';
import {
  ChatCommandError,
  ChatCommandService,
} from '../../src/server/services/chat-command-service.js';
import { ChatService } from '../../src/server/services/chat-service.js';
import { FileChatMessageStore } from '../../src/server/stores/chat-message-store.js';

await describe('ChatCommandService', async () => {
  await it('handles built-ins, Skill toggles, ordered listing, and unknown commands locally', async () => {
    const db = createTestDatabase();
    const historyRoot = await mkdtemp(resolve(tmpdir(), 'web07-chat-commands-'));
    const chats = new ChatRepository(db);
    const chatService = new ChatService(chats, new FileChatMessageStore(historyRoot));
    const skillRepository = new SkillRepository(db);
    const links = new ChatSkillRepository(db);
    const commandService = new ChatCommandService(
      chatService,
      {
        findCommand: async (commandName: string) => {
          const record = skillRepository.getByCommandName(commandName);
          return record
            ? { id: record.id, commandName: record.commandName, name: record.data.name }
            : null;
        },
      },
      links,
    );
    const chat = await chatService.createChat({ title: 'Command chat' });
    const news = skillRepository.create('news-compiler', { name: 'News Compiler' });
    const research = skillRepository.create('research', { name: 'Research' });

    assert.deepEqual(await commandService.execute(chat.id, '/skills'), {
      type: 'command_result',
      command: 'skills',
      message: 'No skills active in this chat.',
    });
    assert.equal(
      (await commandService.execute(chat.id, '/news-compiler')).message,
      'Skill enabled: News Compiler',
    );
    assert.equal(links.isActive(chat.id, news.id), true);
    assert.equal((await commandService.execute(chat.id, '/research')).message, 'Skill enabled: Research');
    db.prepare('UPDATE chat_skills SET created_at = 10 WHERE skill_id = ?').run(news.id);
    db.prepare('UPDATE chat_skills SET created_at = 20 WHERE skill_id = ?').run(research.id);
    assert.equal(
      (await commandService.execute(chat.id, '/skills')).message,
      'Active skills\n\n/news-compiler - News Compiler\n/research - Research',
    );
    assert.equal(
      (await commandService.execute(chat.id, '/news-compiler')).message,
      'Skill disabled: News Compiler',
    );
    assert.equal(links.isActive(chat.id, news.id), false);
    assert.deepEqual(await commandService.execute(chat.id, '/does-not-exist'), {
      type: 'command_result',
      command: 'does-not-exist',
      message: 'Command not found: /does-not-exist',
    });
    assert.equal((await commandService.execute(chat.id, '/new')).command, 'new');

    await chatService.appendMessage(chat.id, { type: 'user', content: 'Keep then clear', createdAt: 1 });
    assert.equal((await commandService.execute(chat.id, '  /clear  ')).command, 'clear');
    assert.deepEqual(await chatService.listMessages(chat.id), []);

    const otherChat = await chats.create(2, {
      title: 'Private',
      modelConnectionId: null,
      modelId: null,
    });
    await assert.rejects(
      commandService.execute(otherChat.id, '/skills'),
      (error: unknown) => error instanceof ChatCommandError && error.code === 'CHAT_NOT_FOUND',
    );
    assert.deepEqual(await chatService.listMessages(chat.id), []);
    db.close();
    await rm(historyRoot, { recursive: true, force: true });
  });
});
