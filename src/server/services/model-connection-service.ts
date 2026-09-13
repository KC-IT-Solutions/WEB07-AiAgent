import type {
  ModelConnection,
  CreateModelConnectionInput,
  ModelVisibilityConfiguration,
  ModelVisibilityEditor,
  EffectiveModel,
  ModelDescriptionConfiguration,
  ModelDescriptions,
} from '../model-connection-types.js';
import { MAX_MODEL_DESCRIPTION_LENGTH } from '../model-connection-types.js';
import type { ModelConnectionRepository } from '../repositories/model-connection-repository.js';
import {
  testConnection as testProviderConnection,
  type TestConnectionRequest,
  type TestConnectionResponse,
} from '../../services/model-connection.js';
import type { StructuredLogger } from '../logging/logger.js';
import {
  ModelCredentialCipher,
  ModelCredentialCipherError,
} from './model-credential-cipher.js';

const SERVER_USER_ID = 1;
const DEFAULT_TIMEOUT_MINUTES = 30;
type ModelConnectionSaveOperation = 'create' | 'update';
type ModelConnectionSaveStage =
  | 'credential_configuration'
  | 'credential_encryption'
  | 'repository';

export class ModelVisibilityError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'MODEL_NOT_AVAILABLE') {
    super(code);
    this.name = 'ModelVisibilityError';
  }
}

export class ModelDescriptionError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'MODEL_NOT_AVAILABLE') {
    super(code);
    this.name = 'ModelDescriptionError';
  }
}

export class ModelConnectionService {
  private readonly repository: ModelConnectionRepository;
  private readonly credentialCipher: ModelCredentialCipher;

  constructor(
    repository: ModelConnectionRepository,
    encryptionKey = process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY,
    private readonly logger?: Pick<StructuredLogger, 'application'>,
  ) {
    this.repository = repository;
    this.credentialCipher = new ModelCredentialCipher(encryptionKey);
  }

  async createConnection(input: CreateModelConnectionInput): Promise<ModelConnection> {
    const apiKey = input.apiKey?.trim();
    let credential;
    try {
      credential = apiKey ? this.credentialCipher.encrypt(apiKey) : undefined;
    } catch (error) {
      await this.logSaveFailure('create', null, 'credential_encryption', error);
      throw error;
    }
    try {
      return await this.repository.create(SERVER_USER_ID, input, credential);
    } catch (error) {
      await this.logSaveFailure('create', null, 'repository', error);
      throw error;
    }
  }

  async updateConnection(
    id: number,
    input: CreateModelConnectionInput,
  ): Promise<ModelConnection | null> {
    const apiKey = input.apiKey?.trim();
    let credential;
    try {
      credential = apiKey ? this.credentialCipher.encrypt(apiKey) : undefined;
    } catch (error) {
      await this.logSaveFailure('update', id, 'credential_encryption', error);
      throw error;
    }
    try {
      return await this.repository.update(SERVER_USER_ID, id, input, credential);
    } catch (error) {
      await this.logSaveFailure('update', id, 'repository', error);
      throw error;
    }
  }

  async deleteConnection(id: number): Promise<boolean> {
    return this.repository.delete(SERVER_USER_ID, id);
  }

  async listConnections(): Promise<ModelConnection[]> {
    return this.repository.listByUserId(SERVER_USER_ID);
  }

  async getConnectionById(id: number): Promise<ModelConnection | null> {
    return this.repository.getById(SERVER_USER_ID, id);
  }

  async getConnectionForInference(
    id: number,
  ): Promise<{ connection: ModelConnection; apiKey?: string } | null> {
    const connection = await this.repository.getById(SERVER_USER_ID, id);
    if (!connection) {
      return null;
    }

    const credential = await this.repository.getCredential(SERVER_USER_ID, id);
    return {
      connection,
      ...(credential ? { apiKey: this.credentialCipher.decrypt(credential) } : {}),
    };
  }

  async testConnection(
    input: TestConnectionRequest,
    connectionId?: number,
  ): Promise<TestConnectionResponse | null> {
    let apiKey = input.apiKey?.trim();
    if (!apiKey && connectionId !== undefined) {
      const resolved = await this.getConnectionForInference(connectionId);
      if (!resolved) {
        return null;
      }
      apiKey = resolved.apiKey;
    }

    return testProviderConnection(
      input.baseUrl,
      apiKey,
      input.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES,
    );
  }

  async discoverAllModels(id: number): Promise<string[] | null> {
    const resolved = await this.getConnectionForInference(id);

    if (!resolved) {
      return null;
    }

    const result = await testProviderConnection(
      resolved.connection.data.baseUrl,
      resolved.apiKey,
      resolved.connection.data.timeoutMinutes,
    );

    if (!result.connected) {
      throw new Error('Model discovery failed');
    }

    return [...new Set(result.models.filter((modelId) => modelId.trim().length > 0))].sort(
      (left, right) => left.localeCompare(right),
    );
  }

  async discoverModels(id: number): Promise<string[] | null> {
    const models = await this.discoverEffectiveModels(id);
    return models?.map((model) => model.id) ?? null;
  }

  async discoverEffectiveModels(id: number): Promise<EffectiveModel[] | null> {
    const connection = await this.getConnectionById(id);
    if (!connection) {
      return null;
    }
    const discoveredModels = await this.discoverAllModels(id);
    if (!discoveredModels) return null;
    const visibleModelIds = new Set(connection.data.visibleModelIds);
    return discoveredModels
      .filter((modelId) => !connection.data.filterConfigured || visibleModelIds.has(modelId))
      .map((modelId) => ({
        id: modelId,
        description: connection.data.modelDescriptions[modelId] ?? null,
      }));
  }

