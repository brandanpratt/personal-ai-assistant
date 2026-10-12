import { createRegistry } from '../core/skill.js';
import { emailSkill } from './email/index.js';
import { filesSkill } from './files/index.js';
import { voiceSkill } from './voice/index.js';

/** To add a skill: build it under src/skills/<name>/ and add it to this list. The CLI and the HUD both use it. */
export const skills = createRegistry([filesSkill, emailSkill, voiceSkill]);
