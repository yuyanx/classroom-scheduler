import React, { useState, useCallback, useEffect, useRef } from "react";

// ───────────────────────── Week / time constants ─────────────────────────
const ALL_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABEL = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};
const DAY_SHORT = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"];
const dayIdx = (d) => ALL_DAYS.indexOf(d);

const SNAP = 15;             // minutes — drag/resize granularity
const PX_PER_MIN = 1.1;      // vertical scale of the day grid
const DEFAULT_DURATION = 90; // minutes — for new classes / library drops

// Times are minutes since midnight. Display follows the school's 12-hour style.
const fmtTime = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`;
};
const fmtAmPm = (min) => `${fmtTime(min)} ${min < 720 ? "AM" : "PM"}`;
const fmtRange = (s, e) => `${fmtTime(s)}–${fmtTime(e)}`;
const toInput = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const fromInput = (v) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// Parse "9:00–10:30", "12:30-2:00", "9 AM - 5 PM" → [startMin, endMin].
// Bare hours follow the program's convention: 8–11 = AM, 12 = noon, 1–7 = PM.
function parseTimeRange(label) {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[–—-]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i.exec(label || "");
  if (!m) return null;
  const part = (h, mm, ap) => {
    if (ap) return ((h % 12) + (ap.toLowerCase() === "pm" ? 12 : 0)) * 60 + mm;
    if (h === 12) return 720 + mm;
    if (h >= 1 && h <= 7) return (h + 12) * 60 + mm;
    return h * 60 + mm;
  };
  const s = part(Number(m[1]), Number(m[2] || 0), m[3]);
  const e = part(Number(m[4]), Number(m[5] || 0), m[6]);
  return e > s ? [s, e] : null;
}

function cleanCap(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const teacherKey = (teacher) => {
  const key = (teacher || "").trim().toLowerCase();
  return key === "tbd" || key === "n/a" || key === "na" ? "" : key;
};

const ratioColor = (reg, cap) => {
  if (!cap) return { bar: "#94a3b8", text: "#64748b", bg: "#f8fafc" };
  const r = reg / cap;
  if (r >= 1) return { bar: "#dc2626", text: "#b91c1c", bg: "#fef2f2" };
  if (r >= 0.75) return { bar: "#d97706", text: "#b45309", bg: "#fffbeb" };
  return { bar: "#0d7a72", text: "#0f766e", bg: "#f0fdfa" };
};

// ───────────────────────── Default data (2026 Summer Jericho, v1 format) ─────────────────────────
// Kept in the legacy slot format and run through the migration chain, so the
// migrations are exercised on every fresh install / Reset Data.
const DEFAULT_ROOMS = {
  morning: ["1", "2+3", "4", "5", "6", "7", "8"],
  afternoon: ["1", "2", "3", "4", "5", "6", "7", "8"],
};
const DEFAULT_ROOM_CAPS = {
  morning: { "1": 12, "2+3": 25, "4": 12, "5": 12, "6": 12, "7": 12, "8": 12 },
  afternoon: { "1": 25, "2": 12, "3": 12, "4": 12, "5": 12, "6": 12, "7": 12, "8": 12 },
};
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
  // Morning 9:00–10:30 (daily)
  mk("morning", 0, "2+3", "SAT", "Joshua", 22, 25),
  mk("morning", 0, "7", "ELA", "Linda", 8, 12),
  mk("morning", 0, "6", "Alg2", "James", 7, 12),
  mk("morning", 0, "4", "Geo", "Thomas", 5, 12),
  mk("morning", 0, "5", "5/6th Math", "Matthew M", 8, 12),
  mk("morning", 0, "1", "G7/8 ELA", "", 0, 12),
  // Morning 10:30–12:00 (daily)
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

// ───────────────────────── Data model (v2) ─────────────────────────
// days:       which days the program runs — ordered subset of ALL_DAYS
// hours:      { default: [startMin, endMin], <day>: [start, end] } scheduling window per day
// rooms:      [{ id, cap }] — one plain list for the whole week
// catalog:    one entry per class/cohort — { id, name, teacher, reg, note }
// placements: where a class meets — { id, classId, day, start, end, rooms: ["2","3"] }
//             rooms is usually one room; several rooms = a combined classroom, and the
//             class shows on the calendar in every combined room's column
// A class placed several times shares one roster: reg/name edits apply everywhere.

const DEFAULT_HOURS = { default: [540, 1020], sat: [540, 780] };

function normalizeV2(raw) {
  // Earlier v2 builds modeled combined rooms as standalone entries ({ occupies: [...] });
  // these dissolve into their member rooms and their placements get a rooms[] array.
  const rawRooms = (Array.isArray(raw.rooms) ? raw.rooms : [])
    .map((r) => (typeof r === "string" ? { id: r, cap: 12 } : r))
    .filter((r) => r && r.id != null && String(r.id).trim());
  const dissolved = new Map(); // legacy combined-room id -> member room ids
  rawRooms.forEach((r) => {
    if (Array.isArray(r.occupies) && r.occupies.length) dissolved.set(String(r.id).trim(), r.occupies.map(String));
  });
  let rooms = rawRooms
    .filter((r) => !dissolved.has(String(r.id).trim()))
    .map((r) => ({ id: String(r.id).trim(), cap: cleanCap(r.cap, 12) }));
  const seen = new Set();
  rooms = rooms.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  if (rooms.length === 0) rooms = [{ id: "1", cap: 12 }];
  const roomIds = new Set(rooms.map((r) => r.id));
  const roomPos = new Map(rooms.map((r, i) => [r.id, i]));

  const wanted = (Array.isArray(raw.days) ? raw.days : []).filter((d) => ALL_DAYS.includes(d));
  const days = wanted.length ? ALL_DAYS.filter((d) => wanted.includes(d)) : ["mon", "tue", "wed", "thu", "fri", "sat"];

  const cleanWin = (w) =>
    Array.isArray(w) && Number.isFinite(w[0]) && Number.isFinite(w[1]) && w[1] > w[0]
      ? [Math.max(0, Math.round(w[0])), Math.min(1440, Math.round(w[1]))]
      : null;
  const hours = { default: cleanWin(raw.hours?.default) || DEFAULT_HOURS.default.slice() };
  days.forEach((d) => {
    const w = cleanWin(raw.hours?.[d]) || (raw.hours?.[d] == null && DEFAULT_HOURS[d] ? DEFAULT_HOURS[d].slice() : null);
    if (w) hours[d] = w;
  });

  const catalog = (raw.catalog || []).map(({ cap, ...k }) => ({
    ...k,
    reg: Math.max(0, parseInt(k.reg, 10) || 0),
    note: k.note || "",
  }));
  const classIds = new Set(catalog.map((k) => k.id));

  const placements = [];
  (raw.placements || []).forEach((p) => {
    if (!p || !classIds.has(p.classId) || !days.includes(p.day)) return;
    if (!Number.isFinite(p.start) || !Number.isFinite(p.end) || !(p.end > p.start)) return;
    const wanted = Array.isArray(p.rooms) ? p.rooms : p.room != null ? [p.room] : [];
    const prooms = [...new Set(
      wanted.flatMap((r) => dissolved.get(String(r)) || [String(r)]).filter((r) => roomIds.has(r))
    )].sort((a, b) => roomPos.get(a) - roomPos.get(b));
    if (!prooms.length) return;
    placements.push({
      id: p.id, classId: p.classId, day: p.day,
      start: Math.round(p.start), end: Math.round(p.end), rooms: prooms,
    });
  });

  // Teacher roster: stored list ∪ every teacher named on a class (dedup case-insensitively)
  const teacherMap = new Map();
  [...(Array.isArray(raw.teachers) ? raw.teachers : []), ...catalog.map((k) => k.teacher)].forEach((t) => {
    const key = teacherKey(t);
    if (key && !teacherMap.has(key)) teacherMap.set(key, String(t).trim());
  });
  const teachers = [...teacherMap.values()].sort((a, b) => a.localeCompare(b));

  return { version: 2, days, hours, rooms, catalog, placements, teachers, nextId: raw.nextId || 1000 };
}

// Convert the pre-library format ({ classes: [...] }) into v1 catalog + placements.
// Grid entries that are fully identical (name/teacher/reg/note) collapse into one
// catalog entry with several placements — one class meeting on several days.
function migrateOld(old) {
  const v1Group = (s) => (s === "morning" ? "morning" : "afternoon");
  const catalog = [];
  const placements = [];
  const roomCaps = { morning: {}, afternoon: {} };
  let n = 1;
  const byKey = new Map();
  (old.classes || []).forEach((c) => {
    const group = v1Group(c.section);
    const cap = Math.max(0, parseInt(c.cap, 10) || DEFAULT_ROOM_CAPS[group]?.[c.room] || 12);
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
  return { rooms: old.rooms, slots: old.slots, roomCaps, catalog, placements, nextId: n };
}

// v1 (sections + slot indexes, AM/PM room groups) → v2 (days + minutes, one room list).
// - "morning" placements expand to one placement per weekday (shared roster keeps them one class)
// - slot labels parse into minutes; a class-level note that is a time range (the old
//   "actual time" workaround, e.g. "2:30–4:00") overrides the slot and is cleared
// - "2+3"-style rooms become multi-room placements (the class occupies Rooms 2 and 3 together)
function migrateV1toV2(v1) {
  const aft = (v1.rooms?.afternoon || []).slice();
  const mor = v1.rooms?.morning || [];
  const names = aft.slice();
  const splitNames = new Map(); // "2+3" -> ["2","3"]
  mor.forEach((n) => {
    if (names.includes(n)) return;
    const members = [...new Set(n.split("+").map((s) => s.trim()).filter((m) => m && names.includes(m)))];
    if (members.length > 1) splitNames.set(n, members);
    else names.push(n);
  });
  const capOf = (n) =>
    Math.max(cleanCap(v1.roomCaps?.morning?.[n], 0), cleanCap(v1.roomCaps?.afternoon?.[n], 0)) ||
    Math.max(DEFAULT_ROOM_CAPS.morning[n] || 0, DEFAULT_ROOM_CAPS.afternoon[n] || 0) || 12;
  const rooms = names.map((n) => ({ id: n, cap: capOf(n) }));

  const noteRange = new Map();
  const catalog = (v1.catalog || []).map((k) => {
    const r = parseTimeRange(k.note);
    if (r) {
      noteRange.set(k.id, r);
      return { ...k, note: "" };
    }
    return { ...k };
  });

  let n = v1.nextId || 1000;
  const placements = [];
  (v1.placements || []).forEach((p) => {
    const slotLabel = (v1.slots?.[p.section] || [])[p.slotIdx];
    const range =
      noteRange.get(p.classId) ||
      parseTimeRange(slotLabel) ||
      (p.section === "morning" ? [540, 630] : [750, 840]);
    const onDays = p.section === "morning" ? WEEKDAYS : [p.section];
    onDays.forEach((d) => {
      placements.push({
        id: "p" + n++, classId: p.classId, day: d,
        start: range[0], end: range[1],
        rooms: splitNames.get(p.room) || [p.room],
      });
    });
  });

  return normalizeV2({
    version: 2,
    days: ["mon", "tue", "wed", "thu", "fri", "sat"],
    hours: { default: DEFAULT_HOURS.default.slice(), sat: DEFAULT_HOURS.sat.slice() },
    rooms, catalog, placements,
    teachers: v1.teachers,
    nextId: n,
  });
}

// Accept any historical shape. Idempotent — safe to run on every load, including
// shared-row polls (protects against an old client writing v1 data back).
function upgrade(raw) {
  if (!raw || typeof raw !== "object") return defaultData();
  if (raw.version === 2 || Array.isArray(raw.rooms) || (raw.placements || []).some((p) => p && p.day != null)) {
    return normalizeV2(raw);
  }
  if (raw.catalog && raw.placements) return migrateV1toV2(raw);
  if (raw.classes) return migrateV1toV2(migrateOld(raw));
  return defaultData();
}

const defaultData = () =>
  migrateV1toV2(
    migrateOld({
      rooms: JSON.parse(JSON.stringify(DEFAULT_ROOMS)),
      slots: JSON.parse(JSON.stringify(DEFAULT_SLOTS)),
      classes: DEFAULT_CLASSES,
    })
  );

const STORAGE_KEY = "premier-classroom-schedule";

// ───────────────────────── Shared storage (Supabase) ─────────────────────────
// One shared schedule for everyone. The anon key is designed to be public; what
// it can do is limited by the table's RLS policies. Empty key = browser-only mode.
// Local dev (localhost) also runs browser-only so experiments never touch the
// live shared schedule.
const SUPABASE_URL = "https://zbvedbwbxdzcsnftvyph.supabase.co";
const SUPABASE_KEY = "sb_publishable_cDEmeJDF7lwuafg8ZYKF4Q_Sl_fUSTE";
const IS_LOCAL_DEV =
  typeof window !== "undefined" && /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(window.location.hostname);
const REMOTE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_KEY) && !IS_LOCAL_DEV;
const REMOTE_ROW_ID = 1;
const REMOTE_POLL_MS = 30000;

const sbHeaders = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
});

async function remoteLoad() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/schedule?id=eq.${REMOTE_ROW_ID}&select=data,updated_at`,
    { headers: sbHeaders() }
  );
  if (!res.ok) throw new Error(`Could not load shared schedule (HTTP ${res.status})`);
  const rows = await res.json();
  return rows[0] || null; // { data, updated_at } | null (no row yet)
}

