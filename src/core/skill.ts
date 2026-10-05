import type { z } from 'zod';

/** A function the chat model may call. Keep arguments simple (numbers, short strings, enums). */
export interface Tool {
  name: string;
  description: string;
  schema: z.ZodType;
  run: (args: any) => Promise<string>;
}

/** Everything a skill is allowed to use from the shared core. Skills never import each other. */
export interface SkillContext {
  /** This skill's private folder (journals, memory, reports). Created on demand. */
  stateDir: string;
  models: { chat: string; embed: string };
  /** Ask the human to approve something. The only approval channel; the model can't answer it. */
  confirm: (question: string) => Promise<boolean>;
  ask: (question: string) => Promise<string | undefined>;
  notify: (title: string, text: string) => Promise<void>;
  log: (message: string) => void;
}

export interface Command {
  description: string;
  run: (ctx: SkillContext, args: string[]) => Promise<void>;
}

/**
 * A skill is a self-contained capability (files, finance, email...). Rules:
 *  - Tools take no file paths or secrets; only code builds paths.
 *  - Anything that changes the outside world asks `ctx.confirm` first.
 *  - Scheduled `check` is notify-only and must never change anything.
 *  - Read your own config lazily (inside tools/commands), so a missing setting in one skill
 *    never breaks another.
 */
export interface Skill {
  /** lowercase letters, digits and dashes; used for the state folder and CLI */
  name: string;
  description: string;
  /** Guidance appended to the shared system prompt when chatting. */
  prompt: string;
  /** Called once before anything else (e.g. migrate old state). */
  init?: (ctx: SkillContext) => Promise<void> | void;
  tools: (ctx: SkillContext) => Tool[];
  commands: Record<string, Command>;
  /** Run when no command is given and this is the only skill with a default. */
  defaultCommand?: string;
  /** Scheduled, notify-only background check. Returns one line for the log. */
  check?: (ctx: SkillContext) => Promise<string>;
}

const NAME = /^[a-z][a-z0-9-]*$/;

/** Validates a list of skills and returns it. Throws on bad or duplicate names. */
export function createRegistry(skills: Skill[]): Skill[] {
  const seen = new Set<string>();
  for (const s of skills) {
    if (!NAME.test(s.name)) throw new Error(`Invalid skill name "${s.name}" (use lowercase letters, digits, dashes)`);
    if (seen.has(s.name)) throw new Error(`Duplicate skill name "${s.name}"`);
    seen.add(s.name);
    if (s.defaultCommand && !s.commands[s.defaultCommand]) {
      throw new Error(`Skill "${s.name}": defaultCommand "${s.defaultCommand}" is not one of its commands`);
    }
  }
  return skills;
}

/** Collects every skill's tools, failing fast if two skills use the same tool name. */
export function collectTools(skills: Skill[], ctxFor: (skill: Skill) => SkillContext): Tool[] {
  const owner = new Map<string, string>();
  const tools: Tool[] = [];
  for (const skill of skills) {
    for (const tool of skill.tools(ctxFor(skill))) {
      const prev = owner.get(tool.name);
      if (prev) throw new Error(`Tool name "${tool.name}" is used by both "${prev}" and "${skill.name}". Prefix tool names with the skill name.`);
      owner.set(tool.name, skill.name);
      tools.push(tool);
    }
  }
  return tools;
}

export type Resolved = { skill: Skill; command: string; args: string[] } | { error: string };

/**
 * Resolves CLI words to a skill command:
 *   `files plan`  -> explicit skill + command
 *   `plan`        -> shortcut, only when exactly one skill has that command
 *   (nothing)     -> the one skill's defaultCommand, if exactly one skill has one
 */
export function resolveCommand(skills: Skill[], words: string[]): Resolved {
  const [first, second, ...rest] = words;
  if (first === undefined) {
    const withDefault = skills.filter((s) => s.defaultCommand);
    if (withDefault.length === 1) return { skill: withDefault[0]!, command: withDefault[0]!.defaultCommand!, args: [] };
    return { error: 'No command given.' };
  }
  const bySkill = skills.find((s) => s.name === first);
  if (bySkill) {
    if (!second) return { error: `Skill "${first}" needs a command: ${Object.keys(bySkill.commands).join(', ')}` };
    if (!bySkill.commands[second]) return { error: `Skill "${first}" has no command "${second}". Available: ${Object.keys(bySkill.commands).join(', ')}` };
    return { skill: bySkill, command: second, args: rest };
  }
  const owners = skills.filter((s) => s.commands[first]);
  if (owners.length === 1) return { skill: owners[0]!, command: first, args: [second, ...rest].filter((x): x is string => x !== undefined) };
  if (owners.length > 1) return { error: `"${first}" exists in several skills (${owners.map((s) => s.name).join(', ')}). Say which: <skill> ${first}` };
  return { error: `Unknown command "${first}".` };
}

export function composeSystemPrompt(base: string, skills: Skill[]): string {
  return [base, ...skills.map((s) => `## Skill: ${s.name}\n${s.prompt}`)].join('\n\n');
}
