// Pure schedule logic — indexes, conflicts, overview helpers.

const ALL_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_SHORT: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};
const dayIdx = (d: string) => ALL_DAYS.indexOf(d);

const fmtTime = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`;
};
const fmtRange = (s: number, e: number) => `${fmtTime(s)}–${fmtTime(e)}`;
const fmtAmPm = (min: number) => `${fmtTime(min)} ${min < 720 ? "AM" : "PM"}`;

export const teacherKey = (teacher?: string) => {
  const key = (teacher || "").trim().toLowerCase();
  return key === "tbd" || key === "n/a" || key === "na" ? "" : key;
};

export const overlaps = (a: { day: string; start: number; end: number }, b: { day: string; start: number; end: number }) =>
  a.day === b.day && a.start < b.end && b.start < a.end;

export function buildScheduleIndexes(data: { catalog?: { id: string; teacher?: string }[]; placements?: { id: string; classId: string; day: string; rooms: string[] }[]; rooms?: { id: string; cap: number }[] }) {
  const catalogById = new Map<string, { id: string; name?: string; teacher?: string; reg?: number; note?: string }>();
  (data.catalog || []).forEach((k) => catalogById.set(k.id, k));

  const placementsByClassId = new Map<string, typeof data.placements>();
  const placementsByDay = new Map<string, NonNullable<typeof data.placements>>();
  const placementsByDayRoom = new Map<string, NonNullable<typeof data.placements>>();
  const placementsByDayTeacher = new Map<string, NonNullable<typeof data.placements>>();

  (data.placements || []).forEach((p) => {
    if (!placementsByClassId.has(p.classId)) placementsByClassId.set(p.classId, []);
    placementsByClassId.get(p.classId)!.push(p);
    if (!placementsByDay.has(p.day)) placementsByDay.set(p.day, []);
    placementsByDay.get(p.day)!.push(p);
    p.rooms.forEach((rid) => {
      const key = `${p.day}\0${rid}`;
      if (!placementsByDayRoom.has(key)) placementsByDayRoom.set(key, []);
      placementsByDayRoom.get(key)!.push(p);
    });
    const tk = teacherKey(catalogById.get(p.classId)?.teacher);
    if (tk) {
      const tkey = `${p.day}\0${tk}`;
      if (!placementsByDayTeacher.has(tkey)) placementsByDayTeacher.set(tkey, []);
      placementsByDayTeacher.get(tkey)!.push(p);
    }
  });

  const roomCapById = new Map((data.rooms || []).map((r) => [r.id, r.cap]));
  const roomPos = new Map((data.rooms || []).map((r, i) => [r.id, i]));
  const scheduledClassIds = new Set((data.placements || []).map((p) => p.classId));
  return { catalogById, placementsByClassId, placementsByDay, placementsByDayRoom, placementsByDayTeacher, roomCapById, roomPos, scheduledClassIds };
}

export function maxEndForPlacement(idx: ReturnType<typeof buildScheduleIndexes>, placement: { day: string; start: number; end: number; rooms: string[]; id: string }, gridEnd: number) {
  const { day, start, end, rooms, id } = placement;
  let limit = gridEnd;
  rooms.forEach((rid) => {
    (idx.placementsByDayRoom.get(`${day}\0${rid}`) || []).forEach((o) => {
      if (o.id === id) return;
      if (start < o.end && o.start < limit) {
        if (o.start >= start) limit = Math.min(limit, o.start);
        if (o.start < start && o.end > end) limit = Math.min(limit, end);
      }
    });
  });
  return limit;
}

export function roomConflictsIndexed(
  idx: ReturnType<typeof buildScheduleIndexes>,
  cand: { day: string; start: number; end: number; rooms: string[] },
  opts: { excludeId?: string; excludeClassId?: string } = {}
) {
  const seen = new Set<string>();
  const hits: NonNullable<ReturnType<typeof buildScheduleIndexes>["placementsByDay"]> extends Map<string, infer T> ? T : never = [];
  cand.rooms.forEach((rid) => {
    (idx.placementsByDayRoom.get(`${cand.day}\0${rid}`) || []).forEach((p) => {
      if (seen.has(p.id)) return;
      if (p.id === opts.excludeId) return;
      if (opts.excludeClassId != null && p.classId === opts.excludeClassId) return;
      if (overlaps(p, cand)) {
        seen.add(p.id);
        hits.push(p);
      }
    });
  });
  return hits;
}

export function teacherBusyIndexed(
  idx: ReturnType<typeof buildScheduleIndexes>,
  cand: { day: string; start: number; end: number },
  teacher: string | undefined,
  opts: { excludePlacementId?: string; excludeClassId?: string } = {}
) {
  const key = teacherKey(teacher);
  if (!key) return [];
  return (idx.placementsByDayTeacher.get(`${cand.day}\0${key}`) || [])
    .filter((p) => p.id !== opts.excludePlacementId && p.classId !== opts.excludeClassId && overlaps(p, cand))
    .map((p) => ({ placement: p, cls: idx.catalogById.get(p.classId) }));
}

export function evaluatePlacement(
  idx: ReturnType<typeof buildScheduleIndexes>,
  cand: { day: string; start: number; end: number; rooms: string[] },
  opts: { excludePlacementId?: string; excludeClassId?: string; teacher?: string; classId?: string } = {}
) {
  const ex = { excludeId: opts.excludePlacementId, excludeClassId: opts.excludeClassId };
  const roomClashes = roomConflictsIndexed(idx, cand, ex);
  const teacher =
    opts.teacher != null
      ? opts.teacher
      : opts.classId
        ? idx.catalogById.get(opts.classId)?.teacher
        : undefined;
  const teacherItems = teacher
    ? teacherBusyIndexed(idx, cand, teacher, {
        excludePlacementId: opts.excludePlacementId,
        excludeClassId: opts.excludeClassId,
      })
    : [];
  const roomConflictNames = [...new Set(roomClashes.map((p) => idx.catalogById.get(p.classId)?.name || "another class"))];
  const teacherLabels = [...new Set(teacherItems.map(({ placement, cls }) =>
    `${cls?.name || "Class"} (${DAY_SHORT[placement.day]} ${fmtRange(placement.start, placement.end)} · Rm ${placement.rooms.join("+")})`
  ))];
  return {
    ok: roomClashes.length === 0,
    roomClashes,
    teacherBusy: teacherItems,
    roomConflictNames,
    teacherLabels,
    hasTeacherConflict: teacherItems.length > 0,
  };
}

export function freeRoomsAt(
  idx: ReturnType<typeof buildScheduleIndexes>,
  cand: { day: string; start: number; end: number },
  roomIds: string[],
  opts: { excludePlacementId?: string; excludeClassId?: string } = {}
) {
  return roomIds.filter((rid) => {
    const probe = { day: cand.day, start: cand.start, end: cand.end, rooms: [rid] };
    return roomConflictsIndexed(idx, probe, {
      excludeId: opts.excludePlacementId,
      excludeClassId: opts.excludeClassId,
    }).length === 0;
  });
}

export function buildConflictReport(idx: ReturnType<typeof buildScheduleIndexes>, data: { placements?: { id: string; classId: string; day: string; start: number; end: number; rooms: string[] }[] }) {
  const items: { type: string; placementId: string; otherPlacementId: string; day: string; classId: string; className: string; start: number; end: number; label: string }[] = [];
  const seen = new Set<string>();
  (data.placements || []).forEach((p) => {
    const cls = idx.catalogById.get(p.classId);
    const cand = { day: p.day, start: p.start, end: p.end, rooms: p.rooms };
    const ev = evaluatePlacement(idx, cand, { excludePlacementId: p.id, teacher: cls?.teacher });
    ev.roomClashes.forEach((other) => {
      const pairKey = [p.id, other.id].sort().join("|") + ":room";
      if (seen.has(pairKey)) return;
      seen.add(pairKey);
      const otherCls = idx.catalogById.get(other.classId);
      const sharedRooms = [...new Set([...p.rooms, ...other.rooms])].sort().join("+");
      items.push({
        type: "room",
        placementId: p.id,
        otherPlacementId: other.id,
        day: p.day,
        classId: p.classId,
        className: cls?.name || "Class",
        start: p.start,
        end: p.end,
        label: `${cls?.name || "Class"} ↔ ${otherCls?.name || "Class"} · ${DAY_SHORT[p.day]} ${fmtRange(p.start, p.end)} · Rm ${sharedRooms}`,
      });
    });
    ev.teacherBusy.forEach(({ placement: other, cls: otherCls }) => {
      const pairKey = [p.id, other.id].sort().join("|") + ":teacher";
      if (seen.has(pairKey)) return;
      seen.add(pairKey);
      items.push({
        type: "teacher",
        placementId: p.id,
        otherPlacementId: other.id,
        day: p.day,
        classId: p.classId,
        className: cls?.name || "Class",
        start: p.start,
        end: p.end,
        label: `${cls?.teacher || "Teacher"} · ${cls?.name || "Class"} ↔ ${otherCls?.name || "Class"} · ${DAY_SHORT[p.day]} ${fmtRange(p.start, p.end)}`,
      });
    });
  });
  return items.sort((a, b) => dayIdx(a.day) - dayIdx(b.day) || a.start - b.start || a.type.localeCompare(b.type));
}

export function computeTabBlockMeta(idx: ReturnType<typeof buildScheduleIndexes>, day: string) {
  const meta = new Map<string, { roomClashes: ReturnType<typeof roomConflictsIndexed>; teacherLabels: string[]; otherDays: string[] }>();
  const dayPls = idx.placementsByDay.get(day) || [];
  dayPls.forEach((p) => {
    const cls = idx.catalogById.get(p.classId);
    const cand = { day: p.day, start: p.start, end: p.end, rooms: p.rooms };
    const ev = evaluatePlacement(idx, cand, { excludePlacementId: p.id, teacher: cls?.teacher });
    const otherDays = [...new Set((idx.placementsByClassId.get(p.classId) || []).filter((x) => x.id !== p.id).map((x) => DAY_SHORT[x.day]))];
    meta.set(p.id, {
      roomClashes: ev.roomClashes,
      teacherLabels: ev.teacherLabels,
      otherDays,
    });
  });
  return meta;
}

export const dataSignature = (d: unknown) => JSON.stringify(d);

export function layoutLanes(list: { id: string; start: number; end: number }[]) {
  const sorted = [...list].sort((a, b) => a.start - b.start || a.end - b.end);
  const res = new Map<string, { lane: number; lanes: number }>();
  let cluster: { p: typeof list[0]; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = 0;
  const flush = () => {
    cluster.forEach((it) => res.set(it.p.id, { lane: it.lane, lanes: laneEnds.length }));
    cluster = [];
    laneEnds = [];
  };
  sorted.forEach((p) => {
    if (cluster.length && p.start >= clusterEnd) flush();
    clusterEnd = cluster.length ? Math.max(clusterEnd, p.end) : p.end;
    let lane = laneEnds.findIndex((e) => e <= p.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(p.end);
    } else {
      laneEnds[lane] = p.end;
    }
    cluster.push({ p, lane });
  });
  flush();
  return res;
}

const fmtTimeRangeAmPm = (start: number, end: number) => {
  const startAm = start < 720;
  const endAm = end <= 720 ? end < 720 : false;
  if (startAm === endAm) return `${fmtTime(start)}–${fmtTime(end)} ${startAm ? "AM" : "PM"}`;
  return `${fmtAmPm(start)}–${fmtAmPm(end)}`;
};

export const formatDayRange = (dayList: string[]) => {
  const sorted = [...new Set(dayList)].sort((a, b) => dayIdx(a) - dayIdx(b));
  if (!sorted.length) return "";
  const runs: string[][] = [];
  let run = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (dayIdx(sorted[i]) === dayIdx(sorted[i - 1]) + 1) run.push(sorted[i]);
    else { runs.push(run); run = [sorted[i]]; }
  }
  runs.push(run);
  return runs.map((r) => {
    if (r.length === 1) return DAY_SHORT[r[0]];
    if (r.length === 5 && r[0] === "mon" && r[4] === "fri") return "Mon to Fri";
    return `${DAY_SHORT[r[0]]} to ${DAY_SHORT[r[r.length - 1]]}`;
  }).join(", ");
};

export const classScheduleLines = (placements: { classId: string; day: string; start: number; end: number; rooms: string[] }[], classId: string) => {
  const pls = placements.filter((p) => p.classId === classId);
  if (!pls.length) return [];
  const groups = new Map<string, { start: number; end: number; days: string[] }>();
  pls.forEach((p) => {
    const key = `${p.start}|${p.end}|${[...p.rooms].sort().join("+")}`;
    if (!groups.has(key)) groups.set(key, { start: p.start, end: p.end, days: [] });
    groups.get(key)!.days.push(p.day);
  });
  return [...groups.values()]
    .sort((a, b) => a.start - b.start || dayIdx([...a.days].sort((x, y) => dayIdx(x) - dayIdx(y))[0]) - dayIdx([...b.days].sort((x, y) => dayIdx(x) - dayIdx(y))[0]))
    .map((g) => `${formatDayRange(g.days)} ${fmtTimeRangeAmPm(g.start, g.end)}`);
};

export function sortCatalogForByClassView(catalog: { id: string; name: string }[], placements: { classId: string; start: number }[]) {
  const earliestStart = (classId: string) => {
    let best: number | null = null;
    placements.forEach((p) => {
      if (p.classId !== classId) return;
      if (best == null || p.start < best) best = p.start;
    });
    return best;
  };
  return catalog.slice().sort((a, b) => {
    const sa = earliestStart(a.id);
    const sb = earliestStart(b.id);
    if ((sa == null) !== (sb == null)) return sa == null ? -1 : 1;
    const letter = (name: string) => (name.trim()[0] || "").toLowerCase();
    const la = letter(a.name);
    const lb = letter(b.name);
    if (la !== lb) return la.localeCompare(lb);
    if (sa == null && sb == null) return a.name.localeCompare(b.name);
    if (sa == null) return 1;
    if (sb == null) return -1;
    return sa - sb || a.name.localeCompare(b.name);
  });
}

// ── Overview pill design tokens (UI-002) ──
export const overviewPillTokens = {
  room: { border: "#fecaca", bg: "#fee2e2", color: "#b91c1c" },
  teacher: { border: "#fde68a", bg: "#fffbeb", color: "#b45309" },
  normal: { border: "#d6dad4", color: "#334155" },
};

export const overviewPillBg = (startMin: number) => (startMin < 720 ? "#f0fdfa" : "#f8fafc");

export const overviewPillStyle = ({
  roomClash,
  teacherClash,
  clash,
  start,
  clickable,
}: {
  roomClash?: boolean;
  teacherClash?: boolean;
  clash?: boolean;
  start: number;
  clickable?: boolean;
}) => {
  const hasRoom = !!roomClash;
  const hasTeacher = !!teacherClash || (!!clash && !hasRoom);
  const tok = hasRoom ? overviewPillTokens.room : hasTeacher ? overviewPillTokens.teacher : overviewPillTokens.normal;
  return {
    display: "inline-flex" as const,
    flexDirection: "column" as const,
    gap: 2,
    maxWidth: "100%",
    padding: "4px 7px",
    borderRadius: 6,
    border: `1px solid ${tok.border}`,
    background: hasRoom || hasTeacher ? tok.bg : overviewPillBg(start),
    color: tok.color,
    lineHeight: 1.25,
    overflow: "hidden" as const,
    minHeight: 42,
    cursor: clickable ? "pointer" : undefined,
  };
};

export const overviewRoomLabel = (rooms: string[]) =>
  `Rm ${[...rooms].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })).join("+")}`;