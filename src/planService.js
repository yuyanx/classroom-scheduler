// v3 — multiple shared schedule plans per Supabase row or local store.
// Editable plans (live / plan / legacy draft) + read-only archives.

export const PLAN_VERSION = 3;
export const ACTIVE_PLAN_KEY = "premier-active-plan-id";
export const LOCAL_PLANS_KEY = "premier-plans-v3";

export const PLAN_KIND = {
  LIVE: "live",
  PLAN: "plan",
  DRAFT: "draft", // legacy — treated same as plan
  ARCHIVE: "archive",
};

const KIND_LABEL = {
  live: "Default",
  plan: "Plan",
  draft: "Plan",
  archive: "Archive",
};

export const kindLabel = (kind) => KIND_LABEL[kind] || "Plan";

export function defaultPlanName(kind, date = new Date()) {
  const stamp = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (kind === PLAN_KIND.ARCHIVE) return `Archive · ${stamp}`;
  if (kind === PLAN_KIND.LIVE) return "Main schedule";
  return `New plan · ${stamp}`;
}

export function defaultRestoredPlanName(sourceName) {
  const base = String(sourceName || "").trim() || "Archive";
  return `Restored · ${base}`;
}

/** Unwrap Supabase `data` jsonb — legacy v2 flat schedule or v3 envelope. */
export function unpackRowData(data) {
  if (data?.planVersion === PLAN_VERSION && data.schedule) {
    return {
      planVersion: PLAN_VERSION,
      name: String(data.plan?.name || "").trim() || "Untitled plan",
      kind: data.plan?.kind || PLAN_KIND.PLAN,
      createdAt: data.plan?.createdAt || null,
      schedule: data.schedule,
    };
  }
  return {
    planVersion: 2,
    name: null,
    kind: PLAN_KIND.LIVE,
    createdAt: null,
    schedule: data,
  };
}

export function packRowData(schedule, { name, kind, createdAt }) {
  return {
    planVersion: PLAN_VERSION,
    plan: {
      name: String(name || "").trim() || defaultPlanName(kind),
      kind: kind || PLAN_KIND.PLAN,
      createdAt: createdAt || new Date().toISOString(),
    },
    schedule,
  };
}

/** Only row id=1 is Default; legacy v2 rows elsewhere are editable Plans. */
export function resolvePlanKind(planId, unpacked) {
  if (planId === 1) return PLAN_KIND.LIVE;
  if (unpacked.planVersion === 2) return PLAN_KIND.PLAN;
  if (unpacked.kind === PLAN_KIND.LIVE) return PLAN_KIND.PLAN;
  return unpacked.kind || PLAN_KIND.PLAN;
}

export function planRowToMeta(row) {
  const u = unpackRowData(row.data);
  return {
    id: row.id,
    name: u.name || (row.id === 1 ? "Main schedule" : `Plan ${row.id}`),
    kind: resolvePlanKind(row.id, u),
    updated_at: row.updated_at,
    planVersion: u.planVersion === PLAN_VERSION ? PLAN_VERSION : 2,
  };
}

export function isPlanReadOnly(kind) {
  return kind === PLAN_KIND.ARCHIVE;
}

/** Default / main schedule — must not be deleted. */
export function isProtectedPlan(plan) {
  if (!plan) return false;
  return plan.id === 1;
}

/** Hidden Supabase rows: id = AUTO_BACKUP_ROW_OFFSET + planId (one rolling backup per plan). */
export const AUTO_BACKUP_ROW_OFFSET = 10000;
export const EMPTY_DEFAULT_SAVE_ERROR = "EMPTY_DEFAULT_BLOCKED";

export function autoBackupRowId(planId) {
  return AUTO_BACKUP_ROW_OFFSET + planId;
}

export function isAutoBackupRow(row) {
  if (!row) return false;
  if (row.data?.backupMeta?.ofPlanId != null) return true;
  const name = row.data?.plan?.name || "";
  return String(name).startsWith("⟲ Auto-backup");
}

export function scheduleHasClasses(schedule) {
  return (schedule?.catalog || []).length > 0;
}

/** Block syncing an empty class list to Default (id=1) — prevents accidental wipe. */
export function shouldBlockEmptyDefaultSave(planId, schedule) {
  return planId === 1 && !scheduleHasClasses(schedule);
}

