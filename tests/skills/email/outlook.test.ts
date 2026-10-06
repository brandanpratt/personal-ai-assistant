import type { AccountInfo } from '@azure/msal-node';
import { describe, expect, it, vi } from 'vitest';
import { connectOutlook, forgetOutlook, outlookMailbox, OUTLOOK_SCOPES, toHeader, type MsalLike } from '../../../src/skills/email/outlook.js';
import { ReconnectNeeded, type Fetch } from '../../../src/skills/email/types.js';

const account = { username: 'Me@Outlook.com' } as AccountInfo;

function fakeMsal(over: Partial<MsalLike> = {}) {
  const removeAccount = vi.fn(async () => {});
  const msal: MsalLike = {
    acquireTokenByDeviceCode: async (req) => {
      req.deviceCodeCallback({ message: 'Go to https://microsoft.com/devicelogin and enter ABC123' });
      return { account, accessToken: 'at' };
    },
    acquireTokenSilent: async () => ({ accessToken: 'at' }),
    getAllAccounts: async () => [account],
    getTokenCache: () => ({ removeAccount }),
    ...over,
  };
  return { msal, removeAccount };
}

describe('outlook', () => {
  it('only asks for read-only mail, offline access and basic profile', () => {
    expect(OUTLOOK_SCOPES).toEqual(['Mail.Read', 'offline_access', 'User.Read']);
  });

  it('device-code sign-in shows Microsoft\'s message and returns the address', async () => {
    const log = vi.fn();
    expect(await connectOutlook(fakeMsal().msal, log)).toBe('Me@Outlook.com');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ABC123'));
  });

  it('lists recent inbox messages from Graph with a read-only GET', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const f: Fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ value: [
        { from: { emailAddress: { name: 'Bank', address: 'no-reply@bank.com' } }, subject: 'Statement', receivedDateTime: '2026-01-01T00:00:00Z', isRead: false },
      ] }));
    };
    const headers = await outlookMailbox('me@outlook.com', { msal: fakeMsal().msal, fetch: f }).recent(5);
    expect(headers).toEqual([{ from: 'Bank <no-reply@bank.com>', subject: 'Statement', date: new Date('2026-01-01T00:00:00Z'), unread: true }]);
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/v1.0/me/mailFolders/inbox/messages');
    expect(url.searchParams.get('$top')).toBe('5');
    expect(calls[0]!.init?.method).toBeUndefined();
    expect((calls[0]!.init?.headers as Record<string, string>).authorization).toBe('Bearer at');
  });

  it('needs reconnect when the account is gone or Microsoft asks for a fresh sign-in', async () => {
    const f: Fetch = async () => new Response('{}');
    await expect(outlookMailbox('other@outlook.com', { msal: fakeMsal().msal, fetch: f }).recent(1)).rejects.toBeInstanceOf(ReconnectNeeded);
    const err = Object.assign(new Error('x'), { name: 'InteractionRequiredAuthError' });
    const msal = fakeMsal({ acquireTokenSilent: async () => { throw err; } }).msal;
    await expect(outlookMailbox('me@outlook.com', { msal, fetch: f }).recent(1)).rejects.toBeInstanceOf(ReconnectNeeded);
  });

  it('forget removes only the matching account', async () => {
    const { msal, removeAccount } = fakeMsal();
    await forgetOutlook(msal, 'someone@else.com');
    expect(removeAccount).not.toHaveBeenCalled();
    await forgetOutlook(msal, 'me@outlook.com');
    expect(removeAccount).toHaveBeenCalledWith(account);
  });

  it('toHeader handles a sender with only an address', () => {
    expect(toHeader({ from: { emailAddress: { address: 'a@b.com' } }, isRead: true }).from).toBe('a@b.com');
  });
});
