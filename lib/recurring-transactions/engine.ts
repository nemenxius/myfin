import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarWeeks,
  differenceInCalendarYears,
  endOfMonth,
  format,
  getDay,
  isAfter,
  isBefore,
  isEqual,
  parse,
  startOfMonth,
} from "date-fns";
import type { RecurrenceRule, RecurrenceUnit } from "./types";

const DATE_FORMAT = "yyyy-MM-dd";
const UNITS: RecurrenceUnit[] = ["day", "week", "month", "year"];

function parseDate(value: string): Date {
  return parse(value, DATE_FORMAT, new Date(2000, 0, 1));
}

function formatDate(value: Date): string {
  return format(value, DATE_FORMAT);
}

function validDate(value: string): boolean {
  const parsed = parseDate(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && formatDate(parsed) === value;
}

export function validateRecurrenceRule(rule: RecurrenceRule): string[] {
  const errors: string[] = [];
  if (!rule.startDate || !validDate(rule.startDate)) errors.push("startDate");
  if (rule.endDate !== null && (!validDate(rule.endDate) || (validDate(rule.startDate) && rule.endDate < rule.startDate))) {
    errors.push("endDate");
  }

  const { kind, unit, interval } = rule.recurrence;
  if (!["never", "interval", "workday"].includes(kind)) errors.push("kind");
  if (kind === "interval") {
    if (!unit || !UNITS.includes(unit)) errors.push("unit");
    if (!Number.isInteger(interval) || interval === null || interval <= 0) errors.push("interval");
  } else if (kind === "never" || kind === "workday") {
    if (unit !== null) errors.push("unit");
    if (interval !== null) errors.push("interval");
  }
  return errors;
}

function candidateAt(rule: RecurrenceRule, index: number): Date {
  const start = parseDate(rule.startDate);
  const { unit, interval } = rule.recurrence;
  const step = interval ?? 1;
  if (unit === "day") return addDays(start, index * step);
  if (unit === "week") return addWeeks(start, index * step);
  if (unit === "month") {
    const month = addMonths(startOfMonth(start), index * step);
    return new Date(month.getFullYear(), month.getMonth(), Math.min(start.getDate(), endOfMonth(month).getDate()));
  }
  const year = addYears(startOfMonth(start), index * step);
  return new Date(year.getFullYear(), start.getMonth(), Math.min(start.getDate(), endOfMonth(year).getDate()));
}

function occurrenceAt(rule: RecurrenceRule, index: number): Date {
  if (rule.recurrence.kind !== "workday") return candidateAt(rule, index);
  let date = parseDate(rule.startDate);
  let remaining = index;
  while (remaining > 0) {
    date = addDays(date, 1);
    if (getDay(date) !== 0 && getDay(date) !== 6) remaining -= 1;
  }
  return date;
}

function indexAfter(rule: RecurrenceRule, date: Date): number {
  const start = parseDate(rule.startDate);
  if (isBefore(date, start)) return 0;
  if (rule.recurrence.kind === "never") return 1;
  if (rule.recurrence.kind === "workday") {
    let index = 0;
    let candidate = start;
    while (!isAfter(candidate, date)) {
      index += 1;
      candidate = occurrenceAt(rule, index);
    }
    return index;
  }
  const interval = rule.recurrence.interval ?? 1;
  const differences = {
    day: differenceInCalendarDays(date, start),
    week: Math.floor(differenceInCalendarDays(date, start) / 7),
    month: differenceInCalendarMonths(date, start),
    year: differenceInCalendarYears(date, start),
  };
  return Math.max(0, Math.floor(differences[rule.recurrence.unit ?? "day"] / interval));
}

function withinEnd(rule: RecurrenceRule, date: Date): boolean {
  return rule.endDate === null || !isAfter(date, parseDate(rule.endDate));
}

export function isOccurrenceDate(rule: RecurrenceRule, date: string): boolean {
  if (validateRecurrenceRule(rule).length || !validDate(date)) return false;
  const target = parseDate(date);
  const index = indexAfter(rule, target);
  const candidate = occurrenceAt(rule, index);
  return isEqual(candidate, target) && withinEnd(rule, target);
}

export function nextOccurrence(rule: RecurrenceRule, afterDate: string): string | null {
  if (validateRecurrenceRule(rule).length || !validDate(afterDate)) return null;
  const after = parseDate(afterDate);
  let index = indexAfter(rule, after);
  let candidate = occurrenceAt(rule, index);
  if (!isAfter(candidate, after)) candidate = occurrenceAt(rule, ++index);
  return withinEnd(rule, candidate) ? formatDate(candidate) : null;
}

export function occurrencesInMonth(rule: RecurrenceRule, month: string): string[] {
  if (validateRecurrenceRule(rule).length || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const monthStart = parse(`${month}-01`, DATE_FORMAT, new Date(2000, 0, 1));
  const monthEnd = endOfMonth(monthStart);
  const results: string[] = [];
  let index = indexAfter(rule, addDays(monthStart, -1));
  while (isBefore(occurrenceAt(rule, index), monthStart)) index += 1;
  while (true) {
    const candidate = occurrenceAt(rule, index++);
    if (isAfter(candidate, monthEnd)) break;
    if (!isBefore(candidate, monthStart) && withinEnd(rule, candidate)) results.push(formatDate(candidate));
  }
  return results;
}

export function selectEffectiveVersion<T extends { effectiveDate: string }>(versions: T[], date: string): T | null {
  return versions.reduce<T | null>((selected, version) => {
    if (version.effectiveDate <= date && (selected === null || version.effectiveDate > selected.effectiveDate)) return version;
    return selected;
  }, null);
}

export function applyOccurrenceOverride<T>(base: T, override: Partial<T>): T {
  return { ...base, ...override };
}
