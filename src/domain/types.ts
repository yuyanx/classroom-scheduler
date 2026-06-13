/** Schedule domain types (v2 day-calendar model). */

export type DayId = string;

export type ClassRecord = {
  id: string;
  name: string;
  teacher: string;
  reg: number;
  note: string;
};

export type Placement = {
  id: string;
  classId: string;
  day: DayId;
  start: number;
  end: number;
  rooms: string[];
};

export type RoomRecord = {
  id: string;
  name?: string;
  cap: number;
};

export type ScheduleData = {
  version?: number;
  days: DayId[];
  hours: Record<string, [number, number]>;
  rooms: RoomRecord[];
  catalog: ClassRecord[];
  placements: Placement[];
  teachers?: string[];
  nextId?: number;
};

export type ConflictItem = {
  type: "room" | "teacher";
  placementId: string;
  otherPlacementId: string;
  day: DayId;
  classId: string;
  className: string;
  start: number;
  end: number;
  label: string;
};