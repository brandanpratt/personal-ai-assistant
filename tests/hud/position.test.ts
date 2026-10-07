import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { forgetPosition, loadPosition, savePosition } from '../../hud/electron/position.js';
import { makeTempDir, removeDir } from '../helpers/fs.js';

let dir: string;
let file: string;
beforeEach(() => {
  dir = makeTempDir('hud');
  file = path.join(dir, 'hud', 'window.json'); // the folder doesn't exist yet
});
afterEach(() => removeDir(dir));

describe('remembered window position', () => {
  it('round-trips, creating the folder', () => {
    savePosition(file, { x: 123.4, y: 456.6 });
    expect(loadPosition(file)).toEqual({ x: 123, y: 457 });
  });

  it('is undefined when nothing was saved', () => {
    expect(loadPosition(file)).toBeUndefined();
  });

  it('ignores a corrupt or wrongly shaped file instead of crashing', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    for (const bad of ['{not json', '{"x":"left","y":1}', '[1,2]', 'null']) {
      fs.writeFileSync(file, bad);
      expect(loadPosition(file), bad).toBeUndefined();
    }
  });

  it('forgets the position, and forgetting twice is fine', () => {
    savePosition(file, { x: 1, y: 2 });
    forgetPosition(file);
    forgetPosition(file);
    expect(loadPosition(file)).toBeUndefined();
  });
});
