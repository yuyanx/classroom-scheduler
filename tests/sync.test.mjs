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

test("VERCEL_ENV=production enables sync on any Vercel hostname", () => {
  const prodUrl = "classroom-scheduler-7bbylnh0d-yuyanxs-projects.vercel.app";
  assert.equal(isPreviewHost(prodUrl, "production"), false);
  assert.equal(isRemoteSyncEnabled(prodUrl, "production"), true);
});

test("VERCEL_ENV=preview blocks sync even on production-looking host", () => {
  assert.equal(isPreviewHost(PRODUCTION_HOST, "preview"), true);
  assert.equal(isRemoteSyncEnabled(PRODUCTION_HOST, "preview"), false);
});

test("isRemoteSyncEnabled false for localhost and preview", () => {
  assert.equal(isRemoteSyncEnabled("localhost"), false);
  assert.equal(isRemoteSyncEnabled("branch-preview.vercel.app"), false);
  assert.equal(isRemoteSyncEnabled(PRODUCTION_HOST), true);
});