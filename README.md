# Premier Plus · Classroom Scheduler

An interactive classroom scheduling board for the 2026 Summer program (Jericho).

**Live app:** https://classroom-scheduler-ruddy.vercel.app  
(Vercel redeploys automatically on every push to `main`.)

## Features

### Day calendar

- One tab per day (Mon–Sat): rooms as columns, continuous time axis — morning and afternoon on the same canvas
- Classes start at any time (15-minute snap); drag cards to move, drag the bottom edge to resize
- Per-day scheduling window (e.g. Saturday 9:00 AM–1:00 PM) — edit with **✎ Edit hours**; grid stretches if a class sits outside the window
- **Combined classrooms**: pick several room chips in the class dialog; the class appears in each room column and capacity is the rooms' total
- **Class Library** (left sidebar): define each class once; drag lib → grid to schedule, grid → lib to unschedule; multi-day placements share one roster and signed-up count
- Click empty time to create a class; **⇄ Mon–Fri** in the class dialog repeats a meeting on every weekday

### Overview tabs

| Tab | What it shows |
|-----|----------------|
| **📋 By Class** | Time × room grid per class; drag blocks to move time/room; room-legend colors |
| **👤 By Teacher** | One row per teacher; horizontal schedule cards (class, time, room); room-legend colors |
| **🎓 By Student** | One row per student; cards sorted by earliest meeting; **Manage students** renames/removes across all rosters |
| **📒 Roster** | Spreadsheet table — one row per student per class; click column headers to sort, drag headers to reorder columns |
| **📅 Week Overview** | Read-only week grid (time × Mon–Sat); room-colored blocks; click day header to jump to that day tab |

### Course management (attendance · homework · quizzes · report cards)

Set the program **term** (📅 **Set term** in the header — start/end dates + holidays). The app turns each class's weekdays into concrete **dated sessions**; records hang off `(class, date)`.

| Tab | What it does |
|-----|----------------|
| **📓 Classbook** | Pick a class + session date (◀ ▶ navigation). Record the day's **lesson content** and **homework assigned**, then take **attendance** (present/absent/tardy/excused) and **homework completion** (complete/incomplete/late/missing) per student. "Mark all present" shortcut. Tablet/phone-friendly card layout for taking attendance in class. |
| **📝 Grades** | Per class: create **quizzes** (Friday dates suggested for Mon–Fri classes), enter scores in a students × quizzes grid; per-student and class-wide averages; **Export CSV**. |
| **🪪 Report Cards** | Per student: attendance rate, homework completion rate, quiz average + per-quiz detail, and a **teacher comment** — aggregated across all their classes. **🖨 Print** a single card or **Export all (CSV)**. |

- **👤 Who's recording** (header): pick whose name is stamped on attendance/grade entries (`by`/`at`). Audit label only — not a login.
- Records ride in the same per-plan Supabase/localStorage envelope and survive reload (carried through `normalizeV2`). Renaming/removing a student or deleting a class cascades into these records.

### Rosters & conflicts

- **Per-class student roster** (names in class dialog, separate from signed-up `reg` count)
- **Room conflict** (red) — hard block: overlapping classes in the same room
- **Teacher overlap** (amber) — warning; confirm on save
- **Student schedule clash** (orange dashed) — same student on two classes with overlapping times; shown in header panel, overview cards, and class editor

### Shared schedule & plans

- **v3 multi-plan**: header **📁** menu — **Default** (protected), named **Plan** copies, read-only **Archive**
- Edits save to the **active plan**; colleagues must switch to the same plan to see your changes
- Auto-save to Supabase with status in the header; `localStorage` offline cache
- **localhost** runs browser-only (no remote sync) so experiments never touch production data
- Older slot-based schedules migrate automatically on first load

## Project structure

```
index.html              # Page shell (loads app.js)
app.js                  # Committed production bundle (rebuild after src/ edits)
src/
  main.jsx              # Entry point
  App.jsx               # Scheduler UI + state (catalog, placements, sync)
  components/           # uikit (shared styles/Overlay/Field) + course-management views
                        #   Classbook.jsx, GradesView.jsx, ReportCards.jsx,
                        #   TermModal.jsx, IdentityModal.jsx, classbookUtils.jsx
  planService.js        # v3 multi-plan pack/unpack + Supabase API
  scheduleService.js    # localStorage + sync guard
  domain/scheduleLogic.ts  # Pure logic (conflicts, sort, layout, sessions, report aggregation)
tests/                  # node:test (82 tests)
handoff.md              # Full architecture + changelog (start here for deep dives)
AGENTS.md               # Condensed rules for AI coding agents
```

## Develop / rebuild

```bash
npm install
npm run test:ci          # 86 tests + production build
npx serve . -l 4180      # http://localhost:4180
```

After editing `src/App.jsx` or `src/main.jsx`:

```bash
npx esbuild src/main.jsx --bundle --minify --outfile=app.js \
  --define:process.env.NODE_ENV='"production"'
```

Commit **both** the source change and the updated `app.js`.

## Documentation

| File | Audience |
|------|----------|
| [handoff.md](./handoff.md) | Humans & agents — architecture, data model, v3 plans, full changelog |
| [AGENTS.md](./AGENTS.md) | AI agents — workflow, testing checklist, common mistakes |

**Keep all three docs in sync** when shipping user-facing or architectural changes.

## Deploy

Production uses **Vercel** (connected to GitHub `main`). `vercel.json` runs `npm run build` and serves the repo root.

GitHub Pages also works: **Settings → Pages → `main` / root**.

## Note on data

The shared schedule lives in Supabase (**one row per plan**, jsonb envelope) — including the course-management layer (`term`, `sessionLogs`, `attendance`, `quizzes`, `quizScores`, `reportComments`; legacy `staffPins` may still exist in stored data but is no longer set by the UI). `localStorage` keys include `premier-active-plan-id`, `premier-plans-v3`, UI prefs such as `premier-roster-columns`, and `premier-current-teacher` (who's recording, this browser only — audit stamp, not a login).

After deploying, ask everyone to refresh open tabs so an old client doesn't write stale data back.