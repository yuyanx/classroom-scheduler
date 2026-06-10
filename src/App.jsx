import React, { useState, useCallback } from "react";

// ───────────────────────── Default data (from 2026 Summer Jericho schedule) ─────────────────────────
// Morning uses combined room 2+3; afternoons use rooms 2 and 3 separately
const DEFAULT_ROOMS = {
  morning: ["1", "2+3", "4", "5", "6", "7", "8"],
  afternoon: ["1", "2", "3", "4", "5", "6", "7", "8"],
};

const SECTIONS = [
  { id: "morning", label: "Morning (Daily)" },
  { id: "mon", label: "Mon PM" },
  { id: "tue", label: "Tue PM" },
  { id: "wed", label: "Wed PM" },
  { id: "thu", label: "Thu PM" },
  { id: "fri", label: "Fri PM" },
];

const roomGroup = (sectionId) => (sectionId === "morning" ? "morning" : "afternoon");

const DEFAULT_SLOTS = {
  morning: ["9:00–10:30", "10:30–12:00"],
  mon: ["12:30–2:00", "2:00–3:30", "3:30–5:00"],
  tue: ["12:30–2:00", "2:00–3:30", "3:30–5:00"],
  wed: ["12:30–2:00", "2:00–3:30", "3:30–5:00"],
  thu: ["12:30–2:00", "2:00–3:30", "3:30–5:00"],
  fri: ["12:30–2:00", "2:00–3:30", "3:30–5:00"],
};

let _seed = 1;
const mk = (section, slotIdx, room, name, teacher, reg, cap, note = "") => ({
  id: "c" + _seed++,
  section, slotIdx, room, name, teacher,
  reg: reg || 0, cap: cap || 12, note,
});

const DEFAULT_CLASSES = [
  // Morning 9:00–10:30
  mk("morning", 0, "2+3", "SAT", "Joshua", 22, 25),
  mk("morning", 0, "7", "ELA", "Linda", 8, 12),
  mk("morning", 0, "6", "Alg2", "James", 7, 12),
  mk("morning", 0, "4", "Geo", "Thomas", 5, 12),
  mk("morning", 0, "5", "5/6th Math", "Matthew M", 8, 12),
  mk("morning", 0, "1", "G7/8 ELA", "", 0, 12),
  // Morning 10:30–12:00
  mk("morning", 1, "2+3", "SAT Math", "Herrick", 23, 25),
  mk("morning", 1, "7", "PSAT", "Joshua", 12, 12),
  mk("morning", 1, "6", "PSAT", "Daniel", 7, 12),
  mk("morning", 1, "4", "5/6th ELA", "Rebecca", 5, 12),
  mk("morning", 1, "5", "G7 Math", "Thomas", 3, 12),
  mk("morning", 1, "8", "G8 Math", "Linda", 5, 12),
  // Monday PM
  mk("mon", 0, "1", "SAT ELA", "Joshua", 9, 25),
  mk("mon", 0, "2", "HS Bio", "Chris", 4, 12),
  mk("mon", 0, "4", "NYT", "Linda", 0, 12),
  mk("mon", 0, "5", "Pre-Cal", "Rebecca", 0, 12),
  mk("mon", 1, "1", "SAT Math", "Herrick", 0, 25),
  mk("mon", 1, "2", "Geo", "Thomas", 2, 12),
  mk("mon", 1, "4", "AP Precal", "James", 2, 12, "2:30–4:00"),
  mk("mon", 1, "5", "AMC 10", "Rebecca", 3, 12, "2:30–4:00"),
  mk("mon", 1, "6", "Debate", "", 0, 12),
  // Tuesday PM
  mk("tue", 0, "1", "SAT ELA", "Joshua", 0, 25),
  mk("tue", 0, "2", "HS Creative Writing", "Chris", 2, 12),
  mk("tue", 0, "4", "Earth Science", "Matthew", 0, 12, "1:00–2:30"),
  mk("tue", 0, "5", "Pre-Cal", "Linda", 0, 12),
  mk("tue", 1, "1", "SAT Math", "Herrick", 11, 25),
  mk("tue", 1, "2", "Python", "AN", 4, 12, "12:30–2:00"),
  mk("tue", 1, "4", "Scholastic Writing", "Joshua", 4, 12),
  mk("tue", 1, "5", "NYT", "Rebecca", 0, 12),
  // Wednesday PM
  mk("wed", 0, "1", "SAT ELA", "Joshua", 2, 25),
  mk("wed", 0, "2", "HS Bio", "Chris", 0, 12),
  mk("wed", 0, "4", "NYT", "Linda", 0, 12),
  mk("wed", 0, "5", "Pre-Cal", "Rebecca", 0, 12),
  mk("wed", 1, "1", "SAT Math", "Herrick", 11, 25),
  mk("wed", 1, "2", "AP Precal", "TBD", 0, 12, "2:30–4:00"),
  mk("wed", 1, "4", "AMC 10", "James", 3, 12, "2:30–4:00"),
  mk("wed", 1, "5", "Debate", "Rebecca", 0, 12),
  // Thursday PM
  mk("thu", 0, "1", "SAT ELA", "Joshua", 2, 25),
  mk("thu", 0, "2", "HS Creative Writing", "Chris", 0, 12),
  mk("thu", 0, "4", "Earth Science", "Matthew", 0, 12, "1:00–2:30"),
  mk("thu", 0, "5", "Pre-Cal", "Linda", 0, 12),
  mk("thu", 1, "1", "SAT Math", "Herrick", 11, 25),
  mk("thu", 1, "2", "Python", "AN", 4, 12, "12:30–2:00"),
  mk("thu", 1, "4", "Scholastic Writing", "Joshua", 4, 12),
  mk("thu", 1, "5", "NYT", "Rebecca", 0, 12),
];

