import {
  InvalidToolArgumentsError,
  RUN_AGENT_TOOL_NAME,
  type RegisteredTool,
  type ToolExecutionContext,
  type ToolSettings,
} from '../tool-types.js';

export class RunAgentTool implements RegisteredTool {
  readonly name = RUN_AGENT_TOOL_NAME;
  readonly displayName = 'Agent Runner';
  readonly description = 'Runs the Agent configured by the user and waits for it to finish.';
  readonly agentOnly = true;
  readonly inputSchema: Record<string, unknown> = {
    type: 'object',
    properties: {},
    additionalProperties: false,
  };

  async execute(
    argumentsValue: unknown,
    _settings: ToolSettings,
    signal?: AbortSignal,
    context?: ToolExecutionContext,
  ): Promise<{ status: 'Done' | 'Error' }> {
    if (
      typeof argumentsValue !== 'object' ||
      argumentsValue === null ||
      Array.isArray(argumentsValue) ||
      Object.keys(argumentsValue).length !== 0
    ) {
      throw new InvalidToolArgumentsError('Agent Runner accepts no arguments.');
    }
    signal?.throwIfAborted();
    if (!context?.runConfiguredAgent) return { status: 'Error' };
    return context.runConfiguredAgent(signal);
  }
}
