import fs from 'node:fs';
import { Ollama } from 'ollama';
import type { Command, SkillContext } from '../../core/skill.js';
import { errorMessage } from '../../core/util.js';
import { loadVoiceConfig, requireWhisperModel, type VoiceConfig } from './config.js';
import { clean, formatTranscript } from './format.js';
import { findNote, listInbox } from './inbox.js';
import { findExecutable, installHint, runBinary } from './run.js';
import { transcribeFile, type TranscribeDeps } from './transcribe.js';

const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin';

export function transcribeDeps(ctx: SkillContext, cfg: VoiceConfig): TranscribeDeps {
  return {
    stateDir: ctx.stateDir,
    run: runBinary,
    ffmpeg: cfg.ffmpeg,
    whisperBin: cfg.whisperBin,
    whisperModel: requireWhisperModel(cfg),
    uncertainP: cfg.uncertainP,
  };
}

const doctor: Command = {
  description: 'Check that ffmpeg, whisper.cpp, the Whisper model and the inbox folder are set up.',
  run: async () => {
    const cfg = loadVoiceConfig();
    const rows: [boolean, string, string][] = [];
    for (const bin of [cfg.ffmpeg, cfg.whisperBin]) {
      const found = findExecutable(bin);
      rows.push([!!found, bin, found ?? `not found. Fix: ${installHint(bin)}`]);
    }
    const model = cfg.whisperModel;
    rows.push(model && fs.existsSync(model)
      ? [true, 'Whisper model', model]
      : [false, 'Whisper model', model
        ? `${model} does not exist. Download: curl -L --create-dirs -o "${model}" ${MODEL_URL}`
        : `WHISPER_MODEL not set. Download one, e.g.: curl -L --create-dirs -o ~/whisper-models/ggml-large-v3-turbo.bin ${MODEL_URL}\n      then add WHISPER_MODEL=~/whisper-models/ggml-large-v3-turbo.bin to .env`]);
    rows.push(fs.existsSync(cfg.inbox)
      ? [true, 'Inbox', cfg.inbox]
      : [false, 'Inbox', `${cfg.inbox} does not exist. Fix: mkdir -p "${cfg.inbox}" (or set VOICE_INBOX)`]);
    if (cfg.llmModel) {
      let state: [boolean, string];
      try {
        const names = (await new Ollama().list()).models.map((m) => m.name);
        state = names.includes(cfg.llmModel) ? [true, cfg.llmModel] : [false, `${cfg.llmModel} not pulled. Fix: ollama pull ${cfg.llmModel}`];
      } catch (err) {
        state = [false, `Ollama not reachable (${errorMessage(err)}). Start the Ollama app.`];
      }
      rows.push([state[0], 'Interpreter model', `${state[1]} (used by "explain")`]);
    }
    for (const [ok, what, detail] of rows) console.log(`  ${ok ? 'ok  ' : 'FIX '} ${what.padEnd(17)} ${detail}`);
    console.log(rows.every((r) => r[0]) ? '\nAll set.' : '\nFix the lines marked FIX, then run this again.');
  },
};

const list: Command = {
  description: 'List voice notes in the inbox with their ids.',
  run: async (ctx) => {
    const cfg = loadVoiceConfig();
    const notes = listInbox(cfg.inbox, ctx.stateDir);
    if (notes.length === 0) return console.log(`No voice notes in ${cfg.inbox}. Save WhatsApp voice notes there.`);
    for (const n of notes) {
      const date = n.modified.toISOString().slice(0, 16).replace('T', ' ');
      console.log(`  ${n.id}  ${date}  ${(n.transcribed ? 'transcribed' : 'new').padEnd(11)}  ${clean(n.name, 50)}`);
    }
  },
};

const transcribe: Command = {
  description: 'Transcribe new inbox notes, or one note by id or file path. Add --force to redo.',
  run: async (ctx, args) => {
    const force = args.includes('--force');
    const target = args.find((a) => a !== '--force');
    const cfg = loadVoiceConfig();
    const deps = transcribeDeps(ctx, cfg);

    let jobs: { file: string; hash?: string }[];
    if (target && (target.includes('/') || fs.existsSync(target))) jobs = [{ file: target }];
    else {
      const notes = listInbox(cfg.inbox, ctx.stateDir);
      const picked = target ? [findNote(notes, target)] : notes.filter((n) => force || !n.transcribed);
      if (picked.length === 0) return console.log('No new voice notes to transcribe. See all with: npm run dev -- voice list');
      jobs = picked.map((n) => ({ file: n.file, hash: n.hash }));
    }

    for (const [i, job] of jobs.entries()) {
      if (jobs.length > 1) ctx.log(`[${i + 1}/${jobs.length}] transcribing...`);
      try {
        const { transcript, cached } = await transcribeFile(deps, job.file, { force, hash: job.hash });
        console.log(`\n${formatTranscript(transcript)}${cached ? '\n  (cached)' : ''}`);
      } catch (err) {
        console.log(`\n${clean(job.file, 80)}: ${errorMessage(err)}`);
      }
    }
  },
};

export const voiceCommands: Record<string, Command> = { doctor, list, transcribe };
