import type { Skill } from '../../core/skill.js';
import { emailCommands } from './commands.js';

export const emailSkill: Skill = {
  name: 'email',
  description: 'Read-only access to Gmail and Outlook. Never sends, deletes, archives or marks mail as read.',
  prompt: `Email can't be read from chat yet. If the user asks about their email, tell them to run "npm run dev -- email recent".`,
  commands: emailCommands,
  tools: () => [],
};
