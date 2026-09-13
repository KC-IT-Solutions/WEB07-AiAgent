import type { ChatCommandResult } from '../chat-types.js';
import type { ChatSkillRepository } from '../repositories/chat-skill-repository.js';
import type { ChatService } from './chat-service.js';
import type { SkillService } from './skill-service.js';

export class ChatCommandError extends Error {
  constructor(readonly code: 'CHAT_NOT_FOUND') {
    super(code);
    this.name = 'ChatCommandError';
  }
}

export class ChatCommandService {
  constructor(
    private readonly chatService: Pick<ChatService, 'getChatById' | 'clearMessages'>,
    private readonly skillService: Pick<SkillService, 'findCommand'>,
    private readonly chatSkillRepository: ChatSkillRepository,
  ) {}

  async execute(chatId: number, input: string): Promise<ChatCommandResult> {
    const commandText = input.trim();
    if (!commandText.startsWith('/')) {
      throw new TypeError('Chat command must begin with a slash');
    }
    if (!(await this.chatService.getChatById(chatId))) {
      throw new ChatCommandError('CHAT_NOT_FOUND');
    }

    const commandName = commandText.slice(1);
    if (commandName === 'clear') {
      if (!(await this.chatService.clearMessages(chatId))) {
        throw new ChatCommandError('CHAT_NOT_FOUND');
      }
      return { type: 'command_result', command: 'clear', message: 'Chat history cleared.' };
    }
    if (commandName === 'new') {
      return { type: 'command_result', command: 'new', message: 'Create a new chat.' };
    }
    if (commandName === 'skills') {
      const activeSkills = this.chatSkillRepository.listForChat(chatId);
      return {
        type: 'command_result',
        command: 'skills',
        message:
          activeSkills.length === 0
            ? 'No skills active in this chat.'
            : `Active skills\n\n${activeSkills
                .map((skill) => `/${skill.commandName} - ${skill.name}`)
                .join('\n')}`,
      };
    }

    const skill = await this.skillService.findCommand(commandName);
    if (!skill) {
      return {
        type: 'command_result',
        command: commandName,
        message: `Command not found: ${commandText}`,
      };
    }
    const state = this.chatSkillRepository.toggle(chatId, skill.id);
    return {
      type: 'command_result',
      command: skill.commandName,
      message: `Skill ${state}: ${skill.name}`,
    };
  }
}
