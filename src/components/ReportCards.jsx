// 🪪 Report Cards — per student: attendance, homework completion, quiz scores,
// and teacher comments. View by student (all classes) or by class (roster walk-through).
// Printable + CSV export.
import React, { useState, useMemo, useEffect } from "react";
import {
  buildReportCard,
  formatDateLabel,
  studentKey,
  sortCatalogForRosterView,
} from "../domain/scheduleLogic.ts";
import { inputStyle, selStyle, btnPrimary, btnSecondary, thStyle, tdStyle } from "./uikit.jsx";
import { fmtPct, fmtPctNum, downloadCSV } from "./classbookUtils.jsx";

const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  #report-card-print, #report-card-print * { visibility: visible !important; }
  #report-card-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; border: none !important; }
  .no-print { display: none !important; }
}`;

const MODE_BTN = {
  padding: "6px 12px",
  fontSize: 13,
  fontWeight: 600,
  border: "1px solid #cbd5d1",
  background: "#fff",
  color: "#475569",
  cursor: "pointer",
  lineHeight: 1.2,
};
const MODE_BTN_ACTIVE = {
  ...MODE_BTN,
  background: "#123c3a",
  color: "#fff",
  borderColor: "#123c3a",
};

function StatTile({ label, value, sub, tone }) {
  return (
    <div style={{ flex: "1 1 120px", minWidth: 110, border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", background: "#fafaf8" }}>
      <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: tone || "#123c3a", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ClassSection({ c, student, planReadOnly, saveComment }) {
  return (
    <div style={{ marginBottom: 22, breakInside: "avoid" }}>
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
  );
}

export default function ReportCards({ data, persist, currentTeacher, planReadOnly }) {
  const { students = [], catalog = [], placements = [], programLabel, term } = data;
  const [mode, setMode] = useState("student"); // "student" | "class"
  const classes = useMemo(() => sortCatalogForRosterView(catalog, placements), [catalog, placements]);
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id || "");
  const [student, setStudent] = useState(students[0] || "");

  // Keep a valid class selected as the catalog changes.
  useEffect(() => {
    if (!classes.some((k) => k.id === selectedClassId)) setSelectedClassId(classes[0]?.id || "");
  }, [classes, selectedClassId]);

  const selectedClass = catalog.find((k) => k.id === selectedClassId) || null;
  const classRoster = useMemo(() => {
    const list = selectedClass?.students || [];
    // Stable alpha order for walk-through (case-insensitive).
    return list.slice().sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: "base" }));
  }, [selectedClass]);

  // Student list depends on mode: full master list vs class roster.
  const studentList = mode === "class" ? classRoster : students;

  // Keep student valid for the active list.
  useEffect(() => {
    if (!studentList.length) {
      if (student) setStudent("");
      return;
    }
    if (!studentList.some((s) => studentKey(s) === studentKey(student))) {
      setStudent(studentList[0]);
    }
  }, [studentList, student]);

  // When switching into by-class mode, land on the first roster student if current isn't in class.
  const switchMode = (next) => {
    setMode(next);
    if (next === "class") {
      const roster = selectedClass?.students || [];
      if (roster.length && !roster.some((s) => studentKey(s) === studentKey(student))) {
        setStudent(roster.slice().sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: "base" }))[0]);
      }
    } else if (students.length && !students.some((s) => studentKey(s) === studentKey(student))) {
      setStudent(students[0]);
    }
  };

  const fullCard = useMemo(() => (student ? buildReportCard(student, data) : { student: "", classes: [] }), [student, data]);
  // By class: only the selected class section. By student: all of their classes.
  const displayClasses = useMemo(() => {
    if (mode !== "class") return fullCard.classes;
    return fullCard.classes.filter((c) => c.classId === selectedClassId);
  }, [mode, fullCard.classes, selectedClassId]);

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
    const sourceStudents = mode === "class" ? classRoster : students;
    sourceStudents.forEach((s) => {
      buildReportCard(s, data).classes.forEach((c) => {
        if (mode === "class" && c.classId !== selectedClassId) return;
        rows.push([
          s, c.className, c.teacher,
          c.attendance.rate == null ? "" : Math.round(c.attendance.rate * 100),
          c.attendance.present, c.attendance.absent, c.attendance.tardy, c.attendance.excused,
          c.homework.rate == null ? "" : Math.round(c.homework.rate * 100),
          c.quiz.avgPct == null ? "" : Math.round(c.quiz.avgPct),
        ]);
      });
    });
    const name = mode === "class" && selectedClass
      ? `report-cards-${selectedClass.name.replace(/[^\w\-]+/g, "_")}.csv`
      : "report-cards.csv";
    downloadCSV(name, [header, ...rows]);
  };

  const wrap = { background: "#fff", border: "1px solid #d6dad4", borderRadius: "0 10px 10px 10px", padding: 16 };

  if (mode === "student" && !students.length) {
    return <div style={wrap}><p style={{ color: "#64748b", fontSize: 14 }}>No students yet — add students to class rosters first.</p></div>;
  }
  if (mode === "class" && !catalog.length) {
    return <div style={wrap}><p style={{ color: "#64748b", fontSize: 14 }}>No classes yet — add a class first.</p></div>;
  }

  const idx = studentList.findIndex((s) => studentKey(s) === studentKey(student));
  const safeIdx = idx < 0 ? 0 : idx;

  return (
    <div style={wrap}>
      <style>{PRINT_CSS}</style>

      {/* Mode toggle + filters */}
      <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "inline-flex", borderRadius: 8, overflow: "hidden" }} role="group" aria-label="Report card view mode">
          <button
            type="button"
            style={{ ...MODE_BTN, ...(mode === "student" ? MODE_BTN_ACTIVE : {}), borderRadius: "8px 0 0 8px", borderRight: mode === "student" ? "1px solid #123c3a" : "1px solid #cbd5d1" }}
            onClick={() => switchMode("student")}
          >
            🎓 By Student
          </button>
          <button
            type="button"
            style={{ ...MODE_BTN, ...(mode === "class" ? MODE_BTN_ACTIVE : {}), borderRadius: "0 8px 8px 0", borderLeft: "none" }}
            onClick={() => switchMode("class")}
          >
            📋 By Class
          </button>
        </div>

        {mode === "class" && (
          <select
            style={{ ...selStyle, fontWeight: 700, fontSize: 14, maxWidth: 280 }}
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
          >
            {classes.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        )}

        <span style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8" }}>
          {mode === "class"
            ? `${classRoster.length} students in class`
            : `${fullCard.classes.length} classes`}
        </span>
      </div>

      {/* Student navigation */}
      <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
        {studentList.length > 0 ? (
          <>
            <button
              style={{ ...btnSecondary, padding: "6px 10px" }}
              disabled={safeIdx <= 0}
              onClick={() => setStudent(studentList[safeIdx - 1])}
            >
              ◀
            </button>
            <select
              style={{ ...selStyle, fontWeight: 700, fontSize: 14, maxWidth: 240 }}
              value={studentList.find((s) => studentKey(s) === studentKey(student)) || studentList[0] || ""}
              onChange={(e) => setStudent(e.target.value)}
            >
              {studentList.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              style={{ ...btnSecondary, padding: "6px 10px" }}
              disabled={safeIdx >= studentList.length - 1}
              onClick={() => setStudent(studentList[safeIdx + 1])}
            >
              ▶
            </button>
            <button style={btnPrimary} onClick={() => window.print()}>🖨 Print</button>
            <button style={{ ...btnSecondary, fontSize: 13 }} onClick={exportAll}>
              ⬇ {mode === "class" ? "Export class (CSV)" : "Export all (CSV)"}
            </button>
            {mode === "class" && studentList.length > 0 && (
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                {safeIdx + 1} / {studentList.length}
              </span>
            )}
          </>
        ) : (
          <p style={{ margin: 0, color: "#94a3b8", fontSize: 14 }}>
            {mode === "class" ? "This class has no students on the roster yet." : "No students yet."}
          </p>
        )}
      </div>

      {studentList.length > 0 && student && (
        <div id="report-card-print" style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 24, maxWidth: 860 }}>
          <div style={{ borderBottom: "2px solid #123c3a", paddingBottom: 12, marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
              {programLabel || "Report Card"}
              {mode === "class" && selectedClass ? ` · ${selectedClass.name}` : ""}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ margin: "4px 0 0", color: "#123c3a", fontSize: 26 }}>{student}</h2>
              {term && <div style={{ fontSize: 12, color: "#64748b" }}>{formatDateLabel(term.start)} – {formatDateLabel(term.end)}</div>}
            </div>
          </div>

          {displayClasses.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: 14 }}>
              {mode === "class"
                ? `${student} has no report data for this class yet.`
                : `${student} is not on any class roster yet.`}
            </p>
          ) : (
            displayClasses.map((c) => (
              <ClassSection key={c.classId} c={c} student={student} planReadOnly={planReadOnly} saveComment={saveComment} />
            ))
          )}
          <div style={{ marginTop: 16, fontSize: 11, color: "#94a3b8" }}>Generated {new Date().toLocaleDateString()}</div>
        </div>
      )}
    </div>
  );
}
