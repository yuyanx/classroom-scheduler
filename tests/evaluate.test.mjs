import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildScheduleIndexes,
  evaluatePlacement,
  freeRoomsAt,
  buildConflictReport,
  buildStudentConflictClassIds,
  studentConflictLabelsAt,
} from "../dist/test-logic.mjs";

const baseV2 = {
  version: 2,
  days: ["mon"],
  hours: { default: [480, 1020] },
  rooms: [{ id: "1", cap: 12 }, { id: "2", cap: 12 }, { id: "3", cap: 12 }],
  catalog: [
    { id: "a", name: "A", teacher: "Amy", reg: 1, note: "" },
    { id: "b", name: "B", teacher: "Amy", reg: 1, note: "" },
    { id: "c", name: "C", teacher: "Bob", reg: 1, note: "" },
  ],
  placements: [
    { id: "p1", classId: "a", day: "mon", start: 540, end: 630, rooms: ["1"] },
    { id: "p2", classId: "b", day: "mon", start: 600, end: 690, rooms: ["2"] },
    { id: "p3", classId: "c", day: "mon", start: 540, end: 630, rooms: ["3"] },
  ],
  teachers: ["Amy", "Bob"],
  nextId: 10,
};

test("evaluatePlacement detects room and teacher conflicts", () => {
  const idx = buildScheduleIndexes(baseV2);
  const roomCand = { day: "mon", start: 600, end: 690, rooms: ["1"] };
  const roomEv = evaluatePlacement(idx, roomCand, { excludePlacementId: "p2" });
  assert.equal(roomEv.ok, false);
  assert.equal(roomEv.roomConflictNames[0], "A");

  const teacherCand = { day: "mon", start: 630, end: 720, rooms: ["1"] };
  const teacherEv = evaluatePlacement(idx, teacherCand, { teacher: "Amy" });
  assert.equal(teacherEv.ok, true);
  assert.equal(teacherEv.hasTeacherConflict, true);
  assert.equal(teacherEv.teacherLabels.length, 1);
});

test("freeRoomsAt lists only unoccupied rooms", () => {
  const idx = buildScheduleIndexes(baseV2);
  const cand = { day: "mon", start: 700, end: 780 };
  const free = freeRoomsAt(idx, cand, ["1", "2", "3"]);
  assert.deepEqual(free, ["1", "2", "3"]);
});

test("buildConflictReport dedupes pairs and sorts", () => {
  const idx = buildScheduleIndexes(baseV2);
  const report = buildConflictReport(idx, baseV2);
  const roomItems = report.filter((x) => x.type === "room");
  const teacherItems = report.filter((x) => x.type === "teacher");
  assert.equal(roomItems.length, 0);
  assert.equal(teacherItems.length, 1);
  assert.match(teacherItems[0].label, /Amy/);
});

test("placementsByDayTeacher speeds teacher lookup", () => {
  const idx = buildScheduleIndexes(baseV2);
  assert.ok(idx.placementsByDayTeacher.has("mon\0amy"));
  assert.equal(idx.placementsByDayTeacher.get("mon\0amy").length, 2);
});

test("buildConflictReport detects student schedule conflicts", () => {
  const data = {
    ...baseV2,
    catalog: [
      { id: "a", name: "ELA", teacher: "Amy", reg: 1, note: "", students: ["Alex Chen"] },
      { id: "b", name: "Math", teacher: "Bob", reg: 1, note: "", students: ["Alex Chen"] },
      { id: "c", name: "Art", teacher: "Cara", reg: 1, note: "", students: ["Jordan Lee"] },
    ],
    placements: [
      { id: "p1", classId: "a", day: "mon", start: 540, end: 630, rooms: ["1"] },
      { id: "p2", classId: "b", day: "mon", start: 600, end: 690, rooms: ["2"] },
      { id: "p3", classId: "c", day: "mon", start: 540, end: 630, rooms: ["3"] },
    ],
  };
  const idx = buildScheduleIndexes(data);
  const report = buildConflictReport(idx, data);
  const studentItems = report.filter((x) => x.type === "student");
  assert.equal(studentItems.length, 1);
  assert.match(studentItems[0].label, /Alex Chen/);
  assert.match(studentItems[0].label, /ELA/);
  assert.match(studentItems[0].label, /Math/);
  assert.match(studentItems[0].label, /Rm 1\+2/);

  const byStudent = buildStudentConflictClassIds(data.catalog, data.placements);
  assert.ok(byStudent.get("alex chen")?.has("a"));
  assert.ok(byStudent.get("alex chen")?.has("b"));
  assert.equal(byStudent.get("jordan lee"), undefined);

  const labels = studentConflictLabelsAt(data.catalog, data.placements, {
    excludeClassId: "a",
    rosterStudents: ["Alex Chen"],
    cand: { day: "mon", start: 540, end: 630 },
  });
  assert.equal(labels.length, 1);
  assert.match(labels[0], /Math/);
});