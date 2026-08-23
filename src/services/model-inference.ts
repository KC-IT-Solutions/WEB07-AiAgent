export type ModelInferenceErrorCode =
  | 'MODEL_SERVER_UNREACHABLE'
  | 'MODEL_SERVER_TIMEOUT'
  | 'MODEL_SERVER_RESPONSE_ERROR'
  | 'MODEL_SERVER_INVALID_RESPONSE';

export class ModelInferenceError extends Error {
  readonly code: ModelInferenceErrorCode;

  constructor(code: ModelInferenceErrorCode) {
    super(code);
    this.name = 'ModelInferenceError';
    this.code = code;
  }
}

export async function requestModelInference(
  baseUrl: string,
  timeoutMinutes: number,
  modelId: string,
  message: string,
): Promise<string> {
  let url: URL;
  try {
    url = new URL(`${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`);
  } catch {
    throw new ModelInferenceError('MODEL_SERVER_UNREACHABLE');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMinutes * 60 * 1000);

  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: message }],
        }),
        signal: controller.signal,
      });
    } catch {
      throw new ModelInferenceError(
        controller.signal.aborted ? 'MODEL_SERVER_TIMEOUT' : 'MODEL_SERVER_UNREACHABLE',
      );
    }

    if (!response.ok) {
      throw new ModelInferenceError('MODEL_SERVER_RESPONSE_ERROR');
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ModelInferenceError(
        controller.signal.aborted ? 'MODEL_SERVER_TIMEOUT' : 'MODEL_SERVER_INVALID_RESPONSE',
      );
    }

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new ModelInferenceError('MODEL_SERVER_INVALID_RESPONSE');
    }

    const choices = (data as Record<string, unknown>).choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new ModelInferenceError('MODEL_SERVER_INVALID_RESPONSE');
    }

    const choice = choices[0];
    if (typeof choice !== 'object' || choice === null || Array.isArray(choice)) {
      throw new ModelInferenceError('MODEL_SERVER_INVALID_RESPONSE');
    }

    const assistantMessage = (choice as Record<string, unknown>).message;
    if (
      typeof assistantMessage !== 'object' ||
      assistantMessage === null ||
      Array.isArray(assistantMessage)
    ) {
      throw new ModelInferenceError('MODEL_SERVER_INVALID_RESPONSE');
    }

    const content = (assistantMessage as Record<string, unknown>).content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new ModelInferenceError('MODEL_SERVER_INVALID_RESPONSE');
    }

    return content.trim();
  } finally {
    clearTimeout(timeoutId);
  }
}
