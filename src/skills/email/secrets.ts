import { AsyncEntry } from '@napi-rs/keyring';

/** Where sign-in tokens live. Never in .env, .state or logs. */
export interface SecretStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

const SERVICE = 'personal-ai-assistant.email';

/**
 * The macOS login Keychain (via a native library, so secrets never appear on a command line).
 * Entries show up in Keychain Access under "personal-ai-assistant.email".
 */
export function keychainStore(service = SERVICE): SecretStore {
  return {
    get: async (key) => (await new AsyncEntry(service, key).getPassword()) ?? undefined,
    set: (key, value) => new AsyncEntry(service, key).setPassword(value),
    delete: async (key) => { await new AsyncEntry(service, key).deletePassword(); },
  };
}

/** In-memory store for tests. */
export function memoryStore(initial: Record<string, string> = {}): SecretStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: async (key) => data.get(key),
    set: async (key, value) => { data.set(key, value); },
    delete: async (key) => { data.delete(key); },
  };
}
