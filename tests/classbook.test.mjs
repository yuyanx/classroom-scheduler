import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isISODate,
  weekdayIdOf,
  formatDateLabel,
  eachDateInRange,
  sessionsForClass,
  suggestQuizDates,
  attendanceSummary,
  homeworkCompletionRate,
  quizAverage,
  buildReportCard,
  normalizeV2,
} from "../dist/test-logic.mjs";

// ── Date utilities (TZ-safe) ──
test("isISODate accepts YYYY-MM-DD only", () => {
  assert.equal(isISODate("2026-06-17"), true);
  assert.equal(isISODate("2026-6-7"), false);
  assert.equal(isISODate("June 17"), false);
  assert.equal(isISODate(null), false);
});

test("weekdayIdOf is timezone-safe", () => {
  // 2026-06-15 is a Monday, 2026-06-19 is a Friday, 2026-06-21 is a Sunday.
  assert.equal(weekdayIdOf("2026-06-15"), "mon");
  assert.equal(weekdayIdOf("2026-06-19"), "fri");
  assert.equal(weekdayIdOf("2026-06-21"), "sun");
  assert.equal(weekdayIdOf("2026-01-01"), "thu");
});

test("formatDateLabel renders a short label", () => {
  assert.equal(formatDateLabel("2026-06-19"), "Fri Jun 19");
});

test("eachDateInRange is inclusive and ordered", () => {
  const dates = eachDateInRange("2026-06-15", "2026-06-21");
  assert.equal(dates.length, 7);
  assert.equal(dates[0], "2026-06-15");
  assert.equal(dates[6], "2026-06-21");
});

test("eachDateInRange returns [] for reversed or invalid input", () => {
  assert.deepEqual(eachDateInRange("2026-06-21", "2026-06-15"), []);
  assert.deepEqual(eachDateInRange("bad", "2026-06-15"), []);
});

// ── Session derivation ──
const placements = [
  { id: "p1", classId: "k1", day: "mon", start: 540, end: 630, rooms: ["1"] },
  { id: "p2", classId: "k1", day: "tue", start: 540, end: 630, rooms: ["1"] },
  { id: "p3", classId: "k1", day: "wed", start: 540, end: 630, rooms: ["1"] },
  { id: "p4", classId: "k1", day: "thu", start: 540, end: 630, rooms: ["1"] },
  { id: "p5", classId: "k1", day: "fri", start: 540, end: 630, rooms: ["1"] },
  { id: "p6", classId: "k2", day: "sat", start: 540, end: 630, rooms: ["2"] },
];
const term = { start: "2026-06-15", end: "2026-06-26", skipDates: ["2026-06-18"] };

test("sessionsForClass derives dated weekday sessions and honors skipDates", () => {
  const sessions = sessionsForClass("k1", placements, term);
  // 2 weeks Mon–Fri = 10, minus 1 skipped Thursday (2026-06-18) = 9.
  assert.equal(sessions.length, 9);
  assert.ok(!sessions.some((s) => s.date === "2026-06-18"));
  assert.equal(sessions[0].date, "2026-06-15");
  assert.equal(sessions[0].weekday, "mon");
});

test("sessionsForClass returns [] without a valid term", () => {
  assert.deepEqual(sessionsForClass("k1", placements, null), []);
  assert.deepEqual(sessionsForClass("k1", placements, { start: "x", end: "y" }), []);
});

test("suggestQuizDates returns the Fridays a class meets", () => {
  const fridays = suggestQuizDates("k1", placements, term);
  assert.deepEqual(fridays, ["2026-06-19", "2026-06-26"]);
});

// ── Attendance & homework aggregation ──
const attendance = [
  { classId: "k1", date: "2026-06-15", student: "Alex", status: "present", homework: "complete" },
  { classId: "k1", date: "2026-06-16", student: "Alex", status: "tardy", homework: "late" },
  { classId: "k1", date: "2026-06-17", student: "Alex", status: "absent", homework: "missing" },
  { classId: "k1", date: "2026-06-15", student: "Bailey", status: "present", homework: "incomplete" },
];

test("attendanceSummary counts statuses and computes rate", () => {
  const s = attendanceSummary(attendance, "k1", "alex"); // case-insensitive
  assert.equal(s.present, 1);
  assert.equal(s.tardy, 1);
  assert.equal(s.absent, 1);
  assert.equal(s.total, 3);
  assert.equal(s.rate, 2 / 3); // present + tardy
});

test("attendanceSummary returns null rate with no records", () => {
  assert.equal(attendanceSummary(attendance, "k1", "nobody").rate, null);
});

