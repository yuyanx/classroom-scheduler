// 📓 Classbook — per class, per session: lesson content, homework, attendance,
// and each student's homework-completion status. The daily teacher workflow.
import React, { useState, useMemo, useEffect } from "react";
import {
  sessionsForClass,
  todayISO,
  formatDateLabel,
  studentKey,
  attendanceSummary,
  sortCatalogForRosterView,
} from "../domain/scheduleLogic.ts";
import { inputStyle, selStyle, btnPrimary, btnSecondary, thStyle, tdStyle } from "./uikit.jsx";
import { ATT_OPTS, HW_OPTS, StatusPicker, useIsNarrow } from "./classbookUtils.jsx";

export default function Classbook({ data, persist, currentTeacher, planReadOnly, onSetTerm, onEditClass }) {
  const { catalog = [], placements = [], term } = data;
  const narrow = useIsNarrow(760);

  const classes = useMemo(() => sortCatalogForRosterView(catalog, placements), [catalog, placements]);
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id || "");
  const [selectedDate, setSelectedDate] = useState("");

  // Keep a valid class selected as the catalog changes.
  useEffect(() => {
    if (!classes.some((k) => k.id === selectedClassId)) setSelectedClassId(classes[0]?.id || "");
  }, [classes, selectedClassId]);

  const cls = catalog.find((k) => k.id === selectedClassId) || null;
  const roster = cls?.students || [];

  const sessions = useMemo(
    () => sessionsForClass(selectedClassId, placements, term),
    [selectedClassId, placements, term],
  );
  const sessionDates = useMemo(() => sessions.map((s) => s.date), [sessions]);
  const datesKey = sessionDates.join("|");

  // Pick a sensible default date when the class/term changes; keep current if still valid.
  useEffect(() => {
    setSelectedDate((cur) => {
      if (cur && sessionDates.includes(cur)) return cur;
      if (!sessionDates.length) return "";
      const today = todayISO();
      if (sessionDates.includes(today)) return today;
      const past = sessionDates.filter((d) => d <= today);
      return past.length ? past[past.length - 1] : sessionDates[0];
    });
  }, [selectedClassId, datesKey]);

  const sessionLog = useMemo(
    () => (data.sessionLogs || []).find((r) => r.classId === selectedClassId && r.date === selectedDate) || null,
    [data.sessionLogs, selectedClassId, selectedDate],
  );
  const attByStudent = useMemo(() => {
    const m = new Map();
    (data.attendance || []).forEach((r) => {
      if (r.classId === selectedClassId && r.date === selectedDate) m.set(studentKey(r.student), r);
    });
    return m;
  }, [data.attendance, selectedClassId, selectedDate]);

  // Lesson content / homework: local state, persisted on blur.
  const [content, setContent] = useState("");
  const [homework, setHomework] = useState("");
  useEffect(() => {
    setContent(sessionLog?.content || "");
    setHomework(sessionLog?.homework || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, selectedDate]);

  const stamp = () => ({ by: currentTeacher || "", at: new Date().toISOString() });

  const saveSessionLog = (patch) => {
    if (planReadOnly) return;
    persist((d) => {
      const k = `${selectedClassId}|${selectedDate}`;
      const list = d.sessionLogs || [];
      const existing = list.find((r) => `${r.classId}|${r.date}` === k);
      const rest = list.filter((r) => `${r.classId}|${r.date}` !== k);
      const merged = { classId: selectedClassId, date: selectedDate, content: "", homework: "", note: "", ...(existing || {}), ...patch };
      return { ...d, sessionLogs: [...rest, merged] };
    });
  };

  const upsertAttendance = (student, patch) => {
    if (planReadOnly) return;
    persist((d) => {
      const k = `${selectedClassId}|${selectedDate}|${studentKey(student)}`;
      const list = d.attendance || [];
      const existing = list.find((r) => `${r.classId}|${r.date}|${studentKey(r.student)}` === k);
      const rest = list.filter((r) => `${r.classId}|${r.date}|${studentKey(r.student)}` !== k);
      const merged = {
        classId: selectedClassId, date: selectedDate, student,
        status: "", homework: "", note: "",
        ...(existing || {}), ...patch, ...stamp(),
      };
      return { ...d, attendance: [...rest, merged] };
    });
  };

  const markAllPresent = () => {
    if (planReadOnly) return;
    persist((d) => {
      const prefix = `${selectedClassId}|${selectedDate}|`;
      const byKey = new Map((d.attendance || []).map((r) => [`${r.classId}|${r.date}|${studentKey(r.student)}`, r]));
      roster.forEach((s) => {
        const k = prefix + studentKey(s);
        const existing = byKey.get(k);
        byKey.set(k, {
          classId: selectedClassId, date: selectedDate, student: s,
          status: "present", homework: existing?.homework || "", note: existing?.note || "", ...stamp(),
        });
      });
      return { ...d, attendance: [...byKey.values()] };
    });
  };

  const dateIdx = sessionDates.indexOf(selectedDate);
  const summary = useMemo(() => {
    const c = { present: 0, absent: 0, tardy: 0, excused: 0, hwDone: 0, recorded: 0 };
    roster.forEach((s) => {
      const r = attByStudent.get(studentKey(s));
      if (!r) return;
      if (r.status) { c.recorded++; if (c[r.status] != null) c[r.status]++; }
      if (r.homework === "complete" || r.homework === "late") c.hwDone++;
    });
    return c;
  }, [roster, attByStudent]);

  const wrap = { background: "#fff", border: "1px solid #d6dad4", borderRadius: "0 10px 10px 10px", padding: 16 };

  if (!catalog.length) {
    return <div style={wrap}><p style={{ color: "#64748b", fontSize: 14 }}>No classes yet — add a class in the Class Library first.</p></div>;
  }

  const classPicker = (
    <select style={{ ...selStyle, fontWeight: 700, fontSize: 14, maxWidth: 280 }} value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
      {classes.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
    </select>
  );

  return (
    <div style={wrap}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 14 }}>
        {classPicker}
        {term && sessionDates.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button style={{ ...btnSecondary, padding: "6px 10px" }} disabled={dateIdx <= 0} onClick={() => setSelectedDate(sessionDates[dateIdx - 1])}>◀</button>
            <select style={{ ...selStyle, fontWeight: 600 }} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}>
              {sessions.map((s) => <option key={s.date} value={s.date}>{formatDateLabel(s.date)}</option>)}
            </select>
            <button style={{ ...btnSecondary, padding: "6px 10px" }} disabled={dateIdx >= sessionDates.length - 1} onClick={() => setSelectedDate(sessionDates[dateIdx + 1])}>▶</button>
          </div>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8" }}>
          {cls?.teacher ? `Teacher: ${cls.teacher}` : "Teacher TBD"}
          {onEditClass && <> · <button style={{ ...btnSecondary, padding: "4px 9px", fontSize: 12 }} onClick={() => onEditClass(selectedClassId)}>Edit class</button></>}
        </span>
      </div>

      {!term ? (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: 16, color: "#92400e", fontSize: 14 }}>
          <b>Set the term first.</b> The Classbook turns each class's weekdays into dated sessions using the program term.
          {onSetTerm ? (
            <div style={{ marginTop: 10 }}><button style={btnPrimary} onClick={onSetTerm}>Set term dates</button></div>
          ) : (
            <div style={{ marginTop: 8, fontSize: 13 }}>Ask a staff member to set term dates on the main scheduler.</div>
          )}
        </div>
      ) : !sessionDates.length ? (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, color: "#64748b", fontSize: 14 }}>
          <b>{cls?.name}</b> has no sessions in the term. Schedule it on the calendar, or check the term dates.
        </div>
      ) : (
        <>
          {/* Lesson content + homework for this session */}
          <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 4 }}>📘 Lesson content</span>
              <textarea
                style={{ ...inputStyle, minHeight: 80, resize: "vertical", fontFamily: "inherit" }}
                placeholder="What was taught this session…"
                value={content}
                disabled={planReadOnly}
                onChange={(e) => setContent(e.target.value)}
                onBlur={() => { if ((sessionLog?.content || "") !== content) saveSessionLog({ content }); }}
              />
            </label>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 4 }}>📝 Homework assigned</span>
              <textarea
                style={{ ...inputStyle, minHeight: 80, resize: "vertical", fontFamily: "inherit" }}
                placeholder="Homework given out this session…"
                value={homework}
                disabled={planReadOnly}
                onChange={(e) => setHomework(e.target.value)}
                onBlur={() => { if ((sessionLog?.homework || "") !== homework) saveSessionLog({ homework }); }}
              />
            </label>
          </div>

          {/* Roster: attendance + homework completion */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: "#64748b" }}>
              {roster.length} student{roster.length === 1 ? "" : "s"} ·{" "}
              <span style={{ color: "#0d7a72", fontWeight: 600 }}>{summary.present} present</span>,{" "}
              <span style={{ color: "#dc2626", fontWeight: 600 }}>{summary.absent} absent</span>
              {summary.tardy ? <>, <span style={{ color: "#d97706", fontWeight: 600 }}>{summary.tardy} tardy</span></> : null}
              {" "}· {summary.hwDone}/{roster.length} HW done
            </div>
            {!planReadOnly && roster.length > 0 && (
              <button style={{ ...btnSecondary, padding: "6px 12px", fontSize: 13 }} onClick={markAllPresent}>✓ Mark all present</button>
            )}
          </div>

          {roster.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: 13 }}>No students on this class's roster yet. Add them in the class dialog.</p>
          ) : narrow ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {roster.map((s) => {
                const r = attByStudent.get(studentKey(s)) || {};
                return (
                  <div key={s} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{s}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 3 }}>Attendance</div>
                    <div style={{ marginBottom: 10 }}>
                      <StatusPicker big value={r.status || ""} options={ATT_OPTS} disabled={planReadOnly} onChange={(v) => upsertAttendance(s, { status: v })} />
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 3 }}>Homework</div>
                    <div>
                      <StatusPicker big value={r.homework || ""} options={HW_OPTS} disabled={planReadOnly} onChange={(v) => upsertAttendance(s, { homework: v })} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: "left", position: "sticky", left: 0, zIndex: 1 }}>Student</th>
                    <th style={thStyle}>Attendance</th>
                    <th style={thStyle}>Homework completion</th>
                    <th style={{ ...thStyle, textAlign: "left" }}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((s) => {
                    const r = attByStudent.get(studentKey(s)) || {};
                    return (
                      <tr key={s}>
                        <td style={{ ...tdStyle, fontWeight: 700, whiteSpace: "nowrap", position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>{s}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <StatusPicker value={r.status || ""} options={ATT_OPTS} disabled={planReadOnly} onChange={(v) => upsertAttendance(s, { status: v })} />
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <StatusPicker value={r.homework || ""} options={HW_OPTS} disabled={planReadOnly} onChange={(v) => upsertAttendance(s, { homework: v })} />
                        </td>
                        <td style={tdStyle}>
                          <input
                            key={`${selectedClassId}|${selectedDate}|${s}`}
                            style={{ ...inputStyle, padding: "5px 8px", fontSize: 13, minWidth: 120 }}
                            placeholder="—"
                            defaultValue={r.note || ""}
                            disabled={planReadOnly}
                            onBlur={(e) => { if ((r.note || "") !== e.target.value) upsertAttendance(s, { note: e.target.value }); }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {sessionLog?.content || sessionLog?.homework || summary.recorded ? (
            <p style={{ fontSize: 11, color: "#cbd5d1", marginTop: 12 }}>
              Records save automatically{currentTeacher ? ` as ${currentTeacher}` : ""}.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
