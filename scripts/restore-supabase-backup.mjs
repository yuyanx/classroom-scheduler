#!/usr/bin/env node
/**
 * Restore Supabase schedule row from a backups/*.json file.
 * Usage: node scripts/restore-supabase-backup.mjs [path-to-backup.json]
 */
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SUPABASE_URL = "https://zbvedbwbxdzcsnftvyph.supabase.co";
const SUPABASE_KEY = "sb_publishable_cDEmeJDF7lwuafg8ZYKF4Q_Sl_fUSTE";

const arg = process.argv[2];
let backupPath = arg;
if (!backupPath) {
  const dir = join(ROOT, "backups");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
  if (!files.length) throw new Error("No backup files in backups/");
  backupPath = join(dir, files[0]);
}

const backup = JSON.parse(readFileSync(backupPath, "utf8"));
const data = backup.data;
if (!data?.catalog || !data?.placements) throw new Error("Invalid backup: missing catalog/placements");

console.log("Restoring from", backupPath);
console.log("Backup updated_at:", backup.updated_at);
console.log("version:", data.version ?? "v1-slots");
console.log("catalog:", data.catalog.length, "placements:", data.placements.length);

const res = await fetch(`${SUPABASE_URL}/rest/v1/schedule?on_conflict=id`, {
  method: "POST",
  headers: {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  },
  body: JSON.stringify({ id: backup.id ?? 1, data, updated_at: new Date().toISOString() }),
});
if (!res.ok) throw new Error(`Restore failed HTTP ${res.status}: ${await res.text()}`);
const saved = await res.json();
console.log("Restore OK at", saved[0]?.updated_at);