test("homeworkCompletionRate counts complete+late as done", () => {
  const h = homeworkCompletionRate(attendance, "k1", "Alex");
  assert.equal(h.complete, 1);
  assert.equal(h.late, 1);
  assert.equal(h.missing, 1);
  assert.equal(h.total, 3);
  assert.equal(h.rate, 2 / 3);
});

// ── Quiz averaging ──
const quizzes = [
  { id: "q1", classId: "k1", date: "2026-06-19", title: "Week 1", maxScore: 100 },
  { id: "q2", classId: "k1", date: "2026-06-26", title: "Week 2", maxScore: 50 },
];
const quizScores = [
  { quizId: "q1", student: "Alex", score: 80 },
  { quizId: "q2", student: "Alex", score: 45 },
];

test("quizAverage produces detail and percent average", () => {
  const r = quizAverage(quizzes, quizScores, "k1", "Alex");
  assert.equal(r.count, 2);
  assert.equal(r.detail[0].pct, 80);
  assert.equal(r.detail[1].pct, 90);
  assert.equal(r.avgPct, 85);
  assert.equal(r.avgScore, 62.5);
});

test("quizAverage ignores scores for quizzes in other classes", () => {
  const r = quizAverage(quizzes, [{ quizId: "qX", student: "Alex", score: 99 }], "k1", "Alex");
  assert.equal(r.count, 0);
  assert.equal(r.avgPct, null);
});

// ── Report card aggregation ──
test("buildReportCard aggregates only the student's classes", () => {
  const data = {
    catalog: [
      { id: "k1", name: "Algebra", teacher: "Amy", students: ["Alex", "Bailey"] },
      { id: "k2", name: "Art", teacher: "Bob", students: ["Bailey"] },
    ],
    placements,
    attendance,
    quizzes,
    quizScores,
    reportComments: [{ classId: "k1", student: "Alex", comment: "Great progress." }],
    term,
  };
  const card = buildReportCard("Alex", data);
  assert.equal(card.classes.length, 1);
  const k1 = card.classes[0];
  assert.equal(k1.className, "Algebra");
  assert.equal(k1.comment, "Great progress.");
  assert.equal(k1.attendance.total, 3);
  assert.equal(k1.quiz.avgPct, 85);
});

// ── normalizeV2 carry-through (the critical "don't drop on reload" guard) ──
test("normalizeV2 carries the course-management layer and drops orphans", () => {
  const raw = {
    version: 2,
    days: ["mon", "tue", "wed", "thu", "fri"],
    rooms: [{ id: "1", cap: 12 }],
    catalog: [{ id: "k1", name: "Algebra", teacher: "Amy", reg: 1, note: "", students: ["Alex"] }],
    placements: [{ id: "p1", classId: "k1", day: "mon", start: 540, end: 630, rooms: ["1"] }],
    term: { start: "2026-06-15", end: "2026-08-21", skipDates: ["2026-07-04", "bad"] },
    sessionLogs: [
      { classId: "k1", date: "2026-06-15", content: "Intro", homework: "p.1", note: "" },
      { classId: "ghost", date: "2026-06-15", content: "x", homework: "", note: "" },
    ],
    attendance: [
      { classId: "k1", date: "2026-06-15", student: "Alex", status: "present", homework: "complete" },
      { classId: "k1", date: "2026-06-15", student: "Alex", status: "absent", homework: "" },
      { classId: "k1", date: "bad", student: "Alex", status: "present" },
    ],
    quizzes: [
      { id: "q1", classId: "k1", date: "2026-06-19", title: "Wk1", maxScore: 100 },
      { id: "q2", classId: "ghost", date: "2026-06-19", title: "x", maxScore: 10 },
    ],
    quizScores: [
      { quizId: "q1", student: "Alex", score: 90 },
      { quizId: "q2", student: "Alex", score: 5 },
      { quizId: "q1", student: "Alex", score: 80 },
    ],
    reportComments: [{ classId: "k1", student: "Alex", comment: "Good" }],
    staffPins: { Amy: "1234", "": "x", Bob: "" },
  };
  const v2 = normalizeV2(raw);
  assert.equal(v2.term.skipDates.length, 1); // invalid date removed
  assert.equal(v2.sessionLogs.length, 1); // orphan class dropped
  assert.equal(v2.attendance.length, 1); // dup merged (keep last), bad date dropped
  assert.equal(v2.attendance[0].status, "absent");
  assert.equal(v2.quizzes.length, 1); // orphan class dropped
  assert.equal(v2.quizScores.length, 1); // orphan quiz dropped, dup merged
  assert.equal(v2.quizScores[0].score, 80);
  assert.equal(v2.reportComments.length, 1);
  assert.deepEqual(v2.staffPins, { Amy: "1234" });
});
