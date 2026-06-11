import React, { useState, useCallback, useEffect } from "react";

// ───────────────────────── Default data (from 2026 Summer Jericho schedule) ─────────────────────────
// Morning uses combined room 2+3; afternoons use rooms 2 and 3 separately
const DEFAULT_ROOMS = {
  morning: ["1", "2+3", "4", "5", "6", "7", "8"],
  afternoon: ["1", "2", "3", "4", "5", "6", "7", "8"],
};
const DEFAULT_ROOM_CAPS = {
  morning: { "1": 12, "2+3": 25, "4": 12, "5": 12, "6": 12, "7": 12, "8": 12 },
  afternoon: { "1": 25, "2": 12, "3": 12, "4": 12, "5": 12, "6": 12, "7": 12, "8": 12 },
};

const SECTIONS = [
  { id: "morning", label: "Morning (Daily)", short: "AM" },
  { id: "mon", label: "Mon PM", short: "Mon" },
  { id: "tue", label: "Tue PM", short: "Tue" },
  { id: "wed", label: "Wed PM", short: "Wed" },
  { id: "thu", label: "Thu PM", short: "Thu" },
  { id: "fri", label: "Fri PM", short: "Fri" },
];

const sectionShort = (id) => SECTIONS.find((s) => s.id === id)?.short || id;
const sectionIdx = (id) => SECTIONS.findIndex((s) => s.id === id);
const roomGroup = (sectionId) => (sectionId === "morning" ? "morning" : "afternoon");

const DEFAULT_SLOTS = {
  morning: ["9:00–10:30", "10:30–12:00"],
  mon: ["12:30–2:00", "2:00–3:30", "3:30–5:00"],
  tue: ["12:30–2:00", "2:00–3:30", "3:30–5:00"],
  wed: ["12:30–2:00", "2:00–3:30", "3:30–5:00"],
  thu: ["12:30–2:00", "2:00–3:30", "3:30–5:00"],
  fri: ["12:30–2:00", "2:00–3:30", "3:30–5:00"],
};

let _seed = 1;
const mk = (section, slotIdx, room, name, teacher, reg, cap, note = "") => ({
  id: "c" + _seed++,
  section, slotIdx, room, name, teacher,
  reg: reg || 0, cap: cap || 12, note,
});

const DEFAULT_CLASSES = [
  // Morning 9:00–10:30
  mk("morning", 0, "2+3", "SAT", "Joshua", 22, 25),
  mk("morning", 0, "7", "ELA", "Linda", 8, 12),
  mk("morning", 0, "6", "Alg2", "James", 7, 12),
  mk("morning", 0, "4", "Geo", "Thomas", 5, 12),
  mk("morning", 0, "5", "5/6th Math", "Matthew M", 8, 12),
  mk("morning", 0, "1", "G7/8 ELA", "", 0, 12),
  // Morning 10:30–12:00
  mk("morning", 1, "2+3", "SAT Math", "Herrick", 23, 25),
  mk("morning", 1, "7", "PSAT", "Joshua", 12, 12),
  mk("morning", 1, "6", "PSAT", "Daniel", 7, 12),
  mk("morning", 1, "4", "5/6th ELA", "Rebecca", 5, 12),
  mk("morning", 1, "5", "G7 Math", "Thomas", 3, 12),
  mk("morning", 1, "8", "G8 Math", "Linda", 5, 12),
  // Monday PM
  mk("mon", 0, "1", "SAT ELA", "Joshua", 9, 25),
  mk("mon", 0, "2", "HS Bio", "Chris", 4, 12),
  mk("mon", 0, "4", "NYT", "Linda", 0, 12),
  mk("mon", 0, "5", "Pre-Cal", "Rebecca", 0, 12),
  mk("mon", 1, "1", "SAT Math", "Herrick", 0, 25),
  mk("mon", 1, "2", "Geo", "Thomas", 2, 12),
  mk("mon", 1, "4", "AP Precal", "James", 2, 12, "2:30–4:00"),
  mk("mon", 1, "5", "AMC 10", "Rebecca", 3, 12, "2:30–4:00"),
  mk("mon", 1, "6", "Debate", "", 0, 12),
  // Tuesday PM
  mk("tue", 0, "1", "SAT ELA", "Joshua", 0, 25),
  mk("tue", 0, "2", "HS Creative Writing", "Chris", 2, 12),
  mk("tue", 0, "4", "Earth Science", "Matthew", 0, 12, "1:00–2:30"),
  mk("tue", 0, "5", "Pre-Cal", "Linda", 0, 12),
  mk("tue", 1, "1", "SAT Math", "Herrick", 11, 25),
  mk("tue", 1, "2", "Python", "AN", 4, 12, "12:30–2:00"),
  mk("tue", 1, "4", "Scholastic Writing", "Joshua", 4, 12),
  mk("tue", 1, "5", "NYT", "Rebecca", 0, 12),
  // Wednesday PM
  mk("wed", 0, "1", "SAT ELA", "Joshua", 2, 25),
  mk("wed", 0, "2", "HS Bio", "Chris", 0, 12),
  mk("wed", 0, "4", "NYT", "Linda", 0, 12),
  mk("wed", 0, "5", "Pre-Cal", "Rebecca", 0, 12),
  mk("wed", 1, "1", "SAT Math", "Herrick", 11, 25),
  mk("wed", 1, "2", "AP Precal", "TBD", 0, 12, "2:30–4:00"),
  mk("wed", 1, "4", "AMC 10", "James", 3, 12, "2:30–4:00"),
  mk("wed", 1, "5", "Debate", "Rebecca", 0, 12),
  // Thursday PM
  mk("thu", 0, "1", "SAT ELA", "Joshua", 2, 25),
  mk("thu", 0, "2", "HS Creative Writing", "Chris", 0, 12),
  mk("thu", 0, "4", "Earth Science", "Matthew", 0, 12, "1:00–2:30"),
  mk("thu", 0, "5", "Pre-Cal", "Linda", 0, 12),
  mk("thu", 1, "1", "SAT Math", "Herrick", 11, 25),
  mk("thu", 1, "2", "Python", "AN", 4, 12, "12:30–2:00"),
  mk("thu", 1, "4", "Scholastic Writing", "Joshua", 4, 12),
  mk("thu", 1, "5", "NYT", "Rebecca", 0, 12),
];

