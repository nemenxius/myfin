import { format } from "date-fns";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseMonthParam(value: string | undefined): string {
  if (value && MONTH_PATTERN.test(value)) {
    const [year, monthIndex] = value.split("-").map(Number);
    const date = new Date(year, monthIndex - 1, 1);
    if (date.getFullYear() === year && date.getMonth() === monthIndex - 1) {
      return value;
    }
  }
  return format(new Date(), "yyyy-MM");
}

export function monthWindow(month: string): { start: Date; end: Date } {
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(year, monthIndex - 1, 1);
  const end = new Date(year, monthIndex, 1);
  return { start, end };
}

export function monthLabel(month: string): string {
  const [year, monthIndex] = month.split("-").map(Number);
  return format(new Date(year, monthIndex - 1, 1), "MMMM yyyy");
}
