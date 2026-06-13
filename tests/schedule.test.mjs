import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTimeRange,
  teacherKey,
  upgrade,
  migrateV1toV2,
  buildScheduleIndexes,
  roomConflictsIndexed,
  teacherBusyIndexed,
  computeTabBlockMeta,
  classScheduleLines,
  sortCatalogForByClassView,
  layoutLanes,
  formatDayRange,
  overlaps,
  dataSignature,
  LIVE_V1_SEED,
  LIVE_SEED_TAG,
  roomOverviewColor,
  primaryRoomForPlacement,
  computeWeekOverviewLayout,
  ROOM_OVERVIEW_PALETTE,
} from "../dist/test-logic.mjs";

const tinyV1 = {
  rooms: { morning: ["1"], afternoon: ["1", "2"] },
  slots: {
    morning: ["9:00–10:30"],
    mon: ["12:30–2:00"],
    tue: ["12:30–2:00"],
    wed: ["12:30–2:00"],
    thu: ["12:30–2:00"],
    fri: ["12:30–2:00"],
  },
  roomCaps: { morning: { "1": 12 }, afternoon: { "1": 12, "2": 12 } },
  catalog: [
    { id: "k1", name: "Algebra", teacher: "Amy", reg: 5, note: "" },
    { id: "k2", name: "Biology", teacher: "Bob", reg: 3, note: "" },
  ],
  placements: [
    { id: "p1", classId: "k1", section: "morning", slotIdx: 0, room: "1" },
    { id: "p2", classId: "k2", section: "mon", slotIdx: 0, room: "2" },
  ],
  teachers: ["Amy", "Bob"],
  nextId: 10,
};

const tinyV2 = () => migrateV1toV2(JSON.parse(JSON.stringify(tinyV1)));

test("parseTimeRange parses slot labels", () => {
  assert.deepEqual(parseTimeRange("9:00–10:30"), [540, 630]);
  assert.deepEqual(parseTimeRange("12:30–2:00"), [750, 840]);
  assert.equal(parseTimeRange("not a time"), null);
});

test("teacherKey treats TBD as empty", () => {
  assert.equal(teacherKey("TBD"), "");
  assert.equal(teacherKey("  amy  "), "amy");
});

test("upgrade migrates v1 seed to v2", () => {
  const v2 = upgrade(tinyV1);
  assert.equal(v2.version, 2);
  assert.ok(v2.placements.every((p) => p.day && Number.isFinite(p.start)));
  assert.ok(v2.placements.some((p) => p.classId === "k1" && p.day === "wed"));
});

test("upgrade is idempotent on v2", () => {
  const once = tinyV2();
  const twice = upgrade(JSON.parse(JSON.stringify(once)));
  assert.equal(dataSignature(once), dataSignature(twice));
});

test("LIVE_V1_SEED upgrades to v2 with expected tag", () => {
  assert.equal(LIVE_SEED_TAG, "prod-2026-06-12T21:23");
  const v2 = upgrade(JSON.parse(JSON.stringify(LIVE_V1_SEED)));
  assert.equal(v2.version, 2);
  assert.ok(v2.catalog.length > 0);
  assert.ok(v2.placements.length > v2.catalog.length, "morning classes expand to weekdays");
});

test("overlaps detects same-day time collisions", () => {
  const a = { day: "mon", start: 540, end: 630 };
  const b = { day: "mon", start: 600, end: 690 };
  const c = { day: "tue", start: 540, end: 630 };
  assert.equal(overlaps(a, b), true);
  assert.equal(overlaps(a, c), false);
});

test("buildScheduleIndexes + roomConflictsIndexed", () => {
  const data = tinyV2();
  const idx = buildScheduleIndexes(data);
  const clash = roomConflictsIndexed(idx, {
    day: "mon",
    start: 750,
    end: 840,
    rooms: ["2"],
  });
  assert.equal(clash.length, 1);
  assert.equal(clash[0].classId, "k2");
});

test("teacherBusyIndexed finds double-booked teacher", () => {
  const data = {
    version: 2,
    days: ["mon"],
    hours: { default: [480, 1020] },
    rooms: [{ id: "1", cap: 12 }, { id: "2", cap: 12 }],
    catalog: [
      { id: "a", name: "Class A", teacher: "Amy", reg: 1, note: "" },
      { id: "b", name: "Class B", teacher: "Amy", reg: 1, note: "" },
    ],
    placements: [
      { id: "p1", classId: "a", day: "mon", start: 540, end: 630, rooms: ["1"] },
      { id: "p2", classId: "b", day: "mon", start: 600, end: 690, rooms: ["2"] },
    ],
    teachers: ["Amy"],
    nextId: 3,
  };
  const idx = buildScheduleIndexes(data);
  const busy = teacherBusyIndexed(idx, data.placements[1], "Amy", { excludePlacementId: "p2" });
  assert.equal(busy.length, 1);
  assert.equal(busy[0].placement.id, "p1");
});

