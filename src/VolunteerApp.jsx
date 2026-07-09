// Volunteer entry mode (?entry=1) — mobile-friendly Classbook + Grades only.
// Always loads Default plan (id=1). Free-text name stamps records as by/at.
// Not authentication: anyone with the link can edit the shared schedule.
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  STORAGE_KEY,
  createSyncRef,
  bumpLocalRevision,
  markRevisionSaved,
  canApplyRemotePoll,
  saveToLocalStorage,
} from "./scheduleService.js";
import {
  PLAN_KIND,
  unpackRowData,
  packRowData,
  resolvePlanKind,
  EMPTY_DEFAULT_SAVE_ERROR,
  readScheduleCache,
  writeScheduleCache,
  ensureLocalPlanStore,
  loadLocalPlanStore,
  saveLocalPlanStore,
  getLocalPlanRow,
  upsertLocalPlan,
  createRemotePlanApi,
} from "./planService.js";
import { dataSignature } from "./domain/scheduleLogic.ts";
import {
  upgrade,
  defaultData,
  isLocalDevHost,
  isPreviewHost,
  isRemoteSyncEnabled,
} from "./App.jsx";
import Classbook from "./components/Classbook.jsx";
import GradesView from "./components/GradesView.jsx";
import { inputStyle, btnPrimary, btnSecondary, btnGhost } from "./components/uikit.jsx";

const ENTRY_NAME_KEY = "premier-entry-name";
const DEFAULT_PLAN_ID = 1;

const SUPABASE_URL = "https://zbvedbwbxdzcsnftvyph.supabase.co";
const SUPABASE_KEY = "sb_publishable_cDEmeJDF7lwuafg8ZYKF4Q_Sl_fUSTE";
const VERCEL_ENV = process.env.VERCEL_ENV || "";

const IS_LOCAL_DEV = typeof window !== "undefined" && isLocalDevHost(window.location.hostname);
const IS_PREVIEW_DEPLOY = typeof window !== "undefined" && isPreviewHost(window.location.hostname);
const REMOTE_ENABLED =
  typeof window !== "undefined" ? isRemoteSyncEnabled(window.location.hostname) : false;
const REMOTE_POLL_MS = 30000;

const sbHeaders = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
});

const planApi = createRemotePlanApi({
  url: SUPABASE_URL,
  key: SUPABASE_KEY,
  sbHeaders,
});

function scheduleFromRowData(data) {
  return upgrade(unpackRowData(data).schedule);
}

function planMetaFromRow(row) {
  const u = unpackRowData(row.data);
  return {
    name: u.name || "Main schedule",
    kind: resolvePlanKind(row.id, u),
    createdAt: u.createdAt || null,
  };
}

function planMetaFromLocalRow(row) {
  const u = unpackRowData(row.data);
  return {
    name: row.name || u.name || "Main schedule",
    kind: resolvePlanKind(row.id, u),
    createdAt: row.createdAt || u.createdAt || null,
  };
}

function loadEntryName() {
  try { return localStorage.getItem(ENTRY_NAME_KEY) || ""; } catch { return ""; }
}

function storeEntryName(name) {
  try {
    if (name) localStorage.setItem(ENTRY_NAME_KEY, name);
    else localStorage.removeItem(ENTRY_NAME_KEY);
  } catch { /* ignore */ }
}

const loadLocalFallback = () => {
  try {
    const cached = readScheduleCache(DEFAULT_PLAN_ID);
    if (cached) return upgrade(cached);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return upgrade(JSON.parse(raw));
  } catch { /* fall through */ }
  return defaultData();
};