// ───────────────────────── Data model ─────────────────────────
// catalog:    one entry per class/cohort — { id, name, teacher, reg, note }
// placements: where a class meets       — { id, classId, section, slotIdx, room }
// roomCaps:   room capacity by group/name — { morning: { "2+3": 25 }, afternoon: { "1": 25 } }
// A class placed in several slots/days shares one roster: reg/name edits apply everywhere.

function defaultRoomCap(group, room) {
  return DEFAULT_ROOM_CAPS[group]?.[room] ?? 12;
}

function cleanCap(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function normalizeData(raw) {
  const rooms = raw.rooms || JSON.parse(JSON.stringify(DEFAULT_ROOMS));
  const slots = raw.slots || JSON.parse(JSON.stringify(DEFAULT_SLOTS));
  const placements = raw.placements || [];
  const rawByClass = new Map((raw.catalog || []).map((k) => [k.id, k]));
  const catalog = (raw.catalog || []).map(({ cap, ...k }) => ({
    ...k,
    reg: Math.max(0, parseInt(k.reg, 10) || 0),
    note: k.note || "",
  }));
  const roomCaps = { morning: {}, afternoon: {} };

  ["morning", "afternoon"].forEach((group) => {
    (rooms[group] || []).forEach((room) => {
      const saved = raw.roomCaps?.[group]?.[room];
      let fallback = defaultRoomCap(group, room);
      placements.forEach((p) => {
        if (roomGroup(p.section) !== group || p.room !== room) return;
        const oldClassCap = rawByClass.get(p.classId)?.cap;
        if (oldClassCap != null) fallback = Math.max(fallback, cleanCap(oldClassCap, fallback));
      });
      roomCaps[group][room] = cleanCap(saved, fallback);
    });
  });

  return {
    rooms,
    slots,
    roomCaps,
    catalog,
    placements,
    nextId: raw.nextId || 1000,
  };
}

// Convert the pre-library format ({ classes: [...] }) into catalog + placements.
// Grid entries that are fully identical (name/teacher/reg/note) collapse into
// one catalog entry with several placements — i.e. one class meeting on several days.
function migrateOld(old) {
  const catalog = [];
  const placements = [];
  const roomCaps = { morning: {}, afternoon: {} };
  let n = 1;
  const byKey = new Map();
  (old.classes || []).forEach((c) => {
    const group = roomGroup(c.section);
    const cap = Math.max(0, parseInt(c.cap, 10) || defaultRoomCap(group, c.room));
    roomCaps[group][c.room] = Math.max(roomCaps[group][c.room] || 0, cap);
    const key = [c.name, c.teacher || "", c.reg || 0, c.note || ""].join("¦");
    let entry = byKey.get(key);
    if (!entry) {
      entry = { id: "k" + n++, name: c.name, teacher: c.teacher || "", reg: c.reg || 0, note: c.note || "" };
      byKey.set(key, entry);
      catalog.push(entry);
    }
    placements.push({ id: "p" + n++, classId: entry.id, section: c.section, slotIdx: c.slotIdx, room: c.room });
  });
  return normalizeData({ rooms: old.rooms, slots: old.slots, roomCaps, catalog, placements, nextId: n });
}

const defaultData = () =>
  migrateOld({
    rooms: JSON.parse(JSON.stringify(DEFAULT_ROOMS)),
    slots: JSON.parse(JSON.stringify(DEFAULT_SLOTS)),
    classes: DEFAULT_CLASSES,
  });

const STORAGE_KEY = "premier-classroom-schedule";

const loadData = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.catalog && parsed.placements) return normalizeData(parsed);
      if (parsed && parsed.classes) return migrateOld(parsed); // pre-library data
    }
  } catch (e) { /* fall through */ }
  return defaultData();
};

