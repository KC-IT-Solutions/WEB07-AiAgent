import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import path from 'node:path';
import { readFile as readTextFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './server/database.js';
import { ModelConnectionRepository } from './server/repositories/model-connection-repository.js';
import {
  ModelConnectionService,
  ModelDescriptionError,
  ModelVisibilityError,
} from './server/services/model-connection-service.js';
import type { CreateModelConnectionInput, ModelConnection } from './server/model-connection-types.js';
import { ChatRepository } from './server/repositories/chat-repository.js';
import { ChatSelectionError, ChatService } from './server/services/chat-service.js';
import type { CreateChatInput, UpdateChatInput } from './server/chat-types.js';
import {
  ChatInferenceError,
  ChatInferenceService,
} from './server/services/chat-inference-service.js';
import { FileChatMessageStore } from './server/stores/chat-message-store.js';
import { ToolSettingsRepository } from './server/repositories/tool-settings-repository.js';
import {
  ToolSettingsError,
  ToolSettingsService,
} from './server/services/tool-settings-service.js';
import { DuckDuckGoSearchTool } from './server/tools/duckduckgo-search-tool.js';
import { ToolRegistry } from './server/tools/tool-registry.js';
import { VisitWebsiteTool } from './server/tools/visit-website-tool.js';
import { FredDataTool } from './server/tools/fred-data-tool.js';
import { YahooFinanceDataTool } from './server/tools/yahoo-finance-data-tool.js';
import { RunAgentTool } from './server/tools/run-agent-tool.js';
import { ChatSettingsRepository } from './server/repositories/chat-settings-repository.js';
import {
  ChatSettingsError,
  ChatSettingsService,
} from './server/services/chat-settings-service.js';
import { SystemSettingsRepository } from './server/repositories/system-settings-repository.js';
import {
  SystemSettingsError,
  SystemSettingsService,
} from './server/services/system-settings-service.js';
import { StructuredLogger, type LogStream } from './server/logging/logger.js';
import { formatReadableLog } from './server/logging/log-formatter.js';
import { AuthorizationService } from './server/services/authorization-service.js';
import { SkillRepository } from './server/repositories/skill-repository.js';
import { SkillToolRepository } from './server/repositories/skill-tool-repository.js';
import { FileSkillContentStore } from './server/stores/skill-content-store.js';
import { SkillError, SkillService } from './server/services/skill-service.js';
import { ChatSkillRepository } from './server/repositories/chat-skill-repository.js';
import {
  ChatCommandError,
  ChatCommandService,
} from './server/services/chat-command-service.js';
import { ProjectRepository } from './server/repositories/project-repository.js';
import { FileProjectRootStore } from './server/stores/project-root-store.js';
import { ProjectError, ProjectService } from './server/services/project-service.js';
import { FileProjectFilesystemStore } from './server/stores/project-filesystem-store.js';
import {
  DEFAULT_PROJECT_FILE_UPLOAD_MAX_BYTES,
  ProjectFilesystemError,
  ProjectFilesystemService,
} from './server/services/project-filesystem-service.js';
import { AgentRepository } from './server/repositories/agent-repository.js';
import { AgentError, AgentService } from './server/services/agent-service.js';
import { AgentRunRepository } from './server/repositories/agent-run-repository.js';
import { AgentRunError, AgentRunService } from './server/services/agent-run-service.js';
import { ModelConnectionInferenceQueue } from './server/services/model-connection-inference-queue.js';
import { LmStudioModelLifecycleService } from './server/services/lm-studio-model-lifecycle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const clientRoot = path.join(__dirname, 'client');
const chatHistoryRoot = process.env.CHAT_HISTORY_PATH || path.resolve('data', 'chat-history');
const skillContentRoot = process.env.SKILL_CONTENT_PATH || path.resolve('data', 'skills');
const projectsRoot =
  process.env.PROJECTS_PATH || process.env.PROJECTS_ROOT || path.resolve('data', 'projects');
const logRoot = process.env.LOG_DIRECTORY || path.resolve('data', 'logs');
const configuredProjectUploadMaxBytes = Number(process.env.PROJECT_FILE_UPLOAD_MAX_BYTES);
const projectUploadMaxBytes =
  Number.isSafeInteger(configuredProjectUploadMaxBytes) && configuredProjectUploadMaxBytes > 0
    ? configuredProjectUploadMaxBytes
    : DEFAULT_PROJECT_FILE_UPLOAD_MAX_BYTES;
const projectUploadBodyParser = express.raw({
  type: 'application/octet-stream',
  limit: projectUploadMaxBytes,
});

// Parse JSON request bodies
app.use(express.json());

// Serve static files from the src/client directory
app.use(express.static(clientRoot));

const DEFAULT_TIMEOUT_MINUTES = 30;

const CHAT_INFERENCE_ERRORS: Record<
  ChatInferenceError['code'],
  { status: number; error: string }
> = {
  CHAT_NOT_FOUND: { status: 404, error: 'Chat not found' },
  CHAT_CONNECTION_NOT_SELECTED: {
    status: 409,
    error: 'Chat has no selected model connection',
  },
  CHAT_MODEL_NOT_SELECTED: { status: 409, error: 'Chat has no selected model' },
  CONNECTION_NOT_FOUND: { status: 404, error: 'Connection not found' },
  CONNECTION_DISABLED: { status: 409, error: 'Connection is disabled' },
  MODEL_NOT_ALLOWED: { status: 409, error: 'Model is not allowed for this connection' },
  MODEL_SERVER_UNREACHABLE: { status: 502, error: 'Model server is unreachable' },
  MODEL_SERVER_TIMEOUT: { status: 504, error: 'Model server request timed out' },
  MODEL_SERVER_RESPONSE_ERROR: { status: 502, error: 'Model server request failed' },
  MODEL_SERVER_INVALID_RESPONSE: { status: 502, error: 'Invalid model server response' },
  TOOL_CALL_REJECTED: { status: 400, error: 'Model requested an unsupported tool call' },
  TOOL_EXECUTION_FAILED: { status: 502, error: 'Tool execution failed' },
  SKILL_CONTENT_UNAVAILABLE: { status: 500, error: 'Skill inference configuration is invalid' },
  SKILL_DATA_INVALID: { status: 500, error: 'Skill inference configuration is invalid' },
  SKILL_REQUIRED_TOOL_MISSING: { status: 500, error: 'Skill inference configuration is invalid' },
  CHAT_PERSISTENCE_FAILED: { status: 500, error: 'Failed to store chat response' },
};

// Initialize database (runs migrations) and wire the persistence boundary
let db: ReturnType<typeof getDatabase>;
try {
  db = getDatabase();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      event: 'database_bootstrap_failed',
      error: error instanceof Error ? error.message : 'Unknown database bootstrap error',
    })}\n`,
  );
  throw error;
}
const systemSettingsRepository = new SystemSettingsRepository(db);
const initialLoggingSettings = await new SystemSettingsService(
  systemSettingsRepository,
).getLoggingSettings();
const logger = new StructuredLogger(logRoot, initialLoggingSettings.level, {
  application: initialLoggingSettings.applicationLogEnabled,
  'model-inference': initialLoggingSettings.modelInferenceLogEnabled,
});
try {
  await logger.initialize(initialLoggingSettings.clearLogsOnStartup);
} catch (error) {
  process.stderr.write(
    `[logger] initialization failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
}
const systemSettingsService = new SystemSettingsService(systemSettingsRepository, logger);
const authorizationService = new AuthorizationService(() => {
  const configured = Number(process.env.DEFAULT_USER_ID ?? 1);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : 1;
});
const projectRepository = new ProjectRepository(db);
const projectRootStore = new FileProjectRootStore(projectsRoot);
const currentUserId = () => authorizationService.getCurrentUserId();
const projectService = new ProjectService(
  projectRepository,
  projectRootStore,
  currentUserId,
);
const projectFilesystemService = new ProjectFilesystemService(
  projectRepository,
  new FileProjectFilesystemStore(projectRootStore),
  currentUserId,
  projectUploadMaxBytes,
);
const modelConnectionService = new ModelConnectionService(
  new ModelConnectionRepository(db),
  process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY,
  logger,
);
const chatSettingsService = new ChatSettingsService(
  new ChatSettingsRepository(db),
  modelConnectionService,
);
const chatService = new ChatService(
  new ChatRepository(db),
  new FileChatMessageStore(chatHistoryRoot),
  chatSettingsService,
  modelConnectionService,
);

