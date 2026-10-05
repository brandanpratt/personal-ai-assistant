import readline from 'node:readline';

/**
 * One shared line reader for all prompts. Closed input (Ctrl-D, end of a pipe) yields
 * undefined, which callers treat as "abort / say no".
 */
export function createIO() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  async function ask(question: string): Promise<string | undefined> {
    process.stdout.write(question);
    const next = await lines.next();
    return next.done ? undefined : next.value;
  }
  async function confirm(question: string): Promise<boolean> {
    const answer = await ask(`${question} Type "yes" to continue: `);
    return answer?.trim().toLowerCase() === 'yes';
  }
  return { ask, confirm, close: () => rl.close() };
}
export type IO = ReturnType<typeof createIO>;
