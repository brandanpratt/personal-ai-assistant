import fs from 'node:fs';
import path from 'node:path';

export class PathEscapeError extends Error {
  constructor(target: string, root: string) {
    super(`Path "${target}" is outside the allowed root "${root}"`);
    this.name = 'PathEscapeError';
  }
}

/** realpath of the deepest existing ancestor, re-joined with the not-yet-existing remainder. */
function realpathLoose(p: string): string {
  const missing: string[] = [];
  let current = path.resolve(p);
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...missing.reverse());
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      const parent = path.dirname(current);
      if (parent === current) throw err;
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

/**
 * Resolves `target` (relative to `root` if not absolute) and guarantees it lies inside `root`,
 * after resolving `..` segments and symlinks. Works for paths that don't exist yet
 * (e.g. move destinations). Throws PathEscapeError otherwise.
 */
export function resolveInside(root: string, target: string): string {
  const realRoot = fs.realpathSync(root);
  const resolved = realpathLoose(path.resolve(realRoot, target));
  const rel = path.relative(realRoot, resolved);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new PathEscapeError(target, realRoot);
  }
  return resolved;
}