const saveData = (data) => {
  try {
    const payload = JSON.stringify(data);
    window.localStorage.setItem(STORAGE_KEY, payload);
    if (window.localStorage.getItem(STORAGE_KEY) !== payload) {
      return { ok: false, error: "Browser storage did not keep the saved data." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "Browser storage is unavailable." };
  }
};

// ───────────────────────── Helpers ─────────────────────────
const ratioColor = (reg, cap) => {
  if (!cap) return { bar: "#94a3b8", text: "#64748b", bg: "#f8fafc" };
  const r = reg / cap;
  if (r >= 1) return { bar: "#dc2626", text: "#b91c1c", bg: "#fef2f2" };
  if (r >= 0.75) return { bar: "#d97706", text: "#b45309", bg: "#fffbeb" };
  return { bar: "#0d7a72", text: "#0f766e", bg: "#f0fdfa" };
};

const slotShort = (label) => ((label || "").split(/[–—-]/)[0].trim() || label || "");
const teacherKey = (teacher) => {
  const key = (teacher || "").trim().toLowerCase();
  return key === "tbd" || key === "n/a" || key === "na" ? "" : key;
};

// ───────────────────────── Main component ─────────────────────────
export default function ClassroomScheduler() {
  const [data, setData] = useState(loadData);
  const [saveStatus, setSaveStatus] = useState({
    ok: true,
    lastSavedAt: null,
    error: "",
    label: "Checking save...",
  });
  const [tab, setTab] = useState("morning");
  const [editing, setEditing] = useState(null); // {isNew, classId?, placementId?, slotIdx?, room?}
  const [roomMgrOpen, setRoomMgrOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [drag, setDrag] = useState(null); // {type:'lib'|'pl', id}
  const [dragOver, setDragOver] = useState(null); // "slotIdx|room" or "tray"
  const [libOpen, setLibOpen] = useState(true);
  const [libQuery, setLibQuery] = useState("");

  const updateSaveStatus = useCallback((result) => {
    const now = new Date();
    setSaveStatus({
      ok: result.ok,
      lastSavedAt: result.ok ? now : null,
      error: result.error || "",
      label: result.ok ? `Saved to this browser at ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Not saved",
    });
  }, []);

  const persist = useCallback((next) => {
    setData(next);
    updateSaveStatus(saveData(next));
  }, [updateSaveStatus]);

  useEffect(() => {
    updateSaveStatus(saveData(data));
  }, []); // Save loaded/normalized data once; user changes go through persist().

  const saveNow = () => updateSaveStatus(saveData(data));

  const { rooms, slots, roomCaps, catalog, placements } = data;
  const curRooms = rooms[roomGroup(tab)] || [];
  const curSlots = slots[tab] || [];
  const roomCapacity = (section, room) => {
    const group = roomGroup(section);
    return roomCaps?.[group]?.[room] ?? defaultRoomCap(group, room);
  };

  const classOfId = (id) => catalog.find((k) => k.id === id);
  const placementAt = (slotIdx, room) =>
    placements.find((p) => p.section === tab && p.slotIdx === slotIdx && p.room === room);
  const placementsOf = (classId) => placements.filter((p) => p.classId === classId);
  const teacherConflictsAt = (section, slotIdx, teacher, opts = {}) => {
    const key = teacherKey(teacher);
    if (!key) return [];
    return placements
      .filter((p) =>
        p.section === section &&
        p.slotIdx === slotIdx &&
        p.id !== opts.excludePlacementId &&
        p.classId !== opts.excludeClassId
      )
      .map((p) => ({ placement: p, cls: classOfId(p.classId) }))
      .filter(({ cls }) => teacherKey(cls?.teacher) === key);
  };
  const teacherConflictsForPlacement = (pl) => {
    const cls = classOfId(pl.classId);
    return teacherConflictsAt(pl.section, pl.slotIdx, cls?.teacher, { excludePlacementId: pl.id });
  };
  const teacherConflictLabels = (items) =>
    [...new Set(items.map(({ placement, cls }) => `${cls?.name || "Class"} in Room ${placement.room}`))];

  const totalReg = catalog.reduce((s, k) => s + (k.reg || 0), 0);
  const tabPls = placements.filter((p) => p.section === tab);
  const tabReg = tabPls.reduce((s, p) => s + ((classOfId(p.classId) || {}).reg || 0), 0);

  // Chips like "Mon 2:00" for everywhere a class is scheduled
  const placementChips = (classId) =>
    placementsOf(classId)
      .slice()
      .sort((a, b) => sectionIdx(a.section) - sectionIdx(b.section) || a.slotIdx - b.slotIdx)
      .map((p) => ({
        id: p.id,
        label: `${sectionShort(p.section)} ${slotShort((slots[p.section] || [])[p.slotIdx])}`.trim(),
      }));

  // ── Placement ops ──
  const addPlacement = (classId, slotIdx, room) => {
    if (!classOfId(classId) || placementAt(slotIdx, room)) return;
    const nid = data.nextId || 1000;
    persist({
      ...data,
      placements: [...placements, { id: "p" + nid, classId, section: tab, slotIdx, room }],
      nextId: nid + 1,
    });
  };

  const removePlacement = (plId) =>
    persist({ ...data, placements: placements.filter((p) => p.id !== plId) });

  // Drag & drop: move a placement; if target cell is occupied, swap the two
  const movePlacement = (plId, toSlotIdx, toRoom) => {
    const src = placements.find((p) => p.id === plId);
    if (!src) return;
    if (src.section === tab && src.slotIdx === toSlotIdx && src.room === toRoom) return;
    const target = placementAt(toSlotIdx, toRoom);
    persist({
      ...data,
      placements: placements.map((p) => {
        if (p.id === src.id) return { ...p, section: tab, slotIdx: toSlotIdx, room: toRoom };
        if (target && p.id === target.id) return { ...p, section: src.section, slotIdx: src.slotIdx, room: src.room };
        return p;
      }),
    });
  };

  // Cell drop targets: accept a grid card always (move/swap); accept a library card only when empty
  const cellHandlers = (slotIdx, room, occupiedPl) => ({
    onDragOver: (e) => {
      if (!drag) return;
      if (drag.type === "lib" && occupiedPl) return; // browser shows no-drop cursor
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver(slotIdx + "|" + room);
    },
    onDragLeave: () => setDragOver((d) => (d === slotIdx + "|" + room ? null : d)),
    onDrop: (e) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("text/plain") || (drag ? drag.type + ":" + drag.id : "");
      const [type, id] = raw.split(":");
      if (type === "lib" && !occupiedPl) addPlacement(id, slotIdx, room);
      else if (type === "pl") movePlacement(id, slotIdx, room);
      setDrag(null);
      setDragOver(null);
    },
  });

  // Library tray: dropping a scheduled card here unschedules it (class stays in the library)
  const trayHandlers = {
    onDragOver: (e) => {
      if (drag?.type !== "pl") return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver("tray");
    },
    onDragLeave: () => setDragOver((d) => (d === "tray" ? null : d)),
    onDrop: (e) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("text/plain") || (drag ? drag.type + ":" + drag.id : "");
      const [type, id] = raw.split(":");
      if (type === "pl") removePlacement(id);
      setDrag(null);
      setDragOver(null);
    },
  };

  // ── Signed-up count stepper (shared roster: updates every placement of the class) ──
  const bump = (classId, delta) => {
    persist({
      ...data,
      catalog: catalog.map((k) =>
        k.id === classId ? { ...k, reg: Math.max(0, (k.reg || 0) + delta) } : k
      ),
    });
  };

  // ── Save class (add / edit) — form fields plus its full meeting-time list ──
  const saveClass = (form, rows) => {
    let nid = data.nextId || 1000;
    const classId = editing.isNew ? "k" + nid++ : editing.classId;
    const newCatalog = editing.isNew
      ? [...catalog, { id: classId, ...form }]
      : catalog.map((k) => (k.id === classId ? { ...k, ...form } : k));
    const others = placements.filter((p) => p.classId !== classId);
    const mine = rows.map((r) => ({
      id: r.id || "p" + nid++,
      classId, section: r.section, slotIdx: r.slotIdx, room: r.room,
    }));
    persist({ ...data, catalog: newCatalog, placements: [...others, ...mine], nextId: nid });
    setEditing(null);
  };

  const deleteClass = (classId) => {
    const n = placementsOf(classId).length;
    if (n > 1 && !window.confirm(`This class is scheduled in ${n} slots. Delete it everywhere?`)) return;
    persist({
      ...data,
      catalog: catalog.filter((k) => k.id !== classId),
      placements: placements.filter((p) => p.classId !== classId),
    });
    setEditing(null);
  };

  const duplicateClass = (k) => {
    const nid = data.nextId || 1000;
    persist({
      ...data,
      catalog: [...catalog, { ...k, id: "k" + nid, name: k.name + " (copy)" }],
      nextId: nid + 1,
    });
  };

  // ── Room management (separate morning / afternoon groups) ──
  const saveRooms = (groups) => {
    let np = placements;
    ["morning", "afternoon"].forEach((g) => {
      const inGroup = (p) => roomGroup(p.section) === g;
      Object.entries(groups[g].renames).forEach(([oldName, newName]) => {
        np = np.map((p) => (inGroup(p) && p.room === oldName ? { ...p, room: newName } : p));
      });
      np = np.filter((p) => !inGroup(p) || groups[g].names.includes(p.room));
    });
    persist({
      ...data,
      rooms: { morning: groups.morning.names, afternoon: groups.afternoon.names },
      roomCaps: { morning: groups.morning.caps, afternoon: groups.afternoon.caps },
      placements: np,
    });
    setRoomMgrOpen(false);
  };

  // ── Time slot management ──
  const addSlot = () => {
    const label = prompt("New time slot label (e.g. 3:30–5:00):");
    if (!label) return;
    persist({ ...data, slots: { ...slots, [tab]: [...curSlots, label] } });
  };
  const renameSlot = (idx) => {
    const label = prompt("Edit time slot label:", curSlots[idx]);
    if (!label) return;
    const ns = [...curSlots];
    ns[idx] = label;
    persist({ ...data, slots: { ...slots, [tab]: ns } });
  };
  const removeSlot = (idx) => {
    const has = placements.some((p) => p.section === tab && p.slotIdx === idx);
    if (has && !window.confirm("This time slot has classes. They will be unscheduled (but stay in the Class Library). Continue?")) return;
    const ns = curSlots.filter((_, i) => i !== idx);
    const np = placements
      .filter((p) => !(p.section === tab && p.slotIdx === idx))
      .map((p) =>
        p.section === tab && p.slotIdx > idx ? { ...p, slotIdx: p.slotIdx - 1 } : p
      );
    persist({ ...data, slots: { ...slots, [tab]: ns }, placements: np });
  };

  const resetAll = () => {
    persist(defaultData());
    setConfirmReset(false);
  };

  // ── Library list (filtered, unscheduled first) ──
  const q = libQuery.trim().toLowerCase();
  const libList = catalog
    .filter((k) => !q || k.name.toLowerCase().includes(q) || (k.teacher || "").toLowerCase().includes(q))
    .sort((a, b) => {
      const ap = placements.some((p) => p.classId === a.id);
      const bp = placements.some((p) => p.classId === b.id);
      if (ap !== bp) return ap ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  const unscheduledCount = catalog.filter((k) => !placements.some((p) => p.classId === k.id)).length;

  // ───────────────────────── Render ─────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f3", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", color: "#1e293b" }}>
      {/* Header */}
      <header style={{ background: "#123c3a", color: "#fff", padding: "18px 24px" }}>
        <div style={{ width: "100%", boxSizing: "border-box", display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "0.02em" }}>
            Premier Plus · Classroom Scheduler
          </h1>
          <span style={{ fontSize: 13, opacity: 0.75 }}>
            2026 Summer · Jericho · {rooms.morning.length} rooms AM / {rooms.afternoon.length} rooms PM
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 13, opacity: 0.85 }}>
              Total enrolled <b style={{ fontSize: 16 }}>{totalReg}</b>
            </span>
            <span
              title={saveStatus.ok ? "Changes are stored in this browser." : saveStatus.error}
              style={{
                fontSize: 12,
                color: saveStatus.ok ? "#d1fae5" : "#fecaca",
                whiteSpace: "nowrap",
              }}
            >
              {saveStatus.label}
            </span>
            <button onClick={saveNow} style={btnGhost}>Save now</button>
            <button onClick={() => setRoomMgrOpen(true)} style={btnGhost}>Manage Rooms</button>
            <button onClick={() => setConfirmReset(true)} style={{ ...btnGhost, opacity: 0.7 }}>Reset Data</button>
          </div>
        </div>
      </header>

      {!saveStatus.ok && (
        <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "8px 24px", fontSize: 13 }}>
          Changes could not be saved to this browser. They may be lost when you close the page.
          {saveStatus.error && <span> Details: {saveStatus.error}</span>}
        </div>
      )}

      <div style={{ width: "100%", boxSizing: "border-box", padding: "16px 12px 40px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* Class Library */}
        <aside style={{ flex: "0 0 240px", width: 240, position: "sticky", top: 16, alignSelf: "flex-start" }}>
          <div style={{ background: "#fff", border: "1px solid #d6dad4", borderRadius: 10, height: "calc(100vh - 112px)", minHeight: 420, maxHeight: 780, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: libOpen ? "1px solid #eceeea" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => setLibOpen((o) => !o)}
                  style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#123c3a", padding: 0, textAlign: "left" }}
                >
                  {libOpen ? "▾" : "▸"} Class Library
                </button>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                  {catalog.length} total
                </span>
              </div>
              <div style={{ marginTop: 3, fontSize: 12, color: "#64748b" }}>
                {unscheduledCount} unscheduled
              </div>
              {libOpen && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input
                    style={{ ...inputStyle, minWidth: 0, flex: 1, padding: "6px 8px", fontSize: 13 }}
                    placeholder="Search class or teacher…"
                    value={libQuery}
                    onChange={(e) => setLibQuery(e.target.value)}
                  />
                  <button style={{ ...btnPrimary, padding: "7px 9px", fontSize: 13, flexShrink: 0 }} onClick={() => setEditing({ isNew: true })}>
                    ＋ New
                  </button>
                </div>
              )}
            </div>
            {libOpen && (
              <div
                {...trayHandlers}
                style={{
                  padding: "10px", display: "flex", flexDirection: "column", gap: 8, minHeight: 0, flex: 1, alignItems: "stretch",
                  overflowY: "auto", overscrollBehavior: "contain",
                  background: dragOver === "tray" ? "#fff7ed" : "transparent",
                  outline: drag?.type === "pl" ? "2px dashed #d97706" : "none",
                  outlineOffset: -5, borderRadius: "0 0 10px 10px",
                }}
              >
                {drag?.type === "pl" && (
                  <span style={{ fontSize: 12, color: "#b45309", fontWeight: 600 }}>
                    ⤓ Release here to unschedule
                  </span>
                )}
                {libList.map((k) => {
                  const chips = placementChips(k.id);
                  const teacherConflicts = teacherConflictLabels(
                    placementsOf(k.id).flatMap((p) => teacherConflictsForPlacement(p))
                  );
                  return (
                    <div
                      key={k.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", "lib:" + k.id);
                        e.dataTransfer.effectAllowed = "copyMove";
                        setDrag({ type: "lib", id: k.id });
                      }}
                      onDragEnd={() => { setDrag(null); setDragOver(null); }}
                      onClick={() => setEditing({ isNew: false, classId: k.id })}
                      title="Drag onto the grid to schedule (the same class can be placed on several days) · click to edit details & meeting times"
                      style={{
                        border: "1px solid #d6dad4", borderRadius: 8,
                        background: chips.length ? "#fff" : "#fffbeb",
                        padding: "7px 9px", width: "100%", boxSizing: "border-box", cursor: "grab",
                        opacity: drag?.type === "lib" && drag.id === k.id ? 0.35 : 1,
                        display: "flex", flexDirection: "column", gap: 4,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.25, flex: 1 }}>{k.name}</div>
                        <button
                          style={miniBtn} title="Duplicate (for a second cohort of the same course)"
                          onClick={(e) => { e.stopPropagation(); duplicateClass(k); }}
                        >⧉</button>
                        <button
                          style={{ ...miniBtn, color: "#b91c1c" }} title="Delete class"
                          onClick={(e) => { e.stopPropagation(); deleteClass(k.id); }}
                        >✕</button>
                      </div>
                      <div style={{ fontSize: 12, color: "#475569" }}>
                        {k.teacher || <i style={{ color: "#b45309" }}>Teacher TBD</i>}
                        <b style={{ marginLeft: 8, color: "#123c3a" }}>{k.reg} signed up</b>
                      </div>
                      {teacherConflicts.length > 0 && (
                        <div
                          style={teacherWarningStyle}
                          title={"Same teacher also assigned to " + teacherConflicts.join(", ")}
                        >
                          ⚠ Teacher overlap
                        </div>
                      )}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {chips.length === 0 ? (
                          <span style={{ ...chipStyle, background: "#fef3c7", color: "#b45309" }}>unscheduled</span>
                        ) : (
                          chips.map((c) => <span key={c.id} style={chipStyle}>{c.label}</span>)
                        )}
                      </div>
                    </div>
                  );
                })}
                {libList.length === 0 && (
                  <span style={{ fontSize: 13, color: "#94a3b8" }}>
                    {catalog.length === 0 ? "No classes yet — click ＋ New." : "No classes match the search."}
                  </span>
                )}
              </div>
            )}
          </div>
        </aside>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Tabs */}
          <nav style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setTab(s.id)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "10px 10px 0 0",
                  border: "1px solid #d6dad4",
                  borderBottom: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: tab === s.id ? 700 : 400,
                  background: tab === s.id ? "#fff" : "#e8eae6",
                  color: tab === s.id ? "#123c3a" : "#64748b",
                }}
              >
                {s.label}
              </button>
            ))}
            <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 13, color: "#64748b" }}>
              {tabPls.length} classes · {tabReg} students in this view
            </span>
          </nav>

          {/* Schedule grid */}
          <main>
            <div style={{ background: "#fff", border: "1px solid #d6dad4", borderRadius: "0 10px 10px 10px", overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 96 + curRooms.length * 112, tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 96, position: "sticky", left: 0, background: "#fafaf8", zIndex: 2 }}>Time</th>
                {curRooms.map((r) => (
                  <th key={r} style={thStyle}>
                    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <span style={{ display: "inline-block", background: "#123c3a", color: "#fff", borderRadius: 6, padding: "2px 10px", fontSize: 13 }}>
                        Room {r}
                      </span>
                      <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>
                        Cap {roomCapacity(tab, r)}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {curSlots.map((slot, si) => (
                <tr key={si}>
                  <td style={{ ...tdStyle, width: 96, position: "sticky", left: 0, background: "#fafaf8", zIndex: 1, verticalAlign: "top" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#123c3a" }}>{slot}</div>
                    <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                      <button onClick={() => renameSlot(si)} style={miniBtn} title="Rename time slot">✎</button>
                      <button onClick={() => removeSlot(si)} style={{ ...miniBtn, color: "#b91c1c" }} title="Delete time slot">✕</button>
                    </div>
                  </td>
                  {curRooms.map((room) => {
                    const pl = placementAt(si, room);
                    const cls = pl ? classOfId(pl.classId) : null;
                    const cellKey = si + "|" + room;
                    const isOver = dragOver === cellKey;
                    if (!pl || !cls) {
                      return (
                        <td key={room} style={tdStyle} {...cellHandlers(si, room, null)}>
                          <button
                            onClick={() => setEditing({ isNew: true, slotIdx: si, room })}
                            style={{
                              width: "100%", minHeight: 118,
                              border: isOver ? "2px solid #0d7a72" : "1.5px dashed #cbd5d1",
                              borderRadius: 8,
                              background: isOver ? "#f0fdfa" : "transparent",
                              color: isOver ? "#0d7a72" : "#94a3b8",
                              fontSize: 13, cursor: "pointer",
                            }}
                            title="Click to create a new class here, or drag one in from the Class Library"
                          >
                            {isOver ? "Drop here" : "＋ Add class"}
                          </button>
                        </td>
                      );
                    }
                    const cap = roomCapacity(tab, room);
                    const col = ratioColor(cls.reg, cap);
                    const pct = cap ? Math.min(100, Math.round((cls.reg / cap) * 100)) : 0;
                    const teacherConflicts = teacherConflictLabels(teacherConflictsForPlacement(pl));
                    const hasTeacherConflict = teacherConflicts.length > 0;
                    const otherDays = [...new Set(
                      placementsOf(cls.id).filter((p) => p.id !== pl.id).map((p) => sectionShort(p.section))
                    )];
                    return (
                      <td key={room} style={tdStyle} {...cellHandlers(si, room, pl)}>
                        <div
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", "pl:" + pl.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDrag({ type: "pl", id: pl.id });
                          }}
                          onDragEnd={() => { setDrag(null); setDragOver(null); }}
                          style={{
                            border: isOver && drag?.id !== pl.id ? "2px solid #0d7a72" : hasTeacherConflict ? "2px solid #d97706" : "1px solid #d6dad4",
                            borderRadius: 8, background: col.bg,
                            boxSizing: "border-box", width: "100%", maxWidth: "100%", overflow: "hidden",
                            padding: "8px", minHeight: 118, display: "flex", flexDirection: "column", gap: 4,
                            opacity: drag?.type === "pl" && drag.id === pl.id ? 0.35 : 1,
                            cursor: "grab",
                            boxShadow: isOver && drag?.id !== pl.id ? "0 0 0 3px rgba(13,122,114,.15)" : hasTeacherConflict ? "0 0 0 3px rgba(217,119,6,.15)" : "none",
                            transition: "opacity .15s, box-shadow .15s",
                          }}
                        >
                          <div
                            onClick={() => setEditing({ isNew: false, classId: cls.id, placementId: pl.id, slotIdx: si, room })}
                            style={{ cursor: "pointer" }}
                            title="Click to edit"
                          >
                            <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.2, overflowWrap: "anywhere" }}>{cls.name}</div>
                            <div style={{ fontSize: 12, color: "#475569", marginTop: 2, overflowWrap: "anywhere" }}>
                              {cls.teacher || <i style={{ color: "#b45309" }}>Teacher TBD</i>}
                              {cls.note && <span style={{ marginLeft: 6, color: "#7c3aed" }}>⏱ {cls.note}</span>}
                            </div>
                            {hasTeacherConflict && (
                              <div
                                style={teacherWarningStyle}
                                title={"Same teacher also assigned to " + teacherConflicts.join(", ")}
                              >
                                Teacher conflict
                              </div>
                            )}
                            {otherDays.length > 0 && (
                              <div style={{ fontSize: 11, color: "#0f766e", marginTop: 2, overflowWrap: "anywhere" }} title="Same class (one roster) also meets on these days">
                                ⇄ also {otherDays.join(" · ")}
                              </div>
                            )}
                          </div>
                          <div style={{ marginTop: "auto", minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 3, minWidth: 0 }}>
                              <button onClick={() => bump(cls.id, -1)} style={stepBtn}>−</button>
                              <span style={{ fontSize: 11, fontWeight: 700, color: col.text, minWidth: 0, flex: 1, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden" }}>
                                {cls.reg}/{cap}
                              </span>
                              <button onClick={() => bump(cls.id, +1)} style={stepBtn}>＋</button>
                            </div>
                            <div style={{ height: 4, background: "#e2e8f0", borderRadius: 2, marginTop: 5, overflow: "hidden" }}>
                              <div style={{ width: pct + "%", height: "100%", background: col.bar, borderRadius: 2, transition: "width .25s" }} />
                            </div>
                            {cls.reg >= cap && cap > 0 && (
                              <div style={{ marginTop: 3, fontSize: 10, fontWeight: 800, color: "#b91c1c", textAlign: "center", letterSpacing: "0.08em" }}>
                                FULL
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: "10px 14px", borderTop: "1px solid #eceeea" }}>
            <button onClick={addSlot} style={{ ...btnGhost, color: "#123c3a", borderColor: "#cbd5d1" }}>＋ Add time slot</button>
          </div>
            </div>
            <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 10 }}>
              🖱 Define classes in the <b>Class Library</b>, then drag them onto the grid — or click any card and set its
              meeting times right in the dialog. Place the same class on several
              days (e.g. Tue + Thu) — it stays one class with one shared enrollment, so edits update everywhere
              (the Morning tab already means every day). Drag a scheduled card onto another to swap, or back into the
              library to unschedule it. Click any card to edit, use ＋ − to adjust signed-up students.
              Green = room has space, amber = nearly full, red = at or over room capacity. Data is saved in this browser.
            </p>
          </main>
        </div>
      </div>

      {/* Class edit modal */}
      {editing && (
        <ClassModal
          editing={editing}
          cls={editing.classId ? classOfId(editing.classId) : null}
          initialRows={
            editing.classId
              ? placementsOf(editing.classId)
                  .slice()
                  .sort((a, b) => sectionIdx(a.section) - sectionIdx(b.section) || a.slotIdx - b.slotIdx)
                  .map((p) => ({ id: p.id, section: p.section, slotIdx: p.slotIdx, room: p.room }))
              : editing.room != null
                ? [{ id: null, section: tab, slotIdx: editing.slotIdx, room: editing.room }]
                : []
          }
          slots={slots}
          rooms={rooms}
          defaultSection={tab}
          occupiedBy={(section, slotIdx, room) => {
            const p = placements.find(
              (x) => x.section === section && x.slotIdx === slotIdx && x.room === room && x.classId !== editing.classId
            );
            return p ? (classOfId(p.classId)?.name || "another class") : null;
          }}
          teacherConflictsAt={(section, slotIdx, teacher) =>
            teacherConflictLabels(teacherConflictsAt(section, slotIdx, teacher, { excludeClassId: editing.classId }))
          }
          contextLabel={
            editing.room != null
              ? `${SECTIONS.find((s) => s.id === tab)?.label} · ${curSlots[editing.slotIdx]} · Room ${editing.room}`
              : "Class Library"
          }
          onSave={saveClass}
          onDelete={() => deleteClass(editing.classId)}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Room manager modal */}
      {roomMgrOpen && (
        <RoomModal rooms={rooms} roomCaps={roomCaps} placements={placements} onSave={saveRooms} onClose={() => setRoomMgrOpen(false)} />
      )}

      {/* Reset confirmation */}
      {confirmReset && (
        <Overlay onClose={() => setConfirmReset(false)}>
          <h3 style={{ marginTop: 0 }}>Reset all data?</h3>
          <p style={{ fontSize: 14, color: "#475569" }}>
            This restores the original schedule from the registration sheet. All changes will be lost.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button style={btnSecondary} onClick={() => setConfirmReset(false)}>Cancel</button>
            <button style={{ ...btnPrimary, background: "#dc2626" }} onClick={resetAll}>Reset</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ───────────────────────── Class edit modal ─────────────────────────
function ClassModal({ editing, cls, initialRows, slots, rooms, defaultSection, occupiedBy, teacherConflictsAt, contextLabel, onSave, onDelete, onClose }) {
  const c = cls || {};
  const [name, setName] = useState(c.name || "");
  const [teacher, setTeacher] = useState(c.teacher || "");
  const [reg, setReg] = useState(c.reg ?? 0);
  const [note, setNote] = useState(c.note || "");
  const [rows, setRows] = useState(initialRows); // meeting times: {id?, section, slotIdx, room}

  // Taken = occupied by another class on the board, or by another row in this dialog
  const takenBy = (row, room, rowIdx) => {
    const other = occupiedBy(row.section, row.slotIdx, room);
    if (other) return other;
    const dup = rows.some((o, j) => j !== rowIdx && o.section === row.section && o.slotIdx === row.slotIdx && o.room === room);
    return dup ? "this class" : null;
  };
  const setRow = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows([...rows, { id: null, section: defaultSection, slotIdx: 0, room: "" }]);
  const delRow = (i) => setRows(rows.filter((_, j) => j !== i));

  const submit = () => {
    if (!name.trim()) return;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const label = `${SECTIONS.find((s) => s.id === r.section)?.label} ${(slots[r.section] || [])[r.slotIdx]}`;
      if (!r.room) {
        alert("Pick a room for every meeting time (or remove the row).");
        return;
      }
      if (rows.some((o, j) => j !== i && o.section === r.section && o.slotIdx === r.slotIdx)) {
        alert(`This class has two meetings at the same time (${label}). Remove one of them.`);
        return;
      }
      const taken = takenBy(r, r.room, i);
      if (taken) {
        alert(`Room conflict: ${label} Room ${r.room} already has ${taken}. Pick a different room.`);
        return;
      }
    }
    // Teacher overlaps are allowed, but confirm so they never slip through unnoticed
    const overlaps = teacherKey(teacher)
      ? [...new Set(rows.flatMap((r) => teacherConflictsAt(r.section, r.slotIdx, teacher)))]
      : [];
    if (overlaps.length > 0 && !window.confirm(
      `${teacher.trim()} is also teaching at the same time: ${overlaps.join(", ")}.\n\nSave anyway?`
    )) return;
    onSave(
      {
        name: name.trim(),
        teacher: teacher.trim(),
        reg: Math.max(0, parseInt(reg, 10) || 0),
        note: note.trim(),
      },
      rows
    );
  };

  return (
    <Overlay onClose={onClose} wide>
      <h3 style={{ marginTop: 0, marginBottom: 4 }}>{editing.isNew ? "Add class" : "Edit class"}</h3>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>{contextLabel}</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Field label="Class name *" style={{ flex: 2, minWidth: 180 }}>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SAT Math" autoFocus />
        </Field>
        <Field label="Teacher" style={{ flex: 1.4, minWidth: 130 }}>
          <input style={inputStyle} value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="e.g. Herrick" />
        </Field>
        <Field label="Signed up" style={{ flex: 1, minWidth: 90 }}>
          <input style={inputStyle} type="number" min="0" value={reg} onChange={(e) => setReg(e.target.value)} />
        </Field>
      </div>
      <Field label="Note / actual time (optional)">
        <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2:30–4:00" />
      </Field>

      <div style={{ margin: "6px 0 8px", fontSize: 13, color: "#475569", fontWeight: 600 }}>
        Schedule
        {rows.length > 0 && (
          <span style={{ fontWeight: 400, color: "#64748b" }}>
            {" "}— meets {rows.length}×/week{rows.length > 1 ? " (one shared roster)" : ""}
          </span>
        )}
      </div>
      {rows.map((r, i) => {
        const roomTaken = r.room ? takenBy(r, r.room, i) : null;
        const roomConflict = roomTaken && roomTaken !== "this class" ? roomTaken : null;
        const slotDup = rows.some((o, j) => j !== i && o.section === r.section && o.slotIdx === r.slotIdx);
        const teacherOverlaps = teacherKey(teacher) ? teacherConflictsAt(r.section, r.slotIdx, teacher) : [];
        const openRooms = (rooms[roomGroup(r.section)] || []).filter((rm) => !takenBy(r, rm, i));
        return (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select
                style={{ ...selStyle, flex: 1.2 }}
                value={r.section}
                onChange={(e) => setRow(i, { section: e.target.value, slotIdx: 0, room: "" })}
              >
                {SECTIONS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              <select
                style={{ ...selStyle, flex: 1.2 }}
                value={r.slotIdx}
                onChange={(e) => setRow(i, { slotIdx: Number(e.target.value) })}
              >
                {(slots[r.section] || []).map((sl, idx) => (
                  <option key={idx} value={idx}>{sl}</option>
                ))}
              </select>
              <select
                style={{ ...selStyle, flex: 1.1 }}
                value={r.room}
                onChange={(e) => setRow(i, { room: e.target.value })}
              >
                <option value="">Room…</option>
                {(rooms[roomGroup(r.section)] || []).map((rm) => {
                  const taken = takenBy(r, rm, i);
                  return (
                    <option key={rm} value={rm} disabled={!!taken}>
                      {"Room " + rm + (taken ? " — " + taken : "")}
                    </option>
                  );
                })}
              </select>
              <button style={{ ...miniBtn, color: "#b91c1c", flexShrink: 0 }} onClick={() => delRow(i)} title="Remove this meeting time">✕</button>
            </div>
            {roomConflict && (
              <div style={{ ...roomConflictStyle, marginTop: 5 }}>
                Room conflict: Room {r.room} already has {roomConflict} — pick a different room.
              </div>
            )}
            {slotDup && (
              <div style={{ ...roomConflictStyle, marginTop: 5 }}>
                This class already has another meeting at this day & time.
              </div>
            )}
            {teacherOverlaps.length > 0 && (
              <div
                style={{ ...teacherWarningStyle, marginTop: 5 }}
                title="Same teacher in two rooms at once — allowed, but double-check before saving"
              >
                ⚠ Teacher overlap: {teacher.trim()} also has {teacherOverlaps.join(", ")} at this time
              </div>
            )}
            {!r.room && !slotDup && (
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 5 }}>
                {openRooms.length > 0
                  ? "Open rooms: " + openRooms.join(", ")
                  : "No open rooms in this time slot — try another slot."}
              </div>
            )}
          </div>
        );
      })}
      {rows.length === 0 && (
        <div style={{ fontSize: 12, color: "#b45309", marginBottom: 6 }}>
          Not scheduled — the class stays in the library sidebar (you can also drag it onto the grid later).
        </div>
      )}
      <button style={{ ...btnSecondary, fontSize: 13, padding: "6px 12px" }} onClick={addRow}>＋ Add meeting time</button>

      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        {!editing.isNew && (
          <button style={{ ...btnSecondary, color: "#b91c1c", borderColor: "#fca5a5" }} onClick={onDelete}>Delete class</button>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button style={btnSecondary} onClick={onClose}>Cancel</button>
          <button style={btnPrimary} onClick={submit} disabled={!name.trim()}>Save</button>
        </div>
      </div>
    </Overlay>
  );
}

// ───────────────────────── Room manager (AM / PM groups) ─────────────────────────
function RoomModal({ rooms, roomCaps, placements, onSave, onClose }) {
  const [morning, setMorning] = useState(rooms.morning.map((r) => ({ orig: r, name: r, cap: roomCaps?.morning?.[r] ?? defaultRoomCap("morning", r) })));
  const [afternoon, setAfternoon] = useState(rooms.afternoon.map((r) => ({ orig: r, name: r, cap: roomCaps?.afternoon?.[r] ?? defaultRoomCap("afternoon", r) })));

  const countFor = (group, origName) =>
    placements.filter((p) => roomGroup(p.section) === group && p.room === origName).length;

  const makeOps = (list, setList, group) => ({
    move: (i, dir) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return;
      const nl = [...list];
      [nl[i], nl[j]] = [nl[j], nl[i]];
      setList(nl);
    },
    remove: (i) => {
      const n = list[i].orig ? countFor(group, list[i].orig) : 0;
      if (n > 0 && !window.confirm(`Room "${list[i].name}" has ${n} class(es). Deleting it will unschedule them. Continue?`)) return;
      setList(list.filter((_, idx) => idx !== i));
    },
    add: () => setList([...list, { orig: null, name: "", cap: 12 }]),
    edit: (i, v) => {
      const nl = [...list];
      nl[i] = { ...nl[i], name: v };
      setList(nl);
    },
    editCap: (i, v) => {
      const nl = [...list];
      nl[i] = { ...nl[i], cap: v };
      setList(nl);
    },
  });

  const submit = () => {
    const build = (list) => {
      const names = list.map((r) => r.name.trim()).filter(Boolean);
      const renames = {};
      const caps = {};
      list.forEach((r) => {
        const name = r.name.trim();
        if (!name) return;
        if (r.orig && r.orig !== name) renames[r.orig] = name;
        caps[name] = cleanCap(r.cap, 12);
      });
      return { names, renames, caps };
    };
    const m = build(morning);
    const a = build(afternoon);
    if (m.names.length === 0 || a.names.length === 0) {
      alert("Keep at least one room in each period.");
      return;
    }
    if (new Set(m.names).size !== m.names.length || new Set(a.names).size !== a.names.length) {
      alert("Room names must be unique within a period.");
      return;
    }
    onSave({ morning: m, afternoon: a });
  };

  const renderGroup = (title, list, setList, group) => {
    const ops = makeOps(list, setList, group);
    return (
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#123c3a", marginBottom: 8 }}>
          {title} ({list.length})
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 76px 44px 26px 26px 26px", gap: 5, alignItems: "center", marginBottom: 5, fontSize: 11, color: "#64748b", fontWeight: 700 }}>
          <span>Room</span>
          <span>Capacity</span>
          <span>Used</span>
          <span />
          <span />
          <span />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
          {list.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 76px 44px 26px 26px 26px", gap: 5, alignItems: "center" }}>
              <input
                style={{ ...inputStyle, padding: "6px 8px" }}
                value={r.name}
                placeholder="Room name"
                onChange={(e) => ops.edit(i, e.target.value)}
              />
              <input
                style={{ ...inputStyle, padding: "6px 8px" }}
                type="number"
                min="0"
                value={r.cap}
                onChange={(e) => ops.editCap(i, e.target.value)}
              />
              {r.orig && (
                <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>
                  {countFor(group, r.orig)} cls
                </span>
              )}
              {!r.orig && <span />}
              <button style={miniBtn} onClick={() => ops.move(i, -1)} title="Move up">↑</button>
              <button style={miniBtn} onClick={() => ops.move(i, 1)} title="Move down">↓</button>
              <button style={{ ...miniBtn, color: "#b91c1c" }} onClick={() => ops.remove(i)} title="Delete">✕</button>
            </div>
          ))}
        </div>
        <button style={{ ...btnSecondary, marginTop: 10, fontSize: 13, padding: "6px 12px" }} onClick={ops.add}>
          ＋ Add room
        </button>
      </div>
    );
  };

  return (
    <Overlay onClose={onClose} wide>
      <h3 style={{ marginTop: 0 }}>Manage rooms</h3>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px" }}>
        Morning and afternoon rooms are managed separately. Capacity is room capacity; class records only track signed-up students.
      </p>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {renderGroup("Morning rooms", morning, setMorning, "morning")}
        {renderGroup("Afternoon rooms", afternoon, setAfternoon, "afternoon")}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
        <button style={btnSecondary} onClick={onClose}>Cancel</button>
        <button style={btnPrimary} onClick={submit}>Save</button>
      </div>
    </Overlay>
  );
}

// ───────────────────────── Shared bits ─────────────────────────
function Overlay({ children, onClose, wide }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 12, padding: "22px 24px",
          width: "100%", maxWidth: wide ? 760 : 460, boxShadow: "0 20px 50px rgba(0,0,0,.25)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <label style={{ display: "block", marginBottom: 12, ...style }}>
      <span style={{ display: "block", fontSize: 13, color: "#475569", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

// ───────────────────────── Styles ─────────────────────────
const thStyle = {
  padding: "10px 8px", borderBottom: "2px solid #d6dad4", borderRight: "1px solid #eceeea",
  fontSize: 13, fontWeight: 600, color: "#475569", textAlign: "center", background: "#fafaf8",
};
const tdStyle = {
  padding: 6, borderBottom: "1px solid #eceeea", borderRight: "1px solid #eceeea", verticalAlign: "top",
};
const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 14,
  border: "1px solid #cbd5d1", borderRadius: 8, outline: "none",
};
const selStyle = {
  boxSizing: "border-box", padding: "7px 8px", fontSize: 13, minWidth: 0,
  border: "1px solid #cbd5d1", borderRadius: 8, outline: "none", background: "#fff", color: "#1e293b",
};
const chipStyle = {
  fontSize: 11, background: "#e6f4f3", color: "#0f766e", borderRadius: 4,
  padding: "1px 6px", whiteSpace: "nowrap", fontWeight: 600,
};
const teacherWarningStyle = {
  fontSize: 11, background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a",
  borderRadius: 4, padding: "2px 6px", fontWeight: 700, lineHeight: 1.25,
};
const roomConflictStyle = {
  fontSize: 11, background: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca",
  borderRadius: 4, padding: "2px 6px", fontWeight: 700, lineHeight: 1.25,
};
const btnGhost = {
  background: "transparent", border: "1px solid rgba(255,255,255,.35)", color: "inherit",
  borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer",
};
const btnPrimary = {
  background: "#123c3a", color: "#fff", border: "none", borderRadius: 8,
  padding: "8px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer",
};
const btnSecondary = {
  background: "#fff", color: "#334155", border: "1px solid #cbd5d1", borderRadius: 8,
  padding: "8px 14px", fontSize: 14, cursor: "pointer",
};
const miniBtn = {
  background: "#fff", border: "1px solid #d6dad4", borderRadius: 6, width: 26, height: 26,
  fontSize: 12, cursor: "pointer", color: "#475569", lineHeight: 1,
};
const stepBtn = {
  width: 20, height: 20, flex: "0 0 20px", borderRadius: 6, border: "1px solid #cbd5d1", background: "#fff",
  cursor: "pointer", fontSize: 13, lineHeight: 1, color: "#334155", padding: 0,
};