async function remoteUpdatedAt() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/schedule?id=eq.${REMOTE_ROW_ID}&select=updated_at`,
    { headers: sbHeaders() }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  return rows[0]?.updated_at || null;
}

async function remoteSave(data, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/schedule?on_conflict=id`, {
    method: "POST",
    headers: { ...sbHeaders(), Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ id: REMOTE_ROW_ID, data, updated_at: new Date().toISOString() }),
    keepalive: opts.keepalive || false, // lets the save finish while the tab is closing
  });
  if (!res.ok) throw new Error(`Could not save shared schedule (HTTP ${res.status})`);
  const rows = await res.json();
  return rows[0]?.updated_at || null;
}

const loadData = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return upgrade(JSON.parse(raw));
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

// ───────────────────────── Interval helpers ─────────────────────────
const overlaps = (a, b) => a.day === b.day && a.start < b.end && b.start < a.end;

// Overlapping placements in one room share the column side by side (calendar-style lanes)
function layoutLanes(list) {
  const sorted = [...list].sort((a, b) => a.start - b.start || a.end - b.end);
  const res = new Map();
  let cluster = [];
  let laneEnds = [];
  let clusterEnd = 0;
  const flush = () => {
    cluster.forEach((it) => res.set(it.p.id, { lane: it.lane, lanes: laneEnds.length }));
    cluster = [];
    laneEnds = [];
  };
  sorted.forEach((p) => {
    if (cluster.length && p.start >= clusterEnd) flush();
    clusterEnd = cluster.length ? Math.max(clusterEnd, p.end) : p.end;
    let lane = laneEnds.findIndex((e) => e <= p.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(p.end);
    } else {
      laneEnds[lane] = p.end;
    }
    cluster.push({ p, lane });
  });
  flush();
  return res;
}

