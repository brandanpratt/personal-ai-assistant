import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  buildAuthUrl, connectGmail, exchangeCode, gmailMailbox, gmailSecretKey, GMAIL_SCOPE, makePkce,
  refreshAccessToken, startLoopback, toHeader,
} from '../../../src/skills/email/gmail.js';
import { memoryStore } from '../../../src/skills/email/secrets.js';
import { ReconnectNeeded, type Fetch } from '../../../src/skills/email/types.js';

const cfg = { clientId: 'cid', clientSecret: 'csecret' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** A fake Google: token endpoint + Gmail API, recording every request. */
function fakeGoogle(opts: { tokenError?: string; apiStatus?: number } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f: Fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      if (opts.tokenError) return json({ error: opts.tokenError }, 400);
      const body = new URLSearchParams(String(init?.body));
      return json(body.get('grant_type') === 'authorization_code'
        ? { access_token: 'at-1', expires_in: 3600, refresh_token: 'rt-1' }
        : { access_token: 'at-2', expires_in: 3600 });
    }
    if (opts.apiStatus) return json({}, opts.apiStatus);
    if (url.endsWith('/profile')) return json({ emailAddress: 'Me@Gmail.com' });
    if (url.includes('/messages?')) return json({ messages: [{ id: 'a' }, { id: 'b' }] });
    const id = url.match(/messages\/(\w+)\?/)?.[1];
    return json({
      id, internalDate: id === 'a' ? '1767225600000' : '1767139200000', labelIds: id === 'a' ? ['INBOX', 'UNREAD'] : ['INBOX'],
      payload: { headers: [{ name: 'From', value: `Sender ${id} <${id}@x.com>` }, { name: 'Subject', value: `Hello ${id}` }] },
    });
  };
  return { f, calls };
}

describe('gmail auth', () => {
  it('PKCE challenge is the base64url SHA-256 of the verifier', () => {
    const { verifier, challenge } = makePkce();
    expect(challenge).toBe(crypto.createHash('sha256').update(verifier).digest('base64url'));
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('asks only for read-only Gmail, with PKCE and a refresh token', () => {
    const url = new URL(buildAuthUrl({ clientId: 'cid', redirectUri: 'http://127.0.0.1:5', state: 's', challenge: 'c' }));
    expect(url.searchParams.get('scope')).toBe(GMAIL_SCOPE);
    expect(GMAIL_SCOPE).toBe('https://www.googleapis.com/auth/gmail.readonly');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('state')).toBe('s');
  });

  it('loopback listens on 127.0.0.1, ignores a wrong state, accepts the right one', async () => {
    const loop = await startLoopback('good');
    expect(loop.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect((await fetch(`${loop.redirectUri}/?state=evil&code=stolen`)).status).toBe(400);
    expect((await fetch(`${loop.redirectUri}/?state=good&code=real`)).status).toBe(200);
    await expect(loop.code).resolves.toBe('real');
  });

  it('loopback rejects when the user cancels', async () => {
    const loop = await startLoopback('good');
    const done = expect(loop.code).rejects.toThrow(/access_denied/);
    await fetch(`${loop.redirectUri}/?state=good&error=access_denied`);
    await done;
  });

  it('loopback times out', async () => {
    const loop = await startLoopback('good', 20);
    await expect(loop.code).rejects.toThrow(/Timed out/);
  });

  it('exchanges the code with the PKCE verifier', async () => {
    const g = fakeGoogle();
    const t = await exchangeCode(g.f, cfg, { code: 'c', verifier: 'v', redirectUri: 'http://127.0.0.1:1' });
    expect(t.refresh_token).toBe('rt-1');
    const body = new URLSearchParams(String(g.calls[0]!.init?.body));
    expect(body.get('code_verifier')).toBe('v');
    expect(body.get('grant_type')).toBe('authorization_code');
  });

  it('a revoked refresh token means reconnect', async () => {
    await expect(refreshAccessToken(fakeGoogle({ tokenError: 'invalid_grant' }).f, cfg, 'rt')).rejects.toBeInstanceOf(ReconnectNeeded);
  });

  it('connectGmail: browser sign-in end to end, refresh token stored under the lowercased address', async () => {
    const g = fakeGoogle();
    const secrets = memoryStore();
    const openBrowser = vi.fn((url: string) => {
      const u = new URL(url);
      // Simulate Google redirecting the browser back to our loopback with a code.
      void fetch(`${u.searchParams.get('redirect_uri')}/?state=${u.searchParams.get('state')}&code=the-code`);
    });
    const address = await connectGmail({ fetch: g.f, secrets, config: cfg, openBrowser, log: () => {} });
    expect(address).toBe('Me@Gmail.com');
    expect(secrets.data.get(gmailSecretKey(address))).toBe('rt-1');
    expect(secrets.data.has('gmail:me@gmail.com')).toBe(true);
    expect(openBrowser).toHaveBeenCalledOnce();
  });
});

describe('gmail mailbox', () => {
  it('lists recent inbox headers with unread flags, using one refreshed token', async () => {
    const g = fakeGoogle();
    const box = gmailMailbox('me@gmail.com', { fetch: g.f, secrets: memoryStore({ 'gmail:me@gmail.com': 'rt-1' }), config: cfg });
    const headers = await box.recent(2);
    expect(headers.map((h) => [h.from, h.subject, h.unread])).toEqual([
      ['Sender a <a@x.com>', 'Hello a', true],
      ['Sender b <b@x.com>', 'Hello b', false],
    ]);
    expect(headers[0]!.date.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    await box.recent(1);
    expect(g.calls.filter((c) => c.url.includes('oauth2')).length).toBe(1);
    // Read-only by construction: only GETs to the Gmail API.
    expect(g.calls.filter((c) => c.url.includes('gmail.googleapis')).every((c) => !c.init?.method)).toBe(true);
  });

  it('no saved sign-in means reconnect', async () => {
    const box = gmailMailbox('me@gmail.com', { fetch: fakeGoogle().f, secrets: memoryStore(), config: cfg });
    await expect(box.recent(1)).rejects.toBeInstanceOf(ReconnectNeeded);
  });

  it('a 401 from Gmail means reconnect', async () => {
    const box = gmailMailbox('me@gmail.com', { fetch: fakeGoogle({ apiStatus: 401 }).f, secrets: memoryStore({ 'gmail:me@gmail.com': 'rt' }), config: cfg });
    await expect(box.recent(1)).rejects.toBeInstanceOf(ReconnectNeeded);
  });

  it('toHeader falls back to the Date header and tolerates missing fields', () => {
    const h = toHeader({ payload: { headers: [{ name: 'date', value: 'Thu, 1 Jan 2026 00:00:00 +0000' }] } });
    expect(h).toEqual({ from: '', subject: '', date: new Date('2026-01-01T00:00:00Z'), unread: false });
  });
});