export function packAutoBackupData(schedule, { ofPlanId, sourceUpdatedAt }) {
  const stamp = new Date().toISOString();
  const label = stamp.slice(0, 16).replace("T", " ");
  return {
    planVersion: PLAN_VERSION,
    plan: {
      kind: PLAN_KIND.ARCHIVE,
      name: `⟲ Auto-backup · plan ${ofPlanId} · ${label}`,
      createdAt: stamp,
    },
    schedule: JSON.parse(JSON.stringify(schedule)),
    backupMeta: { ofPlanId, savedAt: stamp, sourceUpdatedAt: sourceUpdatedAt || null },
  };
}

/** Load previous server row, auto-backup if it has classes, then save (or throw on empty Default). */
export async function executeGuardedRemoteSave(api, { planId, schedule, meta, saveOpts = {} }) {
  if (shouldBlockEmptyDefaultSave(planId, schedule)) {
    const err = new Error("Default plan cannot be saved with no classes.");
    err.code = EMPTY_DEFAULT_SAVE_ERROR;
    throw err;
  }
  try {
    const previous = await api.remoteLoadPlan(planId);
    if (previous?.data && scheduleHasClasses(unpackRowData(previous.data).schedule)) {
      await api.remoteSaveAutoBackup(planId, previous.data, previous.updated_at);
    }
  } catch (e) {
    if (e?.code === EMPTY_DEFAULT_SAVE_ERROR) throw e;
    /* backup is best-effort — proceed with save */
  }
  return api.remoteSavePlan(planId, packRowData(schedule, meta), saveOpts);
}

