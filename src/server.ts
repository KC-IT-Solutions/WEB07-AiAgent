import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testConnection } from './services/model-connection.js';
import { getDatabase } from './server/database.js';
import { ModelConnectionRepository } from './server/repositories/model-connection-repository.js';
import { ModelConnectionService } from './server/services/model-connection-service.js';
import type { CreateModelConnectionInput } from './server/model-connection-types.js';
import { ChatRepository } from './server/repositories/chat-repository.js';
import { ChatService } from './server/services/chat-service.js';
import type { CreateChatInput, UpdateChatInput } from './server/chat-types.js';
import {
  ChatInferenceError,
  ChatInferenceService,
} from './server/services/chat-inference-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const clientRoot = path.join(__dirname, 'client');

// Parse JSON request bodies
app.use(express.json());

// Serve static files from the src/client directory
app.use(express.static(clientRoot));

const DEFAULT_TIMEOUT_MINUTES = 30;

// Initialize database (runs migrations) and wire the persistence boundary
const db = getDatabase();
const modelConnectionService = new ModelConnectionService(new ModelConnectionRepository(db));
const chatService = new ChatService(new ChatRepository(db));
const chatInferenceService = new ChatInferenceService(chatService, modelConnectionService);

// Model connection test endpoint
app.post('/api/model-connections/test', async (req: Request, res: Response) => {
  const body = req.body;

  if (!body || typeof body.baseUrl !== 'string' || !body.baseUrl.trim()) {
    res.status(400).json({
      connected: false,
      models: [],
      error: 'Invalid request: baseUrl is required',
    });
    return;
  }

  let timeoutMinutes = DEFAULT_TIMEOUT_MINUTES;
  if (body.timeoutMinutes !== undefined) {
    const parsed = Number(body.timeoutMinutes);
    if (typeof parsed === 'number' && !isNaN(parsed) && parsed > 0) {
      timeoutMinutes = parsed;
    }
  }

  try {
    const result = await testConnection(
      body.baseUrl.trim(),
      typeof body.apiKey === 'string' ? body.apiKey : undefined,
      timeoutMinutes,
    );

    res.json(result);
  } catch {
    res.status(500).json({
      connected: false,
      models: [],
      error: 'Failed to test connection',
    });
  }
});

// POST /api/model-connections
app.post('/api/model-connections', async (req: Request, res: Response) => {
  const body = req.body;

  if (!body || typeof body.name !== 'string' || !body.name.trim()) {
    res.status(400).json({ error: 'Invalid request: name is required' });
    return;
  }

  if (typeof body.baseUrl !== 'string' || !body.baseUrl.trim()) {
    res.status(400).json({ error: 'Invalid request: baseUrl is required' });
    return;
  }

  let timeoutMinutes = DEFAULT_TIMEOUT_MINUTES;
  if (body.timeoutMinutes !== undefined) {
    const parsed = Number(body.timeoutMinutes);
    if (typeof parsed === 'number' && !isNaN(parsed) && parsed > 0) {
      timeoutMinutes = parsed;
    }
  }

  let modelId: string | null = null;
  if (body.modelId !== undefined && body.modelId !== null) {
    if (typeof body.modelId === 'string' && body.modelId.trim().length > 0) {
      modelId = body.modelId.trim();
    }
  }

  let enabled = true;
  if (body.enabled !== undefined) {
    if (typeof body.enabled === 'boolean') {
      enabled = body.enabled;
    }
  }

  const input: CreateModelConnectionInput = {
    name: body.name.trim(),
    baseUrl: body.baseUrl.trim(),
    timeoutMinutes,
    modelId,
    enabled,
  };

  try {
    const connection = await modelConnectionService.createConnection(input);
    res.status(201).json(connection);
  } catch {
    res.status(500).json({ error: 'Failed to create connection' });
  }
});

// GET /api/model-connections
app.get('/api/model-connections', async (_req, res: Response) => {
  try {
    const connections = await modelConnectionService.listConnections();
    res.json(connections);
  } catch {
    res.status(500).json({ error: 'Failed to list connections' });
  }
});

app.get('/api/model-connections/:id/models', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid connection id' });
    return;
  }

  try {
    const models = await modelConnectionService.discoverModels(id);

    if (models === null) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }

    res.json({ models });
  } catch {
    res.status(502).json({ error: 'Failed to discover models' });
  }
});

