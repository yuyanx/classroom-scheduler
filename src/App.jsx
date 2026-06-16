import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  STORAGE_KEY,
  createSyncRef,
  bumpLocalRevision,
  markRevisionSaved,
  canApplyRemotePoll,
  saveToLocalStorage,
} from "./scheduleService.js";
import {
  PLAN_KIND,
  PLAN_VERSION,
  kindLabel,
  defaultPlanName,
  defaultRestoredPlanName,
  unpackRowData,
  packRowData,
  planRowToMeta,
  resolvePlanKind,
  isPlanReadOnly,
  isProtectedPlan,
  getActivePlanId,
  setActivePlanId as storeActivePlanId,
  readScheduleCache,
  writeScheduleCache,
  clearScheduleCache,
  ensureLocalPlanStore,
  loadLocalPlanStore,
  saveLocalPlanStore,
  listPlansFromLocalStore,
  getLocalPlanRow,
  upsertLocalPlan,
  createLocalPlanEntry,
  renameInLocalStore,
  deleteFromLocalStore,
  pickFallbackPlanId,
  createRemotePlanApi,
} from "./planService.js";
import {
  teacherKey,
  overlaps,
  buildScheduleIndexes,
  maxEndForPlacement,
  roomConflictsIndexed,
  teacherBusyIndexed,
  evaluatePlacement,
  freeRoomsAt as lookupFreeRooms,
  buildConflictReport,
  computeTabBlockMeta,
  dataSignature,
  layoutLanes,
  formatDayRange,
  classScheduleLines,
  classScheduleGroups,
  sortCatalogForByClassView,
  overviewPillStyle,
  overviewRoomLabel,
  roomOverviewColor,
  primaryRoomForPlacement,
  computeWeekOverviewLayout,
} from "./domain/scheduleLogic.ts";

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
const PX_PER_MIN = 1.25;     // vertical scale of the day grid (matches By Class card height)
const DEFAULT_DURATION = 90; // minutes — for new classes / library drops