export function getActivePlanId() {
  try {
    const raw = window.localStorage.getItem(ACTIVE_PLAN_KEY);
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch (e) {
    return 1;
  }
}

export function setActivePlanId(id) {
  try {
    window.localStorage.setItem(ACTIVE_PLAN_KEY, String(id));
  } catch (e) { /* ignore */ }
}

export function scheduleCacheKey(planId) {
  return `premier-schedule-plan-${planId}`;
}

export function readScheduleCache(planId) {
  try {
    const raw = window.localStorage.getItem(scheduleCacheKey(planId));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function writeScheduleCache(planId, schedule) {
  try {
    window.localStorage.setItem(scheduleCacheKey(planId), JSON.stringify(schedule));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "Cache write failed" };
  }
}

export function clearScheduleCache(planId) {
  try {
    window.localStorage.removeItem(scheduleCacheKey(planId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "Cache clear failed" };
  }
}

function emptyLocalStore() {
  return { nextId: 2, plans: [] };
}

export function loadLocalPlanStore() {
  try {
    const raw = window.localStorage.getItem(LOCAL_PLANS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.plans)) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

export function saveLocalPlanStore(store) {
  try {
    window.localStorage.setItem(LOCAL_PLANS_KEY, JSON.stringify(store));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "Plan store write failed" };
  }
}

export function ensureLocalPlanStore(seedSchedule, seedName = "Main schedule") {
  let store = loadLocalPlanStore();
  if (!store?.plans?.length) {
    store = {
      nextId: 2,
      plans: [
        {
          id: 1,
          name: seedName,
          kind: PLAN_KIND.LIVE,
          createdAt: new Date().toISOString(),
          data: packRowData(seedSchedule, { name: seedName, kind: PLAN_KIND.LIVE, createdAt: new Date().toISOString() }),
        },
      ],
    };
    saveLocalPlanStore(store);
  }
  return store;
}

export function listPlansFromLocalStore(store) {
  return (store?.plans || [])
    .map((p) => {
      const u = unpackRowData(p.data);
      return {
        id: p.id,
        name: p.name || u.name,
        kind: resolvePlanKind(p.id, u),
        updated_at: p.updated_at || null,
        planVersion: u.planVersion === PLAN_VERSION ? PLAN_VERSION : 2,
      };
    })
    .sort((a, b) => a.id - b.id);
}

export function getLocalPlanRow(store, planId) {
  return (store?.plans || []).find((p) => p.id === planId) || null;
}

export function upsertLocalPlan(store, planId, packedData, meta) {
  const next = { ...store, plans: [...(store.plans || [])] };
  const i = next.plans.findIndex((p) => p.id === planId);
  const row = {
    id: planId,
    name: meta.name,
    kind: meta.kind,
    createdAt: meta.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    data: packedData,
  };
  if (i >= 0) next.plans[i] = { ...next.plans[i], ...row };
  else next.plans.push(row);
  return next;
}

export function allocateLocalPlanId(store) {
  const max = (store.plans || []).reduce((m, p) => Math.max(m, p.id), 0);
  return Math.max(store.nextId || 1, max + 1);
}

export function createLocalPlanEntry(store, { name, kind, schedule, createdAt }) {
  const id = allocateLocalPlanId(store);
  const meta = {
    name: name || defaultPlanName(kind),
    kind,
    createdAt: createdAt || new Date().toISOString(),
  };
  const packed = packRowData(schedule, meta);
  const next = upsertLocalPlan(store, id, packed, meta);
  next.nextId = id + 1;
  return { store: next, id, meta };
}

export function renameInLocalStore(store, planId, name) {
  const next = { ...store, plans: (store.plans || []).map((p) => {
    if (p.id !== planId) return p;
    const u = unpackRowData(p.data);
    const newName = String(name || "").trim() || p.name;
    const packed = packRowData(u.schedule, {
      name: newName,
      kind: p.kind || u.kind,
      createdAt: u.createdAt || p.createdAt,
    });
    return { ...p, name: newName, data: packed };
  }) };
  return next;
}

export function deleteFromLocalStore(store, planId) {
  const plans = (store?.plans || []).filter((p) => p.id !== planId);
  if (!plans.length) throw new Error("Cannot delete the last plan");
  return { ...store, plans };
}

export function pickFallbackPlanId(plans, deletedId) {
  const remain = (plans || []).filter((p) => p.id !== deletedId).sort((a, b) => a.id - b.id);
  return remain[0]?.id ?? null;
}

export function createRemotePlanApi(config) {
  const { url, key, sbHeaders } = config;

  async function remoteListPlans() {
    const res = await fetch(`${url}/rest/v1/schedule?select=id,data,updated_at&order=id.asc`, {
      headers: sbHeaders(),
    });
    if (!res.ok) throw new Error(`Could not list plans (HTTP ${res.status})`);
    const rows = await res.json();
    return rows.filter((r) => !isAutoBackupRow(r)).map(planRowToMeta);
  }

  async function remoteLoadPlan(planId) {
    const res = await fetch(`${url}/rest/v1/schedule?id=eq.${planId}&select=id,data,updated_at`, {
      headers: sbHeaders(),
    });
    if (!res.ok) throw new Error(`Could not load plan ${planId} (HTTP ${res.status})`);
    const rows = await res.json();
    return rows[0] || null;
  }

  async function remoteUpdatedAtPlan(planId) {
    const res = await fetch(`${url}/rest/v1/schedule?id=eq.${planId}&select=updated_at`, {
      headers: sbHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    return rows[0]?.updated_at || null;
  }

  async function remoteSavePlan(planId, packedData, opts = {}) {
    const res = await fetch(`${url}/rest/v1/schedule?on_conflict=id`, {
      method: "POST",
      headers: { ...sbHeaders(), Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ id: planId, data: packedData, updated_at: new Date().toISOString() }),
      keepalive: opts.keepalive || false,
    });
    if (!res.ok) throw new Error(`Could not save plan ${planId} (HTTP ${res.status})`);
    const rows = await res.json();
    return rows[0]?.updated_at || null;
  }

  async function remoteCreatePlan(packedData) {
    const existing = await remoteListPlans();
    const newId = existing.reduce((m, p) => Math.max(m, p.id), 0) + 1;
    await remoteSavePlan(newId, packedData);
    return newId;
  }

  async function remoteDeletePlan(planId) {
    const res = await fetch(`${url}/rest/v1/schedule?id=eq.${planId}`, {
      method: "DELETE",
      headers: sbHeaders(),
    });
    if (!res.ok) throw new Error(`Could not delete plan ${planId} (HTTP ${res.status})`);
  }

  async function remoteSaveAutoBackup(planId, previousPacked, sourceUpdatedAt) {
    const u = unpackRowData(previousPacked);
    if (!scheduleHasClasses(u.schedule)) return null;
    const backupId = autoBackupRowId(planId);
    const packed = packAutoBackupData(u.schedule, { ofPlanId: planId, sourceUpdatedAt });
    await remoteSavePlan(backupId, packed);
    return backupId;
  }

  async function remoteLoadAutoBackup(planId) {
    return remoteLoadPlan(autoBackupRowId(planId));
  }

  return {
    remoteListPlans,
    remoteLoadPlan,
    remoteUpdatedAtPlan,
    remoteSavePlan,
    remoteCreatePlan,
    remoteDeletePlan,
    remoteSaveAutoBackup,
    remoteLoadAutoBackup,
    executeGuardedRemoteSave: (args) => executeGuardedRemoteSave(
      { remoteLoadPlan, remoteSaveAutoBackup, remoteSavePlan },
      args,
    ),
  };
}