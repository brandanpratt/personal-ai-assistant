# Personal AI Assistant

A local, privacy-first personal assistant. Its first skill is organizing your Downloads folder. It sorts files by type, then by topic (`Documents/Resumes/`), learns the folders you approve, and can nudge you when files pile up.

Everything runs on your machine with Ollama. No file content leaves your computer.

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

Stored in `.state/memory.json`, written only after a run you approved:
- Each approved folder as an average vector plus a file count (no file contents or names).
- Your renames, so a name the model proposes again is translated to yours.

If the file is missing, corrupt, or made with a different embedding model, it simply starts fresh.

## Scheduling the check (optional)

`npm run schedule` prints a launchd job and the install commands. The job runs `check` every 6 hours. Installing it is your call, since it changes your system.

## Project layout

```
src/
  chat.ts        CLI entry (plan, apply, organize, undo, chat, check, schedule)
  config.ts      environment settings, validated
  pathGuard.ts   the "stay inside the folder" check
  scanner.ts     lists files
  categories.ts  extension -> type folder
  planner.ts     decides moves (pure, touches nothing)
  executor.ts    performs moves + undo
  journal.ts     write-ahead undo log
  sensitive.ts   files that must never be read
  extractor.ts   text from PDF/docx/etc.
  embeddings.ts  Ollama embeddings
  cluster.ts     similarity grouping
  clusterText.ts what text gets embedded
  namer.ts       LLM names a cluster, JSON-validated
  taxonomy.ts    clusters -> named folders + review pile
  review.ts      rename/merge/reject commands
  memory.ts      learning across runs
  organize.ts    ties the pipeline together
  tools.ts       the seven tools the chat model can call
  agent.ts       the tool-calling loop
  check.ts       scheduled notify-only check
  notify.ts      macOS notification
  schedule.ts    launchd job generator
  io.ts          shared terminal input
tests/           one test file per area (89 tests)
.state/          journals, memory, reports, lock (gitignored)
archive/finance/ the original finance code (gitignored)
```

## Known limits

- **Scanned PDFs** (about a third of one test Downloads folder) have no text, so they're filed by type only. Reading them would need OCR.
- **The 0.8 similarity cutoff for remembered folders** was tuned on a small test, not yet on real Downloads. Check the `[remembered]` folders on a real second run.
- **Undo doesn't forget** what the agent learned from that run.
- **Only loose top-level files** are considered. Files already in subfolders aren't re-sorted.
- **The 8B chat model can be sloppy**: it may call a tool you didn't ask for or paraphrase loosely. The approval gate covers the dangerous cases. Use `show_folder` or `preview_plan` for exact lists.
- **macOS privacy** may block the scheduled job from reading Downloads until you grant `node` access in System Settings. Untested.
- **The scheduler file hardcodes the current Node path** (nvm), so regenerate it after changing Node versions.

## Suggested first real run

1. `npm run dev` for the type-only dry run.
2. `npm run dev -- organize`: review the folders carefully (use `show <n>`), then check the summary counts before typing `yes`.
3. If anything looks wrong, `npm run dev -- undo`.
4. Run `organize` again later to see remembered folders (`[remembered]`) skip the model.
