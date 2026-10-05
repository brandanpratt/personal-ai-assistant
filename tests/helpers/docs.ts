import type { Doc } from '../../src/skills/files/clusterText.js';

/** A fake readable document, for tests that don't touch the disk. */
export const makeDoc = (name: string, over: Partial<Doc> = {}): Doc => ({
  file: { path: `/r/${name}`, name, ext: 'pdf', size: 1, modified: new Date(0) },
  text: `text of ${name}`,
  embedInput: name,
  ...over,
});
