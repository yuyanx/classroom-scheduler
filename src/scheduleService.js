// Persistence/sync helpers — dirty-revision guard prevents poll from clobbering unsaved edits.

export const STORAGE_KEY = "premier-classroom-schedule";

export function createSyncRef() {
  return {
    timer: null,
    retryTimer: null,
    lastSyncedAt: null,
    pendingSave: false,
    lastSaveFailed: false,
    localRevision: 0,
    lastSavedRevision: 0,
  };
}

export function bumpLocalRevision(syncRef) {
  syncRef.localRevision += 1;
}

export function markRevisionSaved(syncRef) {
  syncRef.lastSavedRevision = syncRef.localRevision;
}

export function isLocallyDirty(syncRef) {
  return syncRef.localRevision > syncRef.lastSavedRevision;
}

/** Poll may apply remote data only when local edits are fully saved. */
export function canApplyRemotePoll(syncRef) {
  return !syncRef.pendingSave && !isLocallyDirty(syncRef);
}

export function saveToLocalStorage(data) {
  try {
    const payload = JSON.stringify(data);
    window.localStorage.setItem(STORAGE_KEY, payload);
    if (window.localStorage.getItem(STORAGE_KEY) !== payload) {
      return { ok: false, error: "Browser storage did not keep the saved data." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "Browser storage is unavailable." };
  }
}