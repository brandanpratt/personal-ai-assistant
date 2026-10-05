import os from 'node:os';
import path from 'node:path';
import { loadCoreConfig } from './core/config.js';
import { runChat } from './core/chat.js';
import { createIO } from './core/io.js';
import { macNotify } from './core/notify.js';
import { buildPlist, installInstructions } from './core/schedule.js';
import { createRegistry, resolveCommand, type Skill, type SkillContext } from './core/skill.js';
import { filesSkill } from './skills/files/index.js';

/** To add a skill: build it under src/skills/<name>/ and add it to this list. */
const skills = createRegistry([filesSkill]);

function help(): string {
  const lines = [
    'Usage: npm run dev -- <command>',
    '',
    'General:',
    '  chat               talk to the assistant (all skills)',
    '  check              run every skill\'s scheduled, notify-only check',
    '  schedule           print a macOS launchd job that runs "check"',
    '  skills             list skills and their commands',
  ];
  for (const s of skills) {
    lines.push('', `${s.name}: ${s.description}`);
    for (const [name, c] of Object.entries(s.commands)) lines.push(`  ${s.name} ${name.padEnd(10)} ${c.description}`);
  }
  lines.push('', 'A command name alone works when only one skill has it (e.g. "organize").');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const words = process.argv.slice(2);
  const [head] = words;
  if (head === 'help' || head === '--help' || head === '-h' || head === 'skills') return console.log(help());

  const core = loadCoreConfig();
  const io = createIO();
  try {
    const ctxFor = (skill: Skill): SkillContext => ({
      stateDir: path.join(core.stateDir, skill.name),
      models: { chat: core.ollamaModel, embed: core.embedModel },
      confirm: io.confirm,
      ask: io.ask,
      notify: macNotify,
      log: console.log,
    });
    const initAll = async () => { for (const s of skills) await s.init?.(ctxFor(s)); };

    if (head === 'chat') {
      await initAll();
      await runChat({ skills, ctxFor, chatModel: core.ollamaModel, io });
    } else if (head === 'check') {
      await initAll();
      for (const s of skills) {
        if (!s.check) continue;
        try {
          console.log(`[${new Date().toISOString()}] ${s.name}: ${await s.check(ctxFor(s))}`);
        } catch (err) {
          console.log(`[${new Date().toISOString()}] ${s.name}: check failed: ${err instanceof Error ? err.message : err}`);
          process.exitCode = 1;
        }
      }
    } else if (head === 'schedule') {
      const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.local.file-organizer.plist');
      console.log(buildPlist({ projectDir: process.cwd(), nodePath: process.execPath, intervalSeconds: 6 * 3600 }));
      console.log(installInstructions(plistPath));
    } else {
      const r = resolveCommand(skills, words);
      if ('error' in r) {
        console.error(`${r.error}\n\n${help()}`);
        process.exitCode = 1;
        return;
      }
      const ctx = ctxFor(r.skill);
      await r.skill.init?.(ctx);
      await r.skill.commands[r.command]!.run(ctx, r.args);
    }
  } finally {
    io.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
