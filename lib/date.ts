import { format } from "date-fns";

export function dateInputToISO(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toISOString();
}

export function isoToDateInput(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd");
}
