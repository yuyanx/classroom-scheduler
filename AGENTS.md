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
- Test: `npm run test:ci` (51 tests + build). Open `index.html` or `npx serve .`.
- Work on a feature branch. Push and let the user decide on merging/PR. **Do not push `main` unless asked.**

## Branches (as of 2026-06-13)

| Branch | Status |
|--------|--------|
| `main` | Production — v3 multi-plan, Week Overview, room-colored overview pills, library sort |
| `v3-plans` | Merged into `main` (2026-06-13); branch kept for reference |

Local v3 preview: `npx serve . -l 4180` → http://localhost:4180

## Core Architecture (must internalize)

- **Single source of truth for UI**: Everything lives in `src/App.jsx` (one big component + helper functions at the bottom). Do not introduce new component files unless the user explicitly asks.
- **Allowed helper modules**: `src/planService.js` (v3 plans), `src/scheduleService.js` (localStorage + sync guard), `src/domain/scheduleLogic.ts` (pure schedule math).
- **Data model** (see handoff.md):
  - `catalog[]` — one record per class/cohort (`id, name, teacher, reg, note`).
  - `placements[]` — scheduling entries (`classId, day, start, end, rooms[]`).
  - Multi-placement classes share one catalog entry (one roster).
- **Three coordinated views** (grid, 📋 By Class, 👤 By Teacher) + 📅 Week Overview — pill/card design must stay consistent across all (see handoff.md).
- **Styling rule**: Inline styles only. Reuse style objects at the bottom of `App.jsx`.

## Persistence & Shared State

### Production (`main`)

- Supabase **one row per plan**; v3 envelope `{ planVersion, plan, schedule }` in `planService.js`.
- `localStorage` — `premier-classroom-schedule`, `premier-active-plan-id`, `premier-schedule-plan-{id}`.
- **Default** (`id=1`, `kind: live`) — protected, cannot delete; **Reset Data** restores seed.
- **Plan** — editable shared copy; **Clear schedule** wipes placements + zeroes `reg`.
- **Archive** — read-only; restore copies to new Plan.
- Active plan: `premier-active-plan-id`. Edits sync only for the active plan row; colleagues must switch to the same plan to see edits.
- localhost: `premier-plans-v3` local store; remote sync off (`IS_LOCAL_DEV`).

Central hooks in `App.jsx`: `persist`, `flushRemoteSave`, `switchPlan`, `planApi` from `createRemotePlanApi`.

## Testing Checklist

- Drag Library ↔ grid, grid ↔ grid, grid → Library tray.
- Multi-placement class: edit name/teacher/reg once → everywhere.
- Teacher conflicts in grid, Library, both overview tabs.
- **Resize test** on By Class / By Teacher (narrow window, horizontal scroll, uniform pill heights).
- **v3 plans**: switch plans, new plan, delete plan (not Default), archive + restore, Clear schedule vs Reset Data.

## Things Agents Frequently Get Wrong

- Editing `app.js` directly.
- Splitting `App.jsx` or adding Tailwind/CSS files without permission.
- Changing pills in only one view.
- Forgetting rebuild + commit `app.js`.
- Deleting Default plan (must stay protected).
- Assuming all users see edits without switching to the same active plan (v3).

## References

- [handoff.md](./handoff.md) — full architecture + v3 section
- Source: `src/App.jsx`, `src/planService.js`, `src/main.jsx`
- Build: `app.js` (committed)

When an agent makes significant changes, update **both** `handoff.md` (changelog + architecture) and this file.

---

**Last updated**: v3 merged to `main` (2026-06-13).