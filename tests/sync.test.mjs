import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isLocalDevHost,
  isVercelGitPreviewHost,
  isPreviewHost,
  isRemoteSyncEnabled,
  PRODUCTION_HOST,
} from "../dist/test-logic.mjs";

test("isLocalDevHost recognizes localhost", () => {
  assert.equal(isLocalDevHost("localhost"), true);
  assert.equal(isLocalDevHost("127.0.0.1"), true);
  assert.equal(isLocalDevHost("classroom-scheduler-premier.vercel.app"), false);
});

test("isPreviewHost gates Vercel preview but not production", () => {
  assert.equal(isPreviewHost("foo-git-branch-user.vercel.app"), true);
  assert.equal(isPreviewHost(PRODUCTION_HOST), false);
  assert.equal(isPreviewHost("classroom-scheduler-abc123-yuyanxs-projects.vercel.app"), false);
  assert.equal(isPreviewHost("localhost"), false);
});

test("VERCEL_ENV=production enables sync on any Vercel hostname", () => {
  const prodUrl = "classroom-scheduler-7bbylnh0d-yuyanxs-projects.vercel.app";
  assert.equal(isPreviewHost(prodUrl, "production"), false);
  assert.equal(isRemoteSyncEnabled(prodUrl, "production"), true);
});

test("isVercelGitPreviewHost detects branch preview URLs", () => {
  assert.equal(
    isVercelGitPreviewHost("classroom-scheduler-git-feature-calendar-yuyanxs-projects.vercel.app"),
    true
  );
  assert.equal(isVercelGitPreviewHost("classroom-scheduler-7bbylnh0d-yuyanxs-projects.vercel.app"), false);
});

test("git preview URL never syncs even if bundle says production", () => {
  const previewUrl = "classroom-scheduler-git-feature-calendar-yuyanxs-projects.vercel.app";
  assert.equal(isPreviewHost(previewUrl, "production"), true);
  assert.equal(isRemoteSyncEnabled(previewUrl, "production"), false);
});

test("VERCEL_ENV=preview blocks sync even on production-looking host", () => {
  assert.equal(isPreviewHost(PRODUCTION_HOST, "preview"), true);
  assert.equal(isRemoteSyncEnabled(PRODUCTION_HOST, "preview"), false);
});

test("isRemoteSyncEnabled false for localhost and preview", () => {
  assert.equal(isRemoteSyncEnabled("localhost"), false);
  assert.equal(isRemoteSyncEnabled("foo-git-branch-user.vercel.app"), false);
  assert.equal(isRemoteSyncEnabled("classroom-scheduler-abc123-yuyanxs-projects.vercel.app"), true);
  assert.equal(isRemoteSyncEnabled(PRODUCTION_HOST), true);
});