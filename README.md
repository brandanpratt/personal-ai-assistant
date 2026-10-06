# Personal AI Assistant

A local, privacy-first personal assistant. Its first skill is organizing your Downloads folder. It sorts files by type, then by topic (`Documents/Resumes/`), learns the folders you approve, and can nudge you when files pile up. A second skill, `email`, reads Gmail and Outlook (read-only, in progress).

Everything runs on your machine with Ollama. No file content leaves your computer. The email skill talks only to Google and Microsoft, to fetch your own mail.

See [CHANGELOG.md](CHANGELOG.md) for what has changed.

**Core rule: the AI proposes, the code and you decide.** It never deletes anything, never moves files without your typed `yes`, and every run can be undone.

> This project began as a finance agent. That code is archived in `archive/finance/` (gitignored, since it holds secrets) and may come back later as a second agent.

## Setup

Needs Node 22+ and [Ollama](https://ollama.com) running.

```
ollama pull llama3.1:8b
ollama pull nomic-embed-text
npm install
cp .env.example .env      # then check ALLOWED_ROOT
```

`ALLOWED_ROOT` (default `~/Downloads`) is the only folder the agent may read or change. This is enforced in code, not by the AI.

## Commands

Every command belongs to a **skill**: `files` or `email`. You can write `npm run dev -- files organize` or just `npm run dev -- organize`; the short form works while only one skill has that command. `npm run dev -- help` lists everything.

| Command | What it does | Moves files? |
|---|---|---|
| `npm run dev` | Dry-run plan sorted by file type only | No |
| `npm run dev -- organize` | Proposes topic folders, lets you edit them, then moves on your `yes` | After `yes` |
| `npm run chat` | Talk to it ("propose topic folders", "rename the first one to Resumes", "clean it up") | After `yes` |
| `npm run dev -- undo` | Reverses the most recent run | After `yes` |
| `npm run dev -- apply` | Type-only sort (no topics), with confirmation | After `yes` |
| `npm run check` | Scheduled check: counts loose files and sends a notification if they've piled up | **Never** |
| `npm run schedule` | Prints a macOS launchd job for `check`. You install it yourself | Never |
| `npm test` / `npm run typecheck` | Test suite and type check | No |

### Email (read-only)

First do the one-time setup in [docs/email-setup.md](docs/email-setup.md).

| Command | What it does |
|---|---|
| `npm run dev -- email connect gmail` | Opens Google sign-in in your browser |
| `npm run dev -- email connect outlook` | Shows a short code to enter at microsoft.com/devicelogin |
| `npm run dev -- email status` | Lists connected accounts and checks each sign-in still works |
| `npm run dev -- email recent [n]` | Newest inbox messages: sender, subject, date, unread (default 10, max 50) |
| `npm run dev -- email disconnect <n>` | Forgets an account on this Mac, after your `yes` |

- **Read-only, enforced by Google and Microsoft.** It asks only for `gmail.readonly` and `Mail.Read`, so it can't send, delete, archive, or mark anything as read.
- **Sign-in tokens live in the macOS Keychain** (entries named `personal-ai-assistant.email`), never in `.env` or `.state`. `.state/email/accounts.json` holds only the connected addresses.
- **Email text is untrusted.** Control characters and hidden-direction tricks are stripped before anything is printed.
- Disconnecting forgets the account on this Mac. To revoke access on the provider's side too, use the link it prints.

In `organize`, the edit commands are: `list`, `show <n>`, `rename <n> <name>`, `merge <from> <into>`, `reject <n>`, `done`.

## How it works

```
scan  ->  read text  ->  embed  ->  match remembered folders  ->  cluster the rest
      ->  LLM names clusters  ->  you review  ->  plan  ->  you type "yes"  ->  move + journal
```

1. **Scan** the top level of the folder (no symlinks, no hidden files).
2. **Read** the first 2,000 characters of PDFs, Word files, text, markdown, CSV and HTML. Keys, certificates, credentials and recovery codes are never read.
3. **Embed** each file with `nomic-embed-text`, so similar wording lands close together.
4. **Match** against folders you approved before, using their stored average vectors. Matches skip the LLM.
5. **Cluster** the rest, splitting any group over 15 files at a stricter threshold.
6. **Name** each cluster with `llama3.1:8b`. The reply must be valid JSON with a plain folder name, or the files go to `_review`.
7. **Review**: you rename, merge or reject folders.
8. **Plan**: topic folders nest inside type folders. Name clashes become `name (1).ext`.
9. **Move** with a journal written before each move, so a crash is still undoable.

Files with no readable text (images, installers, scanned PDFs) are filed by type only. Low-confidence files go to `<Type>/_review/`.

## Safety design

- **Path guard.** Every path is re-checked right before it's used, resolving `..` and symlinks. Nothing outside `ALLOWED_ROOT` can be touched.
- **Never overwrites.** Moves use a hard link that fails if the destination exists.
- **Never deletes.** Only moves.
- **Undo journal** in `.state/journals/`. Undo refuses to overwrite and removes only folders the run created, if empty.
- **Human approval.** The chat model can *ask* to apply or undo, but only your typed `yes` at the terminal makes it happen.
- **No tool takes a file path.** The model refers to folders by number, and only code builds paths.
- **File names are treated as data**, not instructions (there's a test with a prompt-injection file name).
- **Scheduled check is notify-only** and rate-limited: at least 15 loose files, at most once per 24 hours, ignoring files touched in the last 10 minutes.

## What it remembers

Stored per skill in `.state/files/memory.json`, written only after a run you approved:
- Each approved folder as an average vector plus a file count (no file contents or names).
- Your renames, so a name the model proposes again is translated to yours.

If the file is missing, corrupt, or made with a different embedding model, it simply starts fresh.

**Undo also forgets.** Each learning run saves a snapshot of the previous memory next to its journal. Undoing the run restores it, so folders you backed out of aren't remembered. If an undo is only partial (some files couldn't go back), the learning is kept, because those files are still in the folders it learned.

## Scheduling the check (optional)

`npm run schedule` prints a launchd job and the install commands. The job runs `check` (every skill's notify-only check) every 6 hours. Installing it is your call, since it changes your system.

## Project layout

```
src/
  cli.ts                  entry point: finds the skill for a command and runs it
  core/                   shared by every skill, knows nothing about files
    skill.ts              the Skill contract, registry, command resolution
    agent.ts              the tool-calling loop and the shared system prompt
    chat.ts               interactive chat over all skills' tools
    config.ts             shared settings (models, state folder)
    util.ts               small shared helpers (error messages, atomic JSON read/write)
    io.ts                 terminal input (one reader, closed input = abort)
    notify.ts schedule.ts macOS notification and launchd job generator
    safety/               pathGuard (stay inside the folder), sensitive (never read secrets)
    ai/                   cluster, embeddings
  skills/
    files/                the file organizer, as the first skill
      index.ts            the skill definition (name, tools, commands, check)
      config.ts commands.ts migrate.ts
      apply.ts undoRun.ts  the one shared way to run a plan and learn, and to undo and forget
      scanner categories planner executor journal extractor
      clusterText namer taxonomy review memory organize tools check
    email/                read-only Gmail and Outlook
      index.ts commands.ts config.ts
      gmail.ts outlook.ts  sign-in and inbox listing per provider
      secrets.ts           Keychain storage for sign-in tokens
      accounts.ts format.ts types.ts
tests/                    mirrors src/ (core/, skills/files/, skills/email/); helpers/ holds shared test setup
.state/<skill>/           each skill's journals, memory, reports (gitignored)
archive/finance/          the original finance code (gitignored)
```

Existing state from before skills (`.state/journals`, `.state/memory.json`) is moved into `.state/files/` automatically the first time you run any command. Nothing is overwritten.

## Adding a skill

A skill is one object. Build it under `src/skills/<name>/` and add it to the list in `src/cli.ts`.

```ts
export const notesSkill: Skill = {
  name: 'notes',                       // lowercase, digits, dashes
  description: 'Keep short notes.',
  prompt: 'Use notes_add when the user asks you to remember something.',
  commands: { list: { description: 'List notes', run: async (ctx) => {} } },
  tools: (ctx) => [ /* Tool objects: name, description, zod schema, run */ ],
  check: async (ctx) => 'one line for the log',   // optional, scheduled, notify-only
};
```

Rules every skill follows:
- **Prefix tool names with the skill name** (`notes_add`). The core refuses to start if two skills share a tool name.
- **Tools take no file paths or secrets.** The model names things by number or short text, and only code builds paths.
- **Anything that changes the outside world calls `ctx.confirm(...)` first.** That's a typed `yes` from the human, not something the model can answer.
- **Keep state in `ctx.stateDir`**, which is private to the skill.
- **Read your own settings lazily**, inside tools and commands, so a missing setting in one skill never breaks another.
- **Scheduled `check` is notify-only.** It must never change anything.

`tests/core/secondSkill.test.ts` contains a small working example skill that you can copy.

## Known limits

- **Scanned PDFs** (about a third of one test Downloads folder) have no text, so they're filed by type only. Reading them would need OCR.
- **The 0.8 similarity cutoff for remembered folders** was tuned on a small test, not yet on real Downloads. Check the `[remembered]` folders on a real second run.
- **Only loose top-level files** are considered. Files already in subfolders aren't re-sorted.
- **The 8B chat model can be sloppy**: it may call a tool you didn't ask for or paraphrase loosely. The approval gate covers the dangerous cases. Use `show_folder` or `preview_plan` for exact lists.
- **macOS privacy** may block the scheduled job from reading Downloads until you grant `node` access in System Settings. Untested.
- **The scheduler file hardcodes the current Node path** (nvm), so regenerate it after changing Node versions.

## Suggested first real run

1. `npm run dev` for the type-only dry run.
2. `npm run dev -- organize`: review the folders carefully (use `show <n>`), then check the summary counts before typing `yes`.
3. If anything looks wrong, `npm run dev -- undo`.
4. Run `organize` again later to see remembered folders (`[remembered]`) skip the model.
