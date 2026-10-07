import type { Message } from 'ollama';
import { BASE_PROMPT, runTurn, type ModelFn, type TurnHooks } from './agent.js';
import { collectTools, composeSystemPrompt, type Skill, type SkillContext } from './skill.js';

export interface Session {
  /** Runs one user turn and returns the final reply. History is kept between calls. */
  send: (text: string, hooks?: TurnHooks) => Promise<string>;
}

/**
 * One conversation across every registered skill. The CLI chat and the HUD both go through this,
 * so the system prompt, the tool list and the history handling can't drift apart.
 */
export function createSession(opts: {
  skills: Skill[];
  ctxFor: (skill: Skill) => SkillContext;
  model: ModelFn;
}): Session {
  const { skills, ctxFor, model } = opts;
  const tools = collectTools(skills, ctxFor);
  const messages: Message[] = [{ role: 'system', content: composeSystemPrompt(BASE_PROMPT, skills) }];
  return { send: (text, hooks) => runTurn(model, tools, messages, text, hooks) };
}
