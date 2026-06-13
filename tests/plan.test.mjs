import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_VERSION,
  PLAN_KIND,
  unpackRowData,
  packRowData,
  planRowToMeta,
  isPlanReadOnly,
  defaultPlanName,
  kindLabel,
  allocateLocalPlanId,
  createLocalPlanEntry,
  listPlansFromLocalStore,
  renameInLocalStore,
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
    name: "Fall draft",
    kind: PLAN_KIND.DRAFT,
    createdAt: "2026-06-01T12:00:00.000Z",
  });
  assert.equal(packed.planVersion, PLAN_VERSION);
  const u = unpackRowData(packed);
  assert.equal(u.planVersion, PLAN_VERSION);
  assert.equal(u.name, "Fall draft");
  assert.equal(u.kind, PLAN_KIND.DRAFT);
  assert.deepEqual(u.schedule, sampleSchedule);
});

test("planRowToMeta maps legacy row id=1 to live", () => {
  const meta = planRowToMeta({ id: 1, data: sampleSchedule, updated_at: "2026-06-01" });
  assert.equal(meta.kind, PLAN_KIND.LIVE);
  assert.equal(meta.name, "Main schedule");
  assert.equal(meta.planVersion, 2);
});

test("isPlanReadOnly only for archive", () => {
  assert.equal(isPlanReadOnly(PLAN_KIND.ARCHIVE), true);
  assert.equal(isPlanReadOnly(PLAN_KIND.LIVE), false);
  assert.equal(isPlanReadOnly(PLAN_KIND.DRAFT), false);
});

test("local plan store create, list, rename", () => {
  const store = {
    nextId: 2,
    plans: [{ id: 1, name: "Main schedule", kind: PLAN_KIND.LIVE, createdAt: "2026-01-01", data: packRowData(sampleSchedule, { name: "Main schedule", kind: PLAN_KIND.LIVE }) }],
  };
  const created = createLocalPlanEntry(store, {
    name: "Draft A",
    kind: PLAN_KIND.DRAFT,
    schedule: sampleSchedule,
  });
  assert.equal(created.id, 2);
  const listed = listPlansFromLocalStore(created.store);
  assert.equal(listed.length, 2);
  assert.equal(listed[1].name, "Draft A");
  assert.equal(listed[1].kind, PLAN_KIND.DRAFT);
  const renamed = renameInLocalStore(created.store, 2, "Renamed draft");
  assert.equal(listPlansFromLocalStore(renamed).find((p) => p.id === 2).name, "Renamed draft");
  assert.equal(allocateLocalPlanId(renamed), 3);
});

test("defaultPlanName and kindLabel", () => {
  const d = new Date("2026-06-13T12:00:00");
  assert.match(defaultPlanName(PLAN_KIND.DRAFT, d), /^New plan · /);
  assert.match(defaultPlanName(PLAN_KIND.ARCHIVE, d), /^Archive · /);
  assert.equal(defaultPlanName(PLAN_KIND.LIVE, d), "Main schedule");
  assert.equal(kindLabel(PLAN_KIND.DRAFT), "Planning");
});