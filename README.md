# Premier Plus · Classroom Scheduler

An interactive classroom scheduling board for the 2026 Summer program (Jericho).

**Live demo:** enable GitHub Pages (instructions below) and the site will be served at
`https://<your-username>.github.io/classroom-scheduler/`

## Features

- **Day calendar**: one tab per day (Mon–Sat), rooms as columns, a continuous time axis —
  morning and afternoon live on the same canvas and classes can start at any time
  (no fixed slots; drags snap to 15 minutes)
- Each day has its own scheduling window (e.g. Saturday runs 9:00 AM–1:00 PM) — edit it
  with **✎ Edit hours** under the grid; the grid stretches automatically if a class is
  placed outside the window
- **Combined classrooms**: select several room chips in the class dialog and the class occupies
  those rooms together — it appears in each combined room's column on the calendar (purple ⇆ note)
  and its capacity is the rooms' total (e.g. SAT across Rooms 2+3 every morning); no special
  room entry needed
- **Class Library**: define every class once (name / teacher / signed-up students); unscheduled classes wait in
  the library sidebar. Drag a card onto the calendar to schedule it — place the same class on several days
  (hover a day tab while dragging to switch days) and it stays one record with one shared enrollment.
  Drag a scheduled card back into the library to unschedule it without deleting it.
- Click any empty time on the calendar to create a class right there; the class dialog's
  meeting-time rows (day · start–end · room chips) include a **⇄ Mon–Fri** button that repeats a
  meeting on every weekday — the old "Morning (Daily)" pattern in one click
- **Drag & drop** a card to move it; drag a card's bottom edge to change its length
- Conflict handling: overlapping classes in one room are a hard conflict (red border, drops are
  blocked and overlaps render side by side); a double-booked teacher is an amber warning
- **Teacher roster**: pick teachers from a dropdown when editing a class (or add new ones inline);
  the **👤 By Teacher** tab shows each teacher's weekly schedule with amber ⚠ warnings when someone
  is double-booked, and renaming a teacher in **Manage teachers** updates every class they teach
- **📋 By Class** tab: one row per class with every meeting across the week
- Room capacities are managed in **Manage Rooms** and shown under each room header on the calendar;
  scheduled cards compare signed-up students against the room capacity with a color-coded progress bar
  (green = room has space, amber = nearly full, red = at or over room capacity)
- All changes save automatically to the shared schedule (everyone sees the same data); the header
  shows live save status and failed saves retry on their own
- Older saved schedules (the slot-based format) migrate automatically on first load
- Reset Data restores the original schedule

## Project structure

```
index.html      ← page shell (loads app.js)
app.js          ← bundled production build (committed, so GitHub Pages works with zero build step)
src/App.jsx     ← application source
src/main.jsx    ← entry point
```

## Develop / rebuild

```bash
npm install
npx esbuild src/main.jsx --bundle --minify --outfile=app.js --define:process.env.NODE_ENV='"production"'
```

Then open `index.html` in a browser (or serve with `npx serve .`).

**Note:** on `localhost` the app runs in browser-only mode (no shared-schedule sync), so local
experiments never touch the live shared data.

## Deploy to GitHub Pages

1. Push this repository to GitHub (see below)
2. On GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / root → Save**
3. Wait ~1 minute; the site appears at `https://<your-username>.github.io/classroom-scheduler/`

## Note on data

The shared schedule lives in Supabase (one row, last write wins); `localStorage` is the offline
fallback/cache. The first time the new version loads it upgrades the stored schedule from the old
slot-based format to the day-calendar format (morning classes expand to Mon–Fri placements; note-based
"actual times" like `2:30–4:00` become the real placement times). The upgrade is idempotent — but after
deploying, ask everyone to refresh any open tabs so an old client doesn't write the old format back.
