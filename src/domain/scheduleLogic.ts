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

/** Signed-up count follows the class roster (deduped name lines). */
export const regFromRoster = (raw: unknown) => normalizeStudentList(raw).length;

/** Group classes vs private lessons in the catalog. */
export const COURSE_KIND = { CLASS: "class", PRIVATE: "private" } as const;
export const CALENDAR_SHOW = { BOTH: "both", CLASS: "class", PRIVATE: "private" } as const;

export const cleanCourseKind = (raw: unknown) =>
  raw === COURSE_KIND.PRIVATE ? COURSE_KIND.PRIVATE : COURSE_KIND.CLASS;

export const courseKindOf = (cls?: { courseKind?: string }) =>
  cleanCourseKind(cls?.courseKind);

export const matchesCalendarShow = (
  cls: { courseKind?: string } | null | undefined,
  show: string,
) => {
  if (show === CALENDAR_SHOW.BOTH) return true;
  if (!cls) return false;
  return courseKindOf(cls) === show;
};

export const overlaps = (a: { day: string; start: number; end: number }, b: { day: string; start: number; end: number }) =>
  a.day === b.day && a.start < b.end && b.start < a.end;

export function buildScheduleIndexes(data: { catalog?: { id: string; teacher?: string; students?: string[] }[]; placements?: { id: string; classId: string; day: string; rooms: string[] }[]; rooms?: { id: string; cap: number }[] }) {
  const catalogById = new Map<string, { id: string; name?: string; teacher?: string; reg?: number; note?: string; students?: string[] }>();
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

const sharedRosterStudents = (
  a: { students?: string[] } | undefined,
  b: { students?: string[] } | undefined,
) => {
  const keysA = new Set((a?.students || []).map(studentKey).filter(Boolean));
  return (b?.students || []).filter((s) => keysA.has(studentKey(s)));
};

export function buildStudentConflictClassIds(
  catalog: { id: string; students?: string[] }[],
  placements: { classId: string; day: string; start: number; end: number }[],
) {
  const classIdsByStudent = new Map<string, Set<string>>();
  catalog.forEach((k) => {
    (k.students || []).forEach((s) => {
      const key = studentKey(s);
      if (!key) return;
      if (!classIdsByStudent.has(key)) classIdsByStudent.set(key, new Set());
      classIdsByStudent.get(key)!.add(k.id);
    });
  });

  const conflictClassIdsByStudent = new Map<string, Set<string>>();
  const mark = (student: string, classId: string) => {
    const key = studentKey(student);
    if (!conflictClassIdsByStudent.has(key)) conflictClassIdsByStudent.set(key, new Set());
    conflictClassIdsByStudent.get(key)!.add(classId);
  };

  const plsByClass = new Map<string, typeof placements>();
  placements.forEach((p) => {
    if (!plsByClass.has(p.classId)) plsByClass.set(p.classId, []);
    plsByClass.get(p.classId)!.push(p);
  });

  classIdsByStudent.forEach((classIds) => {
    const ids = [...classIds];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const plsA = plsByClass.get(ids[i]) || [];
        const plsB = plsByClass.get(ids[j]) || [];
        for (const pa of plsA) {
          for (const pb of plsB) {
            if (!overlaps(pa, pb)) continue;
            const clsA = catalog.find((k) => k.id === ids[i]);
            const clsB = catalog.find((k) => k.id === ids[j]);
            sharedRosterStudents(clsA, clsB).forEach((s) => {
              mark(s, ids[i]);
              mark(s, ids[j]);
            });
          }
        }
      }
    }
  });

  return conflictClassIdsByStudent;
}

export function studentConflictLabelsAt(
  catalog: { id: string; name?: string; students?: string[] }[],
  placements: { classId: string; day: string; start: number; end: number }[],
  opts: {
    excludeClassId?: string;
    rosterStudents: string[];
    cand: { day: string; start: number; end: number };
  },
) {
  const rosterKeys = new Set(opts.rosterStudents.map(studentKey).filter(Boolean));
  if (!rosterKeys.size) return [];
  const labels: string[] = [];
  const seen = new Set<string>();
  catalog.forEach((k) => {
    if (k.id === opts.excludeClassId) return;
    const shared = (k.students || []).filter((s) => rosterKeys.has(studentKey(s)));
    if (!shared.length) return;
    placements
      .filter((p) => p.classId === k.id)
      .forEach((p) => {
        if (!overlaps(p, opts.cand)) return;
        const label = `${k.name || "Class"} (${DAY_SHORT[p.day]} ${fmtRange(p.start, p.end)})`;
        if (seen.has(label)) return;
        seen.add(label);
        labels.push(label);
      });
  });
  return labels;
}