// Times are minutes since midnight. Display follows the school's 12-hour style.
const fmtTime = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`;
};
const fmtAmPm = (min) => `${fmtTime(min)} ${min < 720 ? "AM" : "PM"}`;
const fmtRange = (s, e) => `${fmtTime(s)}–${fmtTime(e)}`;
const fmtRangeAmPm = (s, e) => {
  const startAm = s < 720;
  const endAm = e <= 720 ? e < 720 : false;
  if (startAm === endAm) return `${fmtTime(s)}–${fmtTime(e)} ${startAm ? "AM" : "PM"}`;
  return `${fmtAmPm(s)}–${fmtAmPm(e)}`;
};
const DAY_ROOM_MIN_W = 148;
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

// Production snapshot from Supabase (live site 2026-06-12). Used for localhost dev + Reset Data.
const LIVE_V1_SEED = {
  "rooms": {
    "morning": [
      "1",
      "2+3",
      "4",
      "5",
      "6",
      "7",
      "8"
    ],
    "afternoon": [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8"
    ]
  },
  "slots": {
    "fri": [
      "12:30–2:00",
      "2:00–3:30",
      "3:30–5:00"
    ],
    "mon": [
      "12:30–2:00",
      "2:00–3:30",
      "3:30–5:00"
    ],
    "thu": [
      "12:30–2:00",
      "2:00–3:30",
      "3:30–5:00"
    ],
    "tue": [
      "12:30–2:00",
      "2:00–3:30",
      "3:30–5:00"
    ],
    "wed": [
      "12:30–2:00",
      "2:00–3:30",
      "3:30–5:00"
    ],
    "morning": [
      "9:00–10:30",
      "10:30–12:00"
    ]
  },
  "nextId": 123,
  "catalog": [
    {
      "id": "k1",
      "reg": 22,
      "name": "SAT ELA",
      "note": "",
      "teacher": "Joshua"
    },
    {
      "id": "k5",
      "reg": 10,
      "name": "Alg2",
      "note": "",
      "teacher": "Linda"
    },
    {
      "id": "k7",
      "reg": 7,
      "name": "Geo",
      "note": "",
      "teacher": "James"
    },
    {
      "id": "k9",
      "reg": 6,
      "name": "5/6th Math",
      "note": "",
      "teacher": "Thomas"
    },
    {
      "id": "k11",
      "reg": 9,
      "name": "G7/8 ELA",
      "note": "",
      "teacher": "Matthew M"
    },
    {
      "id": "k13",
      "reg": 23,
      "name": "SAT Math",
      "note": "",
      "teacher": "Herrick"
    },
    {
      "id": "k15",
      "reg": 12,
      "name": "PSAT",
      "note": "",
      "teacher": "Joshua"
    },
    {
      "id": "k17",
      "reg": 7,
      "name": "PSAT",
      "note": "",
      "teacher": "Daniel"
    },
    {
      "id": "k19",
      "reg": 6,
      "name": "5/6th ELA",
      "note": "",
      "teacher": "Rebecca"
    },
    {
      "id": "k21",
      "reg": 3,
      "name": "G7 Math",
      "note": "",
      "teacher": "Thomas"
    },
    {
      "id": "k23",
      "reg": 7,
      "name": "G8 Math",
      "note": "",
      "teacher": "Linda"
    },
    {
      "id": "k25",
      "reg": 9,
      "name": "SAT ELA Afternoon",
      "note": "",
      "teacher": "Joshua"
    },
    {
      "id": "k27",
      "reg": 4,
      "name": "HS English",
      "note": "",
      "teacher": "Matt C"
    },
    {
      "id": "k29",
      "reg": 2,
      "name": "NYT G3-5",
      "note": "",
      "teacher": "Rebecca"
    },
    {
      "id": "k41",
      "reg": 3,
      "name": "Debate",
      "note": "",
      "teacher": "Rebecca"
    },
    {
      "id": "k47",
      "reg": 1,
      "name": "Earth Science",
      "note": "",
      "teacher": "Linda"
    },
    {
      "id": "k49",
      "reg": 2,
      "name": "Pre-Calc",
      "note": "",
      "teacher": "Reuben"
    },
    {
      "id": "k51",
      "reg": 2,
      "name": "SAT Math Afternoon",
      "note": "",
      "teacher": "Herrick"
    },
    {
      "id": "k53",
      "reg": 4,
      "name": "Python",
      "note": "",
      "teacher": "AN"
    },
    {
      "id": "k55",
      "reg": 5,
      "name": "Scholastic Writing",
      "note": "",
      "teacher": "Joshua"
    },
    {
      "id": "k69",
      "reg": 3,
      "name": "AMC 10",
      "note": "",
      "teacher": "James"
    },
    {
      "id": "k108",
      "reg": 2,
      "name": "Biology",
      "note": "",
      "teacher": "Linda"
    },
    {
      "id": "k111",
      "reg": 2,
      "name": "NYT G6-8",
      "note": "",
      "teacher": "Rebecca"
    },
    {
      "id": "k117",
      "reg": 2,
      "name": "Geo Afternoon",
      "note": "",
      "teacher": "Thomas"
    }
  ],
  "roomCaps": {
    "morning": {
      "1": 3,
      "4": 9,
      "5": 9,
      "6": 12,
      "7": 15,
      "8": 10,
      "2+3": 24
    },
    "afternoon": {
      "1": 3,
      "2": 12,
      "3": 12,
      "4": 9,
      "5": 9,
      "6": 12,
      "7": 15,
      "8": 10
    }
  },
  "teachers": [
    "AN",
    "Daniel",
    "Herrick",
    "James",
    "Joshua",
    "Linda",
    "Matt C",
    "Matthew M",
    "Rebecca",
    "Reuben",
    "Thomas"
  ],
  "placements": [
    {
      "id": "p12",
      "room": "8",
      "classId": "k11",
      "section": "morning",
      "slotIdx": 0
    },
    {
      "id": "p16",
      "room": "7",
      "classId": "k15",
      "section": "morning",
      "slotIdx": 1
    },
    {
      "id": "p18",
      "room": "6",
      "classId": "k17",
      "section": "morning",
      "slotIdx": 1
    },
    {
      "id": "p20",
      "room": "5",
      "classId": "k19",
      "section": "morning",
      "slotIdx": 1
    },
    {
      "id": "p22",
      "room": "4",
      "classId": "k21",
      "section": "morning",
      "slotIdx": 1
    },
    {
      "id": "p10",
      "room": "5",
      "classId": "k9",
      "section": "morning",
      "slotIdx": 0
    },
    {
      "id": "p26",
      "room": "7",
      "classId": "k25",
      "section": "mon",
      "slotIdx": 0
    },
    {
      "id": "p99",
      "room": "7",
      "classId": "k25",
      "section": "tue",
      "slotIdx": 0
    },
    {
      "id": "p100",
      "room": "7",
      "classId": "k25",
      "section": "wed",
      "slotIdx": 0
    },
    {
      "id": "p101",
      "room": "7",
      "classId": "k25",
      "section": "thu",
      "slotIdx": 0
    },
    {
      "id": "p102",
      "room": "7",
      "classId": "k25",
      "section": "fri",
      "slotIdx": 0
    },
    {
      "id": "p98",
      "room": "2",
      "classId": "k69",
      "section": "mon",
      "slotIdx": 0
    },
    {
      "id": "p70",
      "room": "2",
      "classId": "k69",
      "section": "wed",
      "slotIdx": 0
    },
    {
      "id": "p24",
      "room": "8",
      "classId": "k23",
      "section": "morning",
      "slotIdx": 1
    },
    {
      "id": "p42",
      "room": "5",
      "classId": "k41",
      "section": "mon",
      "slotIdx": 1
    },
    {
      "id": "p71",
      "room": "5",
      "classId": "k41",
      "section": "wed",
      "slotIdx": 1
    },
    {
      "id": "p103",
      "room": "7",
      "classId": "k51",
      "section": "mon",
      "slotIdx": 1
    },
    {
      "id": "p52",
      "room": "7",
      "classId": "k51",
      "section": "tue",
      "slotIdx": 1
    },
    {
      "id": "p66",
      "room": "7",
      "classId": "k51",
      "section": "wed",
      "slotIdx": 1
    },
    {
      "id": "p77",
      "room": "7",
      "classId": "k51",
      "section": "thu",
      "slotIdx": 1
    },
    {
      "id": "p104",
      "room": "7",
      "classId": "k51",
      "section": "fri",
      "slotIdx": 1
    },
    {
      "id": "p54",
      "room": "6",
      "classId": "k53",
      "section": "tue",
      "slotIdx": 0
    },
    {
      "id": "p78",
      "room": "6",
      "classId": "k53",
      "section": "thu",
      "slotIdx": 0
    },
    {
      "id": "p2",
      "room": "2+3",
      "classId": "k1",
      "section": "morning",
      "slotIdx": 0
    },
    {
      "id": "p30",
      "room": "6",
      "classId": "k29",
      "section": "mon",
      "slotIdx": 0
    },
    {
      "id": "p80",
      "room": "6",
      "classId": "k29",
      "section": "wed",
      "slotIdx": 0
    },
    {
      "id": "p112",
      "room": "1",
      "classId": "k111",
      "section": "tue",
      "slotIdx": 1
    },
    {
      "id": "p113",
      "room": "1",
      "classId": "k111",
      "section": "thu",
      "slotIdx": 1
    },
    {
      "id": "p109",
      "room": "2",
      "classId": "k108",
      "section": "mon",
      "slotIdx": 1
    },
    {
      "id": "p110",
      "room": "2",
      "classId": "k108",
      "section": "wed",
      "slotIdx": 1
    },
    {
      "id": "p50",
      "room": "1",
      "classId": "k49",
      "section": "mon",
      "slotIdx": 0
    },
    {
      "id": "p76",
      "room": "1",
      "classId": "k49",
      "section": "tue",
      "slotIdx": 0
    },
    {
      "id": "p105",
      "room": "1",
      "classId": "k49",
      "section": "wed",
      "slotIdx": 0
    },
    {
      "id": "p106",
      "room": "1",
      "classId": "k49",
      "section": "thu",
      "slotIdx": 0
    },
    {
      "id": "p107",
      "room": "1",
      "classId": "k49",
      "section": "fri",
      "slotIdx": 0
    },
    {
      "id": "p48",
      "room": "5",
      "classId": "k47",
      "section": "tue",
      "slotIdx": 1
    },
    {
      "id": "p75",
      "room": "5",
      "classId": "k47",
      "section": "thu",
      "slotIdx": 1
    },
    {
      "id": "p56",
      "room": "4",
      "classId": "k55",
      "section": "tue",
      "slotIdx": 1
    },
    {
      "id": "p79",
      "room": "4",
      "classId": "k55",
      "section": "thu",
      "slotIdx": 1
    },
    {
      "id": "p8",
      "room": "6",
      "classId": "k7",
      "section": "morning",
      "slotIdx": 0
    },
    {
      "id": "p6",
      "room": "7",
      "classId": "k5",
      "section": "morning",
      "slotIdx": 0
    },
    {
      "id": "p14",
      "room": "2+3",
      "classId": "k13",
      "section": "morning",
      "slotIdx": 1
    },
    {
      "id": "p118",
      "room": "3",
      "classId": "k117",
      "section": "mon",
      "slotIdx": 1
    },
    {
      "id": "p119",
      "room": "3",
      "classId": "k117",
      "section": "tue",
      "slotIdx": 1
    },
    {
      "id": "p120",
      "room": "3",
      "classId": "k117",
      "section": "wed",
      "slotIdx": 1
    },
    {
      "id": "p121",
      "room": "3",
      "classId": "k117",
      "section": "thu",
      "slotIdx": 1
    },
    {
      "id": "p122",
      "room": "3",
      "classId": "k117",
      "section": "fri",
      "slotIdx": 1
    },
    {
      "id": "p28",
      "room": "3",
      "classId": "k27",
      "section": "mon",
      "slotIdx": 0
    },
    {
      "id": "p94",
      "room": "3",
      "classId": "k27",
      "section": "tue",
      "slotIdx": 0
    },
    {
      "id": "p95",
      "room": "3",
      "classId": "k27",
      "section": "wed",
      "slotIdx": 0
    },
    {
      "id": "p96",
      "room": "3",
      "classId": "k27",
      "section": "thu",
      "slotIdx": 0
    },
    {
      "id": "p97",
      "room": "3",
      "classId": "k27",
      "section": "fri",
      "slotIdx": 0
    }
  ]
};
const LIVE_SEED_TAG = "prod-2026-06-12T21:23";

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
const DEFAULT_PROGRAM_LABEL = "2026 Summer · Jericho";

const cleanProgramLabel = (s) => {
  const t = String(s ?? "").trim();
  return t || DEFAULT_PROGRAM_LABEL;
};

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

  return {
    version: 2,
    days,
    hours,
    rooms,
    catalog,
    placements,
    teachers,
    programLabel: cleanProgramLabel(raw.programLabel),
    nextId: raw.nextId || 1000,
  };
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

const defaultData = () => migrateV1toV2(JSON.parse(JSON.stringify(LIVE_V1_SEED)));

/** Non-default plans: wipe placements and zero enrollment; keep catalog names/teachers/rooms. */
function clearScheduleAndCounts(data) {
  return {
    ...data,
    catalog: (data.catalog || []).map((k) => ({ ...k, reg: 0 })),
    placements: [],
  };
}

// ───────────────────────── Shared storage (Supabase) ─────────────────────────
// One shared schedule for everyone. The anon key is designed to be public; what
// it can do is limited by the table's RLS policies. Empty key = browser-only mode.
// Local dev (localhost) also runs browser-only so experiments never touch the
// live shared schedule.
const SUPABASE_URL = "https://zbvedbwbxdzcsnftvyph.supabase.co";
const SUPABASE_KEY = "sb_publishable_cDEmeJDF7lwuafg8ZYKF4Q_Sl_fUSTE";
// Legacy alias; Vercel production hostname can change — prefer VERCEL_ENV at build time.
const PRODUCTION_HOST = "classroom-scheduler-ruddy.vercel.app";
// Inlined at build time via scripts/build.mjs (--define process.env.VERCEL_ENV).
const VERCEL_ENV = process.env.VERCEL_ENV || "";

const isLocalDevHost = (hostname) => /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(hostname || "");
// Branch preview URLs always contain "-git-" (e.g. project-git-feature-x-team.vercel.app).
// Runtime check — must win over a mistaken VERCEL_ENV=production in the bundle.
const isVercelGitPreviewHost = (hostname) => {
  const h = hostname || "";
  return /\.vercel\.app$/i.test(h) && /-git-/i.test(h);
};
// Preview = branch deploys (-git-) or explicit VERCEL_ENV=preview only.
// Production deployment URLs (hash-team.vercel.app) must sync even when the
// committed bundle has an empty VERCEL_ENV (local esbuild default).
const isPreviewHost = (hostname, vercelEnv = VERCEL_ENV) => {
  if (isVercelGitPreviewHost(hostname)) return true;
  if (vercelEnv === "preview") return true;
  return false;
};

const isRemoteSyncEnabled = (hostname, vercelEnv = VERCEL_ENV) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  if (isLocalDevHost(hostname)) return false;
  if (isPreviewHost(hostname, vercelEnv)) return false;
  return true;
};

const IS_LOCAL_DEV = typeof window !== "undefined" && isLocalDevHost(window.location.hostname);
const IS_PREVIEW_DEPLOY = typeof window !== "undefined" && isPreviewHost(window.location.hostname);
const REMOTE_ENABLED =
  typeof window !== "undefined" ? isRemoteSyncEnabled(window.location.hostname) : false;
const REMOTE_POLL_MS = 30000;

const sbHeaders = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
});

const planApi = createRemotePlanApi({
  url: SUPABASE_URL,
  key: SUPABASE_KEY,
  sbHeaders,
});

function scheduleFromRowData(data) {
  return upgrade(unpackRowData(data).schedule);
}

function planMetaFromRow(row) {
  const u = unpackRowData(row.data);
  return {
    name: u.name || (row.id === 1 ? "Main schedule" : `Plan ${row.id}`),
    kind: resolvePlanKind(row.id, u),
    createdAt: u.createdAt || null,
  };
}

function planMetaFromLocalRow(row) {
  const u = unpackRowData(row.data);
  return {
    name: row.name || u.name || `Plan ${row.id}`,
    kind: resolvePlanKind(row.id, u),
    createdAt: row.createdAt || u.createdAt || null,
  };
}

const loadData = () => {
  try {
    if (IS_LOCAL_DEV) {
      const tag = window.localStorage.getItem("premier-live-seed-tag");
      if (tag !== LIVE_SEED_TAG) {
        const seeded = upgrade(JSON.parse(JSON.stringify(LIVE_V1_SEED)));
        window.localStorage.setItem("premier-live-seed-tag", LIVE_SEED_TAG);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
        return seeded;
      }
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return upgrade(JSON.parse(raw));
  } catch (e) { /* fall through */ }
  return defaultData();
};

const saveData = (data) => saveToLocalStorage(data);

let _emptyDragImg;
function emptyDragImage() {
  if (typeof Image === "undefined") return null;
  if (!_emptyDragImg) {
    _emptyDragImg = new Image();
    _emptyDragImg.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  }
  return _emptyDragImg;
}

// ───────────────────────── Main component ─────────────────────────
export default function ClassroomScheduler() {
  const initialPlanId = typeof window !== "undefined" ? getActivePlanId() : 1;
  const initialCached = typeof window !== "undefined" && !REMOTE_ENABLED
    ? readScheduleCache(initialPlanId)
    : null;
  const [activePlanId, setActivePlanId] = useState(initialPlanId);
  const [plans, setPlans] = useState([]);
  const [planMeta, setPlanMeta] = useState({ name: "Main schedule", kind: PLAN_KIND.LIVE, createdAt: null });
  const [planMenuOpen, setPlanMenuOpen] = useState(false);
  const [planDialog, setPlanDialog] = useState(null); // { mode, name, copyFromCurrent? }
  const [plansReady, setPlansReady] = useState(!REMOTE_ENABLED);
  const [data, setData] = useState(() => (initialCached ? upgrade(initialCached) : loadData()));
  const [saveStatus, setSaveStatus] = useState({
    ok: true,
    lastSavedAt: null,
    error: "",
    label: "Checking save...",
  });
  const [tab, setTab] = useState("mon");
  const [editing, setEditing] = useState(null); // {isNew, classId?, placementId?, day?, start?, room?}
  const [roomMgrOpen, setRoomMgrOpen] = useState(false);
  const [roomCapEditing, setRoomCapEditing] = useState(null); // { roomId, value, error }
  const [hoursEditing, setHoursEditing] = useState(null); // { day, start, end, error }
  const [teacherMgrOpen, setTeacherMgrOpen] = useState(false);
  const [programLabelOpen, setProgramLabelOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [drag, setDrag] = useState(null); // {type:'lib'|'pl', id, dur, grabOffset}
  const [dragOver, setDragOver] = useState(null); // "tray" | null
  const [ghost, setGhost] = useState(null); // {room, start, dur, names: []}
  const ghostRef = useRef(null);
  const ghostPendingRef = useRef(null);
  const ghostRafRef = useRef(0);
  const [resize, setResize] = useState(null); // {plId, end}
  const resizeRafRef = useRef(0);
  const resizePendingRef = useRef(null);
  const localSaveTimer = useRef(null);
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
  const [conflictPanelOpen, setConflictPanelOpen] = useState(false);
  const [undoToast, setUndoToast] = useState(null);
  const undoSnapshot = useRef(null);
  const undoTimer = useRef(null);

  const remoteRef = useRef(createSyncRef());
  const dataRef = useRef(data);
  dataRef.current = data; // latest data for retries and the tab-close flush
  const activePlanIdRef = useRef(activePlanId);
  activePlanIdRef.current = activePlanId;
  const planMetaRef = useRef(planMeta);
  planMetaRef.current = planMeta;
  const plansRef = useRef(plans);
  plansRef.current = plans;
  const planReadOnly = isPlanReadOnly(planMeta.kind);

  const scheduleGhost = useCallback((next) => {
    ghostPendingRef.current = next;
    if (ghostRafRef.current) return;
    ghostRafRef.current = requestAnimationFrame(() => {
      ghostRafRef.current = 0;
      setGhost(ghostPendingRef.current);
      ghostPendingRef.current = null;
    });
  }, []);

  const scheduleResizePreview = useCallback((plId, end) => {
    resizePendingRef.current = { plId, end };
    if (resizeRafRef.current) return;
    resizeRafRef.current = requestAnimationFrame(() => {
      resizeRafRef.current = 0;
      const r = resizePendingRef.current;
      if (r) setResize(r);
    });
  }, []);

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

  const flushLocalSave = useCallback((payload) => {
    clearTimeout(localSaveTimer.current);
    localSaveTimer.current = null;
    return saveData(payload);
  }, []);

  const queueLocalSave = useCallback((payload) => {
    clearTimeout(localSaveTimer.current);
    localSaveTimer.current = setTimeout(() => {
      localSaveTimer.current = null;
      updateSaveStatus(saveData(payload));
    }, 200);
  }, [updateSaveStatus]);

  const setStatus = (ok, label, error = "") =>
    setSaveStatus({ ok, lastSavedAt: ok ? new Date() : null, error, label });

  const writeActivePlanCache = useCallback((planId, payload, meta) => {
    writeScheduleCache(planId, payload);
    if (!REMOTE_ENABLED) {
      let store = loadLocalPlanStore();
      if (store) {
        const packed = packRowData(payload, meta);
        store = upsertLocalPlan(store, planId, packed, meta);
        saveLocalPlanStore(store);
        setPlans(listPlansFromLocalStore(store));
      }
    }
    return saveData(payload);
  }, []);

  const flushRemoteSave = useCallback(async (payload) => {
    if (!REMOTE_ENABLED || isPlanReadOnly(planMetaRef.current.kind)) return;
    const planId = activePlanIdRef.current;
    const packed = packRowData(payload, planMetaRef.current);
    remoteRef.current.pendingSave = true;
    try {
      const ts = await planApi.remoteSavePlan(planId, packed);
      remoteRef.current.lastSyncedAt = ts || new Date().toISOString();
      remoteRef.current.pendingSave = false;
      remoteRef.current.lastSaveFailed = false;
      markRevisionSaved(remoteRef.current);
      clearTimeout(remoteRef.current.retryTimer);
      writeScheduleCache(planId, payload);
      setStatus(true, `Saved “${planMetaRef.current.name}” for everyone at ${timeLabel()}`);
    } catch (e) {
      remoteRef.current.pendingSave = false;
      remoteRef.current.lastSaveFailed = true;
      setStatus(false, "Not saved", e?.message || "Network error");
      clearTimeout(remoteRef.current.retryTimer);
      remoteRef.current.retryTimer = setTimeout(() => {
        if (!remoteRef.current.pendingSave) flushRemoteSave(dataRef.current);
      }, 5000);
    }
  }, []);

  const scheduleUndo = useCallback((prev) => {
    clearTimeout(undoTimer.current);
    undoSnapshot.current = prev;
    setUndoToast({ label: "Change saved" });
    undoTimer.current = setTimeout(() => {
      undoSnapshot.current = null;
      setUndoToast(null);
    }, 8000);
  }, []);

  const applyData = useCallback((next, { skipUndo = false, skipRevision = false } = {}) => {
    const prev = dataRef.current;
    if (!next || next === prev) return;
    if (!skipUndo) scheduleUndo(prev);
    if (!skipRevision) bumpLocalRevision(remoteRef.current);
    setData(next);
    dataRef.current = next;
    const planId = activePlanIdRef.current;
    const meta = planMetaRef.current;
    if (!REMOTE_ENABLED) {
      clearTimeout(localSaveTimer.current);
      localSaveTimer.current = setTimeout(() => {
        localSaveTimer.current = null;
        updateSaveStatus(writeActivePlanCache(planId, next, meta));
      }, 200);
      return;
    }
    writeScheduleCache(planId, next);
    queueLocalSave(next);
    if (isPlanReadOnly(meta.kind)) return;
    setSaveStatus((s) => ({ ...s, ok: true, error: "", label: "Saving…" }));
    remoteRef.current.pendingSave = true;
    clearTimeout(remoteRef.current.timer);
    remoteRef.current.timer = setTimeout(() => flushRemoteSave(next), 600);
  }, [queueLocalSave, scheduleUndo, updateSaveStatus, writeActivePlanCache, flushRemoteSave]);

  const persist = useCallback((nextOrMutator, opts = {}) => {
    if (isPlanReadOnly(planMetaRef.current.kind) && !opts.force) return;
    const prev = dataRef.current;
    const next = typeof nextOrMutator === "function" ? nextOrMutator(prev) : nextOrMutator;
    applyData(next, opts);
  }, [applyData]);

  const undoLast = useCallback(() => {
    const snap = undoSnapshot.current;
    if (!snap) return;
    clearTimeout(undoTimer.current);
    undoSnapshot.current = null;
    setUndoToast(null);
    applyData(snap, { skipUndo: true });
  }, [applyData]);

  const offlineSaveLabel = () => {
    const now = new Date();
    if (IS_PREVIEW_DEPLOY) return "Preview — not syncing to shared schedule";
    if (IS_LOCAL_DEV) return "Local dev — not syncing to shared schedule";
    return `Saved to this browser at ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  };

  const loadPlanIntoState = useCallback((planId, next, meta, updatedAt) => {
    storeActivePlanId(planId);
    setActivePlanId(planId);
    setPlanMeta(meta);
    dataRef.current = next;
    setData(next);
    writeScheduleCache(planId, next);
    flushLocalSave(next);
    if (updatedAt) remoteRef.current.lastSyncedAt = updatedAt;
    markRevisionSaved(remoteRef.current);
  }, [flushLocalSave]);

  const saveCurrentPlanSnapshot = useCallback(async () => {
    const planId = activePlanIdRef.current;
    const payload = dataRef.current;
    const meta = planMetaRef.current;
    if (isPlanReadOnly(meta.kind)) return;
    writeScheduleCache(planId, payload);
    if (!REMOTE_ENABLED) {
      writeActivePlanCache(planId, payload, meta);
      return;
    }
    clearTimeout(remoteRef.current.timer);
    remoteRef.current.timer = null;
    await flushRemoteSave(payload);
  }, [flushRemoteSave, writeActivePlanCache]);

  const switchPlan = useCallback(async (planId, { skipSave = false } = {}) => {
    if (planId === activePlanIdRef.current) {
      setPlanMenuOpen(false);
      return;
    }
    setPlanMenuOpen(false);
    setSaveStatus((s) => ({ ...s, label: "Switching plan…" }));
    try {
      if (!skipSave) await saveCurrentPlanSnapshot();
      let next;
      let meta;
      let updatedAt = null;
      if (REMOTE_ENABLED) {
        const row = await planApi.remoteLoadPlan(planId);
        if (!row) throw new Error(`Plan ${planId} not found`);
        next = scheduleFromRowData(row.data);
        meta = planMetaFromRow(row);
        updatedAt = row.updated_at;
      } else {
        const store = loadLocalPlanStore();
        const row = getLocalPlanRow(store, planId);
        if (!row) throw new Error(`Plan ${planId} not found`);
        const cached = readScheduleCache(planId);
        next = cached ? upgrade(cached) : scheduleFromRowData(row.data);
        meta = planMetaFromLocalRow(row);
      }
      loadPlanIntoState(planId, next, meta, updatedAt);
      const readOnly = isPlanReadOnly(meta.kind);
      setStatus(
        true,
        readOnly
          ? `Viewing archive “${meta.name}” (read-only)`
          : REMOTE_ENABLED
            ? `Switched to “${meta.name}”`
            : offlineSaveLabel()
      );
    } catch (e) {
      setStatus(false, "Could not switch plan", e?.message || "");
    }
  }, [loadPlanIntoState, saveCurrentPlanSnapshot]);

  const createNewPlan = useCallback(async ({ name, copyFromCurrent, schedule: scheduleIn }) => {
    const schedule = scheduleIn
      ? JSON.parse(JSON.stringify(scheduleIn))
      : copyFromCurrent
        ? JSON.parse(JSON.stringify(dataRef.current))
        : defaultData();
    const meta = {
      name: String(name || "").trim() || defaultPlanName(PLAN_KIND.PLAN),
      kind: PLAN_KIND.PLAN,
      createdAt: new Date().toISOString(),
    };
    const packed = packRowData(schedule, meta);
    try {
      if (REMOTE_ENABLED) {
        const id = await planApi.remoteCreatePlan(packed);
        const list = await planApi.remoteListPlans();
        setPlans(list);
        setPlanDialog(null);
        await switchPlan(id);
        return id;
      }
      let store = loadLocalPlanStore() || ensureLocalPlanStore(dataRef.current, planMetaRef.current.name);
      const created = createLocalPlanEntry(store, {
        name: meta.name,
        kind: meta.kind,
        schedule,
        createdAt: meta.createdAt,
      });
      saveLocalPlanStore(created.store);
      setPlans(listPlansFromLocalStore(created.store));
      setPlanDialog(null);
      await switchPlan(created.id);
      return created.id;
    } catch (e) {
      setStatus(false, "Could not create plan", e?.message || "");
      return null;
    }
  }, [switchPlan]);

  const restoreFromArchive = useCallback(async (name) => {
    const sourceName = planMetaRef.current.name;
    const restoredName = String(name || "").trim() || defaultRestoredPlanName(sourceName);
    await createNewPlan({
      name: restoredName,
      copyFromCurrent: false,
      schedule: dataRef.current,
    });
  }, [createNewPlan]);

  const deletePlanById = useCallback(async (planId) => {
    const list = plansRef.current;
    if (list.length <= 1) {
      setStatus(false, "Cannot delete", "At least one plan must remain.");
      return;
    }
    const target = list.find((p) => p.id === planId);
    if (!target) return;
    if (isProtectedPlan(target)) {
      setStatus(false, "Cannot delete", "The default schedule cannot be deleted.");
      setPlanDialog(null);
      return;
    }
    const fallbackId = pickFallbackPlanId(list, planId);
    if (!fallbackId) return;
    setPlanMenuOpen(false);
    try {
      const deletingActive = activePlanIdRef.current === planId;
      if (deletingActive) await switchPlan(fallbackId, { skipSave: true });
      if (REMOTE_ENABLED) {
        await planApi.remoteDeletePlan(planId);
        const nextList = await planApi.remoteListPlans();
        setPlans(nextList);
      } else {
        let store = loadLocalPlanStore();
        if (!store) throw new Error("No local plan store");
        store = deleteFromLocalStore(store, planId);
        saveLocalPlanStore(store);
        setPlans(listPlansFromLocalStore(store));
      }
      clearScheduleCache(planId);
      setPlanDialog(null);
      setStatus(true, `Deleted “${target.name}”`);
    } catch (e) {
      setStatus(false, "Could not delete plan", e?.message || "");
    }
  }, [switchPlan]);

  const saveArchiveCopy = useCallback(async (name) => {
    const schedule = JSON.parse(JSON.stringify(dataRef.current));
    const meta = {
      name: String(name || "").trim() || defaultPlanName(PLAN_KIND.ARCHIVE),
      kind: PLAN_KIND.ARCHIVE,
      createdAt: new Date().toISOString(),
    };
    const packed = packRowData(schedule, meta);
    try {
      if (REMOTE_ENABLED) {
        const id = await planApi.remoteCreatePlan(packed);
        const list = await planApi.remoteListPlans();
        setPlans(list);
        setPlanDialog(null);
        setStatus(true, `Archive “${meta.name}” saved — switch to it from the plan menu`);
        return id;
      }
      let store = loadLocalPlanStore() || ensureLocalPlanStore(dataRef.current, planMetaRef.current.name);
      const created = createLocalPlanEntry(store, {
        name: meta.name,
        kind: meta.kind,
        schedule,
        createdAt: meta.createdAt,
      });
      saveLocalPlanStore(created.store);
      setPlans(listPlansFromLocalStore(created.store));
      setPlanDialog(null);
      setStatus(true, `Archive “${meta.name}” saved locally`);
      return created.id;
    } catch (e) {
      setStatus(false, "Could not save archive", e?.message || "");
      return null;
    }
  }, []);

  const renameActivePlan = useCallback(async (name) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return;
    const planId = activePlanIdRef.current;
    const meta = { ...planMetaRef.current, name: trimmed };
    const packed = packRowData(dataRef.current, meta);
    try {
      if (REMOTE_ENABLED) {
        await planApi.remoteSavePlan(planId, packed);
        const list = await planApi.remoteListPlans();
        setPlans(list.map((p) => (p.id === planId ? { ...p, name: trimmed } : p)));
      } else {
        let store = loadLocalPlanStore();
        if (store) {
          store = renameInLocalStore(store, planId, trimmed);
          saveLocalPlanStore(store);
          setPlans(listPlansFromLocalStore(store));
        }
      }
      setPlanMeta(meta);
      setPlanDialog(null);
      setStatus(true, `Renamed to “${trimmed}”`);
    } catch (e) {
      setStatus(false, "Could not rename plan", e?.message || "");
    }
  }, []);

  const submitPlanDialog = () => {
    if (!planDialog) return;
    if (planDialog.mode === "new") {
      createNewPlan({ name: planDialog.name, copyFromCurrent: planDialog.copyFromCurrent !== false });
      return;
    }
    if (planDialog.mode === "archive") {
      saveArchiveCopy(planDialog.name);
      return;
    }
    if (planDialog.mode === "rename") {
      renameActivePlan(planDialog.name);
      return;
    }
    if (planDialog.mode === "restore") {
      restoreFromArchive(planDialog.name);
      return;
    }
    if (planDialog.mode === "delete") {
      deletePlanById(planDialog.planId);
    }
  };

  const canDeletePlans = plans.length > 1;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (REMOTE_ENABLED) {
          setSaveStatus((s) => ({ ...s, label: "Loading plans…" }));
          const list = await planApi.remoteListPlans();
          if (cancelled) return;
          setPlans(list.length ? list : [{ id: 1, name: "Main schedule", kind: PLAN_KIND.LIVE, updated_at: null, planVersion: 2 }]);
          let planId = getActivePlanId();
          if (list.length && !list.some((p) => p.id === planId)) planId = list[0].id;
          const row = await planApi.remoteLoadPlan(planId);
          if (cancelled) return;
          if (row) {
            const meta = planMetaFromRow(row);
            const next = scheduleFromRowData(row.data);
            loadPlanIntoState(planId, next, meta, row.updated_at);
            setStatus(true, `Loaded “${meta.name}” at ${timeLabel()}`);
          } else if (planId === 1) {
            const meta = { name: "Main schedule", kind: PLAN_KIND.LIVE, createdAt: new Date().toISOString() };
            const packed = packRowData(dataRef.current, meta);
            const ts = await planApi.remoteSavePlan(1, packed);
            if (cancelled) return;
            setPlanMeta(meta);
            setPlans([{ id: 1, name: meta.name, kind: meta.kind, updated_at: ts, planVersion: PLAN_VERSION }]);
            setStatus(true, `Published main schedule at ${timeLabel()}`);
          }
        } else {
          const seed = dataRef.current;
          const store = ensureLocalPlanStore(seed, "Main schedule");
          const list = listPlansFromLocalStore(store);
          let planId = getActivePlanId();
          if (!list.some((p) => p.id === planId)) planId = list[0]?.id || 1;
          const row = getLocalPlanRow(store, planId);
          const cached = readScheduleCache(planId);
          const next = cached ? upgrade(cached) : (row ? scheduleFromRowData(row.data) : seed);
          const meta = row ? planMetaFromLocalRow(row) : { name: "Main schedule", kind: PLAN_KIND.LIVE, createdAt: null };
          loadPlanIntoState(planId, next, meta, null);
          setPlans(list);
          const result = writeActivePlanCache(planId, next, meta);
          setSaveStatus({
            ok: result.ok,
            lastSavedAt: result.ok ? new Date() : null,
            error: result.error || "",
            label: result.ok ? offlineSaveLabel() : "Not saved",
          });
        }
      } catch (e) {
        if (!cancelled) {
          const cached = readScheduleCache(getActivePlanId());
          if (cached && (!dataRef.current.placements?.length || dataSignature(upgrade(cached)) !== dataSignature(dataRef.current))) {
            const next = upgrade(cached);
            const planId = getActivePlanId();
            loadPlanIntoState(planId, next, planMetaRef.current, null);
          }
          setStatus(false, "Offline — using this browser's copy", e?.message || "");
        }
      } finally {
        if (!cancelled) setPlansReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [loadPlanIntoState, writeActivePlanCache]);

  useEffect(() => {
    if (!REMOTE_ENABLED || !plansReady) return;
    const planId = activePlanId;
    const iv = setInterval(async () => {
      if (document.hidden || !canApplyRemotePoll(remoteRef.current)) return;
      if (activePlanIdRef.current !== planId) return;
      try {
        const ts = await planApi.remoteUpdatedAtPlan(planId);
        if (ts && remoteRef.current.lastSyncedAt && ts > remoteRef.current.lastSyncedAt) {
          const row = await planApi.remoteLoadPlan(planId);
          if (row && canApplyRemotePoll(remoteRef.current) && activePlanIdRef.current === planId) {
            const next = scheduleFromRowData(row.data);
            if (dataSignature(next) !== dataSignature(dataRef.current)) {
              const meta = planMetaFromRow(row);
              dataRef.current = next;
              setData(next);
              setPlanMeta(meta);
              remoteRef.current.lastSyncedAt = row.updated_at;
              markRevisionSaved(remoteRef.current);
              writeScheduleCache(planId, next);
              flushLocalSave(next);
              setStatus(true, `“${meta.name}” updated from another computer at ${timeLabel()}`);
            } else {
              remoteRef.current.lastSyncedAt = row.updated_at;
              markRevisionSaved(remoteRef.current);
            }
          }
        }
      } catch (e) { /* ignore transient poll errors */ }
    }, REMOTE_POLL_MS);
    const refreshFromRemote = async () => {
      if (document.hidden || !canApplyRemotePoll(remoteRef.current)) return;
      if (activePlanIdRef.current !== planId) return;
      try {
        const row = await planApi.remoteLoadPlan(planId);
        if (!row || !canApplyRemotePoll(remoteRef.current) || activePlanIdRef.current !== planId) return;
        const next = scheduleFromRowData(row.data);
        if (dataSignature(next) !== dataSignature(dataRef.current)) {
          const meta = planMetaFromRow(row);
          dataRef.current = next;
          setData(next);
          setPlanMeta(meta);
          writeScheduleCache(planId, next);
          flushLocalSave(next);
          setStatus(true, `“${meta.name}” updated from shared schedule at ${timeLabel()}`);
        }
        remoteRef.current.lastSyncedAt = row.updated_at;
        markRevisionSaved(remoteRef.current);
      } catch (e) { /* ignore */ }
    };
    const onVisible = () => { if (!document.hidden) refreshFromRemote(); };
    const onOnline = () => {
      refreshFromRemote();
      if (remoteRef.current.lastSaveFailed && !remoteRef.current.pendingSave && !isPlanReadOnly(planMetaRef.current.kind)) {
        flushRemoteSave(dataRef.current);
      }
    };
    const onPageHide = () => {
      clearTimeout(localSaveTimer.current);
      localSaveTimer.current = null;
      const planId = activePlanIdRef.current;
      const payload = dataRef.current;
      const meta = planMetaRef.current;
      writeScheduleCache(planId, payload);
      saveData(payload);
      if (remoteRef.current.timer) {
        clearTimeout(remoteRef.current.timer);
        remoteRef.current.timer = null;
      }
      if (REMOTE_ENABLED && !isPlanReadOnly(meta.kind)) {
        const packed = packRowData(payload, meta);
        planApi.remoteSavePlan(planId, packed, { keepalive: true }).catch(() => {});
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      clearInterval(iv);
      clearTimeout(remoteRef.current.retryTimer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [activePlanId, plansReady, flushRemoteSave, flushLocalSave]);

  useEffect(() => {
    if (!planMenuOpen) return;
    const close = () => setPlanMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [planMenuOpen]);

  const saveNow = () => {
    if (planReadOnly) return;
    clearTimeout(localSaveTimer.current);
    localSaveTimer.current = null;
    const planId = activePlanIdRef.current;
    const meta = planMetaRef.current;
    if (!REMOTE_ENABLED) {
      updateSaveStatus(writeActivePlanCache(planId, data, meta));
      return;
    }
    flushLocalSave(data);
    clearTimeout(remoteRef.current.timer);
    flushRemoteSave(data);
  };

  const { days, hours, rooms, catalog, placements, teachers, programLabel } = data;
  const headerProgramLine = `${programLabel || DEFAULT_PROGRAM_LABEL} · ${rooms.length} rooms · ${DAY_SHORT[days[0]]}–${DAY_SHORT[days[days.length - 1]]}`;
  const idx = useMemo(() => buildScheduleIndexes(data), [data]);

  // Make sure the active tab still exists (e.g. after remote data changes the day list)
  useEffect(() => {
    if (!days.includes(tab) && tab !== "byClass" && tab !== "byTeacher" && tab !== "weekOverview") setTab(days[0]);
  }, [days, tab]);

  // ── Rooms: a placement may span several rooms (combined classroom) ──
  const sortRoomIds = (list) => [...list].sort((a, b) => (idx.roomPos.get(a) ?? 99) - (idx.roomPos.get(b) ?? 99));
  const roomsLabel = (list) => sortRoomIds(list).join("+");
  const shareRoom = (a, b) => a.some((x) => b.includes(x));
  const roomCap = (id) => idx.roomCapById.get(id) ?? 12;
  const capOfRooms = (list) => list.reduce((s, id) => s + roomCap(id), 0);

  const classOfId = (id) => idx.catalogById.get(id);
  const placementsOf = (classId) => idx.placementsByClassId.get(classId) || [];

  const roomConflictsFor = (cand, opts = {}) => roomConflictsIndexed(idx, cand, opts);
  const evaluateAt = (cand, opts = {}) => evaluatePlacement(idx, cand, opts);
  const conflictReport = useMemo(() => buildConflictReport(idx, data), [idx, data]);
  const conflictCounts = useMemo(() => {
    const room = conflictReport.filter((x) => x.type === "room").length;
    const teacher = conflictReport.filter((x) => x.type === "teacher").length;
    return { room, teacher, total: room + teacher };
  }, [conflictReport]);

  const teacherBusy = (cand, teacher, opts = {}) => teacherBusyIndexed(idx, cand, teacher, opts);
  const teacherConflictsForPlacement = (pl) => {
    const cls = classOfId(pl.classId);
    return teacherBusy(pl, cls?.teacher, { excludePlacementId: pl.id });
  };
  const teacherConflictLabels = (items) =>
    [...new Set(items.map(({ placement, cls }) =>
      `${cls?.name || "Class"} (${DAY_SHORT[placement.day]} ${fmtRange(placement.start, placement.end)} · Rm ${placement.rooms.join("+")})`
    ))];

  const totalReg = useMemo(() => catalog.reduce((s, k) => s + (k.reg || 0), 0), [catalog]);
  const noTeacherCount = useMemo(() => catalog.filter((k) => !teacherKey(k.teacher)).length, [catalog]);

  // ── Day-grid geometry for the active tab ──
  const isDayTab = days.includes(tab);
  const winCfg = (isDayTab && hours[tab]) || hours.default;
  const tabPls = useMemo(
    () => (isDayTab ? (idx.placementsByDay.get(tab) || []) : []),
    [idx, isDayTab, tab]
  );
  const tabReg = useMemo(
    () => tabPls.reduce((s, p) => s + ((classOfId(p.classId) || {}).reg || 0), 0),
    [tabPls, idx]
  );
  const tabBlockMeta = useMemo(
    () => (isDayTab ? computeTabBlockMeta(idx, tab) : new Map()),
    [idx, isDayTab, tab]
  );
  const tabGridLayout = useMemo(() => {
    if (!isDayTab) return null;
    const starts = tabPls.map((p) => p.start);
    const ends = tabPls.map((p) => p.end);
    const gridStart = Math.floor(Math.min(winCfg[0], ...(starts.length ? starts : [winCfg[0]])) / 60) * 60;
    const gridEnd = Math.ceil(Math.max(winCfg[1], ...(ends.length ? ends : [winCfg[1]])) / 60) * 60;
    const gridH = (gridEnd - gridStart) * PX_PER_MIN;
    const hourMarks = [];
    for (let t = gridStart; t <= gridEnd; t += 60) hourMarks.push(t);
    const halfMarks = [];
    for (let t = gridStart + 30; t < gridEnd; t += 60) halfMarks.push(t);
    const colByRoom = new Map();
    const lanesByRoom = new Map();
    rooms.forEach((r) => {
      const colPls = tabPls.filter((p) => p.rooms.includes(r.id));
      colByRoom.set(r.id, colPls);
      lanesByRoom.set(r.id, layoutLanes(colPls));
    });
    return { gridStart, gridEnd, gridH, hourMarks, halfMarks, colByRoom, lanesByRoom };
  }, [isDayTab, tabPls, winCfg, rooms]);
  const gridStart = tabGridLayout?.gridStart ?? 0;
  const gridEnd = tabGridLayout?.gridEnd ?? 0;
  const gridH = tabGridLayout?.gridH ?? 0;
  const hourMarks = tabGridLayout?.hourMarks ?? [];
  const halfMarks = tabGridLayout?.halfMarks ?? [];

  const lanesByRoomForGhost = (candRooms, start, dur) => {
    const info = {};
    candRooms.forEach((rid) => {
      const colPls = (tabGridLayout?.colByRoom.get(rid) || []).filter((p) => !(drag?.type === "pl" && p.id === drag.id));
      const ghostPl = { id: "__ghost__", start, end: start + dur };
      const lanes = layoutLanes([...colPls, ghostPl]);
      const laneData = lanes.get("__ghost__");
      if (laneData) info[rid] = laneData;
    });
    return info;
  };

  const goToConflict = (item) => {
    if (days.includes(item.day)) setTab(item.day);
    setEditing({ isNew: false, classId: item.classId, placementId: item.placementId });
    setConflictPanelOpen(false);
  };

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
    persist((d) => {
      const nid = d.nextId || 1000;
      return {
        ...d,
        placements: [...d.placements, { id: "p" + nid, classId, day: cand.day, start: cand.start, end: cand.end, rooms: cand.rooms }],
        nextId: nid + 1,
      };
    });
  };

  const removePlacement = (plId) =>
    persist((d) => ({ ...d, placements: d.placements.filter((p) => p.id !== plId) }));

  const movePlacement = (plId, cand) => {
    const src = placements.find((p) => p.id === plId);
    if (!src) return;
    if (src.day === cand.day && src.start === cand.start && src.rooms.join("|") === cand.rooms.join("|")) return;
    persist((d) => ({
      ...d,
      placements: d.placements.map((p) =>
        p.id === plId ? { ...p, day: cand.day, start: cand.start, end: cand.end, rooms: cand.rooms } : p
      ),
    }));
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
      const ev = evaluateAt(cand, {
        excludePlacementId: drag.type === "pl" ? drag.id : undefined,
        classId: drag.type === "lib" ? drag.id : drag.classId,
        teacher: drag.teacher,
      });
      const laneInfo = lanesByRoomForGhost(candRooms, start, drag.dur);
      scheduleGhost({
        rooms: candRooms, start, dur: drag.dur,
        className: drag.className || "",
        roomConflict: !ev.ok,
        teacherConflict: ev.hasTeacherConflict,
        names: ev.roomConflictNames,
        laneInfo,
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
      const ev = evaluateAt(cand, {
        excludePlacementId: type === "pl" ? id : undefined,
        classId: type === "lib" ? id : undefined,
        teacher: type === "lib" ? classOfId(id)?.teacher : classOfId(placements.find((p) => p.id === id)?.classId)?.teacher,
      });
      if (!ev.ok) {
        flashMsg(`Can't place it there — Room${candRooms.length > 1 ? "s" : ""} ${roomsLabel(candRooms)} ${fmtRange(cand.start, cand.end)} overlaps ${ev.roomConflictNames.join(", ")}.`);
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
    const limit = maxEndForPlacement(idx, p, gridEnd);
    let cur = p.end;
    const move = (ev) => {
      const dy = ev.clientY - startY;
      let end = p.end + Math.round(dy / PX_PER_MIN / SNAP) * SNAP;
      end = Math.max(p.start + SNAP, Math.min(end, limit));
      if (end !== cur) {
        cur = end;
        scheduleResizePreview(p.id, end);
      }
    };
    const cancel = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", onKey);
      setResize(null);
      cur = p.end;
    };
    const onKey = (ev) => {
      if (ev.key === "Escape") cancel();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", onKey);
      setResize(null);
      if (cur === p.end) return;
      const freshIdx = buildScheduleIndexes(dataRef.current);
      const cand = { day: p.day, start: p.start, end: cur, rooms: p.rooms };
      const cls = freshIdx.catalogById.get(p.classId);
      const ev = evaluatePlacement(freshIdx, cand, { excludePlacementId: p.id, teacher: cls?.teacher });
      if (!ev.ok) {
        flashMsg(`Can't extend there — overlaps ${ev.roomConflictNames.join(", ")}.`);
        return;
      }
      persist((d) => ({
        ...d,
        placements: d.placements.map((x) => (x.id === p.id ? { ...x, end: cur } : x)),
      }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", onKey);
    setResize({ plId: p.id, end: p.end });
  };

  // ── Signed-up count stepper (shared roster: updates every placement of the class) ──
  const bump = (classId, delta) => {
    persist((d) => ({
      ...d,
      catalog: d.catalog.map((k) =>
        k.id === classId ? { ...k, reg: Math.max(0, (k.reg || 0) + delta) } : k
      ),
    }));
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
    persist((d) => ({
      ...d,
      catalog: newCatalog,
      placements: [...others, ...mine],
      teachers: newTeachers,
      nextId: nid,
    }));
    setEditing(null);
  };

  const deleteClass = (classId) => {
    const n = placementsOf(classId).length;
    if (n > 1 && !window.confirm(`This class meets ${n} times. Delete it everywhere?`)) return;
    persist((d) => ({
      ...d,
      catalog: d.catalog.filter((k) => k.id !== classId),
      placements: d.placements.filter((p) => p.classId !== classId),
    }));
    setEditing(null);
  };

  const duplicateClass = (k) => {
    persist((d) => {
      const nid = d.nextId || 1000;
      return {
        ...d,
        catalog: [...d.catalog, { ...k, id: "k" + nid, name: k.name + " (copy)" }],
        nextId: nid + 1,
      };
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
    persist((d) => ({ ...d, rooms: list, placements: np }));
    setRoomMgrOpen(false);
  };

  // ── Quick capacity edit from a calendar room header ──
  const openRoomCapEditor = (roomId) => {
    setRoomCapEditing({ roomId, value: String(roomCap(roomId)), error: "" });
  };

  const saveRoomCap = () => {
    if (!roomCapEditing) return;
    const n = parseInt(roomCapEditing.value, 10);
    if (!Number.isFinite(n) || n < 0) {
      setRoomCapEditing({ ...roomCapEditing, error: "Enter a number of 0 or more." });
      return;
    }
    const { roomId } = roomCapEditing;
    persist((d) => ({
      ...d,
      rooms: d.rooms.map((r) => (r.id === roomId ? { ...r, cap: n } : r)),
    }));
    setRoomCapEditing(null);
  };

  // ── Per-day scheduling window ──
  const openHoursEditor = () => {
    const cur = hours[tab] || hours.default;
    setHoursEditing({ day: tab, start: toInput(cur[0]), end: toInput(cur[1]), error: "" });
  };

  const saveHours = () => {
    if (!hoursEditing) return;
    const s = fromInput(hoursEditing.start);
    const e = fromInput(hoursEditing.end);
    if (s == null || e == null) {
      setHoursEditing({ ...hoursEditing, error: "Enter valid start and end times." });
      return;
    }
    if (e <= s) {
      setHoursEditing({ ...hoursEditing, error: "End time must be after start time." });
      return;
    }
    const { day } = hoursEditing;
    persist((d) => ({ ...d, hours: { ...d.hours, [day]: [s, e] } }));
    setHoursEditing(null);
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
    persist((d) => ({ ...d, teachers: names, catalog: nc }));
    setTeacherMgrOpen(false);
  };

  const saveProgramLabel = (label) => {
    persist((d) => ({ ...d, programLabel: cleanProgramLabel(label) }));
    setProgramLabelOpen(false);
  };

  const resettingDefaultPlan = activePlanId === 1;

  const resetAll = () => {
    if (resettingDefaultPlan) {
      persist(() => defaultData(), { skipUndo: true });
    } else {
      persist((d) => clearScheduleAndCounts(d), { skipUndo: true });
    }
    setConfirmReset(false);
  };

  // ── Library list (filtered; same sort as By Class: unscheduled first, letter, earliest time) ──
  const q = libQuery.trim().toLowerCase();
  const libList = useMemo(() => {
    const filtered = catalog.filter(
      (k) => !q || k.name.toLowerCase().includes(q) || (k.teacher || "").toLowerCase().includes(q)
    );
    return sortCatalogForByClassView(filtered, placements);
  }, [catalog, q, placements]);
  const unscheduledCount = useMemo(
    () => catalog.filter((k) => !idx.scheduledClassIds.has(k.id)).length,
    [catalog, idx.scheduledClassIds]
  );

  // ── One scheduled card on the day grid (layout matches By Class tab; enrollment colors) ──
  const renderBlock = (p, laneInfo) => {
    const cls = classOfId(p.classId);
    if (!cls) return null;
    const end = resize?.plId === p.id ? resize.end : p.end;
    const top = (p.start - gridStart) * PX_PER_MIN;
    const h = Math.max(14, (end - p.start) * PX_PER_MIN - 2);
    const { lane, lanes } = laneInfo || { lane: 0, lanes: 1 };
    const combined = p.rooms.length > 1;
    const cap = capOfRooms(p.rooms);
    const col = ratioColor(cls.reg, cap);
    const pct = cap ? Math.min(100, Math.round((cls.reg / cap) * 100)) : 0;
    const cached = resize?.plId === p.id ? null : tabBlockMeta.get(p.id);
    const roomClashes = cached
      ? cached.roomClashes
      : roomConflictsFor({ day: p.day, start: p.start, end, rooms: p.rooms }, { excludeId: p.id });
    const teacherConflicts = cached
      ? cached.teacherLabels
      : teacherConflictLabels(teacherConflictsForPlacement({ ...p, end }));
    const hasRoomClash = roomClashes.length > 0;
    const hasTeacherConflict = teacherConflicts.length > 0;
    const otherDayKeys = [...new Set(placementsOf(cls.id).filter((x) => x.id !== p.id).map((x) => x.day))];
    const dayLabel = otherDayKeys.length ? formatDayRange(otherDayKeys) : "";
    const teacherLabel = cls.teacher || <i style={{ color: "#b45309" }}>TBD</i>;
    const compact = lanes > 1;
    const metaFs = compact ? 10 : 11;
    const regThreshold = compact ? 56 : 64;
    const metaLine = {
      fontSize: metaFs,
      lineHeight: 1.2,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      minWidth: 0,
    };
    const isDragging = drag?.type === "pl" && drag.id === p.id;
    return (
      <div
        key={p.id}
        draggable={!resize && !planReadOnly}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", "pl:" + p.id);
          e.dataTransfer.effectAllowed = "move";
          const rect = e.currentTarget.getBoundingClientRect();
          e.dataTransfer.setDragImage(emptyDragImage(), 0, 0);
          setDrag({
            type: "pl", id: p.id, dur: p.end - p.start, rooms: p.rooms,
            grabOffset: (e.clientY - rect.top) / PX_PER_MIN,
            className: cls.name, teacher: cls.teacher, classId: cls.id,
          });
        }}
        onDragEnd={() => { setDrag(null); setGhost(null); ghostRef.current = null; setDragOver(null); }}
        onClick={(e) => { e.stopPropagation(); setEditing({ isNew: false, classId: cls.id, placementId: p.id }); }}
        title={
          `${cls.name} · ${fmtRangeAmPm(p.start, end)}` +
          (dayLabel ? ` · also ${dayLabel}` : "") +
          ` · ${cls.teacher || "TBD"} · ${overviewRoomLabel(p.rooms)}` +
          (combined ? ` · combined Rooms ${roomsLabel(p.rooms)}` : "") +
          (hasRoomClash ? ` · ROOM CONFLICT with ${[...new Set(roomClashes.map((c) => classOfId(c.classId)?.name))].join(", ")}` : "") +
          (hasTeacherConflict ? ` · same teacher also has ${teacherConflicts.join(", ")}` : "") +
          " — drag to move · drag the bottom edge to change length · click to edit"
        }
        style={{
          position: "absolute",
          top: top + 3,
          height: h,
          left: `calc(${(lane / lanes) * 100}% + 4px)`,
          width: `calc(${100 / lanes}% - 8px)`,
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
          padding: compact ? "3px 5px 2px" : "4px 7px 2px",
          overflow: "hidden",
          cursor: "grab",
          opacity: isDragging ? 0.35 : 1,
          display: "flex",
          flexDirection: "column",
          transition: "opacity .15s, box-shadow .15s",
        }}
      >
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: compact ? 1 : 2 }}>
          <div style={{ fontWeight: 700, fontSize: compact ? 11 : 12.5, lineHeight: 1.2, overflowWrap: "anywhere", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: compact ? 1 : 2, WebkitBoxOrient: "vertical" }}>
            {cls.name}{(hasRoomClash || hasTeacherConflict) ? " ⚠" : ""}
          </div>
          {h >= 32 && (
            <div style={{ ...metaLine, color: "#475569" }}>
              {fmtRangeAmPm(p.start, end)}
            </div>
          )}
          {h >= 44 && dayLabel && (
            <div style={{ ...metaLine, color: "#0f766e" }} title="Same class (one roster) also meets on these days">
              also {dayLabel}
            </div>
          )}
        </div>
        <div style={{ flexShrink: 0, marginTop: "auto", minWidth: 0, display: "flex", flexDirection: "column", gap: compact ? 1 : 2 }}>
          {h >= 40 && (
            <div style={{ ...metaLine, color: "#334155", fontWeight: 600 }}>
              {teacherLabel}
            </div>
          )}
          {h >= regThreshold && (
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: compact ? 1 : 3, minWidth: 0 }}>
                {!planReadOnly && (
                  <button onClick={(e) => { e.stopPropagation(); bump(cls.id, -1); }} style={compact ? stepBtnCompact : stepBtn}>−</button>
                )}
                <span style={{ fontSize: compact ? 10 : 11, fontWeight: 700, color: col.text, minWidth: 0, flex: 1, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden" }}>
                  {cls.reg}/{cap}{cls.reg >= cap && cap > 0 ? " · FULL" : ""}
                </span>
                {!planReadOnly && (
                  <button onClick={(e) => { e.stopPropagation(); bump(cls.id, +1); }} style={compact ? stepBtnCompact : stepBtn}>＋</button>
                )}
              </div>
              <div style={{ height: 4, background: "#e2e8f0", borderRadius: 2, marginTop: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: col.bar, borderRadius: 2, transition: "width .25s" }} />
              </div>
            </div>
          )}
          {h >= 30 && (
            <div
              onPointerDown={(e) => startResize(e, p)}
              onClick={(e) => e.stopPropagation()}
              title="Drag to change the end time"
              style={{ flexShrink: 0, height: 10, cursor: "ns-resize", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
            >
              <div style={{ width: 22, height: 3, borderRadius: 2, background: "rgba(15,23,42,.18)" }} />
            </div>
          )}
        </div>
      </div>
    );
  };

  // ───────────────────────── Render ─────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f3", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", color: "#1e293b" }}>
      {/* Header */}
      <header style={{ background: "#123c3a", color: "#fff", padding: "18px 24px" }}>
        <div style={{ width: "100%", boxSizing: "border-box", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <img
              src="./logo.svg"
              alt="Premier Plus"
              width={40}
              height={40}
              style={{ display: "block", flexShrink: 0, borderRadius: 8 }}
            />
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "0.02em", lineHeight: 1.2 }}>
                Premier Plus · Classroom Scheduler
              </h1>
              {planReadOnly ? (
                <span style={{ fontSize: 13, opacity: 0.75 }}>{headerProgramLine}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setProgramLabelOpen(true)}
                  title="Edit program label (year, term, site)"
                  style={{
                    fontSize: 13,
                    opacity: 0.75,
                    color: "inherit",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    margin: 0,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                    lineHeight: 1.35,
                  }}
                >
                  {headerProgramLine}
                </button>
              )}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setPlanMenuOpen((o) => !o)}
                title="Switch shared schedule plans"
                style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6, maxWidth: 280 }}
              >
                <span style={{ fontWeight: 700 }}>📁 {planMeta.name}</span>
                <span style={{ fontSize: 11, opacity: 0.85, background: "rgba(255,255,255,.12)", borderRadius: 4, padding: "1px 6px" }}>
                  {kindLabel(planMeta.kind)}
                </span>
                <span style={{ opacity: 0.7 }}>▾</span>
              </button>
              {planMenuOpen && (
                <div
                  style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 280,
                    background: "#fff", color: "#1e293b", borderRadius: 10, border: "1px solid #d6dad4",
                    boxShadow: "0 12px 32px rgba(15,23,42,.18)", zIndex: 40, padding: 6, maxHeight: 320, overflowY: "auto",
                  }}
                >
                  {(plans.length ? plans : [{ id: activePlanId, name: planMeta.name, kind: planMeta.kind }]).map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        background: p.id === activePlanId ? "#f0fdfa" : "transparent",
                        borderRadius: 8, padding: "2px 2px 2px 0",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => switchPlan(p.id)}
                        style={{
                          display: "flex", flex: 1, minWidth: 0, alignItems: "center", gap: 8, textAlign: "left",
                          border: "none", background: "transparent",
                          borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontSize: 13, color: "#1e293b",
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: p.id === activePlanId ? 700 : 500 }}>
                          {p.name}
                        </span>
                        <span style={{ fontSize: 11, color: "#64748b" }}>{kindLabel(p.kind)}</span>
                        {p.id === activePlanId && <span style={{ color: "#0f766e", fontWeight: 700 }}>✓</span>}
                      </button>
                      {canDeletePlans && !isProtectedPlan(p) && (
                        <button
                          type="button"
                          title={`Delete “${p.name}”`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPlanMenuOpen(false);
                            setPlanDialog({ mode: "delete", planId: p.id, name: p.name });
                          }}
                          style={{
                            border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer",
                            fontSize: 15, lineHeight: 1, padding: "4px 8px", borderRadius: 6,
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <div style={{ borderTop: "1px solid #eceeea", margin: "6px 0" }} />
                  {!planReadOnly && (
                    <button
                      type="button"
                      onClick={() => setPlanDialog({ mode: "new", name: defaultPlanName(PLAN_KIND.PLAN), copyFromCurrent: true })}
                      style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontSize: 13, color: "#123c3a", fontWeight: 600 }}
                    >
                      + New plan
                    </button>
                  )}
                  {!planReadOnly && (
                    <button
                      type="button"
                      onClick={() => setPlanDialog({ mode: "archive", name: defaultPlanName(PLAN_KIND.ARCHIVE) })}
                      style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontSize: 13, color: "#475569" }}
                    >
                      Save archive copy
                    </button>
                  )}
                  {planReadOnly && (
                    <button
                      type="button"
                      onClick={() => setPlanDialog({ mode: "restore", name: defaultRestoredPlanName(planMeta.name) })}
                      style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontSize: 13, color: "#123c3a", fontWeight: 600 }}
                    >
                      Restore as new plan
                    </button>
                  )}
                  {!planReadOnly && (
                    <button
                      type="button"
                      onClick={() => setPlanDialog({ mode: "rename", name: planMeta.name })}
                      style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontSize: 13, color: "#475569" }}
                    >
                      Rename current plan
                    </button>
                  )}
                </div>
              )}
            </div>
            <span style={{ fontSize: 13, opacity: 0.85 }}>
              Total enrolled <b style={{ fontSize: 16 }}>{totalReg}</b>
            </span>
            {conflictCounts.total > 0 && (
              <button
                onClick={() => setConflictPanelOpen((o) => !o)}
                title="View scheduling conflicts"
                style={{
                  ...btnGhost,
                  background: conflictPanelOpen ? "rgba(255,255,255,.15)" : "rgba(251,191,36,.2)",
                  borderColor: "#fde68a",
                  color: "#fef3c7",
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                ⚠ {conflictCounts.room} room · {conflictCounts.teacher} teacher
              </button>
            )}
            <span
              title={saveStatus.ok
                ? (REMOTE_ENABLED
                  ? `Shared plan “${planMeta.name}”. Edits sync for everyone viewing this plan.`
                  : IS_PREVIEW_DEPLOY
                    ? "Preview deploy — changes stay in this browser only."
                    : "Changes are stored in this browser.")
                : saveStatus.error}
              style={{
                fontSize: 12,
                color: saveStatus.ok ? "#d1fae5" : "#fecaca",
                whiteSpace: "nowrap",
              }}
            >
              {saveStatus.label}
            </span>
            <button onClick={() => setRoomMgrOpen(true)} style={btnGhost} disabled={planReadOnly}>Manage Rooms</button>
            <button
              onClick={() => setConfirmReset(true)}
              style={{ ...btnGhost, opacity: planReadOnly ? 0.35 : 0.7 }}
              disabled={planReadOnly}
              title={resettingDefaultPlan
                ? "Restore the default schedule from the registration sheet"
                : "Clear all scheduled times and set enrollment counts to 0"}
            >
              {resettingDefaultPlan ? "Reset Data" : "Clear schedule"}
            </button>
          </div>
        </div>
      </header>

      {REMOTE_ENABLED && !plansReady && (
        <div style={{ background: "#ecfdf5", borderBottom: "1px solid #a7f3d0", padding: "8px 24px", fontSize: 13, color: "#065f46" }}>
          Loading shared schedule from the server…
        </div>
      )}

      {planReadOnly && (
        <div style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "8px 24px", fontSize: 13, color: "#475569", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span><b>Archive (read-only)</b> — use <b>Restore as new plan</b> from the 📁 menu to edit a copy.</span>
          <button
            onClick={() => setPlanDialog({ mode: "restore", name: defaultRestoredPlanName(planMeta.name) })}
            style={{ ...btnSecondary, padding: "4px 10px", fontSize: 12 }}
          >
            Restore as new plan
          </button>
        </div>
      )}

      {conflictPanelOpen && conflictCounts.total > 0 && (
        <div style={{ background: "#fffbeb", borderBottom: "1px solid #fde68a", padding: "10px 24px", maxHeight: 220, overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#b45309" }}>
              {conflictCounts.total} scheduling conflict{conflictCounts.total === 1 ? "" : "s"}
            </span>
            <button onClick={() => setConflictPanelOpen(false)} style={{ ...btnSecondary, marginLeft: "auto", padding: "4px 10px", fontSize: 12 }}>
              Close
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {conflictReport.map((item, i) => (
              <button
                key={i}
                onClick={() => goToConflict(item)}
                style={{
                  textAlign: "left", border: "1px solid #fde68a", background: "#fff",
                  borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer", color: item.type === "room" ? "#b91c1c" : "#b45309",
                }}
              >
                {item.type === "room" ? "🔴" : "🟠"} {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

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
                        e.dataTransfer.setDragImage(emptyDragImage(), 0, 0);
                        setDrag({
                          type: "lib", id: k.id, dur: durationFor(k.id), grabOffset: 0,
                          className: k.name, teacher: k.teacher, classId: k.id,
                        });
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
            {[
              { id: "weekOverview", label: "📅 Week Overview" },
              { id: "byClass", label: "📋 By Class" },
              { id: "byTeacher", label: "👤 By Teacher" },
            ].map((v) => (
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
                  : tab === "weekOverview"
                    ? `${placements.length} meetings · ${days.length} days`
                    : `${tabPls.length} classes · ${tabReg} students on ${DAY_LABEL[tab] || "this day"}`}
            </span>
          </nav>

          {flash && (
            <div style={{ marginTop: 6, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 8, padding: "7px 12px", fontSize: 13, fontWeight: 600 }}>
              {flash}
            </div>
          )}
          {undoToast && (
            <div style={{ marginTop: 6, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", borderRadius: 8, padding: "7px 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
              <span>{undoToast.label}</span>
              <button onClick={undoLast} style={{ ...btnSecondary, padding: "4px 10px", fontSize: 12, color: "#065f46", borderColor: "#6ee7b7" }}>
                Undo
              </button>
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
                rooms={rooms}
                idx={idx}
                onEditClass={(classId) => setEditing({ isNew: false, classId })}
                onManageTeachers={() => setTeacherMgrOpen(true)}
              />
            ) : tab === "byClass" ? (
              <ClassScheduleView
                catalog={catalog}
                placements={placements}
                days={days}
                hours={hours}
                rooms={rooms}
                idx={idx}
                planReadOnly={planReadOnly}
                onBumpReg={bump}
                onEditClass={(classId, placementId) => setEditing({ isNew: false, classId, placementId })}
              />
            ) : tab === "weekOverview" ? (
              <WeekOverviewView
                days={days}
                hours={hours}
                rooms={rooms}
                placements={placements}
                idx={idx}
                planReadOnly={planReadOnly}
                onGoToDay={setTab}
                onEditClass={(classId, placementId) => setEditing({ isNew: false, classId, placementId })}
              />
            ) : (
            <>
            <div style={{ background: "#fff", border: "1px solid #d6dad4", borderRadius: "0 10px 10px 10px", overflowX: "auto", width: "100%" }}>
              <div style={{ minWidth: 64 + rooms.length * DAY_ROOM_MIN_W, position: "relative" }}>
                {/* Room header row */}
                <div style={{ display: "flex", borderBottom: "2px solid #d6dad4", background: "#fafaf8" }}>
                  <div style={{ flex: "0 0 64px", width: 64, position: "sticky", left: 0, zIndex: 4, background: "#fafaf8", boxSizing: "border-box", padding: "10px 6px", fontSize: 12, fontWeight: 600, color: "#475569", textAlign: "center" }}>
                    Time
                  </div>
                  {rooms.map((r) => (
                    <div key={r.id} style={{ flex: 1, minWidth: DAY_ROOM_MIN_W, boxSizing: "border-box", padding: "8px 4px 9px", textAlign: "center", borderLeft: "1px solid #eceeea" }}>
                      <div
                        onClick={() => openRoomCapEditor(r.id)}
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
                      <div
                        key={t}
                        style={{
                          position: "absolute",
                          top: (t - gridStart) * PX_PER_MIN,
                          right: 4,
                          transform: t === gridStart ? "translateY(2px)" : t === gridEnd ? "translateY(calc(-100% - 2px))" : "translateY(-50%)",
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#94a3b8",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmtAmPm(t)}
                      </div>
                    ))}
                  </div>
                  <div style={{ position: "absolute", left: 64, right: 0, top: 0, height: gridH, pointerEvents: "none", zIndex: 0 }}>
                    {hourMarks.map((t) => (
                      <div key={t} style={{ position: "absolute", left: 0, right: 0, top: (t - gridStart) * PX_PER_MIN, borderTop: "1px solid #d6dad4" }} />
                    ))}
                    {halfMarks.map((t) => (
                      <div key={t} style={{ position: "absolute", left: 0, right: 0, top: (t - gridStart) * PX_PER_MIN, borderTop: "1px dashed #dce0db" }} />
                    ))}
                  </div>
                  {rooms.map((room) => {
                    const colPls = tabGridLayout?.colByRoom.get(room.id) || [];
                    const lanes = tabGridLayout?.lanesByRoom.get(room.id) || new Map();
                    return (
                      <div
                        key={room.id}
                        {...colHandlers(room.id)}
                        title="Click an empty time to add a class here — or drag a card from the Class Library"
                        style={{ flex: 1, minWidth: DAY_ROOM_MIN_W, position: "relative", height: gridH, boxSizing: "border-box", borderLeft: "1px solid #eceeea", zIndex: 1 }}
                      >
                        {colPls.map((p) => renderBlock(p, lanes.get(p.id)))}
                        {ghost && ghost.rooms.includes(room.id) && (() => {
                          const lane = ghost.laneInfo?.[room.id] || { lane: 0, lanes: 1 };
                          const roomClash = ghost.roomConflict;
                          const teacherClash = ghost.teacherConflict;
                          const borderColor = roomClash ? "#dc2626" : teacherClash ? "#d97706" : "#0d7a72";
                          return (
                            <div
                              style={{
                                position: "absolute",
                                top: (ghost.start - gridStart) * PX_PER_MIN + 1,
                                height: ghost.dur * PX_PER_MIN - 2,
                                left: `calc(${(lane.lane / lane.lanes) * 100}% + 2px)`,
                                width: `calc(${100 / lane.lanes}% - 5px)`,
                                zIndex: 2, pointerEvents: "none", borderRadius: 8, boxSizing: "border-box",
                                border: roomClash ? `2px solid ${borderColor}` : `2px dashed ${borderColor}`,
                                background: roomClash ? "rgba(220,38,38,.07)" : teacherClash ? "rgba(217,119,6,.07)" : "rgba(13,122,114,.07)",
                                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
                                padding: "3px 5px", overflow: "hidden",
                              }}
                            >
                              {ghost.className && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: borderColor, background: "rgba(255,255,255,.9)", borderRadius: 4, padding: "1px 5px", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {ghost.className}
                                </span>
                              )}
                              <span style={{ fontSize: 10, fontWeight: 600, color: borderColor, marginTop: 2, background: "rgba(255,255,255,.85)", borderRadius: 4, padding: "1px 5px" }}>
                                {fmtRange(ghost.start, ghost.start + ghost.dur)}
                                {roomClash ? " · room taken" : teacherClash ? " · teacher busy" : ""}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ padding: "8px 14px", borderTop: "1px solid #eceeea", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12, color: "#64748b" }}>
                <span>
                  {DAY_LABEL[tab]} hours: <b style={{ color: "#123c3a" }}>{fmtAmPm(winCfg[0])} – {fmtAmPm(winCfg[1])}</b>
                </span>
                <button onClick={openHoursEditor} style={{ ...miniBtn, width: "auto", padding: "0 9px" }} title="Change this day's scheduling window">
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
            const ev = evaluateAt(cand, { excludeClassId: editing.classId });
            return ev.roomClashes[0] ? (classOfId(ev.roomClashes[0].classId)?.name || "another class") : null;
          }}
          freeRoomsAt={(cand) =>
            lookupFreeRooms(idx, cand, rooms.map((r) => r.id), { excludeClassId: editing.classId })
          }
          teacherConflictsAt={(cand, teacher) =>
            evaluateAt(cand, { excludeClassId: editing.classId, teacher }).teacherLabels
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

      {/* Quick room capacity modal */}
      {roomCapEditing && (
        <RoomCapModal
          roomId={roomCapEditing.roomId}
          value={roomCapEditing.value}
          error={roomCapEditing.error}
          onChange={(value) => setRoomCapEditing({ ...roomCapEditing, value, error: "" })}
          onSave={saveRoomCap}
          onClose={() => setRoomCapEditing(null)}
        />
      )}

      {/* Per-day scheduling hours modal */}
      {hoursEditing && (
        <HoursModal
          day={hoursEditing.day}
          start={hoursEditing.start}
          end={hoursEditing.end}
          error={hoursEditing.error}
          onChange={(field, value) => setHoursEditing({ ...hoursEditing, [field]: value, error: "" })}
          onSave={saveHours}
          onClose={() => setHoursEditing(null)}
        />
      )}

      {/* Teacher manager modal */}
      {teacherMgrOpen && (
        <TeacherModal teachers={teachers || []} catalog={catalog} onSave={saveTeachers} onClose={() => setTeacherMgrOpen(false)} />
      )}

      {/* Program label (header subtitle) */}
      {programLabelOpen && (
        <ProgramLabelModal
          value={programLabel || DEFAULT_PROGRAM_LABEL}
          onSave={saveProgramLabel}
          onClose={() => setProgramLabelOpen(false)}
        />
      )}

      {/* Reset confirmation */}
      {planDialog && (
        <Overlay onClose={() => setPlanDialog(null)}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>
            {planDialog.mode === "new" ? "New plan"
              : planDialog.mode === "archive" ? "Save archive copy"
                : planDialog.mode === "restore" ? "Restore as new plan"
                  : planDialog.mode === "delete" ? "Delete plan"
                    : "Rename plan"}
          </h2>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>
            {planDialog.mode === "new"
              ? "Creates another shared plan. Everyone can switch to it from the plan menu."
              : planDialog.mode === "archive"
                ? "Saves a read-only snapshot. You stay on the current plan."
                : planDialog.mode === "restore"
                  ? "Copies this archive into a new editable plan."
                  : planDialog.mode === "delete"
                    ? `Delete “${planDialog.name}”? This cannot be undone.${REMOTE_ENABLED ? " Removed for everyone." : ""}`
                    : "Visible to everyone with access to the shared plans."}
          </p>
          {planDialog.mode !== "delete" && (
            <Field label="Plan name">
              <input
                style={inputStyle}
                value={planDialog.name}
                onChange={(e) => setPlanDialog((d) => ({ ...d, name: e.target.value }))}
                autoFocus
              />
            </Field>
          )}
          {planDialog.mode === "new" && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 13, color: "#475569" }}>
              <input
                type="checkbox"
                checked={planDialog.copyFromCurrent !== false}
                onChange={(e) => setPlanDialog((d) => ({ ...d, copyFromCurrent: e.target.checked }))}
              />
              Copy current schedule into the new plan
            </label>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button style={btnSecondary} onClick={() => setPlanDialog(null)}>Cancel</button>
            <button
              style={planDialog.mode === "delete" ? { ...btnPrimary, background: "#dc2626" } : btnPrimary}
              onClick={submitPlanDialog}
              disabled={planDialog.mode !== "delete" && !String(planDialog.name || "").trim()}
            >
              {planDialog.mode === "rename" ? "Save name"
                : planDialog.mode === "archive" ? "Save archive"
                  : planDialog.mode === "restore" ? "Restore"
                    : planDialog.mode === "delete" ? "Delete"
                      : "Create plan"}
            </button>
          </div>
        </Overlay>
      )}

      {confirmReset && (
        <Overlay onClose={() => setConfirmReset(false)}>
          <h3 style={{ marginTop: 0 }}>
            {resettingDefaultPlan ? "Reset all data?" : "Clear schedule & counts?"}
          </h3>
          <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.5 }}>
            {resettingDefaultPlan
              ? `This restores the original schedule from the registration sheet. All changes will be lost${REMOTE_ENABLED ? " — for everyone viewing this default plan" : ""}.`
              : `This removes every scheduled time and sets all class enrollment to 0. Class names, teachers, rooms, and hours are kept${REMOTE_ENABLED ? " — colleagues see this if they switch to “" + planMeta.name + "”" : ""}.`}
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button style={btnSecondary} onClick={() => setConfirmReset(false)}>Cancel</button>
            <button style={{ ...btnPrimary, background: "#dc2626" }} onClick={resetAll}>
              {resettingDefaultPlan ? "Reset" : "Clear"}
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ───────────────────────── Class edit modal ─────────────────────────
function ClassModal({ editing, cls, initialRows, days, rooms, teachers, defaultDay, occupiedBy, freeRoomsAt, teacherConflictsAt, contextLabel, onSave, onDelete, onClose }) {
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
      ? [...new Set(rows.flatMap((r) => teacherConflictsAt({ day: r.day, start: r.start, end: r.end, rooms: r.rooms }, teacher)))]
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
          ? teacherConflictsAt({ day: r.day, start: r.start, end: r.end, rooms: r.rooms }, teacher)
          : [];
        const availableRooms = freeRoomsAt
          ? freeRoomsAt({ day: r.day, start: r.start, end: r.end }).filter((id) => !r.rooms.includes(id))
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
              {availableRooms.length > 0 && (
                <span style={{ fontSize: 11, color: "#0f766e", fontWeight: 600 }}>
                  Free: {availableRooms.join(", ")}
                </span>
              )}
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

// ───────────────────────── Room color swatch (shared palette) ─────────────────────────
function RoomColorSwatch({ color, size = 14 }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        background: color.bg,
        border: `1px solid ${color.border}`,
        flexShrink: 0,
        display: "inline-block",
      }}
    />
  );
}

// ───────────────────────── Room header badge (palette bg + paired dark text) ─────────────────────────
function RoomHeaderBadge({ roomId, roomOrder }) {
  const c = roomOverviewColor(roomId, roomOrder);
  return (
    <span
      style={{
        display: "inline-block",
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        borderRadius: 6,
        padding: "2px 10px",
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 1.25,
      }}
    >
      Room {roomId}
    </span>
  );
}

// ───────────────────────── Week overview class detail (read-only, room-colored) ─────────────────────────
function WeekOverviewClassDetail({ classId, placementId, placements, rooms, idx, planReadOnly, onEdit, onClose }) {
  const cls = idx.catalogById.get(classId);
  const placement = placements.find((p) => p.id === placementId);
  if (!cls || !placement) return null;

  const roomOrder = rooms.map((r) => r.id);
  const primaryRoom = primaryRoomForPlacement(placement.rooms, roomOrder);
  const rc = roomOverviewColor(primaryRoom, roomOrder);
  const cap = placement.rooms.reduce((s, id) => s + (idx.roomCapById.get(id) ?? 12), 0);
  const col = ratioColor(cls.reg, cap);
  const pct = cap ? Math.min(100, Math.round((cls.reg / cap) * 100)) : 0;
  const groups = classScheduleGroups(placements, classId);
  const rmLabel = overviewRoomLabel(placement.rooms);

  let roomClash = false;
  let teacherClash = false;
  placements
    .filter((p) => p.classId === classId)
    .forEach((p) => {
      const ev = evaluatePlacement(
        idx,
        { day: p.day, start: p.start, end: p.end, rooms: p.rooms },
        { excludePlacementId: p.id, teacher: cls.teacher }
      );
      if (ev.roomClashes.length) roomClash = true;
      if (ev.hasTeacherConflict) teacherClash = true;
    });

  const metaStyle = { fontSize: 13, lineHeight: 1.4, color: rc.text, opacity: 0.92 };
  const placementRoomsKey = placement.rooms.join("+");

  return (
    <Overlay onClose={onClose} bare>
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          boxSizing: "border-box",
          background: roomClash ? "#fee2e2" : teacherClash ? "#fffbeb" : rc.bg,
          border: roomClash ? "2px solid #dc2626" : teacherClash ? "2px solid #d97706" : `2px solid ${rc.border}`,
          borderRadius: 12,
          padding: "18px 20px 16px",
          boxShadow: "0 20px 50px rgba(0,0,0,.28)",
          color: rc.text,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.25, marginBottom: 6, overflowWrap: "anywhere" }}>
          {cls.name}{(roomClash || teacherClash) ? " ⚠" : ""}
        </div>
        <div style={{ ...metaStyle, fontWeight: 700, marginBottom: 10 }}>
          {DAY_LABEL[placement.day]} · {fmtRangeAmPm(placement.start, placement.end)} · {rmLabel}
        </div>

        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <div style={metaStyle}>
            <span style={{ fontWeight: 700 }}>Teacher </span>
            {cls.teacher || <span style={{ color: "#b45309", fontWeight: 600 }}>TBD</span>}
          </div>
          <div>
            <div style={{ ...metaStyle, fontWeight: 700, marginBottom: 4 }}>
              Enrolled {cls.reg}/{cap}{cls.reg >= cap && cap > 0 ? " · FULL" : ""}
            </div>
            <div style={{ height: 6, background: "rgba(255,255,255,.55)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: col.bar, borderRadius: 3 }} />
            </div>
          </div>
          {groups.length > 0 && (
            <div>
              <div style={{ ...metaStyle, fontWeight: 700, marginBottom: 4 }}>Schedule</div>
              {groups.map((g, i) => {
                const highlight =
                  g.start === placement.start &&
                  g.end === placement.end &&
                  g.rooms.join("+") === placementRoomsKey;
                return (
                  <div
                    key={i}
                    style={{
                      ...metaStyle,
                      fontWeight: highlight ? 700 : 500,
                      padding: "3px 0",
                      borderBottom: i < groups.length - 1 ? `1px solid ${rc.border}55` : "none",
                    }}
                  >
                    {g.timeLabel} · {g.dayLabel}
                    {highlight && groups.length > 1 ? " ← this block" : ""}
                  </div>
                );
              })}
            </div>
          )}
          {cls.note ? (
            <div style={metaStyle}>
              <span style={{ fontWeight: 700 }}>Note </span>
              {cls.note}
            </div>
          ) : null}
          {(roomClash || teacherClash) && (
            <div style={{ fontSize: 12, fontWeight: 600, color: roomClash ? "#b91c1c" : "#b45309" }}>
              {roomClash && "Room overlap detected. "}
              {teacherClash && "Teacher double-booked."}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" style={btnSecondary} onClick={onClose}>Close</button>
          {!planReadOnly && (
            <button type="button" style={btnPrimary} onClick={onEdit}>Edit class</button>
          )}
        </div>
      </div>
    </Overlay>
  );
}

// ───────────────────────── Week overview (time × days, room-colored) ─────────────────────────
function WeekOverviewView({ days, hours, rooms, placements, idx, planReadOnly, onGoToDay, onEditClass }) {
  const [classDetail, setClassDetail] = useState(null);
  const roomIds = rooms.map((r) => r.id);
  const layout = useMemo(
    () => computeWeekOverviewLayout(days, hours, idx.placementsByDay),
    [days, hours, idx.placementsByDay]
  );
  const { gridStart, gridEnd, gridH, hourMarks, halfMarks, lanesByDay, pxPerMin } = layout;

  const blockClash = (p) => {
    const cls = idx.catalogById.get(p.classId);
    const ev = evaluatePlacement(idx, { day: p.day, start: p.start, end: p.end, rooms: p.rooms }, { excludePlacementId: p.id, teacher: cls?.teacher });
    return { roomClash: ev.roomClashes.length > 0, teacherClash: ev.hasTeacherConflict };
  };

  return (
    <>
    {classDetail && (
      <WeekOverviewClassDetail
        classId={classDetail.classId}
        placementId={classDetail.placementId}
        placements={placements}
        rooms={rooms}
        idx={idx}
        planReadOnly={planReadOnly}
        onEdit={() => {
          onEditClass(classDetail.classId, classDetail.placementId);
          setClassDetail(null);
        }}
        onClose={() => setClassDetail(null)}
      />
    )}
    <div style={{ background: "#fff", border: "1px solid #d6dad4", borderRadius: "0 10px 10px 10px", overflowX: "auto", width: "100%" }}>
      <div style={{ minWidth: 64 + days.length * 132, position: "relative" }}>
        <div style={{ display: "flex", borderBottom: "2px solid #d6dad4", background: "#fafaf8" }}>
          <div style={{ flex: "0 0 64px", width: 64, position: "sticky", left: 0, zIndex: 6, background: "#fafaf8", boxSizing: "border-box", padding: "10px 4px", fontSize: 11, fontWeight: 600, color: "#475569", textAlign: "center", boxShadow: "2px 0 4px rgba(15,23,42,.06)" }}>
            Time
          </div>
          {days.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onGoToDay(d)}
              title={`Open ${DAY_LABEL[d]} day view`}
              style={{
                flex: 1,
                minWidth: 132,
                boxSizing: "border-box",
                padding: "10px 6px",
                textAlign: "center",
                border: "none",
                borderLeft: "1px solid #eceeea",
                fontSize: 13,
                fontWeight: 700,
                color: "#123c3a",
                background: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#f0fdfa"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {DAY_LABEL[d]}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", position: "relative", isolation: "isolate" }}>
          <div style={{ flex: "0 0 64px", width: 64, position: "sticky", left: 0, zIndex: 5, background: "#fafaf8", height: gridH, boxSizing: "border-box", borderRight: "1px solid #eceeea", boxShadow: "2px 0 4px rgba(15,23,42,.06)" }}>
            {hourMarks.map((t) => (
              <div
                key={t}
                style={{
                  position: "absolute",
                  top: (t - gridStart) * pxPerMin,
                  right: 6,
                  transform: t === gridStart ? "translateY(2px)" : t === gridEnd ? "translateY(calc(-100% - 2px))" : "translateY(-50%)",
                  fontSize: 10,
                  color: "#64748b",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  zIndex: 2,
                }}
              >
                {fmtAmPm(t)}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const dayPls = idx.placementsByDay.get(d) || [];
            return (
              <div
                key={d}
                style={{ flex: 1, minWidth: 132, position: "relative", height: gridH, borderLeft: "1px solid #eceeea", background: "#fcfcfb", overflow: "hidden", zIndex: 0 }}
              >
                {halfMarks.map((t) => (
                  <div key={`h-${t}`} style={{ position: "absolute", top: (t - gridStart) * pxPerMin, left: 0, right: 0, borderTop: "1px dashed #eef0ed", pointerEvents: "none" }} />
                ))}
                {hourMarks.map((t) => (
                  <div key={`hr-${t}`} style={{ position: "absolute", top: (t - gridStart) * pxPerMin, left: 0, right: 0, borderTop: "1px solid #e8ebe8", pointerEvents: "none" }} />
                ))}
                {dayPls.map((p) => {
                  const cls = idx.catalogById.get(p.classId);
                  if (!cls) return null;
                  const laneInfo = lanesByDay.get(d)?.get(p.id) || { lane: 0, lanes: 1 };
                  const { lane, lanes } = laneInfo;
                  const top = (p.start - gridStart) * pxPerMin;
                  const h = (p.end - p.start) * pxPerMin;
                  const primaryRoom = primaryRoomForPlacement(p.rooms, roomIds);
                  const rc = roomOverviewColor(primaryRoom, roomIds);
                  const { roomClash, teacherClash } = blockClash(p);
                  const rmLabel = overviewRoomLabel(p.rooms);
                  return (
                    <div
                      key={p.id}
                      onClick={() => setClassDetail({ classId: p.classId, placementId: p.id })}
                      title={`${cls.name} · ${fmtRange(p.start, p.end)} · ${cls.teacher || "TBD"} · ${rmLabel} — click for details`}
                      style={{
                        position: "absolute",
                        top: top + 1,
                        height: Math.max(34, h - 2),
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                        boxSizing: "border-box",
                        zIndex: 1,
                        maxWidth: "100%",
                        background: roomClash ? "#fee2e2" : teacherClash ? "#fffbeb" : rc.bg,
                        border: roomClash ? "2px solid #dc2626" : teacherClash ? "2px solid #d97706" : `1px solid ${rc.border}`,
                        borderRadius: 6,
                        padding: "3px 5px",
                        overflow: "hidden",
                        cursor: "pointer",
                        color: rc.text,
                        lineHeight: 1.2,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cls.name}{(roomClash || teacherClash) ? " ⚠" : ""}
                      </div>
                      <div style={{ fontSize: 10, opacity: 0.9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {fmtRange(p.start, p.end)}
                      </div>
                      {h >= 40 && (
                        <div style={{ fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {cls.teacher || <span style={{ color: "#b45309" }}>TBD</span>}
                        </div>
                      )}
                      {h >= 52 && (
                        <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {rmLabel}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ padding: "8px 12px", fontSize: 11, color: "#64748b", borderTop: "1px solid #eceeea" }}>
        {fmtAmPm(gridStart)} – {fmtAmPm(gridEnd)} · click a day name to open that day · click a block for class details · overlapping times split side-by-side
      </div>
    </div>
    </>
  );
}

// ───────────────────────── By-class schedule view (time axis × rooms) ─────────────────────────
const BY_CLASS_PX_PER_MIN = 1.25;
const BY_CLASS_ROOM_MIN_W = 148;

function ClassScheduleView({ catalog, placements, days, hours, rooms, idx, planReadOnly, onBumpReg, onEditClass }) {
  const roomOrder = rooms.map((r) => r.id);
  const roomCap = (id) => idx?.roomCapById?.get(id) ?? 12;
  const capOfRooms = (list) => (list || []).reduce((s, id) => s + roomCap(id), 0);

  const layout = useMemo(
    () => computeWeekOverviewLayout(days, hours, idx.placementsByDay, BY_CLASS_PX_PER_MIN),
    [days, hours, idx.placementsByDay]
  );
  const { gridStart, gridEnd, gridH, hourMarks, halfMarks } = layout;

  const classBlocks = useMemo(() => {
    return sortCatalogForByClassView(catalog, placements)
      .filter((k) => idx.scheduledClassIds?.has(k.id))
      .map((cls) => {
        const groups = classScheduleGroups(placements, cls.id);
        if (!groups.length) return null;
        const start = Math.min(...groups.map((g) => g.start));
        const end = Math.max(...groups.map((g) => g.end));
        const allRooms = [...new Set(groups.flatMap((g) => g.rooms))];
        const roomId = primaryRoomForPlacement(allRooms, roomOrder);
        return { classId: cls.id, cls, start, end, roomId, rooms: allRooms, groups };
      })
      .filter(Boolean);
  }, [catalog, placements, idx.scheduledClassIds, roomOrder]);

  const roomGrid = useMemo(() => {
    const singleByRoom = new Map();
    const spanBlocks = [];
    rooms.forEach((r) => singleByRoom.set(r.id, []));
    classBlocks.forEach((b) => {
      if (b.rooms.length > 1) spanBlocks.push(b);
      else {
        const rid = b.rooms[0] || b.roomId;
        if (singleByRoom.has(rid)) singleByRoom.get(rid).push(b);
      }
    });
    const lanesByRoom = new Map();
    rooms.forEach((r) => {
      const list = singleByRoom.get(r.id) || [];
      lanesByRoom.set(r.id, layoutLanes(list.map((b) => ({ id: b.classId, start: b.start, end: b.end }))));
    });
    const spanLanes = layoutLanes(spanBlocks.map((b) => ({ id: b.classId, start: b.start, end: b.end })));
    return { singleByRoom, spanBlocks, lanesByRoom, spanLanes };
  }, [classBlocks, rooms]);

  const spanBlockGeometry = (blockRooms, lane, laneCount) => {
    const indices = blockRooms
      .map((id) => rooms.findIndex((r) => r.id === id))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);
    if (!indices.length) return null;
    const colStart = indices[0];
    const colEnd = indices[indices.length - 1];
    const n = rooms.length;
    const spanFrac = (colEnd - colStart + 1) / n;
    const startFrac = colStart / n;
    return {
      left: `calc(${(startFrac + (lane / laneCount) * spanFrac) * 100}% + 4px)`,
      width: `calc(${(spanFrac * 100) / laneCount}% - 8px)`,
    };
  };

  const unscheduled = useMemo(
    () => sortCatalogForByClassView(catalog, placements).filter((k) => !idx.scheduledClassIds?.has(k.id)),
    [catalog, placements, idx.scheduledClassIds]
  );

  const classClash = (cls) => {
    let roomClash = false;
    let teacherClash = false;
    placements
      .filter((p) => p.classId === cls.id)
      .forEach((p) => {
        const ev = evaluatePlacement(
          idx,
          { day: p.day, start: p.start, end: p.end, rooms: p.rooms },
          { excludePlacementId: p.id, teacher: cls?.teacher }
        );
        if (ev.roomClashes.length) roomClash = true;
        if (ev.hasTeacherConflict) teacherClash = true;
      });
    return { roomClash, teacherClash };
  };

  const renderBlock = (block, colorRoomId, laneInfo, geom) => {
    const { cls, classId, start, end, rooms: blockRooms, groups } = block;
    const { lane, lanes: laneCount } = laneInfo || { lane: 0, lanes: 1 };
    const top = (start - gridStart) * BY_CLASS_PX_PER_MIN;
    const h = Math.max(14, (end - start) * BY_CLASS_PX_PER_MIN - 6);
    const cap = capOfRooms(blockRooms);
    const col = ratioColor(cls.reg, cap);
    const pct = cap ? Math.min(100, Math.round((cls.reg / cap) * 100)) : 0;
    const rc = roomOverviewColor(colorRoomId, roomOrder);
    const { roomClash, teacherClash } = classClash(cls);
    const singleGroup = groups.length === 1;
    const summary = groups.map((g) => `${g.dayLabel} ${g.timeLabel}`).join(" · ");
    const teacherLabel = cls.teacher || <i style={{ color: "#b45309" }}>TBD</i>;
    const compact = laneCount > 1;
    const metaFs = compact ? 10 : 11;
    const regThreshold = compact ? 56 : 64;
    const metaLine = {
      fontSize: metaFs,
      lineHeight: 1.2,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      minWidth: 0,
    };
    const pos = geom || {
      left: `calc(${(lane / laneCount) * 100}% + 4px)`,
      width: `calc(${100 / laneCount}% - 8px)`,
    };
    return (
      <div
        key={classId}
        onClick={(e) => { e.stopPropagation(); onEditClass(cls.id); }}
        title={`${cls.name} · ${summary} · ${cls.teacher || "TBD"} · ${overviewRoomLabel(blockRooms)} — click to edit`}
        style={{
          position: "absolute",
          top: top + 3,
          height: h,
          left: pos.left,
          width: pos.width,
          boxSizing: "border-box",
          zIndex: geom ? 2 : 1,
          background: roomClash ? "#fee2e2" : teacherClash ? "#fffbeb" : rc.bg,
          border: roomClash ? "2px solid #dc2626" : teacherClash ? "2px solid #d97706" : `1px solid ${rc.border}`,
          boxShadow: roomClash
            ? "0 0 0 3px rgba(220,38,38,.12)"
            : teacherClash
              ? "0 0 0 3px rgba(217,119,6,.12)"
              : "none",
          borderRadius: 8,
          padding: compact ? "3px 5px 6px" : "4px 7px 9px",
          overflow: "hidden",
          cursor: "pointer",
          pointerEvents: geom ? "auto" : undefined,
          color: rc.text,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: compact ? 1 : 2 }}>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: compact ? 1 : 2 }}>
            <div style={{ fontWeight: 700, fontSize: compact ? 11 : 12.5, lineHeight: 1.2, overflowWrap: "anywhere", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: compact ? 1 : 2, WebkitBoxOrient: "vertical" }}>
              {cls.name}{(roomClash || teacherClash) ? " ⚠" : ""}
            </div>
            {singleGroup ? (
              <>
                {h >= 32 && (
                  <div style={{ ...metaLine, color: "#475569" }}>
                    {groups[0].timeLabel}
                  </div>
                )}
                {h >= 44 && (
                  <div style={{ ...metaLine, color: "#0f766e" }}>
                    {groups[0].dayLabel}
                  </div>
                )}
              </>
            ) : (
              groups.map((g, i) => (
                h >= 34 + i * (compact ? 18 : 20) && (
                  <div key={i} style={{ ...metaLine, color: "#475569" }}>
                    {g.timeLabel} · {g.dayLabel}
                  </div>
                )
              ))
            )}
          </div>
          {h >= 40 && (
            <div style={{ ...metaLine, flexShrink: 0, color: "#334155", fontWeight: 600 }}>
              {teacherLabel}
            </div>
          )}
        </div>
        {h >= regThreshold && (
          <div style={{ flexShrink: 0, marginTop: 2, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: laneCount > 1 ? 1 : 3, minWidth: 0 }}>
              {!planReadOnly && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onBumpReg(cls.id, -1); }}
                  style={laneCount > 1 ? stepBtnCompact : stepBtn}
                >
                  −
                </button>
              )}
              <span style={{ fontSize: laneCount > 1 ? 10 : 11, fontWeight: 700, color: col.text, minWidth: 0, flex: 1, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden" }}>
                {cls.reg}/{cap}{cls.reg >= cap && cap > 0 ? " · FULL" : ""}
              </span>
              {!planReadOnly && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onBumpReg(cls.id, +1); }}
                  style={laneCount > 1 ? stepBtnCompact : stepBtn}
                >
                  ＋
                </button>
              )}
            </div>
            <div style={{ height: 4, background: "#e2e8f0", borderRadius: 2, marginTop: 3, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: col.bar, borderRadius: 2, transition: "width .25s" }} />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div style={{ background: "#fff", border: "1px solid #d6dad4", borderRadius: "0 10px 10px 10px", overflowX: "auto", width: "100%" }}>
        <div style={{ minWidth: 64 + rooms.length * BY_CLASS_ROOM_MIN_W, position: "relative" }}>
          <div style={{ display: "flex", borderBottom: "2px solid #d6dad4", background: "#fafaf8" }}>
            <div style={{ flex: "0 0 64px", width: 64, position: "sticky", left: 0, zIndex: 4, background: "#fafaf8", boxSizing: "border-box", padding: "10px 6px", fontSize: 12, fontWeight: 600, color: "#475569", textAlign: "center" }}>
              Time
            </div>
            {rooms.map((r) => (
              <div key={r.id} style={{ flex: 1, minWidth: BY_CLASS_ROOM_MIN_W, boxSizing: "border-box", padding: "8px 4px 9px", textAlign: "center", borderLeft: "1px solid #eceeea" }}>
                <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <RoomHeaderBadge roomId={r.id} roomOrder={roomOrder} />
                  <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Cap {r.cap}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", position: "relative" }}>
            <div style={{ flex: "0 0 64px", width: 64, position: "sticky", left: 0, zIndex: 3, background: "#fafaf8", height: gridH, boxSizing: "border-box", borderRight: "1px solid #eceeea" }}>
              {hourMarks.map((t) => (
                <div
                  key={t}
                  style={{
                    position: "absolute",
                    top: (t - gridStart) * BY_CLASS_PX_PER_MIN,
                    right: 4,
                    transform: t === gridStart ? "translateY(2px)" : t === gridEnd ? "translateY(calc(-100% - 2px))" : "translateY(-50%)",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#94a3b8",
                    whiteSpace: "nowrap",
                  }}
                >
                  {fmtAmPm(t)}
                </div>
              ))}
            </div>
            <div style={{ flex: 1, display: "flex", position: "relative", minWidth: rooms.length * BY_CLASS_ROOM_MIN_W }}>
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
                {hourMarks.map((t) => (
                  <div key={t} style={{ position: "absolute", left: 0, right: 0, top: (t - gridStart) * BY_CLASS_PX_PER_MIN, borderTop: "1px solid #eceeea" }} />
                ))}
                {halfMarks.map((t) => (
                  <div key={t} style={{ position: "absolute", left: 0, right: 0, top: (t - gridStart) * BY_CLASS_PX_PER_MIN, borderTop: "1px dashed #f0f2ee" }} />
                ))}
              </div>
              {rooms.map((room) => {
                const colBlocks = roomGrid.singleByRoom.get(room.id) || [];
                const lanes = roomGrid.lanesByRoom.get(room.id) || new Map();
                return (
                  <div
                    key={room.id}
                    style={{ flex: 1, minWidth: BY_CLASS_ROOM_MIN_W, position: "relative", height: gridH, boxSizing: "border-box", borderLeft: "1px solid #eceeea", background: "#fcfcfb", zIndex: 1 }}
                  >
                    {colBlocks.map((b) => renderBlock(b, room.id, lanes.get(b.classId)))}
                  </div>
                );
              })}
              <div style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}>
                {roomGrid.spanBlocks.map((b) => {
                  const laneInfo = roomGrid.spanLanes.get(b.classId) || { lane: 0, lanes: 1 };
                  const geom = spanBlockGeometry(b.rooms, laneInfo.lane, laneInfo.lanes);
                  if (!geom) return null;
                  return renderBlock(b, primaryRoomForPlacement(b.rooms, roomOrder), laneInfo, geom);
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      {unscheduled.length > 0 && (
        <div style={{ marginTop: 10, padding: "10px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12, color: "#92400e" }}>
          <span style={{ fontWeight: 700 }}>Unscheduled ({unscheduled.length}):</span>{" "}
          {unscheduled.map((k, i) => (
            <span key={k.id}>
              {i > 0 && ", "}
              <button
                type="button"
                onClick={() => onEditClass(k.id)}
                style={{ background: "none", border: "none", padding: 0, color: "#b45309", fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}
              >
                {k.name}
              </button>
            </span>
          ))}
        </div>
      )}
      <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 10 }}>
        📋 One block per class — time ({fmtAmPm(gridStart)}–{fmtAmPm(gridEnd)}) × rooms.
        Name, time, days (Mon to Fri / Mon & Tue), teacher, and cap bar on each block. Use −/+ to adjust enrollment — no drag here.
      </p>
    </>
  );
}

// ───────────────────────── By-teacher schedule view ─────────────────────────
const BY_TEACHER_LABEL_W = 180;

function TeacherScheduleView({ teachers, catalog, placements, rooms, idx, onEditClass, onManageTeachers }) {
  const roomOrder = rooms.map((r) => r.id);

  const earliestStart = (classId) => {
    let best = null;
    placements.forEach((p) => {
      if (p.classId !== classId) return;
      if (best == null || p.start < best) best = p.start;
    });
    return best;
  };

  const sortByTimeThenName = (list) =>
    list.slice().sort((a, b) => {
      const sa = earliestStart(a.id);
      const sb = earliestStart(b.id);
      if (sa == null && sb == null) return a.name.localeCompare(b.name);
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sa - sb || a.name.localeCompare(b.name);
    });

  const classesFor = (key) =>
    sortByTimeThenName(catalog.filter((k) => teacherKey(k.teacher) === key));
  const scheduledFor = (key) =>
    classesFor(key).filter((k) => placements.some((p) => p.classId === k.id));
  const tbdClasses = sortByTimeThenName(catalog.filter((k) => !teacherKey(k.teacher)));
  const tbdScheduled = tbdClasses.filter((k) => placements.some((p) => p.classId === k.id));
  const tbdHasAny = tbdClasses.length > 0;

  const classClash = (cls) => {
    let roomClash = false;
    let teacherClash = false;
    placements
      .filter((p) => p.classId === cls.id)
      .forEach((p) => {
        const ev = evaluatePlacement(
          idx,
          { day: p.day, start: p.start, end: p.end, rooms: p.rooms },
          { excludePlacementId: p.id, teacher: cls?.teacher }
        );
        if (ev.roomClashes.length) roomClash = true;
        if (ev.hasTeacherConflict) teacherClash = true;
      });
    return { roomClash, teacherClash };
  };

  const metaLine = {
    fontSize: 11,
    lineHeight: 1.25,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    minWidth: 0,
  };

  const renderCard = (cls) => {
    const pls = placements.filter((p) => p.classId === cls.id);
    const groups = classScheduleGroups(pls, cls.id);
    if (!groups.length) return null;
    const allRooms = [...new Set(pls.flatMap((p) => p.rooms))];
    const roomId = primaryRoomForPlacement(allRooms, roomOrder);
    const rc = roomOverviewColor(roomId, roomOrder);
    const { roomClash, teacherClash } = classClash(cls);
    const singleGroup = groups.length === 1;
    const rmLabel = overviewRoomLabel(allRooms);
    return (
      <div
        key={cls.id}
        onClick={() => onEditClass(cls.id)}
        title={`${cls.name} · ${groups.map((g) => `${g.dayLabel} ${g.timeLabel}`).join(" · ")} · ${rmLabel} — click to edit`}
        style={{
          flex: "0 0 auto",
          width: 148,
          minHeight: 42,
          boxSizing: "border-box",
          background: roomClash ? "#fee2e2" : teacherClash ? "#fffbeb" : rc.bg,
          border: roomClash ? "2px solid #dc2626" : teacherClash ? "2px solid #d97706" : `1px solid ${rc.border}`,
          boxShadow: roomClash
            ? "0 0 0 3px rgba(220,38,38,.12)"
            : teacherClash
              ? "0 0 0 3px rgba(217,119,6,.12)"
              : "none",
          borderRadius: 8,
          padding: "4px 7px 8px",
          overflow: "hidden",
          cursor: "pointer",
          color: rc.text,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 12.5, lineHeight: 1.2, overflowWrap: "anywhere", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {cls.name}{(roomClash || teacherClash) ? " ⚠" : ""}
        </div>
        {singleGroup ? (
          <>
            <div style={{ ...metaLine, color: "#475569" }}>{groups[0].timeLabel}</div>
            <div style={{ ...metaLine, color: "#0f766e" }}>{groups[0].dayLabel}</div>
          </>
        ) : (
          groups.map((g, i) => (
            <div key={i} style={{ ...metaLine, color: "#475569" }}>
              {g.timeLabel} · {g.dayLabel}
            </div>
          ))
        )}
        <div style={{ ...metaLine, flexShrink: 0, color: rc.text, fontWeight: 700 }}>
          {rmLabel}
        </div>
      </div>
    );
  };

  const renderTeacherRow = (label, classList, scheduledList, highlight) => (
    <div key={label} style={{ display: "flex", borderTop: "1px solid #eceeea" }}>
      <div
        style={{
          flex: `0 0 ${BY_TEACHER_LABEL_W}px`,
          width: BY_TEACHER_LABEL_W,
          position: "sticky",
          left: 0,
          zIndex: 2,
          background: "#fafaf8",
          boxSizing: "border-box",
          padding: "10px 10px 12px",
          borderRight: "1px solid #eceeea",
          verticalAlign: "top",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, color: highlight ? "#b45309" : "#123c3a", overflowWrap: "anywhere" }}>{label}</div>
        {classList.length === 0 ? (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>—</div>
        ) : (
          classList.map((k) => (
            <div key={k.id} style={{ fontSize: 11, color: "#64748b", marginTop: 4, lineHeight: 1.35, overflowWrap: "anywhere" }}>
              {k.name}
            </div>
          ))
        )}
      </div>
      <div
        style={{
          flex: 1,
          boxSizing: "border-box",
          padding: "8px 10px",
          background: "#fcfcfb",
          display: "flex",
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: 8,
          minHeight: 48,
        }}
      >
        {scheduledList.length === 0 ? (
          <span style={{ color: "#cbd5d1", fontSize: 12, padding: "4px 2px" }}>—</span>
        ) : (
          scheduledList.map((k) => renderCard(k))
        )}
      </div>
    </div>
  );

  return (
    <>
      <div style={{ background: "#fff", border: "1px solid #d6dad4", borderRadius: "0 10px 10px 10px", overflowX: "auto", width: "100%" }}>
        <div style={{ minWidth: BY_TEACHER_LABEL_W + 320, position: "relative" }}>
          <div style={{ display: "flex", borderBottom: "2px solid #d6dad4", background: "#fafaf8" }}>
            <div style={{ flex: `0 0 ${BY_TEACHER_LABEL_W}px`, width: BY_TEACHER_LABEL_W, position: "sticky", left: 0, zIndex: 3, background: "#fafaf8", boxSizing: "border-box", padding: "10px 10px", borderRight: "1px solid #eceeea" }}>
              <button
                type="button"
                onClick={onManageTeachers}
                style={{
                  ...btnGhost,
                  color: "#123c3a",
                  borderColor: "#cbd5d1",
                  background: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "5px 12px",
                  whiteSpace: "nowrap",
                }}
              >
                Manage teachers
              </button>
            </div>
            <div style={{ flex: 1, boxSizing: "border-box", padding: "10px 12px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>Room colors:</span>
              {rooms.map((r) => {
                const c = roomOverviewColor(r.id, roomOrder);
                return (
                  <span key={r.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: c.text, fontWeight: 600 }}>
                    <RoomColorSwatch color={c} />
                    Room {r.id}
                    <span style={{ color: "#94a3b8", fontWeight: 500 }}>Cap {r.cap}</span>
                  </span>
                );
              })}
            </div>
          </div>
          {teachers.map((t) => {
            const key = teacherKey(t);
            return renderTeacherRow(t, classesFor(key), scheduledFor(key), false);
          })}
          {tbdHasAny && renderTeacherRow("(Teacher TBD)", tbdClasses, tbdScheduled, true)}
          {teachers.length === 0 && !tbdHasAny && (
            <div style={{ padding: "16px 20px", color: "#94a3b8", fontSize: 13 }}>
              No teachers yet — assign teachers to classes, or add them here.
            </div>
          )}
        </div>
      </div>
      <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 10 }}>
        👤 One row per teacher — cards left to right by earliest meeting time, then class name. Each card shows class, time, days, and room — click to edit.
        Card colors match the room legend above.
        <span style={{ color: "#b91c1c", fontWeight: 700 }}> Red </span>
        = room overlap ·
        <span style={{ color: "#b45309", fontWeight: 700 }}> amber </span>
        = teacher double-booked.
        <b> Manage teachers</b> renames (cascades to classes) or removes teachers (sets their classes to TBD).
      </p>
    </>
  );
}

// ───────────────────────── Header program label editor ─────────────────────────
function ProgramLabelModal({ value, onSave, onClose }) {
  const [label, setLabel] = useState(value);
  const [error, setError] = useState("");

  const submit = () => {
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Enter a label (e.g. 2026 Fall · Jericho).");
      return;
    }
    onSave(trimmed);
  };

  return (
    <Overlay onClose={onClose}>
      <h3 style={{ marginTop: 0, color: "#123c3a" }}>Program label</h3>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px", lineHeight: 1.45 }}>
        Shown in the header under the title. Update each term (Summer, Fall, Spring) without changing code.
        Room count and class days stay automatic.
      </p>
      <Field label="Label">
        <input
          style={inputStyle}
          value={label}
          onChange={(e) => { setLabel(e.target.value); setError(""); }}
          placeholder="2026 Summer · Jericho"
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onClose();
          }}
          autoFocus
        />
      </Field>
      {error && <div style={{ ...roomConflictStyle, marginTop: 8 }}>{error}</div>}
      <p style={{ fontSize: 11, color: "#94a3b8", margin: "10px 0 0" }}>
        Examples: 2026 Fall · Jericho · 2027 Spring · Jericho
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
        <button style={btnSecondary} onClick={onClose}>Cancel</button>
        <button style={btnPrimary} onClick={submit}>Save label</button>
      </div>
    </Overlay>
  );
}

// ───────────────────────── Per-day scheduling hours editor ─────────────────────────
function HoursModal({ day, start, end, error, onChange, onSave, onClose }) {
  const timeInputStyle = { ...inputStyle, fontSize: 18, fontWeight: 700, color: "#123c3a" };
  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 8, background: "#e6f4f3", color: "#123c3a",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800,
          border: "1px solid #c9e4e1",
        }}>
          {DAY_SHORT[day]}
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: "0 0 4px", color: "#123c3a" }}>Scheduling hours</h3>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.4 }}>
            {DAY_LABEL[day]} · calendar visible window
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: error ? 6 : 14 }}>
        <Field label="Start">
          <input
            style={timeInputStyle}
            type="time"
            value={start}
            onChange={(e) => onChange("start", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
              if (e.key === "Escape") onClose();
            }}
            autoFocus
          />
        </Field>
        <Field label="End">
          <input
            style={timeInputStyle}
            type="time"
            value={end}
            onChange={(e) => onChange("end", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
              if (e.key === "Escape") onClose();
            }}
          />
        </Field>
      </div>
      {error && <div style={{ ...roomConflictStyle, marginBottom: 14 }}>{error}</div>}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
        <button style={btnSecondary} onClick={onClose}>Cancel</button>
        <button style={btnPrimary} onClick={onSave}>Save hours</button>
      </div>
    </Overlay>
  );
}

// ───────────────────────── Quick room capacity editor ─────────────────────────
function RoomCapModal({ roomId, value, error, onChange, onSave, onClose }) {
  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 8, background: "#e6f4f3", color: "#123c3a",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800,
          border: "1px solid #c9e4e1",
        }}>
          {roomId}
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: "0 0 4px", color: "#123c3a" }}>Room capacity</h3>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.4 }}>
            Room {roomId} · All week
          </p>
        </div>
      </div>

      <Field label="Capacity" style={{ marginBottom: error ? 6 : 14 }}>
        <input
          style={{ ...inputStyle, fontSize: 18, fontWeight: 700, color: "#123c3a" }}
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
            if (e.key === "Escape") onClose();
          }}
          autoFocus
        />
      </Field>
      {error && <div style={{ ...roomConflictStyle, marginBottom: 14 }}>{error}</div>}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
        <button style={btnSecondary} onClick={onClose}>Cancel</button>
        <button style={btnPrimary} onClick={onSave}>Save capacity</button>
      </div>
    </Overlay>
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

  const roomOrder = list.map((r, i) => r.name.trim() || `__draft_${i}`);
  const colorForIndex = (i) => roomOverviewColor(roomOrder[i], roomOrder);

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

  const roomMgrGrid = "22px 80px 76px 44px 26px 26px 26px";

  return (
    <Overlay onClose={onClose}>
      <h3 style={{ marginTop: 0 }}>Manage rooms</h3>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 12px" }}>
        One room list for the whole week. To combine classrooms for a class (e.g. SAT across Rooms 2+3),
        open the class and select several room chips — no special room entry is needed here. Capacity is
        room capacity; a combined class gets the rooms' total.
      </p>
      <div style={{ padding: "10px 12px", marginBottom: 12, borderRadius: 8, background: "#fafaf8", border: "1px solid #eceeea", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>Room colors:</span>
        {list.map((r, i) => {
          const c = colorForIndex(i);
          const label = r.name.trim() || "(new)";
          return (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: c.text, fontWeight: 600 }}>
              <RoomColorSwatch color={c} />
              {label}
            </span>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 10px" }}>
        Colors follow list order — use ↑↓ to reorder. New rooms get the next color automatically.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: roomMgrGrid, gap: 5, alignItems: "center", marginBottom: 5, fontSize: 11, color: "#64748b", fontWeight: 700, width: "fit-content" }}>
        <span />
        <span>Room</span>
        <span>Capacity</span>
        <span>Used</span>
        <span />
        <span />
        <span />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto", width: "fit-content" }}>
        {list.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: roomMgrGrid, gap: 5, alignItems: "center" }}>
            <RoomColorSwatch color={colorForIndex(i)} size={16} />
            <input
              style={{ ...inputStyle, padding: "6px 8px", width: 80, boxSizing: "border-box" }}
              value={r.name}
              placeholder="#"
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
function Overlay({ children, onClose, wide, bare }) {
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
          background: bare ? "transparent" : "#fff",
          borderRadius: 12,
          padding: bare ? 0 : "22px 24px",
          width: "100%",
          maxWidth: bare ? 400 : (wide ? 820 : 460),
          boxShadow: bare ? "none" : "0 20px 50px rgba(0,0,0,.25)",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          boxSizing: "border-box",
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
const stepBtnCompact = {
  ...stepBtn,
  width: 16, height: 16, flex: "0 0 16px", borderRadius: 4, fontSize: 11,
};

// Pure helpers exported for node:test (see tests/ + src/test-exports.js).
export {
  parseTimeRange,
  teacherKey,
  normalizeV2,
  migrateOld,
  migrateV1toV2,
  upgrade,
  overlaps,
  buildScheduleIndexes,
  maxEndForPlacement,
  roomConflictsIndexed,
  teacherBusyIndexed,
  evaluatePlacement,
  lookupFreeRooms as freeRoomsAt,
  buildConflictReport,
  computeTabBlockMeta,
  dataSignature,
  layoutLanes,
  formatDayRange,
  classScheduleLines,
  sortCatalogForByClassView,
  isLocalDevHost,
  isVercelGitPreviewHost,
  isPreviewHost,
  isRemoteSyncEnabled,
  PRODUCTION_HOST,
  LIVE_V1_SEED,
  LIVE_SEED_TAG,
  defaultData,
  DEFAULT_PROGRAM_LABEL,
  cleanProgramLabel,
};