async function logModelConnectionValidationFailure(
  operation: 'create' | 'update',
  connectionId: number | null,
): Promise<void> {
  try {
    await logger.application('warn', 'model_connection_save_failed', {
      operation,
      connectionId,
      stage: 'validation',
      errorCode: 'MODEL_CONNECTION_VALIDATION_FAILED',
      errorName: 'ValidationError',
    });
  } catch {
    // Logging failure must not replace the validation response.
  }
}
const toolRegistry = new ToolRegistry([
  new DuckDuckGoSearchTool(fetch, undefined, logger),
  new VisitWebsiteTool(fetch, undefined, logger),
  new FredDataTool(),
  new YahooFinanceDataTool(),
  new RunAgentTool(),
]);
const toolSettingsService = new ToolSettingsService(
  new ToolSettingsRepository(db),
  toolRegistry,
);
const skillToolRepository = new SkillToolRepository(db);
const skillContentStore = new FileSkillContentStore(skillContentRoot);
const chatSkillRepository = new ChatSkillRepository(db);
const skillService = new SkillService(
  new SkillRepository(db),
  skillToolRepository,
  skillContentStore,
  toolRegistry,
  logger,
);
const agentRepository = new AgentRepository(db);
const agentRunRepository = new AgentRunRepository(db);
const inferenceQueue = new ModelConnectionInferenceQueue();
const lmStudioModelLifecycleService = new LmStudioModelLifecycleService();
const agentService = new AgentService(
  agentRepository,
  projectRepository,
  modelConnectionService,
  skillService,
  toolRegistry,
  currentUserId,
  agentRunRepository,
);
const agentRunService = new AgentRunService(
  agentRunRepository,
  agentRepository,
  projectFilesystemService,
  modelConnectionService,
  inferenceQueue,
  currentUserId,
  undefined,
  skillService,
  toolRegistry,
  toolSettingsService,
  logger,
  lmStudioModelLifecycleService,
);
agentRunService.normalizeInterruptedRuns();
const chatCommandService = new ChatCommandService(
  chatService,
  skillService,
  chatSkillRepository,
);
const chatInferenceService = new ChatInferenceService(
  chatService,
  modelConnectionService,
  toolSettingsService,
  toolRegistry,
  undefined,
  logger,
  chatSkillRepository,
  skillToolRepository,
  skillContentStore,
  undefined,
  inferenceQueue,
);
await logger.application('info', 'server_bootstrapped', {
  logLevel: initialLoggingSettings.level,
  clearedManagedLogs: initialLoggingSettings.clearLogsOnStartup,
});

app.get('/api/me', (_req, res: Response) => {
  res.json(authorizationService.getCurrentUserCapabilities());
});

function getProjectId(req: Request, res: Response): number | null {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid project id' });
    return null;
  }
  return id;
}

function getPositiveRouteId(req: Request, name: string, res: Response): number | null {
  const value = Number(req.params[name]);
  if (!Number.isSafeInteger(value) || value <= 0) {
    res.status(400).json({ error: `Invalid ${name}` });
    return null;
  }
  return value;
}

function sendAgentError(res: Response, error: unknown): void {
  if (error instanceof AgentError) {
    const status =
      error.code === 'PERSISTENCE_FAILED'
        ? 500
        : error.code === 'ACTIVE_RUN_EXISTS'
          ? 409
          : 400;
    res.status(status).json({ error: error.code });
    return;
  }
  res.status(500).json({ error: 'PERSISTENCE_FAILED' });
}

