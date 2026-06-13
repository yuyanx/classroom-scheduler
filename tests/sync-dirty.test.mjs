import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSyncRef,
  bumpLocalRevision,
  markRevisionSaved,
  isLocallyDirty,
  canApplyRemotePoll,
} from "../src/scheduleService.js";

test("dirty revision blocks remote poll until saved", () => {
  const ref = createSyncRef();
  assert.equal(isLocallyDirty(ref), false);
  assert.equal(canApplyRemotePoll(ref), true);

  bumpLocalRevision(ref);
  assert.equal(isLocallyDirty(ref), true);
  assert.equal(canApplyRemotePoll(ref), false);

  ref.pendingSave = true;
  assert.equal(canApplyRemotePoll(ref), false);

  ref.pendingSave = false;
  markRevisionSaved(ref);
  assert.equal(isLocallyDirty(ref), false);
  assert.equal(canApplyRemotePoll(ref), true);
});