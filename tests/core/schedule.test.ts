import { describe, expect, it } from 'vitest';
import { buildPlist } from '../../src/core/schedule.js';

describe('buildPlist', () => {
  it('builds absolute-path arguments, a schedule, no RunAtLoad, and escapes XML', () => {
    const p = buildPlist({ projectDir: '/Users/a&b/proj', nodePath: '/usr/local/bin/node', intervalSeconds: 21600 });
    expect(p).toContain('<string>/Users/a&amp;b/proj/node_modules/.bin/tsx</string>');
    expect(p).toContain('<string>check</string>');
    expect(p).toContain('/src/cli.ts</string>');
    expect(p).toContain('<integer>21600</integer>');
    expect(p).toContain('<key>RunAtLoad</key><false/>');
    for (const cmd of ['apply', 'organize', 'undo', 'chat']) expect(p).not.toContain(`<string>${cmd}</string>`);
  });
});
