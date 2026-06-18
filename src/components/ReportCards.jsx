// 🪪 Report Cards — per student: attendance, homework completion, quiz scores,
// and teacher comments, aggregated across all their classes. Printable + CSV export.
import React, { useState, useMemo, useEffect } from "react";
import { buildReportCard, formatDateLabel, studentKey } from "../domain/scheduleLogic.ts";
import { inputStyle, selStyle, btnPrimary, btnSecondary, thStyle, tdStyle } from "./uikit.jsx";
import { fmtPct, fmtPctNum, downloadCSV } from "./classbookUtils.jsx";

const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  #report-card-print, #report-card-print * { visibility: visible !important; }
  #report-card-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; border: none !important; }
  .no-print { display: none !important; }
}`;

function StatTile({ label, value, sub, tone }) {
  return (
    <div style={{ flex: "1 1 120px", minWidth: 110, border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", background: "#fafaf8" }}>
      <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: tone || "#123c3a", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function ReportCards({ data, persist, currentTeacher, planReadOnly }) {
  const { students = [], programLabel, term } = data;
  const [student, setStudent] = useState(students[0] || "");

  useEffect(() => {
    if (!students.some((s) => studentKey(s) === studentKey(student))) setStudent(students[0] || "");
  }, [students, student]);

  const card = useMemo(() => buildReportCard(student, data), [student, data]);

  const saveComment = (classId, comment) => {
    if (planReadOnly) return;
    persist((d) => {
      const k = `${classId}|${studentKey(student)}`;
      const rest = (d.reportComments || []).filter((c) => `${c.classId}|${studentKey(c.student)}` !== k);
      if (!comment.trim()) return { ...d, reportComments: rest };
      return { ...d, reportComments: [...rest, { classId, student, comment, by: currentTeacher || "", at: new Date().toISOString() }] };
    });
  };

  const exportAll = () => {
    const header = ["Student", "Class", "Teacher", "Attendance %", "Present", "Absent", "Tardy", "Excused", "HW completion %", "Quiz avg %"];
    const rows = [];
    students.forEach((s) => {
      buildReportCard(s, data).classes.forEach((c) => {
        rows.push([
          s, c.className, c.teacher,
          c.attendance.rate == null ? "" : Math.round(c.attendance.rate * 100),
          c.attendance.present, c.attendance.absent, c.attendance.tardy, c.attendance.excused,
          c.homework.rate == null ? "" : Math.round(c.homework.rate * 100),
          c.quiz.avgPct == null ? "" : Math.round(c.quiz.avgPct),
        ]);
      });
    });
    downloadCSV("report-cards.csv", [header, ...rows]);
  };

  const wrap = { background: "#fff", border: "1px solid #d6dad4", borderRadius: "0 10px 10px 10px", padding: 16 };
  if (!students.length) {
    return <div style={wrap}><p style={{ color: "#64748b", fontSize: 14 }}>No students yet — add students to class rosters first.</p></div>;
  }

  const idx = students.indexOf(student);

  return (
    <div style={wrap}>
      <style>{PRINT_CSS}</style>
      <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <button style={{ ...btnSecondary, padding: "6px 10px" }} disabled={idx <= 0} onClick={() => setStudent(students[idx - 1])}>◀</button>
        <select style={{ ...selStyle, fontWeight: 700, fontSize: 14, maxWidth: 240 }} value={student} onChange={(e) => setStudent(e.target.value)}>
          {students.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button style={{ ...btnSecondary, padding: "6px 10px" }} disabled={idx >= students.length - 1} onClick={() => setStudent(students[idx + 1])}>▶</button>
        <button style={btnPrimary} onClick={() => window.print()}>🖨 Print</button>
        <button style={{ ...btnSecondary, fontSize: 13 }} onClick={exportAll}>⬇ Export all (CSV)</button>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8" }}>{card.classes.length} classes</span>
      </div>

      <div id="report-card-print" style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 24, maxWidth: 860 }}>
        <div style={{ borderBottom: "2px solid #123c3a", paddingBottom: 12, marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{programLabel || "Report Card"}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ margin: "4px 0 0", color: "#123c3a", fontSize: 26 }}>{student}</h2>
            {term && <div style={{ fontSize: 12, color: "#64748b" }}>{formatDateLabel(term.start)} – {formatDateLabel(term.end)}</div>}
          </div>
        </div>

        {card.classes.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 14 }}>{student} is not on any class roster yet.</p>
        ) : (
          card.classes.map((c) => (
            <div key={c.classId} style={{ marginBottom: 22, breakInside: "avoid" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6 }}>
                <h3 style={{ margin: "0 0 2px", color: "#123c3a", fontSize: 18 }}>{c.className}</h3>
                <div style={{ fontSize: 12, color: "#64748b" }}>{c.teacher || "Teacher TBD"}{c.schedule.length ? ` · ${c.schedule.join(" · ")}` : ""}</div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "10px 0" }}>
                <StatTile
                  label="Attendance"
                  value={fmtPct(c.attendance.rate)}
                  sub={`${c.attendance.present} present · ${c.attendance.absent} absent · ${c.attendance.tardy} tardy`}
                  tone={c.attendance.rate != null && c.attendance.rate < 0.8 ? "#b45309" : "#0f766e"}
                />
                <StatTile
                  label="Homework"
                  value={fmtPct(c.homework.rate)}
                  sub={`${c.homework.complete} complete · ${c.homework.missing} missing`}
                  tone={c.homework.rate != null && c.homework.rate < 0.7 ? "#b45309" : "#0f766e"}
                />
                <StatTile
                  label="Quiz average"
                  value={fmtPctNum(c.quiz.avgPct)}
                  sub={`${c.quiz.count} quiz${c.quiz.count === 1 ? "" : "zes"}`}
                  tone={c.quiz.avgPct != null && c.quiz.avgPct < 60 ? "#b91c1c" : "#0f766e"}
                />
              </div>

              {c.quiz.detail.length > 0 && (
                <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 480, marginBottom: 10 }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, textAlign: "left", padding: "5px 8px" }}>Quiz</th>
                      <th style={{ ...thStyle, padding: "5px 8px" }}>Date</th>
                      <th style={{ ...thStyle, padding: "5px 8px" }}>Score</th>
                      <th style={{ ...thStyle, padding: "5px 8px" }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.quiz.detail.map((q) => (
                      <tr key={q.quizId}>
                        <td style={{ ...tdStyle, padding: "5px 8px" }}>{q.title}</td>
                        <td style={{ ...tdStyle, padding: "5px 8px", textAlign: "center", color: "#64748b" }}>{q.date ? formatDateLabel(q.date) : "—"}</td>
                        <td style={{ ...tdStyle, padding: "5px 8px", textAlign: "center" }}>{q.score}{q.maxScore ? ` / ${q.maxScore}` : ""}</td>
                        <td style={{ ...tdStyle, padding: "5px 8px", textAlign: "center", fontWeight: 700 }}>{fmtPctNum(q.pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Teacher comment</div>
                {planReadOnly ? (
                  <p style={{ margin: 0, fontSize: 13, color: c.comment ? "#334155" : "#cbd5d1", whiteSpace: "pre-wrap" }}>{c.comment || "—"}</p>
                ) : (
                  <textarea
                    key={`${c.classId}|${student}`}
                    style={{ ...inputStyle, minHeight: 54, resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
                    defaultValue={c.comment}
                    placeholder={`Comment on ${student}'s progress in ${c.className}…`}
                    onBlur={(e) => { if (e.target.value !== c.comment) saveComment(c.classId, e.target.value); }}
                  />
                )}
              </div>
            </div>
          ))
        )}
        <div style={{ marginTop: 16, fontSize: 11, color: "#94a3b8" }}>Generated {new Date().toLocaleDateString()}</div>
      </div>
    </div>
  );
}
