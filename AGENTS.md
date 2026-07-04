# Repository Guide

## Directory layout

All new work is done in `app/`.

```
sbs2/
├── src/        reference app — vanilla JS (no build step), the original
├── app/        current app   — React 18 + TypeScript + Vite, a port of src/
├── markup2/    shared markup renderer (imported by app/ as a package)
├── resource/   static assets (icons, fonts, images)
├── admin/      admin tooling
└── index.html  legacy entry (points at src/ via classic scripts)
```

## The two apps

### `src/` — the reference app (vanilla JS)

The original implementation. No bundler, no build step. Classic
`<script>` tags load files directly from `index.html`. Globals
(`Nav`, `View`, `Lp`, `Sidebar`, `Req`, `Settings`, `Draw`, …) are
declared at module scope and shared by implicit global scope.

This is the **source of truth for behavior**. When the React app's
behavior diverges from intent, compare against `src/`.

Key files:

| File            | Responsibility                                         |
|-----------------|--------------------------------------------------------|
| `main.js`       | bootstrap, auth gate, websocket start, `Nav.start()`   |
| `navigate.js`   | `ViewSlot` class + `Nav` namespace: hash routing, slot lifecycle, view-load generator (`handle_view2`) |
| `view.js`       | `BaseView` class, `View` namespace, view registry, `ErrorView` |
| `request.js`     | `Req` — auth, fetch helpers                            |
| `socket.js`      | `Lp` — websocket protocol, `Lp.chain` request batching |
| `sidebar.js`     | `Sidebar` — the left panel, tabs, status display       |
| `scroller.js`    | virtualized message scroller                            |
| `input.js`       | input/composition handling                             |
| `draw.js`        | DOM element factory (`Draw.content_label`, etc.)       |
| `entity.js`      | entity type guards and helpers                         |
| `fill.js`        | `.fill()` helper (clear + append children)             |
| `event.js`       | `Events` — lightweight event bus per view              |
| `keyboard.js`    | focus-nav (roving tabindex) document managers          |
| `settings.js`    | `Settings` — persisted user prefs                      |
| `messages.js`    | message rendering                                       |
| `activity.js`    | activity feed                                           |
| `Views/*.js`     | individual views (`page`, `editpage`, `comments`, `category`, `images`, `user`, `account`) |
| `ABOUT.js`       | generated about/help content                           |

### `app/` — the current app (React + TS + Vite)

A port of `src/` to React 18 + TypeScript, bundled with Vite. The
architecture is layered; each layer ports a responsibility from `src/`
and is annotated with the `src/` file it ports (look for `// L<N> —`
and `// navigate.js:<line>` comments that cite the original line by
number).

```
app/src/
├── main.tsx          entry; runs bootstrap side effects, mounts <App/>
├── routing/          ports navigate.js's ViewSlot + Nav
│   ├── Slot.tsx            one on-screen slot (ViewSlot DOM + focus/close)
│   ├── Slots.tsx           the slot container (Nav.slots → <Slot> per entry)
│   ├── useViewLifecycle.ts the view-load lifecycle (ViewSlot.handle_view2)
│   ├── view-registry.ts     view registry (View.views + resolve_view, lazy import)
│   ├── routes.ts            route registration (central route handler)
│   ├── protect.ts           confirm_leave guard (View.protected)
│   ├── nav-location-schema.ts zod schema (dev-only runtime validation)
│   └── SlotHeaderContext.tsx header portal context
├── services/        ports the global singletons from src/
│   ├── nav.ts              Nav namespace (hash routing, slots store)
│   ├── socket.ts           Lp (websocket, Lp.chain request batching)
│   ├── request.ts          Req (auth, fetch)
│   ├── settings.ts         Settings (persisted prefs)
│   ├── sidebar-log.ts      sidebar_debug (Debug.sidebar_debug)
│   ├── markup.ts           Markup patches (view.js url schemes)
│   ├── draw.ts / draw-dom.ts Draw (element factory)
│   ├── scroller.ts         virtualized scroller
│   ├── focus-nav.ts        keyboard.js roving tabindex
│   ├── message-list.ts     message rendering
│   ├── activity.ts         activity feed
│   └── ...
├── views/            ports src/Views/*.js — one component per view
│   ├── PageView.tsx       ← Views/page.js
│   ├── EditView.tsx      ← Views/editpage.js
│   ├── CommentsView.tsx  ← Views/comments.js
│   ├── CategoryView.tsx  ← Views/category.js
│   ├── ImagesView.tsx    ← Views/images.js
│   ├── UserView.tsx      ← Views/user.js
│   └── AccountView.tsx   ← Views/account.js
├── components/       shared React components (Sidebar, Form, FilePanel, ...)
├── islands/         imperative-DOM islands mounted inside React
│   ├── MarkupContent.tsx   Markup renderer host
│   ├── MessageListView.tsx message list (uses scroller service)
│   └── ScrollerHost.tsx     scroller DOM host
├── hooks/           useService, useResizable
├── core/            entity-guards, ready-gate, util, self-destruct
└── data/            types.ts (NavLocation, ListMap, etc.), entity.ts, about.ts
```

Both `.ts` (source) and `.js` (Vite emits alongside) are present in
`app/src/`. **Edit the `.ts` files; the `.js` are build output.** The
`Views/`, `services/`, etc. under `app/src/` mirror `src/Views/`,
`src/*.js` one-to-one by responsibility.

## How to map between them

When investigating a behavior, find the `src/` file responsible (see
the table above), then find its `app/src/` counterpart by the same
name or by the `// ports <file>` header comment. The React app cites
original line numbers (e.g. `// navigate.js:180`) — use them to jump to
the exact source-of-truth implementation.

The vanilla app uses **generator-based async** (`function* handle_view2`
with `yield` for request awaits and paint breaks) and **manual DOM
manipulation**. The React app replaces generators with
`useLayoutEffect` + `AbortController` + `useState`, and replaces manual
DOM with React rendering — but preserves the original's phase timing
deliberately (see comments in `useViewLifecycle.ts`).

## Running the apps

- `src/`: serve the repo root (the `index.html` at repo root loads
  `src/*.js` directly). No build.
- `app/`: `cd app && npm install && npm run dev` (Vite dev server).
  Builds to `app/dist/`.

## Shared dependency

`markup2/` is the markup renderer. `src/` loads it via a global
`<script>`; `app/` imports it as a package (`import { Markup } from
'markup2'`) and also surfaces it on `window.Markup` so bundled ES
modules that expect the global still work.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Clean up** - Clear stashes, prune remote branches
5. **Verify** - All changes committed AND pushed
6. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
