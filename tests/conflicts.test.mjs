import { test } from "node:test";
import assert from "node:assert/strict";
import {
  overlaps,
  buildScheduleIndexes,
  roomConflictsIndexed,
  teacherBusyIndexed,
  maxEndForPlacement,
} from "../dist/test-logic.mjs";

const baseV2 = {
  version: 2,
  days: ["mon"],
  hours: { default: [480, 1020] },
  rooms: [{ id: "1", cap: 12 }, { id: "2", cap: 12 }, { id: "3", cap: 12 }],
  catalog: [
    { id: "a", name: "A", teacher: "Amy", reg: 1, note: "" },
    { id: "b", name: "B", teacher: "Bob", reg: 1, note: "" },
    { id: "c", name: "C", teacher: "TBD", reg: 0, note: "" },
  ],
  placements: [],
  teachers: ["Amy", "Bob"],
  nextId: 10,
};

test("overlaps returns false for adjacent intervals", () => {
  const a = { day: "mon", start: 540, end: 630 };
  const b = { day: "mon", start: 630, end: 720 };
  assert.equal(overlaps(a, b), false);
});

test("roomConflictsIndexed respects excludeId and excludeClassId", () => {
  const data = {
    ...baseV2,
    placements: [
      { id: "p1", classId: "a", day: "mon", start: 540, end: 630, rooms: ["1"] },
      { id: "p2", classId: "b", day: "mon", start: 600, end: 690, rooms: ["1"] },
    ],
  };
  const idx = buildScheduleIndexes(data);
  const cand = { day: "mon", start: 600, end: 690, rooms: ["1"] };
  assert.equal(roomConflictsIndexed(idx, cand, { excludeId: "p2" }).length, 1);
  assert.equal(roomConflictsIndexed(idx, cand, { excludeClassId: "a" }).length, 1);
  assert.equal(roomConflictsIndexed(idx, cand, { excludeClassId: "b" }).length, 1);
  const sameClass = {
    ...baseV2,
    placements: [
      { id: "p1", classId: "a", day: "mon", start: 540, end: 630, rooms: ["1"] },
      { id: "p2", classId: "a", day: "mon", start: 600, end: 690, rooms: ["2"] },
    ],
  };
  const idx2 = buildScheduleIndexes(sameClass);
  const cand2 = { day: "mon", start: 600, end: 690, rooms: ["1"] };
  assert.equal(roomConflictsIndexed(idx2, cand2, { excludeClassId: "a" }).length, 0);
});

test("roomConflictsIndexed detects clash via shared multi-room member", () => {
  const data = {
    ...baseV2,
    placements: [
      { id: "p1", classId: "a", day: "mon", start: 540, end: 630, rooms: ["2"] },
    ],
  };
  const idx = buildScheduleIndexes(data);
  const cand = { day: "mon", start: 540, end: 630, rooms: ["2", "3"] };
  assert.equal(roomConflictsIndexed(idx, cand).length, 1);
});

test("teacherBusyIndexed returns empty for TBD teacher", () => {
  const data = {
    ...baseV2,
    placements: [
      { id: "p1", classId: "c", day: "mon", start: 540, end: 630, rooms: ["1"] },
      { id: "p2", classId: "c", day: "mon", start: 600, end: 690, rooms: ["2"] },
    ],
  };
  const idx = buildScheduleIndexes(data);
  const busy = teacherBusyIndexed(idx, data.placements[1], "TBD", { excludePlacementId: "p2" });
  assert.equal(busy.length, 0);
});

test("maxEndForPlacement limits before next blocker", () => {
  const data = {
    ...baseV2,
    placements: [
      { id: "p1", classId: "a", day: "mon", start: 600, end: 660, rooms: ["1"] },
      { id: "p2", classId: "b", day: "mon", start: 690, end: 750, rooms: ["1"] },
    ],
  };
  const idx = buildScheduleIndexes(data);
  const p1 = data.placements[0];
  assert.equal(maxEndForPlacement(idx, p1, 1020), 690);
});

test("maxEndForPlacement caps envelope blocker at current end", () => {
  const data = {
    ...baseV2,
    placements: [
      { id: "p1", classId: "a", day: "mon", start: 600, end: 660, rooms: ["1"] },
      { id: "p2", classId: "b", day: "mon", start: 540, end: 720, rooms: ["1"] },
    ],
  };
  const idx = buildScheduleIndexes(data);
  const p1 = data.placements[0];
  assert.equal(maxEndForPlacement(idx, p1, 1020), 660);
});

test("maxEndForPlacement uses combined room bucket", () => {
  const data = {
    ...baseV2,
    placements: [
      { id: "p1", classId: "a", day: "mon", start: 600, end: 660, rooms: ["2", "3"] },
      { id: "p2", classId: "b", day: "mon", start: 690, end: 750, rooms: ["2"] },
    ],
  };
  const idx = buildScheduleIndexes(data);
  assert.equal(maxEndForPlacement(idx, data.placements[0], 1020), 690);
});