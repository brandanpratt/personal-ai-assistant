import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveCommand, createRegistry } from '../../../src/core/skill.js';
import { accountsFile, loadAccounts, removeAccount, saveAccount } from '../../../src/skills/email/accounts.js';
import { loadGmailConfig, loadOutlookConfig } from '../../../src/skills/email/config.js';
import { clean, formatHeaders } from '../../../src/skills/email/format.js';
import { emailSkill } from '../../../src/skills/email/index.js';
import { filesSkill } from '../../../src/skills/files/index.js';
import { makeTempDir, removeDir } from '../../helpers/fs.js';

describe('email config', () => {
  it('points to the setup guide when a value is missing or empty', () => {
    expect(() => loadGmailConfig({ GMAIL_CLIENT_ID: 'x', GMAIL_CLIENT_SECRET: '' })).toThrow(/GMAIL_CLIENT_SECRET.*docs\/email-setup\.md/);
    expect(() => loadOutlookConfig({})).toThrow(/OUTLOOK_CLIENT_ID.*docs\/email-setup\.md/);
  });
  it('reads each provider independently', () => {
    expect(loadOutlookConfig({ OUTLOOK_CLIENT_ID: 'o' })).toEqual({ clientId: 'o' });
    expect(loadGmailConfig({ GMAIL_CLIENT_ID: 'g', GMAIL_CLIENT_SECRET: 's' })).toEqual({ clientId: 'g', clientSecret: 's' });
  });
});

describe('accounts', () => {
  let dir: string;
  beforeEach(() => { dir = makeTempDir('email-accounts'); });
  afterEach(() => removeDir(dir));

  it('saves, replaces (case-insensitive) and removes accounts, never storing tokens', () => {
    saveAccount(dir, { provider: 'gmail', address: 'Me@gmail.com', connectedAt: '1' });
    saveAccount(dir, { provider: 'outlook', address: 'me@outlook.com', connectedAt: '1' });
    saveAccount(dir, { provider: 'gmail', address: 'me@GMAIL.com', connectedAt: '2' });
    expect(loadAccounts(dir).map((a) => [a.provider, a.connectedAt])).toEqual([['outlook', '1'], ['gmail', '2']]);
    removeAccount(dir, { provider: 'outlook', address: 'ME@outlook.com', connectedAt: '' });
    expect(loadAccounts(dir).map((a) => a.provider)).toEqual(['gmail']);
    expect(Object.keys(JSON.parse(fs.readFileSync(accountsFile(dir), 'utf8'))[0]).sort()).toEqual(['address', 'connectedAt', 'provider']);
  });

  it('ignores a missing or corrupt file and bad entries', () => {
    expect(loadAccounts(dir)).toEqual([]);
    fs.writeFileSync(accountsFile(dir), '[{"provider":"yahoo","address":"a","connectedAt":"1"}, 5]');
    expect(loadAccounts(dir)).toEqual([]);
    fs.writeFileSync(accountsFile(dir), 'not json');
    expect(loadAccounts(dir)).toEqual([]);
  });
});

describe('printing untrusted email text', () => {
  it('strips terminal escape codes, other control characters and bidi overrides', () => {
    expect(clean('Invoice\u001b[2J\u001b[31m paid\r\nnow')).toBe('Invoice [2J [31m paid now');
    expect(clean('abc\u202Egpj.exe')).toBe('abc gpj.exe');
  });
  it('caps length', () => {
    expect(clean('x'.repeat(100), 10)).toBe(`${'x'.repeat(9)}…`);
  });
  it('formats a header list', () => {
    const now = new Date(2026, 0, 2, 12, 0);
    const out = formatHeaders([{ from: 'A <a@x>', subject: '', date: new Date(2026, 0, 2, 9, 5), unread: true }], now);
    expect(out).toContain('● 09:05');
    expect(out).toContain('(no subject)');
    expect(formatHeaders([])).toContain('no messages');
  });
});

describe('email skill registration', () => {
  const skills = createRegistry([filesSkill, emailSkill]);
  it('adds commands without breaking the files default or shortcuts', () => {
    expect(resolveCommand(skills, [])).toMatchObject({ skill: { name: 'files' }, command: 'plan' });
    expect(resolveCommand(skills, ['organize'])).toMatchObject({ skill: { name: 'files' } });
    expect(resolveCommand(skills, ['recent', '5'])).toMatchObject({ skill: { name: 'email' }, command: 'recent', args: ['5'] });
    expect(resolveCommand(skills, ['email', 'connect', 'gmail'])).toMatchObject({ command: 'connect', args: ['gmail'] });
  });
  it('exposes no chat tools yet', () => {
    expect(emailSkill.tools({} as never)).toEqual([]);
  });
});
