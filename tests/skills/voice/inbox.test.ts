import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findNote, listInbox } from '../../../src/skills/voice/inbox.js';
import { transcribeFile } from '../../../src/skills/voice/transcribe.js';
import { makeTempDir, removeDir, writeFile } from '../../helpers/fs.js';
import { fakeRun } from './helpers.js';

let base: string, inbox: string, state: string;
const touch = (rel: string, minutesAgo: number) => {
  const t = new Date(Date.now() - minutesAgo * 60_000);
  fs.utimesSync(path.join(inbox, rel), t, t);
};
beforeEach(() => {
  base = makeTempDir('inbox');
  inbox = path.join(base, 'inbox');
  state = path.join(base, 'state');
  writeFile(inbox, 'old.opus', 'one');
  writeFile(inbox, 'new.OGG', 'two');
  writeFile(inbox, 'notes.txt', 'not audio');
  writeFile(inbox, '.hidden.opus', 'three');
  writeFile(inbox, 'sub/inner.opus', 'four');
  fs.symlinkSync(path.join(inbox, 'old.opus'), path.join(inbox, 'link.opus'));
  touch('old.opus', 60);
  touch('new.OGG', 5);
});
afterEach(() => removeDir(base));

describe('voice inbox', () => {
  it('lists top-level audio only, newest first, skipping hidden files, folders and symlinks', () => {
    expect(listInbox(inbox, state).map((n) => n.name)).toEqual(['new.OGG', 'old.opus']);
  });

  it('returns nothing for a missing inbox', () => {
    expect(listInbox(path.join(base, 'nope'), state)).toEqual([]);
  });

  it('marks notes that already have a transcript', async () => {
    const old = listInbox(inbox, state).find((n) => n.name === 'old.opus')!;
    await transcribeFile({ stateDir: state, run: fakeRun().run, ffmpeg: 'ffmpeg', whisperBin: 'w', whisperModel: 'm.bin', uncertainP: 0.5 }, old.file);
    expect(listInbox(inbox, state).map((n) => [n.name, n.transcribed])).toEqual([['new.OGG', false], ['old.opus', true]]);
  });

  it('finds a note by id prefix and explains bad ids', () => {
    const notes = listInbox(inbox, state);
    expect(findNote(notes, notes[1]!.id.toUpperCase()).name).toBe('old.opus');
    expect(() => findNote(notes, '../etc')).toThrow(/not a note id/);
    expect(() => findNote(notes, 'ab')).toThrow(/not a note id/);
    expect(() => findNote(notes, 'ffffffff')).toThrow(/No note/);
    const twins = [{ ...notes[0]!, hash: 'abcd1' }, { ...notes[1]!, hash: 'abcd2' }];
    expect(() => findNote(twins, 'abcd')).toThrow(/matches 2/);
  });
});