  async isModelVisible(id: number, modelId: string): Promise<boolean | null> {
    const connection = await this.getConnectionById(id);
    if (!connection) {
      return null;
    }
    if (
      connection.data.filterConfigured &&
      !connection.data.visibleModelIds.includes(modelId)
    ) {
      return false;
    }
    const models = await this.discoverAllModels(id);
    return models === null ? null : models.includes(modelId);
  }

  async getModelVisibility(id: number): Promise<ModelVisibilityEditor | null> {
    const connection = await this.getConnectionById(id);
    if (!connection) {
      return null;
    }
    const discoveredModels = await this.discoverAllModels(id);
    if (!discoveredModels) {
      return null;
    }
    return {
      connectionId: id,
      filterConfigured: connection.data.filterConfigured,
      visibleModelIds: [...connection.data.visibleModelIds],
      discoveredModels,
      modelDescriptions: { ...connection.data.modelDescriptions },
    };
  }

  async updateModelVisibility(
    id: number,
    value: unknown,
  ): Promise<ModelVisibilityConfiguration | null> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new ModelVisibilityError('INVALID_INPUT');
    }
    const input = value as Record<string, unknown>;
    const fields = Object.keys(input);
    if (
      fields.length !== 2 ||
      !fields.includes('filterConfigured') ||
      !fields.includes('visibleModelIds') ||
      typeof input.filterConfigured !== 'boolean' ||
      !Array.isArray(input.visibleModelIds)
    ) {
      throw new ModelVisibilityError('INVALID_INPUT');
    }
    const visibleModelIds: string[] = [];
    const seen = new Set<string>();
    for (const modelId of input.visibleModelIds) {
      if (typeof modelId !== 'string' || modelId.trim().length === 0 || seen.has(modelId)) {
        throw new ModelVisibilityError('INVALID_INPUT');
      }
      seen.add(modelId);
      visibleModelIds.push(modelId);
    }
    if (!input.filterConfigured && visibleModelIds.length > 0) {
      throw new ModelVisibilityError('INVALID_INPUT');
    }

    const connection = await this.getConnectionById(id);
    if (!connection) {
      return null;
    }
    if (input.filterConfigured) {
      const discoveredModels = await this.discoverAllModels(id);
      if (!discoveredModels) {
        return null;
      }
      const permittedIds = new Set([
        ...discoveredModels,
        ...(connection.data.filterConfigured ? connection.data.visibleModelIds : []),
      ]);
      if (visibleModelIds.some((modelId) => !permittedIds.has(modelId))) {
        throw new ModelVisibilityError('MODEL_NOT_AVAILABLE');
      }
    }
    const updated = await this.repository.updateModelVisibility(
      SERVER_USER_ID,
      id,
      input.filterConfigured,
      visibleModelIds,
    );
    return updated
      ? {
          connectionId: id,
          filterConfigured: updated.data.filterConfigured,
          visibleModelIds: [...updated.data.visibleModelIds],
        }
      : null;
  }

  async updateModelDescriptions(
    id: number,
    value: unknown,
  ): Promise<ModelDescriptionConfiguration | null> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new ModelDescriptionError('INVALID_INPUT');
    }
    const input = value as Record<string, unknown>;
    const fields = Object.keys(input);
    if (
      fields.length !== 1 ||
      !fields.includes('modelDescriptions') ||
      typeof input.modelDescriptions !== 'object' ||
      input.modelDescriptions === null ||
      Array.isArray(input.modelDescriptions)
    ) {
      throw new ModelDescriptionError('INVALID_INPUT');
    }

    const modelDescriptionEntries: Array<[string, string]> = [];
    for (const [modelId, value] of Object.entries(input.modelDescriptions)) {
      if (modelId.trim().length === 0 || typeof value !== 'string') {
        throw new ModelDescriptionError('INVALID_INPUT');
      }
      const description = value.trim();
      if (description.length > MAX_MODEL_DESCRIPTION_LENGTH) {
        throw new ModelDescriptionError('INVALID_INPUT');
      }
      if (description.length > 0) modelDescriptionEntries.push([modelId, description]);
    }
    const modelDescriptions: ModelDescriptions = Object.fromEntries(modelDescriptionEntries);

    const connection = await this.getConnectionById(id);
    if (!connection) return null;
    const discoveredModels = await this.discoverAllModels(id);
    if (!discoveredModels) return null;
    const permittedIds = new Set([
      ...discoveredModels,
      ...connection.data.visibleModelIds,
      ...Object.keys(connection.data.modelDescriptions),
    ]);
    if (Object.keys(modelDescriptions).some((modelId) => !permittedIds.has(modelId))) {
      throw new ModelDescriptionError('MODEL_NOT_AVAILABLE');
    }

    const updated = await this.repository.updateModelDescriptions(
      SERVER_USER_ID,
      id,
      modelDescriptions,
    );
    return updated
      ? { connectionId: id, modelDescriptions: { ...updated.data.modelDescriptions } }
      : null;
  }

  private async logSaveFailure(
    operation: ModelConnectionSaveOperation,
    connectionId: number | null,
    stage: ModelConnectionSaveStage,
    error: unknown,
  ): Promise<void> {
    const credentialError = error instanceof ModelCredentialCipherError ? error : null;
    try {
      await this.logger?.application('error', 'model_connection_save_failed', {
        operation,
        connectionId,
        stage: credentialError ? 'credential_configuration' : stage,
        errorCode:
          credentialError?.code ??
          (stage === 'repository'
            ? 'MODEL_CONNECTION_PERSISTENCE_FAILED'
            : 'MODEL_CONNECTION_CREDENTIAL_ENCRYPTION_FAILED'),
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    } catch {
      // Logging failure must not replace the connection save error.
    }
  }
}
