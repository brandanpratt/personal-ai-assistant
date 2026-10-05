import path from 'node:path';
import type { Skill } from '../../core/skill.js';
import { runCheck } from './check.js';
import { filesCommands } from './commands.js';
import { loadFilesConfig } from './config.js';
import { loadMemory } from './memory.js';
import { migrateLegacyState } from './migrate.js';
import { proposeTaxonomy, summarizeKnown } from './organize.js';
import { scan } from './scanner.js';
import { createTools } from './tools.js';

const PROMPT = `You help the user organize their Downloads folder.
How to work: for a cleanup, call propose_topics, show the user the folders, apply any edits they ask for with edit_topics, call preview_plan, then call apply_plan only when the user has asked to go ahead. Files are only moved, never deleted, and runs can be undone.
Questions like "what would happen" or "show me" are never a request to move files: use preview_plan, never apply_plan.
Never say files were moved unless an apply_plan result says so.`;

export const filesSkill: Skill = {
  name: 'files',
  description: 'Organize a folder (Downloads) by file type and topic. Dry-run first, never deletes, undoable.',
  prompt: PROMPT,
  defaultCommand: 'plan',
  commands: filesCommands,

  init(ctx) {
    const moved = migrateLegacyState(path.dirname(ctx.stateDir), ctx.stateDir);
    if (moved.length > 0) ctx.log(`[files] moved existing state into ${ctx.stateDir}: ${moved.join(', ')}`);
  },

  tools(ctx) {
    return createTools({
      root: loadFilesConfig().allowedRoot,
      stateDir: ctx.stateDir,
      embedModel: ctx.models.embed,
      propose: (files, memory, log) => proposeTaxonomy(files, memory, log, ctx.models),
      confirm: ctx.confirm,
      log: ctx.log,
    });
  },

  async check(ctx) {
    const cfg = loadFilesConfig();
    const memory = loadMemory(path.join(ctx.stateDir, 'memory.json'), ctx.models.embed);
    const res = await runCheck({
      root: cfg.allowedRoot,
      stateDir: ctx.stateDir,
      now: new Date(),
      minFiles: cfg.checkMinFiles,
      cooldownHours: cfg.checkCooldownHours,
      minAgeMinutes: cfg.checkMinAgeMinutes,
      scan,
      known: (files) => summarizeKnown(files, memory, ctx.models.embed),
      notify: ctx.notify,
    });
    return JSON.stringify(res);
  },
};
