import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { ModelFn } from '../../src/core/agent.js';
import { createSession, type Session } from '../../src/core/session.js';
import type { Skill, SkillContext } from '../../src/core/skill.js';
import { createHudAgent } from '../../hud/electron/agent.js';
import { createPromptBroker } from '../../hud/electron/prompts.js';
import type { HudEvent } from '../../hud/shared/ipc.js';

const fakeSession = (send: Session['send']): (() => Promise<Session>) => async () => ({ send });

describe('HUD agent', () => {
  it('streams thinking, tool and reply events for a turn', async () => {
    const events: HudEvent[] = [];
    const agent = createHudAgent({
      emit: (e) => events.push(e),
      getSession: fakeSession(async (_text, hooks) => {
        hooks?.onThinking?.();
        hooks?.onTool?.('files_list', {});
        return 'You have 3 files.';
      }),
    });
    await agent.submit('what is in my folder?');
    expect(events.map((e) => e.type)).toEqual(['thinking', 'thinking', 'tool', 'reply']);
    expect(events.at(-1)).toEqual({ type: 'reply', text: 'You have 3 files.' });
  });

  it('cleans untrusted characters out of the reply', async () => {
    const events: HudEvent[] = [];
    const agent = createHudAgent({ emit: (e) => events.push(e), getSession: fakeSession(async () => 'ok\u202Eevil\u001b[2J') });
    await agent.submit('hi');
    const reply = events.at(-1) as Extract<HudEvent, { type: 'reply' }>;
    expect(reply.text).not.toMatch(/[\u202E\u001b]/);
  });

  it('turns a model failure into an error event and stays usable', async () => {
    const events: HudEvent[] = [];
    let fail = true;
    const agent = createHudAgent({
      emit: (e) => events.push(e),
      getSession: fakeSession(async () => {
        if (fail) throw new Error('connection refused');
        return 'back';
      }),
    });
    await agent.submit('one');
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('Is Ollama running?') });
    fail = false;
    await agent.submit('two');
    expect(events.at(-1)).toEqual({ type: 'reply', text: 'back' });
  });

  it('reports a failed start (e.g. missing OLLAMA_MODEL) without blaming Ollama', async () => {
    const events: HudEvent[] = [];
    const agent = createHudAgent({
      emit: (e) => events.push(e),
      getSession: async () => {
        throw new Error('Missing required env var: OLLAMA_MODEL');
      },
    });
    await agent.submit('hi');
    const err = events.at(-1) as Extract<HudEvent, { type: 'error' }>;
    expect(err.message).toContain("Couldn't start");
    expect(err.message).toContain('OLLAMA_MODEL');
    expect(err.message).not.toContain('Ollama running');
  });

  it('refuses a second request while one is running', async () => {
    const events: HudEvent[] = [];
    let release!: () => void;
    const agent = createHudAgent({
      emit: (e) => events.push(e),
      getSession: fakeSession(() => new Promise<string>((r) => { release = () => r('done'); })),
    });
    const first = agent.submit('slow');
    await new Promise((r) => setTimeout(r, 0));
    await agent.submit('impatient');
    expect(events.at(-1)).toMatchObject({ type: 'error', message: 'Still working on the last request.' });
    release();
    await first;
    expect(events.at(-1)).toEqual({ type: 'reply', text: 'done' });
  });
});

describe('HUD approval flow, end to end', () => {
  // A skill whose tool changes something only after ctx.confirm. In the HUD that confirm is the broker.
  function setup(typed: string | undefined) {
    const events: HudEvent[] = [];
    let changed = false;
    const broker = createPromptBroker((e) => {
      events.push(e);
      if (e.type === 'prompt') broker.answer(e.id, typed); // the human's answer arriving from the input box
    });
    const skill: Skill = {
      name: 'danger',
      description: 'Changes things.',
      prompt: 'Use danger_do.',
      commands: {},
      tools: (ctx) => [
        {
          name: 'danger_do',
          description: 'Do it (needs approval).',
          schema: z.object({}),
          run: async () => {
            if (!(await ctx.confirm('Do the thing?'))) return 'The user declined.';
            changed = true;
            return 'Done.';
          },
        },
      ],
    };
    const ctxFor = (s: Skill): SkillContext => ({
      stateDir: `/unused/${s.name}`,
      models: { chat: 'c', embed: 'e' },
      confirm: broker.confirm,
      ask: broker.ask,
      notify: async () => {},
      log: () => {},
    });
    const replies = [
      { content: '', tool_calls: [{ function: { name: 'danger_do', arguments: {} } }] },
      { content: 'All set.' },
    ];
    let i = 0;
    const model: ModelFn = async () => replies[i++]!;
    const session = createSession({ skills: [skill], ctxFor, model });
    const agent = createHudAgent({ emit: (e) => events.push(e), getSession: async () => session });
    return { agent, events, changed: () => changed };
  }

  it('does nothing until the human types "yes"', async () => {
    const { agent, events, changed } = setup('yes');
    await agent.submit('do the thing');
    expect(events.map((e) => e.type)).toContain('prompt');
    expect(changed()).toBe(true);
  });

  it('does nothing when the human answers anything else or cancels', async () => {
    for (const typed of ['no', 'sure', undefined]) {
      const { agent, changed } = setup(typed);
      await agent.submit('do the thing');
      expect(changed(), `typed ${String(typed)}`).toBe(false);
    }
  });
});
