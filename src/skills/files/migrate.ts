import fs from 'node:fs';
import path from 'node:path';

/** State the files skill wrote directly into the shared state folder before skills had their own. */
const LEGACY_ITEMS = ['journals', 'memory.json', 'reports', 'check.json', 'check.lock'];

/**
 * One-time move of old state into the skill's own folder, so existing undo journals and
 * learned folders keep working. Never overwrites: an item already in the new place is left alone.
 * Returns the names it moved.
 */
export function migrateLegacyState(baseDir: string, skillDir: string): string[] {
  const moved: string[] = [];
  for (const name of LEGACY_ITEMS) {
    const from = path.join(baseDir, name);
    const to = path.join(skillDir, name);
    if (!fs.existsSync(from) || fs.existsSync(to)) continue;
    fs.mkdirSync(skillDir, { recursive: true });
    fs.renameSync(from, to);
    moved.push(name);
  }
  return moved;
}
