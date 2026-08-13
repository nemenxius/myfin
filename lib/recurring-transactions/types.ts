export type RecurrenceUnit = "day" | "week" | "month" | "year";

export type RecurrenceKind = "never" | "interval" | "workday";

export type RecurrenceConfig = {
  kind: RecurrenceKind;
  unit: RecurrenceUnit | null;
  interval: number | null;
};

export type RecurrenceRule = {
  startDate: string;
  endDate: string | null;
  recurrence: RecurrenceConfig;
};