function sendAgentRunError(res: Response, error: unknown): void {
  if (error instanceof AgentRunError) {
    const status =
      error.code === 'AGENT_NOT_FOUND' || error.code === 'RUN_NOT_FOUND'
        ? 404
        : error.code === 'ACTIVE_RUN_EXISTS' || error.code === 'INVALID_TRANSITION'
          ? 409
          : error.code === 'PERSISTENCE_FAILED'
            ? 500
            : 400;
    res.status(status).json({ error: error.code });
    return;
  }
  res.status(500).json({ error: 'PERSISTENCE_FAILED' });
}

function sendProjectError(res: Response, error: unknown): void {
  if (error instanceof ProjectError && error.code === 'INVALID_INPUT') {
    res.status(400).json({ error: 'Invalid project' });
    return;
  }
  res.status(500).json({ error: 'Project operation failed' });
}

const PROJECT_FILESYSTEM_ERRORS: Record<
  ProjectFilesystemError['code'],
  { status: number; error: string }
> = {
  PROJECT_NOT_FOUND: { status: 404, error: 'Project not found' },
  PROJECT_FILE_NOT_FOUND: { status: 404, error: 'Project file not found' },
  PROJECT_PATH_INVALID: { status: 400, error: 'Invalid project path' },
  PROJECT_PATH_ESCAPE: { status: 400, error: 'Project path escapes its boundary' },
  PROJECT_FILE_TOO_LARGE: { status: 413, error: 'Project file is too large' },
  PROJECT_FILE_CONFLICT: { status: 409, error: 'Project file already exists' },
  PROJECT_FILE_UNSUPPORTED: { status: 415, error: 'Project file is unsupported' },
  PROJECT_FILESYSTEM_FAILED: { status: 500, error: 'Project filesystem operation failed' },
};

function sendProjectFilesystemError(res: Response, error: unknown): void {
  if (error instanceof ProjectFilesystemError) {
    const response = PROJECT_FILESYSTEM_ERRORS[error.code];
    res.status(response.status).json({ error: response.error, code: error.code });
    return;
  }
  res.status(500).json({
    error: PROJECT_FILESYSTEM_ERRORS.PROJECT_FILESYSTEM_FAILED.error,
    code: 'PROJECT_FILESYSTEM_FAILED',
  });
}

