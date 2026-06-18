// Program term editor — start/end dates + no-class (skip) dates. The term turns
// each class's weekday placements into concrete dated sessions.
import React, { useState } from "react";
import { formatDateLabel } from "../domain/scheduleLogic.ts";
import { Overlay, Field, inputStyle, btnPrimary, btnSecondary, roomConflictStyle, miniBtn } from "./uikit.jsx";

const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

export default function TermModal({ term, onSave, onClose }) {
  const [start, setStart] = useState(term?.start || "");
  const [end, setEnd] = useState(term?.end || "");
  const [skipDates, setSkipDates] = useState(term?.skipDates || []);
  const [skipInput, setSkipInput] = useState("");
  const [error, setError] = useState("");

  const addSkip = () => {
    if (!isISO(skipInput)) { setError("Pick a valid no-class date."); return; }
    if (!skipDates.includes(skipInput)) setSkipDates([...skipDates, skipInput].sort());
    setSkipInput("");
    setError("");
  };

  const submit = () => {
    if (!isISO(start) || !isISO(end)) { setError("Enter valid start and end dates."); return; }
    if (end < start) { setError("End date must be on or after the start date."); return; }
    onSave({ start, end, skipDates: skipDates.filter(isISO) });
  };

  return (
    <Overlay onClose={onClose}>
      <h3 style={{ marginTop: 0, color: "#123c3a" }}>Program term</h3>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px", lineHeight: 1.45 }}>
        Sets the date range used to generate each class's sessions for attendance, homework, and quizzes.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Start date">
          <input style={inputStyle} type="date" value={start} onChange={(e) => { setStart(e.target.value); setError(""); }} autoFocus />
        </Field>
        <Field label="End date">
          <input style={inputStyle} type="date" value={end} onChange={(e) => { setEnd(e.target.value); setError(""); }} />
        </Field>
      </div>

      <Field label="No-class dates (holidays)">
        <div style={{ display: "flex", gap: 8 }}>
          <input style={inputStyle} type="date" value={skipInput} onChange={(e) => { setSkipInput(e.target.value); setError(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkip(); } }} />
          <button style={{ ...btnSecondary, whiteSpace: "nowrap" }} onClick={addSkip}>＋ Add</button>
        </div>
      </Field>
      {skipDates.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {skipDates.map((d) => (
            <span key={d} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#f1f5f9", borderRadius: 6, padding: "3px 4px 3px 9px", fontSize: 12, color: "#475569" }}>
              {formatDateLabel(d)}
              <button style={{ ...miniBtn, width: 18, height: 18, fontSize: 11 }} onClick={() => setSkipDates(skipDates.filter((x) => x !== d))}>✕</button>
            </span>
          ))}
        </div>
      )}

      {error && <div style={{ ...roomConflictStyle, marginBottom: 12 }}>{error}</div>}

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 8 }}>
        {term ? <button style={{ ...btnSecondary, color: "#b91c1c" }} onClick={() => onSave(null)}>Clear term</button> : <span />}
        <div style={{ display: "flex", gap: 10 }}>
          <button style={btnSecondary} onClick={onClose}>Cancel</button>
          <button style={btnPrimary} onClick={submit}>Save term</button>
        </div>
      </div>
    </Overlay>
  );
}
