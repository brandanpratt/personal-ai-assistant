import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scan } from '../src/scanner.js';

let base: string;
let root: string;

beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scan-')));
  root = path.join(base, 'root');
  fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Photo.PNG'), 'xx');
  fs.writeFileSync(path.join(root, 'notes'), 'n');
  fs.writeFileSync(path.join(root, '.hidden'), 'h');
  fs.writeFileSync(path.join(root, 'sub', 'deep.pdf'), 'd');
  fs.mkdirSync(path.join(base, 'outside'));
  fs.writeFileSync(path.join(base, 'outside', 'secret.txt'), 's');
  fs.symlinkSync(path.join(base, 'outside'), path.join(root, 'link'));
});
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

describe('scan', () => {
  it('lists root-level files only by default, with metadata', async () => {
    const files = await scan(root);
    expect(files.map((f) => f.name)).toEqual(['Photo.PNG', 'notes']);
    expect(files[0]).toMatchObject({ ext: 'png', size: 2 });
    expect(files[1]?.ext).toBe('');
  });

  it('descends when maxDepth allows, never following symlinks', async () => {
    const names = (await scan(root, { maxDepth: 2 })).map((f) => f.name);
    expect(names).toContain('deep.pdf');
    expect(names).not.toContain('secret.txt');
  });

  it('includes hidden files only when asked', async () => {
    expect((await scan(root, { includeHidden: true })).map((f) => f.name)).toContain('.hidden');
  });
});