function createAttachmentDisposition(filename: string): string {
  const fallback =
    filename
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/["\\;]/g, '_')
      .trim() || 'download';
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

app.get('/api/projects', async (_req, res: Response) => {
  try {
    res.json(await projectService.list());
  } catch (error) {
    sendProjectError(res, error);
  }
});

app.post('/api/projects', async (req: Request, res: Response) => {
  try {
    res.status(201).json(await projectService.create(req.body as unknown));
  } catch (error) {
    sendProjectError(res, error);
  }
});

app.get('/api/projects/:id', async (req: Request, res: Response) => {
  const id = getProjectId(req, res);
  if (id === null) {
    return;
  }
  try {
    const project = await projectService.get(id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (error) {
    sendProjectError(res, error);
  }
});

app.put('/api/projects/:id', async (req: Request, res: Response) => {
  const id = getProjectId(req, res);
  if (id === null) {
    return;
  }
  try {
    const project = await projectService.update(id, req.body as unknown);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (error) {
    sendProjectError(res, error);
  }
});

app.delete('/api/projects/:id', async (req: Request, res: Response) => {
  const id = getProjectId(req, res);
  if (id === null) {
    return;
  }
  try {
    if (!(await projectService.delete(id))) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    sendProjectError(res, error);
  }
});

app.get('/api/projects/:projectId/agents', async (req: Request, res: Response) => {
  const projectId = getPositiveRouteId(req, 'projectId', res);
  if (projectId === null) return;
  try {
    const agents = await agentService.list(projectId);
    if (!agents) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(agents);
  } catch (error) {
    sendAgentError(res, error);
  }
});

app.post('/api/projects/:projectId/agents', async (req: Request, res: Response) => {
  const projectId = getPositiveRouteId(req, 'projectId', res);
  if (projectId === null) return;
  try {
    const agent = await agentService.create(projectId, req.body as unknown);
    if (!agent) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.status(201).json(agent);
  } catch (error) {
    sendAgentError(res, error);
  }
});

app.put('/api/projects/:projectId/agents/order', async (req: Request, res: Response) => {
  const projectId = getPositiveRouteId(req, 'projectId', res);
  if (projectId === null) return;
  try {
    const agents = await agentService.reorder(projectId, req.body as unknown);
    if (!agents) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(agents);
  } catch (error) {
    sendAgentError(res, error);
  }
});

app.get('/api/projects/:projectId/agents/:agentId', async (req: Request, res: Response) => {
  const projectId = getPositiveRouteId(req, 'projectId', res);
  const agentId = getPositiveRouteId(req, 'agentId', res);
  if (projectId === null || agentId === null) return;
  try {
    const agent = await agentService.get(projectId, agentId);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(agent);
  } catch (error) {
    sendAgentError(res, error);
  }
});

app.post('/api/projects/:projectId/agents/:agentId/copy', async (req: Request, res: Response) => {
  const projectId = getPositiveRouteId(req, 'projectId', res);
  const agentId = getPositiveRouteId(req, 'agentId', res);
  if (projectId === null || agentId === null) return;
  try {
    const agent = await agentService.copy(projectId, agentId);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.status(201).json(agent);
  } catch (error) {
    sendAgentError(res, error);
  }
});

app.put('/api/projects/:projectId/agents/:agentId', async (req: Request, res: Response) => {
  const projectId = getPositiveRouteId(req, 'projectId', res);
  const agentId = getPositiveRouteId(req, 'agentId', res);
  if (projectId === null || agentId === null) return;
  try {
    const agent = await agentService.update(projectId, agentId, req.body as unknown);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(agent);
  } catch (error) {
    sendAgentError(res, error);
  }
});

app.delete('/api/projects/:projectId/agents/:agentId', async (req: Request, res: Response) => {
  const projectId = getPositiveRouteId(req, 'projectId', res);
  const agentId = getPositiveRouteId(req, 'agentId', res);
  if (projectId === null || agentId === null) return;
  try {
    if (!(await agentService.delete(projectId, agentId))) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    sendAgentError(res, error);
  }
});

app.post('/api/projects/:projectId/agents/:agentId/runs', async (req: Request, res: Response) => {
  const projectId = getPositiveRouteId(req, 'projectId', res);
  const agentId = getPositiveRouteId(req, 'agentId', res);
  if (projectId === null || agentId === null) return;
  try {
    res.status(201).json(await agentRunService.start(projectId, agentId));
  } catch (error) {
    sendAgentRunError(res, error);
  }
});

app.delete('/api/projects/:projectId/agents/:agentId/runs', (req: Request, res: Response) => {
  const projectId = getPositiveRouteId(req, 'projectId', res);
  const agentId = getPositiveRouteId(req, 'agentId', res);
  if (projectId === null || agentId === null) return;
  try {
    res.json({ deletedRuns: agentRunService.clear(projectId, agentId) });
  } catch (error) {
    sendAgentRunError(res, error);
  }
});

app.get('/api/projects/:projectId/agents/:agentId/runs/latest', async (req: Request, res: Response) => {
  const projectId = getPositiveRouteId(req, 'projectId', res);
  const agentId = getPositiveRouteId(req, 'agentId', res);
  if (projectId === null || agentId === null) return;
  try {
    const ownedAgent = await agentService.get(projectId, agentId);
    if (!ownedAgent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(agentRunService.latest(projectId, agentId));
  } catch (error) {
    sendAgentRunError(res, error);
  }
});

app.get('/api/projects/:projectId/agents/:agentId/errors', async (req: Request, res: Response) => {
  const projectId = getPositiveRouteId(req, 'projectId', res);
  const agentId = getPositiveRouteId(req, 'agentId', res);
  if (projectId === null || agentId === null) return;
  try {
    const errors = agentRunService.errors(projectId, agentId);
    if (!errors) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(errors);
  } catch (error) {
    sendAgentRunError(res, error);
  }
});

app.get('/api/projects/:projectId/agents/:agentId/runs/:runId', (req: Request, res: Response) => {
  const projectId = getPositiveRouteId(req, 'projectId', res);
  const agentId = getPositiveRouteId(req, 'agentId', res);
  const runId = getPositiveRouteId(req, 'runId', res);
  if (projectId === null || agentId === null || runId === null) return;
  try {
    const run = agentRunService.get(projectId, agentId, runId);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }
    res.json(run);
  } catch (error) {
    sendAgentRunError(res, error);
  }
});

app.get(
  '/api/projects/:projectId/agents/:agentId/runs/:runId/events',
  (req: Request, res: Response) => {
    const projectId = getPositiveRouteId(req, 'projectId', res);
    const agentId = getPositiveRouteId(req, 'agentId', res);
    const runId = getPositiveRouteId(req, 'runId', res);
    if (projectId === null || agentId === null || runId === null) return;
    try {
      const events = agentRunService.events(projectId, agentId, runId);
      if (!events) {
        res.status(404).json({ error: 'Run not found' });
        return;
      }
      res.json(events);
    } catch (error) {
      sendAgentRunError(res, error);
    }
  },
);

app.get(
  '/api/projects/:projectId/agents/:agentId/runs/:runId/execution',
  (req: Request, res: Response) => {
    const projectId = getPositiveRouteId(req, 'projectId', res);
    const agentId = getPositiveRouteId(req, 'agentId', res);
    const runId = getPositiveRouteId(req, 'runId', res);
    if (projectId === null || agentId === null || runId === null) return;
    try {
      const events = agentRunService.execution(projectId, agentId, runId);
      if (!events) {
        res.status(404).json({ error: 'Run not found' });
        return;
      }
      res.json(events);
    } catch (error) {
      sendAgentRunError(res, error);
    }
  },
);

for (const action of ['pause', 'resume', 'cancel'] as const) {
  app.post(
    `/api/projects/:projectId/agents/:agentId/runs/:runId/${action}`,
    (req: Request, res: Response) => {
      const projectId = getPositiveRouteId(req, 'projectId', res);
      const agentId = getPositiveRouteId(req, 'agentId', res);
      const runId = getPositiveRouteId(req, 'runId', res);
      if (projectId === null || agentId === null || runId === null) return;
      try {
        res.json(agentRunService[action](projectId, agentId, runId));
      } catch (error) {
        sendAgentRunError(res, error);
      }
    },
  );
}

app.get('/api/projects/:id/files', async (req: Request, res: Response) => {
  const id = getProjectId(req, res);
  if (id === null) {
    return;
  }
  try {
    res.json(await projectFilesystemService.listDirectory(id, req.query.path ?? ''));
  } catch (error) {
    sendProjectFilesystemError(res, error);
  }
});

app.get('/api/projects/:id/file', async (req: Request, res: Response) => {
  const id = getProjectId(req, res);
  if (id === null) {
    return;
  }
  try {
    res.json(await projectFilesystemService.readFile(id, req.query.path));
  } catch (error) {
    sendProjectFilesystemError(res, error);
  }
});

app.post(
  '/api/projects/:id/files/upload',
  projectUploadBodyParser,
  async (req: Request, res: Response) => {
    const id = getProjectId(req, res);
    if (id === null) {
      return;
    }
    if (!req.is('application/octet-stream')) {
      sendProjectFilesystemError(
        res,
        new ProjectFilesystemError('PROJECT_FILE_UNSUPPORTED'),
      );
      return;
    }
    try {
      const content = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      res.status(201).json(
        await projectFilesystemService.uploadFile(
          id,
          req.query.directory ?? '',
          req.query.filename,
          content,
        ),
      );
    } catch (error) {
      sendProjectFilesystemError(res, error);
    }
  },
);

app.get('/api/projects/:id/files/download', async (req: Request, res: Response) => {
  const id = getProjectId(req, res);
  if (id === null) {
    return;
  }
  try {
    const download = await projectFilesystemService.openFileDownload(id, req.query.path);
    const filename = path.posix.basename(download.relativePath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', download.size);
    res.setHeader('Content-Disposition', createAttachmentDisposition(filename));
    download.stream.on('error', () => res.destroy());
    download.stream.pipe(res);
  } catch (error) {
    sendProjectFilesystemError(res, error);
  }
});

app.put('/api/projects/:id/file', async (req: Request, res: Response) => {
  const id = getProjectId(req, res);
  if (id === null) {
    return;
  }
  try {
    res.json(await projectFilesystemService.writeFile(id, req.body as unknown));
  } catch (error) {
    sendProjectFilesystemError(res, error);
  }
});

app.post('/api/projects/:id/directory', async (req: Request, res: Response) => {
  const id = getProjectId(req, res);
  if (id === null) {
    return;
  }
  try {
    res.status(201).json(await projectFilesystemService.createDirectory(id, req.body as unknown));
  } catch (error) {
    sendProjectFilesystemError(res, error);
  }
});

app.delete('/api/projects/:id/files', async (req: Request, res: Response) => {
  const id = getProjectId(req, res);
  if (id === null) {
    return;
  }
  try {
    await projectFilesystemService.deleteEntry(id, req.body as unknown);
    res.status(204).send();
  } catch (error) {
    sendProjectFilesystemError(res, error);
  }
});

app.put('/api/projects/:id/files/rename', async (req: Request, res: Response) => {
  const id = getProjectId(req, res);
  if (id === null) {
    return;
  }
  try {
    res.json(await projectFilesystemService.renameEntry(id, req.body as unknown));
  } catch (error) {
    sendProjectFilesystemError(res, error);
  }
});

app.get('/api/admin/settings/logging', async (_req, res: Response) => {
  if (!authorizationService.isCurrentUserAdmin()) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  try {
    res.json(await systemSettingsService.getLoggingSettings());
  } catch (error) {
    await logger.application('error', 'admin_logging_settings_read_failed', {
      error: error instanceof Error ? error.message : 'Unknown settings error',
    });
    res.status(500).json({ error: 'Failed to get logging settings' });
  }
});

app.put('/api/admin/settings/logging', async (req: Request, res: Response) => {
  if (!authorizationService.isCurrentUserAdmin()) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  try {
    const settings = await systemSettingsService.updateLoggingSettings(req.body as unknown);
    await logger.application('info', 'admin_logging_settings_updated', {
      logLevel: settings.level,
      applicationLogEnabled: settings.applicationLogEnabled,
      modelInferenceLogEnabled: settings.modelInferenceLogEnabled,
      clearLogsOnStartup: settings.clearLogsOnStartup,
    });
    res.json(settings);
  } catch (error) {
    if (error instanceof SystemSettingsError) {
      res.status(400).json({ error: 'Invalid logging settings' });
      return;
    }
    await logger.application('error', 'admin_logging_settings_update_failed', {
      error: error instanceof Error ? error.message : 'Unknown settings error',
    });
    res.status(500).json({ error: 'Failed to update logging settings' });
  }
});

app.get('/api/admin/settings/logging/diagnostic', (_req, res: Response) => {
  if (!authorizationService.isCurrentUserAdmin()) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json({ logDirectory: logger.rootPath, level: logger.getLevel() });
});

const ALLOWED_LOG_STREAMS = new Set<LogStream>(['application', 'model-inference']);
const LOG_DOWNLOAD_NAMES: Record<LogStream, string> = {
  application: 'application.log',
  'model-inference': 'model-inference.log',
};

async function readManagedLogFile(stream: LogStream): Promise<string | null> {
  try {
    const filePath = path.resolve(logger.rootPath, LOG_DOWNLOAD_NAMES[stream]);
    return await readTextFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

app.get('/api/admin/logs/:stream/readable', async (req: Request, res: Response) => {
  if (!requireAdmin(res)) return;
  const stream = req.params.stream;
  if (!ALLOWED_LOG_STREAMS.has(stream as LogStream)) {
    res.status(400).json({ error: 'Invalid log stream' });
    return;
  }
  try {
    const content = await readManagedLogFile(stream as LogStream);
    if (content === null) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send('');
      return;
    }
    const readable = formatReadableLog(content);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(readable);
  } catch {
    res.status(500).json({ error: 'Failed to read log' });
  }
});

app.get('/api/admin/logs/:stream/download', async (req: Request, res: Response) => {
  if (!requireAdmin(res)) return;
  const stream = req.params.stream;
  if (!ALLOWED_LOG_STREAMS.has(stream as LogStream)) {
    res.status(400).json({ error: 'Invalid log stream' });
    return;
  }
  try {
    const content = await readManagedLogFile(stream as LogStream);
    if (content === null) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${LOG_DOWNLOAD_NAMES[stream as LogStream]}"`,
      );
      res.send('');
      return;
    }
    const readable = formatReadableLog(content);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${LOG_DOWNLOAD_NAMES[stream as LogStream]}"`,
    );
    res.send(readable);
  } catch {
    res.status(500).json({ error: 'Failed to read log' });
  }
});

function requireAdmin(res: Response): boolean {
  if (authorizationService.isCurrentUserAdmin()) {
    return true;
  }
  res.status(403).json({ error: 'Forbidden' });
  return false;
}

function toPublicModelConnection(connection: ModelConnection): Omit<ModelConnection, 'data'> & {
  data: Omit<
    ModelConnection['data'],
    'filterConfigured' | 'visibleModelIds' | 'modelDescriptions'
  >;
} {
  const { name, baseUrl, timeoutMinutes, modelId, enabled } = connection.data;
  return {
    ...connection,
    data: { name, baseUrl, timeoutMinutes, modelId, enabled },
  };
}

app.get('/api/admin/model-connections/:id/model-visibility', async (req: Request, res: Response) => {
  if (!requireAdmin(res)) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid connection id' });
    return;
  }
  try {
    const visibility = await modelConnectionService.getModelVisibility(id);
    if (!visibility) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    res.json(visibility);
  } catch {
    res.status(502).json({ error: 'Failed to discover models' });
  }
});

app.put('/api/admin/model-connections/:id/model-visibility', async (req: Request, res: Response) => {
  if (!requireAdmin(res)) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid connection id' });
    return;
  }
  try {
    const visibility = await modelConnectionService.updateModelVisibility(id, req.body as unknown);
    if (!visibility) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    res.json(visibility);
  } catch (error) {
    if (error instanceof ModelVisibilityError) {
      res.status(400).json({ error: 'Invalid model visibility configuration' });
      return;
    }
    res.status(502).json({ error: 'Failed to discover models' });
  }
});

app.put('/api/admin/model-connections/:id/model-descriptions', async (req: Request, res: Response) => {
  if (!requireAdmin(res)) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid connection id' });
    return;
  }
  try {
    const descriptions = await modelConnectionService.updateModelDescriptions(
      id,
      req.body as unknown,
    );
    if (!descriptions) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    res.json(descriptions);
  } catch (error) {
    if (error instanceof ModelDescriptionError) {
      res.status(400).json({ error: 'Invalid model descriptions' });
      return;
    }
    res.status(502).json({ error: 'Failed to discover models' });
  }
});

function sendSkillError(res: Response, error: unknown): void {
  if (error instanceof SkillError) {
    if (error.code === 'DUPLICATE_COMMAND') {
      res.status(409).json({ error: 'Command name already exists' });
      return;
    }
    if (
      error.code === 'INVALID_INPUT' ||
      error.code === 'INVALID_COMMAND' ||
      error.code === 'RESERVED_COMMAND' ||
      error.code === 'UNKNOWN_TOOL'
    ) {
      res.status(400).json({ error: 'Invalid Skill' });
      return;
    }
  }
  res.status(500).json({ error: 'Skill operation failed' });
}

app.get('/api/skills', async (_req, res: Response) => {
  try {
    res.json(await skillService.listAvailable());
  } catch (error) {
    sendSkillError(res, error);
  }
});

app.get('/api/admin/skills', async (_req, res: Response) => {
  if (!requireAdmin(res)) {
    return;
  }
  try {
    res.json(await skillService.list());
  } catch (error) {
    sendSkillError(res, error);
  }
});

app.post('/api/admin/skills', async (req: Request, res: Response) => {
  if (!requireAdmin(res)) {
    return;
  }
  try {
    res.status(201).json(await skillService.create(req.body as unknown));
  } catch (error) {
    sendSkillError(res, error);
  }
});

app.get('/api/admin/skills/:id', async (req: Request, res: Response) => {
  if (!requireAdmin(res)) {
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid Skill id' });
    return;
  }
  try {
    const skill = await skillService.get(id);
    if (!skill) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    res.json(skill);
  } catch (error) {
    sendSkillError(res, error);
  }
});

app.put('/api/admin/skills/:id', async (req: Request, res: Response) => {
  if (!requireAdmin(res)) {
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid Skill id' });
    return;
  }
  try {
    const skill = await skillService.update(id, req.body as unknown);
    if (!skill) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    res.json(skill);
  } catch (error) {
    sendSkillError(res, error);
  }
});

app.delete('/api/admin/skills/:id', async (req: Request, res: Response) => {
  if (!requireAdmin(res)) {
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid Skill id' });
    return;
  }
  try {
    if (!(await skillService.delete(id))) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    sendSkillError(res, error);
  }
});

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

  if (body.apiKey !== undefined && typeof body.apiKey !== 'string') {
    res.status(400).json({
      connected: false,
      models: [],
      error: 'Invalid request: apiKey must be a string',
    });
    return;
  }

  let connectionId: number | undefined;
  if (body.connectionId !== undefined && body.connectionId !== null) {
    connectionId = Number(body.connectionId);
    if (!Number.isSafeInteger(connectionId) || connectionId <= 0) {
      res.status(400).json({
        connected: false,
        models: [],
        error: 'Invalid request: connectionId must be a positive integer',
      });
      return;
    }
  }

  let timeoutMinutes = DEFAULT_TIMEOUT_MINUTES;
  if (body.timeoutMinutes !== undefined) {
    const parsed = Number(body.timeoutMinutes);
    if (typeof parsed === 'number' && !isNaN(parsed) && parsed > 0) {
      timeoutMinutes = parsed;
    }
  }

  try {
    const result = await modelConnectionService.testConnection(
      {
        baseUrl: body.baseUrl.trim(),
        apiKey: body.apiKey,
        timeoutMinutes,
      },
      connectionId,
    );

    if (result === null) {
      res.status(404).json({ connected: false, models: [], error: 'Connection not found' });
      return;
    }

    res.json(result);
  } catch (error) {
    await logger.application('error', 'model_connection_test_failed', {
      error: error instanceof Error ? error.message : 'Unknown connection test error',
    });
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
    await logModelConnectionValidationFailure('create', null);
    res.status(400).json({ error: 'Invalid request: name is required' });
    return;
  }

  if (typeof body.baseUrl !== 'string' || !body.baseUrl.trim()) {
    await logModelConnectionValidationFailure('create', null);
    res.status(400).json({ error: 'Invalid request: baseUrl is required' });
    return;
  }

  if (body.apiKey !== undefined && typeof body.apiKey !== 'string') {
    await logModelConnectionValidationFailure('create', null);
    res.status(400).json({ error: 'Invalid request: apiKey must be a string' });
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
    apiKey: body.apiKey,
  };

  try {
    const connection = await modelConnectionService.createConnection(input);
    res.status(201).json(toPublicModelConnection(connection));
  } catch {
    res.status(500).json({ error: 'Failed to create connection' });
  }
});

