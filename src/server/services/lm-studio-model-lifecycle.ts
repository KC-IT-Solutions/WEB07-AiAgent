import { Agent, type Dispatcher } from 'undici';

const OPENAI_COMPATIBLE_DISPATCHER_OPTIONS = Object.freeze({
  headersTimeout: 0,
  bodyTimeout: 0,
  connectTimeout: 60_000,
}) satisfies Agent.Options;

interface LmStudioModelInfo {
  key: string;
  loaded_instances: Array<{ id: string  }>;
}

export interface ModelUnloadResult {
  status: 'skipped' | 'completed';
  reason?: string;
}

export class LmStudioModelLifecycleService {
  private readonly dispatcher: Dispatcher;

  constructor() {
    this.dispatcher = new Agent(OPENAI_COMPATIBLE_DISPATCHER_OPTIONS);
  }

  async close(): Promise<void> {
    await this.dispatcher.close();
  }

  async unloadModel(
    baseUrl: string,
    apiKey: string | undefined,
    modelId: string,
  ): Promise<ModelUnloadResult> {
    const discoveryUrl = `${baseUrl}/api/v1/models`;
    let modelsResponse: Response;
    try {
      modelsResponse = await this.fetchWithDispatcher(discoveryUrl, {
        method: 'GET',
        headers: this.buildHeaders(apiKey),
      });
    } catch {
      return { status: 'skipped', reason: 'discovery_failed' };
    }

    if (!modelsResponse.ok) {
      return { status: 'skipped', reason: 'discovery_unavailable' };
    }

    let modelsData: unknown;
    try {
      modelsData = await modelsResponse.json();
    } catch {
      return { status: 'skipped', reason: 'discovery_malformed_response' };
    }

    if (
      typeof modelsData !== 'object' ||
      modelsData === null ||
      Array.isArray(modelsData)
    ) {
      return { status: 'skipped', reason: 'discovery_invalid_format' };
    }

    const models = (modelsData as Record<string, unknown>).models;

    if (!Array.isArray(models)) {
      return { status: 'skipped', reason: 'discovery_invalid_format' };
    }

    const targetModel = this.findMatchingLoadedModel(models, modelId);
    if (!targetModel) {
      return { status: 'skipped', reason: 'no_loaded_instance' };
    }

    if (targetModel.loaded_instances.length === 0) {
      return { status: 'skipped', reason: 'model_not_loaded' };
    }

    if (targetModel.loaded_instances.length > 1) {
      return { status: 'skipped', reason: 'multiple_loaded_instances' };
    }

    const instanceId = targetModel.loaded_instances[0].id;
    const unloadUrl = `${baseUrl}/api/v1/models/unload`;
    let unloadResponse: Response;
    try {
      unloadResponse = await this.fetchWithDispatcher(unloadUrl, {
        method: 'POST',
        headers: { ...this.buildHeaders(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_id: instanceId }),
      });
    } catch {
      return { status: 'skipped', reason: 'unload_failed' };
    }

    if (!unloadResponse.ok) {
      return { status: 'skipped', reason: 'unload_http_error' };
    }

    return { status: 'completed' };
  }

  private async fetchWithDispatcher(input: string, init: RequestInit): Promise<Response> {
    const dispatcherInit: RequestInit & { dispatcher: Dispatcher } = {
      ...init,
      dispatcher: this.dispatcher,
    };
    return fetch(input, dispatcherInit);
  }

  private buildHeaders(apiKey: string | undefined): Record<string, string> {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    return headers;
  }

  private findMatchingLoadedModel(
    modelsData: unknown[],
    modelId: string,
  ): LmStudioModelInfo | null {
    for (const entry of modelsData) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
      const obj = entry as Record<string, unknown>;
      const key = typeof obj.key === 'string' ? obj.key : undefined;
      if (!key) continue;

      const loadedInstances = obj.loaded_instances;
      if (!Array.isArray(loadedInstances)) continue;

      const validLoadedInstances: Array<{ id: string }> = [];
      let valid = true;
      for (const instance of loadedInstances) {
        if (typeof instance === 'object' && instance !== null && !Array.isArray(instance)) {
          const instObj = instance as Record<string, unknown>;
          if (typeof instObj.id === 'string' && instObj.id.length > 0) {
            validLoadedInstances.push({ id: instObj.id });
          } else {
            valid = false;
            break;
          }
        } else {
          valid = false;
          break;
        }
      }
      if (!valid) continue;

      if (key === modelId && validLoadedInstances.length > 0) {
        return { key, loaded_instances: validLoadedInstances };
      }
    }
    return null;
  }
}
