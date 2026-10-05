import fs from 'node:fs';
import path from 'node:path';
import { categorize, type Category } from './categories.js';
import { resolveInside } from '../../core/safety/pathGuard.js';
import type { FileInfo } from './scanner.js';

export interface Move {
  from: string;
  to: string;
  category: Category;
}

export interface Plan {
  moves: Move[];
  /** Files no rule matched; left untouched (candidates for LLM classification later). */
  unclassified: FileInfo[];
  /** Files already sitting in their category folder. */
  alreadyOrganized: FileInfo[];
}

/** Picks "name.ext", then "name (1).ext", "name (2).ext"... avoiding disk and planned collisions. */
function uniqueDestination(dir: string, name: string, taken: Set<string>): string {
  const { name: stem, ext } = path.parse(name);
  // macOS volumes are usually case-insensitive, so compare lowercased.
  const isTaken = (p: string) => taken.has(p.toLowerCase()) || fs.existsSync(p);
  let candidate = path.join(dir, name);
  for (let i = 1; isTaken(candidate); i++) {
    candidate = path.join(dir, `${stem} (${i})${ext}`);
  }
  return candidate;
}

/**
 * Pure planning step: decides moves but touches nothing on disk.
 * `placement` optionally maps a file path to a topic subfolder, nested inside its type folder
 * (e.g. Documents/Resumes/cv.pdf).
 */
export function planMoves(root: string, files: FileInfo[], placement?: ReadonlyMap<string, string>): Plan {
  const plan: Plan = { moves: [], unclassified: [], alreadyOrganized: [] };
  const taken = new Set<string>();

  for (const file of files) {
    const category = categorize(file.ext);
    if (!category) {
      plan.unclassified.push(file);
      continue;
    }
    const topic = placement?.get(file.path);
    const destDir = resolveInside(root, topic ? path.join(category, topic) : category);
    if (path.dirname(file.path) === destDir) {
      plan.alreadyOrganized.push(file);
      continue;
    }
    const to = resolveInside(root, uniqueDestination(destDir, file.name, taken));
    taken.add(to.toLowerCase());
    plan.moves.push({ from: file.path, to, category });
  }
  return plan;
}

/** Compact view: one line per destination folder with its file count. */
export function formatPlanSummary(root: string, plan: Plan, title = 'DRY RUN: nothing has been moved.'): string {
  const counts = new Map<string, number>();
  for (const m of plan.moves) {
    const dir = path.relative(root, path.dirname(m.to));
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  const lines = [title, ''];
  for (const [dir, n] of [...counts].sort(([a], [b]) => (a < b ? -1 : 1))) lines.push(`  ${String(n).padStart(4)}  ${dir}/`);
  lines.push('', `${plan.moves.length} to move, ${plan.unclassified.length} unclassified (left alone), ${plan.alreadyOrganized.length} already organized.`);
  return lines.join('\n');
}

export function formatPlan(root: string, plan: Plan): string {
  const rel = (p: string) => path.relative(root, p);
  const lines = [`DRY RUN: nothing has been moved.`, ''];
  for (const m of plan.moves) lines.push(`  ${rel(m.from)}  ->  ${rel(m.to)}`);
  lines.push(
    '',
    `${plan.moves.length} to move, ${plan.unclassified.length} unclassified (left alone), ${plan.alreadyOrganized.length} already organized.`,
  );
  if (plan.unclassified.length) {
    lines.push('Unclassified:', ...plan.unclassified.map((f) => `  ${f.name}`));
  }
  return lines.join('\n');
}
