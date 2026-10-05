import path from 'node:path';
import { expandHome, numberEnv, required } from '../../core/config.js';

export interface FilesConfig {
  /** The only directory tree the files skill may read or modify. */
  allowedRoot: string;
  /** Scheduled check: only nag when at least this many loose files have piled up... */
  checkMinFiles: number;
  /** ...at most once per this many hours... */
  checkCooldownHours: number;
  /** ...and ignore files touched more recently than this (probably still downloading). */
  checkMinAgeMinutes: number;
}

export function loadFilesConfig(env: Record<string, string | undefined> = process.env): FilesConfig {
  return {
    allowedRoot: path.resolve(expandHome(required(env, 'ALLOWED_ROOT'))),
    checkMinFiles: numberEnv(env, 'CHECK_MIN_FILES', 15),
    checkCooldownHours: numberEnv(env, 'CHECK_COOLDOWN_HOURS', 24),
    checkMinAgeMinutes: numberEnv(env, 'CHECK_MIN_AGE_MINUTES', 10),
  };
}
