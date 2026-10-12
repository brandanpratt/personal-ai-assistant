import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadVoiceConfig, requireWhisperModel } from '../../../src/skills/voice/config.js';
import { findExecutable } from '../../../src/skills/voice/run.js';

describe('voice config', () => {
  it('has working defaults and needs nothing to load', () => {
    const c = loadVoiceConfig({});
    expect(c).toMatchObject({ inbox: path.join(os.homedir(), 'voice-inbox'), ffmpeg: 'ffmpeg', whisperBin: 'whisper-cli', whisperModel: undefined, uncertainP: 0.5 });
    expect(() => requireWhisperModel(c)).toThrow(/WHISPER_MODEL/);
  });

  it('expands ~ and falls back to the chat model for interpreting', () => {
    const c = loadVoiceConfig({ WHISPER_MODEL: '~/m/ggml.bin', OLLAMA_MODEL: 'llama3.1:8b' });
    expect(requireWhisperModel(c)).toBe(path.join(os.homedir(), 'm/ggml.bin'));
    expect(c.llmModel).toBe('llama3.1:8b');
    expect(loadVoiceConfig({ OLLAMA_MODEL: 'a', VOICE_LLM_MODEL: 'b' }).llmModel).toBe('b');
  });

  it('rejects a confidence threshold above 1', () => {
    expect(() => loadVoiceConfig({ VOICE_UNCERTAIN_P: '2' })).toThrow(/between 0 and 1/);
  });

  it('finds executables on PATH without running them', () => {
    expect(findExecutable('sh', '/bin')).toBe('/bin/sh');
    expect(findExecutable('definitely-not-a-binary', '/bin')).toBeUndefined();
  });
});
