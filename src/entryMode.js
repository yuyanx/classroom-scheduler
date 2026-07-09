/** True when URL requests volunteer entry mode (?entry, ?entry=1, or ?mode=entry). */
export function isEntryMode(search = "") {
  try {
    const p = new URLSearchParams(search);
    if (p.get("mode") === "entry") return true;
    if (!p.has("entry")) return false;
    const v = p.get("entry");
    return v === "" || v === "1" || v === "true" || v === "yes";
  } catch {
    return false;
  }
}
