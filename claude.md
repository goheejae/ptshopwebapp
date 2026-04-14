# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fitness studio management app — built with HTML5 / CSS3 / Vanilla JS using **ES Modules (ESM)**. No build tools. Currently uses localStorage; Supabase integration is planned.

The codebase is split into multiple files under `js/`. `index.html` is a minimal HTML shell only — **do not put JS or CSS logic back into it**.

See `PRD.md` for full feature specs, data schemas, and the Supabase migration plan.

## Running the App

**Requires a local HTTP server** (ESM cannot load over `file://` due to CORS).

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

VS Code Live Server extension also works.

## File Structure

```
index.html          ← HTML shell only (topbar, sidebar, #page-content, <script type="module">)
style.css           ← All CSS (variables, layout, per-feature component styles)
js/
  db.js             ← Data access layer (DB object) — sole read/write interface
  utils.js          ← Shared utilities: showToast, escHtml, fmtMoney, isMobile, comingSoon
  main.js           ← App entry point: router (navigate), sidebar toggle, export/import
  pages/
    dashboard.js    ← Dashboard page
    scheduler.js    ← Weekly scheduler (drag, dblclick, custom types)
    todo.js         ← To-do list
    finance.js      ← Settlement system (SettlementManager + render)
    consult.js      ← Consult manager (stub — render only)
    stats.js        ← Stats (stub — render only)
```

## Architecture

Three logical layers:

1. **`js/db.js` — Data layer**: The sole read/write interface. All reads/writes go through `DB.*` methods. localStorage today; replace method bodies with Supabase calls for migration. Never access `DB._d` directly from outside `DB`. Export: `export default DB`.

2. **`js/pages/*.js` — Page modules**: Each file exports a `render*()` function that sets `#page-content` innerHTML then calls its own `bind*Events()`. Module-level variables hold page state (e.g. `schedWeekStart`, `todoFilter`) so state persists across re-renders.

3. **`js/main.js` — Router & shell**: Imports all page modules, owns the `navigate(page)` function, registers sidebar click listeners, handles sidebar toggle and export/import. Exposes `window.navigate` for inline `onclick` handlers inside rendered HTML strings.

## Data Layer (DB object)

Namespace methods by feature:

| Namespace | Methods |
|---|---|
| Scheduler | `DB.schedGet(instId, wKey, day, hour)` · `DB.schedSet(…, patch)` |
| Custom Types | `DB.typesGet()` · `DB.typesAdd(type)` · `DB.typesDel(idx)` |
| Todos | `DB.todosGet()` · `DB.todosAdd()` · `DB.todosUpdate(id, patch)` · `DB.todosDel(id)` |
| Finance | `DB.financeGet(monthKey)` · `DB.financeSet(monthKey, data)` |
| Consults | `DB.consultsGet()` · `DB.consultsGetOne(id)` · `DB.consultsAdd()` · `DB.consultsUpdate(id, patch)` |
| I/O | `DB.exportAll()` · `DB.importAll(data)` |

Each method has a comment showing the equivalent Supabase call.

## Scheduler Cell Key Format

`"instId|YYYY-MM-DD|dayIndex|hour"` — where the date is the Monday of that week, dayIndex is 0–6, hour is 7–22.

## Adding a New Page

1. Create `js/pages/foo.js` — export `renderFoo()` which sets `#page-content` innerHTML then calls `bindFooEvents()`.
2. In `js/main.js`: `import { renderFoo } from './pages/foo.js';` and add `foo: renderFoo` to the `pages` map.
3. In `index.html`: add `<button class="nav-item" data-page="foo">` in the sidebar `<nav>`.

## Import / Export Conventions

- `js/db.js` → `export default DB`
- `js/utils.js` → named exports (`export function showToast`, etc.)
- `js/pages/*.js` → named exports (`export function renderFoo`)
- Page modules import what they need: `import DB from '../db.js'` / `import { showToast } from '../utils.js'`

## Scheduler Drag/DblClick Conflict Rule

- `mousedown` sets `isDragging = true`; `document.mouseup` (registered **once** at module init in `scheduler.js`) sets it `false`.
- `dblclick` always fires after mouseup×2 — `isDragging` is guaranteed `false` by then.
- `input.mousedown` calls `e.stopPropagation()` to prevent re-triggering drag inside the inline editor.
- Never add another `document.mouseup` listener; there is exactly one global handler.
