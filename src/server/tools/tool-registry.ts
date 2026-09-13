import type { RegisteredTool, ToolExecutionContext, ToolSettings } from '../tool-types.js';

export class ToolRegistry {
  private readonly tools: Map<string, RegisteredTool>;

  constructor(tools: RegisteredTool[]) {
    this.tools = new Map(tools.map((tool) => [tool.name, tool]));
  }

  list(): RegisteredTool[] {
    return [...this.tools.values()];
  }

  get(name: string): RegisteredTool | null {
    return this.tools.get(name) ?? null;
  }

  async execute(
    name: string,
    argumentsValue: unknown,
    settings: ToolSettings,
    signal?: AbortSignal,
    context?: ToolExecutionContext,
  ): Promise<unknown> {
    const tool = this.get(name);
    if (!tool) {
      throw new Error('Unsupported tool');
    }
    signal?.throwIfAborted();
    return tool.execute(argumentsValue, settings, signal, context);
  }
}