// GET /api/model-connections/:id
app.get('/api/model-connections/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid connection id' });
    return;
  }

  try {
    const connection = await modelConnectionService.getConnectionById(id);

    if (!connection) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }

    res.json(connection);
  } catch {
    res.status(500).json({ error: 'Failed to get connection' });
  }
});

// PUT /api/model-connections/:id
app.put('/api/model-connections/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid connection id' });
    return;
  }

  const body = req.body;

  if (!body || typeof body.name !== 'string' || !body.name.trim()) {
    res.status(400).json({ error: 'Invalid request: name is required' });
    return;
  }

  if (typeof body.baseUrl !== 'string' || !body.baseUrl.trim()) {
    res.status(400).json({ error: 'Invalid request: baseUrl is required' });
    return;
  }

  let timeoutMinutes = DEFAULT_TIMEOUT_MINUTES;
  if (body.timeoutMinutes !== undefined) {
    const parsed = Number(body.timeoutMinutes);
    if (typeof parsed === 'number' && !isNaN(parsed) && parsed > 0) {
      timeoutMinutes = parsed;
    }
  }

  let modelId: string | null = null;
  if (body.modelId !== undefined && body.modelId !== null) {
    if (typeof body.modelId === 'string' && body.modelId.trim().length > 0) {
      modelId = body.modelId.trim();
    }
  }

  let enabled = true;
  if (body.enabled !== undefined) {
    if (typeof body.enabled === 'boolean') {
      enabled = body.enabled;
    }
  }

  const input: CreateModelConnectionInput = {
    name: body.name.trim(),
    baseUrl: body.baseUrl.trim(),
    timeoutMinutes,
    modelId,
    enabled,
  };

  try {
    const connection = await modelConnectionService.updateConnection(id, input);

    if (!connection) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }

    res.json(connection);
  } catch {
    res.status(500).json({ error: 'Failed to update connection' });
  }
});

// DELETE /api/model-connections/:id
app.delete('/api/model-connections/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid connection id' });
    return;
  }

  try {
    const deleted = await modelConnectionService.deleteConnection(id);

    if (!deleted) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }

    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Failed to delete connection' });
  }
});

app.post('/api/chats', async (req: Request, res: Response) => {
  const body = req.body;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  if (typeof body.title !== 'string' || body.title.trim().length === 0) {
    res.status(400).json({ error: 'Invalid request: title is required' });
    return;
  }

  let modelConnectionId: number | null = null;
  if (body.modelConnectionId !== undefined && body.modelConnectionId !== null) {
    if (!Number.isInteger(body.modelConnectionId) || body.modelConnectionId <= 0) {
      res.status(400).json({
        error: 'Invalid request: modelConnectionId must be a positive integer or null',
      });
      return;
    }
    modelConnectionId = body.modelConnectionId;
  }

  let modelId: string | null = null;
  if (body.modelId !== undefined && body.modelId !== null) {
    if (typeof body.modelId !== 'string' || body.modelId.trim().length === 0) {
      res.status(400).json({
        error: 'Invalid request: modelId must be a non-empty string or null',
      });
      return;
    }
    modelId = body.modelId.trim();
  }

  const input: CreateChatInput = {
    title: body.title.trim(),
    modelConnectionId,
    modelId,
  };

  try {
    const chat = await chatService.createChat(input);
    res.status(201).json(chat);
  } catch {
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

app.get('/api/chats', async (_req, res: Response) => {
  try {
    const chats = await chatService.listChats();
    res.json(chats);
  } catch {
    res.status(500).json({ error: 'Failed to list chats' });
  }
});

app.get('/api/chats/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid chat id' });
    return;
  }

  try {
    const chat = await chatService.getChatById(id);

    if (!chat) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }

    res.json(chat);
  } catch {
    res.status(500).json({ error: 'Failed to get chat' });
  }
});

