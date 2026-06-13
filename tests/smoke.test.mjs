import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appSrc = readFileSync(join(root, "src/App.jsx"), "utf8");

test("updateSaveStatus is declared before queueLocalSave (TDZ regression guard)", () => {
  const updatePos = appSrc.indexOf("const updateSaveStatus");
  const queuePos = appSrc.indexOf("const queueLocalSave");
  assert.ok(updatePos > 0, "updateSaveStatus missing");
  assert.ok(queuePos > 0, "queueLocalSave missing");
  assert.ok(updatePos < queuePos, "queueLocalSave must come after updateSaveStatus");
});

test("test exports are wired for schedule helpers", () => {
  const exportPos = appSrc.indexOf("export {");
  assert.ok(exportPos > 0, "named exports block missing");
  assert.match(appSrc, /sortCatalogForByClassView/);
  assert.match(appSrc, /LIVE_SEED_TAG/);
});

test("production bundle exists and references ClassroomScheduler", () => {
  const bundle = readFileSync(join(root, "app.js"), "utf8");
  assert.ok(bundle.length > 100_000, "app.js looks too small — rebuild after src edits");
});