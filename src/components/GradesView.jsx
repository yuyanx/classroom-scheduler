// 📝 Grades — quizzes (the Mon–Fri "Friday quiz", or any assessment) and per-student scores.
import React, { useState, useMemo, useEffect } from "react";
import {
  suggestQuizDates,
  todayISO,
  formatDateLabel,
  studentKey,
  quizAverage,
  sortCatalogForRosterView,
} from "../domain/scheduleLogic.ts";
import { inputStyle, selStyle, btnPrimary, btnSecondary, miniBtn, thStyle, tdStyle } from "./uikit.jsx";
import { fmtPctNum, downloadCSV } from "./classbookUtils.jsx";

export default function GradesView({ data, persist, currentTeacher, planReadOnly, onSetTerm }) {
  const { catalog = [], placements = [], term } = data;
  const classes = useMemo(() => sortCatalogForRosterView(catalog, placements), [catalog, placements]);
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id || "");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!classes.some((k) => k.id === selectedClassId)) setSelectedClassId(classes[0]?.id || "");
  }, [classes, selectedClassId]);

  const cls = catalog.find((k) => k.id === selectedClassId) || null;
  const roster = cls?.students || [];

  const quizzes = useMemo(
    () => (data.quizzes || []).filter((q) => q.classId === selectedClassId).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))),
    [data.quizzes, selectedClassId],
  );
  const scoreByKey = useMemo(() => {
    const m = new Map();
    (data.quizScores || []).forEach((s) => m.set(`${s.quizId}|${studentKey(s.student)}`, s.score));
    return m;
  }, [data.quizScores]);

  const stamp = () => ({ by: currentTeacher || "", at: new Date().toISOString() });

  const suggestedDate = useMemo(() => {
    const fridays = suggestQuizDates(selectedClassId, placements, term);
    if (!fridays.length) return todayISO();
    const today = todayISO();
    return fridays.find((d) => d >= today) || fridays[fridays.length - 1];
  }, [selectedClassId, placements, term]);

  const addQuiz = (quiz) => {
    if (planReadOnly) return;
    persist((d) => {
      const nid = d.nextId || 1000;
      return { ...d, quizzes: [...(d.quizzes || []), { id: "q" + nid, kind: "quiz", ...quiz, classId: selectedClassId }], nextId: nid + 1 };
    });
  };
  const updateQuiz = (quizId, patch) => {
    if (planReadOnly) return;
    persist((d) => ({ ...d, quizzes: (d.quizzes || []).map((q) => (q.id === quizId ? { ...q, ...patch } : q)) }));
  };
  const deleteQuiz = (quizId) => {
    if (planReadOnly) return;
    persist((d) => ({
      ...d,
      quizzes: (d.quizzes || []).filter((q) => q.id !== quizId),
      quizScores: (d.quizScores || []).filter((s) => s.quizId !== quizId),
    }));
  };
  const setScore = (quizId, student, raw) => {
    if (planReadOnly) return;
    persist((d) => {
      const k = `${quizId}|${studentKey(student)}`;
      const rest = (d.quizScores || []).filter((s) => `${s.quizId}|${studentKey(s.student)}` !== k);
      const trimmed = String(raw).trim();
      if (trimmed === "") return { ...d, quizScores: rest };
      const score = Number(trimmed);
      if (!Number.isFinite(score)) return d;
      return { ...d, quizScores: [...rest, { quizId, student, score, note: "", ...stamp() }] };
    });
  };

  const classAvgForQuiz = (q) => {
    const vals = roster.map((s) => scoreByKey.get(`${q.id}|${studentKey(s)}`)).filter((v) => v != null);
    if (!vals.length || !(q.maxScore > 0)) return null;
    return (vals.reduce((a, b) => a + Number(b), 0) / vals.length / q.maxScore) * 100;
  };

  const exportCSV = () => {
    const header = ["Student", ...quizzes.map((q) => `${q.title} (${formatDateLabel(q.date)}) /${q.maxScore}`), "Average %"];
    const rows = roster.map((s) => {
      const cells = quizzes.map((q) => { const v = scoreByKey.get(`${q.id}|${studentKey(s)}`); return v == null ? "" : v; });
      const avg = quizAverage(quizzes, data.quizScores, selectedClassId, s).avgPct;
      return [s, ...cells, avg == null ? "" : Math.round(avg)];
    });
    downloadCSV(`${cls?.name || "class"}-quiz-scores.csv`, [header, ...rows]);
  };

  const wrap = { background: "#fff", border: "1px solid #d6dad4", borderRadius: "0 10px 10px 10px", padding: 16 };
  if (!catalog.length) {
    return <div style={wrap}><p style={{ color: "#64748b", fontSize: 14 }}>No classes yet — add a class first.</p></div>;
  }

  return (
    <div style={wrap}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <select style={{ ...selStyle, fontWeight: 700, fontSize: 14, maxWidth: 280 }} value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
          {classes.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
        {!planReadOnly && term && <button style={btnPrimary} onClick={() => setAdding((v) => !v)}>{adding ? "Close" : "＋ New quiz"}</button>}
        {quizzes.length > 0 && <button style={{ ...btnSecondary, fontSize: 13 }} onClick={exportCSV}>⬇ Export CSV</button>}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8" }}>{quizzes.length} quizzes · {roster.length} students</span>
      </div>

      {!term ? (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: 16, color: "#92400e", fontSize: 14 }}>
          <b>Set the term first</b> so quiz dates line up with the program calendar.
          {onSetTerm ? (
            <div style={{ marginTop: 10 }}><button style={btnPrimary} onClick={onSetTerm}>Set term dates</button></div>
          ) : (
            <div style={{ marginTop: 8, fontSize: 13 }}>Ask a staff member to set term dates on the main scheduler.</div>
          )}
        </div>
      ) : (
        <>
          {adding && !planReadOnly && (
            <AddQuizForm
              suggestedDate={suggestedDate}
              defaultTitle={`Quiz ${quizzes.length + 1}`}
              fridays={suggestQuizDates(selectedClassId, placements, term)}
              onAdd={(q) => { addQuiz(q); setAdding(false); }}
              onCancel={() => setAdding(false)}
            />
          )}

          {quizzes.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 8 }}>No quizzes yet. Use <b>＋ New quiz</b> — Friday dates are suggested for Mon–Fri classes.</p>
          ) : roster.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: 13 }}>No students on this roster yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: "left", position: "sticky", left: 0, zIndex: 1 }}>Student</th>
                    {quizzes.map((q) => (
                      <th key={q.id} style={{ ...thStyle, minWidth: 92 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
                          <input
                            style={{ ...inputStyle, padding: "2px 4px", fontSize: 12, fontWeight: 700, textAlign: "center" }}
                            defaultValue={q.title}
                            key={`t${q.id}`}
                            disabled={planReadOnly}
                            onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== q.title) updateQuiz(q.id, { title: t }); }}
                          />
                          <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 400 }}>{formatDateLabel(q.date)}</span>
                          <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 400 }}>
                            /{" "}
                            <input
                              style={{ width: 38, padding: "1px 2px", fontSize: 10, border: "1px solid #e2e8f0", borderRadius: 4, textAlign: "center" }}
                              type="number" min="1" defaultValue={q.maxScore} key={`m${q.id}`}
                              disabled={planReadOnly}
                              onBlur={(e) => { const n = Number(e.target.value); if (n > 0 && n !== q.maxScore) updateQuiz(q.id, { maxScore: n }); }}
                            />
                            {!planReadOnly && <button style={{ ...miniBtn, width: 18, height: 18, marginLeft: 4, color: "#b91c1c" }} title="Delete quiz" onClick={() => deleteQuiz(q.id)}>✕</button>}
                          </span>
                        </div>
                      </th>
                    ))}
                    <th style={{ ...thStyle, minWidth: 64 }}>Avg %</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((s) => {
                    const avg = quizAverage(quizzes, data.quizScores, selectedClassId, s).avgPct;
                    return (
                      <tr key={s}>
                        <td style={{ ...tdStyle, fontWeight: 700, whiteSpace: "nowrap", position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>{s}</td>
                        {quizzes.map((q) => {
                          const v = scoreByKey.get(`${q.id}|${studentKey(s)}`);
                          return (
                            <td key={q.id} style={{ ...tdStyle, textAlign: "center" }}>
                              <input
                                key={`${q.id}|${s}`}
                                style={{ ...inputStyle, padding: "5px 4px", fontSize: 13, textAlign: "center", width: 60 }}
                                type="number" min="0" max={q.maxScore} placeholder="—"
                                defaultValue={v == null ? "" : v}
                                disabled={planReadOnly}
                                onBlur={(e) => { const cur = v == null ? "" : String(v); if (e.target.value !== cur) setScore(q.id, s, e.target.value); }}
                              />
                            </td>
                          );
                        })}
                        <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, color: avg == null ? "#cbd5d1" : avg >= 60 ? "#0f766e" : "#b91c1c" }}>{fmtPctNum(avg)}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "#64748b", position: "sticky", left: 0, background: "#fafaf8" }}>Class avg</td>
                    {quizzes.map((q) => { const a = classAvgForQuiz(q); return <td key={q.id} style={{ ...tdStyle, textAlign: "center", fontWeight: 600, color: "#64748b", background: "#fafaf8" }}>{fmtPctNum(a)}</td>; })}
                    <td style={{ ...tdStyle, background: "#fafaf8" }} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AddQuizForm({ suggestedDate, defaultTitle, fridays, onAdd, onCancel }) {
  const [title, setTitle] = useState(defaultTitle);
  const [date, setDate] = useState(suggestedDate);
  const [maxScore, setMaxScore] = useState(100);
  const [error, setError] = useState("");

  const submit = () => {
    if (!title.trim()) return setError("Enter a quiz title.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Pick a valid date.");
    const n = Number(maxScore);
    if (!(n > 0)) return setError("Max score must be greater than 0.");
    onAdd({ title: title.trim(), date, maxScore: n });
  };

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <label style={{ fontSize: 12, color: "#475569" }}>Title<br /><input style={{ ...inputStyle, width: 160 }} value={title} onChange={(e) => { setTitle(e.target.value); setError(""); }} autoFocus /></label>
        <label style={{ fontSize: 12, color: "#475569" }}>Date<br /><input style={{ ...inputStyle, width: 160 }} type="date" value={date} onChange={(e) => { setDate(e.target.value); setError(""); }} /></label>
        <label style={{ fontSize: 12, color: "#475569" }}>Max score<br /><input style={{ ...inputStyle, width: 90 }} type="number" min="1" value={maxScore} onChange={(e) => { setMaxScore(e.target.value); setError(""); }} /></label>
        <button style={btnPrimary} onClick={submit}>Add quiz</button>
        <button style={btnSecondary} onClick={onCancel}>Cancel</button>
      </div>
      {fridays.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          Suggested Fridays:
          {fridays.slice(0, 8).map((d) => (
            <button key={d} onClick={() => setDate(d)} style={{ border: "1px solid #cbd5d1", borderRadius: 6, background: date === d ? "#e6f4f3" : "#fff", color: "#0f766e", fontSize: 11, padding: "2px 6px", cursor: "pointer" }}>{formatDateLabel(d)}</button>
          ))}
        </div>
      )}
      {error && <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 12, fontWeight: 600 }}>{error}</div>}
    </div>
  );
}
