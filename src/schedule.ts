import path from 'node:path';

export const LABEL = 'com.local.file-organizer';

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * A launchd job that runs `check` periodically. We only PRINT this; installing a scheduled job
 * changes your system, so you do it yourself. The check is notify-only and rate-limited.
 */
export function buildPlist(opts: { projectDir: string; nodePath: string; intervalSeconds: number }): string {
  const { projectDir, nodePath, intervalSeconds } = opts;
  const tsx = path.join(projectDir, 'node_modules', '.bin', 'tsx');
  const out = path.join(projectDir, '.state', 'check.log');
  const args = [nodePath, tsx, path.join(projectDir, 'src', 'chat.ts'), 'check'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((a) => `    <string>${xml(a)}</string>`).join('\n')}
  </array>
  <key>WorkingDirectory</key><string>${xml(projectDir)}</string>
  <key>StartInterval</key><integer>${intervalSeconds}</integer>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>${xml(out)}</string>
  <key>StandardErrorPath</key><string>${xml(out)}</string>
</dict>
</plist>
`;
}

export function installInstructions(plistPath: string): string {
  return [
    `1. Save the XML above to: ${plistPath}`,
    `2. Install:   launchctl bootstrap gui/$(id -u) "${plistPath}"`,
    `3. Run once:  launchctl kickstart -k gui/$(id -u)/${LABEL}`,
    `4. Remove:    launchctl bootout gui/$(id -u)/${LABEL}   (then delete the file)`,
  ].join('\n');
}
