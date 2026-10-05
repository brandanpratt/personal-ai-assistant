import path from 'node:path';

const SENSITIVE_EXTENSIONS = new Set([
  'pem', 'key', 'der', 'crt', 'cer', 'csr', 'p12', 'pfx', 'jks', 'keystore', 'asc', 'gpg', 'kdbx', 'env',
]);
const SENSITIVE_NAME_PATTERNS = [
  /recovery[-_ ]?(key|code)/i, /backup[-_ ]?codes?/i, /\b2fa\b/i, /two[-_ ]?(factor|step)/i, /\btokens?\b/i, /api[-_ ]?keys?/i, /passphrase/i, /seed[-_ ]?phrase/i, /wallet/i,/id_(rsa|ed25519|ecdsa)/i, /password/i, /secret/i, /credential/i, /\.env(\.|$)/i, /private[-_ ]?key/i];

/**
 * True for files whose contents must never be read, embedded or sent to a model
 * (keys, certificates, credentials). They are also excluded from content-based sorting.
 */
export function isSensitive(fileName: string): boolean {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  return SENSITIVE_EXTENSIONS.has(ext) || SENSITIVE_NAME_PATTERNS.some((re) => re.test(fileName));
}

/** Content that marks a file as holding secrets, whatever it is named. */
const SECRET_CONTENT = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bAKIA[0-9A-Z]{16}\b/, /\bsk-[A-Za-z0-9]{20,}/];
export const looksLikeSecret = (text: string) => SECRET_CONTENT.some((re) => re.test(text));
