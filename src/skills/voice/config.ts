import path from 'node:path';
import { expandHome, numberEnv } from '../../core/config.js';

type Env = Record<string, string | undefined>;

export interface VoiceConfig {
  /** Drop folder: save WhatsApp voice notes here. Read only; notes are never moved or changed. */
  inbox: string;
  ffmpeg: string;
  whisperBin: string;
  /** Path to a ggml Whisper model. Optional here so `list` and `doctor` work before it's set up. */
  whisperModel: string | undefined;
  /** Ollama model that turns transcripts into plain English. */
  llmModel: string | undefined;
  /** Words Whisper is less sure of than this are marked [?word]. */
  uncertainP: number;
  checkCooldownHours: number;
}

export function loadVoiceConfig(env: Env = process.env): VoiceConfig {
  const uncertainP = numberEnv(env, 'VOICE_UNCERTAIN_P', 0.5);
  if (uncertainP > 1) throw new Error(`VOICE_UNCERTAIN_P must be between 0 and 1, got "${env.VOICE_UNCERTAIN_P}"`);
  return {
    inbox: path.resolve(expandHome(env.VOICE_INBOX || '~/voice-inbox')),
    ffmpeg: env.FFMPEG_BIN || 'ffmpeg',
    whisperBin: env.WHISPER_BIN || 'whisper-cli',
    whisperModel: env.WHISPER_MODEL ? path.resolve(expandHome(env.WHISPER_MODEL)) : undefined,
    llmModel: env.VOICE_LLM_MODEL || env.OLLAMA_MODEL || undefined,
    uncertainP,
    checkCooldownHours: numberEnv(env, 'VOICE_CHECK_COOLDOWN_HOURS', 6),
  };
}

/** The model path, or a clear error saying how to get one. */
export function requireWhisperModel(cfg: VoiceConfig): string {
  if (!cfg.whisperModel) throw new Error('Missing WHISPER_MODEL (path to a ggml Whisper model). Run: npm run dev -- voice doctor');
  return cfg.whisperModel;
}