// GET /api/model-connections
app.get('/api/model-connections', async (_req, res: Response) => {
  try {
    const connections = await modelConnectionService.listConnections();
    res.json(connections.map(toPublicModelConnection));
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
    const models = await modelConnectionService.discoverEffectiveModels(id);

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

    res.json(toPublicModelConnection(connection));
  } catch {
    res.status(500).json({ error: 'Failed to get connection' });
  }
});

// PUT /api/model-connections/:id
app.put('/api/model-connections/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (isNaN(id) || id <= 0) {
    await logModelConnectionValidationFailure('update', null);
    res.status(400).json({ error: 'Invalid connection id' });
    return;
  }

  const body = req.body;

  if (!body || typeof body.name !== 'string' || !body.name.trim()) {
    await logModelConnectionValidationFailure('update', id);
    res.status(400).json({ error: 'Invalid request: name is required' });
    return;
  }

  if (typeof body.baseUrl !== 'string' || !body.baseUrl.trim()) {
    await logModelConnectionValidationFailure('update', id);
    res.status(400).json({ error: 'Invalid request: baseUrl is required' });
    return;
  }

  if (body.apiKey !== undefined && typeof body.apiKey !== 'string') {
    await logModelConnectionValidationFailure('update', id);
    res.status(400).json({ error: 'Invalid request: apiKey must be a string' });
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
    apiKey: body.apiKey,
  };

  try {
    const connection = await modelConnectionService.updateConnection(id, input);

    if (!connection) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }

    res.json(toPublicModelConnection(connection));
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

