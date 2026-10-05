import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractText } from '../../../src/skills/files/extractor.js';
import { isSensitive } from '../../../src/core/safety/sensitive.js';
import { scan } from '../../../src/skills/files/scanner.js';

let dir: string;
beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'extract-')));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

async function textOf(name: string, body: string | Buffer, maxChars?: number) {
  fs.writeFileSync(path.join(dir, name), body);
  const file = (await scan(dir, { includeHidden: true })).find((f) => f.name === name)!;
  return extractText(file, maxChars);
}

/** Smallest valid PDF containing one line of text. */
function tinyPdf(text: string): Buffer {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    (() => {
      const s = `BT /F1 12 Tf 10 50 Td (${text}) Tj ET`;
      return `<< /Length ${s.length} >>\nstream\n${s}\nendstream`;
    })(),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => (pdf += `${String(o).padStart(10, '0')} 00000 n \n`));
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

describe('extractText', () => {
  it('reads plain text, normalizing whitespace and truncating', async () => {
    expect(await textOf('a.txt', 'hello \n\n  world')).toBe('hello world');
    expect(await textOf('b.md', 'x'.repeat(5000), 100)).toHaveLength(100);
  });

  it('strips html tags and scripts', async () => {
    const out = await textOf('p.html', '<html><script>evil()</script><body><h1>Title</h1>&nbsp;Body</body></html>');
    expect(out).toBe('Title Body');
  });

  it('extracts text from a PDF', async () => {
    expect(await textOf('doc.pdf', tinyPdf('Quarterly Budget Report'))).toContain('Quarterly Budget Report');
  });

  it('returns undefined for corrupt, empty, binary and unsupported files', async () => {
    expect(await textOf('bad.pdf', 'not a pdf')).toBeUndefined();
    expect(await textOf('bad.docx', 'not a docx')).toBeUndefined();
    expect(await textOf('empty.txt', '   ')).toBeUndefined();
    expect(await textOf('app.apk', 'PK..')).toBeUndefined();
  });

  it('never reads sensitive files, even if the extension is readable', async () => {
    expect(await textOf('cert.pem', '-----BEGIN PRIVATE KEY-----')).toBeUndefined();
    expect(await textOf('my-passwords.txt', 'hunter2')).toBeUndefined();
    expect(await textOf('.env.txt', 'API_KEY=1')).toBeUndefined();
    expect(await textOf('recovery-codes.txt', 'abcd-1234')).toBeUndefined();
    expect(await textOf('ngrok_recovery_codes.txt', 'x')).toBeUndefined();
    expect(await textOf('two-step-verification.pdf', 'x')).toBeUndefined();
  });

  it('never returns text that contains a private key, whatever the file is called', async () => {
    expect(await textOf('notes.txt', 'hi\n-----BEGIN RSA PRIVATE KEY-----\nMIIE')).toBeUndefined();
  });
});

describe('isSensitive', () => {
  it('flags keys, certs and credential-like names only', () => {
    for (const n of ['x.pem', 'a.DER', 'id_rsa', 'client_secret.json', 'google-credentials.json', 'x.p12'])
      expect(isSensitive(n)).toBe(true);
    for (const n of ['report.pdf', 'photo.png', 'notes.txt', 'budget.xlsx']) expect(isSensitive(n)).toBe(false);
  });
});