app.put('/api/chats/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid chat id' });
    return;
  }

  const body: unknown = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const values = body as Record<string, unknown>;
  const allowedFields = new Set(['title', 'modelConnectionId', 'modelId']);
  const fields = Object.keys(values);

  if (fields.length === 0 || fields.some((field) => !allowedFields.has(field))) {
    res.status(400).json({ error: 'Invalid request fields' });
    return;
  }

  const input: UpdateChatInput = {};

  if ('title' in values) {
    if (typeof values.title !== 'string' || values.title.trim().length === 0) {
      res.status(400).json({ error: 'Invalid request: title must be a non-empty string' });
      return;
    }
    input.title = values.title.trim();
  }

  if ('modelConnectionId' in values) {
    if (
      values.modelConnectionId !== null &&
      (!Number.isInteger(values.modelConnectionId) || Number(values.modelConnectionId) <= 0)
    ) {
      res.status(400).json({
        error: 'Invalid request: modelConnectionId must be a positive integer or null',
      });
      return;
    }
    input.modelConnectionId = values.modelConnectionId as number | null;
  }

  if ('modelId' in values) {
    if (
      values.modelId !== null &&
      (typeof values.modelId !== 'string' || values.modelId.trim().length === 0)
    ) {
      res.status(400).json({
        error: 'Invalid request: modelId must be a non-empty string or null',
      });
      return;
    }
    input.modelId = typeof values.modelId === 'string' ? values.modelId.trim() : null;
  }

  try {
    const chat = await chatService.updateChat(id, input);

    if (!chat) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }

    res.json(chat);
  } catch {
    res.status(500).json({ error: 'Failed to update chat' });
  }
});

app.delete('/api/chats/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid chat id' });
    return;
  }

  try {
    const deleted = await chatService.deleteChat(id);

    if (!deleted) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }

    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

app.post('/api/chats/:id/inference', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid chat id' });
    return;
  }

  const body: unknown = req.body;
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    typeof (body as Record<string, unknown>).message !== 'string' ||
    ((body as Record<string, unknown>).message as string).trim().length === 0
  ) {
    res.status(400).json({ error: 'Invalid request: message must be a non-empty string' });
    return;
  }

  try {
    const result = await chatInferenceService.infer(
      id,
      ((body as Record<string, unknown>).message as string).trim(),
    );
    res.json(result);
  } catch (error) {
    if (!(error instanceof ChatInferenceError)) {
      res.status(500).json({ error: 'Failed to run chat inference' });
      return;
    }

    const errors: Record<ChatInferenceError['code'], { status: number; error: string }> = {
      CHAT_NOT_FOUND: { status: 404, error: 'Chat not found' },
      CHAT_CONNECTION_NOT_SELECTED: {
        status: 409,
        error: 'Chat has no selected model connection',
      },
      CHAT_MODEL_NOT_SELECTED: { status: 409, error: 'Chat has no selected model' },
      CONNECTION_NOT_FOUND: { status: 404, error: 'Connection not found' },
      CONNECTION_DISABLED: { status: 409, error: 'Connection is disabled' },
      MODEL_SERVER_UNREACHABLE: { status: 502, error: 'Model server is unreachable' },
      MODEL_SERVER_TIMEOUT: { status: 504, error: 'Model server request timed out' },
      MODEL_SERVER_RESPONSE_ERROR: { status: 502, error: 'Model server request failed' },
      MODEL_SERVER_INVALID_RESPONSE: { status: 502, error: 'Invalid model server response' },
    };
    const mapped = errors[error.code];
    res.status(mapped.status).json({ error: mapped.error });
  }
});

// Chat API endpoint
app.post('/api/chat', (req: Request, res: Response) => {
  const body = req.body;

  if (!body || typeof body.message !== 'string') {
    res.status(400).json({ error: 'Invalid request: message must be a non-empty string' });
    return;
  }

  const trimmed = body.message.trim();

  if (trimmed.length === 0) {
    res.status(400).json({ error: 'Invalid request: message must be a non-empty string' });
    return;
  }

  res.json({ message: `Stub response: ${trimmed}` });
});

// Basic route to serve chat UI
app.get('/chat', (_req, res) => {
  res.sendFile(path.join(clientRoot, 'index.html'));
});

// Settings route serves the same SPA
app.get('/settings', (_req, res) => {
  res.sendFile(path.join(clientRoot, 'index.html'));
});

// Default route
app.get('/', (req, res) => {
  res.redirect('/chat');
});

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

export default app;
