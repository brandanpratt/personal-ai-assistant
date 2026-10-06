import { required } from '../../core/config.js';
import { errorMessage } from '../../core/util.js';

type Env = Record<string, string | undefined>;
const HOW = 'How to get it: docs/email-setup.md';

export interface GmailConfig {
  clientId: string;
  /** Not truly secret for a desktop app (Google says so), but still kept out of git. */
  clientSecret: string;
}

export interface OutlookConfig {
  clientId: string;
}

/** Read lazily, only when Gmail is used, so a missing Gmail setup never breaks Outlook or other skills. */
export function loadGmailConfig(env: Env = process.env): GmailConfig {
  try {
    return { clientId: required(env, 'GMAIL_CLIENT_ID'), clientSecret: required(env, 'GMAIL_CLIENT_SECRET') };
  } catch (err) {
    throw new Error(`${errorMessage(err)}. ${HOW}`);
  }
}

export function loadOutlookConfig(env: Env = process.env): OutlookConfig {
  try {
    return { clientId: required(env, 'OUTLOOK_CLIENT_ID') };
  } catch (err) {
    throw new Error(`${errorMessage(err)}. ${HOW}`);
  }
}