const formatStudentConflictSlots = (slots: { day: string; start: number; end: number }[]) => {
  const byTime = new Map<string, string[]>();
  slots.forEach((s) => {
    const tk = `${s.start}|${s.end}`;
    if (!byTime.has(tk)) byTime.set(tk, []);
    byTime.get(tk)!.push(s.day);
  });
  return [...byTime.entries()]
    .sort((a, b) => {
      const da = [...a[1]].sort((x, y) => dayIdx(x) - dayIdx(y))[0];
      const db = [...b[1]].sort((x, y) => dayIdx(x) - dayIdx(y))[0];
      return dayIdx(da) - dayIdx(db) || Number(a[0].split("|")[0]) - Number(b[0].split("|")[0]);
    })
    .map(([tk, days]) => {
      const [start, end] = tk.split("|").map(Number);
      return `${formatDayRange(days)} ${fmtRange(start, end)}`;
    })
    .join(" · ");
};

export function buildConflictReport(idx: ReturnType<typeof buildScheduleIndexes>, data: { placements?: { id: string; classId: string; day: string; start: number; end: number; rooms: string[] }[] }) {
  const items: { type: string; placementId: string; otherPlacementId: string; day: string; classId: string; className: string; start: number; end: number; label: string }[] = [];
  const seen = new Set<string>();
  const studentGroupMap = new Map<
    string,
    {
      studentName: string;
      classIdA: string;
      classIdB: string;
      classNameA: string;
      classNameB: string;
      slots: { day: string; start: number; end: number; placementId: string; otherPlacementId: string; rooms: string[] }[];
    }
  >();
  const seenStudentPlacementPair = new Set<string>();
  const allPls = data.placements || [];
  allPls.forEach((p) => {
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
    allPls.forEach((other) => {
      if (other.id === p.id || other.classId === p.classId) return;
      if (!overlaps(p, other)) return;
      const placementPairKey = [p.id, other.id].sort().join("|");
      if (seenStudentPlacementPair.has(placementPairKey)) return;
      seenStudentPlacementPair.add(placementPairKey);
      const otherCls = idx.catalogById.get(other.classId);
      const shared = sharedRosterStudents(cls, otherCls);
      if (!shared.length) return;
      const [classIdA, classIdB] = [p.classId, other.classId].sort();
      const clsA = idx.catalogById.get(classIdA);
      const clsB = idx.catalogById.get(classIdB);
      const rooms = [...new Set([...p.rooms, ...other.rooms])].sort();
      shared.forEach((studentName) => {
        const groupKey = `${studentKey(studentName)}:${classIdA}|${classIdB}`;
        let group = studentGroupMap.get(groupKey);
        if (!group) {
          group = {
            studentName,
            classIdA,
            classIdB,
            classNameA: clsA?.name || "Class",
            classNameB: clsB?.name || "Class",
            slots: [],
          };
          studentGroupMap.set(groupKey, group);
        }
        const slotKey = `${p.day}|${p.start}|${p.end}`;
        if (!group.slots.some((s) => `${s.day}|${s.start}|${s.end}` === slotKey)) {
          group.slots.push({
            day: p.day,
            start: p.start,
            end: p.end,
            placementId: p.id,
            otherPlacementId: other.id,
            rooms,
          });
        }
      });
    });
  });
  studentGroupMap.forEach((group) => {
    const slots = group.slots.sort((a, b) => dayIdx(a.day) - dayIdx(b.day) || a.start - b.start);
    const first = slots[0];
    const scheduleLabel = formatStudentConflictSlots(slots);
    const allRooms = [...new Set(slots.flatMap((s) => s.rooms))].sort().join("+");
    items.push({
      type: "student",
      placementId: first.placementId,
      otherPlacementId: first.otherPlacementId,
      day: first.day,
      classId: group.classIdA,
      className: group.classNameA,
      start: first.start,
      end: first.end,
      label: `${group.studentName} · ${group.classNameA} ↔ ${group.classNameB} · ${scheduleLabel} · Rm ${allRooms}`,
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

export function sortCatalogForRosterView(catalog: { id: string; name: string }[], placements: { classId: string; start: number }[]) {
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
    if (sa == null && sb == null) return a.name.localeCompare(b.name);
    if (sa == null) return 1;
    if (sb == null) return -1;
    return sa - sb || a.name.localeCompare(b.name);
  });
}

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

/** Student double-booking — coral orange; not used by ROOM_OVERVIEW_PALETTE. */
export const STUDENT_CLASH_TOKENS = {
  bg: "#fed7aa",
  border: "#c2410c",
  glow: "0 0 0 3px rgba(194,65,12,.28)",
  text: "#7c2d12",
};

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

// ════════════════════════════════════════════════════════════════════════════
// Course management — dated sessions, attendance, homework, quizzes, reports
// ════════════════════════════════════════════════════════════════════════════

// getUTCDay(): 0 = Sun … 6 = Sat. Map to the app's day ids.
const DAY_ID_BY_DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const isISODate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

const utcOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const isoOfUtc = (ms: number) => {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
};

/** Day id ("mon"…"sun") for a "YYYY-MM-DD" string — TZ-safe via UTC. */
export function weekdayIdOf(dateISO: string): string {
  if (!isISODate(dateISO)) return "";
  return DAY_ID_BY_DOW[new Date(utcOf(dateISO)).getUTCDay()];
}

/** "January 5" style label for display (TZ-safe). */
export function formatDateLabel(dateISO: string): string {
  if (!isISODate(dateISO)) return "";
  const dt = new Date(utcOf(dateISO));
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][dt.getUTCMonth()];
  return `${DAY_SHORT[DAY_ID_BY_DOW[dt.getUTCDay()]]} ${month} ${dt.getUTCDate()}`;
}

/** Local "today" as "YYYY-MM-DD" (what the user perceives as today). */
export function todayISO(): string {
  const dt = new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Inclusive list of "YYYY-MM-DD" dates from start to end (capped at ~3 years). */
export function eachDateInRange(startISO: string, endISO: string): string[] {
  if (!isISODate(startISO) || !isISODate(endISO)) return [];
  let cur = utcOf(startISO);
  const end = utcOf(endISO);
  if (cur > end) return [];
  const out: string[] = [];
  let guard = 0;
  while (cur <= end && guard++ < 1100) {
    out.push(isoOfUtc(cur));
    cur += 86400000;
  }
  return out;
}

export type TermLike = { start?: string; end?: string; skipDates?: string[] } | null | undefined;
type SessionPlacement = { classId: string; day: string; start: number; end: number; rooms?: string[] };
export type ClassSession = { date: string; weekday: string; placements: SessionPlacement[] };

/**
 * Concrete dated sessions for a class: every date in the term whose weekday the
 * class meets (skip dates excluded). Derived, never stored.
 */
export function sessionsForClass(
  classId: string,
  placements: SessionPlacement[],
  term: TermLike,
): ClassSession[] {
  if (!term || !isISODate(term.start) || !isISODate(term.end)) return [];
  const skip = new Set((term.skipDates || []).filter(isISODate));
  const pls = (placements || []).filter((p) => p.classId === classId);
  if (!pls.length) return [];
  const byDay = new Map<string, SessionPlacement[]>();
  pls.forEach((p) => {
    if (!byDay.has(p.day)) byDay.set(p.day, []);
    byDay.get(p.day)!.push(p);
  });
  const out: ClassSession[] = [];
  for (const date of eachDateInRange(term.start, term.end)) {
    if (skip.has(date)) continue;
    const wd = weekdayIdOf(date);
    const dayPls = byDay.get(wd);
    if (dayPls && dayPls.length) {
      out.push({ date, weekday: wd, placements: dayPls.slice().sort((a, b) => a.start - b.start) });
    }
  }
  return out;
}

/** Friday session dates for a class — used to pre-fill the weekly quiz. */
export function suggestQuizDates(classId: string, placements: SessionPlacement[], term: TermLike): string[] {
  return sessionsForClass(classId, placements, term)
    .filter((s) => s.weekday === "fri")
    .map((s) => s.date);
}

type AttRec = { classId: string; date: string; student: string; status?: string; homework?: string };

/** present/absent/tardy/excused counts; rate = (present+tardy)/recorded. */
export function attendanceSummary(attendance: AttRec[] | undefined, classId: string, student: string) {
  const key = studentKey(student);
  const c = { present: 0, absent: 0, tardy: 0, excused: 0 };
  (attendance || []).forEach((r) => {
    if (r.classId !== classId || studentKey(r.student) !== key) return;
    if (r.status && (c as Record<string, number>)[r.status] != null) (c as Record<string, number>)[r.status]++;
  });
  const total = c.present + c.absent + c.tardy + c.excused;
  const attended = c.present + c.tardy;
  return { ...c, total, rate: total ? attended / total : null };
}

/** complete/incomplete/late/missing counts; rate = (complete+late)/recorded. */
export function homeworkCompletionRate(attendance: AttRec[] | undefined, classId: string, student: string) {
  const key = studentKey(student);
  const c = { complete: 0, incomplete: 0, late: 0, missing: 0 };
  (attendance || []).forEach((r) => {
    if (r.classId !== classId || studentKey(r.student) !== key) return;
    if (r.homework && (c as Record<string, number>)[r.homework] != null) (c as Record<string, number>)[r.homework]++;
  });
  const total = c.complete + c.incomplete + c.late + c.missing;
  const done = c.complete + c.late;
  return { ...c, total, rate: total ? done / total : null };
}

type QuizLike = { id: string; classId: string; date?: string; title?: string; maxScore?: number };
type QuizScoreLike = { quizId: string; student: string; score: number | string; note?: string; by?: string; at?: string };

/** Per-quiz detail + average percent/raw for one student in one class.
 *  `detail` lists every class quiz (score is null when unrecorded) so Report Cards
 *  can show empty cells for inline entry. Averages/`count` use scored quizzes only. */
export function quizAverage(
  quizzes: QuizLike[] | undefined,
  quizScores: QuizScoreLike[] | undefined,
  classId: string,
  student: string,
) {
  const key = studentKey(student);
  const scoreByQuiz = new Map<string, number>();
  (quizScores || []).forEach((s) => {
    if (studentKey(s.student) !== key) return;
    const score = Number(s.score);
    if (!Number.isFinite(score)) return;
    scoreByQuiz.set(s.quizId, score);
  });
  const detail: { quizId: string; title: string; date: string; score: number | null; maxScore: number | null; pct: number | null }[] = [];
  (quizzes || []).forEach((q) => {
    if (q.classId !== classId) return;
    const max = Number(q.maxScore) > 0 ? Number(q.maxScore) : null;
    const has = scoreByQuiz.has(q.id);
    const score = has ? scoreByQuiz.get(q.id)! : null;
    detail.push({
      quizId: q.id,
      title: q.title || "Quiz",
      date: q.date || "",
      score,
      maxScore: max,
      pct: has && max ? (score! / max) * 100 : null,
    });
  });
  detail.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const scored = detail.filter((d): d is typeof d & { score: number } => d.score != null);
  const pcts = scored.map((d) => d.pct).filter((p): p is number => p != null);
  const avgPct = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  const raw = scored.map((d) => d.score);
  const avgScore = raw.length ? raw.reduce((a, b) => a + b, 0) / raw.length : null;
  return { detail, avgPct, avgScore, count: scored.length };
}

/** Insert, replace, or clear one student's score for a quiz. Empty raw clears the row;
 *  non-numeric raw is a no-op. */
export function upsertQuizScore(
  quizScores: QuizScoreLike[] | undefined,
  quizId: string,
  student: string,
  raw: unknown,
  stamp?: { by?: string; at?: string; note?: string },
): QuizScoreLike[] {
  const list = quizScores || [];
  const k = `${quizId}|${studentKey(student)}`;
  const rest = list.filter((s) => `${s.quizId}|${studentKey(s.student)}` !== k);
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") return rest;
  const score = Number(trimmed);
  if (!Number.isFinite(score)) return list;
  return [...rest, { quizId, student, score, note: stamp?.note ?? "", by: stamp?.by ?? "", at: stamp?.at ?? "" }];
}

/**
 * Class-wide quiz averages for a roster.
 * - `avgPct`: mean of each roster student's personal quiz avg % (students with ≥1 scored quiz).
 * - `byQuiz`: per-quiz mean % across roster members who have a score for that quiz.
 */
export function classQuizAverages(
  quizzes: QuizLike[] | undefined,
  quizScores: QuizScoreLike[] | undefined,
  classId: string,
  roster: string[],
) {
  const classQuizzes = (quizzes || []).filter((q) => q.classId === classId);
  const scoreByKey = new Map<string, number>();
  (quizScores || []).forEach((s) => {
    const score = Number(s.score);
    if (!Number.isFinite(score)) return;
    scoreByKey.set(`${s.quizId}|${studentKey(s.student)}`, score);
  });

  const byQuiz: { quizId: string; title: string; date: string; avgPct: number | null; n: number }[] = [];
  classQuizzes.forEach((q) => {
    const max = Number(q.maxScore) > 0 ? Number(q.maxScore) : null;
    if (!max) {
      byQuiz.push({ quizId: q.id, title: q.title || "Quiz", date: q.date || "", avgPct: null, n: 0 });
      return;
    }
    const pcts: number[] = [];
    (roster || []).forEach((s) => {
      const score = scoreByKey.get(`${q.id}|${studentKey(s)}`);
      if (score == null) return;
      pcts.push((score / max) * 100);
    });
    byQuiz.push({
      quizId: q.id,
      title: q.title || "Quiz",
      date: q.date || "",
      avgPct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
      n: pcts.length,
    });
  });
  byQuiz.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const studentAvgs: number[] = [];
  (roster || []).forEach((s) => {
    const avg = quizAverage(quizzes, quizScores, classId, s).avgPct;
    if (avg != null) studentAvgs.push(avg);
  });
  const avgPct = studentAvgs.length
    ? studentAvgs.reduce((a, b) => a + b, 0) / studentAvgs.length
    : null;

  return { avgPct, studentCount: studentAvgs.length, byQuiz };
}

type ReportData = {
  catalog?: { id: string; name: string; teacher?: string; students?: string[] }[];
  placements?: SessionPlacement[];
  attendance?: AttRec[];
  quizzes?: QuizLike[];
  quizScores?: QuizScoreLike[];
  reportComments?: { classId: string; student: string; comment: string }[];
  term?: TermLike;
};

/**
 * Classify SAT subject classes (Math vs ELA). PSAT is excluded.
 * Afternoon variants use a separate session track so full AM + full PM programs stay separate;
 * cross-session students (e.g. AM Math + PM ELA) are merged in buildSatTotals.
 */
export function satSubjectOf(className: string): { kind: "math" | "ela"; track: string; label: string } | null {
  const name = String(className || "").trim();
  if (!name || /\bpsat\b/i.test(name)) return null;
  if (!/\bsat\b/i.test(name)) return null;
  const afternoon = /\bafternoon\b/i.test(name);
  const track = afternoon ? "sat-afternoon" : "sat";
  const label = afternoon ? "SAT Afternoon" : "SAT";
  if (/\bmath\b/i.test(name)) return { kind: "math", track, label };
  if (/\b(ela|erw|rw|reading|writing|verbal)\b/i.test(name)) return { kind: "ela", track, label };
  return null;
}

const satPairKey = (date: string, title: string) =>
  `${String(date || "")}|${String(title || "Quiz").trim().toLowerCase()}`;

type SatQuizSide = {
  quizId: string;
  title: string;
  date: string;
  maxScore: number | null;
  score: number | null;
};

type SatPair = {
  key: string;
  title: string;
  date: string;
  math: SatQuizSide | null;
  ela: SatQuizSide | null;
  total: number | null;
  maxTotal: number | null;
};

type SatTrackResult = {
  track: string;
  label: string;
  mathClassId: string | null;
  elaClassId: string | null;
  mathClassName: string;
  elaClassName: string;
  pairs: SatPair[];
  avgMath: number | null;
  avgEla: number | null;
  avgTotal: number | null;
};

/** Prefer a quiz that has a score; otherwise keep the first. */
function pickBestSide(list: SatQuizSide[]): SatQuizSide | null {
  if (!list.length) return null;
  const withScore = list.find((q) => q.score != null);
  return withScore || list[0];
}

function pairMathEla(mathQ: SatQuizSide[], elaQ: SatQuizSide[]): SatPair[] {
  const mathByKey = new Map<string, SatQuizSide[]>();
  mathQ.forEach((q) => {
    const pk = satPairKey(q.date, q.title);
    if (!mathByKey.has(pk)) mathByKey.set(pk, []);
    mathByKey.get(pk)!.push(q);
  });
  const elaByKey = new Map<string, SatQuizSide[]>();
  elaQ.forEach((q) => {
    const pk = satPairKey(q.date, q.title);
    if (!elaByKey.has(pk)) elaByKey.set(pk, []);
    elaByKey.get(pk)!.push(q);
  });
  const allKeys = new Set([...mathByKey.keys(), ...elaByKey.keys()]);

  return [...allKeys]
    .map((pk) => {
      const math = pickBestSide(mathByKey.get(pk) || []);
      const ela = pickBestSide(elaByKey.get(pk) || []);
      const title = math?.title || ela?.title || "Quiz";
      const date = math?.date || ela?.date || "";
      const mScore = math?.score ?? null;
      const eScore = ela?.score ?? null;
      const total = mScore != null && eScore != null ? mScore + eScore : null;
      const maxTotal =
        math?.maxScore != null && ela?.maxScore != null
          ? math.maxScore + ela.maxScore
          : math?.maxScore != null
            ? math.maxScore
            : ela?.maxScore != null
              ? ela.maxScore
              : null;
      return { key: pk, title, date, math, ela, total, maxTotal };
    })
    .filter((p) => p.math || p.ela)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.title.localeCompare(b.title));
}

function summarizeSatTrack(
  track: string,
  label: string,
  mathSide: { classId: string; className: string } | null,
  elaSide: { classId: string; className: string } | null,
  pairs: SatPair[],
): SatTrackResult {
  const mathScores = pairs.map((p) => p.math?.score).filter((n): n is number => n != null);
  const elaScores = pairs.map((p) => p.ela?.score).filter((n): n is number => n != null);
  const totals = pairs.map((p) => p.total).filter((n): n is number => n != null);
  return {
    track,
    label,
    mathClassId: mathSide?.classId || null,
    elaClassId: elaSide?.classId || null,
    mathClassName: mathSide?.className || "SAT Math",
    elaClassName: elaSide?.className || "SAT ELA",
    pairs,
    avgMath: mathScores.length ? mathScores.reduce((a, b) => a + b, 0) / mathScores.length : null,
    avgEla: elaScores.length ? elaScores.reduce((a, b) => a + b, 0) / elaScores.length : null,
    avgTotal: totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null,
  };
}

/**
 * Pair SAT Math + SAT ELA quizzes (same practice date+title) into a combined total
 * (section scores typically /800 → total /1600).
 *
 * - Full same-session programs (AM Math+ELA, PM Math+ELA) stay as separate tables.
 * - Cross-session students (e.g. morning SAT Math + afternoon SAT ELA) merge into one table.
 * - No class-average totals are computed (student scores only).
 */
export function buildSatTotals(student: string, data: ReportData): SatTrackResult[] {
  const catalog = data.catalog || [];
  const quizzes = data.quizzes || [];
  const quizScores = data.quizScores || [];
  const key = studentKey(student);

  type Side = { classId: string; className: string; teacher: string; roster: string[] };
  const tracks = new Map<string, { label: string; math?: Side; ela?: Side }>();

  catalog.forEach((k) => {
    const sub = satSubjectOf(k.name);
    if (!sub) return;
    const t = tracks.get(sub.track) || { label: sub.label };
    const side: Side = {
      classId: k.id,
      className: k.name,
      teacher: k.teacher || "",
      roster: k.students || [],
    };
    if (sub.kind === "math") t.math = side;
    else t.ela = side;
    tracks.set(sub.track, t);
  });

  const scoreAt = (quizId: string, who: string) => {
    const sk = studentKey(who);
    for (const s of quizScores) {
      if (s.quizId !== quizId || studentKey(s.student) !== sk) continue;
      const n = Number(s.score);
      if (Number.isFinite(n)) return n;
    }
    return null as number | null;
  };

  const sideQuizzes = (classId: string, who: string): SatQuizSide[] => {
    return quizzes
      .filter((q) => q.classId === classId)
      .map((q) => {
        const max = Number(q.maxScore) > 0 ? Number(q.maxScore) : null;
        return {
          quizId: q.id,
          title: q.title || "Quiz",
          date: q.date || "",
          maxScore: max,
          score: scoreAt(q.id, who),
        };
      })
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.title.localeCompare(b.title));
  };

  const studentTouches = (side: Side | undefined): boolean => {
    if (!side) return false;
    if ((side.roster || []).some((s) => studentKey(s) === key)) return true;
    return quizzes.some((q) => q.classId === side.classId && scoreAt(q.id, student) != null);
  };

  type PartialSide = { trackId: string; label: string; side: Side };
  const complete: { trackId: string; label: string; math: Side; ela: Side }[] = [];
  const mathOnly: PartialSide[] = [];
  const elaOnly: PartialSide[] = [];

  tracks.forEach((t, trackId) => {
    if (!t.math && !t.ela) return;
    const hasMath = studentTouches(t.math);
    const hasEla = studentTouches(t.ela);
    if (!hasMath && !hasEla) return;
    if (hasMath && hasEla && t.math && t.ela) {
      complete.push({ trackId, label: t.label, math: t.math, ela: t.ela });
    } else if (hasMath && t.math) {
      mathOnly.push({ trackId, label: t.label, side: t.math });
    } else if (hasEla && t.ela) {
      elaOnly.push({ trackId, label: t.label, side: t.ela });
    }
  });

  const results: SatTrackResult[] = [];

  // Same-session full programs → one table each.
  complete.forEach(({ trackId, label, math, ela }) => {
    const pairs = pairMathEla(sideQuizzes(math.classId, student), sideQuizzes(ela.classId, student));
    if (!pairs.length) return;
    results.push(summarizeSatTrack(trackId, label, math, ela, pairs));
  });

  // Cross-session leftovers (e.g. AM Math + PM ELA) → single merged table.
  if (mathOnly.length && elaOnly.length) {
    const mathQ = mathOnly.flatMap((m) => sideQuizzes(m.side.classId, student));
    const elaQ = elaOnly.flatMap((e) => sideQuizzes(e.side.classId, student));
    const pairs = pairMathEla(mathQ, elaQ);
    if (pairs.length) {
      const mathSide = mathOnly[0].side;
      const elaSide = elaOnly[0].side;
      // Label "SAT" when sessions differ; keep afternoon label only if both leftover sides are PM.
      const allAfternoon =
        mathOnly.every((m) => m.trackId === "sat-afternoon") &&
        elaOnly.every((e) => e.trackId === "sat-afternoon");
      const label = allAfternoon ? "SAT Afternoon" : "SAT";
      const trackId =
        mathOnly.length === 1 && elaOnly.length === 1
          ? `sat-cross:${mathOnly[0].trackId}+${elaOnly[0].trackId}`
          : "sat-cross";
      results.push(summarizeSatTrack(trackId, label, mathSide, elaSide, pairs));
    }
  } else if (mathOnly.length || elaOnly.length) {
    // Single-section leftovers with no partner to merge — still show section scores.
    mathOnly.forEach(({ trackId, label, side }) => {
      const pairs = pairMathEla(sideQuizzes(side.classId, student), []);
      if (!pairs.length) return;
      results.push(summarizeSatTrack(trackId, label, side, null, pairs));
    });
    elaOnly.forEach(({ trackId, label, side }) => {
      const pairs = pairMathEla([], sideQuizzes(side.classId, student));
      if (!pairs.length) return;
      results.push(summarizeSatTrack(trackId, label, null, side, pairs));
    });
  }

  results.sort((a, b) => a.label.localeCompare(b.label) || a.track.localeCompare(b.track));
  return results;
}

/** Aggregate everything for one student across all their classes — for the report card. */
export function buildReportCard(student: string, data: ReportData) {
  const key = studentKey(student);
  const catalog = data.catalog || [];
  const placements = data.placements || [];
  const commentByClass = new Map<string, string>();
  (data.reportComments || []).forEach((c) => {
    if (studentKey(c.student) === key) commentByClass.set(c.classId, c.comment);
  });
  const classes = catalog
    .filter((k) => (k.students || []).some((s) => studentKey(s) === key))
    .map((k) => ({
      classId: k.id,
      className: k.name,
      teacher: k.teacher || "",
      schedule: classScheduleLines(placements, k.id),
      attendance: attendanceSummary(data.attendance, k.id, student),
      homework: homeworkCompletionRate(data.attendance, k.id, student),
      quiz: quizAverage(data.quizzes, data.quizScores, k.id, student),
      comment: commentByClass.get(k.id) || "",
    }));
  return { student, term: data.term || null, classes };
}