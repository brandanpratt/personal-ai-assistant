import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCoreConfig, numberEnv, required } from '../../src/core/config.js';

describe('core config', () => {
  it('requires the chat model, and defaults the rest', () => {
    expect(() => loadCoreConfig({})).toThrow(/OLLAMA_MODEL/);
    const c = loadCoreConfig({ OLLAMA_MODEL: 'm' });
    expect(c).toMatchObject({ ollamaModel: 'm', embedModel: 'nomic-embed-text' });
    expect(c.stateDir).toBe(path.resolve('.state'));
  });
  it('honours STATE_DIR and EMBED_MODEL', () => {
    expect(loadCoreConfig({ OLLAMA_MODEL: 'm', STATE_DIR: '/s', EMBED_MODEL: 'e' })).toEqual({ stateDir: '/s', ollamaModel: 'm', embedModel: 'e' });
  });
  it('does not require any skill-specific setting', () => {
    expect(() => loadCoreConfig({ OLLAMA_MODEL: 'm' })).not.toThrow();
  });
  it('numberEnv falls back, parses, and rejects junk or negatives', () => {
    expect(numberEnv({}, 'X', 5)).toBe(5);
    expect(numberEnv({ X: '' }, 'X', 5)).toBe(5);
    expect(numberEnv({ X: '7' }, 'X', 5)).toBe(7);
    expect(() => numberEnv({ X: 'abc' }, 'X', 5)).toThrow(/X must be/);
    expect(() => numberEnv({ X: '-1' }, 'X', 5)).toThrow(/X must be/);
    expect(() => required({}, 'Y')).toThrow(/Y/);
  });
});
