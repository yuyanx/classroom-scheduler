# AGENTS.md — Classroom Scheduler

**For AI coding agents** (Claude Code, Cursor, Codex, GitHub Copilot, etc.).

This file contains the practical rules and context you need to make changes that stay consistent with the project.

**First action on any task**: Read [handoff.md](./handoff.md) (the full human handoff document). It contains the complete architecture, data model, history, and rationale. This AGENTS.md is the *condensed, agent-optimized* companion.

## Mandatory Development Workflow

- **Never edit `app.js` directly.** It is the production bundle.
- After **any** edit to `src/App.jsx` or `src/main.jsx`:
  ```bash
  npx esbuild src/main.jsx --bundle --minify --outfile=app.js \
    --define:process.env.NODE_ENV='"production"'
  ```
- Commit **both** the source change **and** the updated `app.js` together.
- Test by opening `index.html` directly in a browser (or run `npx serve .`). No hot-reload dev server is required for most work.
- Work on a feature branch (e.g. `improve-xxx-ui`, `fix-resize-overview`). Push and let the user decide on merging/PR.

## Core Architecture (must internalize)

- **Single source of truth for UI**: Everything lives in `src/App.jsx` (one big component + helper functions at the bottom). Do not introduce new files or split components unless the user explicitly asks.
- **Data model** (see handoff.md for diagrams):
  - `catalog[]` — one record per class/cohort (`id, name, teacher, reg, note`). This is the "master" with the shared roster.
  - `placements[]` — the scheduling entries (`classId, section, slotIdx, room`).
  - A class can appear in many placements (multiple days/times) but `reg` and name edits are shared.
- **Three coordinated views** that must stay visually and behaviorally consistent:
  1. Main drag/drop grid (taller fixed-height cards with capacity bars).
  2. 📋 **By Class** overview (rows = classes, day columns contain pill cards).
  3. 👤 **By Teacher** overview (rows = teachers, day columns contain pill cards — possibly stacked when one teacher has >1 slot on a day).
- **Pill / card design language** (critical for consistency):
  - Rounded, bordered, 2-line.
  - Morning: `#f0fdfa` teal background + "MF·" prefix (column header already says "Daily").
  - PM: `#f8fafc` light gray.
  - Conflict (teacher double-booked): amber border/background + ⚠.
  - All pills now use `minHeight: 42` so every class "方块" (block) has the same physical size.
  - Long names use `overflow: hidden; text-overflow: ellipsis; width: 100%`.
  - Stacked pills inside one cell use a parent `flex flex-col gap-4` (not per-pill margins).
- **Resize / responsiveness contract**:
  - The app is intentionally full-width (no centered max-width container).
  - Overview tables (By Class / By Teacher) have large `minWidth` and horizontal scroll inside their white container.
  - Test on realistic widths (≈1200–1600 px browser window) + drag the edge while on those tabs.
  - Library rail (collapsed vertical state) must never visually overlap or cramp the content — use the established gap.
- **Styling rule**: Inline styles only. Reuse/extend the style objects defined at the bottom of `App.jsx` (`thStyle`, `tdStyle`, `pill` patterns, `btnPrimary`, `miniBtn`, `chipStyle`, `teacherWarningStyle`, etc.). Do not add `<style>` tags or external CSS.

## Persistence & Shared State

- Supabase (single row, public anon key is **intentional** — RLS limits what it can do).
- `localStorage` is the offline cache/fallback.
- All save/load logic is centralized in `loadData`, `saveData`, `persist`, `flushRemoteSave`, `remote*` helpers near the top of `App.jsx`.
- When you touch storage, also think about the "Retry now" banner, save status in the header, and the `pagehide` keepalive flush.

## Testing Checklist (run mentally or actually after any UI change)

- Drag from Library ↔ grid, grid ↔ grid (swap), grid → Library tray (unschedule).
- Multi-placement class: edit name/teacher/reg/note once → appears everywhere.
- Teacher conflicts visible in grid cards, Library sidebar, and both overview tabs.
- **Resize test** (most common regression):
  - Narrow the window on By Teacher and By Class.
  - No text bleeding across cell borders.
  - Rightmost columns (Thu/Fri) remain accessible via the inner horizontal scrollbar.
  - All class pills stay the same height; stacked pills look like a tidy vertical list of identical cards.
  - Library rail (open and collapsed) has clear separation.
- Modals (Class edit, Room, Teacher, capacity quick-edit) still validate conflicts.
- "Manage teachers", room reordering/caps, slot add/rename/remove, Reset Data.
- Shared sync still works (or falls back gracefully if keys are cleared for testing).

## Things Agents Frequently Get Wrong (avoid these)

- Editing `app.js` directly.
- Introducing Tailwind, CSS modules, or separate component files without explicit permission.
- Changing pill rendering in only one of (grid / By Class / By Teacher).
- Using `tableLayout: "auto"` on the schedule grid (it must stay fixed for uniform room columns) — overview tables are the ones we relaxed.
- Forgetting to rebuild + commit `app.js`.
- Assuming the viewport will always be wide; always verify narrow + scroll cases for the overview tabs.
- Treating the Supabase keys as secrets (they are public by design for this app).

## Current Feature Branches & Recent Work (as of latest commit)

- `improve-by-teacher-ui` (pushed) — the work that produced the uniform pill sizes, resize hardening, and By Teacher alignment with By Class.
- Main is the stable production line. Feature work happens on branches; user decides when to merge.

## References

- Detailed human handoff & full architecture rationale: [handoff.md](./handoff.md) (read this first)
- Source: `src/App.jsx` + `src/main.jsx`
- Build output: `app.js` (committed)
- Original README and package.json for basic commands

When an agent takes over future work, start here + handoff.md. Keep this file and handoff.md in sync when you make significant changes.

---

**Last updated**: along with the `improve-by-teacher-ui` changes (uniform class blocks, resize fixes, etc.).