export default function VolunteerApp() {
  const [data, setData] = useState(() => loadLocalFallback());
  const [ready, setReady] = useState(!REMOTE_ENABLED);
  const [planMeta, setPlanMeta] = useState({ name: "Main schedule", kind: PLAN_KIND.LIVE, createdAt: null });
  const [saveStatus, setSaveStatus] = useState({
    ok: true,
    error: "",
    label: "Loading…",
  });
  const [recorder, setRecorder] = useState(loadEntryName);
  const [nameDraft, setNameDraft] = useState(loadEntryName);
  const [tab, setTab] = useState("classbook"); // classbook | grades
  const [nameError, setNameError] = useState("");

  const remoteRef = useRef(createSyncRef());
  const dataRef = useRef(data);
  dataRef.current = data;
  const planMetaRef = useRef(planMeta);
  planMetaRef.current = planMeta;
  const localSaveTimer = useRef(null);

  const timeLabel = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const setStatus = useCallback((ok, label, error = "") => {
    setSaveStatus({ ok, error, label });
  }, []);

  const offlineSaveLabel = () => {
    if (IS_PREVIEW_DEPLOY) return "Preview — not syncing to shared schedule";
    if (IS_LOCAL_DEV) return "Local dev — not syncing to shared schedule";
    return `Saved to this browser at ${timeLabel()}`;
  };

  const flushLocalSave = useCallback((payload) => {
    clearTimeout(localSaveTimer.current);
    localSaveTimer.current = null;
    return saveToLocalStorage(payload);
  }, []);

  const writeLocalCaches = useCallback((payload, meta) => {
    writeScheduleCache(DEFAULT_PLAN_ID, payload);
    if (!REMOTE_ENABLED) {
      let store = loadLocalPlanStore();
      if (store) {
        const packed = packRowData(payload, meta);
        store = upsertLocalPlan(store, DEFAULT_PLAN_ID, packed, meta);
        saveLocalPlanStore(store);
      }
    }
    return saveToLocalStorage(payload);
  }, []);

  const flushRemoteSave = useCallback(async (payload) => {
    if (!REMOTE_ENABLED) return;
    const meta = planMetaRef.current;
    remoteRef.current.pendingSave = true;
    try {
      const ts = await planApi.executeGuardedRemoteSave({
        planId: DEFAULT_PLAN_ID,
        schedule: payload,
        meta,
      });
      remoteRef.current.lastSyncedAt = ts || new Date().toISOString();
      remoteRef.current.pendingSave = false;
      remoteRef.current.lastSaveFailed = false;
      markRevisionSaved(remoteRef.current);
      clearTimeout(remoteRef.current.retryTimer);
      writeScheduleCache(DEFAULT_PLAN_ID, payload);
      setStatus(true, `Saved for everyone at ${timeLabel()}`);
    } catch (e) {
      remoteRef.current.pendingSave = false;
      remoteRef.current.lastSaveFailed = e?.code !== EMPTY_DEFAULT_SAVE_ERROR;
      const msg = e?.code === EMPTY_DEFAULT_SAVE_ERROR
        ? "Can't save empty Default — ask staff to restore data."
        : (e?.message || "Network error");
      setStatus(false, "Not saved", msg);
      if (e?.code !== EMPTY_DEFAULT_SAVE_ERROR) {
        clearTimeout(remoteRef.current.retryTimer);
        remoteRef.current.retryTimer = setTimeout(() => {
          if (!remoteRef.current.pendingSave) flushRemoteSave(dataRef.current);
        }, 5000);
      }
    }
  }, [setStatus]);

  const applyData = useCallback((next) => {
    if (!next || next === dataRef.current) return;
    bumpLocalRevision(remoteRef.current);
    setData(next);
    dataRef.current = next;
    const meta = planMetaRef.current;
    if (!REMOTE_ENABLED) {
      clearTimeout(localSaveTimer.current);
      localSaveTimer.current = setTimeout(() => {
        localSaveTimer.current = null;
        const result = writeLocalCaches(next, meta);
        setStatus(result.ok, result.ok ? offlineSaveLabel() : "Not saved", result.error || "");
      }, 200);
      return;
    }
    writeScheduleCache(DEFAULT_PLAN_ID, next);
    clearTimeout(localSaveTimer.current);
    localSaveTimer.current = setTimeout(() => {
      localSaveTimer.current = null;
      saveToLocalStorage(next);
    }, 200);
    setStatus(true, "Saving…");
    remoteRef.current.pendingSave = true;
    clearTimeout(remoteRef.current.timer);
    remoteRef.current.timer = setTimeout(() => flushRemoteSave(next), 600);
  }, [flushRemoteSave, setStatus, writeLocalCaches]);

  const persist = useCallback((nextOrMutator) => {
    const prev = dataRef.current;
    const next = typeof nextOrMutator === "function" ? nextOrMutator(prev) : nextOrMutator;
    applyData(next);
  }, [applyData]);

  // Load Default plan only
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (REMOTE_ENABLED) {
          setStatus(true, "Loading shared schedule…");
          const row = await planApi.remoteLoadPlan(DEFAULT_PLAN_ID);
          if (cancelled) return;
          if (row) {
            const meta = planMetaFromRow(row);
            const next = scheduleFromRowData(row.data);
            dataRef.current = next;
            setData(next);
            setPlanMeta(meta);
            writeScheduleCache(DEFAULT_PLAN_ID, next);
            flushLocalSave(next);
            remoteRef.current.lastSyncedAt = row.updated_at;
            markRevisionSaved(remoteRef.current);
            setStatus(true, `Loaded at ${timeLabel()}`);
          } else {
            setStatus(false, "Main schedule not found", "Ask staff to open the main app first.");
          }
        } else {
          const seed = dataRef.current;
          const store = ensureLocalPlanStore(seed, "Main schedule");
          const row = getLocalPlanRow(store, DEFAULT_PLAN_ID);
          const cached = readScheduleCache(DEFAULT_PLAN_ID);
          const next = cached ? upgrade(cached) : (row ? scheduleFromRowData(row.data) : seed);
          const meta = row
            ? planMetaFromLocalRow(row)
            : { name: "Main schedule", kind: PLAN_KIND.LIVE, createdAt: null };
          dataRef.current = next;
          setData(next);
          setPlanMeta(meta);
          const result = writeLocalCaches(next, meta);
          setStatus(result.ok, result.ok ? offlineSaveLabel() : "Not saved", result.error || "");
          markRevisionSaved(remoteRef.current);
        }
      } catch (e) {
        if (!cancelled) {
          const cached = readScheduleCache(DEFAULT_PLAN_ID);
          if (cached) {
            const next = upgrade(cached);
            dataRef.current = next;
            setData(next);
          }
          setStatus(false, "Offline — using this browser's copy", e?.message || "");
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [flushLocalSave, setStatus, writeLocalCaches]);

  // Poll Default plan
  useEffect(() => {
    if (!REMOTE_ENABLED || !ready) return;
    const iv = setInterval(async () => {
      if (document.hidden || !canApplyRemotePoll(remoteRef.current)) return;
      try {
        const ts = await planApi.remoteUpdatedAtPlan(DEFAULT_PLAN_ID);
        if (ts && remoteRef.current.lastSyncedAt && ts > remoteRef.current.lastSyncedAt) {
          const row = await planApi.remoteLoadPlan(DEFAULT_PLAN_ID);
          if (row && canApplyRemotePoll(remoteRef.current)) {
            const next = scheduleFromRowData(row.data);
            if (dataSignature(next) !== dataSignature(dataRef.current)) {
              const meta = planMetaFromRow(row);
              dataRef.current = next;
              setData(next);
              setPlanMeta(meta);
              remoteRef.current.lastSyncedAt = row.updated_at;
              markRevisionSaved(remoteRef.current);
              writeScheduleCache(DEFAULT_PLAN_ID, next);
              flushLocalSave(next);
              setStatus(true, `Updated from another device at ${timeLabel()}`);
            } else {
              remoteRef.current.lastSyncedAt = row.updated_at;
              markRevisionSaved(remoteRef.current);
            }
          }
        }
      } catch { /* ignore poll errors */ }
    }, REMOTE_POLL_MS);
    return () => clearInterval(iv);
  }, [ready, flushLocalSave, setStatus]);

  // Flush on hide/close
  useEffect(() => {
    const flush = () => {
      clearTimeout(localSaveTimer.current);
      localSaveTimer.current = null;
      const payload = dataRef.current;
      writeScheduleCache(DEFAULT_PLAN_ID, payload);
      saveToLocalStorage(payload);
      if (REMOTE_ENABLED && remoteRef.current.pendingSave) {
        // best-effort: fire and forget
        planApi.executeGuardedRemoteSave({
          planId: DEFAULT_PLAN_ID,
          schedule: payload,
          meta: planMetaRef.current,
        }).catch(() => {});
      }
    };
    const onVis = () => { if (document.hidden) flush(); };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const startRecording = (e) => {
    e?.preventDefault?.();
    const name = nameDraft.trim();
    if (!name) {
      setNameError("Enter your name so records show who entered them.");
      return;
    }
    setNameError("");
    setRecorder(name);
    storeEntryName(name);
  };

  const changeName = () => {
    setNameDraft(recorder);
    setRecorder("");
  };

  const tabBtn = (id, label) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      style={{
        ...btnSecondary,
        padding: "10px 16px",
        fontWeight: tab === id ? 700 : 500,
        background: tab === id ? "#123c3a" : "#fff",
        color: tab === id ? "#fff" : "#334155",
        borderColor: tab === id ? "#123c3a" : "#cbd5d1",
        flex: "1 1 120px",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f3", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", color: "#1e293b" }}>
      <header style={{ background: "#123c3a", color: "#fff", padding: "14px 16px 12px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ fontSize: 11, letterSpacing: 0.6, opacity: 0.75, textTransform: "uppercase" }}>Premier Plus</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline", justifyContent: "space-between" }}>
            <h1 style={{ margin: "2px 0 0", fontSize: 20, fontWeight: 700 }}>Class entry</h1>
            {recorder ? (
              <button
                type="button"
                onClick={changeName}
                style={{ ...btnGhost, fontSize: 13 }}
                title="Change whose name is stamped on records"
              >
                Recording as {recorder} · Change
              </button>
            ) : null}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
            {ready ? saveStatus.label : "Loading…"}
            {saveStatus.error ? ` — ${saveStatus.error}` : ""}
            {!saveStatus.ok && ready ? " ⚠" : ""}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "16px 12px 40px" }}>
        {!recorder ? (
          <div style={{ background: "#fff", border: "1px solid #d6dad4", borderRadius: 12, padding: 20, maxWidth: 420, margin: "24px auto" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 18, color: "#123c3a" }}>Who's recording?</h2>
            <p style={{ margin: "0 0 16px", fontSize: 14, color: "#64748b", lineHeight: 1.45 }}>
              Enter your name, then record attendance, homework, and quiz scores.
              Your name is saved on this device and stamped on each entry.
            </p>
            <form onSubmit={startRecording}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Your name</label>
              <input
                style={{ ...inputStyle, fontSize: 16, padding: "12px 12px" }}
                autoFocus
                autoComplete="name"
                placeholder="e.g. Alex"
                value={nameDraft}
                onChange={(e) => { setNameDraft(e.target.value); setNameError(""); }}
              />
              {nameError ? (
                <div style={{ marginTop: 8, fontSize: 13, color: "#b91c1c" }}>{nameError}</div>
              ) : null}
              <button
                type="submit"
                style={{ ...btnPrimary, width: "100%", marginTop: 14, padding: "12px 18px", fontSize: 16 }}
              >
                Start recording
              </button>
            </form>
            <p style={{ margin: "14px 0 0", fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>
              This is not a login — just an audit label. Edits go to the live main schedule.
            </p>
          </div>
        ) : !ready ? (
          <p style={{ color: "#64748b", textAlign: "center", marginTop: 40 }}>Loading schedule…</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {tabBtn("classbook", "📓 Attendance & homework")}
              {tabBtn("grades", "📝 Quizzes")}
            </div>
            {tab === "classbook" ? (
              <Classbook
                data={data}
                persist={persist}
                currentTeacher={recorder}
                planReadOnly={false}
                onSetTerm={null}
                onEditClass={null}
              />
            ) : (
              <GradesView
                data={data}
                persist={persist}
                currentTeacher={recorder}
                planReadOnly={false}
                onSetTerm={null}
              />
            )}
            <p style={{ marginTop: 16, fontSize: 12, color: "#94a3b8", textAlign: "center", lineHeight: 1.4 }}>
              Recording as <b style={{ color: "#64748b" }}>{recorder}</b>
              {data.term ? "" : " · Term not set yet — ask staff if sessions are missing."}
            </p>
          </>
        )}
      </main>
    </div>
  );
}
