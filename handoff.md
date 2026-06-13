# Handoff — Classroom Scheduler

## What this is

**Premier Plus · Classroom Scheduler** — an interactive scheduling board for the 2026 Summer program at Jericho. Staff define classes in a **Class Library**, then schedule them onto a per-day calendar (rooms as columns × a continuous time axis, Mon–Sat) by drag-and-drop, by clicking an empty time, or by editing meeting times in the class dialog. Classes can start at any time (15-minute snap, no fixed slots). Class signed-up counts, rooms, room capacities, and per-day hours are all editable in place.

State is one shared schedule in Supabase (project `zbvedbwbxdzcsnftvyph`, table `public.schedule`, single row `id=1`, `data` jsonb) — everyone who opens the site sees and edits the same copy, last write wins. `localStorage` (key: `premier-classroom-schedule`) remains the offline fallback/cache. With `SUPABASE_KEY` empty the app degrades to browser-only copies. **On `localhost` the remote sync is disabled by design** (`IS_LOCAL_DEV` in `App.jsx`), so local development never touches the live shared schedule.

---

## Live URLs

| | URL |
|---|---|
| Production | https://classroom-scheduler-ruddy.vercel.app |
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

No TypeScript, no router, no state management library.

---

## File structure

```
classroom-scheduler/
├── index.html            # Page shell — mounts #root, loads app.js
├── app.js                # Committed production bundle (do not hand-edit)
├── package.json          # Dependencies: react, react-dom, esbuild
├── src/
│   ├── main.jsx          # Entry point — ReactDOM.createRoot → <ClassroomScheduler />
│   └── App.jsx           # Entire application (single file, ~2400 lines)
├── .claude/launch.json   # Local preview server config (python3 http.server on :4173)
└── handoff.md            # This file
```

Components inside `App.jsx` (top to bottom): time helpers + default data + migrations
(`migrateOld()` → `migrateV1toV2()` → `normalizeV2()`, entry point `upgrade()`) →
`ClassroomScheduler` (main: left library sidebar, day tabs, day calendar with drag/resize, all state ops) →
`ClassModal` (class fields + schedule-rows editor) → `ClassScheduleView` (By Class tab) →
`TeacherScheduleView` (By Teacher tab) → `TeacherModal` → `RoomModal` → `RoomCapModal` →
`HoursModal` → overview pill helpers → `Overlay` / `Field` → style objects.

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

**Every commit must update this file** — add a changelog entry (and adjust architecture sections when
behavior or UI changes). Keep `handoff.md` in sync with the code you ship.

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
touch the shared Supabase row (`IS_LOCAL_DEV` keeps remote sync off). **Reset Data** also restores
this snapshot (not the old registration-sheet defaults). To refresh from production later: fetch
the `schedule` row, replace `LIVE_V1_SEED`, bump `LIVE_SEED_TAG`, rebuild `app.js`.

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
    { id, name, teacher, reg, note }                 // one entry per class/cohort
  ],
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

One tab per entry in `days` (Mon–Sat by default), plus two pseudo-tabs (`tab === "byClass"` /
`"byTeacher"`) that swap the calendar for read-only overview tables — one row per class / per
teacher, columns = days, click-to-edit. Code that uses `tab` as a day must guard for the
pseudo-tabs (see `isDayTab` / `defaultDay`). There is no "Morning (Daily)" section anymore — a
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
   row in the same dialog); `submit()` re-validates and alerts on conflict. The **⇄ Mon–Fri**
   button copies a row to every weekday. On save, `saveClass(form, rows)` rebuilds the class's
   placements: rows keep existing placement ids where present, new rows get fresh ids.

### Teacher roster & By Teacher view

