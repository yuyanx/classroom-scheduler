# Premier Plus · Classroom Scheduler

An interactive classroom scheduling board for the 2026 Summer program (Jericho).

**Live demo:** enable GitHub Pages (instructions below) and the site will be served at
`https://<your-username>.github.io/classroom-scheduler/`

## Features

- Schedule grid: time slots × rooms, with separate tabs for Morning (daily) and Mon–Fri afternoons
- Morning uses combined Room 2+3; afternoons use Rooms 2 and 3 separately
- **Class Library**: define every class once (name / teacher / signed-up students); unscheduled classes wait in
  the library sidebar. Drag a card onto the grid to schedule it — place the same class on several days
  and it stays one record with one shared enrollment (edits sync everywhere). Drag a scheduled card
  back into the library to unschedule it without deleting it.
- **Teacher roster**: pick teachers from a dropdown when editing a class (or add new ones inline);
  the **👤 By Teacher** tab shows each teacher's weekly schedule with amber ⚠ warnings when someone
  is double-booked, and renaming a teacher in **Manage teachers** updates every class they teach
- Room capacities are managed in **Manage Rooms** and shown under each room header on the calendar
- Scheduled class cards compare signed-up students against the assigned room capacity with a color-coded progress bar
  (green = room has space, amber = nearly full, red = at or over room capacity)
- **Drag & drop** a class card to move it to another time slot or room; drop onto another class to swap
- Click any card to edit name / teacher / signed-up students / notes; ＋ − steppers for quick enrollment changes
- Add, rename, reorder, set capacity for, or delete rooms and time slots
- All changes are verified and saved to the browser automatically; the header shows saved status and includes **Save now**
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

## Deploy to GitHub Pages

1. Push this repository to GitHub (see below)
2. On GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / root → Save**
3. Wait ~1 minute; the site appears at `https://<your-username>.github.io/classroom-scheduler/`

## Note on data

Schedule data lives in each visitor's own browser (localStorage). Two people opening the site see
their own independent copies — there is no shared backend. If you need multi-user shared editing,
the next step would be adding a small backend (e.g. Supabase / Firebase) — the data layer is isolated
in `loadData` / `saveData` in `src/App.jsx`, so it's a contained change.
