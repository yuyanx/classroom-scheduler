import { test } from "node:test";
import assert from "node:assert/strict";
import {
  upgrade,
  migrateOld,
  migrateV1toV2,
  normalizeV2,
  parseTimeRange,
  LIVE_V1_SEED,
} from "../dist/test-logic.mjs";

const tinyV1 = {
  rooms: { morning: ["1", "2+3"], afternoon: ["1", "2", "3"] },
  slots: {
    morning: ["9:00–10:30"],
    mon: ["12:30–2:00"],
    tue: ["12:30–2:00"],
    wed: ["12:30–2:00"],
    thu: ["12:30–2:00"],
    fri: ["12:30–2:00"],
  },
  roomCaps: { morning: { "1": 12, "2+3": 25 }, afternoon: { "1": 12, "2": 12, "3": 12 } },
  catalog: [{ id: "k1", name: "SAT", teacher: "Amy", reg: 5, note: "" }],
  placements: [{ id: "p1", classId: "k1", section: "morning", slotIdx: 0, room: "2+3" }],
  teachers: ["Amy"],
  nextId: 10,
};

test("upgrade(null) returns default v2", () => {
  const v2 = upgrade(null);
  assert.equal(v2.version, 2);
  assert.ok(v2.catalog.length > 0);
});

test("migrateOld collapses duplicate classes into one catalog entry", () => {
  const v1 = migrateOld({
    rooms: { morning: ["1"], afternoon: ["1"] },
    slots: { morning: ["9:00–10:30"], mon: ["12:30–2:00"], tue: [], wed: [], thu: [], fri: [] },
    classes: [
      { section: "mon", slotIdx: 0, room: "1", name: "Bio", teacher: "A", reg: 1, cap: 12 },
      { section: "tue", slotIdx: 0, room: "1", name: "Bio", teacher: "A", reg: 1, cap: 12 },
    ],
  });
  assert.equal(v1.catalog.length, 1);
  assert.equal(v1.placements.length, 2);
});

test("migrateV1toV2 expands morning to five weekdays", () => {
  const v2 = migrateV1toV2(JSON.parse(JSON.stringify(tinyV1)));
  const monFri = v2.placements.filter((p) => p.classId === "k1");
  assert.equal(monFri.length, 5);
  assert.deepEqual([...new Set(monFri.map((p) => p.day))].sort(), ["fri", "mon", "thu", "tue", "wed"]);
});

test("migrateV1toV2 maps 2+3 room to rooms array", () => {
  const v2 = migrateV1toV2(JSON.parse(JSON.stringify(tinyV1)));
  const p = v2.placements.find((x) => x.classId === "k1");
  assert.deepEqual(p.rooms, ["2", "3"]);
});

test("migrateV1toV2 applies note time override and clears note", () => {
  const v1 = JSON.parse(JSON.stringify(tinyV1));
  v1.catalog[0].note = "2:30–4:00";
  v1.placements = [{ id: "p2", classId: "k1", section: "mon", slotIdx: 0, room: "1" }];
  const v2 = migrateV1toV2(v1);
  const p = v2.placements.find((x) => x.day === "mon");
  assert.equal(p.start, 870);
  assert.equal(p.end, 960);
  assert.equal(v2.catalog[0].note, "");
});

test("normalizeV2 dissolves legacy occupies combined rooms", () => {
  const raw = {
    version: 2,
    days: ["mon"],
    hours: { default: [540, 1020] },
    rooms: [
      { id: "2+3", cap: 25, occupies: ["2", "3"] },
      { id: "2", cap: 12 },
      { id: "3", cap: 12 },
    ],
    catalog: [{ id: "k1", name: "X", teacher: "", reg: 0, note: "" }],
    placements: [{ id: "p1", classId: "k1", day: "mon", start: 540, end: 630, rooms: ["2+3"] }],
    teachers: [],
    nextId: 2,
  };
  const v2 = normalizeV2(raw);
  assert.ok(!v2.rooms.some((r) => r.id === "2+3"));
  assert.deepEqual(v2.placements[0].rooms, ["2", "3"]);
});

test("normalizeV2 drops invalid placements", () => {
  const v2 = normalizeV2({
    version: 2,
    days: ["mon"],
    hours: { default: [540, 1020] },
    rooms: [{ id: "1", cap: 12 }],
    catalog: [{ id: "k1", name: "A", teacher: "", reg: 0, note: "" }],
    placements: [
      { id: "p1", classId: "k1", day: "mon", start: 600, end: 600, rooms: ["1"] },
      { id: "p2", classId: "orphan", day: "mon", start: 540, end: 630, rooms: ["1"] },
    ],
    teachers: [],
    nextId: 3,
  });
  assert.equal(v2.placements.length, 0);
});

test("parseTimeRange returns null when end <= start", () => {
  assert.equal(parseTimeRange("10:00–9:00"), null);
});

test("LIVE_V1_SEED upgraded has more placements than catalog", () => {
  const v2 = upgrade(JSON.parse(JSON.stringify(LIVE_V1_SEED)));
  assert.ok(v2.placements.length > v2.catalog.length);
});