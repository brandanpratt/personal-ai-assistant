import { describe, expect, it } from 'vitest';
import { createPromptBroker } from '../../hud/electron/prompts.js';
import type { HudEvent } from '../../hud/shared/ipc.js';

function setup() {
  const events: HudEvent[] = [];
  const broker = createPromptBroker((e) => events.push(e));
  const lastPrompt = () => events.filter((e): e is Extract<HudEvent, { type: 'prompt' }> => e.type === 'prompt').at(-1)!;
  return { broker, events, lastPrompt };
}

describe('prompt broker', () => {
  it('approves only on a typed "yes" (any case, trimmed)', async () => {
    for (const [typed, approved] of [['yes', true], ['  YES ', true], ['y', false], ['yes please', false], ['no', false], ['', false]] as const) {
      const { broker, lastPrompt } = setup();
      const result = broker.confirm('Move files?');
      broker.answer(lastPrompt().id, typed);
      expect(await result, `typed "${typed}"`).toBe(approved);
    }
  });

  it('treats a cancelled prompt as "no"', async () => {
    const { broker, lastPrompt } = setup();
    const result = broker.confirm('Move files?');
    broker.answer(lastPrompt().id, undefined);
    expect(await result).toBe(false);
  });

  it('returns free text for ask, and undefined when cancelled', async () => {
    const { broker, lastPrompt } = setup();
    const text = broker.ask('Which folder?');
    expect(lastPrompt().kind).toBe('ask');
    broker.answer(lastPrompt().id, 'Taxes');
    expect(await text).toBe('Taxes');

    const cancelled = broker.ask('Again?');
    broker.answer(lastPrompt().id, undefined);
    expect(await cancelled).toBeUndefined();
  });

  it('emits a kind and cleaned question for the renderer', () => {
    const { broker, lastPrompt } = setup();
    void broker.confirm('Move \u202Egnp.exe\u001b[2J?');
    expect(lastPrompt().kind).toBe('confirm');
    expect(lastPrompt().question).not.toMatch(/[\u202E\u001b]/);
  });

  it('ignores answers for unknown or already-answered ids', async () => {
    const { broker, lastPrompt } = setup();
    const result = broker.confirm('Move files?');
    const { id } = lastPrompt();
    broker.answer(id + 99, 'yes'); // wrong id: must not approve anything
    broker.answer(id, 'no');
    broker.answer(id, 'yes'); // second answer is too late
    expect(await result).toBe(false);
  });

  it('cancelAll resolves everything waiting as "no"', async () => {
    const { broker } = setup();
    const a = broker.confirm('one?');
    const b = broker.ask('two?');
    broker.cancelAll();
    expect(await a).toBe(false);
    expect(await b).toBeUndefined();
  });
});
