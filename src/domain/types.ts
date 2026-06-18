/** Schedule domain types (v2 day-calendar model). */

export type DayId = string;

export type ClassRecord = {
  id: string;
  name: string;
  teacher: string;
  reg: number;
  note: string;
  students?: string[];
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

/** Program calendar — turns weekday placements into concrete dated sessions. */
export type Term = { start: string; end: string; skipDates: string[] };

/** One lesson record per class per date (content + the homework assigned that day). */
export type SessionLog = {
  classId: string;
  date: string; // "YYYY-MM-DD"
  content: string;
  homework: string;
  note: string;
};

export type AttendanceStatus = "present" | "absent" | "tardy" | "excused" | "";
export type HomeworkStatus = "complete" | "incomplete" | "late" | "missing" | "";

/** Per student, per class, per date — attendance + that day's homework completion. */
export type AttendanceRecord = {
  classId: string;
  date: string; // "YYYY-MM-DD"
  student: string;
  status: AttendanceStatus;
  homework: HomeworkStatus;
  note: string;
  by: string; // teacher who recorded it (audit)
  at: string; // ISO timestamp
};

/** A scored assessment (the Mon–Fri "Friday quiz", but any date works). */
export type Quiz = {
  id: string;
  classId: string;
  date: string; // "YYYY-MM-DD"
  title: string;
  maxScore: number;
  kind: string; // "quiz" | "test" | …
};

export type QuizScore = {
  quizId: string;
  student: string;
  score: number;
  note: string;
  by: string;
  at: string;
};

/** Term-level teacher comment shown on a student's report card. */
export type ReportComment = {
  classId: string;
  student: string;
  comment: string;
  by: string;
  at: string;
};

export type ScheduleData = {
  version?: number;
  days: DayId[];
  hours: Record<string, [number, number]>;
  rooms: RoomRecord[];
  catalog: ClassRecord[];
  placements: Placement[];
  teachers?: string[];
  students?: string[];
  programLabel?: string;
  nextId?: number;
  // ── Course management layer (carried through normalizeV2) ──
  term?: Term | null;
  sessionLogs?: SessionLog[];
  attendance?: AttendanceRecord[];
  quizzes?: Quiz[];
  quizScores?: QuizScore[];
  reportComments?: ReportComment[];
  staffPins?: Record<string, string>;
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