app.get('/api/settings/chat', async (_req, res: Response) => {
  try {
    res.json(await chatSettingsService.getSettings());
  } catch {
    res.status(500).json({ error: 'Failed to get chat settings' });
  }
});

app.put('/api/settings/chat', async (req: Request, res: Response) => {
  const body: unknown = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Invalid chat settings' });
    return;
  }
  const values = body as Record<string, unknown>;
  const fields = Object.keys(values);
  if (
    fields.length !== 4 ||
    !fields.includes('defaultModelConnectionId') ||
    !fields.includes('defaultModelId') ||
    !fields.includes('showReasoning') ||
    !fields.includes('showToolCalls') ||
    (values.defaultModelConnectionId !== null &&
      (!Number.isInteger(values.defaultModelConnectionId) ||
        Number(values.defaultModelConnectionId) <= 0)) ||
    (values.defaultModelId !== null &&
      (typeof values.defaultModelId !== 'string' ||
        values.defaultModelId.trim().length === 0)) ||
    typeof values.showReasoning !== 'boolean' ||
    typeof values.showToolCalls !== 'boolean'
  ) {
    res.status(400).json({ error: 'Invalid chat settings' });
    return;
  }

  try {
    res.json(
      await chatSettingsService.updateSettings({
        defaultModelConnectionId: values.defaultModelConnectionId as number | null,
        defaultModelId:
          typeof values.defaultModelId === 'string' ? values.defaultModelId : null,
        showReasoning: values.showReasoning as boolean,
        showToolCalls: values.showToolCalls as boolean,
      }),
    );
  } catch (error) {
    if (error instanceof ChatSettingsError) {
      res.status(400).json({ error: 'Invalid chat settings selection' });
      return;
    }
    res.status(500).json({ error: 'Failed to update chat settings' });
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

  const input: CreateChatInput = {
    title: body.title.trim(),
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

app.get('/api/chats/:id/messages', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid chat id' });
    return;
  }

  try {
    const messages = await chatService.listMessages(id);
    if (messages === null) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }

    res.json({ messages });
  } catch {
    res.status(500).json({ error: 'Failed to get chat messages' });
  }
});