const defaultData = () => ({
  rooms: JSON.parse(JSON.stringify(DEFAULT_ROOMS)),
  slots: JSON.parse(JSON.stringify(DEFAULT_SLOTS)),
  classes: JSON.parse(JSON.stringify(DEFAULT_CLASSES)),
  nextId: _seed,
});

const STORAGE_KEY = "premier-classroom-schedule";

const loadData = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through */ }
  return defaultData();
};

const saveData = (data) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
};

// ───────────────────────── Helpers ─────────────────────────
const ratioColor = (reg, cap) => {
  if (!cap) return { bar: "#94a3b8", text: "#64748b", bg: "#f8fafc" };
  const r = reg / cap;
  if (r >= 1) return { bar: "#dc2626", text: "#b91c1c", bg: "#fef2f2" };
  if (r >= 0.75) return { bar: "#d97706", text: "#b45309", bg: "#fffbeb" };
  return { bar: "#0d7a72", text: "#0f766e", bg: "#f0fdfa" };
};

// ───────────────────────── Main component ─────────────────────────
export default function ClassroomScheduler() {
  const [data, setData] = useState(loadData);
  const [saveError, setSaveError] = useState(false);
  const [tab, setTab] = useState("morning");
  const [editing, setEditing] = useState(null); // {cls, slotIdx, room, isNew}
  const [roomMgrOpen, setRoomMgrOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const persist = useCallback((next) => {
    setData(next);
    setSaveError(!saveData(next));
  }, []);

  const { rooms, slots, classes } = data;
  const curRooms = rooms[roomGroup(tab)] || [];
  const curSlots = slots[tab] || [];

  const findClass = (slotIdx, room) =>
    classes.find((c) => c.section === tab && c.slotIdx === slotIdx && c.room === room);

  const totalReg = classes.reduce((s, c) => s + (c.reg || 0), 0);
  const tabReg = classes.filter((c) => c.section === tab).reduce((s, c) => s + (c.reg || 0), 0);
  const tabCount = classes.filter((c) => c.section === tab).length;

  // ── Drag & drop: move a class; if target is occupied, swap the two ──
  const moveClass = (clsId, toSlotIdx, toRoom) => {
    const src = classes.find((c) => c.id === clsId);
    if (!src) return;
    if (src.section === tab && src.slotIdx === toSlotIdx && src.room === toRoom) return;
    const target = findClass(toSlotIdx, toRoom);
    persist({
      ...data,
      classes: classes.map((c) => {
        if (c.id === src.id) return { ...c, slotIdx: toSlotIdx, room: toRoom };
        if (target && c.id === target.id) return { ...c, slotIdx: src.slotIdx, room: src.room };
        return c;
      }),
    });
  };

  const dropHandlers = (slotIdx, room) => ({
    onDragOver: (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver(slotIdx + "|" + room);
    },
    onDragLeave: () => setDragOver(null),
    onDrop: (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain") || dragId;
      if (id) moveClass(id, slotIdx, room);
      setDragId(null);
      setDragOver(null);
    },
  });

  // ── Registered count stepper ──
  const bump = (cls, delta) => {
    persist({
      ...data,
      classes: classes.map((c) =>
        c.id === cls.id ? { ...c, reg: Math.max(0, (c.reg || 0) + delta) } : c
      ),
    });
  };

  // ── Save class (add / edit) ──
  const saveClass = (form) => {
    let next;
    if (editing.isNew) {
      const newCls = {
        id: "c" + (data.nextId || 1000),
        section: tab,
        slotIdx: editing.slotIdx,
        room: editing.room,
        ...form,
      };
      next = { ...data, classes: [...classes, newCls], nextId: (data.nextId || 1000) + 1 };
    } else {
      next = {
        ...data,
        classes: classes.map((c) => (c.id === editing.cls.id ? { ...c, ...form } : c)),
      };
    }
    persist(next);
    setEditing(null);
  };

  const deleteClass = () => {
    persist({ ...data, classes: classes.filter((c) => c.id !== editing.cls.id) });
    setEditing(null);
  };

  // ── Room management (separate morning / afternoon groups) ──
  const saveRooms = (groups) => {
    let newClasses = classes;
    ["morning", "afternoon"].forEach((g) => {
      const inGroup = (c) => roomGroup(c.section) === g;
      Object.entries(groups[g].renames).forEach(([oldName, newName]) => {
        newClasses = newClasses.map((c) =>
          inGroup(c) && c.room === oldName ? { ...c, room: newName } : c
        );
      });
      newClasses = newClasses.filter((c) => !inGroup(c) || groups[g].names.includes(c.room));
    });
    persist({
      ...data,
      rooms: { morning: groups.morning.names, afternoon: groups.afternoon.names },
      classes: newClasses,
    });
    setRoomMgrOpen(false);
  };

  // ── Time slot management ──
  const addSlot = () => {
    const label = prompt("New time slot label (e.g. 3:30–5:00):");
    if (!label) return;
    persist({ ...data, slots: { ...slots, [tab]: [...curSlots, label] } });
  };
  const renameSlot = (idx) => {
    const label = prompt("Edit time slot label:", curSlots[idx]);
    if (!label) return;
    const ns = [...curSlots];
    ns[idx] = label;
    persist({ ...data, slots: { ...slots, [tab]: ns } });
  };
  const removeSlot = (idx) => {
    const has = classes.some((c) => c.section === tab && c.slotIdx === idx);
    if (has && !window.confirm("This time slot has classes. Deleting it will remove them too. Continue?")) return;
    const ns = curSlots.filter((_, i) => i !== idx);
    const nc = classes
      .filter((c) => !(c.section === tab && c.slotIdx === idx))
      .map((c) =>
        c.section === tab && c.slotIdx > idx ? { ...c, slotIdx: c.slotIdx - 1 } : c
      );
    persist({ ...data, slots: { ...slots, [tab]: ns }, classes: nc });
  };

  const resetAll = () => {
    persist(defaultData());
    setConfirmReset(false);
  };

  // ───────────────────────── Render ─────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f3", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", color: "#1e293b" }}>
      {/* Header */}
      <header style={{ background: "#123c3a", color: "#fff", padding: "18px 24px" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "0.02em" }}>
            Premier Plus · Classroom Scheduler
          </h1>
          <span style={{ fontSize: 13, opacity: 0.75 }}>
            2026 Summer · Jericho · {rooms.morning.length} rooms AM / {rooms.afternoon.length} rooms PM
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 13, opacity: 0.85 }}>
              Total enrolled <b style={{ fontSize: 16 }}>{totalReg}</b>
            </span>
            <button onClick={() => setRoomMgrOpen(true)} style={btnGhost}>Manage Rooms</button>
            <button onClick={() => setConfirmReset(true)} style={{ ...btnGhost, opacity: 0.7 }}>Reset Data</button>
          </div>
        </div>
      </header>

      {saveError && (
        <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "8px 24px", fontSize: 13 }}>
          Changes could not be saved to this browser. They may be lost when you close the page.
        </div>
      )}

      {/* Tabs */}
      <nav style={{ maxWidth: 1320, margin: "0 auto", padding: "16px 24px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setTab(s.id)}
            style={{
              padding: "8px 18px",
              borderRadius: "10px 10px 0 0",
              border: "1px solid #d6dad4",
              borderBottom: "none",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: tab === s.id ? 700 : 400,
              background: tab === s.id ? "#fff" : "#e8eae6",
              color: tab === s.id ? "#123c3a" : "#64748b",
            }}
          >
            {s.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 13, color: "#64748b" }}>
          {tabCount} classes · {tabReg} students in this view
        </span>
      </nav>

      {/* Schedule grid */}
      <main style={{ maxWidth: 1320, margin: "0 auto", padding: "0 24px 40px" }}>
        <div style={{ background: "#fff", border: "1px solid #d6dad4", borderRadius: "0 10px 10px 10px", overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 140 + curRooms.length * 145 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, minWidth: 130, position: "sticky", left: 0, background: "#fafaf8", zIndex: 2 }}>Time</th>
                {curRooms.map((r) => (
                  <th key={r} style={thStyle}>
                    <span style={{ display: "inline-block", background: "#123c3a", color: "#fff", borderRadius: 6, padding: "2px 10px", fontSize: 13 }}>
                      Room {r}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {curSlots.map((slot, si) => (
                <tr key={si}>
                  <td style={{ ...tdStyle, position: "sticky", left: 0, background: "#fafaf8", zIndex: 1, verticalAlign: "top" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#123c3a" }}>{slot}</div>
                    <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                      <button onClick={() => renameSlot(si)} style={miniBtn} title="Rename time slot">✎</button>
                      <button onClick={() => removeSlot(si)} style={{ ...miniBtn, color: "#b91c1c" }} title="Delete time slot">✕</button>
                    </div>
                  </td>
                  {curRooms.map((room) => {
                    const cls = findClass(si, room);
                    const cellKey = si + "|" + room;
                    const isOver = dragOver === cellKey;
                    if (!cls) {
                      return (
                        <td key={room} style={tdStyle} {...dropHandlers(si, room)}>
                          <button
                            onClick={() => setEditing({ isNew: true, slotIdx: si, room })}
                            style={{
                              width: "100%", minHeight: 86,
                              border: isOver ? "2px solid #0d7a72" : "1.5px dashed #cbd5d1",
                              borderRadius: 8,
                              background: isOver ? "#f0fdfa" : "transparent",
                              color: isOver ? "#0d7a72" : "#94a3b8",
                              fontSize: 13, cursor: "pointer",
                            }}
                          >
                            {isOver ? "Drop here" : "＋ Add class"}
                          </button>
                        </td>
                      );
                    }
                    const col = ratioColor(cls.reg, cls.cap);
                    const pct = cls.cap ? Math.min(100, Math.round((cls.reg / cls.cap) * 100)) : 0;
                    return (
                      <td key={room} style={tdStyle} {...dropHandlers(si, room)}>
                        <div
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", cls.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDragId(cls.id);
                          }}
                          onDragEnd={() => { setDragId(null); setDragOver(null); }}
                          style={{
                            border: isOver && dragId !== cls.id ? "2px solid #0d7a72" : "1px solid #d6dad4",
                            borderRadius: 8, background: col.bg,
                            padding: "8px 10px", minHeight: 86, display: "flex", flexDirection: "column", gap: 4,
                            opacity: dragId === cls.id ? 0.35 : 1,
                            cursor: "grab",
                            boxShadow: isOver && dragId !== cls.id ? "0 0 0 3px rgba(13,122,114,.15)" : "none",
                            transition: "opacity .15s, box-shadow .15s",
                          }}
                          title={isOver && dragId !== cls.id ? "Release to swap with this class" : "Drag to move · click text to edit"}
                        >
                          <div
                            onClick={() => setEditing({ isNew: false, cls, slotIdx: si, room })}
                            style={{ cursor: "pointer" }}
                            title="Click to edit"
                          >
                            <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.25 }}>{cls.name}</div>
                            <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                              {cls.teacher || <i style={{ color: "#b45309" }}>Teacher TBD</i>}
                              {cls.note && <span style={{ marginLeft: 6, color: "#7c3aed" }}>⏱ {cls.note}</span>}
                            </div>
                          </div>
                          <div style={{ marginTop: "auto" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <button onClick={() => bump(cls, -1)} style={stepBtn}>−</button>
                              <span style={{ fontSize: 13, fontWeight: 700, color: col.text, minWidth: 48, textAlign: "center" }}>
                                {cls.reg} / {cls.cap}
                              </span>
                              <button onClick={() => bump(cls, +1)} style={stepBtn}>＋</button>
                              {cls.reg >= cls.cap && cls.cap > 0 && (
                                <span style={{ fontSize: 11, color: "#b91c1c", fontWeight: 700 }}>FULL</span>
                              )}
                            </div>
                            <div style={{ height: 4, background: "#e2e8f0", borderRadius: 2, marginTop: 5, overflow: "hidden" }}>
                              <div style={{ width: pct + "%", height: "100%", background: col.bar, borderRadius: 2, transition: "width .25s" }} />
                            </div>
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: "10px 14px", borderTop: "1px solid #eceeea" }}>
            <button onClick={addSlot} style={{ ...btnGhost, color: "#123c3a", borderColor: "#cbd5d1" }}>＋ Add time slot</button>
          </div>
        </div>
        <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 10 }}>
          🖱 <b>Drag a class card</b> to any cell to change its time slot or room; dropping onto another class swaps them.
          Click the card text to edit, use ＋ − to adjust enrollment. Green = open, amber = nearly full, red = full.
          Morning uses combined Room 2+3; afternoons use Rooms 2 and 3 separately. Data is saved in this browser.
        </p>
      </main>

      {/* Class edit modal */}
      {editing && (
        <ClassModal
          editing={editing}
          tabLabel={SECTIONS.find((s) => s.id === tab)?.label}
          slotLabel={curSlots[editing.slotIdx]}
          onSave={saveClass}
          onDelete={deleteClass}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Room manager modal */}
      {roomMgrOpen && (
        <RoomModal rooms={rooms} classes={classes} onSave={saveRooms} onClose={() => setRoomMgrOpen(false)} />
      )}

      {/* Reset confirmation */}
      {confirmReset && (
        <Overlay onClose={() => setConfirmReset(false)}>
          <h3 style={{ marginTop: 0 }}>Reset all data?</h3>
          <p style={{ fontSize: 14, color: "#475569" }}>
            This restores the original schedule from the registration sheet. All changes will be lost.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button style={btnSecondary} onClick={() => setConfirmReset(false)}>Cancel</button>
            <button style={{ ...btnPrimary, background: "#dc2626" }} onClick={resetAll}>Reset</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ───────────────────────── Class edit modal ─────────────────────────
function ClassModal({ editing, tabLabel, slotLabel, onSave, onDelete, onClose }) {
  const c = editing.cls || {};
  const [name, setName] = useState(c.name || "");
  const [teacher, setTeacher] = useState(c.teacher || "");
  const [reg, setReg] = useState(c.reg ?? 0);
  const [cap, setCap] = useState(c.cap ?? 12);
  const [note, setNote] = useState(c.note || "");

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      teacher: teacher.trim(),
      reg: Math.max(0, parseInt(reg, 10) || 0),
      cap: Math.max(0, parseInt(cap, 10) || 0),
      note: note.trim(),
    });
  };

  return (
    <Overlay onClose={onClose}>
      <h3 style={{ marginTop: 0, marginBottom: 4 }}>{editing.isNew ? "Add class" : "Edit class"}</h3>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
        {tabLabel} · {slotLabel} · Room {editing.room}
      </p>
      <Field label="Class name *">
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SAT Math" autoFocus />
      </Field>
      <Field label="Teacher">
        <input style={inputStyle} value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="e.g. Herrick" />
      </Field>
      <div style={{ display: "flex", gap: 12 }}>
        <Field label="Registered" style={{ flex: 1 }}>
          <input style={inputStyle} type="number" min="0" value={reg} onChange={(e) => setReg(e.target.value)} />
        </Field>
        <Field label="Capacity" style={{ flex: 1 }}>
          <input style={inputStyle} type="number" min="0" value={cap} onChange={(e) => setCap(e.target.value)} />
        </Field>
      </div>
      <Field label="Note / actual time (optional)">
        <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2:30–4:00" />
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        {!editing.isNew && (
          <button style={{ ...btnSecondary, color: "#b91c1c", borderColor: "#fca5a5" }} onClick={onDelete}>Delete class</button>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button style={btnSecondary} onClick={onClose}>Cancel</button>
          <button style={btnPrimary} onClick={submit} disabled={!name.trim()}>Save</button>
        </div>
      </div>
    </Overlay>
  );
}

// ───────────────────────── Room manager (AM / PM groups) ─────────────────────────
function RoomModal({ rooms, classes, onSave, onClose }) {
  const [morning, setMorning] = useState(rooms.morning.map((r) => ({ orig: r, name: r })));
  const [afternoon, setAfternoon] = useState(rooms.afternoon.map((r) => ({ orig: r, name: r })));

  const countFor = (group, origName) =>
    classes.filter((c) => {
      const g = c.section === "morning" ? "morning" : "afternoon";
      return g === group && c.room === origName;
    }).length;

  const makeOps = (list, setList, group) => ({
    move: (i, dir) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return;
      const nl = [...list];
      [nl[i], nl[j]] = [nl[j], nl[i]];
      setList(nl);
    },
    remove: (i) => {
      const n = list[i].orig ? countFor(group, list[i].orig) : 0;
      if (n > 0 && !window.confirm(`Room "${list[i].name}" has ${n} class(es). Deleting it will remove them too. Continue?`)) return;
      setList(list.filter((_, idx) => idx !== i));
    },
    add: () => setList([...list, { orig: null, name: "" }]),
    edit: (i, v) => {
      const nl = [...list];
      nl[i] = { ...nl[i], name: v };
      setList(nl);
    },
  });

  const submit = () => {
    const build = (list) => {
      const names = list.map((r) => r.name.trim()).filter(Boolean);
      const renames = {};
      list.forEach((r) => {
        if (r.orig && r.name.trim() && r.orig !== r.name.trim()) renames[r.orig] = r.name.trim();
      });
      return { names, renames };
    };
    const m = build(morning);
    const a = build(afternoon);
    if (m.names.length === 0 || a.names.length === 0) {
      alert("Keep at least one room in each period.");
      return;
    }
    if (new Set(m.names).size !== m.names.length || new Set(a.names).size !== a.names.length) {
      alert("Room names must be unique within a period.");
      return;
    }
    onSave({ morning: m, afternoon: a });
  };

  const renderGroup = (title, list, setList, group) => {
    const ops = makeOps(list, setList, group);
    return (
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#123c3a", marginBottom: 8 }}>
          {title} ({list.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
          {list.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <input
                style={{ ...inputStyle, flex: 1, padding: "6px 8px" }}
                value={r.name}
                placeholder="Room name"
                onChange={(e) => ops.edit(i, e.target.value)}
              />
              {r.orig && (
                <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>
                  {countFor(group, r.orig)} cls
                </span>
              )}
              <button style={miniBtn} onClick={() => ops.move(i, -1)} title="Move up">↑</button>
              <button style={miniBtn} onClick={() => ops.move(i, 1)} title="Move down">↓</button>
              <button style={{ ...miniBtn, color: "#b91c1c" }} onClick={() => ops.remove(i)} title="Delete">✕</button>
            </div>
          ))}
        </div>
        <button style={{ ...btnSecondary, marginTop: 10, fontSize: 13, padding: "6px 12px" }} onClick={ops.add}>
          ＋ Add room
        </button>
      </div>
    );
  };

  return (
    <Overlay onClose={onClose} wide>
      <h3 style={{ marginTop: 0 }}>Manage rooms</h3>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px" }}>
        Morning and afternoon rooms are managed separately (Room 2+3 is combined in the morning, split into 2 and 3 in the afternoon).
      </p>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {renderGroup("Morning rooms", morning, setMorning, "morning")}
        {renderGroup("Afternoon rooms", afternoon, setAfternoon, "afternoon")}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
        <button style={btnSecondary} onClick={onClose}>Cancel</button>
        <button style={btnPrimary} onClick={submit}>Save</button>
      </div>
    </Overlay>
  );
}

// ───────────────────────── Shared bits ─────────────────────────
function Overlay({ children, onClose, wide }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 12, padding: "22px 24px",
          width: "100%", maxWidth: wide ? 620 : 460, boxShadow: "0 20px 50px rgba(0,0,0,.25)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <label style={{ display: "block", marginBottom: 12, ...style }}>
      <span style={{ display: "block", fontSize: 13, color: "#475569", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

// ───────────────────────── Styles ─────────────────────────
const thStyle = {
  padding: "10px 8px", borderBottom: "2px solid #d6dad4", borderRight: "1px solid #eceeea",
  fontSize: 13, fontWeight: 600, color: "#475569", textAlign: "center", background: "#fafaf8",
};
const tdStyle = {
  padding: 8, borderBottom: "1px solid #eceeea", borderRight: "1px solid #eceeea", verticalAlign: "top",
};
const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 14,
  border: "1px solid #cbd5d1", borderRadius: 8, outline: "none",
};
const btnGhost = {
  background: "transparent", border: "1px solid rgba(255,255,255,.35)", color: "inherit",
  borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer",
};
const btnPrimary = {
  background: "#123c3a", color: "#fff", border: "none", borderRadius: 8,
  padding: "8px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer",
};
const btnSecondary = {
  background: "#fff", color: "#334155", border: "1px solid #cbd5d1", borderRadius: 8,
  padding: "8px 14px", fontSize: 14, cursor: "pointer",
};
const miniBtn = {
  background: "#fff", border: "1px solid #d6dad4", borderRadius: 6, width: 26, height: 26,
  fontSize: 12, cursor: "pointer", color: "#475569", lineHeight: 1,
};
const stepBtn = {
  width: 24, height: 24, borderRadius: 6, border: "1px solid #cbd5d1", background: "#fff",
  cursor: "pointer", fontSize: 14, lineHeight: 1, color: "#334155",
};
