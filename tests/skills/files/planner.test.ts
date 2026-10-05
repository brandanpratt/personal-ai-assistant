import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { categorize } from '../../../src/skills/files/categories.js';
import { planMoves } from '../../../src/skills/files/planner.js';
import { scan } from '../../../src/skills/files/scanner.js';

let root: string;
const touch = (rel: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), 'x');
};

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'plan-')));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('categorize', () => {
  it('maps known extensions and returns undefined otherwise', () => {
    expect(categorize('png')).toBe('Images');
    expect(categorize('dmg')).toBe('Installers');
    expect(categorize('apk')).toBe('Installers');
    expect(categorize('pptx')).toBe('Presentations');
    expect(categorize('otf')).toBe('Fonts');
    expect(categorize('bz2')).toBe('Archives');
    expect(categorize('xyz')).toBeUndefined();
    expect(categorize('')).toBeUndefined();
  });
});

describe('planMoves', () => {
  it('plans moves into category folders and leaves unknowns alone', async () => {
    touch('a.png');
    touch('b.pdf');
    touch('mystery.xyz');
    const plan = planMoves(root, await scan(root));
    expect(plan.moves.map((m) => path.relative(root, m.to))).toEqual(['Images/a.png', 'Documents/b.pdf']);
    expect(plan.unclassified.map((f) => f.name)).toEqual(['mystery.xyz']);
  });

  it('is a pure dry run: touches nothing on disk', async () => {
    touch('a.png');
    planMoves(root, await scan(root));
    expect(fs.existsSync(path.join(root, 'a.png'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'Images'))).toBe(false);
  });

  it('avoids collisions with existing files', async () => {
    touch('Images/a.png');
    touch('a.png');
    const plan = planMoves(root, await scan(root));
    expect(path.relative(root, plan.moves[0]!.to)).toBe('Images/a (1).png');
  });

  it('avoids collisions between planned moves, case-insensitively', async () => {
    touch('a.png');
    touch('sub/A.PNG');
    const plan = planMoves(root, await scan(root, { maxDepth: 1 }));
    const dests = plan.moves.map((m) => m.to.toLowerCase());
    expect(new Set(dests).size).toBe(2);
  });

  it('skips files already in their category folder', async () => {
    touch('Images/a.png');
    const plan = planMoves(root, await scan(root, { maxDepth: 1 }));
    expect(plan.moves).toEqual([]);
    expect(plan.alreadyOrganized).toHaveLength(1);
  });
});
