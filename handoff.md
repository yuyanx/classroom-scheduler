# Handoff — Classroom Scheduler

## What this is

**Premier Plus · Classroom Scheduler** — an interactive scheduling board for the 2026 Summer program at Jericho. Staff define classes in a **Class Library**, then schedule them onto a weekly grid (rooms × time slots) either by drag-and-drop or by editing meeting times in the class dialog. Class signed-up counts, rooms, room capacities, and time slots are all editable in place.

No backend. All state is stored in the visitor's browser (`localStorage`, key: `premier-classroom-schedule`). Two users opening the site see independent copies.

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
│   └── App.jsx           # Entire application (single file, ~1000 lines)
├── .claude/launch.json   # Local preview server config (python3 http.server on :4173)
└── handoff.md            # This file
```

Components inside `App.jsx` (top to bottom): default data + `migrateOld()` →
`ClassroomScheduler` (main: left library sidebar, tabs, grid, all state ops) →
`ClassModal` (class fields + schedule-rows editor) → `RoomModal` → `Overlay` / `Field` → style objects.

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

---

## Architecture — key concepts in App.jsx

### Data model

All state lives in one object persisted to localStorage:

```js
{
  rooms: {
    morning: ["1", "2+3", "4", "5", "6", "7", "8"],   // Morning uses combined 2+3
    afternoon: ["1", "2", "3", "4", "5", "6", "7", "8"]
  },
  roomCaps: {
    morning: { "1": 12, "2+3": 25, "4": 12, ... },
    afternoon: { "1": 25, "2": 12, "3": 12, ... }
  },
  slots: {
    morning: ["9:00–10:30", "10:30–12:00"],
    mon: ["12:30–2:00", "2:00–3:30", "3:30–5:00"],
    // ... tue, wed, thu, fri
  },
  catalog: [
    { id, name, teacher, reg, note }            // one entry per class/cohort
  ],
  placements: [
    { id, classId, section, slotIdx, room }     // where a class meets
  ],
  nextId: <number>
}
```

The **catalog** is the master class list (shown in the Class Library sidebar); **placements** put a
class into grid cells. A grid cell is addressed by `(section, slotIdx, room)`; the cell's class is
found by joining `placement.classId` → catalog. A class placed on several days has several
placements sharing one catalog entry — one roster, so signed-up count/name edits apply everywhere.
A catalog entry with no placements is "unscheduled" and sits in the library sidebar.

**Migration:** `migrateOld()` in `App.jsx` converts the pre-library localStorage shape
(`{ classes: [{section, slotIdx, room, name, ...}] }`) on load. Grid entries that were fully
identical (name/teacher/reg/note) are merged into one catalog entry with multiple placements.
Old class-level `cap` values are used to infer `roomCaps` during migration / normalization, then
removed from catalog entries. `normalizeData()` also adds `roomCaps` for existing catalog-format
localStorage that predates room capacities.

### Sections / tabs

Six tabs: `morning` (daily AM), then `mon`–`fri` (afternoon PM). Morning uses `rooms.morning`; all afternoon tabs share `rooms.afternoon`. A class placed in `morning` meets every day by convention; a PM class meeting twice a week simply has placements on two day tabs.

### Layout

The Class Library is a left sidebar (`aside`) inside the main content row. The sidebar has a fixed
width of 300px and its card list scrolls independently with `overflowY: auto`; the schedule tabs and
grid live in the flexible right pane. Keep drag-and-drop handlers attached to the sidebar list so
dropping a scheduled grid card there still unschedules it without deleting the catalog entry.

### Rooms and capacity

Rooms remain ordered string arrays under `rooms.morning` and `rooms.afternoon`; capacities live in
the parallel `roomCaps` object keyed by the same room names. `RoomModal` edits room names, ordering,
and capacity together. Calendar room headers display `Cap N`, and scheduled cards compare the class
`reg` count against the capacity of the room they are placed in. The Class Library no longer edits a
class capacity; it only manages how many students are signed up for that class.

### Two ways to schedule a class

1. **Drag & drop.** Drag payloads are strings in `dataTransfer` (+ mirrored in `drag` state):
   `"lib:<classId>"` from a library card — dropping on an *empty* grid cell creates a placement
   (occupied cells reject it); `"pl:<placementId>"` from a grid card — dropping on a cell
   moves it (occupied target = swap), dropping back onto the library sidebar removes the
   placement (unschedules without deleting).
2. **Schedule rows in `ClassModal`.** The dialog holds a local `rows` state
   (`{id?, section, slotIdx, room}` per meeting time). Room options are disabled when taken
   (by another class on the board, or another row in the same dialog); `submit()` re-validates
   and alerts on conflict. On save, `saveClass(form, rows)` rebuilds the class's placements:
   rows keep existing placement ids where present, new rows get fresh ids. Opening a class from
   the Class Library and changing its schedule rows uses this same path, so the calendar grid updates
   immediately after save.

### Teacher conflict warnings

`teacherKey()` normalizes teacher names and ignores blank / `TBD` / `N/A` values. `teacherConflictsAt()`
checks for another placement with the same normalized teacher in the same `(section, slotIdx)`.
Teacher conflicts are non-blocking warnings: the class modal marks the affected schedule row before
save, grid cards get a red border plus a "Teacher conflict" badge, and the sidebar card also shows a
warning when any of that class's placements conflict. Room conflicts remain hard blockers.

### Persistence

`loadData()` / `saveData()` near the top of `App.jsx` are the only places that touch localStorage. Swapping these two functions is the complete scope of adding a backend.

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

---

## Upgrade opportunities

- **Backend / multi-user sync** — replace `loadData` / `saveData` with Supabase or Firebase realtime calls. The rest of the app is unaffected.
- **TypeScript** — the data model is well-defined; adding types to `App.jsx` is a self-contained change.
- **Split into components** — `App.jsx` is a single ~1000-line file. `ClassModal`, `RoomModal`, and `Overlay` are already split into functions at the bottom; moving them to separate files under `src/components/` is straightforward.
- **Build pipeline** — currently `app.js` is committed. Adding a `vercel.json` with a `buildCommand` would let Vercel run esbuild on deploy instead, removing the committed bundle.
- **Mobile layout** — the grid uses a `<table>` with `overflowX: auto`. A card-based layout for small screens would improve mobile usability.
- **Export / print view** — a read-only printable summary of the week's schedule.
