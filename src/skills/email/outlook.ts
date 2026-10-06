import { LogLevel, PublicClientApplication, type AccountInfo, type ICachePlugin } from '@azure/msal-node';
import type { OutlookConfig } from './config.js';
import type { SecretStore } from './secrets.js';
import { ReconnectNeeded, type Fetch, type Mailbox, type MessageHeader } from './types.js';

/** Read-only mail, stay signed in, and your own name/address. Microsoft enforces these limits. */
export const OUTLOOK_SCOPES = ['Mail.Read', 'offline_access', 'User.Read'];
/** Personal Microsoft accounts only (outlook.com, hotmail, live). */
const AUTHORITY = 'https://login.microsoftonline.com/consumers';
const GRAPH = 'https://graph.microsoft.com/v1.0';
/** MSAL keeps every Microsoft account in one cache blob; we keep that blob in the Keychain. */
export const OUTLOOK_CACHE_KEY = 'outlook:msal-cache';

/** The part of MSAL we use, so tests can swap in a fake. */
export interface MsalLike {
  acquireTokenByDeviceCode(req: { scopes: string[]; deviceCodeCallback: (r: { message: string }) => void }): Promise<{ account: AccountInfo | null; accessToken: string } | null>;
  acquireTokenSilent(req: { scopes: string[]; account: AccountInfo }): Promise<{ accessToken: string }>;
  getAllAccounts(): Promise<AccountInfo[]>;
  getTokenCache(): { removeAccount(account: AccountInfo): Promise<void> };
}

function keychainCachePlugin(secrets: SecretStore): ICachePlugin {
  return {
    beforeCacheAccess: async (ctx) => {
      const saved = await secrets.get(OUTLOOK_CACHE_KEY);
      if (saved) ctx.tokenCache.deserialize(saved);
    },
    afterCacheAccess: async (ctx) => {
      if (ctx.cacheHasChanged) await secrets.set(OUTLOOK_CACHE_KEY, ctx.tokenCache.serialize());
    },
  };
}

export function createMsal(config: OutlookConfig, secrets: SecretStore): MsalLike {
  return new PublicClientApplication({
    auth: { clientId: config.clientId, authority: AUTHORITY },
    cache: { cachePlugin: keychainCachePlugin(secrets) },
    // MSAL logs can include account details; keep them off.
    system: { loggerOptions: { logLevel: LogLevel.Error, piiLoggingEnabled: false, loggerCallback: () => {} } },
  });
}

async function findAccount(msal: MsalLike, address: string): Promise<AccountInfo | undefined> {
  return (await msal.getAllAccounts()).find((a) => a.username.toLowerCase() === address.toLowerCase());
}

/** Device-code sign-in: the user types a short code at microsoft.com/devicelogin. Returns the address. */
export async function connectOutlook(msal: MsalLike, log: (m: string) => void): Promise<string> {
  const result = await msal.acquireTokenByDeviceCode({ scopes: OUTLOOK_SCOPES, deviceCodeCallback: (r) => log(r.message) });
  const address = result?.account?.username;
  if (!address) throw new Error('Microsoft sign-in did not return an account. Try connecting again.');
  return address;
}

/** Forgets this account's tokens on this Mac. */
export async function forgetOutlook(msal: MsalLike, address: string): Promise<void> {
  const account = await findAccount(msal, address);
  if (account) await msal.getTokenCache().removeAccount(account);
}

export function toHeader(m: any): MessageHeader {
  const ea = m?.from?.emailAddress;
  const from = ea?.name && ea?.address ? `${ea.name} <${ea.address}>` : (ea?.address ?? ea?.name ?? '');
  return { from, subject: m?.subject ?? '', date: new Date(m?.receivedDateTime), unread: m?.isRead === false };
}

export function outlookMailbox(address: string, deps: { msal: MsalLike; fetch: Fetch }): Mailbox {
  const accessToken = async () => {
    const account = await findAccount(deps.msal, address);
    if (!account) throw new ReconnectNeeded('outlook', 'no saved sign-in for this address');
    try {
      return (await deps.msal.acquireTokenSilent({ scopes: OUTLOOK_SCOPES, account })).accessToken;
    } catch (err) {
      // MSAL raises InteractionRequiredAuthError when only a fresh sign-in can fix it.
      if ((err as Error)?.name === 'InteractionRequiredAuthError') throw new ReconnectNeeded('outlook', 'Microsoft asked for a fresh sign-in');
      throw err;
    }
  };
  return {
    provider: 'outlook',
    address,
    async recent(limit) {
      const q = new URLSearchParams({
        $top: String(limit),
        $select: 'from,subject,receivedDateTime,isRead',
        $orderby: 'receivedDateTime desc',
      });
      const res = await deps.fetch(`${GRAPH}/me/mailFolders/inbox/messages?${q}`, {
        headers: { authorization: `Bearer ${await accessToken()}` },
      });
      if (res.status === 401) throw new ReconnectNeeded('outlook', 'Microsoft rejected the token');
      if (!res.ok) throw new Error(`Outlook request failed (${res.status})`);
      const json = (await res.json()) as { value?: unknown[] };
      return (json.value ?? []).map(toHeader);
    },
  };
}
