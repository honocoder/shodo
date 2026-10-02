# shodo

Shodo is a calm, local-first writing studio for long-form fiction. The manuscript
is the center of the product: a focused prose editor, a reorderable chapter/scene
tree, contextual notes, deliberate writing sessions, recoverable snapshots, and
portable exports—without analytics or an AI service touching unpublished work.

## What is included

- Tiptap/ProseMirror manuscript editor with restrained formatting, autosave,
  focus mode, typewriter mode, and writing typography controls
- IndexedDB persistence through Dexie; the app is usable with no account or server
- Chapters and scenes with inline rename, deletion safeguards, and drag ordering
- Notes, tags, pinning, scene attachment, the Compass panel, and quick capture
- Timed/free/word-target writing sessions with statistics derived from real word
  count changes
- Manual, session-start, and protective snapshots with safe restoration
- Fully local search over structure, prose, and notes
- Markdown, DOCX, and complete JSON backup exports
- Installable PWA with an offline app shell and self-hosted fonts
- Optional PocketBase authentication and a durable IndexedDB outbox

## Stack

React 19, TypeScript (strict), Vite, Tiptap, Dexie, PocketBase SDK, dnd-kit,
Motion, Lucide, date-fns, docx, Vitest, and vite-plugin-pwa.

## Run locally

Requirements: Node 20+ and pnpm 10+.

```bash
pnpm install
pnpm dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). No environment
variables or backend are required. Choose **Or prepare Page 43** on the first-run
screen for the requested 45,000-word novel setup, or create any project.

Useful commands:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e # requires `pnpm preview` in another terminal
pnpm build
pnpm preview
```

## Local-first data architecture

The editor writes to its own in-memory ProseMirror state immediately. Changes are
debounced for 350 ms into IndexedDB, with additional flushes on scene changes,
visibility changes, route-level transitions, and page hide. The write also adds a
durable outbox entry. No typing path waits for the network.

`src/db.ts` owns local tables and transactions. `src/sync.ts` is the only
PocketBase-aware layer. Client UUIDs remain independent from PocketBase record
IDs. Sync is single-user last-write-wins by `updatedAt`; the local snapshot system
protects manuscript restoration paths. Normal connection loss is treated as a
supported state, not an error dialog.

Browser storage can still be cleared by the browser or operating system. Use the
**Shodo backup** export regularly, and configure remote sync for another copy.

## Connect PocketBase

1. Copy `pb_migrations/` next to the PocketBase executable and restart it (or run
   `./pocketbase migrate up`). The migration creates the private collections,
   indexes, fields, and ownership rules described in
   [`pocketbase/schema.md`](pocketbase/schema.md).
2. Copy `.env.example` to `.env`.
3. Set `VITE_POCKETBASE_URL` to the public URL of the PocketBase instance.
4. Restart the Vite server, open Settings, and sign in with a normal PocketBase
   user account.

The frontend must never receive PocketBase admin credentials. All collection API
rules must require `owner = @request.auth.id`; public writes are not supported.

This repository's production build currently targets
`https://shodo-api.jimsvault.tech` through `.env.production`. Configure the same
variable in the deployment platform if it replaces build-time environment files.

## PWA and offline behavior

The production build generates a manifest and service worker. After one successful
online visit, the application shell, JavaScript, styles, icons, and bundled font
files are available offline. Manuscript data remains in IndexedDB. API responses
are deliberately not runtime-cached because synchronization is handled by the
outbox layer.

To verify the production PWA locally:

```bash
pnpm build
pnpm preview
```

Visit once, then enable Offline in browser developer tools and reload.

## Keyboard shortcuts

- Command/Ctrl–K: command palette
- Command/Ctrl–Shift–F: focus mode
- Command/Ctrl–Shift–N: quick capture
- Command/Ctrl–S: flush autosave (and suppress browser Save Page)
- Command/Ctrl–B / I: bold / italic
- Escape: leave focus mode

## Backups and exports

Open the command palette and choose **Export project**. Markdown preserves ordered
chapters and prose, DOCX produces a clean manuscript, and `.shodo.json` contains
project structure, notes, sessions, and snapshots. Exports are produced locally.

## Known V1 limitations

- Synchronization is intentionally single-user and push-oriented. It does not
  provide CRDT collaboration or simultaneous multi-device live editing.
- The JSON backup format is complete and human-readable; automated in-app restore
  is deferred so a future importer can provide explicit ID remapping and conflict
  review instead of risking silent replacement.
- Mobile offers the editor and secondary screens, but manuscript drag reordering
  is optimized for desktop and tablet pointers.
- Browser storage is not a substitute for an external backup.
