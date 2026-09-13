import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  ChatMessageStoreError,
  FileChatMessageStore,
} from '../../src/server/stores/chat-message-store.js';

await describe('FileChatMessageStore', () => {
  let rootPath: string;
  let store: FileChatMessageStore;

  beforeEach(async () => {
    rootPath = await mkdtemp(resolve(tmpdir(), 'web07-chat-history-'));
    store = new FileChatMessageStore(rootPath);
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  it('returns an empty list when the history file is missing', async () => {
    assert.deepStrictEqual(await store.listMessages(1, 42), []);
  });

  it('appends user and assistant messages in order with UTF-8 content', async () => {
    const userMessage = { type: 'user', content: 'Hej från Göteborg', createdAt: 100 } as const;
    const assistantMessage = {
      type: 'assistant',
      content: 'こんにちは, välkommen!',
      createdAt: 101,
    } as const;

    await store.appendMessage(1, 42, userMessage);
    await store.appendMessage(1, 42, assistantMessage);

    assert.deepStrictEqual(await store.listMessages(1, 42), [userMessage, assistantMessage]);
    const contents = await readFile(resolve(rootPath, 'user-1', 'chat-42.jsonl'), 'utf8');
    assert.strictEqual(contents, `${JSON.stringify(userMessage)}\n${JSON.stringify(assistantMessage)}\n`);
  });

  it('derives separate paths only from validated user and chat IDs', async () => {
    await store.appendMessage(2, 7, { type: 'user', content: 'Trusted IDs', createdAt: 1 });

    assert.strictEqual(
      await readFile(resolve(rootPath, 'user-2', 'chat-7.jsonl'), 'utf8'),
      '{"type":"user","content":"Trusted IDs","createdAt":1}\n',
    );
    await assert.rejects(
      store.listMessages(Number.NaN, 7),
      (error: unknown) => error instanceof ChatMessageStoreError,
    );
    await assert.rejects(
      store.listMessages(1, -1),
      (error: unknown) => error instanceof ChatMessageStoreError,
    );
  });

  it('rejects malformed JSONL with a controlled store error', async () => {
    const directory = resolve(rootPath, 'user-1');
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, 'chat-8.jsonl'), '{not-json}\n', 'utf8');

    await assert.rejects(
      store.listMessages(1, 8),
      (error: unknown) => error instanceof ChatMessageStoreError,
    );
  });

  it('rejects malformed stored message shapes with a controlled store error', async () => {
    const directory = resolve(rootPath, 'user-1');
    await mkdir(directory, { recursive: true });
    await writeFile(
      resolve(directory, 'chat-9.jsonl'),
      '{"role":"system","content":"Invalid","createdAt":1}\n',
      'utf8',
    );

    await assert.rejects(
      store.listMessages(1, 9),
      (error: unknown) => error instanceof ChatMessageStoreError,
    );
  });

  it('rejects malformed nested tool event values safely', async () => {
    const directory = resolve(rootPath, 'user-1');
    await mkdir(directory, { recursive: true });
    await writeFile(
      resolve(directory, 'chat-12.jsonl'),
      '{"type":"tool_result","toolCallId":"call","toolName":"search","result":{},"success":"yes","createdAt":1}\n',
      'utf8',
    );
    await assert.rejects(store.listMessages(1, 12), ChatMessageStoreError);
  });

  it('serializes concurrent appends and deletes history idempotently', async () => {
    await Promise.all([
      store.appendMessage(1, 10, { type: 'user', content: 'First', createdAt: 1 }),
      store.appendMessage(1, 10, { type: 'assistant', content: 'Second', createdAt: 2 }),
    ]);

    assert.deepStrictEqual(await store.listMessages(1, 10), [
      { type: 'user', content: 'First', createdAt: 1 },
      { type: 'assistant', content: 'Second', createdAt: 2 },
    ]);
    await store.deleteHistory(1, 10);
    await store.deleteHistory(1, 10);
    assert.deepStrictEqual(await store.listMessages(1, 10), []);
  });

  it('reads legacy messages and preserves mixed typed event order', async () => {
    const directory = resolve(rootPath, 'user-1');
    await mkdir(directory, { recursive: true });
    await writeFile(
      resolve(directory, 'chat-11.jsonl'),
      [
        '{"role":"user","content":"Legacy","createdAt":1}',
        '{"type":"reasoning","content":"Think exactly","createdAt":1}',
        '{"type":"tool_call","toolCallId":"call-1","toolName":"search","arguments":{"query":"åäö"},"createdAt":1}',
        '{"type":"tool_result","toolCallId":"call-1","toolName":"search","result":{"items":[]},"success":true,"createdAt":1}',
        '{"type":"assistant","content":"Final","createdAt":1}',
      ].join('\n') + '\n',
      'utf8',
    );

    assert.deepEqual((await store.listMessages(1, 11)).map((event) => event.type), [
      'user',
      'reasoning',
      'tool_call',
      'tool_result',
      'assistant',
    ]);
  });
});