`teachers` is a sorted list of names; class `teacher` fields remain plain strings (no teacher ids).
`normalizeData()` rebuilds the roster on load as stored list ∪ every teacher named on a class, deduped
case-insensitively via `teacherKey()`. The class dialog's Teacher field is a dropdown over the roster
plus "(Teacher TBD)" and "＋ Add new teacher…" (prompt; the name joins the roster when the class is
saved). The **👤 By Teacher** tab (`tab === "byTeacher"`, not a real day) replaces the calendar with a
teachers × days table. The sticky Teacher column lists each teacher's **class names** under their
name (not an "N classes" count). Each day cell lists that teacher's meetings as stacked **pill cards**
(rounded, bordered, `minHeight: 42`): **class name on the first line** (bold), time + room on the
second line (subtitle); amber border/background + ⚠ when two of their classes overlap in time;
click-to-edit.
Its "Manage teachers" button opens
`TeacherModal`: rename cascades to all classes (matched via `teacherKey`), removal sets classes to
TBD, a "(Teacher TBD)" row in the view collects unassigned classes. When `tab === "byTeacher"` the
class dialog's `defaultDay` falls back to the first day.

### By Class overview

The **📋 By Class** tab (`tab === "byClass"`) is a classes × days table. The sticky left column
shows class name, teacher, signed-up count, note, and **schedule summary lines** (e.g.
`Mon to Fri 9:00–10:30 AM`) derived from placements via `classScheduleLines()` — not a
"meets N×/week" count. Day columns use the same pill style as main: time on line 1, room on line 2;
morning placements (`start < 720`) use teal `#f0fdfa`, afternoon use gray `#f8fafc`. Unscheduled
classes sort first (amber row). Rows order by **first letter of class name** A–Z, then by each
class's **earliest start time** within the same letter (morning before afternoon), then full name
when times still tie. Overview tables use `width: 100%`,
large `minWidth`, and horizontal scroll inside the white container; stacked pills use
`flex flex-col gap: 4`.

### Conflicts: room (red, blocking) vs teacher (amber, soft)

Room conflicts are hard errors, teacher overlaps are warnings — styled and worded distinctly so
they can't be confused:

- **Room conflict (red, `roomConflictStyle`)** — two classes overlapping in one room (member-room
  collisions of combined rooms included). Prevented by disabled room options in the modal
  dropdowns and rejected drops on the calendar; if a selected room becomes taken (after changing
  a row's day/time), an inline red "Room conflict: Room X already has Y" error appears and save is
  blocked with an alert. A class with two overlapping meetings of its own is blocked the same way.
  Pre-existing overlaps (e.g. surfaced by migration) still render — side by side with red borders —
  so they can be seen and fixed by dragging.
- **Teacher overlap (amber, `teacherWarningStyle`)** — `teacherKey()` normalizes teacher names and
  ignores blank / `TBD` / `N/A`; `teacherBusy()` finds other placements with the same teacher
  overlapping in time. Non-blocking: amber "⚠ Teacher overlap" notes under modal rows,
  amber border + badge on calendar cards, badge on sidebar cards, and a `window.confirm` summary on save.
- **Open-room hints** — while a modal schedule row has no room selected, a muted line lists which
  rooms are still free at that time ("Open rooms: 1, 3" / "No open rooms at this time").

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

---

## Upgrade opportunities

- **Backend / multi-user sync** — replace `loadData` / `saveData` with Supabase or Firebase realtime calls. The rest of the app is unaffected.
- **TypeScript** — the data model is well-defined; adding types to `App.jsx` is a self-contained change.
- **Split into components** — `App.jsx` is a single ~2400-line file. `ClassModal`, `RoomModal`, and `Overlay` are already split into functions at the bottom; moving them to separate files under `src/components/` is straightforward.
- **Build pipeline** — currently `app.js` is committed. Adding a `vercel.json` with a `buildCommand` would let Vercel run esbuild on deploy instead, removing the committed bundle.
- **Mobile layout** — the grid uses a `<table>` with `overflowX: auto`. A card-based layout for small screens would improve mobile usability.
- **Export / print view** — a read-only printable summary of the week's schedule.