app.delete('/api/chats/:id/messages', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid chat id' });
    return;
  }
  try {
    if (!(await chatService.clearMessages(id))) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to clear chat messages' });
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
    input.modelId = typeof values.modelId === 'string' ? values.modelId : null;
  }

  try {
    const chat = await chatService.updateChat(id, input);

    if (!chat) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }

    res.json(chat);
  } catch (error) {
    if (error instanceof ChatSelectionError) {
      res.status(400).json({ error: 'Invalid chat model selection', code: error.code });
      return;
    }
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

app.get('/api/tools', async (_req, res: Response) => {
  try {
    res.json(await toolSettingsService.listTools());
  } catch {
    res.status(500).json({ error: 'Failed to list tools' });
  }
});

app.get('/api/tools/:toolName/settings', async (req: Request, res: Response) => {
  const toolName = req.params.toolName;
  if (typeof toolName !== 'string') {
    res.status(404).json({ error: 'Tool not found' });
    return;
  }
  try {
    res.json(await toolSettingsService.getSettings(toolName));
  } catch (error) {
    if (error instanceof ToolSettingsError && error.code === 'UNKNOWN_TOOL') {
      res.status(404).json({ error: 'Tool not found' });
      return;
    }
    res.status(500).json({ error: 'Failed to get tool settings' });
  }
});

app.put('/api/tools/:toolName/settings', async (req: Request, res: Response) => {
  const toolName = req.params.toolName;
  if (typeof toolName !== 'string') {
    res.status(404).json({ error: 'Tool not found' });
    return;
  }
  try {
    res.json(await toolSettingsService.updateSettings(toolName, req.body as unknown));
  } catch (error) {
    if (error instanceof ToolSettingsError) {
      const status = error.code === 'UNKNOWN_TOOL' ? 404 : 400;
      res.status(status).json({
        error: error.code === 'UNKNOWN_TOOL' ? 'Tool not found' : 'Invalid tool settings',
      });
      return;
    }
    res.status(500).json({ error: 'Failed to update tool settings' });
  }
});

function getRequiredMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const message = (body as Record<string, unknown>).message;
  if (typeof message !== 'string' || message.trim().length === 0) {
    return null;
  }
  return message.trim();
}

