# Handoff — Classroom Scheduler

## What this is

**Premier Plus · Classroom Scheduler** — an interactive scheduling board for the 2026 Summer program at Jericho. Staff can view and edit a weekly class grid (rooms × time slots), drag-and-drop classes, adjust enrollment counts, and manage rooms.

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
├── index.html          # Page shell — mounts #root, loads app.js
├── app.js              # Committed production bundle (do not hand-edit)
├── package.json        # Dependencies: react, react-dom, esbuild
├── src/
│   ├── main.jsx        # Entry point — ReactDOM.createRoot → <ClassroomScheduler />
│   └── App.jsx         # Entire application (single file, ~700 lines)
└── handoff.md          # This file
```

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
  slots: {
    morning: ["9:00–10:30", "10:30–12:00"],
    mon: ["12:30–2:00", "2:00–3:30", "3:30–5:00"],
    // ... tue, wed, thu, fri
  },
  classes: [
    { id, section, slotIdx, room, name, teacher, reg, cap, note }
  ],
  nextId: <number>
}
```

A class is addressed by `(section, slotIdx, room)` — there is no grid matrix, just a flat array of class objects that are filtered by those three fields.

### Sections / tabs

Six tabs: `morning` (daily AM), then `mon`–`fri` (afternoon PM). Morning uses `rooms.morning`; all afternoon tabs share `rooms.afternoon`.

### Persistence

`loadData()` / `saveData()` in `App.jsx` (lines 100–115) are the only places that touch localStorage. Swapping these two functions is the complete scope of adding a backend.

### Enrollment color logic

`ratioColor(reg, cap)` (line 118) returns `{bar, text, bg}` colors:
- green (`#0d7a72`) — below 75 % full
- amber (`#d97706`) — 75–99 % full
- red (`#dc2626`) — at or over capacity

---

## Upgrade opportunities

- **Backend / multi-user sync** — replace `loadData` / `saveData` with Supabase or Firebase realtime calls. The rest of the app is unaffected.
- **TypeScript** — the data model is well-defined; adding types to `App.jsx` is a self-contained change.
- **Split into components** — `App.jsx` is a single ~700-line file. `ClassModal`, `RoomModal`, and `Overlay` are already split into functions at the bottom; moving them to separate files under `src/components/` is straightforward.
- **Build pipeline** — currently `app.js` is committed. Adding a `vercel.json` with a `buildCommand` would let Vercel run esbuild on deploy instead, removing the committed bundle.
- **Mobile layout** — the grid uses a `<table>` with `overflowX: auto`. A card-based layout for small screens would improve mobile usability.
- **Export / print view** — a read-only printable summary of the week's schedule.
