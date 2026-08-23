import type { ModelConnection, CreateModelConnectionInput } from '../model-connection-types.js';
import type { ModelConnectionRepository } from '../repositories/model-connection-repository.js';
import { testConnection } from '../../services/model-connection.js';

const SERVER_USER_ID = 1;

export class ModelConnectionService {
  private readonly repository: ModelConnectionRepository;

  constructor(repository: ModelConnectionRepository) {
    this.repository = repository;
  }

  async createConnection(input: CreateModelConnectionInput): Promise<ModelConnection> {
    return this.repository.create(SERVER_USER_ID, input);
  }

  async updateConnection(
    id: number,
    input: CreateModelConnectionInput,
  ): Promise<ModelConnection | null> {
    return this.repository.update(SERVER_USER_ID, id, input);
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

  async discoverModels(id: number): Promise<string[] | null> {
    const connection = await this.repository.getById(SERVER_USER_ID, id);

    if (!connection) {
      return null;
    }

    const result = await testConnection(
      connection.data.baseUrl,
      undefined,
      connection.data.timeoutMinutes,
    );

    if (!result.connected) {
      throw new Error('Model discovery failed');
    }

    return [...new Set(result.models)].sort((left, right) => left.localeCompare(right));
  }
}
