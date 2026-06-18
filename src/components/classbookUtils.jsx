// Shared bits for the course-management views (Classbook / Grades / Report Cards).
import React from "react";

export const ATT_OPTS = [
  { v: "present", label: "Present", c: "#0d7a72" },
  { v: "absent", label: "Absent", c: "#dc2626" },
  { v: "tardy", label: "Tardy", c: "#d97706" },
  { v: "excused", label: "Excused", c: "#64748b" },
];
export const HW_OPTS = [
  { v: "complete", label: "Complete", c: "#0d7a72" },
  { v: "incomplete", label: "Incomplete", c: "#d97706" },
  { v: "late", label: "Late", c: "#2563eb" },
  { v: "missing", label: "Missing", c: "#dc2626" },
];
export const ATT_LABEL = Object.fromEntries(ATT_OPTS.map((o) => [o.v, o.label]));
export const HW_LABEL = Object.fromEntries(HW_OPTS.map((o) => [o.v, o.label]));
export const ATT_COLOR = Object.fromEntries(ATT_OPTS.map((o) => [o.v, o.c]));
export const HW_COLOR = Object.fromEntries(HW_OPTS.map((o) => [o.v, o.c]));

export const fmtPct = (rate) => (rate == null ? "—" : `${Math.round(rate * 100)}%`);
export const fmtPctNum = (pct) => (pct == null ? "—" : `${Math.round(pct)}%`);

/** Segmented status picker — click the active option again to clear it. */
export function StatusPicker({ value, options, onChange, disabled, big }) {
  return (
    <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
      {options.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            disabled={disabled}
            onClick={() => onChange(active ? "" : o.v)}
            style={{
              padding: big ? "8px 12px" : "4px 9px",
              borderRadius: 6,
              fontSize: big ? 14 : 12,
              fontWeight: 600,
              cursor: disabled ? "default" : "pointer",
              border: `1px solid ${active ? o.c : "#d6dad4"}`,
              background: active ? o.c : "#fff",
              color: active ? "#fff" : "#94a3b8",
              opacity: disabled && !active ? 0.5 : 1,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** True when the viewport is at/under maxWidth (for the mobile attendance layout). */
export function useIsNarrow(maxWidth = 720) {
  const [narrow, setNarrow] = React.useState(
    typeof window !== "undefined" ? window.innerWidth <= maxWidth : false,
  );
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [maxWidth]);
  return narrow;
}

/** Trigger a client-side CSV download from a 2-D array of rows. */
export function downloadCSV(filename, rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
