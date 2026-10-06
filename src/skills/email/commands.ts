import { execFile } from 'node:child_process';
import type { Command, SkillContext } from '../../core/skill.js';
import { errorMessage } from '../../core/util.js';
import { loadAccounts, removeAccount, saveAccount, type Account } from './accounts.js';
import { loadGmailConfig, loadOutlookConfig } from './config.js';
import { formatHeaders } from './format.js';
import { connectGmail, gmailMailbox, gmailSecretKey } from './gmail.js';
import { connectOutlook, createMsal, forgetOutlook, outlookMailbox } from './outlook.js';
import { keychainStore, type SecretStore } from './secrets.js';
import { PROVIDERS, type Mailbox, type Provider } from './types.js';

const REVOKE: Record<Provider, string> = {
  gmail: 'https://myaccount.google.com/permissions',
  outlook: 'https://account.live.com/consent/Manage',
};

/** Builds a mailbox for a saved account. Each provider's config is read only when that provider is used. */
export function mailboxFor(account: Account, secrets: SecretStore): Mailbox {
  return account.provider === 'gmail'
    ? gmailMailbox(account.address, { fetch, secrets, config: loadGmailConfig() })
    : outlookMailbox(account.address, { fetch, msal: createMsal(loadOutlookConfig(), secrets) });
}

const openBrowser = (url: string) => execFile('open', [url], () => { /* the link is printed too */ });

function listAccounts(accounts: Account[]): string {
  return accounts.map((a, i) => `  ${i + 1}. ${a.provider.padEnd(8)} ${a.address}`).join('\n');
}

const noAccounts = 'No email accounts connected. Run: npm run dev -- email connect gmail   (or outlook)';

const connect: Command = {
  description: 'Sign in to gmail or outlook (read-only access).',
  run: async (ctx, [which]) => {
    if (!PROVIDERS.includes(which as Provider)) return console.log('Usage: npm run dev -- email connect gmail|outlook');
    const provider = which as Provider;
    const secrets = keychainStore();
    const address = provider === 'gmail'
      ? await connectGmail({ fetch, secrets, config: loadGmailConfig(), openBrowser, log: ctx.log })
      : await connectOutlook(createMsal(loadOutlookConfig(), secrets), ctx.log);
    saveAccount(ctx.stateDir, { provider, address, connectedAt: new Date().toISOString() });
    console.log(`Connected ${provider}: ${address} (read-only). Try: npm run dev -- email recent`);
  },
};

const status: Command = {
  description: 'List connected accounts and check each sign-in still works.',
  run: async (ctx) => {
    const accounts = loadAccounts(ctx.stateDir);
    if (accounts.length === 0) return console.log(noAccounts);
    const secrets = keychainStore();
    for (const [i, a] of accounts.entries()) {
      let state: string;
      try {
        await mailboxFor(a, secrets).recent(1);
        state = 'ok';
      } catch (err) {
        state = errorMessage(err);
      }
      console.log(`  ${i + 1}. ${a.provider.padEnd(8)} ${a.address}  ${state}`);
    }
  },
};

const recent: Command = {
  description: 'Show the newest inbox messages (sender, subject, date). Default 10, max 50.',
  run: async (ctx, [n]) => {
    const limit = Math.min(Math.max(Number(n) || 10, 1), 50);
    const accounts = loadAccounts(ctx.stateDir);
    if (accounts.length === 0) return console.log(noAccounts);
    const secrets = keychainStore();
    for (const a of accounts) {
      console.log(`\n${a.provider}: ${a.address}`);
      try {
        console.log(formatHeaders(await mailboxFor(a, secrets).recent(limit)));
      } catch (err) {
        console.log(`  ${errorMessage(err)}`);
      }
    }
    console.log('\n● = unread. Nothing was changed; reading here does not mark mail as read.');
  },
};

const disconnect: Command = {
  description: 'Forget an account on this Mac (by number from "email status").',
  run: async (ctx: SkillContext, [n]) => {
    const accounts = loadAccounts(ctx.stateDir);
    const account = accounts[Number(n) - 1];
    if (!account) return console.log(accounts.length ? `Which one?\n${listAccounts(accounts)}\nUsage: npm run dev -- email disconnect <number>` : noAccounts);
    if (!(await ctx.confirm(`Forget ${account.provider} ${account.address} on this Mac?`))) return console.log('Nothing done.');
    const secrets = keychainStore();
    if (account.provider === 'gmail') await secrets.delete(gmailSecretKey(account.address));
    else await forgetOutlook(createMsal(loadOutlookConfig(), secrets), account.address);
    removeAccount(ctx.stateDir, account);
    console.log(`Forgotten. To also revoke the app's access on ${account.provider}'s side, visit ${REVOKE[account.provider]}`);
  },
};

export const emailCommands: Record<string, Command> = { connect, status, recent, disconnect };
