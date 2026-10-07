# Changelog

All notable changes to this project are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

**How to keep it up to date:** with every user-visible change, add a line under `[Unreleased]` in the right group (Added, Changed, Fixed, Removed, Security). When you cut a release, rename `[Unreleased]` to the version and date, and start a fresh empty `[Unreleased]`. Describe what changed for the user, not which files moved.

## [Unreleased]

### Added
- **Floating HUD (preview).** `npm run hud` opens a transparent, always-on-top window with animated Jarvis-style rings. Press `Option+Space` (change it with `HUD_HOTKEY`) to type a question, `Esc` to close the box, and drag the rings to move them. The rings are click-through everywhere else, and the `◎` menu-bar item has Ask, Show/hide and Quit. It isn't connected to the assistant yet, so replies are a placeholder that shows the thinking and speaking animations.
- **Skills architecture.** The project is now a shared `core/` plus self-contained skills under `skills/`. A skill declares its name, tools, CLI commands, prompt guidance and an optional scheduled check. The file organizer is the first skill (`skills/files/`). See "Adding a skill" in the README.
- The core refuses to start if two skills use the same tool name, and each skill gets private state in `.state/<skill>/`.
- `help` and `skills` commands list every skill and its commands.
- **Undo now forgets what the run learned.** Each learning run saves a snapshot of the previous memory, and undoing the run restores it. A partial undo keeps the learning, because the unrestored files are still in those folders.
- `docs/` and a `CHANGELOG.md`.
- **Email skill (read-only), first step.** `email connect gmail|outlook` signs in through Google's or Microsoft's own pages, `email status` checks each sign-in, `email recent` lists the newest inbox messages, and `email disconnect` forgets an account. Sign-in tokens are kept in the macOS Keychain. Reading never marks mail as read.
- Setup guide for the read-only email skill (`docs/email-setup.md`): registering the app with Google (Gmail) and Microsoft (personal Outlook), plus new `.env.example` entries.

### Changed
- The entry point is `src/cli.ts` (was `src/chat.ts`). Commands are grouped by skill (`files organize`), and short forms such as `organize` still work while only one skill has that command.
- State moved from `.state/` to `.state/files/`. Existing journals and memory are migrated automatically on the first run, and nothing is overwritten.
- The chat system prompt is split into shared rules plus per-skill guidance.
- **Clustering is about 17x faster at 1,000 files** (6.5 s to 0.4 s) and gives identical groupings. It's verified against the original algorithm on random inputs and on real documents.
- The CLI and the chat tools now share one implementation for running a plan and learning from it, and one for confirming and undoing, so they can't drift apart.
- Memory and the scheduled-check state are written atomically, so a crash can't leave a half-written file.
- `npm run typecheck` now covers the tests and flags unused code.

### Fixed
- PDF font warnings (`TT: undefined function`) no longer flood the terminal during a run.

### Removed
- Unused exports and duplicated helper code.

## [0.1.0] - 2026-10-03

First working version: a local, privacy-first assistant that organizes a Downloads folder. Dry-run by default, never deletes, every run undoable, and nothing moves without the user typing `yes`.

### Added
- **Safe file access.** A path guard that keeps every read and move inside the allowed folder (it resolves `..` and symlinks), and a scanner that never follows symlinks.
- **Rule-based sorting** into type folders (Images, Documents, Spreadsheets, Archives, Installers, Presentations, Fonts, Media, Code) with a dry-run plan and collision-safe names.
- **Executor with an undo journal.** Moves never overwrite, and each move is recorded before it happens, so even a crashed run can be undone.
- **Text extraction** for PDF, Word, text, Markdown, CSV and HTML.
- **Topic folders.** Documents are grouped by meaning using local embeddings and clustering, and the local model names each group. Topics nest inside type folders (`Documents/Resumes/`). Low-confidence files go to `_review` and are never forced into a folder.
- **Interactive review** to rename, merge or reject proposed folders before anything moves.
- **Memory.** Approved folders and renames are remembered, so later runs file matching documents straight away without asking the model.
- **Chat.** Talk to the assistant, which drives seven tools. No tool takes a file path, and moving or undoing needs the user's typed `yes`, which the model cannot answer.
- **Scheduled check.** A notify-only check with a threshold, a cooldown and a minimum file age, plus a generator for a macOS launchd job. The job is printed for the user to install and is never installed automatically.
- README, a test suite, and local-only operation (Ollama).

### Security
- Keys, certificates, credentials and recovery codes are never read, whether blocked by file name or by content such as private-key headers.
- File names and contents are treated as data, never as instructions, in the chat layer.
