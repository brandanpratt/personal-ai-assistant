import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PathEscapeError, resolveInside } from '../../../src/core/safety/pathGuard.js';

let base: string;
let root: string;
let outside: string;

beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'guard-')));
  root = path.join(base, 'root');
  outside = path.join(base, 'outside');
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(root, 'a.txt'), 'a');
});
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

describe('resolveInside', () => {
  it('accepts existing and relative paths inside root', () => {
    expect(resolveInside(root, 'a.txt')).toBe(path.join(root, 'a.txt'));
    expect(resolveInside(root, path.join(root, 'a.txt'))).toBe(path.join(root, 'a.txt'));
    expect(resolveInside(root, '.')).toBe(root);
  });

  it('accepts not-yet-existing destinations inside root', () => {
    expect(resolveInside(root, 'Images/new/pic.png')).toBe(path.join(root, 'Images/new/pic.png'));
  });

  it('rejects .. traversal', () => {
    expect(() => resolveInside(root, '../outside/x')).toThrow(PathEscapeError);
    expect(() => resolveInside(root, 'sub/../../outside')).toThrow(PathEscapeError);
  });

  it('rejects absolute paths elsewhere', () => {
    expect(() => resolveInside(root, outside)).toThrow(PathEscapeError);
  });

  it('rejects sibling dirs sharing a name prefix', () => {
    const sibling = root + '-evil';
    fs.mkdirSync(sibling);
    expect(() => resolveInside(root, sibling)).toThrow(PathEscapeError);
  });

  it('rejects symlinks that point outside root', () => {
    fs.symlinkSync(outside, path.join(root, 'link'));
    expect(() => resolveInside(root, 'link/file.txt')).toThrow(PathEscapeError);
  });
});
