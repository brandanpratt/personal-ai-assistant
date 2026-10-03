import path from 'node:path';
import type { Message } from 'ollama';
import { ollamaModel, runTurn, SYSTEM_PROMPT } from './agent.js';
import { config } from './config.js';
import { execute, undo } from './executor.js';
import { createIO } from './io.js';
import { latestUndoable } from './journal.js';
import { learn, loadMemory, saveMemory } from './memory.js';
import { proposeTaxonomy, summarizeKnown } from './organize.js';
import { formatPlan, formatPlanSummary, planMoves } from './planner.js';
import { applyEdit, formatTaxonomy, parseCommand, toPlacement } from './review.js';
import { scan } from './scanner.js';
import { createTools } from './tools.js';
import { runCheck } from './check.js';
import { macNotify } from './notify.js';
import { buildPlist, installInstructions } from './schedule.js';
import os from 'node:os';

// Temporary CLI until the chat layer: `plan` (default, dry run) | `apply` | `organize` | `undo` | `chat` | `check` | `schedule`
const command = process.argv[2] ?? 'plan';
const { allowedRoot: root, stateDir } = config;
const memoryFile = path.join(stateDir, 'memory.json');

const io = createIO();
const { ask, confirm } = io;

function runMoves(moves: ReturnType<typeof planMoves>['moves']) {
  const res = execute(root, moves, stateDir);
  console.log(`Moved ${res.moved}, skipped ${res.skipped.length}. Journal: ${res.journalFile}`);
  for (const s of res.skipped) console.log(`  skipped ${s.move.from}: ${s.reason}`);
  console.log('Undo with: npm run dev -- undo');
  return res;
}

async function main() {
  if (command === 'plan') {
    console.log(formatPlan(root, planMoves(root, await scan(root))));
  } else if (command === 'apply') {
    const plan = planMoves(root, await scan(root));
    console.log(formatPlan(root, plan));
    if (plan.moves.length > 0 && (await confirm(`\nMove ${plan.moves.length} files in ${root}?`))) runMoves(plan.moves);
    else console.log('Nothing done.');
  } else if (command === 'organize') {
    const files = await scan(root);
    const memory = loadMemory(memoryFile, config.embedModel);
    const proposal = await proposeTaxonomy(files, memory, console.log);
    let taxonomy = proposal.taxonomy;
    console.log(`\n${formatTaxonomy(taxonomy, proposal.remembered)}\n\nReview the topic folders. Commands: list | show <n> | rename <n> <name> | merge <from> <into> | reject <n> | done`);
    for (;;) {
      const line = await ask('> ');
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
    const plan = planMoves(root, files, toPlacement(taxonomy));
    console.log(`\n${formatPlanSummary(root, plan)}`);
    if (plan.moves.length > 0 && (await confirm(`\nMove ${plan.moves.length} files in ${root}?`))) {
      const res = runMoves(plan.moves);
      // learn only from a plan you approved and that actually ran
      if (res.moved > 0) {
        saveMemory(memoryFile, learn(memory, proposal.taxonomy, taxonomy, proposal.vectors));
        console.log(`Remembered your folders in ${memoryFile}`);
      }
    } else console.log('Nothing done.');
  } else if (command === 'chat') {
    const tools = createTools({
      root, stateDir, embedModel: config.embedModel, propose: proposeTaxonomy, confirm, log: console.log,
    });
    const model = ollamaModel(config.ollamaModel);
    const messages: Message[] = [{ role: 'system', content: SYSTEM_PROMPT }];
    console.log(`Organizer ready for ${root}. Try "what's in my folder?" or "clean it up". Type "exit" to leave.`);
    for (;;) {
      const line = (await ask('\nyou> '))?.trim();
      if (line === undefined || line === 'exit' || line === 'quit') break;
      if (!line) continue;
      try {
        const reply = await runTurn(model, tools, messages, line, { onTool: (name) => console.log(`  [tool: ${name}]`) });
        console.log(`\nagent> ${reply}`);
      } catch (err) {
        console.log(`\nagent> Sorry, the model failed (${err instanceof Error ? err.message : err}). Is Ollama running?`);
      }
    }
  } else if (command === 'check') {
    // Scheduled, notify-only. Never moves anything. Safe to run by hand too.
    const memory = loadMemory(memoryFile, config.embedModel);
    const res = await runCheck({
      root, stateDir, now: new Date(),
      minFiles: config.checkMinFiles, cooldownHours: config.checkCooldownHours, minAgeMinutes: config.checkMinAgeMinutes,
      scan, known: (files) => summarizeKnown(files, memory), notify: macNotify,
    });
    console.log(`[${new Date().toISOString()}] check: ${JSON.stringify(res)}`);
  } else if (command === 'schedule') {
    const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.local.file-organizer.plist');
    console.log(buildPlist({ projectDir: process.cwd(), nodePath: process.execPath, intervalSeconds: 6 * 3600 }));
    console.log(installInstructions(plistPath));
  } else if (command === 'undo') {
    const file = latestUndoable(stateDir);
    if (!file) return console.log('Nothing to undo.');
    if (!(await confirm(`Undo the run recorded in ${file}?`))) return console.log('Nothing done.');
    const res = undo(file);
    console.log(`Restored ${res.restored}, skipped ${res.skipped.length}.`);
    for (const s of res.skipped) console.log(`  skipped ${s.to}: ${s.reason}`);
  } else {
    console.error(`Unknown command "${command}". Use: plan | apply | organize | undo | chat | check | schedule`);
    process.exitCode = 1;
  }
}

try {
  await main();
} finally {
  io.close();
}
