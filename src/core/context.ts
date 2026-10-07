import path from 'node:path';
import type { CoreConfig } from './config.js';
import { macNotify } from './notify.js';
import type { Skill, SkillContext } from './skill.js';

/**
 * Builds each skill's context. The front end (CLI, HUD) supplies `confirm` and `ask`, because those
 * are the human's channel: the model can never answer them.
 */
export function createCtxFor(
  core: CoreConfig,
  human: Pick<SkillContext, 'confirm' | 'ask'>,
): (skill: Skill) => SkillContext {
  return (skill) => ({
    stateDir: path.join(core.stateDir, skill.name),
    models: { chat: core.ollamaModel, embed: core.embedModel },
    confirm: human.confirm,
    ask: human.ask,
    notify: macNotify,
    log: console.log,
  });
}