async function sendChatCommand(chatId: number, message: string, res: Response): Promise<void> {
  try {
    res.json(await chatCommandService.execute(chatId, message));
  } catch (error) {
    if (error instanceof ChatCommandError && error.code === 'CHAT_NOT_FOUND') {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }
    await logger.application('error', 'chat_command_failed', {
      chatId,
      error: error instanceof Error ? error.message : 'Unknown command error',
    });
    res.status(500).json({ error: 'Failed to execute chat command' });
  }
}

app.post('/api/chats/:id/commands', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid chat id' });
    return;
  }
  const message = getRequiredMessage(req.body);
  if (!message || !message.startsWith('/')) {
    res.status(400).json({ error: 'Invalid request: command must begin with /' });
    return;
  }
  await sendChatCommand(id, message, res);
});

app.post('/api/chats/:id/inference/stream', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid chat id' });
    return;
  }

  const message = getRequiredMessage(req.body);
  if (!message) {
    res.status(400).json({ error: 'Invalid request: message must be a non-empty string' });
    return;
  }
  if (message.startsWith('/')) {
    await sendChatCommand(id, message, res);
    return;
  }

  const inferenceId = randomUUID();
  let sequence = 0;
  const logStreamEvent = async (
    level: 'error' | 'info',
    event: string,
    fields: Record<string, unknown> = {},
  ): Promise<void> => {
    try {
      await logger.application(level, event, { inferenceId, chatId: id, ...fields });
    } catch {
      // Logging failures must not interrupt persistence or stream delivery.
    }
  };
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.flushHeaders();
  await logStreamEvent('info', 'inference_stream_started');
  const inferenceController = new AbortController();
  const abortInference = (): void =>
    inferenceController.abort(new DOMException('The request was cancelled', 'AbortError'));
  req.once('aborted', abortInference);
  res.once('close', abortInference);

  const writeEvent = (value: unknown): void => {
    if (!res.destroyed && !res.writableEnded) {
      res.write(`${JSON.stringify(value)}\n`);
    }
  };

  try {
    await chatInferenceService.infer(
      id,
      message,
      (event) => {
        sequence = event.sequence;
        writeEvent(event);
      },
      inferenceId,
      inferenceController.signal,
    );
    sequence += 1;
    writeEvent({ type: 'done', sequence, inferenceId });
    await logStreamEvent('info', 'inference_stream_completed', { sequence });
  } catch (error) {
    sequence += 1;
    const publicError =
      error instanceof ChatInferenceError
        ? CHAT_INFERENCE_ERRORS[error.code].error
        : 'Failed to run chat inference';
    writeEvent({ type: 'error', sequence, inferenceId, error: publicError });
    await logStreamEvent('error', 'inference_stream_failed', {
      sequence,
      error: error instanceof Error ? error.message : 'Unknown inference error',
    });
  } finally {
    req.removeListener('aborted', abortInference);
    res.removeListener('close', abortInference);
    if (!res.writableEnded) {
      res.end();
    }
  }
});

app.post('/api/chats/:id/inference', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid chat id' });
    return;
  }

  const message = getRequiredMessage(req.body);
  if (!message) {
    res.status(400).json({ error: 'Invalid request: message must be a non-empty string' });
    return;
  }
  if (message.startsWith('/')) {
    await sendChatCommand(id, message, res);
    return;
  }

  const inferenceController = new AbortController();
  const abortInference = (): void =>
    inferenceController.abort(new DOMException('The request was cancelled', 'AbortError'));
  req.once('aborted', abortInference);
  res.once('close', abortInference);
  try {
    const result = await chatInferenceService.infer(
      id,
      message,
      undefined,
      undefined,
      inferenceController.signal,
    );
    res.json(result);
  } catch (error) {
    if (!(error instanceof ChatInferenceError)) {
      await logger.application('error', 'inference_http_failure', {
        chatId: id,
        status: 500,
        error: error instanceof Error ? error.message : 'Unknown inference error',
      });
      res.status(500).json({ error: 'Failed to run chat inference' });
      return;
    }

    const mapped = CHAT_INFERENCE_ERRORS[error.code];
    res.status(mapped.status).json({ error: mapped.error });
  } finally {
    req.removeListener('aborted', abortInference);
    res.removeListener('close', abortInference);
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

app.get('/admin/settings', (_req, res) => {
  res.sendFile(path.join(clientRoot, 'index.html'));
});

app.get('/skills', (_req, res) => {
  res.sendFile(path.join(clientRoot, 'index.html'));
});

app.get('/projects', (_req, res) => {
  res.sendFile(path.join(clientRoot, 'index.html'));
});

app.get('/tools', (_req, res) => {
  res.sendFile(path.join(clientRoot, 'index.html'));
});

// Default route
app.get('/', (req, res) => {
  res.redirect('/chat');
});

app.use(
  async (error: unknown, req: Request, res: Response, _next: NextFunction): Promise<void> => {
    void _next;
    const isInvalidJson = error instanceof SyntaxError && 'body' in error;
    const isProjectUploadTooLarge =
      req.path.endsWith('/files/upload') &&
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      (error as { type?: unknown }).type === 'entity.too.large';
    const status = isProjectUploadTooLarge ? 413 : isInvalidJson ? 400 : 500;
    await logger.application(status === 400 ? 'warn' : 'error', 'http_request_failed', {
      method: req.method,
      path: req.path,
      status,
      error: error instanceof Error ? error.message : 'Unknown HTTP error',
    });
    if (isProjectUploadTooLarge) {
      res.status(status).json({
        error: PROJECT_FILESYSTEM_ERRORS.PROJECT_FILE_TOO_LARGE.error,
        code: 'PROJECT_FILE_TOO_LARGE',
      });
      return;
    }
    res.status(status).json({ error: isInvalidJson ? 'Invalid request body' : 'Request failed' });
  },
);

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  app.listen(PORT, () => {
    void logger.application('info', 'server_started', { port: Number(PORT) });
  });
}

export default app;
