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

export const studentKey = (name?: string) => (name || "").trim().toLowerCase();

export const normalizeStudentList = (raw: unknown): string[] => {
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split("\n") : [];
  const seen = new Map<string, string>();
  arr.forEach((s) => {
    const t = String(s ?? "").trim();
    const key = studentKey(t);
    if (key && !seen.has(key)) seen.set(key, t);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
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
  (cand.rooms || []).forEach((rid) => {
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

const formatDayRun = (r: string[]) => {
  if (r.length === 1) return DAY_SHORT[r[0]];
  if (r.length === 2) return `${DAY_SHORT[r[0]]} & ${DAY_SHORT[r[1]]}`;
  if (r.length === 5 && r[0] === "mon" && r[4] === "fri") return "Mon to Fri";
  return `${DAY_SHORT[r[0]]} to ${DAY_SHORT[r[r.length - 1]]}`;
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
  if (runs.length > 1 && runs.every((r) => r.length === 1)) {
    return runs.map((r) => formatDayRun(r)).join(" & ");
  }
  return runs.map((r) => formatDayRun(r)).join(", ");
};

const groupClassPlacements = (pls: { day: string; start: number; end: number; rooms: string[] }[]) => {
  const groups = new Map<string, { start: number; end: number; days: string[]; rooms: string[] }>();
  pls.forEach((p) => {
    const key = `${p.start}|${p.end}|${[...p.rooms].sort().join("+")}`;
    if (!groups.has(key)) groups.set(key, { start: p.start, end: p.end, days: [], rooms: p.rooms });
    groups.get(key)!.days.push(p.day);
  });
  return [...groups.values()].sort(
    (a, b) =>
      a.start - b.start ||
      dayIdx([...a.days].sort((x, y) => dayIdx(x) - dayIdx(y))[0]) -
        dayIdx([...b.days].sort((x, y) => dayIdx(x) - dayIdx(y))[0]),
  );
};

export const classScheduleGroups = (
  placements: { classId: string; day: string; start: number; end: number; rooms: string[] }[],
  classId: string,
) => {
  const pls = placements.filter((p) => p.classId === classId);
  return groupClassPlacements(pls).map((g) => ({
    start: g.start,
    end: g.end,
    rooms: g.rooms,
    dayLabel: formatDayRange(g.days),
    timeLabel: fmtTimeRangeAmPm(g.start, g.end),
  }));
};

export const classScheduleLines = (placements: { classId: string; day: string; start: number; end: number; rooms: string[] }[], classId: string) => {
  const pls = placements.filter((p) => p.classId === classId);
  if (!pls.length) return [];
  return groupClassPlacements(pls).map((g) => `${formatDayRange(g.days)} ${fmtTimeRangeAmPm(g.start, g.end)}`);
};

/** Group key for catalog sort — "5/6th ELA" and "5/6th Math" share bucket "5/6th". */
export const catalogSortBucket = (name: string) => {
  const t = name.trim();
  const num = t.match(/^(\d[\d/]*(?:th)?)/i);
  if (num) return num[1].toLowerCase();
  return (t[0] || "").toLowerCase();
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
  const byTimeThenName = (sa: number | null, sb: number | null, aName: string, bName: string) => {
    if (sa == null && sb == null) return aName.localeCompare(bName);
    if (sa == null) return 1;
    if (sb == null) return -1;
    return sa - sb || aName.localeCompare(bName);
  };
  return catalog.slice().sort((a, b) => {
    const sa = earliestStart(a.id);
    const sb = earliestStart(b.id);
    if ((sa == null) !== (sb == null)) return sa == null ? -1 : 1;
    const ba = catalogSortBucket(a.name);
    const bb = catalogSortBucket(b.name);
    if (ba !== bb) return ba.localeCompare(bb, undefined, { numeric: true });
    // Same bucket (letter or numeric prefix) — earliest meeting, then full name.
    return byTimeThenName(sa, sb, a.name, b.name);
  });
}

// ── Room colors (Week Overview legend + By Class / By Teacher pills) ──
export const ROOM_OVERVIEW_PALETTE = [
  { bg: "#dbeafe", border: "#93c5fd", text: "#1e40af" },
  { bg: "#ccfbf1", border: "#5eead4", text: "#0f766e" },
  { bg: "#fce7f3", border: "#f9a8d4", text: "#9d174d" },
  { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" },
  { bg: "#e0e7ff", border: "#a5b4fc", text: "#3730a3" },
  { bg: "#ffedd5", border: "#fdba74", text: "#9a3412" },
  { bg: "#ecfccb", border: "#bef264", text: "#365314" },
  { bg: "#f3e8ff", border: "#d8b4fe", text: "#6b21a8" },
  { bg: "#fee2e2", border: "#fca5a5", text: "#991b1b" },
  { bg: "#e0f2fe", border: "#7dd3fc", text: "#0c4a6e" },
];

export function roomOverviewColor(roomId: string, roomOrder: string[]) {
  const pos = roomOrder.indexOf(roomId);
  const i = pos >= 0 ? pos : 0;
  return ROOM_OVERVIEW_PALETTE[i % ROOM_OVERVIEW_PALETTE.length];
}

export function primaryRoomForPlacement(rooms: string[], roomOrder: string[]) {
  const rank = (id: string) => {
    const p = roomOrder.indexOf(id);
    return p < 0 ? 999 : p;
  };
  return [...rooms].sort((a, b) => rank(a) - rank(b))[0] || rooms[0] || "";
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
  rooms,
  roomOrder,
}: {
  roomClash?: boolean;
  teacherClash?: boolean;
  clash?: boolean;
  start: number;
  clickable?: boolean;
  rooms?: string[];
  roomOrder?: string[];
}) => {
  const hasRoom = !!roomClash;
  const hasTeacher = !!teacherClash || (!!clash && !hasRoom);
  let bg: string;
  let border: string;
  let color: string;
  let borderWidth = "1px";
  if (hasRoom) {
    bg = overviewPillTokens.room.bg;
    border = "#dc2626";
    color = overviewPillTokens.room.color;
    borderWidth = "2px";
  } else if (hasTeacher) {
    bg = overviewPillTokens.teacher.bg;
    border = "#d97706";
    color = overviewPillTokens.teacher.color;
    borderWidth = "2px";
  } else if (rooms?.length && roomOrder?.length) {
    const primaryRoom = primaryRoomForPlacement(rooms, roomOrder);
    const rc = roomOverviewColor(primaryRoom, roomOrder);
    bg = rc.bg;
    border = rc.border;
    color = rc.text;
  } else {
    bg = overviewPillBg(start);
    border = overviewPillTokens.normal.border;
    color = overviewPillTokens.normal.color;
  }
  return {
    display: "inline-flex" as const,
    flexDirection: "column" as const,
    gap: 2,
    maxWidth: "100%",
    padding: "4px 7px",
    borderRadius: 6,
    border: `${borderWidth} solid ${border}`,
    background: bg,
    color,
    lineHeight: 1.25,
    overflow: "hidden" as const,
    minHeight: 42,
    cursor: clickable ? "pointer" : undefined,
  };
};

export const overviewRoomLabel = (rooms: string[]) =>
  `Rm ${[...rooms].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })).join("+")}`;

// ── Week overview calendar (time × days, room-colored blocks) ──
export const WEEK_OVERVIEW_PX_PER_MIN = 1.0;

export function computeWeekOverviewLayout(
  days: string[],
  hours: { default: [number, number]; [k: string]: [number, number] | undefined },
  placementsByDay: Map<string, { id: string; start: number; end: number }[]>,
  pxPerMin = WEEK_OVERVIEW_PX_PER_MIN,
) {
  let winStart = hours.default[0];
  let winEnd = hours.default[1];
  days.forEach((d) => {
    const h = hours[d];
    if (h) {
      winStart = Math.min(winStart, h[0]);
      winEnd = Math.max(winEnd, h[1]);
    }
  });
  const allPls = days.flatMap((d) => placementsByDay.get(d) || []);
  const starts = allPls.map((p) => p.start);
  const ends = allPls.map((p) => p.end);
  const gridStart = Math.floor(Math.min(winStart, ...(starts.length ? starts : [winStart])) / 60) * 60;
  const gridEnd = Math.ceil(Math.max(winEnd, ...(ends.length ? ends : [winEnd])) / 60) * 60;
  const gridH = (gridEnd - gridStart) * pxPerMin;
  const hourMarks: number[] = [];
  for (let t = gridStart; t <= gridEnd; t += 60) hourMarks.push(t);
  const halfMarks: number[] = [];
  for (let t = gridStart + 30; t < gridEnd; t += 60) halfMarks.push(t);
  const lanesByDay = new Map<string, ReturnType<typeof layoutLanes>>();
  days.forEach((d) => {
    lanesByDay.set(d, layoutLanes(placementsByDay.get(d) || []));
  });
  return { gridStart, gridEnd, gridH, hourMarks, halfMarks, lanesByDay, pxPerMin };
}