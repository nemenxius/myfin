import { format } from "date-fns";

export function dateInputToISO(date: string, time?: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (time) {
    const [hours, minutes] = time.split(":").map(Number);
    return new Date(year, month - 1, day, hours, minutes).toISOString();
  }
  return new Date(year, month - 1, day).toISOString();
}

export function isoToDateInput(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd");
}

export function isoToTimeInput(iso: string): string {
  return format(new Date(iso), "HH:mm");
}
