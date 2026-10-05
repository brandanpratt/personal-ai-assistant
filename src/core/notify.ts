import { execFile } from 'node:child_process';

/** macOS notification via osascript. Arguments are passed as an array (no shell), and quotes are escaped. */
export function macNotify(title: string, text: string): Promise<void> {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', `display notification "${esc(text)}" with title "${esc(title)}"`], (err) =>
      err ? reject(err) : resolve(),
    );
  });
}
