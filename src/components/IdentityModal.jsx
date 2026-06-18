// Lightweight "who's recording" picker — stamps records with the current teacher.
// NOT real authentication (the anon Supabase key still ships in the bundle); the
// optional PIN is just a soft gate so people don't pick each other by accident.
import React, { useState } from "react";
import { Overlay, Field, selStyle, inputStyle, btnPrimary, btnSecondary, roomConflictStyle } from "./uikit.jsx";

export default function IdentityModal({ teachers, staffPins, current, onSignIn, onSavePin, onSignOut, onClose }) {
  const list = (teachers || []).filter(Boolean);
  const [name, setName] = useState(current || list[0] || "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const hasPin = !!(staffPins && staffPins[name]);

  const submit = () => {
    if (!name) { setError("Pick a teacher."); return; }
    if (hasPin) {
      if (pin !== staffPins[name]) { setError("Incorrect PIN."); return; }
      onSignIn(name);
      return;
    }
    // No PIN yet — if one was typed, set it; either way sign in.
    if (pin.trim()) onSavePin(name, pin.trim());
    onSignIn(name);
  };

  return (
    <Overlay onClose={onClose}>
      <h3 style={{ marginTop: 0, color: "#123c3a" }}>Who's recording?</h3>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px", lineHeight: 1.45 }}>
        Attendance, homework, and quiz entries are stamped with your name. Not a security login — just an audit trail.
      </p>

      {list.length === 0 ? (
        <div style={{ ...roomConflictStyle, background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" }}>
          Add teachers first (👤 By Teacher → Manage teachers), then pick yourself here.
        </div>
      ) : (
        <>
          <Field label="Teacher">
            <select style={selStyle} value={name} onChange={(e) => { setName(e.target.value); setPin(""); setError(""); }}>
              {list.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label={hasPin ? "PIN (required)" : "Set a PIN (optional)"}>
            <input
              style={inputStyle}
              type="password"
              inputMode="numeric"
              value={pin}
              placeholder={hasPin ? "Enter your PIN" : "Leave blank for no PIN"}
              onChange={(e) => { setPin(e.target.value); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
          </Field>
          {error && <div style={{ ...roomConflictStyle, marginBottom: 12 }}>{error}</div>}
        </>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 8 }}>
        {current ? <button style={{ ...btnSecondary, color: "#b91c1c" }} onClick={onSignOut}>Sign out</button> : <span />}
        <div style={{ display: "flex", gap: 10 }}>
          <button style={btnSecondary} onClick={onClose}>Cancel</button>
          {list.length > 0 && <button style={btnPrimary} onClick={submit}>Continue as {name}</button>}
        </div>
      </div>
    </Overlay>
  );
}
