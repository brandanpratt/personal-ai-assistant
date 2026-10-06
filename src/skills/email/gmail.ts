import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { GmailConfig } from './config.js';
import type { SecretStore } from './secrets.js';
import { ReconnectNeeded, type Fetch, type Mailbox, type MessageHeader } from './types.js';

/** Read-only. Google enforces it: this token can't send, delete, label or mark mail as read. */
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export const gmailSecretKey = (address: string) => `gmail:${address.toLowerCase()}`;

const base64url = (buf: Buffer) => buf.toString('base64url');

/** PKCE: proves the code we get back was requested by this process, not grabbed by another app. */
export function makePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(crypto.randomBytes(32));
  return { verifier, challenge: base64url(crypto.createHash('sha256').update(verifier).digest()) };
}

export function buildAuthUrl(p: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPE,
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    access_type: 'offline', // ask for a refresh token...
    prompt: 'consent', // ...every time, or Google omits it on a second connect
  });
  return `${AUTH_URL}?${q}`;
}

/**
 * Listens on 127.0.0.1 (never the network) on a random port for Google's redirect.
 * Accepts exactly one valid reply with the expected `state`, then closes.
 */
export async function startLoopback(expectedState: string, timeoutMs = 5 * 60_000) {
  let settle!: { resolve: (code: string) => void; reject: (err: Error) => void };
  const code = new Promise<string>((resolve, reject) => { settle = { resolve, reject }; });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const finish = (status: number, text: string) => {
      res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }).end(text);
    };
    if (url.searchParams.get('state') !== expectedState) return finish(400, 'Unexpected request. You can close this tab.');
    const error = url.searchParams.get('error');
    const got = url.searchParams.get('code');
    if (error || !got) {
      finish(400, 'Sign-in was cancelled. You can close this tab.');
      settle.reject(new Error(`Google sign-in failed: ${error ?? 'no code returned'}`));
    } else {
      finish(200, 'Gmail connected. You can close this tab and return to the terminal.');
      settle.resolve(got);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const timer = setTimeout(() => settle.reject(new Error('Timed out waiting for Google sign-in (5 minutes).')), timeoutMs);
  const close = () => { clearTimeout(timer); server.close(); server.closeAllConnections(); };
  code.then(close, close);
  return { redirectUri: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, code, close };
}

interface TokenReply { access_token: string; expires_in: number; refresh_token?: string }

async function postToken(f: Fetch, body: Record<string, string>): Promise<TokenReply> {
  const res = await f(TOKEN_URL, { method: 'POST', body: new URLSearchParams(body) });
  const json = (await res.json().catch(() => ({}))) as Partial<TokenReply> & { error?: string };
  if (json.error === 'invalid_grant') throw new ReconnectNeeded('gmail', 'access was revoked or expired');
  if (!res.ok || !json.access_token) throw new Error(`Google token request failed (${res.status}${json.error ? `: ${json.error}` : ''})`);
  return json as TokenReply;
}

export function exchangeCode(f: Fetch, cfg: GmailConfig, p: { code: string; verifier: string; redirectUri: string }) {
  return postToken(f, {
    client_id: cfg.clientId, client_secret: cfg.clientSecret,
    code: p.code, code_verifier: p.verifier, redirect_uri: p.redirectUri, grant_type: 'authorization_code',
  });
}

export async function refreshAccessToken(f: Fetch, cfg: GmailConfig, refreshToken: string): Promise<string> {
  const t = await postToken(f, {
    client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token',
  });
  return t.access_token;
}

async function getJson(f: Fetch, token: string, url: string): Promise<any> {
  const res = await f(url, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new ReconnectNeeded('gmail', 'Google rejected the token');
  if (!res.ok) throw new Error(`Gmail request failed (${res.status})`);
  return res.json();
}

export const getGmailAddress = async (f: Fetch, accessToken: string): Promise<string> =>
  (await getJson(f, accessToken, `${API}/profile`)).emailAddress;

export function toHeader(msg: any): MessageHeader {
  const headers: { name: string; value: string }[] = msg?.payload?.headers ?? [];
  const h = (name: string) => headers.find((x) => x.name.toLowerCase() === name)?.value ?? '';
  return {
    from: h('from'),
    subject: h('subject'),
    date: new Date(Number(msg?.internalDate) || h('date')),
    unread: Array.isArray(msg?.labelIds) && msg.labelIds.includes('UNREAD'),
  };
}

export interface GmailDeps { fetch: Fetch; secrets: SecretStore; config: GmailConfig }

/** A mailbox for an already-connected address. Gets a fresh access token per run; only the refresh token is stored. */
export function gmailMailbox(address: string, deps: GmailDeps): Mailbox {
  let token: Promise<string> | undefined;
  const accessToken = () => (token ??= (async () => {
    const refresh = await deps.secrets.get(gmailSecretKey(address));
    if (!refresh) throw new ReconnectNeeded('gmail', 'no saved sign-in for this address');
    return refreshAccessToken(deps.fetch, deps.config, refresh);
  })());
  return {
    provider: 'gmail',
    address,
    async recent(limit) {
      const t = await accessToken();
      const list = await getJson(deps.fetch, t, `${API}/messages?maxResults=${limit}&labelIds=INBOX`);
      const ids: string[] = (list.messages ?? []).map((m: { id: string }) => m.id);
      const meta = '&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date';
      const msgs = await Promise.all(ids.map((id) => getJson(deps.fetch, t, `${API}/messages/${encodeURIComponent(id)}?format=metadata${meta}`)));
      return msgs.map(toHeader);
    },
  };
}

/** Full browser sign-in. Returns the connected address; the refresh token goes straight to the secret store. */
export async function connectGmail(deps: GmailDeps & { openBrowser: (url: string) => void; log: (m: string) => void }): Promise<string> {
  const state = base64url(crypto.randomBytes(16));
  const { verifier, challenge } = makePkce();
  const loop = await startLoopback(state);
  try {
    const url = buildAuthUrl({ clientId: deps.config.clientId, redirectUri: loop.redirectUri, state, challenge });
    deps.log('Opening Google sign-in in your browser. If it does not open, paste this link into it:');
    deps.log(url);
    deps.openBrowser(url);
    const code = await loop.code;
    const tokens = await exchangeCode(deps.fetch, deps.config, { code, verifier, redirectUri: loop.redirectUri });
    if (!tokens.refresh_token) throw new Error('Google did not return a refresh token. Try connecting again.');
    const address = await getGmailAddress(deps.fetch, tokens.access_token);
    await deps.secrets.set(gmailSecretKey(address), tokens.refresh_token);
    return address;
  } finally {
    loop.close();
  }
}
