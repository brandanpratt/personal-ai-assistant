import path from 'node:path';
import { z } from 'zod';
import { execute, undo } from './executor.js';
import { latestUndoable } from './journal.js';
import { learn, loadMemory, saveMemory } from './memory.js';
import type { Proposal } from './organize.js';
import { formatPlanSummary, planMoves } from './planner.js';
import { applyEdit, formatTaxonomy, toPlacement } from './review.js';
import { scan, type FileInfo } from './scanner.js';
import type { Taxonomy } from './taxonomy.js';

/**
 * Tools the model may call. Design rules:
 *  - No tool takes a file path. The model names folders by number; code owns every path.
 *  - Read-only tools just report. Tools that change the disk (apply_plan, undo_last_run) first
 *    ask the HUMAN to type "yes" via `confirm`, a channel the model cannot answer.
 *  - Tool results contain file names from your disk, which is untrusted text: the system prompt
 *    tells the model to treat them as data, and even a fooled model can't do more than these tools allow.
 */
export interface Tool {
  name: string;
  description: string;
  schema: z.ZodType;
  run: (args: any) => Promise<string>;
}

export interface SessionDeps {
  root: string;
  stateDir: string;
  embedModel: string;
  propose: (files: FileInfo[], memory: ReturnType<typeof loadMemory>, log: (m: string) => void) => Promise<Proposal>;
  confirm: (question: string) => Promise<boolean>;
  log: (msg: string) => void;
}

export function createTools(deps: SessionDeps): Tool[] {
  const { root, stateDir, confirm, log } = deps;
  const memoryFile = path.join(stateDir, 'memory.json');
  let proposal: Proposal | undefined;
  let taxonomy: Taxonomy | undefined;

  const currentPlan = async () => planMoves(root, await scan(root), taxonomy ? toPlacement(taxonomy) : undefined);
  const needTaxonomy = () => (taxonomy ? undefined : 'No topics proposed yet. Call propose_topics first.');

  return [
    {
      name: 'folder_status',
      description: 'Count the loose files in the folder being organized, grouped by whether a type rule matches. Read-only.',
      schema: z.object({}),
      run: async () => {
        const plan = await currentPlan();
        return `${plan.moves.length} files can be filed by type, ${plan.unclassified.length} have no matching rule, ${plan.alreadyOrganized.length} already organized.`;
      },
    },
    {
      name: 'propose_topics',
      description:
        'Read the documents, group them by topic using remembered folders first, and propose topic folders. Slow (up to a minute or more). Replaces any earlier proposal. Does not move anything.',
      schema: z.object({}),
      run: async () => {
        const memory = loadMemory(memoryFile, deps.embedModel);
        proposal = await deps.propose(await scan(root), memory, log);
        taxonomy = proposal.taxonomy;
        return formatTaxonomy(taxonomy, proposal.remembered);
      },
    },
    {
      name: 'show_folder',
      description: 'List the file names in one proposed topic folder, by its number from the list.',
      schema: z.object({ n: z.coerce.number().int().min(1) }),
      run: async ({ n }) => {
        const err = needTaxonomy();
        if (err) return err;
        const f = taxonomy!.folders[n - 1];
        return f ? f.docs.slice(0, 40).map((d) => d.file.name).join('\n') + (f.docs.length > 40 ? `\n...and ${f.docs.length - 40} more` : '') : `No folder ${n}.`;
      },
    },
    {
      name: 'edit_topics',
      description:
        'Change the proposed folders. rename: give folder n a new name (renaming onto an existing name merges). merge: move folder n into folder "into". reject: send folder n\'s files to review. Folder numbers shift after merge/reject; the result shows the new list.',
      schema: z.object({
        action: z.enum(['rename', 'merge', 'reject']),
        n: z.coerce.number().int().min(1),
        into: z.coerce.number().int().min(1).optional(),
        name: z.string().optional(),
      }),
      run: async (a) => {
        const err = needTaxonomy();
        if (err) return err;
        let cmd;
        if (a.action === 'rename') {
          if (!a.name) return 'rename needs "name".';
          cmd = { kind: 'rename' as const, n: a.n, name: a.name };
        } else if (a.action === 'merge') {
          if (!a.into) return 'merge needs "into".';
          cmd = { kind: 'merge' as const, from: a.n, into: a.into };
        } else cmd = { kind: 'reject' as const, n: a.n };
        const res = applyEdit(taxonomy!, cmd);
        if (!res.ok) return `Not applied: ${res.error}`;
        taxonomy = res.taxonomy;
        return formatTaxonomy(taxonomy, proposal?.remembered);
      },
    },
    {
      name: 'preview_plan',
      description: 'Show what apply_plan would do, as a count per destination folder. Moves nothing.',
      schema: z.object({}),
      run: async () => formatPlanSummary(root, await currentPlan()),
    },
    {
      name: 'apply_plan',
      description:
        'Actually move the files. Call ONLY when the user has explicitly told you to go ahead and do it now (e.g. "apply it", "do it", "clean it up"). NEVER call it for questions or hypotheticals such as "what would happen" (use preview_plan for those). The user is asked to type "yes" at their terminal first; if they decline, nothing moves.',
      schema: z.object({}),
      run: async () => {
        const plan = await currentPlan();
        if (plan.moves.length === 0) return 'Nothing to move.';
        console.log(`\n${formatPlanSummary(root, plan, 'About to move:')}`);
        if (!(await confirm(`\nMove ${plan.moves.length} files in ${root}?`))) return 'The user declined. Nothing was moved.';
        const res = execute(root, plan.moves, stateDir);
        if (res.moved > 0 && proposal && taxonomy) {
          saveMemory(memoryFile, learn(loadMemory(memoryFile, deps.embedModel), proposal.taxonomy, taxonomy, proposal.vectors));
        }
        proposal = taxonomy = undefined;
        return `Moved ${res.moved}, skipped ${res.skipped.length}. The run can be undone with undo_last_run.`;
      },
    },
    {
      name: 'undo_last_run',
      description: 'Reverse the most recent run that has not been undone. The user is asked to type "yes" first.',
      schema: z.object({}),
      run: async () => {
        const file = latestUndoable(stateDir);
        if (!file) return 'There is nothing to undo.';
        if (!(await confirm('\nUndo the most recent run?'))) return 'The user declined. Nothing was undone.';
        const res = undo(file);
        return `Restored ${res.restored}, skipped ${res.skipped.length}.`;
      },
    },
  ];
}
