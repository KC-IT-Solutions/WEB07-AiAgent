export interface TestConnectionRequest {
  baseUrl: string;
  apiKey?: string;
  timeoutMinutes?: number;
}

export interface TestConnectionResponse {
  connected: boolean;
  models: string[];
  error?: string;
}

export async function testConnection(
  baseUrl: string,
  apiKey: string | undefined,
  timeoutMinutes: number,
): Promise<TestConnectionResponse> {
  const trimmedUrl = baseUrl.replace(/\/+$/, '');

  let url: URL;
  try {
    url = new URL(`${trimmedUrl}/v1/models`);
  } catch {
    return {
      connected: false,
      models: [],
      error: 'Invalid base URL',
    };
  }

  const timeoutMs = timeoutMinutes * 60 * 1000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {};
  if (apiKey && apiKey.trim().length > 0) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        connected: false,
        models: [],
        error: `Connection failed with status ${response.status}`,
      };
    }

    const data = await response.json();

    const models: string[] = [];
    if (Array.isArray(data.data)) {
      for (const item of data.data) {
        if (item && typeof item.id === 'string') {
          models.push(item.id);
        }
      }
    }

    return {
      connected: true,
      models,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.toLowerCase().includes('abort')) {
      return {
        connected: false,
        models: [],
        error: 'Connection timed out',
      };
    }
    return {
      connected: false,
      models: [],
      error: 'Failed to connect to the model server',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
