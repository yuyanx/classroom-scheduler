#!/usr/bin/env node
/**
 * Backup current Supabase schedule row, then restore v1 defaultData() for main production.
 * Usage: node scripts/rollback-supabase-v1.mjs
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { buildSync } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SUPABASE_URL = "https://zbvedbwbxdzcsnftvyph.supabase.co";
const SUPABASE_KEY = "sb_publishable_cDEmeJDF7lwuafg8ZYKF4Q_Sl_fUSTE";
const ROW_ID = 1;

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

buildSync({
  entryPoints: [join(ROOT, "scripts/rollback-entry.js")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: join(ROOT, "dist/rollback-bundle.mjs"),
  packages: "external",
  loader: { ".jsx": "jsx" },
  jsx: "automatic",
});

const { defaultData } = await import(join(ROOT, "dist/rollback-bundle.mjs"));
const v1 = defaultData();

const loadRes = await fetch(
  `${SUPABASE_URL}/rest/v1/schedule?id=eq.${ROW_ID}&select=data,updated_at`,
  { headers }
);
if (!loadRes.ok) throw new Error(`Backup load failed HTTP ${loadRes.status}`);
const rows = await loadRes.json();
const current = rows[0];
if (!current) throw new Error("No schedule row id=1 found");

const backupDir = join(ROOT, "backups");
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backupPath = join(backupDir, `supabase-before-v1-rollback-${stamp}.json`);
writeFileSync(
  backupPath,
  JSON.stringify({ id: ROW_ID, updated_at: current.updated_at, data: current.data }, null, 2)
);
console.log("Backed up current row to", backupPath);
console.log("Previous version:", current.data?.version ?? "(v1 slots shape)");
console.log("Placements:", current.data?.placements?.length ?? 0);

const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/schedule?on_conflict=id`, {
  method: "POST",
  headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
  body: JSON.stringify({ id: ROW_ID, data: v1, updated_at: new Date().toISOString() }),
});
if (!saveRes.ok) {
  const err = await saveRes.text();
  throw new Error(`Rollback save failed HTTP ${saveRes.status}: ${err}`);
}
const saved = await saveRes.json();
console.log("Rollback OK — restored v1 default seed at", saved[0]?.updated_at);
console.log("rooms.morning:", v1.rooms?.morning?.length, "rooms.afternoon:", v1.rooms?.afternoon?.length);
console.log("catalog:", v1.catalog?.length, "placements:", v1.placements?.length);