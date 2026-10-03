const CATEGORY_EXTENSIONS = {
  Images: ['png', 'jpg', 'jpeg', 'gif', 'heic', 'webp', 'svg'],
  Documents: ['pdf', 'doc', 'docx', 'txt', 'md', 'pages'],
  Spreadsheets: ['xls', 'xlsx', 'csv', 'numbers'],
  Archives: ['zip', 'tar', 'gz', 'bz2', 'xz', 'rar', '7z'],
  Installers: ['dmg', 'pkg', 'apk', 'vsix'],
  Presentations: ['ppt', 'pptx', 'key'],
  Fonts: ['ttf', 'otf', 'woff', 'woff2'],
  Media: ['mp3', 'mp4', 'mov', 'wav'],
  Code: ['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'rb', 'php', 'swift', 'sh', 'json', 'html', 'css', 'sql', 'yml', 'yaml'],
} as const;

export type Category = keyof typeof CATEGORY_EXTENSIONS;

const BY_EXTENSION = new Map<string, Category>(
  (Object.entries(CATEGORY_EXTENSIONS) as [Category, readonly string[]][]).flatMap(([cat, exts]) =>
    exts.map((ext): [string, Category] => [ext, cat]),
  ),
);

export const CATEGORIES = Object.keys(CATEGORY_EXTENSIONS) as Category[];

/** Returns the category for a lowercased extension, or undefined if no rule matches. */
export function categorize(ext: string): Category | undefined {
  return BY_EXTENSION.get(ext);
}
