import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  collectTools, composeSystemPrompt, createRegistry, resolveCommand, type Skill, type SkillContext, type Tool,
} from '../../src/core/skill.js';

const noop = async () => {};
const ctx = (): SkillContext => ({
  stateDir: '/tmp/x', models: { chat: 'c', embed: 'e' },
  confirm: async () => false, ask: async () => undefined, notify: noop, log: () => {},
});
const tool = (name: string): Tool => ({ name, description: name, schema: z.object({}), run: async () => name });
const skill = (name: string, over: Partial<Skill> = {}): Skill => ({
  name, description: `${name} skill`, prompt: `about ${name}`,
  tools: () => [tool(`${name}_do`)],
  commands: { run: { description: 'r', run: noop } },
  ...over,
});

describe('createRegistry', () => {
  it('accepts valid skills', () => expect(createRegistry([skill('files'), skill('finance-2')])).toHaveLength(2));
  it.each(['Files', 'my skill', '1x', '', 'a/b'])('rejects invalid name %j', (n) => {
    expect(() => createRegistry([skill(n)])).toThrow(/Invalid skill name/);
  });
  it('rejects duplicate skill names and a defaultCommand that does not exist', () => {
    expect(() => createRegistry([skill('a'), skill('a')])).toThrow(/Duplicate/);
    expect(() => createRegistry([skill('a', { defaultCommand: 'nope' })])).toThrow(/defaultCommand/);
  });
});

describe('collectTools', () => {
  it('gathers tools from every skill', () => {
    expect(collectTools([skill('a'), skill('b')], ctx).map((t) => t.name)).toEqual(['a_do', 'b_do']);
  });
  it('fails fast, naming both skills, when two skills use the same tool name', () => {
    const clash = (n: string) => skill(n, { tools: () => [tool('status')] });
    expect(() => collectTools([clash('a'), clash('b')], ctx)).toThrow(/"status".*"a".*"b"/);
  });
  it('gives each skill its own context', () => {
    const seen: string[] = [];
    const spy = (n: string) => skill(n, { tools: (c) => { seen.push(c.stateDir); return []; } });
    collectTools([spy('a'), spy('b')], (s) => ({ ...ctx(), stateDir: `/state/${s.name}` }));
    expect(seen).toEqual(['/state/a', '/state/b']);
  });
});

describe('resolveCommand', () => {
  const a = skill('files', { commands: { plan: { description: '', run: noop }, undo: { description: '', run: noop } }, defaultCommand: 'plan' });
  const b = skill('mail', { commands: { send: { description: '', run: noop }, undo: { description: '', run: noop } } });
  const all = [a, b];

  it('resolves an explicit "<skill> <command>" with args', () => {
    expect(resolveCommand(all, ['mail', 'send', 'x'])).toEqual({ skill: b, command: 'send', args: ['x'] });
  });
  it('resolves a bare command only when exactly one skill has it', () => {
    expect(resolveCommand(all, ['plan'])).toEqual({ skill: a, command: 'plan', args: [] });
    expect(resolveCommand(all, ['send', 'now'])).toEqual({ skill: b, command: 'send', args: ['now'] });
  });
  it('refuses ambiguous bare commands and says how to disambiguate', () => {
    const r = resolveCommand(all, ['undo']);
    expect(r).toMatchObject({ error: expect.stringContaining('files, mail') });
  });
  it('runs the single default command when no words are given, else errors', () => {
    expect(resolveCommand(all, [])).toMatchObject({ command: 'plan' });
    expect(resolveCommand([b], [])).toHaveProperty('error');
    expect(resolveCommand([a, skill('x', { commands: { go: { description: '', run: noop } }, defaultCommand: 'go' })], [])).toHaveProperty('error');
  });
  it('gives helpful errors for unknown skill commands and unknown words', () => {
    expect(resolveCommand(all, ['mail', 'nope'])).toMatchObject({ error: expect.stringContaining('send') });
    expect(resolveCommand(all, ['files'])).toMatchObject({ error: expect.stringContaining('plan') });
    expect(resolveCommand(all, ['wat'])).toMatchObject({ error: expect.stringContaining('Unknown') });
  });
});

describe('composeSystemPrompt', () => {
  it('puts the shared rules first, then each skill under its own heading', () => {
    const p = composeSystemPrompt('BASE', [skill('a'), skill('b')]);
    expect(p.startsWith('BASE')).toBe(true);
    expect(p).toMatch(/## Skill: a\nabout a[\s\S]*## Skill: b\nabout b/);
  });
});
