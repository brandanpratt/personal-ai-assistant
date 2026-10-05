import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_PROMPT, runTurn, type ModelFn } from '../../src/core/agent.js';
import { collectTools, createRegistry, resolveCommand, type Skill, type SkillContext } from '../../src/core/skill.js';
import { filesSkill } from '../../src/skills/files/index.js';
import { makeTempDir, removeDir } from '../helpers/fs.js';

/**
 * A toy second skill. It doubles as the template for real ones: tools prefixed with the skill name,
 * state kept in ctx.stateDir, an action that needs the human's approval.
 */
const notesSkill: Skill = {
  name: 'notes',
  description: 'Keep short notes.',
  prompt: 'Use notes_add to save a note when the user asks you to remember something.',
  commands: { list: { description: 'List notes', run: async () => {} } },
  tools: (ctx) => [
    {
      name: 'notes_add',
      description: 'Save a note (the user must approve).',
      schema: z.object({ text: z.string().min(1).max(200) }),
      run: async ({ text }) => {
        if (!(await ctx.confirm(`Save note "${text}"?`))) return 'The user declined.';
        fs.mkdirSync(ctx.stateDir, { recursive: true });
        fs.appendFileSync(path.join(ctx.stateDir, 'notes.txt'), text + '\n');
        return 'Saved.';
      },
    },
  ],
};

let base: string;
let approve = true;
const ctxFor = (s: Skill): SkillContext => ({
  stateDir: path.join(base, s.name),
  models: { chat: 'c', embed: 'e' },
  confirm: async () => approve,
  ask: async () => undefined,
  notify: async () => {},
  log: () => {},
});

beforeEach(() => {
  base = makeTempDir('skills');
  vi.stubEnv('ALLOWED_ROOT', base);
  approve = true;
});
afterEach(() => {
  vi.unstubAllEnvs();
  removeDir(base);
});

describe('two skills side by side', () => {
  it('registers together with no tool-name clashes, and the real files skill meets the contract', () => {
    const skills = createRegistry([filesSkill, notesSkill]);
    const names = collectTools(skills, ctxFor).map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(['propose_topics', 'apply_plan', 'notes_add']));
    expect(Object.keys(filesSkill.commands).sort()).toEqual(['apply', 'organize', 'plan', 'undo']);
    expect(resolveCommand(skills, ['plan'])).toMatchObject({ command: 'plan' });
    expect(resolveCommand(skills, ['list'])).toMatchObject({ command: 'list' });
  });

  it('a second skill runs through the shared agent loop, in its own state folder, behind approval', async () => {
    const tools = collectTools([notesSkill], ctxFor);
    const calls: ModelFn = (() => {
      const replies = [
        { content: '', tool_calls: [{ function: { name: 'notes_add', arguments: { text: 'buy milk' } } }] },
        { content: 'Saved it.' },
      ];
      let i = 0;
      return async () => replies[i++]!;
    })();
    const out = await runTurn(calls, tools, [{ role: 'system', content: BASE_PROMPT }], 'remember: buy milk');
    expect(out).toBe('Saved it.');
    expect(fs.readFileSync(path.join(base, 'notes', 'notes.txt'), 'utf8')).toBe('buy milk\n');
    expect(fs.existsSync(path.join(base, 'files'))).toBe(false); // the files skill's folder is untouched
  });

  it('declined approval means nothing is written', async () => {
    approve = false;
    const tools = collectTools([notesSkill], ctxFor);
    const model: ModelFn = (() => {
      const r = [{ content: '', tool_calls: [{ function: { name: 'notes_add', arguments: { text: 'x' } } }] }, { content: 'ok' }];
      let i = 0;
      return async () => r[i++]!;
    })();
    await runTurn(model, tools, [{ role: 'system', content: BASE_PROMPT }], 'x');
    expect(fs.existsSync(path.join(base, 'notes', 'notes.txt'))).toBe(false);
  });
});
