export type Provider = 'gmail' | 'outlook';
export const PROVIDERS: readonly Provider[] = ['gmail', 'outlook'];

/** One message's envelope. Everything here came from a stranger's email, so it is untrusted text. */
export interface MessageHeader {
  from: string;
  subject: string;
  date: Date;
  unread: boolean;
}

/** A connected, read-only mailbox. */
export interface Mailbox {
  provider: Provider;
  address: string;
  /** Newest inbox messages first. */
  recent(limit: number): Promise<MessageHeader[]>;
}

/** Thrown when stored sign-in no longer works (revoked, expired, password changed). */
export class ReconnectNeeded extends Error {
  constructor(provider: Provider, detail: string) {
    super(`${provider} sign-in no longer works (${detail}). Run: npm run dev -- email connect ${provider}`);
    this.name = 'ReconnectNeeded';
  }
}

export type Fetch = typeof fetch;
