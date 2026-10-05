import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateLegacyState } from '../../../src/skills/files/migrate.js';
import { makeTempDir, removeDir } from '../../helpers/fs.js';

let base: string, skillDir: string;
const w = (rel: string, body = 'x') => {
  fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
  fs.writeFileSync(path.join(base, rel), body);
};
const read = (rel: string) => fs.readFileSync(path.join(base, rel), 'utf8');

beforeEach(() => {
  base = makeTempDir('migrate');
  skillDir = path.join(base, 'files');
});
afterEach(() => removeDir(base));

describe('migrateLegacyState', () => {
  it('moves legacy journals and memory into the skill folder, contents intact', () => {
    w('journals/run1.jsonl', 'journal');
    w('memory.json', 'memory');
    expect(migrateLegacyState(base, skillDir).sort()).toEqual(['journals', 'memory.json']);
    expect(read('files/journals/run1.jsonl')).toBe('journal');
    expect(read('files/memory.json')).toBe('memory');
    expect(fs.existsSync(path.join(base, 'memory.json'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'journals'))).toBe(false);
  });

  it('is a no-op the second time and when there is nothing to migrate', () => {
    expect(migrateLegacyState(base, skillDir)).toEqual([]);
    w('memory.json');
    migrateLegacyState(base, skillDir);
    expect(migrateLegacyState(base, skillDir)).toEqual([]);
  });

  it('never overwrites something already in the new location', () => {
    w('memory.json', 'old');
    w('files/memory.json', 'new');
    expect(migrateLegacyState(base, skillDir)).toEqual([]);
    expect(read('files/memory.json')).toBe('new');
    expect(read('memory.json')).toBe('old');
  });

  it('leaves other skills\' folders and unrelated files alone', () => {
    w('finance/memory.json', 'finance');
    w('notes.txt', 'keep');
    migrateLegacyState(base, skillDir);
    expect(read('finance/memory.json')).toBe('finance');
    expect(read('notes.txt')).toBe('keep');
  });
});