// ───────────────────────── Main component ─────────────────────────
export default function ClassroomScheduler() {
  const [data, setData] = useState(loadData);
  const [saveStatus, setSaveStatus] = useState({
    ok: true,
    lastSavedAt: null,
    error: "",
    label: "Checking save...",
  });
  const [tab, setTab] = useState("mon");
  const [editing, setEditing] = useState(null); // {isNew, classId?, placementId?, day?, start?, room?}
  const [roomMgrOpen, setRoomMgrOpen] = useState(false);
  const [teacherMgrOpen, setTeacherMgrOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [drag, setDrag] = useState(null); // {type:'lib'|'pl', id, dur, grabOffset}
  const [dragOver, setDragOver] = useState(null); // "tray" | null
  const [ghost, setGhost] = useState(null); // {room, start, dur, names: []}
  const ghostRef = useRef(null);
  const [resize, setResize] = useState(null); // {plId, end}
  const [flash, setFlash] = useState(null);
  const flashTimer = useRef(null);
  const [libOpen, setLibOpenState] = useState(() => {
    try { return window.localStorage.getItem("premier-ui-lib-open") !== "0"; } catch (e) { return true; }
  });
  const setLibOpen = (updater) =>
    setLibOpenState((prev) => {
      const v = typeof updater === "function" ? updater(prev) : updater;
      try { window.localStorage.setItem("premier-ui-lib-open", v ? "1" : "0"); } catch (e) { /* ignore */ }
      return v;
    });
  const [libQuery, setLibQuery] = useState("");

  const remoteRef = useRef({ timer: null, retryTimer: null, lastSyncedAt: null, pendingSave: false, lastSaveFailed: false });
  const dataRef = useRef(data);
  dataRef.current = data; // latest data for retries and the tab-close flush

  const timeLabel = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const updateSaveStatus = useCallback((result) => {
    const now = new Date();
    setSaveStatus({
      ok: result.ok,
      lastSavedAt: result.ok ? now : null,
      error: result.error || "",
      label: result.ok ? `Saved to this browser at ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Not saved",
    });
  }, []);

  const setStatus = (ok, label, error = "") =>
    setSaveStatus({ ok, lastSavedAt: ok ? new Date() : null, error, label });

  const flushRemoteSave = async (payload) => {
    remoteRef.current.pendingSave = true;
    try {
      const ts = await remoteSave(payload);
      remoteRef.current.lastSyncedAt = ts || new Date().toISOString();
      remoteRef.current.pendingSave = false;
      remoteRef.current.lastSaveFailed = false;
      clearTimeout(remoteRef.current.retryTimer);
      setStatus(true, `Saved for everyone at ${timeLabel()}`);
    } catch (e) {
      remoteRef.current.pendingSave = false;
      remoteRef.current.lastSaveFailed = true;
      setStatus(false, "Not saved", e?.message || "Network error");
      // Keep retrying with the latest data until a save lands
      clearTimeout(remoteRef.current.retryTimer);
      remoteRef.current.retryTimer = setTimeout(() => {
        if (!remoteRef.current.pendingSave) flushRemoteSave(dataRef.current);
      }, 5000);
    }
  };

  const persist = useCallback((next) => {
    setData(next);
    if (!REMOTE_ENABLED) {
      updateSaveStatus(saveData(next));
      return;
    }
    saveData(next); // keep a local cache as offline fallback
    setSaveStatus((s) => ({ ...s, ok: true, error: "", label: "Saving…" }));
    remoteRef.current.pendingSave = true;
    clearTimeout(remoteRef.current.timer);
    remoteRef.current.timer = setTimeout(() => flushRemoteSave(next), 600);
  }, [updateSaveStatus]);

  useEffect(() => {
    if (!REMOTE_ENABLED) {
      updateSaveStatus(saveData(data));
      return;
    }
    let cancelled = false;
    (async () => {
      setSaveStatus((s) => ({ ...s, label: "Loading shared schedule…" }));
      try {
        const row = await remoteLoad();
        if (cancelled) return;
        if (row) {
          remoteRef.current.lastSyncedAt = row.updated_at;
          setData(upgrade(row.data));
          setStatus(true, `Shared schedule loaded at ${timeLabel()}`);
        } else {
          // First run ever: publish this browser's copy as the shared schedule
          await flushRemoteSave(data);
        }
      } catch (e) {
        if (!cancelled) setStatus(false, "Offline — using this browser's copy", e?.message || "");
      }
    })();
    // Light polling keeps other open computers in sync (last write wins)
    const iv = setInterval(async () => {
      if (remoteRef.current.pendingSave || document.hidden) return;
      try {
        const ts = await remoteUpdatedAt();
        if (ts && remoteRef.current.lastSyncedAt && ts > remoteRef.current.lastSyncedAt) {
          const row = await remoteLoad();
          if (row && !remoteRef.current.pendingSave) {
            remoteRef.current.lastSyncedAt = row.updated_at;
            setData(upgrade(row.data));
            setStatus(true, `Updated from another computer at ${timeLabel()}`);
          }
        }
      } catch (e) { /* ignore transient poll errors */ }
    }, REMOTE_POLL_MS);
    // Retry as soon as the connection returns (only when a save actually failed)
    const onOnline = () => {
      if (remoteRef.current.lastSaveFailed && !remoteRef.current.pendingSave) flushRemoteSave(dataRef.current);
    };
    window.addEventListener("online", onOnline);
    // Flush a still-debouncing save when the tab closes, so the last edit isn't lost
    const onPageHide = () => {
      if (remoteRef.current.timer) {
        clearTimeout(remoteRef.current.timer);
        remoteRef.current.timer = null;
        remoteSave(dataRef.current, { keepalive: true }).catch(() => {});
      }
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      cancelled = true;
      clearInterval(iv);
      clearTimeout(remoteRef.current.retryTimer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  const saveNow = () => {
    if (!REMOTE_ENABLED) {
      updateSaveStatus(saveData(data));
      return;
    }
    clearTimeout(remoteRef.current.timer);
    flushRemoteSave(data);
  };

  const { days, hours, rooms, catalog, placements, teachers } = data;

  // Make sure the active tab still exists (e.g. after remote data changes the day list)
  useEffect(() => {
    if (!days.includes(tab) && tab !== "byClass" && tab !== "byTeacher") setTab(days[0]);
  }, [days, tab]);

  // ── Rooms: a placement may span several rooms (combined classroom) ──
  const roomPos = new Map(rooms.map((r, i) => [r.id, i]));
  const sortRoomIds = (list) => [...list].sort((a, b) => (roomPos.get(a) ?? 99) - (roomPos.get(b) ?? 99));
  const roomsLabel = (list) => sortRoomIds(list).join("+");
  const shareRoom = (a, b) => a.some((x) => b.includes(x));
  const roomCap = (id) => rooms.find((r) => r.id === id)?.cap ?? 12;
  const capOfRooms = (list) => list.reduce((s, id) => s + roomCap(id), 0);

  const classOfId = (id) => catalog.find((k) => k.id === id);
  const placementsOf = (classId) => placements.filter((p) => p.classId === classId);

  const roomConflictsFor = (cand, opts = {}) =>
    placements.filter(
      (p) =>
        p.id !== opts.excludeId &&
        (opts.excludeClassId == null || p.classId !== opts.excludeClassId) &&
        overlaps(p, cand) &&
        shareRoom(p.rooms, cand.rooms)
    );

  const teacherBusy = (cand, teacher, opts = {}) => {
    const key = teacherKey(teacher);
    if (!key) return [];
    return placements
      .filter((p) => p.id !== opts.excludePlacementId && p.classId !== opts.excludeClassId && overlaps(p, cand))
      .map((p) => ({ placement: p, cls: classOfId(p.classId) }))
      .filter(({ cls }) => teacherKey(cls?.teacher) === key);
  };
  const teacherConflictsForPlacement = (pl) => {
    const cls = classOfId(pl.classId);
    return teacherBusy(pl, cls?.teacher, { excludePlacementId: pl.id });
  };
  const teacherConflictLabels = (items) =>
    [...new Set(items.map(({ placement, cls }) =>
      `${cls?.name || "Class"} (${DAY_SHORT[placement.day]} ${fmtRange(placement.start, placement.end)} · Rm ${placement.rooms.join("+")})`
    ))];

  const totalReg = catalog.reduce((s, k) => s + (k.reg || 0), 0);
  const noTeacherCount = catalog.filter((k) => !teacherKey(k.teacher)).length;

  // ── Day-grid geometry for the active tab ──
  const isDayTab = days.includes(tab);
  const winCfg = (isDayTab && hours[tab]) || hours.default;
  const tabPls = isDayTab ? placements.filter((p) => p.day === tab) : [];
  const tabReg = tabPls.reduce((s, p) => s + ((classOfId(p.classId) || {}).reg || 0), 0);
  // The grid always shows the configured window, stretched to fit any placement outside it
  const gridStart = Math.floor(Math.min(winCfg[0], ...tabPls.map((p) => p.start)) / 60) * 60;
  const gridEnd = Math.ceil(Math.max(winCfg[1], ...tabPls.map((p) => p.end)) / 60) * 60;
  const gridH = (gridEnd - gridStart) * PX_PER_MIN;
  const hourMarks = [];
  for (let t = gridStart; t <= gridEnd; t += 60) hourMarks.push(t);
  const halfMarks = [];
  for (let t = gridStart + 30; t < gridEnd; t += 60) halfMarks.push(t);

  // Chips like "Mon 2:00" for everywhere a class is scheduled
  const placementChips = (classId) =>
    placementsOf(classId)
      .slice()
      .sort((a, b) => dayIdx(a.day) - dayIdx(b.day) || a.start - b.start)
      .map((p) => ({ id: p.id, label: `${DAY_SHORT[p.day]} ${fmtTime(p.start)}` }));

  const durationFor = (classId) => {
    const ps = placementsOf(classId);
    return ps.length ? ps[0].end - ps[0].start : DEFAULT_DURATION;
  };

  const flashMsg = (msg) => {
    setFlash(msg);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 4500);
  };

  // ── Placement ops ──
  const addPlacementAt = (classId, cand) => {
    if (!classOfId(classId)) return;
    const nid = data.nextId || 1000;
    persist({
      ...data,
      placements: [...placements, { id: "p" + nid, classId, day: cand.day, start: cand.start, end: cand.end, rooms: cand.rooms }],
      nextId: nid + 1,
    });
  };

  const removePlacement = (plId) =>
    persist({ ...data, placements: placements.filter((p) => p.id !== plId) });

  const movePlacement = (plId, cand) => {
    const src = placements.find((p) => p.id === plId);
    if (!src) return;
    if (src.day === cand.day && src.start === cand.start && src.rooms.join("|") === cand.rooms.join("|")) return;
    persist({
      ...data,
      placements: placements.map((p) =>
        p.id === plId ? { ...p, day: cand.day, start: cand.start, end: cand.end, rooms: cand.rooms } : p
      ),
    });
  };

  // ── Drag & drop on the day grid ──
  const snapStartFromEvent = (e, dur) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const yMin = gridStart + (e.clientY - rect.top) / PX_PER_MIN - (drag?.grabOffset || 0);
    let start = Math.round(yMin / SNAP) * SNAP;
    return Math.max(gridStart, Math.min(start, gridEnd - dur));
  };

  const colHandlers = (roomId) => ({
    onDragOver: (e) => {
      if (!drag) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const start = snapStartFromEvent(e, drag.dur);
      // A combined (multi-room) class keeps its room set while dragging — the drag changes
      // its day/time only, and the ghost shows in every room it occupies.
      const candRooms = drag.rooms && drag.rooms.length > 1 ? drag.rooms : [roomId];
      const key = candRooms.join("+") + ":" + start;
      if (ghostRef.current === key) return;
      ghostRef.current = key;
      const cand = { day: tab, start, end: start + drag.dur, rooms: candRooms };
      const clashes = roomConflictsFor(cand, { excludeId: drag.type === "pl" ? drag.id : undefined });
      setGhost({
        rooms: candRooms, start, dur: drag.dur,
        names: [...new Set(clashes.map((c) => classOfId(c.classId)?.name || "another class"))],
      });
      setDragOver(null);
    },
    onDrop: (e) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("text/plain") || (drag ? drag.type + ":" + drag.id : "");
      const [type, id] = raw.split(":");
      const dur = drag?.dur || DEFAULT_DURATION;
      const start = snapStartFromEvent(e, dur);
      const candRooms = drag?.rooms && drag.rooms.length > 1 ? drag.rooms : [roomId];
      const cand = { day: tab, start, end: start + dur, rooms: candRooms };
      const clashes = roomConflictsFor(cand, { excludeId: type === "pl" ? id : undefined });
      if (clashes.length) {
        const names = [...new Set(clashes.map((c) => classOfId(c.classId)?.name || "another class"))];
        flashMsg(`Can't place it there — Room${candRooms.length > 1 ? "s" : ""} ${roomsLabel(candRooms)} ${fmtRange(cand.start, cand.end)} overlaps ${names.join(", ")}.`);
      } else if (type === "lib") {
        addPlacementAt(id, cand);
      } else if (type === "pl") {
        movePlacement(id, cand);
      }
      setDrag(null);
      setGhost(null);
      ghostRef.current = null;
      setDragOver(null);
    },
    onClick: (e) => {
      if (e.target !== e.currentTarget || drag) return;
      const rect = e.currentTarget.getBoundingClientRect();
      let start = gridStart + Math.round((e.clientY - rect.top) / PX_PER_MIN / SNAP) * SNAP;
      start = Math.max(gridStart, Math.min(start, gridEnd - SNAP));
      setEditing({ isNew: true, day: tab, start, room: roomId });
    },
  });

  // Library tray: dropping a scheduled card here unschedules it (class stays in the library)
  const trayHandlers = {
    onDragOver: (e) => {
      if (drag?.type !== "pl") return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver("tray");
      setGhost(null);
      ghostRef.current = null;
    },
    onDragLeave: () => setDragOver((d) => (d === "tray" ? null : d)),
    onDrop: (e) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("text/plain") || (drag ? drag.type + ":" + drag.id : "");
      const [type, id] = raw.split(":");
      if (type === "pl") removePlacement(id);
      setDrag(null);
      setGhost(null);
      ghostRef.current = null;
      setDragOver(null);
    },
  };

  // ── Resize a card by dragging its bottom edge ──
  const startResize = (e, p) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const limit = Math.min(
      gridEnd,
      ...placements
        .filter((o) => o.id !== p.id && o.day === p.day && o.start >= p.start && shareRoom(o.rooms, p.rooms))
        .map((o) => o.start)
    );
    let cur = p.end;
    const move = (ev) => {
      const dy = ev.clientY - startY;
      let end = p.end + Math.round(dy / PX_PER_MIN / SNAP) * SNAP;
      end = Math.max(p.start + SNAP, Math.min(end, limit));
      if (end !== cur) {
        cur = end;
        setResize({ plId: p.id, end });
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResize(null);
      if (cur !== p.end) {
        persist({ ...data, placements: placements.map((x) => (x.id === p.id ? { ...x, end: cur } : x)) });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    setResize({ plId: p.id, end: p.end });
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
      classId, day: r.day, start: r.start, end: r.end, rooms: sortRoomIds(r.rooms),
    }));
    // A teacher picked via "Add new teacher…" joins the roster on save
    const tKey = teacherKey(form.teacher);
    const newTeachers = tKey && !(teachers || []).some((t) => teacherKey(t) === tKey)
      ? [...(teachers || []), form.teacher].sort((a, b) => a.localeCompare(b))
      : teachers;
    persist({ ...data, catalog: newCatalog, placements: [...others, ...mine], teachers: newTeachers, nextId: nid });
    setEditing(null);
  };

  const deleteClass = (classId) => {
    const n = placementsOf(classId).length;
    if (n > 1 && !window.confirm(`This class meets ${n} times. Delete it everywhere?`)) return;
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

  // ── Room management (one list for the whole week; renames cascade into placements) ──
  // Deleting a room drops it from every placement; a placement left with no rooms is unscheduled.
  const saveRooms = ({ list, renames }) => {
    const ids = new Set(list.map((r) => r.id));
    const np = placements
      .map((p) => ({
        ...p,
        rooms: [...new Set(p.rooms.map((r) => renames[r] || r))].filter((r) => ids.has(r)),
      }))
      .filter((p) => p.rooms.length > 0);
    persist({ ...data, rooms: list, placements: np });
    setRoomMgrOpen(false);
  };

  // ── Quick capacity edit from a calendar room header ──
  const editRoomCap = (roomId) => {
    const raw = prompt(`Capacity for Room ${roomId} (applies all week):`, roomCap(roomId));
    if (raw == null) return;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) {
      alert("Enter a number of 0 or more.");
      return;
    }
    persist({ ...data, rooms: rooms.map((r) => (r.id === roomId ? { ...r, cap: n } : r)) });
  };

  // ── Per-day scheduling window ──
  const editHours = () => {
    const cur = hours[tab] || hours.default;
    const raw = prompt(
      `Scheduling hours for ${DAY_LABEL[tab]} (e.g. 9:00 AM - 5:00 PM):`,
      `${fmtAmPm(cur[0])} - ${fmtAmPm(cur[1])}`
    );
    if (raw == null) return;
    const r = parseTimeRange(raw);
    if (!r) {
      alert("Couldn't read that — use a format like 9:00 AM - 5:00 PM.");
      return;
    }
    persist({ ...data, hours: { ...hours, [tab]: r } });
  };

  // ── Teacher roster management (rename cascades to classes; removal sets them to TBD) ──
  const saveTeachers = ({ names, renames, removed }) => {
    let nc = catalog;
    Object.entries(renames).forEach(([oldName, newName]) => {
      nc = nc.map((k) => (teacherKey(k.teacher) === teacherKey(oldName) ? { ...k, teacher: newName } : k));
    });
    removed.forEach((oldName) => {
      nc = nc.map((k) => (teacherKey(k.teacher) === teacherKey(oldName) ? { ...k, teacher: "" } : k));
    });
    persist({ ...data, teachers: names, catalog: nc });
    setTeacherMgrOpen(false);
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

  // ── One scheduled card on the day grid ──
  const renderBlock = (p, laneInfo) => {
    const cls = classOfId(p.classId);
    if (!cls) return null;
    const end = resize?.plId === p.id ? resize.end : p.end;
    const top = (p.start - gridStart) * PX_PER_MIN;
    const h = (end - p.start) * PX_PER_MIN;
    const { lane, lanes } = laneInfo || { lane: 0, lanes: 1 };
    const combined = p.rooms.length > 1;
    const cap = capOfRooms(p.rooms);
    const col = ratioColor(cls.reg, cap);
    const pct = cap ? Math.min(100, Math.round((cls.reg / cap) * 100)) : 0;
    const roomClashes = roomConflictsFor({ day: p.day, start: p.start, end, rooms: p.rooms }, { excludeId: p.id });
    const teacherConflicts = teacherConflictLabels(teacherConflictsForPlacement(p));
    const hasRoomClash = roomClashes.length > 0;
    const hasTeacherConflict = teacherConflicts.length > 0;
    const otherDays = [...new Set(placementsOf(cls.id).filter((x) => x.id !== p.id).map((x) => DAY_SHORT[x.day]))];
    const isDragging = drag?.type === "pl" && drag.id === p.id;
    return (
      <div
        key={p.id}
        draggable={!resize}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", "pl:" + p.id);
          e.dataTransfer.effectAllowed = "move";
          const rect = e.currentTarget.getBoundingClientRect();
          setDrag({ type: "pl", id: p.id, dur: p.end - p.start, rooms: p.rooms, grabOffset: (e.clientY - rect.top) / PX_PER_MIN });
        }}
        onDragEnd={() => { setDrag(null); setGhost(null); ghostRef.current = null; setDragOver(null); }}
        onClick={(e) => { e.stopPropagation(); setEditing({ isNew: false, classId: cls.id, placementId: p.id }); }}
        title={
          `${cls.name} · ${fmtRange(p.start, end)}` +
          (combined ? ` · combined Rooms ${roomsLabel(p.rooms)} (drags move its time; change rooms in the dialog)` : "") +
          (hasRoomClash ? ` · ROOM CONFLICT with ${[...new Set(roomClashes.map((c) => classOfId(c.classId)?.name))].join(", ")}` : "") +
          (hasTeacherConflict ? ` · same teacher also has ${teacherConflicts.join(", ")}` : "") +
          " — drag to move · drag the bottom edge to change length · click to edit"
        }
        style={{
          position: "absolute",
          top: top + 1,
          height: Math.max(14, h - 2),
          left: `calc(${(lane / lanes) * 100}% + 2px)`,
          width: `calc(${100 / lanes}% - 5px)`,
          boxSizing: "border-box",
          zIndex: 1,
          background: col.bg,
          border: hasRoomClash ? "2px solid #dc2626" : hasTeacherConflict ? "2px solid #d97706" : "1px solid #d6dad4",
          boxShadow: hasRoomClash
            ? "0 0 0 3px rgba(220,38,38,.12)"
            : hasTeacherConflict
              ? "0 0 0 3px rgba(217,119,6,.12)"
              : "none",
          borderRadius: 8,
          padding: "4px 7px",
          overflow: "hidden",
          cursor: "grab",
          opacity: isDragging ? 0.35 : 1,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          transition: "opacity .15s, box-shadow .15s",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 12.5, lineHeight: 1.2, overflowWrap: "anywhere" }}>{cls.name}</div>
        <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.25 }}>
          {fmtRange(p.start, end)}
          {h >= 56 && <> · {cls.teacher || <i style={{ color: "#b45309" }}>TBD</i>}</>}
        </div>
        {combined && h >= 44 && (
          <div style={{ fontSize: 10.5, color: "#7c3aed", fontWeight: 700 }} title={`This class uses Rooms ${roomsLabel(p.rooms)} at the same time`}>
            ⇆ Rooms {roomsLabel(p.rooms)} combined
          </div>
        )}
        {h >= 78 && hasRoomClash && <div style={roomConflictStyle}>Room conflict</div>}
        {h >= 78 && !hasRoomClash && hasTeacherConflict && <div style={teacherWarningStyle}>Teacher conflict</div>}
        {h >= 100 && otherDays.length > 0 && (
          <div style={{ fontSize: 11, color: "#0f766e" }} title="Same class (one roster) also meets on these days">
            ⇄ also {otherDays.join(" · ")}
          </div>
        )}
        {h >= 64 && (
          <div style={{ marginTop: "auto", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 3, minWidth: 0 }}>
              {h >= 88 && (
                <button onClick={(e) => { e.stopPropagation(); bump(cls.id, -1); }} style={stepBtn}>−</button>
              )}
              <span style={{ fontSize: 11, fontWeight: 700, color: col.text, minWidth: 0, flex: 1, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden" }}>
                {cls.reg}/{cap}{cls.reg >= cap && cap > 0 ? " · FULL" : ""}
              </span>
              {h >= 88 && (
                <button onClick={(e) => { e.stopPropagation(); bump(cls.id, +1); }} style={stepBtn}>＋</button>
              )}
            </div>
            <div style={{ height: 4, background: "#e2e8f0", borderRadius: 2, marginTop: 3, overflow: "hidden" }}>
              <div style={{ width: pct + "%", height: "100%", background: col.bar, borderRadius: 2, transition: "width .25s" }} />
            </div>
          </div>
        )}
        {h >= 30 && (
          <div
            onPointerDown={(e) => startResize(e, p)}
            onClick={(e) => e.stopPropagation()}
            title="Drag to change the end time"
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, cursor: "ns-resize", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          >
            <div style={{ width: 22, height: 3, borderRadius: 2, background: "rgba(15,23,42,.18)", marginBottom: 2 }} />
          </div>
        )}
      </div>
    );
  };

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
            2026 Summer · Jericho · {rooms.length} rooms · {DAY_SHORT[days[0]]}–{DAY_SHORT[days[days.length - 1]]}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 13, opacity: 0.85 }}>
              Total enrolled <b style={{ fontSize: 16 }}>{totalReg}</b>
            </span>
            <span
              title={saveStatus.ok
                ? (REMOTE_ENABLED ? "Everyone opening this site sees this shared schedule." : "Changes are stored in this browser.")
                : saveStatus.error}
              style={{
                fontSize: 12,
                color: saveStatus.ok ? "#d1fae5" : "#fecaca",
                whiteSpace: "nowrap",
              }}
            >
              {saveStatus.label}
            </span>
            <button onClick={() => setRoomMgrOpen(true)} style={btnGhost}>Manage Rooms</button>
            <button onClick={() => setConfirmReset(true)} style={{ ...btnGhost, opacity: 0.7 }}>Reset Data</button>
          </div>
        </div>
      </header>

      {!saveStatus.ok && (
        <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "8px 24px", fontSize: 13, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>
            {REMOTE_ENABLED
              ? "Changes are not reaching the shared schedule — they are kept in this browser and retried automatically."
              : "Changes could not be saved to this browser. They may be lost when you close the page."}
            {saveStatus.error && <span> Details: {saveStatus.error}</span>}
          </span>
          <button onClick={saveNow} style={{ ...btnSecondary, color: "#b91c1c", borderColor: "#fca5a5", padding: "4px 10px", fontSize: 12 }}>
            Retry now
          </button>
        </div>
      )}

      <div style={{ width: "100%", boxSizing: "border-box", padding: "16px 12px 40px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* Class Library */}
        <aside style={{ flex: `0 0 ${libOpen ? 240 : 46}px`, width: libOpen ? 240 : 46, position: "sticky", top: 16, alignSelf: "flex-start" }}>
          {!libOpen && (
            <div
              {...trayHandlers}
              onClick={() => setLibOpen(true)}
              title="Show the Class Library"
              style={{
                background: dragOver === "tray" ? "#fff7ed" : "#fff",
                border: "1px solid #d6dad4", borderRadius: 10,
                padding: "12px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                cursor: "pointer",
                outline: drag?.type === "pl" ? "2px dashed #d97706" : "none", outlineOffset: -4,
              }}
            >
              <span style={{ fontSize: 14, color: "#123c3a" }}>▸</span>
              <span style={{ writingMode: "vertical-rl", fontSize: 13, fontWeight: 700, color: "#123c3a", letterSpacing: "0.03em" }}>
                Class Library
              </span>
              <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{catalog.length}</span>
              {drag?.type === "pl" && (
                <span style={{ writingMode: "vertical-rl", fontSize: 11, color: "#b45309", fontWeight: 700 }}>
                  ⤓ drop here to unschedule
                </span>
              )}
            </div>
          )}
          {libOpen && (
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
                        setDrag({ type: "lib", id: k.id, dur: durationFor(k.id), grabOffset: 0 });
                      }}
                      onDragEnd={() => { setDrag(null); setGhost(null); ghostRef.current = null; setDragOver(null); }}
                      onClick={() => setEditing({ isNew: false, classId: k.id })}
                      title="Drag onto the calendar to schedule (the same class can be placed on several days) · click to edit details & meeting times"
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
          )}
        </aside>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Tabs */}
          <nav style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {days.map((d) => (
              <button
                key={d}
                onClick={() => setTab(d)}
                onDragEnter={(e) => { if (drag) { e.preventDefault(); setTab(d); } }}
                title={drag ? `Drop onto ${DAY_LABEL[d]} — hover to switch day` : DAY_LABEL[d]}
                style={{
                  padding: "8px 14px",
                  borderRadius: "10px 10px 0 0",
                  border: "1px solid #d6dad4",
                  borderBottom: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: tab === d ? 700 : 400,
                  background: tab === d ? "#fff" : "#e8eae6",
                  color: tab === d ? "#123c3a" : "#64748b",
                }}
              >
                {DAY_SHORT[d]}
              </button>
            ))}
            {[{ id: "byClass", label: "📋 By Class" }, { id: "byTeacher", label: "👤 By Teacher" }].map((v) => (
              <button
                key={v.id}
                onClick={() => setTab(v.id)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "10px 10px 0 0",
                  border: "1px solid #d6dad4",
                  borderBottom: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: tab === v.id ? 700 : 400,
                  background: tab === v.id ? "#fff" : "#e8eae6",
                  color: tab === v.id ? "#123c3a" : "#64748b",
                }}
              >
                {v.label}
              </button>
            ))}
            <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 13, color: "#64748b" }}>
              {tab === "byTeacher"
                ? `${(teachers || []).length} teachers · ${noTeacherCount} classes need a teacher`
                : tab === "byClass"
                  ? `${catalog.length} classes · ${unscheduledCount} unscheduled`
                  : `${tabPls.length} classes · ${tabReg} students on ${DAY_LABEL[tab] || "this day"}`}
            </span>
          </nav>

          {flash && (
            <div style={{ marginTop: 6, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 8, padding: "7px 12px", fontSize: 13, fontWeight: 600 }}>
              {flash}
            </div>
          )}

          {/* Day calendar / overview tables */}
          <main>
            {tab === "byTeacher" ? (
              <TeacherScheduleView
                teachers={teachers || []}
                catalog={catalog}
                placements={placements}
                days={days}
                onEditClass={(classId) => setEditing({ isNew: false, classId })}
                onManageTeachers={() => setTeacherMgrOpen(true)}
              />
            ) : tab === "byClass" ? (
              <ClassScheduleView
                catalog={catalog}
                placements={placements}
                days={days}
                onEditClass={(classId) => setEditing({ isNew: false, classId })}
              />
            ) : (
            <>
            <div style={{ background: "#fff", border: "1px solid #d6dad4", borderRadius: "0 10px 10px 10px", overflowX: "auto" }}>
              <div style={{ minWidth: 64 + rooms.length * 110, position: "relative" }}>
                {/* Room header row */}
                <div style={{ display: "flex", borderBottom: "2px solid #d6dad4", background: "#fafaf8" }}>
                  <div style={{ flex: "0 0 64px", width: 64, position: "sticky", left: 0, zIndex: 4, background: "#fafaf8", boxSizing: "border-box", padding: "10px 6px", fontSize: 12, fontWeight: 600, color: "#475569", textAlign: "center" }}>
                    Time
                  </div>
                  {rooms.map((r) => (
                    <div key={r.id} style={{ flex: 1, minWidth: 110, boxSizing: "border-box", padding: "8px 4px 9px", textAlign: "center", borderLeft: "1px solid #eceeea" }}>
                      <div
                        onClick={() => editRoomCap(r.id)}
                        title={`Click to change Room ${r.id}'s capacity`}
                        style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer" }}
                      >
                        <span style={{ display: "inline-block", background: "#123c3a", color: "#fff", borderRadius: 6, padding: "2px 10px", fontSize: 13 }}>
                          Room {r.id}
                        </span>
                        <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700, borderBottom: "1px dashed #b9c0bb" }}>
                          Cap {r.cap} ✎
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Time grid */}
                <div style={{ display: "flex", position: "relative" }}>
                  <div style={{ flex: "0 0 64px", width: 64, position: "sticky", left: 0, zIndex: 3, background: "#fafaf8", height: gridH, boxSizing: "border-box", borderRight: "1px solid #eceeea" }}>
                    {hourMarks.map((t) => (
                      <div key={t} style={{ position: "absolute", top: (t - gridStart) * PX_PER_MIN, right: 6, transform: "translateY(-50%)", fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>
                        {fmtTime(t)}
                      </div>
                    ))}
                  </div>
                  <div style={{ position: "absolute", left: 64, right: 0, top: 0, height: gridH, pointerEvents: "none" }}>
                    {hourMarks.map((t) => (
                      <div key={t} style={{ position: "absolute", left: 0, right: 0, top: (t - gridStart) * PX_PER_MIN, borderTop: "1px solid #eceeea" }} />
                    ))}
                    {halfMarks.map((t) => (
                      <div key={t} style={{ position: "absolute", left: 0, right: 0, top: (t - gridStart) * PX_PER_MIN, borderTop: "1px dashed #f0f2ee" }} />
                    ))}
                  </div>
                  {rooms.map((room) => {
                    const colPls = tabPls.filter((p) => p.rooms.includes(room.id));
                    const lanes = layoutLanes(colPls);
                    return (
                      <div
                        key={room.id}
                        {...colHandlers(room.id)}
                        title="Click an empty time to add a class here — or drag a card from the Class Library"
                        style={{ flex: 1, minWidth: 110, position: "relative", height: gridH, boxSizing: "border-box", borderLeft: "1px solid #eceeea" }}
                      >
                        {colPls.map((p) => renderBlock(p, lanes.get(p.id)))}
                        {ghost && ghost.rooms.includes(room.id) && (
                          <div
                            style={{
                              position: "absolute",
                              top: (ghost.start - gridStart) * PX_PER_MIN + 1,
                              height: ghost.dur * PX_PER_MIN - 2,
                              left: 2, right: 2, zIndex: 2, pointerEvents: "none", borderRadius: 8,
                              border: ghost.names.length ? "2px solid #dc2626" : "2px dashed #0d7a72",
                              background: ghost.names.length ? "rgba(220,38,38,.07)" : "rgba(13,122,114,.07)",
                              display: "flex", alignItems: "flex-start", justifyContent: "center",
                            }}
                          >
                            <span style={{ fontSize: 11, fontWeight: 700, color: ghost.names.length ? "#b91c1c" : "#0d7a72", marginTop: 3, background: "rgba(255,255,255,.85)", borderRadius: 4, padding: "1px 6px" }}>
                              {fmtRange(ghost.start, ghost.start + ghost.dur)}{ghost.names.length ? " · taken" : ""}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ padding: "8px 14px", borderTop: "1px solid #eceeea", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12, color: "#64748b" }}>
                <span>
                  {DAY_LABEL[tab]} hours: <b style={{ color: "#123c3a" }}>{fmtAmPm(winCfg[0])} – {fmtAmPm(winCfg[1])}</b>
                </span>
                <button onClick={editHours} style={{ ...miniBtn, width: "auto", padding: "0 9px" }} title="Change this day's scheduling window">
                  ✎ Edit hours
                </button>
                <span style={{ marginLeft: "auto" }}>
                  Click an empty time to add a class · drag a card's bottom edge to change its length · times snap to {SNAP} min
                </span>
              </div>
            </div>
            <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 10 }}>
              🖱 Define classes in the <b>Class Library</b>, then drag them anywhere on the day — classes can start
              at any time (no fixed slots). Place the same class on several days (drag it over a day tab to switch
              while dragging) — it stays one class with one shared enrollment. To combine classrooms, open the class
              and click several room chips — the class then appears in every combined room's column (purple ⇆ note)
              and its capacity is the rooms' total. Drag a card back into the library to unschedule it. Red border =
              two classes overlap in one room; amber = the teacher is double-booked.
              Green = room has space, amber = nearly full, red = at or over room capacity.{" "}
              {REMOTE_ENABLED ? "Everyone sees this same shared schedule." : "Data is saved in this browser."}
            </p>
            </>
            )}
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
                  .sort((a, b) => dayIdx(a.day) - dayIdx(b.day) || a.start - b.start)
                  .map((p) => ({ id: p.id, day: p.day, start: p.start, end: p.end, rooms: p.rooms }))
              : editing.room != null
                ? [{ id: null, day: editing.day, start: editing.start, end: editing.start + DEFAULT_DURATION, rooms: [editing.room] }]
                : []
          }
          days={days}
          rooms={rooms}
          teachers={teachers || []}
          defaultDay={days.includes(tab) ? tab : days[0]}
          occupiedBy={(cand) => {
            const f = placements.find(
              (x) => x.classId !== editing.classId && overlaps(x, cand) && shareRoom(x.rooms, cand.rooms)
            );
            return f ? (classOfId(f.classId)?.name || "another class") : null;
          }}
          teacherConflictsAt={(cand, teacher) =>
            teacherConflictLabels(teacherBusy(cand, teacher, { excludeClassId: editing.classId }))
          }
          contextLabel={
            editing.room != null
              ? `${DAY_LABEL[editing.day]} · ${fmtAmPm(editing.start)} · Room ${editing.room}`
              : "Class Library"
          }
          onSave={saveClass}
          onDelete={() => deleteClass(editing.classId)}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Room manager modal */}
      {roomMgrOpen && (
        <RoomModal rooms={rooms} placements={placements} onSave={saveRooms} onClose={() => setRoomMgrOpen(false)} />
      )}

      {/* Teacher manager modal */}
      {teacherMgrOpen && (
        <TeacherModal teachers={teachers || []} catalog={catalog} onSave={saveTeachers} onClose={() => setTeacherMgrOpen(false)} />
      )}

      {/* Reset confirmation */}
      {confirmReset && (
        <Overlay onClose={() => setConfirmReset(false)}>
          <h3 style={{ marginTop: 0 }}>Reset all data?</h3>
          <p style={{ fontSize: 14, color: "#475569" }}>
            This restores the original schedule from the registration sheet. All changes will be lost
            {REMOTE_ENABLED ? " — for everyone using this site" : ""}.
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
function ClassModal({ editing, cls, initialRows, days, rooms, teachers, defaultDay, occupiedBy, teacherConflictsAt, contextLabel, onSave, onDelete, onClose }) {
  const c = cls || {};
  const [name, setName] = useState(c.name || "");
  const [teacher, setTeacher] = useState(c.teacher || "");
  const [reg, setReg] = useState(c.reg ?? 0);
  const [note, setNote] = useState(c.note || "");
  const [rows, setRows] = useState(initialRows); // meeting times: {id?, day, start, end, rooms: []}

  const roomPos = new Map(rooms.map((r, i) => [r.id, i]));
  const sortRoomIds = (list) => [...list].sort((a, b) => (roomPos.get(a) ?? 99) - (roomPos.get(b) ?? 99));
  const capOf = (list) => list.reduce((s, id) => s + (rooms.find((r) => r.id === id)?.cap ?? 0), 0);

  // Taken = occupied by another class on the board, or by another row in this dialog
  const takenBy = (row, roomId, rowIdx) => {
    if (!roomId) return null;
    const other = occupiedBy({ day: row.day, start: row.start, end: row.end, rooms: [roomId] });
    if (other) return other;
    const dup = rows.some(
      (o, j) => j !== rowIdx && o.day === row.day && o.start < row.end && row.start < o.end && o.rooms.includes(roomId)
    );
    return dup ? "this class" : null;
  };
  const timeDup = (row, rowIdx) =>
    rows.some((o, j) => j !== rowIdx && o.day === row.day && o.start < row.end && row.start < o.end);

  const setRow = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => {
    const last = rows[rows.length - 1];
    setRows([...rows, { id: null, day: defaultDay, start: last ? last.start : 540, end: last ? last.end : 540 + DEFAULT_DURATION, rooms: [] }]);
  };
  const delRow = (i) => setRows(rows.filter((_, j) => j !== i));
  // Copy a meeting to every weekday — the old "Morning (Daily)" pattern in one click
  const repeatRow = (i) => {
    const r = rows[i];
    const adds = WEEKDAYS.filter(
      (d) => days.includes(d) && !rows.some((o) => o.day === d && o.start === r.start && o.end === r.end)
    ).map((d) => ({ id: null, day: d, start: r.start, end: r.end, rooms: r.rooms.slice() }));
    if (adds.length) setRows([...rows, ...adds]);
  };

  const submit = () => {
    if (!name.trim()) return;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const label = `${DAY_LABEL[r.day]} ${fmtRange(r.start, r.end)}`;
      if (r.rooms.length === 0) {
        alert("Pick at least one room for every meeting time (or remove the row).");
        return;
      }
      if (!(r.end > r.start)) {
        alert(`The end time must be after the start time (${label}).`);
        return;
      }
      if (timeDup(r, i)) {
        alert(`This class has two overlapping meetings (${label}). Adjust one of them.`);
        return;
      }
      const taken = r.rooms.map((id) => ({ id, by: takenBy(r, id, i) })).filter((x) => x.by);
      if (taken.length) {
        alert(`Room conflict: ${label} Room ${taken[0].id} already has ${taken[0].by}. Pick a different room or time.`);
        return;
      }
    }
    // Teacher overlaps are allowed, but confirm so they never slip through unnoticed
    const teacherOverlaps = teacherKey(teacher)
      ? [...new Set(rows.flatMap((r) => teacherConflictsAt({ day: r.day, start: r.start, end: r.end }, teacher)))]
      : [];
    if (teacherOverlaps.length > 0 && !window.confirm(
      `${teacher.trim()} is also teaching at the same time: ${teacherOverlaps.join(", ")}.\n\nSave anyway?`
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
          <select
            style={{ ...selStyle, width: "100%", padding: "8px 10px", fontSize: 14 }}
            value={teacher}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__new__") {
                const name = (prompt("New teacher name:") || "").trim();
                if (name && teacherKey(name)) setTeacher(name);
              } else {
                setTeacher(v);
              }
            }}
          >
            <option value="">(Teacher TBD)</option>
            {((teacher && !(teachers || []).includes(teacher)) ? [teacher, ...(teachers || [])] : (teachers || [])).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
            <option value="__new__">＋ Add new teacher…</option>
          </select>
        </Field>
        <Field label="Signed up" style={{ flex: 1, minWidth: 90 }}>
          <input style={inputStyle} type="number" min="0" value={reg} onChange={(e) => setReg(e.target.value)} />
        </Field>
      </div>
      <Field label="Note (optional)">
        <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. bring laptops" />
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
        const selTaken = r.rooms
          .map((id) => ({ id, by: takenBy(r, id, i) }))
          .filter((x) => x.by && x.by !== "this class");
        const dupHere = timeDup(r, i);
        const teacherOverlaps = teacherKey(teacher)
          ? teacherConflictsAt({ day: r.day, start: r.start, end: r.end }, teacher)
          : [];
        return (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <select
                style={{ ...selStyle, flex: "1 1 110px" }}
                value={r.day}
                onChange={(e) => setRow(i, { day: e.target.value })}
              >
                {days.map((d) => (
                  <option key={d} value={d}>{DAY_LABEL[d]}</option>
                ))}
              </select>
              <input
                type="time"
                step={SNAP * 60}
                style={{ ...selStyle, flex: "0 0 92px" }}
                value={toInput(r.start)}
                onChange={(e) => {
                  const v = fromInput(e.target.value);
                  if (v == null) return;
                  setRow(i, { start: v, end: v + (r.end - r.start) });
                }}
                title="Start time"
              />
              <span style={{ color: "#94a3b8", fontSize: 12 }}>–</span>
              <input
                type="time"
                step={SNAP * 60}
                style={{ ...selStyle, flex: "0 0 92px" }}
                value={toInput(r.end)}
                onChange={(e) => {
                  const v = fromInput(e.target.value);
                  if (v == null) return;
                  setRow(i, { end: v > r.start ? v : r.start + SNAP });
                }}
                title="End time"
              />
              <button
                style={{ ...miniBtn, width: "auto", padding: "0 8px", flexShrink: 0 }}
                onClick={() => repeatRow(i)}
                title="Copy this meeting time to every weekday (Mon–Fri) — the old daily-morning pattern"
              >
                ⇄ Mon–Fri
              </button>
              <button style={{ ...miniBtn, color: "#b91c1c", flexShrink: 0 }} onClick={() => delRow(i)} title="Remove this meeting time">✕</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginTop: 6 }}>
              <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginRight: 2 }}>Rooms</span>
              {rooms.map((rm) => {
                const on = r.rooms.includes(rm.id);
                const taken = !on ? takenBy(r, rm.id, i) : null;
                return (
                  <button
                    key={rm.id}
                    onClick={() => setRow(i, { rooms: on ? r.rooms.filter((x) => x !== rm.id) : sortRoomIds([...r.rooms, rm.id]) })}
                    disabled={!!taken}
                    title={
                      taken
                        ? `Room ${rm.id} is taken by ${taken} then`
                        : on
                          ? `Remove Room ${rm.id}`
                          : r.rooms.length
                            ? `Combine with Room ${rm.id}`
                            : `Use Room ${rm.id}`
                    }
                    style={{
                      border: "1px solid " + (on ? "#123c3a" : "#cbd5d1"),
                      background: on ? "#123c3a" : "#fff",
                      color: on ? "#fff" : taken ? "#b6bcc4" : "#334155",
                      borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 600,
                      cursor: taken ? "not-allowed" : "pointer", opacity: taken ? 0.55 : 1,
                    }}
                  >
                    {rm.id}
                  </button>
                );
              })}
              <span style={{ fontSize: 11, color: r.rooms.length ? "#64748b" : "#b45309" }}>
                {r.rooms.length === 0
                  ? "— pick a room (click two to combine)"
                  : `capacity ${capOf(r.rooms)}${r.rooms.length > 1 ? ` · Rooms ${sortRoomIds(r.rooms).join("+")} combined` : ""}`}
              </span>
            </div>
            {selTaken.length > 0 && (
              <div style={{ ...roomConflictStyle, marginTop: 5 }}>
                Room conflict: Room {selTaken[0].id} already has {selTaken[0].by} then — pick a different room or time.
              </div>
            )}
            {dupHere && (
              <div style={{ ...roomConflictStyle, marginTop: 5 }}>
                This class already has another meeting overlapping this time.
              </div>
            )}
            {teacherOverlaps.length > 0 && (
              <div
                style={{ ...teacherWarningStyle, marginTop: 5 }}
                title="Same teacher in two rooms at once — allowed, but double-check before saving"
              >
                ⚠ Teacher overlap: {teacher.trim()} also has {teacherOverlaps.join(", ")}
              </div>
            )}
          </div>
        );
      })}
      {rows.length === 0 && (
        <div style={{ fontSize: 12, color: "#b45309", marginBottom: 6 }}>
          Not scheduled — the class stays in the library sidebar (you can also drag it onto the calendar later).
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

// ───────────────────────── By-class schedule view ─────────────────────────
function ClassScheduleView({ catalog, placements, days, onEditClass }) {
  const meetingsFor = (classId, day) =>
    placements
      .filter((p) => p.classId === classId && p.day === day)
      .sort((a, b) => a.start - b.start);

  // A class's earliest meeting: [time of day, day index] — null when unscheduled
  const earliestKey = (classId) => {
    let best = null;
    placements.forEach((p) => {
      if (p.classId !== classId) return;
      const key = [p.start, dayIdx(p.day)];
      if (!best || key[0] < best[0] || (key[0] === best[0] && key[1] < best[1])) best = key;
    });
    return best;
  };

  const rows = catalog
    .slice()
    .sort((a, b) => {
      const ka = earliestKey(a.id);
      const kb = earliestKey(b.id);
      if (!ka !== !kb) return ka ? 1 : -1; // unscheduled first, same as the library
      if (!ka && !kb) return a.name.localeCompare(b.name);
      return ka[0] - kb[0] || ka[1] - kb[1] || a.name.localeCompare(b.name);
    });

  return (
    <>
      <div style={{ background: "#fff", border: "1px solid #d6dad4", borderRadius: "0 10px 10px 10px", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 180 + days.length * 118, tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 180, position: "sticky", left: 0, background: "#fafaf8", zIndex: 2 }}>Class</th>
              {days.map((d) => (
                <th key={d} style={thStyle}>{DAY_LABEL[d]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((k) => {
              const meetCount = placements.filter((p) => p.classId === k.id).length;
              const scheduled = meetCount > 0;
              return (
                <tr
                  key={k.id}
                  onClick={() => onEditClass(k.id)}
                  style={{ cursor: "pointer", background: scheduled ? "transparent" : "#fffbeb" }}
                  title="Click to edit this class"
                >
                  <td style={{ ...tdStyle, position: "sticky", left: 0, background: scheduled ? "#fafaf8" : "#fffbeb", zIndex: 1, verticalAlign: "top" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#123c3a", overflowWrap: "anywhere" }}>{k.name}</div>
                    <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
                      {k.teacher || <i style={{ color: "#b45309" }}>Teacher TBD</i>}
                      <b style={{ marginLeft: 6, color: "#123c3a" }}>{k.reg} signed up</b>
                    </div>
                    {k.note && (
                      <div style={{ fontSize: 11, color: "#7c3aed", marginTop: 2 }}>✎ {k.note}</div>
                    )}
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                      {scheduled
                        ? `meets ${meetCount}×/week`
                        : <span style={{ ...chipStyle, background: "#fef3c7", color: "#b45309" }}>unscheduled</span>}
                    </div>
                  </td>
                  {days.map((d) => {
                    const list = meetingsFor(k.id, d);
                    return (
                      <td key={d} style={{ ...tdStyle, verticalAlign: "top" }}>
                        {list.length === 0 ? (
                          <span style={{ color: "#cbd5d1", fontSize: 12 }}>—</span>
                        ) : (
                          list.map((p) => (
                            <div key={p.id} style={{ fontSize: 12, lineHeight: 1.3, padding: "2px 0", color: "#334155" }}>
                              {fmtRange(p.start, p.end)} · Rm {p.rooms.join("+")}
                            </div>
                          ))
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={days.length + 1} style={{ ...tdStyle, color: "#94a3b8", fontSize: 13 }}>
                  No classes yet — add one in the Class Library.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 10 }}>
        📋 One row per class — every meeting time and room across the week.
        Amber rows are not scheduled yet. Click a row to edit the class.
      </p>
    </>
  );
}

// ───────────────────────── By-teacher schedule view ─────────────────────────
function TeacherScheduleView({ teachers, catalog, placements, days, onEditClass, onManageTeachers }) {
  const classOfId = (id) => catalog.find((k) => k.id === id);

  const entriesFor = (key, day) =>
    placements
      .filter((p) => p.day === day)
      .map((p) => ({ p, cls: classOfId(p.classId) }))
      .filter(({ cls }) => cls && teacherKey(cls.teacher) === key)
      .sort((a, b) => a.p.start - b.p.start);

  const classCount = (key) => catalog.filter((k) => teacherKey(k.teacher) === key).length;
  const tbdHasAny = catalog.some((k) => !teacherKey(k.teacher));

  const renderCell = (list, day) => {
    const clash = (p) => list.some(({ p: o }) => o.id !== p.id && o.start < p.end && p.start < o.end);
    return (
      <td key={day} style={{ ...tdStyle, verticalAlign: "top" }}>
        {list.length === 0 ? (
          <span style={{ color: "#cbd5d1", fontSize: 12 }}>—</span>
        ) : (
          list.map(({ p, cls }) => {
            const isClash = clash(p);
            return (
              <div
                key={p.id}
                onClick={() => onEditClass(cls.id)}
                title={isClash ? "Two classes at the same time — click to edit" : "Click to edit this class"}
                style={{
                  fontSize: 12, lineHeight: 1.3, cursor: "pointer", padding: "2px 4px", borderRadius: 4,
                  background: isClash ? "#fffbeb" : "transparent",
                  color: isClash ? "#b45309" : "#334155",
                  fontWeight: isClash ? 700 : 400,
                }}
              >
                {fmtRange(p.start, p.end)} {cls.name} · Rm {p.rooms.join("+")}{isClash ? " ⚠" : ""}
              </div>
            );
          })
        )}
      </td>
    );
  };

  const renderRow = (label, key, count, highlight) => (
    <tr key={label}>
      <td style={{ ...tdStyle, position: "sticky", left: 0, background: "#fafaf8", zIndex: 1, verticalAlign: "top", whiteSpace: "nowrap" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: highlight ? "#b45309" : "#123c3a" }}>{label}</div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{count} class{count === 1 ? "" : "es"}</div>
      </td>
      {days.map((d) => renderCell(entriesFor(key, d), d))}
    </tr>
  );

  return (
    <>
      <div style={{ background: "#fff", border: "1px solid #d6dad4", borderRadius: "0 10px 10px 10px", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 130 + days.length * 130, tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 130, position: "sticky", left: 0, background: "#fafaf8", zIndex: 2 }}>Teacher</th>
              {days.map((d) => (
                <th key={d} style={thStyle}>{DAY_LABEL[d]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => renderRow(t, teacherKey(t), classCount(teacherKey(t)), false))}
            {tbdHasAny && renderRow("(Teacher TBD)", "", catalog.filter((k) => !teacherKey(k.teacher)).length, true)}
            {teachers.length === 0 && !tbdHasAny && (
              <tr>
                <td colSpan={days.length + 1} style={{ ...tdStyle, color: "#94a3b8", fontSize: 13 }}>
                  No teachers yet — assign teachers to classes, or add them here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div style={{ padding: "10px 14px", borderTop: "1px solid #eceeea" }}>
          <button onClick={onManageTeachers} style={{ ...btnGhost, color: "#123c3a", borderColor: "#cbd5d1" }}>
            Manage teachers
          </button>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 10 }}>
        👤 Each row is one teacher's week. Click any class to edit it.
        <span style={{ color: "#b45309", fontWeight: 700 }}> Amber ⚠ </span>
        marks two classes overlapping in time. <b>Manage teachers</b> renames or removes teachers —
        renames apply to all their classes; removing a teacher sets their classes to TBD.
      </p>
    </>
  );
}

// ───────────────────────── Teacher manager ─────────────────────────
function TeacherModal({ teachers, catalog, onSave, onClose }) {
  const [list, setList] = useState(teachers.map((t) => ({ orig: t, name: t })));

  const countFor = (origName) => catalog.filter((k) => teacherKey(k.teacher) === teacherKey(origName)).length;

  const remove = (i) => {
    const n = list[i].orig ? countFor(list[i].orig) : 0;
    if (n > 0 && !window.confirm(`${list[i].name} teaches ${n} class(es). Removing them sets those classes to "Teacher TBD". Continue?`)) return;
    setList(list.filter((_, j) => j !== i));
  };
  const add = () => setList([...list, { orig: null, name: "" }]);
  const edit = (i, v) => {
    const nl = [...list];
    nl[i] = { ...nl[i], name: v };
    setList(nl);
  };

  const submit = () => {
    const names = list.map((r) => r.name.trim()).filter((n) => n && teacherKey(n));
    const keys = names.map((n) => teacherKey(n));
    if (new Set(keys).size !== keys.length) {
      alert("Teacher names must be unique.");
      return;
    }
    const renames = {};
    list.forEach((r) => {
      if (r.orig && r.name.trim() && teacherKey(r.name) && r.orig !== r.name.trim()) renames[r.orig] = r.name.trim();
    });
    const removed = teachers.filter((t) => !list.some((r) => r.orig === t));
    onSave({ names: names.sort((a, b) => a.localeCompare(b)), renames, removed });
  };

  return (
    <Overlay onClose={onClose}>
      <h3 style={{ marginTop: 0 }}>Manage teachers</h3>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px" }}>
        Renaming a teacher updates every class they teach. Removing one sets their classes to "Teacher TBD".
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
        {list.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <input
              style={{ ...inputStyle, flex: 1, padding: "6px 8px" }}
              value={r.name}
              placeholder="Teacher name"
              onChange={(e) => edit(i, e.target.value)}
            />
            {r.orig && (
              <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>
                {countFor(r.orig)} cls
              </span>
            )}
            <button style={{ ...miniBtn, color: "#b91c1c" }} onClick={() => remove(i)} title="Remove teacher">✕</button>
          </div>
        ))}
        {list.length === 0 && (
          <span style={{ fontSize: 13, color: "#94a3b8" }}>No teachers — add one below.</span>
        )}
      </div>
      <button style={{ ...btnSecondary, marginTop: 10, fontSize: 13, padding: "6px 12px" }} onClick={add}>
        ＋ Add teacher
      </button>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
        <button style={btnSecondary} onClick={onClose}>Cancel</button>
        <button style={btnPrimary} onClick={submit}>Save</button>
      </div>
    </Overlay>
  );
}

// ───────────────────────── Room manager (one list for the whole week) ─────────────────────────
function RoomModal({ rooms, placements, onSave, onClose }) {
  const [list, setList] = useState(rooms.map((r) => ({ orig: r.id, name: r.id, cap: r.cap })));

  const countFor = (origName) => placements.filter((p) => p.rooms.includes(origName)).length;

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const nl = [...list];
    [nl[i], nl[j]] = [nl[j], nl[i]];
    setList(nl);
  };
  const remove = (i) => {
    const n = list[i].orig ? countFor(list[i].orig) : 0;
    if (n > 0 && !window.confirm(`Room "${list[i].name}" is used by ${n} class meeting(s). Deleting it removes it from them (a meeting left with no rooms is unscheduled). Continue?`)) return;
    setList(list.filter((_, idx) => idx !== i));
  };
  const add = () => setList([...list, { orig: null, name: "", cap: 12 }]);
  const patch = (i, p) => {
    const nl = [...list];
    nl[i] = { ...nl[i], ...p };
    setList(nl);
  };

  const submit = () => {
    const names = list.map((r) => r.name.trim()).filter(Boolean);
    if (names.length === 0) {
      alert("Keep at least one room.");
      return;
    }
    if (new Set(names).size !== names.length) {
      alert("Room names must be unique.");
      return;
    }
    const renames = {};
    list.forEach((r) => {
      if (r.orig && r.name.trim() && r.orig !== r.name.trim()) renames[r.orig] = r.name.trim();
    });
    const out = list
      .filter((r) => r.name.trim())
      .map((r) => ({ id: r.name.trim(), cap: cleanCap(r.cap, 12) }));
    onSave({ list: out, renames });
  };

  return (
    <Overlay onClose={onClose}>
      <h3 style={{ marginTop: 0 }}>Manage rooms</h3>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px" }}>
        One room list for the whole week. To combine classrooms for a class (e.g. SAT across Rooms 2+3),
        open the class and select several room chips — no special room entry is needed here. Capacity is
        room capacity; a combined class gets the rooms' total.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 76px 44px 26px 26px 26px", gap: 5, alignItems: "center", marginBottom: 5, fontSize: 11, color: "#64748b", fontWeight: 700 }}>
        <span>Room</span>
        <span>Capacity</span>
        <span>Used</span>
        <span />
        <span />
        <span />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
        {list.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 76px 44px 26px 26px 26px", gap: 5, alignItems: "center" }}>
            <input
              style={{ ...inputStyle, padding: "6px 8px" }}
              value={r.name}
              placeholder="Room name"
              onChange={(e) => patch(i, { name: e.target.value })}
            />
            <input
              style={{ ...inputStyle, padding: "6px 8px" }}
              type="number"
              min="0"
              value={r.cap}
              onChange={(e) => patch(i, { cap: e.target.value })}
            />
            {r.orig ? (
              <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>
                {countFor(r.orig)} cls
              </span>
            ) : <span />}
            <button style={miniBtn} onClick={() => move(i, -1)} title="Move up">↑</button>
            <button style={miniBtn} onClick={() => move(i, 1)} title="Move down">↓</button>
            <button style={{ ...miniBtn, color: "#b91c1c" }} onClick={() => remove(i)} title="Delete">✕</button>
          </div>
        ))}
      </div>
      <button style={{ ...btnSecondary, marginTop: 10, fontSize: 13, padding: "6px 12px" }} onClick={add}>
        ＋ Add room
      </button>
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
          width: "100%", maxWidth: wide ? 820 : 460, boxShadow: "0 20px 50px rgba(0,0,0,.25)",
          maxHeight: "calc(100vh - 48px)", overflowY: "auto", boxSizing: "border-box",
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
