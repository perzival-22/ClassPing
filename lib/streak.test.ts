import { describe, expect, it } from "vitest";
import { termStats } from "./streak";
import type { TaskItem } from "./store";

const DAY = 86400_000;
const NOW = new Date("2026-08-10T12:00:00");

/** A task due `offset` days from NOW. */
const task = (offset: number, over: Partial<TaskItem> = {}): TaskItem => ({
  id: `t${offset}${over.done ? "d" : ""}`,
  title: "Thing",
  classId: "c1",
  due: new Date(NOW.getTime() + offset * DAY).toISOString(),
  reminder: true,
  done: false,
  ...over,
});

describe("termStats counts", () => {
  it("is all zeroes with no tasks", () => {
    expect(termStats([], NOW)).toEqual({
      completed: 0,
      overdue: 0,
      dueThisWeek: 0,
      streak: 0,
    });
  });

  it("counts completed, overdue and due-this-week separately", () => {
    const stats = termStats(
      [task(-1, { done: true }), task(-1), task(2), task(9)],
      NOW,
    );
    expect(stats.completed).toBe(1);
    expect(stats.overdue).toBe(1);
    expect(stats.dueThisWeek).toBe(1); // the +9 day one is outside the window
  });

  it("treats exactly seven days out as this week", () => {
    expect(termStats([task(7)], NOW).dueThisWeek).toBe(1);
    expect(termStats([task(7.1)], NOW).dueThisWeek).toBe(0);
  });

  it("never counts a completed task as overdue", () => {
    expect(termStats([task(-30, { done: true })], NOW).overdue).toBe(0);
  });

  it("ignores unparseable due dates without throwing", () => {
    const stats = termStats([task(0, { due: "not-a-date" })], NOW);
    expect(stats.overdue).toBe(0);
    expect(stats.dueThisWeek).toBe(0);
  });
});

describe("termStats streak", () => {
  it("is zero while anything is overdue", () => {
    expect(termStats([task(-3)], NOW).streak).toBe(0);
  });

  it("counts days clear, bounded by how long the account has been in use", () => {
    // A single task due 5 days ago and already done: five days plus today.
    expect(termStats([task(-5, { done: true })], NOW).streak).toBe(6);
  });

  it("does not claim a long streak for a brand-new account", () => {
    // The bug this guards: an unbounded walk reported a year of "days clear"
    // for someone who had ticked off one task yesterday.
    expect(termStats([task(-1, { done: true })], NOW).streak).toBe(2);
    expect(termStats([task(0, { done: true })], NOW).streak).toBe(1);
  });

  it("counts today as clear when everything is still ahead", () => {
    expect(termStats([task(3)], NOW).streak).toBe(1);
  });

  it("breaks the streak on the first day that ended dirty", () => {
    // Overdue by two days, plus an old finished one — still zero.
    expect(termStats([task(-10, { done: true }), task(-2)], NOW).streak).toBe(0);
  });
});
