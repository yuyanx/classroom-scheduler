#!/usr/bin/env node
/**
 * Restore a plan from its hidden auto-backup row (id = 10000 + planId).
 * Usage: node scripts/restore-auto-backup.mjs [planId]
 */
import { autoBackupRowId, unpackRowData, packRowData, PLAN_KIND } from "../src/planService.js";

const SUPABASE_URL = "https://zbvedbwbxdzcsnftvyph.supabase.co";
const SUPABASE_KEY = "sb_publishable_cDEmeJDF7lwuafg8ZYKF4Q_Sl_fUSTE";
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const planId = parseInt(process.argv[2] || "1", 10);
const backupId = autoBackupRowId(planId);

const load = async (id) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/schedule?id=eq.${id}&select=id,data,updated_at`, { headers });
  if (!res.ok) throw new Error(`load ${id}: HTTP ${res.status}`);
  const rows = await res.json();
  return rows[0] || null;
};

const backup = await load(backupId);
if (!backup) throw new Error(`No auto-backup at row id=${backupId} (plan ${planId})`);

const u = unpackRowData(backup.data);
const catalog = u.schedule?.catalog?.length || 0;
const placements = u.schedule?.placements?.length || 0;
if (!catalog) throw new Error("Auto-backup has no classes");

console.log(`Restoring plan ${planId} from auto-backup row ${backupId}`);
console.log(`  backup saved: ${backup.data?.backupMeta?.savedAt || backup.updated_at}`);
console.log(`  classes: ${catalog}, placements: ${placements}`);

const target = await load(planId);
const meta = target?.data?.plan
  ? { name: target.data.plan.name, kind: planId === 1 ? PLAN_KIND.LIVE : target.data.plan.kind, createdAt: target.data.plan.createdAt }
  : { name: planId === 1 ? "Main schedule" : `Plan ${planId}`, kind: planId === 1 ? PLAN_KIND.LIVE : PLAN_KIND.PLAN, createdAt: new Date().toISOString() };

const packed = packRowData(u.schedule, meta);
const res = await fetch(`${SUPABASE_URL}/rest/v1/schedule?on_conflict=id`, {
  method: "POST",
  headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
  body: JSON.stringify({ id: planId, data: packed, updated_at: new Date().toISOString() }),
});
if (!res.ok) throw new Error(`restore failed: HTTP ${res.status} ${await res.text()}`);
const saved = await res.json();
console.log("Restore OK at", saved[0]?.updated_at);