test("computeTabBlockMeta attaches clash metadata", () => {
  const data = {
    version: 2,
    days: ["mon"],
    hours: { default: [480, 1020] },
    rooms: [{ id: "1", cap: 12 }],
    catalog: [{ id: "a", name: "A", teacher: "Amy", reg: 1, note: "" }],
    placements: [
      { id: "p1", classId: "a", day: "mon", start: 540, end: 630, rooms: ["1"] },
      { id: "p2", classId: "a", day: "mon", start: 600, end: 690, rooms: ["1"] },
    ],
    teachers: ["Amy"],
    nextId: 3,
  };
  const idx = buildScheduleIndexes(data);
  const meta = computeTabBlockMeta(idx, "mon");
  assert.equal(meta.get("p2").roomClashes.length, 1);
});

test("classScheduleLines groups weekdays", () => {
  const placements = WEEKDAY_PLACEMENTS("k1", 540, 630, ["1"]);
  const lines = classScheduleLines(placements, "k1");
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^Mon to Fri 9:00–10:30 AM$/);
});

test("formatDayRange collapses Mon–Fri", () => {
  assert.equal(formatDayRange(["fri", "mon", "wed", "tue", "thu"]), "Mon to Fri");
});

test("sortCatalogForByClassView: unscheduled first, then letter, then time", () => {
  const catalog = [
    { id: "z", name: "Zebra", teacher: "", reg: 0, note: "" },
    { id: "b", name: "Biology", teacher: "", reg: 0, note: "" },
    { id: "a", name: "Algebra", teacher: "", reg: 0, note: "" },
  ];
  const placements = [
    { id: "p1", classId: "a", day: "mon", start: 600, end: 690, rooms: ["1"] },
    { id: "p2", classId: "b", day: "mon", start: 540, end: 630, rooms: ["1"] },
  ];
  const sorted = sortCatalogForByClassView(catalog, placements);
  assert.deepEqual(sorted.map((k) => k.id), ["z", "a", "b"]);
});

test("sortCatalogForByClassView: same numeric prefix sorts by earliest time", () => {
  const catalog = [
    { id: "ela", name: "5/6th ELA", teacher: "", reg: 0, note: "" },
    { id: "math", name: "5/6th Math", teacher: "", reg: 0, note: "" },
  ];
  const placements = [
    { id: "p1", classId: "ela", day: "mon", start: 630, end: 720, rooms: ["4"] },
    { id: "p2", classId: "math", day: "mon", start: 540, end: 630, rooms: ["5"] },
  ];
  const sorted = sortCatalogForByClassView(catalog, placements);
  assert.deepEqual(sorted.map((k) => k.id), ["math", "ela"]);
});

test("roomOverviewColor maps rooms to distinct palette entries", () => {
  const order = ["1", "2", "3"];
  assert.notDeepEqual(roomOverviewColor("1", order), roomOverviewColor("2", order));
  assert.equal(roomOverviewColor("1", order).bg, ROOM_OVERVIEW_PALETTE[0].bg);
});

test("primaryRoomForPlacement picks lowest-ordered room", () => {
  assert.equal(primaryRoomForPlacement(["3", "1"], ["1", "2", "3"]), "1");
});

test("computeWeekOverviewLayout builds lanes per day", () => {
  const placements = [
    { id: "p1", classId: "a", day: "mon", start: 540, end: 630, rooms: ["1"] },
    { id: "p2", classId: "b", day: "mon", start: 600, end: 690, rooms: ["2"] },
    { id: "p3", classId: "c", day: "tue", start: 540, end: 630, rooms: ["1"] },
  ];
  const idx = buildScheduleIndexes({ catalog: [], placements, rooms: [] });
  const layout = computeWeekOverviewLayout(["mon", "tue"], { default: [540, 1020] }, idx.placementsByDay);
  assert.ok(layout.gridH > 0);
  assert.equal(layout.lanesByDay.get("mon")?.get("p1")?.lanes, 2);
});

test("layoutLanes assigns columns for overlaps", () => {
  const list = [
    { id: "p1", start: 540, end: 630 },
    { id: "p2", start: 600, end: 690 },
  ];
  const lanes = layoutLanes(list);
  assert.equal(lanes.get("p1").lanes, 2);
  assert.notEqual(lanes.get("p1").lane, lanes.get("p2").lane);
});

function WEEKDAY_PLACEMENTS(classId, start, end, rooms) {
  return ["mon", "tue", "wed", "thu", "fri"].map((day, i) => ({
    id: `p${i}`,
    classId,
    day,
    start,
    end,
    rooms,
  }));
}