# AGENTS.md — Classroom Scheduler

**For AI coding agents** (Claude Code, Cursor, Codex, GitHub Copilot, etc.).

This file contains the practical rules and context you need to make changes that stay consistent with the project.

**First action on any task**: Read [handoff.md](./handoff.md) (the full human handoff document). It contains the complete architecture, data model, history, and rationale. This AGENTS.md is the *condensed, agent-optimized* companion.

## Mandatory Development Workflow

- **Never edit `app.js` directly.** It is the production bundle.
- After **any** edit under `src/` (`App.jsx`, `main.jsx`, `components/*.jsx`, `domain/*.ts`):
  ```bash
  npm run build   # or: npx esbuild src/main.jsx --bundle --minify --outfile=app.js \
                  #          --define:process.env.NODE_ENV='"production"'
  ```
- Commit **both** the source change **and** the updated `app.js` together.
- Test: `npm run test:ci` (88 tests + build). Open `index.html` or `npx serve .`.
- Work on a feature branch. Push and let the user decide on merging/PR. **Do not push `main` unless asked.**

## Branches (as of 2026-06-17)

| Branch | Status |
|--------|--------|
| `main` | Production — v3 multi-plan, Week Overview, By Student, 📒 Roster (column sort/reorder), student conflicts |
| `v3-plans` | Merged into `main` (2026-06-13); branch kept for reference |

Local preview: `npx serve . -l 4180` → http://localhost:4180

## Core Architecture (must internalize)

- **Scheduler UI + state**: `src/App.jsx` (the main `ClassroomScheduler` component owns `data` + `persist`).
- **Component modules** (`src/components/`): `uikit.jsx` (shared inline-style tokens + `Overlay`/`Field`/`FormNotice`/`InlineConfirm`), and the course-management views `Classbook.jsx`, `GradesView.jsx`, `ReportCards.jsx`, `TermModal.jsx`, `IdentityModal.jsx`, plus `classbookUtils.jsx`. New views receive `data`/`persist`/`currentTeacher`/`planReadOnly` as props — they must **not** import `App.jsx` (cycle). Keep scheduler state in `App.jsx`.
- **Allowed helper modules**: `src/planService.js` (v3 plans), `src/scheduleService.js` (localStorage + sync guard), `src/domain/scheduleLogic.ts` (pure schedule math + sessions/aggregation).
- **Data model** (see handoff.md):
  - `catalog[]` — one record per class/cohort (`id, name, teacher, reg, note, students[]`).
  - `students[]` — deduped master list (union of class rosters); separate from `reg` signed-up count.
  - `placements[]` — scheduling entries (`classId, day, start, end, rooms[]`).
  - Multi-placement classes share one catalog entry (one roster).
  - **Course-management layer**: `term`, `sessionLogs[]`, `attendance[]`, `quizzes[]`, `quizScores[]`, `reportComments[]`, `staffPins{}`. Sessions are **derived** from `term` + `placements` (`sessionsForClass`), not stored. ⚠️ **Any new top-level field MUST be carried through `normalizeV2()`** (runs on every load + poll) via a `clean*` helper, or it is silently dropped. Renames/deletes must cascade (see `saveStudents`, `stripClassData`).
- **Coordinated views** (grid, 📋 By Class, 👤 By Teacher, 🎓 By Student, 📒 Roster) + 📅 Week Overview — pill/card design must stay consistent. Course-management tabs: 📓 Classbook, 📝 Grades, 🪪 Report Cards (Class Library `<aside>` is hidden on these three).
- **Styling rule**: Inline styles only. Reuse the tokens in `src/components/uikit.jsx` (imported into `App.jsx`).

## Persistence & Shared State

### Production (`main`)

- Supabase **one row per plan**; v3 envelope `{ planVersion, plan, schedule }` in `planService.js`.
- `localStorage` — `premier-classroom-schedule`, `premier-active-plan-id`, `premier-schedule-plan-{id}`.
- **Default** (`id=1`, `kind: live`) — protected, cannot delete; **Reset Data** restores seed.
- **Plan** — editable shared copy; **Clear schedule** wipes placements + zeroes `reg`.
- **Archive** — read-only; restore copies to new Plan.
- Active plan: `premier-active-plan-id`. Edits sync only for the active plan row; colleagues must switch to the same plan to see edits.
- localhost: `premier-plans-v3` local store; remote sync off (`IS_LOCAL_DEV`).
- UI prefs: `premier-ui-lib-open`, `premier-roster-columns` (Roster column order).

Central hooks in `App.jsx`: `persist`, `flushRemoteSave`, `switchPlan`, `planApi` from `createRemotePlanApi`.

## Testing Checklist

- Drag Library ↔ grid, grid ↔ grid, grid → Library tray.
- Multi-placement class: edit name/teacher/reg once → everywhere.
- Teacher conflicts in grid, Library, overview tabs.
- Student conflicts: header panel, By Student cards, class editor schedule rows (orange dashed, not room colors).
- **Roster**: column click-sort, drag-reorder headers, row click → class editor.
- **Resize test** on By Class / By Teacher (narrow window, horizontal scroll, uniform pill heights).
- **v3 plans**: switch plans, new plan, delete plan (not Default), archive + restore, Clear schedule vs Reset Data.
- **Save guards**: Default (id=1) cannot sync with zero classes; each remote save auto-backs up previous server copy to hidden row `10000 + planId` (`scripts/restore-auto-backup.mjs`).
- **Course management**: set term → Classbook shows dated sessions; record attendance/homework + lesson content, then **reload** and confirm it persists (proves `normalizeV2` carry-through). Grades: add quiz, enter scores, check averages + CSV. Report Cards: aggregation, print, CSV. Mobile (`preview_resize`): Classbook roster becomes cards. Rename/remove a student + delete a class → records cascade.

## Things Agents Frequently Get Wrong

- Editing `app.js` directly.
- Adding Tailwind/CSS files (inline styles only) — reuse `uikit.jsx` tokens.
- **Adding a new top-level `data` field without carrying it through `normalizeV2()`** → silently wiped on the next load/poll. Add a `clean*` helper + a cascade on rename/delete.
- Changing pills in only one view.
- Forgetting rebuild + commit `app.js`.
- Deleting Default plan (must stay protected).
- Assuming all users see edits without switching to the same active plan (v3).
- Importing `App.jsx` from a `src/components/` view (circular dependency) — pass data via props.

## References

- [handoff.md](./handoff.md) — full architecture + v3 section + changelog
- [README.md](./README.md) — user-facing feature summary + dev quick start
- Source: `src/App.jsx`, `src/components/*`, `src/planService.js`, `src/scheduleService.js`, `src/domain/scheduleLogic.ts`, `src/main.jsx`
- Build: `app.js` (committed)

When an agent makes significant changes, update **all docs**: `handoff.md` (changelog + architecture), `AGENTS.md` (agent rules), and `README.md` (user-facing features).

---

**Last updated**: Course-management layer — Classbook / Grades / Report Cards, term-based sessions, `src/components/` extraction (2026-06-18).