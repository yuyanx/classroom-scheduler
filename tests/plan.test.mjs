import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_VERSION,
  PLAN_KIND,
  unpackRowData,
  packRowData,
  planRowToMeta,
  resolvePlanKind,
  isPlanReadOnly,
  isProtectedPlan,
  defaultPlanName,
  defaultRestoredPlanName,
  kindLabel,
  allocateLocalPlanId,
  createLocalPlanEntry,
  listPlansFromLocalStore,
  renameInLocalStore,
  deleteFromLocalStore,
  pickFallbackPlanId,
} from "../src/planService.js";

const sampleSchedule = {
  days: ["mon", "tue"],
  hours: { default: [540, 1020] },
  rooms: [{ id: "1", cap: 12 }],
  catalog: [{ id: "c1", name: "Math", teacher: "A", reg: 5, note: "" }],
  placements: [],
  teachers: ["A"],
};

test("unpackRowData treats legacy flat v2 as live plan", () => {
  const u = unpackRowData(sampleSchedule);
  assert.equal(u.planVersion, 2);
  assert.equal(u.kind, PLAN_KIND.LIVE);
  assert.equal(u.schedule, sampleSchedule);
  assert.equal(u.name, null);
});

test("packRowData and unpackRowData round-trip v3 envelope", () => {
  const packed = packRowData(sampleSchedule, {
    name: "Summer B",
    kind: PLAN_KIND.PLAN,
    createdAt: "2026-06-01T12:00:00.000Z",
  });
  assert.equal(packed.planVersion, PLAN_VERSION);
  const u = unpackRowData(packed);
  assert.equal(u.planVersion, PLAN_VERSION);
  assert.equal(u.name, "Summer B");
  assert.equal(u.kind, PLAN_KIND.PLAN);
  assert.deepEqual(u.schedule, sampleSchedule);
});

test("planRowToMeta maps legacy row id=1 to live", () => {
  const meta = planRowToMeta({ id: 1, data: sampleSchedule, updated_at: "2026-06-01" });
  assert.equal(meta.kind, PLAN_KIND.LIVE);
  assert.equal(meta.name, "Main schedule");
  assert.equal(meta.planVersion, 2);
});

test("planRowToMeta maps legacy v2 row id!=1 to Plan not Default", () => {
  const meta = planRowToMeta({ id: 999, data: sampleSchedule, updated_at: "2026-06-01" });
  assert.equal(meta.kind, PLAN_KIND.PLAN);
  assert.equal(kindLabel(meta.kind), "Plan");
  assert.equal(meta.name, "Plan 999");
});

test("resolvePlanKind only id=1 is Default", () => {
  const legacy = unpackRowData(sampleSchedule);
  assert.equal(resolvePlanKind(1, legacy), PLAN_KIND.LIVE);
  assert.equal(resolvePlanKind(999, legacy), PLAN_KIND.PLAN);
});

test("isPlanReadOnly only for archive", () => {
  assert.equal(isPlanReadOnly(PLAN_KIND.ARCHIVE), true);
  assert.equal(isPlanReadOnly(PLAN_KIND.LIVE), false);
  assert.equal(isPlanReadOnly(PLAN_KIND.PLAN), false);
  assert.equal(isPlanReadOnly(PLAN_KIND.DRAFT), false);
});

test("isProtectedPlan guards default schedule", () => {
  assert.equal(isProtectedPlan({ id: 1, kind: PLAN_KIND.LIVE }), true);
  assert.equal(isProtectedPlan({ id: 1, kind: PLAN_KIND.PLAN }), true);
  assert.equal(isProtectedPlan({ id: 2, kind: PLAN_KIND.PLAN }), false);
  assert.equal(isProtectedPlan({ id: 2, kind: PLAN_KIND.ARCHIVE }), false);
  assert.equal(isProtectedPlan({ id: 999, kind: PLAN_KIND.LIVE }), false);
});

test("local plan store create, list, rename, delete", () => {
  const store = {
    nextId: 2,
    plans: [{ id: 1, name: "Main schedule", kind: PLAN_KIND.LIVE, createdAt: "2026-01-01", data: packRowData(sampleSchedule, { name: "Main schedule", kind: PLAN_KIND.LIVE }) }],
  };
  const created = createLocalPlanEntry(store, {
    name: "Plan B",
    kind: PLAN_KIND.PLAN,
    schedule: sampleSchedule,
  });
  assert.equal(created.id, 2);
  const listed = listPlansFromLocalStore(created.store);
  assert.equal(listed.length, 2);
  assert.equal(listed[1].name, "Plan B");
  assert.equal(listed[1].kind, PLAN_KIND.PLAN);
  const renamed = renameInLocalStore(created.store, 2, "Renamed plan");
  assert.equal(listPlansFromLocalStore(renamed).find((p) => p.id === 2).name, "Renamed plan");
  assert.equal(allocateLocalPlanId(renamed), 3);
  const deleted = deleteFromLocalStore(renamed, 2);
  assert.equal(listPlansFromLocalStore(deleted).length, 1);
  assert.throws(() => deleteFromLocalStore(deleted, 1), /last plan/);
  assert.equal(pickFallbackPlanId(listed, 2), 1);
});

test("defaultPlanName, defaultRestoredPlanName, and kindLabel", () => {
  const d = new Date("2026-06-13T12:00:00");
  assert.match(defaultPlanName(PLAN_KIND.PLAN, d), /^New plan · /);
  assert.match(defaultPlanName(PLAN_KIND.ARCHIVE, d), /^Archive · /);
  assert.equal(defaultPlanName(PLAN_KIND.LIVE, d), "Main schedule");
  assert.equal(defaultRestoredPlanName("Archive · Jun 1"), "Restored · Archive · Jun 1");
  assert.equal(kindLabel(PLAN_KIND.PLAN), "Plan");
  assert.equal(kindLabel(PLAN_KIND.DRAFT), "Plan");
  assert.equal(kindLabel(PLAN_KIND.LIVE), "Default");
});