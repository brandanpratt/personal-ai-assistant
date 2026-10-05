import type { Command, SkillContext } from '../../core/skill.js';
import { loadFilesConfig } from './config.js';
import { executeAndLearn, moveQuestion, type Learned } from './apply.js';
import { loadMemory, memoryFilePath } from './memory.js';
import { proposeTaxonomy } from './organize.js';
import { formatPlan, formatPlanSummary, planMoves, type Plan } from './planner.js';
import { applyEdit, formatTaxonomy, parseCommand, toPlacement } from './review.js';
import { scan } from './scanner.js';
import { describeUndo, undoLatest } from './undoRun.js';

function runMoves(root: string, moves: Plan['moves'], ctx: SkillContext, learned?: Learned) {
  const res = executeAndLearn({ root, moves, stateDir: ctx.stateDir, embedModel: ctx.models.embed, learned });
  console.log(`Moved ${res.moved}, skipped ${res.skipped.length}. Journal: ${res.journalFile}`);
  for (const s of res.skipped) console.log(`  skipped ${s.move.from}: ${s.reason}`);
  if (res.learnedFolders) console.log(`Remembered your folders in ${memoryFilePath(ctx.stateDir)}`);
  console.log('Undo with: npm run dev -- undo');
  return res;
}

const plan: Command = {
  description: 'Dry run: show where files would go by type. Moves nothing.',
  run: async () => {
    const { allowedRoot: root } = loadFilesConfig();
    console.log(formatPlan(root, planMoves(root, await scan(root))));
  },
};

const apply: Command = {
  description: 'Sort by type only (no topics), after you type "yes".',
  run: async (ctx) => {
    const { allowedRoot: root } = loadFilesConfig();
    const p = planMoves(root, await scan(root));
    console.log(formatPlan(root, p));
    if (p.moves.length > 0 && (await ctx.confirm(moveQuestion(p.moves.length, root)))) runMoves(root, p.moves, ctx);
    else console.log('Nothing done.');
  },
};

const organize: Command = {
  description: 'Propose topic folders, let you edit them, then move after you type "yes".',
  run: async (ctx) => {
    const { allowedRoot: root } = loadFilesConfig();
    const files = await scan(root);
    const memory = loadMemory(memoryFilePath(ctx.stateDir), ctx.models.embed);
    const proposal = await proposeTaxonomy(files, memory, ctx.log, ctx.models);
    let taxonomy = proposal.taxonomy;
    console.log(`\n${formatTaxonomy(taxonomy, proposal.remembered)}\n\nReview the topic folders. Commands: list | show <n> | rename <n> <name> | merge <from> <into> | reject <n> | done`);
    for (;;) {
      const line = await ctx.ask('> ');
      if (line === undefined) return console.log('\nInput closed. Nothing done.');
      const cmd = parseCommand(line);
      if (typeof cmd === 'string') console.log(cmd);
      else if (cmd.kind === 'done') break;
      else if (cmd.kind === 'list') console.log(formatTaxonomy(taxonomy, proposal.remembered));
      else if (cmd.kind === 'show') {
        const f = taxonomy.folders[cmd.n - 1];
        console.log(f ? f.docs.map((d) => `  ${d.file.name}`).join('\n') : `no folder ${cmd.n}`);
      } else {
        const res = applyEdit(taxonomy, cmd);
        if (res.ok) {
          taxonomy = res.taxonomy;
          console.log(formatTaxonomy(taxonomy, proposal.remembered));
        } else console.log(res.error);
      }
    }
    const p = planMoves(root, files, toPlacement(taxonomy));
    console.log(`\n${formatPlanSummary(root, p)}`);
    // learning happens inside runMoves, and only for a plan you approved that actually moved something
    if (p.moves.length > 0 && (await ctx.confirm(moveQuestion(p.moves.length, root)))) runMoves(root, p.moves, ctx, { proposal, taxonomy });
    else console.log('Nothing done.');
  },
};

const undoCommand: Command = {
  description: 'Reverse the most recent run, after you type "yes".',
  run: async (ctx) => {
    const out = await undoLatest(ctx.stateDir, ctx.confirm, (file) => `Undo the run recorded in ${file}?`);
    if (out.status === 'none') return console.log('Nothing to undo.');
    if (out.status === 'declined') return console.log('Nothing done.');
    console.log(describeUndo(out.result));
    for (const s of out.result.skipped) console.log(`  skipped ${s.to}: ${s.reason}`);
  },
};

export const filesCommands: Record<string, Command> = { plan, apply, organize, undo: undoCommand };
