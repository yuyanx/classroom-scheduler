// Shared UI primitives + style tokens — used by App.jsx and the course-management views.
// Inline-style only (no CSS files), matching the rest of the app.
import React from "react";
import { STUDENT_CLASH_TOKENS } from "../domain/scheduleLogic.ts";

// ───────────────────────── Style tokens ─────────────────────────
export const thStyle = {
  padding: "10px 8px", borderBottom: "2px solid #d6dad4", borderRight: "1px solid #eceeea",
  fontSize: 13, fontWeight: 600, color: "#475569", textAlign: "center", background: "#fafaf8",
};
export const tdStyle = {
  padding: 6, borderBottom: "1px solid #eceeea", borderRight: "1px solid #eceeea", verticalAlign: "top",
};
export const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 14,
  border: "1px solid #cbd5d1", borderRadius: 8, outline: "none",
};
export const selStyle = {
  boxSizing: "border-box", padding: "7px 8px", fontSize: 13, minWidth: 0,
  border: "1px solid #cbd5d1", borderRadius: 8, outline: "none", background: "#fff", color: "#1e293b",
};
export const chipStyle = {
  fontSize: 11, background: "#e6f4f3", color: "#0f766e", borderRadius: 4,
  padding: "1px 6px", whiteSpace: "nowrap", fontWeight: 600,
};
export const teacherWarningStyle = {
  fontSize: 11, background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a",
  borderRadius: 4, padding: "2px 6px", fontWeight: 700, lineHeight: 1.25,
};
export const studentWarningStyle = {
  fontSize: 11, background: STUDENT_CLASH_TOKENS.bg, color: STUDENT_CLASH_TOKENS.text,
  border: `2px dashed ${STUDENT_CLASH_TOKENS.border}`,
  borderRadius: 4, padding: "2px 6px", fontWeight: 700, lineHeight: 1.25,
};
export const roomConflictStyle = {
  fontSize: 11, background: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca",
  borderRadius: 4, padding: "2px 6px", fontWeight: 700, lineHeight: 1.25,
};
export const formNoticeErrorStyle = {
  background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10,
  padding: "12px 14px", marginBottom: 14, color: "#991b1b", fontSize: 13, lineHeight: 1.45,
};
export const formNoticeWarnStyle = {
  background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10,
  padding: "14px 16px", marginBottom: 14, color: "#92400e", fontSize: 13, lineHeight: 1.45,
};
export const btnGhost = {
  background: "transparent", border: "1px solid rgba(255,255,255,.35)", color: "inherit",
  borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer",
};
export const btnPrimary = {
  background: "#123c3a", color: "#fff", border: "none", borderRadius: 8,
  padding: "8px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer",
};
export const btnSecondary = {
  background: "#fff", color: "#334155", border: "1px solid #cbd5d1", borderRadius: 8,
  padding: "8px 14px", fontSize: 14, cursor: "pointer",
};
export const miniBtn = {
  background: "#fff", border: "1px solid #d6dad4", borderRadius: 6, width: 26, height: 26,
  fontSize: 12, cursor: "pointer", color: "#475569", lineHeight: 1,
};
export const stepBtn = {
  width: 20, height: 20, flex: "0 0 20px", borderRadius: 6, border: "1px solid #cbd5d1", background: "#fff",
  cursor: "pointer", fontSize: 13, lineHeight: 1, color: "#334155", padding: 0,
};
export const stepBtnCompact = {
  ...stepBtn,
  width: 16, height: 16, flex: "0 0 16px", borderRadius: 4, fontSize: 11,
};

// ───────────────────────── Shared components ─────────────────────────
export function FormNotice({ tone = "error", title, children }) {
  const box = tone === "warn" ? formNoticeWarnStyle : formNoticeErrorStyle;
  return (
    <div style={box}>
      {title && <div style={{ fontWeight: 700, marginBottom: children ? 4 : 0 }}>{title}</div>}
      {children}
    </div>
  );
}

export function InlineConfirm({ title, message, confirmLabel = "Continue", onCancel, onConfirm, danger }) {
  return (
    <div style={{ ...formNoticeWarnStyle, marginTop: 18, marginBottom: 0 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#123c3a", marginBottom: 6 }}>{title}</div>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "#475569", lineHeight: 1.45 }}>{message}</p>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button style={btnSecondary} onClick={onCancel}>Cancel</button>
        <button style={danger ? { ...btnPrimary, background: "#dc2626" } : btnPrimary} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  );
}

export function Overlay({ children, onClose, wide, bare }) {
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
          background: bare ? "transparent" : "#fff",
          borderRadius: 12,
          padding: bare ? 0 : "22px 24px",
          width: "100%",
          maxWidth: bare ? 400 : (wide ? 820 : 460),
          boxShadow: bare ? "none" : "0 20px 50px rgba(0,0,0,.25)",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, style }) {
  return (
    <label style={{ display: "block", marginBottom: 12, ...style }}>
      <span style={{ display: "block", fontSize: 13, color: "#475569", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}
