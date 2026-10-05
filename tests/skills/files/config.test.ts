import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadFilesConfig } from '../../../src/skills/files/config.js';

describe('files config', () => {
  it('requires ALLOWED_ROOT with a clear message', () => {
    expect(() => loadFilesConfig({})).toThrow(/ALLOWED_ROOT/);
  });
  it('expands ~ and applies check defaults', () => {
    expect(loadFilesConfig({ ALLOWED_ROOT: '~/Downloads' })).toEqual({
      allowedRoot: path.join(os.homedir(), 'Downloads'),
      checkMinFiles: 15, checkCooldownHours: 24, checkMinAgeMinutes: 10,
    });
  });
  it('reads check overrides', () => {
    expect(loadFilesConfig({ ALLOWED_ROOT: '/x', CHECK_MIN_FILES: '3' }).checkMinFiles).toBe(3);
  });
});
