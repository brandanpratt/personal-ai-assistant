import fs from 'node:fs';
import type { RunFn } from '../../../src/skills/voice/run.js';

export const FIXTURE = new URL('./fixtures/whisper-full.json', import.meta.url);
export const fixtureJson = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as unknown;

/** Fake ffmpeg + whisper-cli: ffmpeg writes its output wav, whisper writes the fixture JSON at `-of`.json. */
export function fakeRun(json: unknown = fixtureJson()) {
  const calls: { bin: string; args: string[] }[] = [];
  const run: RunFn = async (bin, args) => {
    calls.push({ bin, args });
    if (bin === 'ffmpeg') fs.writeFileSync(args[args.length - 1]!, 'wav');
    else fs.writeFileSync(`${args[args.indexOf('-of') + 1]}.json`, JSON.stringify(json));
    return { stdout: '', stderr: '' };
  };
  return { run, calls };
}
