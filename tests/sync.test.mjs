import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isLocalDevHost,
  isPreviewHost,
  isRemoteSyncEnabled,
  PRODUCTION_HOST,
} from "../dist/test-logic.mjs";

test("isLocalDevHost recognizes localhost", () => {
  assert.equal(isLocalDevHost("localhost"), true);
  assert.equal(isLocalDevHost("127.0.0.1"), true);
  assert.equal(isLocalDevHost("classroom-scheduler-ruddy.vercel.app"), false);
});

test("isPreviewHost gates Vercel preview but not production", () => {
  assert.equal(isPreviewHost("foo-git-branch-user.vercel.app"), true);
  assert.equal(isPreviewHost(PRODUCTION_HOST), false);
  assert.equal(isPreviewHost("localhost"), false);
});

test("isRemoteSyncEnabled false for localhost and preview", () => {
  assert.equal(isRemoteSyncEnabled("localhost"), false);
  assert.equal(isRemoteSyncEnabled("branch-preview.vercel.app"), false);
  assert.equal(isRemoteSyncEnabled(PRODUCTION_HOST), true);
});