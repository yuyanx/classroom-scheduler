# Handoff — Classroom Scheduler

## What this is

**Premier Plus · Classroom Scheduler** — an interactive scheduling board for the 2026 Summer program at Jericho. Staff define classes in a **Class Library**, then schedule them onto a per-day calendar (rooms as columns × a continuous time axis, Mon–Sat) by drag-and-drop, by clicking an empty time, or by editing meeting times in the class dialog. Classes can start at any time (15-minute snap, no fixed slots). Class signed-up counts, rooms, room capacities, and per-day hours are all editable in place.

State syncs through Supabase (project `zbvedbwbxdzcsnftvyph`, table `public.schedule`, **one row per plan** — `id` = plan id, `data` jsonb). **v3 multi-plan** is on **`main`** (merged 2026-06-13) — see [v3 multi-plan](#v3-multi-plan). `localStorage` is the offline cache. **On `localhost` remote sync is off** (`IS_LOCAL_DEV`).

---

## Live URLs

| | URL |
|---|---|
| Production | https://classroom-scheduler-premier.vercel.app |
| Vercel dashboard | https://vercel.com/yuyanxs-projects/classroom-scheduler |
| GitHub repo | https://github.com/yuyanx/classroom-scheduler |

Vercel is connected to the GitHub repo — every push to `main` triggers an automatic redeploy.

---

## Stack

| Layer | Tech |
|---|---|
| UI framework | React 18 (JSX) |
| Bundler | esbuild |
| Styling | Inline styles only (no CSS files, no Tailwind) |
| State | React `useState` + `localStorage` |
| Build output | `app.js` (committed, pre-bundled) |
| HTML shell | `index.html` (mounts `#root`, loads `app.js`) |
| Pure logic | `src/domain/scheduleLogic.ts` (esbuild bundles `.ts` into `app.js`) |

No router, no state management library. UI is JSX; schedule math lives in TypeScript.

---

## File structure

```
classroom-scheduler/
├── index.html            # Page shell — mounts #root, loads app.js
├── app.js                # Committed production bundle (do not hand-edit)
├── package.json          # Dependencies: react, react-dom, esbuild
├── src/
│   ├── main.jsx          # Entry — ?entry=1 → <VolunteerApp />, else <ClassroomScheduler />
│   ├── entryMode.js      # isEntryMode() URL helper
│   ├── VolunteerApp.jsx  # Volunteer Classbook/Grades shell (always Default plan id=1)
│   ├── planService.js    # v3 multi-plan pack/unpack, local store, Supabase plan API
│   ├── scheduleService.js # localStorage + dirty-revision sync guard
│   ├── domain/
│   │   └── scheduleLogic.ts # Pure logic (conflicts, sort, layout, sessions, report aggregation)
│   ├── components/       # uikit.jsx (shared styles + Overlay/Field/FormNotice/InlineConfirm) +
│   │                     #   Classbook / GradesView / ReportCards / TermModal / IdentityModal / classbookUtils
│   ├── test-exports.js   # Test-only re-export entry (not loaded by the app)
│   └── App.jsx           # Scheduler UI + state (imports the components above)
├── tests/
│   ├── plan.test.mjs      # v3 plan envelope + local store
│   ├── schedule.test.mjs  # Core helper regression tests
│   ├── migration.test.mjs # migrateOld / migrateV1toV2 / normalizeV2
│   ├── conflicts.test.mjs # maxEndForPlacement, room/teacher conflict edge cases
│   ├── classbook.test.mjs # sessions, attendance/quiz aggregation, normalizeV2 carry-through
│   ├── sync.test.mjs      # Preview / localhost remote-sync gating
│   └── smoke.test.mjs     # TDZ order, bundle size
├── .github/workflows/ci.yml # npm test + npm run build on push/PR
├── .claude/launch.json   # Local preview server config (python3 http.server on :4173)
└── handoff.md            # This file
```

Components inside `App.jsx` (top to bottom): time helpers + default data + migrations
(`migrateOld()` → `migrateV1toV2()` → `normalizeV2()`, entry point `upgrade()`) →
`ClassroomScheduler` (main: left library sidebar, day tabs, day calendar with drag/resize, all state ops) →
`ClassModal` (class fields + schedule-rows editor) → `WeekOverviewView` (Week Overview tab) →
`ClassScheduleView` (By Class tab) → `TeacherScheduleView` (By Teacher tab) →
`StudentScheduleView` (By Student tab) → `RosterView` (Roster tab) →
`TeacherModal` → `StudentModal` → `RoomModal` → `RoomCapModal` →
`HoursModal` → `FormNotice` / `InlineConfirm` → overview pill helpers → `Overlay` / `Field` → style objects.

---

## How to develop & rebuild

```bash
npm install

# Rebuild app.js after editing src/
npx esbuild src/main.jsx --bundle --minify --outfile=app.js \
  --define:process.env.NODE_ENV='"production"'

# Serve locally
npx serve .
```

After rebuilding, commit `app.js` along with your `src/` changes so Vercel serves the latest build.

Vercel uses `vercel.json`: `npm run build` then serves the repo root (`outputDirectory: "."`) —
`index.html` and `app.js` live at the top level, not in `public/`.

```bash
npm test
```

Runs `node:test` against pure schedule helpers (esbuild bundles `src/test-exports.js` →
`dist/test-logic.mjs`, gitignored). **82 tests** cover migrations, conflicts, sync gating,
`planService` (v3), overview helpers, student conflicts, and smoke guards. CI runs `npm test` + `npm run build`.
**Run `npm run test:ci` before every commit.**

**Local preview:** `npx serve . -l 4180` → http://localhost:4180

**Preview deploys** (`*.vercel.app` except production host) do **not** sync to Supabase —
same as localhost. Header shows “Preview — not syncing to shared schedule”.

**Every significant change must update all docs** — add a changelog entry here (and adjust architecture
sections when behavior changes); keep [README.md](./README.md) (user-facing) and [AGENTS.md](./AGENTS.md)
(agent rules) in sync with the code you ship.

### Performance (feature branch)

Hot paths use precomputed indexes (`buildScheduleIndexes`: catalog/placements by id,
day, and day+room), memoized tab grid layout and conflict metadata (`computeTabBlockMeta`),
`requestAnimationFrame` throttling for drag ghosts and resize previews, debounced
`localStorage` writes (200 ms, flushed on tab close), and poll skips `setData` when the
upgraded remote payload is unchanged.

### Localhost dev seed (production snapshot)

`LIVE_V1_SEED` in `App.jsx` is a frozen copy of the **live** Supabase schedule (v1 shape from
production `main`). On **localhost only**, `loadData()` auto-imports it when `premier-live-seed-tag`
does not match `LIVE_SEED_TAG` — runs `upgrade()` to v2, writes `localStorage`, and does **not**
touch the shared Supabase row (`IS_LOCAL_DEV` keeps remote sync off). On **`main`**, **Reset Data**
restores this snapshot on **Default** only; named **Plan** uses **Clear schedule** (see v3 section).
To refresh from production later: fetch the `schedule` row, replace `LIVE_V1_SEED`, bump
`LIVE_SEED_TAG`, rebuild `app.js`.

---

## v3 multi-plan

**Status:** merged to `main` (2026-06-13). Vercel redeploys on push to `main`.

### Mental model

Everyone sees the **same list of plans** in the header **📁** menu. Each plan is an independent copy
of the full schedule (catalog + placements + rooms + hours). Edits save to **whichever plan is
active** in your browser (`premier-active-plan-id` in `localStorage`). Colleagues see your
changes **only if they switch to that same plan** — switching plans is like opening a different
shared spreadsheet tab, not a private draft.

### Plan kinds

| Kind (UI label) | `kind` value | Editable | Delete | Notes |
|-----------------|--------------|----------|--------|-------|
| **Default** | `live` | yes | **no** | Main schedule; `id=1` protected (`isProtectedPlan`) |
| **Plan** | `plan` (legacy `draft` displays as Plan) | yes | yes | Extra shared scenarios (e.g. next semester) |
| **Archive** | `archive` | **read-only** | yes | Snapshot; **Restore as new plan** copies to editable plan |

### Header actions (📁 menu)

- **Switch** — click a plan name (✓ = active)
- **+ New plan** — optional copy of current schedule
- **Save archive copy** — read-only snapshot; you stay on current plan
- **Rename current plan**
- **× Delete** — on Plan / Archive only (≥1 plan must remain; Default has no ×)
- **Restore as new plan** — when viewing an archive

### Reset / clear (header button)

| Active plan | Button | Action |
|-------------|--------|--------|
| Default | **Reset Data** | Restore `LIVE_V1_SEED` registration snapshot (everyone on Default) |
| Plan | **Clear schedule** | Empty all `placements`; set every `catalog[].reg` to 0; keep names/teachers/rooms/hours |
| Archive | disabled | — |

### Supabase row shape (v3)

```js
{
  planVersion: 3,
  plan: { name: "Summer B", kind: "plan", createdAt: "2026-06-13T..." },
  schedule: { version: 2, days, hours, rooms, catalog, placements, teachers, nextId }
}
```

Legacy row `id=1` may still be a flat v2 `schedule` until the next save; the app treats it as Default.

### Code layout

- `src/planService.js` — pack/unpack, local plan store (`premier-plans-v3`), remote list/load/save/create/delete
- `src/App.jsx` — plan switcher UI, `switchPlan`, `persist` gated on archive read-only
- `tests/plan.test.mjs` — envelope + local store helpers

### localStorage keys (v3)

| Key | Purpose |
|-----|---------|
| `premier-active-plan-id` | Last selected plan id |
| `premier-schedule-plan-{id}` | Per-plan schedule cache |
| `premier-plans-v3` | Full multi-plan store (localhost / offline) |
| `premier-classroom-schedule` | Legacy cache for active copy |
| `premier-ui-lib-open` | Class Library sidebar collapsed (`0`) or open (`1`) |
| `premier-roster-columns` | Roster tab column order (JSON array of column ids) |

---

## Architecture — key concepts in App.jsx

### Data model (v2 — day calendar)

All state lives in one object persisted to localStorage / the Supabase row:

```js
{
  version: 2,
  days: ["mon", "tue", "wed", "thu", "fri", "sat"],  // ordered subset of mon–sun
  hours: {
    default: [540, 1020],        // [startMin, endMin] — 9:00 AM–5:00 PM
    sat: [540, 780]              // optional per-day override (Sat 9:00 AM–1:00 PM)
  },
  rooms: [                       // ONE plain list for the whole week, ordered
    { id: "1", cap: 25 },
    { id: "2", cap: 12 }, { id: "3", cap: 12 },
    ...
  ],
  catalog: [
    { id, name, teacher, reg, note, students: string[] }  // one entry per class/cohort
  ],
  students: ["Alex Chen", ...],                      // deduped union (normalizeData on load)
  placements: [
    // minutes since midnight; rooms is usually one room — several = a combined classroom
    { id, classId, day: "tue", start: 870, end: 960, rooms: ["5"] },
    { id, classId, day: "mon", start: 540, end: 630, rooms: ["2", "3"] },
  ],
  teachers: ["Herrick", "Joshua", ...],              // roster; class.teacher stays a plain string
  nextId: <number>
}
```

The **catalog** is the master class list (shown in the Class Library sidebar); **placements** put a
class onto the calendar. A placement is `(day, start, end, rooms[])` — continuous minutes, not slot
indexes. A class placed several times has several placements sharing one catalog entry — one
roster, so signed-up count/name edits apply everywhere. A catalog entry with no placements is
"unscheduled" and sits in the library sidebar.

**Combined classrooms:** a placement with several rooms (`rooms: ["2","3"]`) occupies them all —
the class renders in every member room's column (purple "⇆ Rooms 2+3 combined" note) and its
capacity is the sum of the rooms' capacities (`capOfRooms`). Two placements conflict when they
overlap in time and share any room (`shareRoom` = array intersection). Rooms are combined per
class meeting via the room chips in `ClassModal` — there is no special combined-room entity.

**Migration chain (idempotent, in `upgrade()`):**
- v0 `{ classes: [...] }` → `migrateOld()` → v1 catalog + placements (unchanged from before)
- v1 (sections/slotIdx, AM+PM room groups) → `migrateV1toV2()`: `morning` placements expand to one
  placement per weekday; slot labels parse to minutes (bare hours: 8–11 = AM, 12 = noon, 1–7 = PM);
  a class-level note that is a time range (the old "actual time" workaround, e.g. `2:30–4:00`)
  overrides the slot times and is cleared; AM/PM room groups merge into one list (max capacity
  wins; placements in `"2+3"`-style morning rooms become multi-room placements `["2","3"]`)
- v2 → `normalizeV2()` validates/cleans; it also accepts the short-lived earlier v2 shape where
  combined rooms were standalone entries with `occupies` — those dissolve into their members and
  single `room` strings become `rooms` arrays
`upgrade()` runs on every load **and on every shared-row poll**, so if an old client writes v1 data
back to the shared row, the next v2 client re-upgrades it (hours overrides may be lost; placements
survive). After deploying, ask everyone to refresh open tabs.

### Days / tabs

One tab per entry in `days` (Mon–Sat by default), plus pseudo-tabs: **`weekOverview`** (📅 Week
Overview — time × days grid, room-colored blocks), **`byClass`**, **`byTeacher`**, **`byStudent`**
(🎓 By Student), **`roster`** (📒 Roster spreadsheet table). Code that uses
`tab` as a day must guard for pseudo-tabs (see `isDayTab` / `defaultDay`). There is no "Morning (Daily)" section anymore — a
daily class is simply five placements (the class dialog's **⇄ Mon–Fri** button creates them in
one click, and hovering a day tab mid-drag switches days so a card can be dropped on another day).

### Day grid rendering & interactions

The grid is absolutely-positioned blocks in room columns: `top = (start − gridStart) ×
PX_PER_MIN`, `height = duration × PX_PER_MIN` (1.1 px/min, 15-min snap via `SNAP`). The visible
range is the day's `hours` window, stretched to fit any placement outside it. Overlapping
placements in one room render side by side via `layoutLanes()` (cluster + lane assignment).
Interactions: HTML5 drag to move (a translucent ghost previews the snapped target; red ghost =
room conflict, drop rejected with a flash banner), pointer-event drag on a card's bottom edge to
resize (clamped at the next conflicting placement), click an empty time to create a class there,
drag a card onto the library to unschedule. Room conflicts are hard (red border, blocked drops);
teacher overlaps are amber warnings — same semantics as before, but tested by interval overlap
(`overlaps()`) instead of slot equality.

### Layout

The Class Library is a left sidebar (`aside`) inside the main content row. The sidebar has a fixed
width of 240px and its card list scrolls independently with `overflowY: auto`; the schedule tabs and
grid live in the flexible right pane. The content row uses the full browser width, not a centered
max-width wrapper, and the grid uses compact fixed-layout columns so all 8 afternoon rooms fit at a
standard 1280px viewport. Keep drag-and-drop handlers attached to the sidebar list so dropping a
scheduled grid card there still unschedules it without deleting the catalog entry.

The sidebar collapses to a 46px vertical rail (header ▾ toggle to hide, click the rail to reopen);
the preference persists in localStorage (`premier-ui-lib-open`). The collapsed rail keeps the
tray drop handlers, so dragging a scheduled card onto it still unschedules.

### Rooms and capacity

`rooms` is one ordered array of `{ id, cap }` for the whole week. `RoomModal` edits names,
ordering, and capacity (renames cascade into placement `rooms` arrays; deleting a room removes it
from placements, and a placement left with no rooms is unscheduled); clicking a room header on the
calendar (`openRoomCapEditor`) opens `RoomCapModal` — a styled overlay (room badge, numeric
capacity field, Cancel / Save capacity) that applies that room's capacity for the whole week.
Calendar room headers display `Cap N ✎`, and scheduled cards compare the class `reg` count against
the total capacity of the rooms they occupy. The Class Library only manages how many students are
signed up for a class.

Per-day scheduling windows live in `hours` (default + optional per-day overrides). The footer
under the day grid shows the active day's range and an **✎ Edit hours** button that opens
`HoursModal` (day badge, Start / End `<input type="time">`, Cancel / Save hours).

### Three ways to schedule a class

1. **Drag & drop.** Drag payloads are strings in `dataTransfer` (+ mirrored in `drag` state with
   the dragged duration, room set, and grab offset): `"lib:<classId>"` from a library card
   (duration = the class's existing meeting length, else 90 min); `"pl:<placementId>"` from a
   calendar card. Columns show a snapped ghost while dragging; a drop that would overlap another
   class in a shared room is rejected (red ghost + flash banner). A combined (multi-room)
   placement keeps its room set while dragging — the drag changes its day/time only and the ghost
   appears in every room it occupies; change its rooms in the dialog. Dropping onto the library
   sidebar removes the placement (unschedules without deleting). There is no swap-on-drop
   anymore — move one card aside first.
2. **Click an empty time** on a column — opens the class dialog pre-filled with that day, snapped
   start time (+90 min), and room.
3. **Schedule rows in `ClassModal`.** The dialog holds a local `rows` state
   (`{id?, day, start, end, rooms[]}` per meeting time; native `<input type="time">` fields and a
   row of room chips — click several chips to combine rooms; the label shows the combined
   capacity). Chips are disabled when taken (by another class on the board, or another overlapping
   row in the same dialog); `submit()` re-validates and shows `FormNotice` on conflict. The **⇄ Mon–Fri**
   button copies a row to every weekday. On save, `saveClass(form, rows)` rebuilds the class's
   placements: rows keep existing placement ids where present, new rows get fresh ids.

### Teacher roster & By Teacher view

`teachers` is a sorted list of names; class `teacher` fields remain plain strings (no teacher ids).
`normalizeData()` rebuilds the roster on load as stored list ∪ every teacher named on a class, deduped
case-insensitively via `teacherKey()`. The class dialog's Teacher field is a dropdown over the roster
plus "(Teacher TBD)" and "＋ Add new teacher…" (prompt; the name joins the roster when the class is
saved). The **👤 By Teacher** tab (`tab === "byTeacher"`, not a real day) replaces the calendar with a
**one-row-per-teacher** layout: sticky Teacher column lists each teacher's **class names** under
their name; the wide area to the right shows **horizontal schedule cards** for scheduled classes
(room-legend colors, class name + time + `Rm #`). Red / amber / orange dashed borders match grid
semantics (room / teacher / student clashes). Room legend bar across the top. Click a card to edit.
**Manage teachers** opens
`TeacherModal`: rename cascades to all classes (matched via `teacherKey`), removal sets classes to
TBD, a "(Teacher TBD)" row in the view collects unassigned classes. When `tab === "byTeacher"` the
class dialog's `defaultDay` falls back to the first day.

### By Class overview

The **📋 By Class** tab (`tab === "byClass"`) is a **time × rooms** grid (like a mini day calendar):
sticky left column shows class name, teacher, signed-up count, note, and **schedule summary lines**
(e.g. `Mon to Fri 9:00–10:30 AM`) via `classScheduleLines()`. Each class row renders positioned
blocks in room columns for that class's meeting window; blocks use room-legend colors with reg/cap
bar. **Drag a block** to move meeting time and room (all placements of the class shift together;
combined rooms keep their room set). Unscheduled classes sort first (amber). Row order matches the
Class Library (`sortCatalogForByClassView`: unscheduled first, bucket letter, earliest time, name).
Horizontal scroll inside the white container.

### Student roster, By Student & Roster tabs

Each catalog entry has a **`students[]`** roster (names, one per line in `ClassModal`; deduped via
`normalizeStudentList()`). Top-level **`students`** is rebuilt on load as stored list ∪ every name
on any class roster. **`reg`** (enrolled / signed-up count) equals **`students.length`** (deduped names).

The **🎓 By Student** tab (`tab === "byStudent"`) lists one row per student. Schedule cards run
left-to-right by earliest meeting time, then class name; cards use room-legend colors and show class,
time, days, room (`Rm #`), and teacher. **Manage students** opens `StudentModal`: rename cascades to
every class roster; remove drops the student from all classes.

The **📒 Roster** tab (`tab === "roster"`) is a flat table — one row per student per class (classes
with no roster show one `—` row). Columns: Class name, Class schedule, Student (bold), Room, Teacher.
Row background and left edge use room-legend colors. Default row order: earliest class time, then
class name (`sortCatalogForRosterView()`). **Spreadsheet controls:** click a column header to sort
A→Z / Z→A (↑↓ indicator); drag headers to reorder columns (persisted in `premier-roster-columns`).
Click any row to edit the class.

### Conflicts: room (red, blocking) vs teacher (amber, soft) vs student (orange, soft)

Room conflicts are hard errors, teacher overlaps are warnings — styled and worded distinctly so
they can't be confused:

- **Room conflict (red, `roomConflictStyle`)** — two classes overlapping in one room (member-room
  collisions of combined rooms included). Prevented by disabled room options in the modal
  dropdowns and rejected drops on the calendar; if a selected room becomes taken (after changing
  a row's day/time), an inline red "Room conflict: Room X already has Y" error appears and save is
  blocked with `FormNotice`. A class with two overlapping meetings of its own is blocked the same way.
  Pre-existing overlaps (e.g. surfaced by migration) still render — side by side with red borders —
  so they can be seen and fixed by dragging.
- **Teacher overlap (amber, `teacherWarningStyle`)** — `teacherKey()` normalizes teacher names and
  ignores blank / `TBD` / `N/A`; `teacherBusy()` finds other placements with the same teacher
  overlapping in time. Non-blocking: amber "⚠ Teacher overlap" notes under modal rows,
  amber border + badge on calendar cards, badge on sidebar cards, and an `InlineConfirm` step on save.
- **Student schedule clash (orange/coral, `STUDENT_CLASH_TOKENS`)** — when the same student appears
  on two class rosters and those classes have overlapping placements, `buildStudentConflictClassIds()`
  / `buildConflictReport()` flag the clash. Non-blocking: dashed orange border on overview cards and
  grid cards; header conflict panel shows **one row per student + class pair** (weekdays merged) with
  full `Rm #` labels; class editor shows `studentConflictLabelsAt()` warnings per schedule row.
  Student clash colors are intentionally **off** the room palette (not purple / room legend).
- **Open-room hints** — while a modal schedule row has no room selected, a muted line lists which
  rooms are still free at that time ("Open rooms: 1, 3" / "No open rooms at this time").

### In-app notices (`FormNotice` / `InlineConfirm`)

Class editor and manager modals use **`FormNotice`** (inline error/warning banner) and
**`InlineConfirm`** (two-step confirm inside the modal) instead of browser `alert()` / `confirm()`.
Teacher-overlap save and destructive actions (delete class, remove teacher/student) go through
`InlineConfirm`.

### Persistence (shared via Supabase)

The shared schedule lives in Supabase: `SUPABASE_URL` / `SUPABASE_KEY` consts at the top of
`App.jsx`, table `public.schedule`, one row (`id = REMOTE_ROW_ID = 1`) with the whole data object
as jsonb. Plain `fetch` against the PostgREST API — no SDK dependency. `remoteLoad()` /
`remoteSave()` / `remoteUpdatedAt()` are the only network functions. Flow: on mount, load the row
(seeding it from the local copy if it doesn't exist yet); `persist()` updates state, writes the
localStorage cache, and debounce-saves to Supabase (600 ms) with header status
("Saving…" / "Saved for everyone at …"); a 30 s poll picks up other computers' changes when this
tab has no pending save (last write wins, whole-document). Failed saves retry automatically every
5 s (and on the browser `online` event); a `pagehide` listener flushes a still-debouncing save with
`keepalive: true` so closing the tab doesn't drop the last edit. Offline / RLS errors show a red
banner with a "Retry now" button — there is no always-visible save button since saving is automatic. The anon key ships in the bundle by design — write access is limited only by
the permissive RLS policies (anyone with the URL can edit; add auth/PIN if that changes).
`saveData()` (localStorage) still verifies its write by reading back; with `SUPABASE_KEY` empty the
app runs exactly as the old browser-only version.

### Capacity color logic

`ratioColor(reg, roomCap)` returns `{bar, text, bg}` colors:
- green (`#0d7a72`) — below 75 % full
- amber (`#d97706`) — 75–99 % full
- red (`#dc2626`) — at or over room capacity

### Course management (sessions · attendance · homework · quizzes · report cards)

A second layer on top of the schedule that turns the weekday-recurring board into a
per-session gradebook. All of it rides in the **same per-plan envelope** (localStorage +
Supabase), so it follows plans and offline caching like everything else.

**New top-level fields** (added to the v2 `schedule` object; `version` stays `2`):

```js
term: { start: "2026-06-15", end: "2026-08-21", skipDates: ["2026-07-04"] } | null,
sessionLogs:    [ { classId, date, content, homework, note } ],                       // per class/date
attendance:     [ { classId, date, student, status, homework, note, by, at } ],       // per class/date/student
quizzes:        [ { id, classId, date, title, maxScore, kind } ],
quizScores:     [ { quizId, student, score, note, by, at } ],
reportComments: [ { classId, student, comment, by, at } ],                            // term-level
staffPins:      { "<teacher name>": "<pin>" }   // legacy; no longer written by UI (PIN removed)
```

- **Sessions are derived, never stored.** `sessionsForClass(classId, placements, term)`
  (in `scheduleLogic.ts`) intersects a class's placement weekdays with the term date range
  (minus `skipDates`) to produce dated `(classId, date)` sessions. Records key off
  `classId + date (+ student / quizId)`. Dates are `"YYYY-MM-DD"` strings; weekday is computed
  TZ-safe via `Date.UTC(...).getUTCDay()` (`weekdayIdOf`) so there are no off-by-one bugs.
- **⚠️ `normalizeV2()` carry-through is mandatory.** `upgrade()`/`normalizeV2()` runs on every
  load **and every remote poll** and returns an explicit object — any new field not listed there
  is silently dropped. Each field has a `clean*` helper (`cleanTerm`, `cleanAttendance`,
  `cleanQuizzes`, …) that validates and filters orphans (records pointing at deleted classes/quizzes)
  and de-dupes (keep-last). Tested by `normalizeV2 carries the course-management layer` in
  `tests/classbook.test.mjs`.
- **Cascades.** Renaming/removing a student (`saveStudents`) remaps/drops `attendance`,
  `quizScores`, `reportComments`; deleting a class (`stripClassData`) removes its sessionLogs,
  attendance, quizzes, quizScores, and comments; deleting a quiz removes its scores; renaming a
  teacher still remaps legacy `staffPins` entries if present.
- **Tabs.** `📓 Classbook` (lesson content + homework + attendance/homework-completion per session;
  responsive card layout on narrow screens via `useIsNarrow`), `📝 Grades` (quiz grid + averages +
  CSV), `🪪 Report Cards` (aggregation via `buildReportCard`; toggle **🎓 By Student** vs
  **📋 By Class** roster walk-through; optional **📝 Quiz only** filter for scores without
  attendance/homework/comments; SAT **Combined total** renders above per-subject sections;
  **inline score entry** on each quiz row and SAT combined-total Math/ELA cells via
  `upsertQuizScore` — same `quizScores` records as Grades; `🖨 Print` via an
  injected `@media print` style; CSV export for all students or the selected class, with
  quiz-detail rows when Quiz only is on). The Class
  Library `<aside>` is hidden on these three tabs (they have their own class pickers) — this also
  gives the Classbook full width on mobile.
- **Who's recording (audit label only).** Header **👤 Who's recording** / **Recording as …** picks
  the current teacher from `teachers`; stored in `localStorage` (`premier-current-teacher`) and
  stamped as `by`/`at` on Classbook / Grades / Report Card records. **Not** a login — no PIN,
  no auth. The anon Supabase key still ships in the bundle; anyone with the URL can edit.
- **Volunteer entry page (`?entry=1`).** Shareable link for helpers who should not use the full
  scheduler. `main.jsx` branches on `isEntryMode()` → `VolunteerApp`: free-text name
  (`premier-entry-name`), then **📓 Attendance & homework** + **📝 Quizzes** only (reuses
  `Classbook` / `GradesView`). Always loads **Default plan id=1** (does not follow the staff
  active-plan id). No term editor / class editor / schedule drag. Same Supabase last-write-wins
  sync as the main app. Local preview: `http://localhost:4180/?entry=1`.
- **Known limitation.** Saves are still whole-document last-write-wins on a 30 s poll; two teachers
  entering grades into the same plan simultaneously can clobber each other. The dirty-revision guard
  only protects your own unsaved edits from being overwritten by polls. Per-record sync is future work.
- **Code:** `src/domain/scheduleLogic.ts` (pure: `sessionsForClass`, `attendanceSummary`,
  `homeworkCompletionRate`, `quizAverage`, `upsertQuizScore`, `buildReportCard`, `suggestQuizDates`, date utils);
  `src/components/` (`Classbook.jsx`, `GradesView.jsx`, `ReportCards.jsx`, `TermModal.jsx`,
  `IdentityModal.jsx`, `classbookUtils.jsx`, and the extracted `uikit.jsx`); wiring in `App.jsx`.

### Shared UI kit (`src/components/uikit.jsx`)

The inline style tokens (`inputStyle`, `btnPrimary`, `thStyle`, …) and shared primitives
(`Overlay`, `Field`, `FormNotice`, `InlineConfirm`) were extracted from `App.jsx` into
`uikit.jsx` so the course-management views share the exact same look. `App.jsx` imports them at
the top; `STUDENT_CLASH_TOKENS` stays imported in `App.jsx` for its inline grid styling.

---

## Change log

- `f120258` — initial commit: grid-only scheduler (flat `classes` array).
- `3cefdd3` — **Class Library**: data model split into `catalog` + `placements`; library tray
  with search/duplicate/delete; drag lib→grid to schedule, grid→lib to unschedule; linked
  multi-day placements with shared roster; automatic localStorage migration.
- `6bb8021` — **schedule editor in the class dialog**: meeting times as day/slot/room dropdown
  rows with occupied-room disabling and conflict validation on save.
- 2026-06-10 — **left-side Class Library**: moved the Class Library from a horizontal tray above
  the grid into a 300px left sidebar with an independently scrollable class list.
- 2026-06-10 — **teacher conflict warnings**: same-teacher / same-time overlaps are marked in the
  class schedule editor, on affected calendar cards, and on affected sidebar cards.
- 2026-06-10 — **room capacities**: moved capacity from class records to editable room capacities;
  class dialogs now only edit signed-up students, and calendar room headers show capacity.
- 2026-06-10 — **explicit save status**: added verified localStorage writes, a visible saved-at
  status, a manual Save now button, and a detailed warning when browser storage fails.
- 2026-06-11 — **wider schedule pane**: removed the centered max-width wrapper, narrowed the library
  sidebar, and compacted grid columns so all rooms/day tabs fit on screen.
- 2026-06-11 — **grid card containment**: tightened schedule-card typography/controls, fixed card
  overflow inside compact columns, and removed the long native drag tooltip from cards.
- 2026-06-11 — **conflict semantics split**: room conflicts are red blocking errors (inline in the
  dialog and at save), teacher overlaps are amber warnings with a save-time confirm, plus
  open-room hints in schedule rows.
- 2026-06-11 — **teacher roster + By Teacher view**: managed teacher list, dropdown picker in the
  class dialog, per-teacher weekly schedule tab with double-booking highlights, Manage teachers modal.
- 2026-06-11 — **shared schedule via Supabase**: one shared row for everyone, debounced auto-save
  with status, 30 s polling, automatic retry (5 s / on reconnect / tab-close flush with keepalive);
  removed the header Save now button — a "Retry now" button appears in the failure banner instead.
- 2026-06-11 — **By Class view**: 📋 tab with one row per class (teacher, signed-up, meets-N×/week,
  note) and day columns showing each meeting's time + room; unscheduled classes sort first in amber,
  then rows order by earliest start time of day (slot labels parsed as AM for morning / PM for day
  tabs), tie-broken by day then name.
- 2026-06-11 — **collapsible library sidebar**: collapses to a slim rail (persisted preference);
  the rail still accepts drag-to-unschedule drops and shows the class count.
- 2026-06-12 — **day calendar (v2 data model)**: merged the Morning/PM tabs into one continuous
  per-day calendar (Mon–Sat, rooms × time axis); placements moved from `(section, slotIdx)` to
  `(day, start, end)` minutes with free start times (15-min snap) and drag-to-resize; added
  Saturday with per-day scheduling hours; idempotent `upgrade()` migration (morning → 5 weekday
  placements, note-time overrides become real times); remote sync disabled on localhost.
  Swap-on-drop was removed (drops on occupied space are rejected instead).
- 2026-06-12 — **per-placement combined classrooms**: replaced the standalone "2+3" room (and its
  `occupies` blocking) with multi-room placements — `placement.rooms` is an array, the class
  renders in every combined room's column, capacity is the rooms' total, and rooms are picked via
  chips in the class dialog (click several to combine). Conflicts = time overlap + shared room.
- 2026-06-12 — **grid card containment**: split each calendar card into a clipping text area and a
  fixed counter footer so signed-up counts and capacity bars never overflow the card at narrow
  widths; secondary lines ellipsis; combined-room label shortened to "Rm 2+3"; hide +/- steppers in
  side-by-side conflict lanes; first/last hour labels no longer clip at the grid edge.
- 2026-06-12 — **fix blank localhost after perf patch**: `updateSaveStatus` must be defined
  before `queueLocalSave` (TDZ ReferenceError crashed React mount).
- 2026-06-12 — **performance indexes + drag throttle**: schedule Maps/memos, rAF ghost/resize
  previews, debounced local saves, skip redundant remote poll updates.
- 2026-06-12 — **production snapshot seed**: `LIVE_V1_SEED` from live Supabase (classes, teachers,
  placements, room caps as of 2026-06-12); localhost auto-imports via `LIVE_SEED_TAG`; Reset Data
  uses the same snapshot (migrated to v2 on load).
- 2026-06-12 — **By Class row sort**: classes order by first letter A–Z, then earliest meeting
  time within the same letter (AM before PM), then full name when times still tie.
- 2026-06-12 — **By Teacher sidebar class list**: sticky Teacher column lists each teacher's class
  names under their name instead of an "N classes" count.
- 2026-06-12 — **overview UI polish + modals** (`ebe7c38`): By Class / By Teacher overview tabs
  aligned with main-branch pill design (uniform blocks, resize hardening, horizontal scroll); By
  Teacher pills show **class name first**, time + room as subtitle; By Class left column shows
  actual schedule lines (`Mon to Fri 9:00–10:30 AM`, etc.) via `classScheduleLines()` instead of
  meets-N×/week; room capacity and per-day hours use `RoomCapModal` / `HoursModal` instead of
  browser `prompt`/`alert`.
- 2026-06-12 — **automated tests** (`node:test`): `npm test` bundles pure helpers from `App.jsx`
  and covers migrations, conflict indexes, overview schedule lines, By Class sort, layout lanes,
  and TDZ/bundle smoke guards. Extracted `sortCatalogForByClassView()` for testability.
- 2026-06-12 — **fix By Class unscheduled sort**: comparator used `sa == null !== sb == null`
  (wrong precedence) so unscheduled rows sorted last; now `(sa == null) !== (sb == null)`.
- 2026-06-12 — **Vercel deploy fix**: `vercel.json` sets `outputDirectory: "."` so preview builds
  on `grok-feature-day-calendar` serve root `index.html` + `app.js` (not `public/`).
- 2026-06-13 — **Wave 1 — SCH-002**: `maxEndForPlacement` + resize commit guard (room conflicts
  blocked on pointer-up, envelope blockers respected).
- 2026-06-13 — **Wave 1 — API-001a**: Vercel preview host gated off Supabase; `persist()` accepts
  mutator functions using `dataRef` (fixes stale-closure overwrites on resize and other edits).
- 2026-06-13 — **Wave 1 — TEST-P0 + CI**: `migration.test.mjs`, `conflicts.test.mjs`,
  `sync.test.mjs`, GitHub Actions CI; **35 tests** green.
- 2026-06-13 — **Library sort aligned with By Class**: unscheduled first, then first letter
  A–Z, then earliest meeting time, then name (`sortCatalogForByClassView`).
- 2026-06-13 — **Catalog sort buckets for numeric names**: classes like `5/6th ELA` /
  `5/6th Math` share a `5/6th` bucket and order by earliest meeting (Math 9:00 before ELA 10:30).
- 2026-06-13 — **📅 Week Overview tab**: read-only week grid (time × Mon–Sat columns);
  blocks show class name, time, teacher, and `Rm #`; background color per room (legend on top);
  overlapping meetings use `layoutLanes`; click block to edit class.
- 2026-06-13 — **Fix class modal blank crash**: `teacherConflictsAt` now passes `rooms` on
  each schedule row; `roomConflictsIndexed` guards missing `rooms` (crashed when teacher was set).
- 2026-06-13 — **Week Overview time axis**: wider sticky column (64px), higher z-index, hour
  labels aligned to grid lines (no overlap from Monday blocks).
- 2026-06-13 — **v3 multi-plan** (`v3-plans` branch): shared plans (Default + named Plan +
  read-only Archive), header 📁 switcher, new/delete/restore, per-plan Supabase rows via
  `src/planService.js`; localhost `premier-plans-v3`.
- 2026-06-13 — **v3 simplify UX**: drop planning-mode banner; all editable plans sync the same
  way; **Clear schedule** on Plan (empty times + zero reg) vs **Reset Data** on Default only.
- 2026-06-13 — **v3 protect Default**: `isProtectedPlan` — `id=1` / `kind: live` cannot be deleted.
- 2026-06-13 — **By Teacher room-column layout**: teachers × room columns (like By Class); horizontal
  schedule cards per row with room-legend colors.
- 2026-06-13 — **Editable program label**: header subtitle (`programLabel`) editable via modal; persists
  in schedule data.
- 2026-06-14 — **Week Overview day headers**: click a day column header to jump to that day tab.
- 2026-06-15 — **Week Overview polish**: room-colored block detail on hover; richer pre-edit labels.
- 2026-06-16 — **Per-class student rosters + 🎓 By Student tab**: `catalog[].students[]`, top-level
  `students` list, roster textarea in class dialog, `StudentModal` (rename/remove cascades).
- 2026-06-16 — **Student schedule conflicts**: detection in `scheduleLogic.ts`; orange dashed styling
  on cards; header panel rows merged per student/class pair with `Rm #` labels.
- 2026-06-16 — **By Class drag**: drag overview pills to move meeting time and room (like grid).
- 2026-06-16 — **In-app dialogs**: `FormNotice` / `InlineConfirm` replace native `alert`/`confirm` in
  class editor and manager modals.
- 2026-06-17 — **📒 Roster tab**: flat class × student table with room-legend row colors; default sort
  via `sortCatalogForRosterView()` (earliest time, then name); bold student names.
- 2026-06-17 — **Roster spreadsheet columns**: click headers to sort any column; drag headers to
  reorder columns (`premier-roster-columns` in localStorage).
- 2026-06-18 — **Course-management layer**: program `term` → derived dated sessions;
  `📓 Classbook` (lesson content, homework, attendance, homework completion; mobile card layout),
  `📝 Grades` (quizzes with suggested Fridays, score grid + averages, CSV), `🪪 Report Cards`
  (per-student aggregation, print, CSV). New `term/sessionLogs/attendance/quizzes/quizScores/`
  `reportComments/staffPins` carried through `normalizeV2` with orphan filtering + cascades;
  lightweight teacher identity (`👤 Sign in`, `premier-current-teacher`, optional PIN). Pure
  helpers + carry-through covered by `tests/classbook.test.mjs` (**82 tests**). Extracted shared
  `src/components/uikit.jsx`; new views live under `src/components/`.
- 2026-06-26 — **Save guards + auto-backup**: Default (plan id=1) refuses to sync when `catalog` is
  empty; every remote save first copies the **previous server row** to a hidden backup (`schedule`
  row id `10000 + planId`, `⟲ Auto-backup · …`, hidden from 📁 menu). Restore:
  `node scripts/restore-auto-backup.mjs [planId]`.
- 2026-07-09 — **Who's recording (no fake login)**: header **👤 Sign in** + optional PIN replaced by
  **Who's recording** / **Recording as …** — audit label only (`premier-current-teacher` → `by`/`at`).
  PIN UI removed; legacy `staffPins` still carried through `normalizeV2` but not written.
- 2026-07-09 — **Volunteer entry page**: `?entry=1` (or `?mode=entry`) opens `VolunteerApp` —
  name gate + Classbook/Grades only, fixed Default plan. Share the production URL + query with
  volunteers. Sources: `src/entryMode.js`, `src/VolunteerApp.jsx`, `src/main.jsx`.
- 2026-07-09 — **Quiz sheet template**: `templates/PremierPlus_Quiz_Sheet_Template.xlsx` (English;
  Instructions + Classes index + one score tab per live class; **Import** tab formula-maps every
  class sheet → long rows for CSV export). `templates/PremierPlus_Class_Rosters.csv` roster dump.
- 2026-07-14 — **Report Cards · By Class**: `🪪 Report Cards` gains a **🎓 By Student** /
  **📋 By Class** toggle. By Class picks a class (same sorted catalog as Classbook/Grades), walks
  that roster with ◀ ▶, and shows only that class’s section on each student’s card. CSV export
  scopes to the selected class when in By Class mode. Source: `src/components/ReportCards.jsx`.
- 2026-07-14 — **Report Cards · Quiz only**: toolbar toggle **📝 Quiz only** hides attendance,
  homework, and teacher comments; card shows quiz average + per-quiz score table. CSV exports
  one row per student × quiz with score/max/% when Quiz only is on.
- 2026-07-14 — **Report Cards · Class average**: each class section shows a **Class average**
  tile (mean of roster students’ quiz avgs) and a **Class %** column per quiz via
  `classQuizAverages` in `scheduleLogic.ts`. CSV includes class avg columns.
- 2026-07-15 — **Report Cards · SAT combined total**: pairs **SAT Math** + **SAT ELA** (and
  Afternoon variants on their own track) by practice date+title; shows Math/ELA/Total via
  `buildSatTotals` / `satSubjectOf`. PSAT is not paired.
- 2026-07-20 — **SAT no class averages + cross-session totals**: SAT class sections (Report Cards
  + Grades) hide Class average / Class % / Class avg. Combined total no longer shows class total.
  Students on morning Math + afternoon ELA (or vice versa) get one merged Combined total table;
  full AM + full PM programs stay as two tables.
- 2026-07-21 — **Report Cards · per-quiz Class avg**: every quiz row (including SAT) shows a
  **Class avg** column (roster mean %). Overall Class average tile still omitted for SAT.
- 2026-08-12 — **Report Cards · inline scores**: quiz score cells (class table + SAT Math/ELA)
  are editable on 🪪 Report Cards — same `quizScores` writes as 📝 Grades (`upsertQuizScore`).
  `quizAverage.detail` now lists every class quiz (unscored rows are empty) so a student with
  no score yet still has a cell to type into. Print view still shows the numeric score, not the
  input. Archive/read-only plans stay text-only.
- 2026-08-12 — **Report Cards · SAT combined first**: the SAT **Combined total** block renders
  above the per-subject class sections (Math / ELA / other classes), in both By Student and
  By Class.

---

## Upgrade opportunities

- **Export / print view** — a read-only printable summary of the week's schedule.
- **TypeScript** — the data model is well-defined; adding types to `App.jsx` is a self-contained change.
- **Split into components (in progress)** — `src/components/` now holds `uikit.jsx` (shared styles + Overlay/Field/FormNotice/InlineConfirm) and the course-management views. The remaining big presentational components still inside `App.jsx` (`ClassModal`, `RoomModal`, `RosterView`, `ClassScheduleView`, `TeacherScheduleView`, `StudentScheduleView`, `WeekOverviewView`) could move out next — they're self-contained and take props.
- **Build pipeline** — `app.js` is still committed for zero-step GitHub Pages; `vercel.json` already runs `npm run build` on deploy. Could stop committing the bundle if all hosts run esbuild.
- **Mobile layout** — the grid uses a `<table>` with `overflowX: auto`. A card-based layout for small screens would improve mobile usability.

