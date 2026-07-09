// "Who's recording" picker — stamps Classbook / Grades / Report Card entries with a name.
// Not authentication: anyone with the app URL can still edit the shared schedule. Identity
// is stored per-browser in localStorage and used only as an audit trail (`by` / `at`).
import React, { useState } from "react";
import { Overlay, Field, selStyle, btnPrimary, btnSecondary, roomConflictStyle } from "./uikit.jsx";

export default function IdentityModal({ teachers, current, onSelect, onClear, onClose }) {
  const list = (teachers || []).filter(Boolean);
  const [name, setName] = useState(current || list[0] || "");
  const [error, setError] = useState("");

  const submit = () => {
    if (!name) { setError("Pick a teacher."); return; }
    onSelect(name);
  };

  return (
    <Overlay onClose={onClose}>
      <h3 style={{ marginTop: 0, color: "#123c3a" }}>Who's recording?</h3>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px", lineHeight: 1.45 }}>
        Attendance, homework, and quiz entries are stamped with this name so the team can see who recorded them.
        This is an audit label only — not a login.
      </p>

      {list.length === 0 ? (
        <div style={{ ...roomConflictStyle, background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" }}>
          Add teachers first (👤 By Teacher → Manage teachers), then pick yourself here.
        </div>
      ) : (
        <>
          <Field label="Teacher">
            <select style={selStyle} value={name} onChange={(e) => { setName(e.target.value); setError(""); }}>
              {list.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          {error && <div style={{ ...roomConflictStyle, marginBottom: 12 }}>{error}</div>}
        </>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 8 }}>
        {current ? <button style={{ ...btnSecondary, color: "#b91c1c" }} onClick={onClear}>Clear</button> : <span />}
        <div style={{ display: "flex", gap: 10 }}>
          <button style={btnSecondary} onClick={onClose}>Cancel</button>
          {list.length > 0 && <button style={btnPrimary} onClick={submit}>Record as {name}</button>}
        </div>
      </div>
    </Overlay>
  );
}
