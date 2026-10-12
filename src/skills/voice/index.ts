import type { Skill } from '../../core/skill.js';
import { voiceCommands } from './commands.js';

export const voiceSkill: Skill = {
  name: 'voice',
  description: 'Transcribe WhatsApp voice notes locally (Whisper) and explain Bahamian dialect. Audio never leaves this machine.',
  prompt: `Voice notes can't be handled from chat yet. If the user asks about voice notes, tell them to run "npm run dev -- voice list" and "npm run dev -- voice transcribe".`,
  commands: voiceCommands,
  tools: () => [],
};
