import path from 'node:path';
import { readJson, writeJsonAtomic } from '../../core/util.js';
import { PROVIDERS, type Provider } from './types.js';

/** Which accounts are connected. Addresses only: tokens are in the Keychain, never here. */
export interface Account {
  provider: Provider;
  address: string;
  connectedAt: string;
}

export const accountsFile = (stateDir: string) => path.join(stateDir, 'accounts.json');

export function loadAccounts(stateDir: string): Account[] {
  const raw = readJson(accountsFile(stateDir));
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is Account =>
      typeof a?.address === 'string' && typeof a?.connectedAt === 'string' && PROVIDERS.includes(a?.provider),
  );
}

/** Adds or refreshes an account (same provider + address replaces the old entry). */
export function saveAccount(stateDir: string, account: Account): void {
  const rest = loadAccounts(stateDir).filter((a) => !sameAccount(a, account));
  writeJsonAtomic(accountsFile(stateDir), [...rest, account]);
}

export function removeAccount(stateDir: string, account: Account): void {
  writeJsonAtomic(accountsFile(stateDir), loadAccounts(stateDir).filter((a) => !sameAccount(a, account)));
}

const sameAccount = (a: Account, b: Account) =>
  a.provider === b.provider && a.address.toLowerCase() === b.address.toLowerCase();
