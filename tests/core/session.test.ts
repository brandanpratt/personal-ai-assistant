import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { ModelFn } from '../../src/core/agent.js';
import { createSession } from '../../src/core/session.js';
import type { Skill, SkillContext } from '../../src/core/skill.js';

const echoSkill: Skill = {
  name: 'echo',
  description: 'Echo things.',
  prompt: 'Use echo_say to repeat text.',
  commands: {},
  tools: () => [
    { name: 'echo_say', description: 'Repeat text.', schema: z.object({ text: z.string() }), run: async ({ text }) => `said ${text}` },
  ],
};
const ctxFor = (s: Skill): SkillContext => ({
  stateDir: `/unused/${s.name}`,
  models: { chat: 'c', embed: 'e' },
  confirm: async () => false,
  ask: async () => undefined,
  notify: async () => {},
  log: () => {},
});

function scripted(replies: Awaited<ReturnType<ModelFn>>[], seen: number[] = []): ModelFn {
  let i = 0;
  return async (messages) => {
    seen.push(messages.length);
    return replies[i++]!;
  };
}

describe('createSession', () => {
  it('reports progress through hooks, in order', async () => {
    const model = scripted([
      { content: '', tool_calls: [{ function: { name: 'echo_say', arguments: { text: 'hi' } } }] },
      { content: 'Done.' },
    ]);
    const session = createSession({ skills: [echoSkill], ctxFor, model });
    const events: string[] = [];
    const out = await session.send('say hi', { onThinking: () => events.push('thinking'), onTool: (n) => events.push(`tool:${n}`) });
    expect(out).toBe('Done.');
    expect(events).toEqual(['thinking', 'tool:echo_say', 'thinking']);
  });

  it('keeps the conversation between turns', async () => {
    const seen: number[] = [];
    const session = createSession({ skills: [echoSkill], ctxFor, model: scripted([{ content: 'one' }, { content: 'two' }], seen) });
    await session.send('first');
    await session.send('second');
    // system + user, then system + user + assistant + user
    expect(seen).toEqual([2, 4]);
  });

  it('refuses two skills that share a tool name', () => {
    const clash: Skill = { ...echoSkill, name: 'echo2' };
    expect(() => createSession({ skills: [echoSkill, clash], ctxFor, model: scripted([]) })).toThrow(/echo_say/);
  });
});
