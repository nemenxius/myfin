import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ supabaseClient: {} }));
import { monthsThroughCurrent } from "./use-recurring-transactions";

describe("monthsThroughCurrent", () => {
  it("returns every month from a past start through the current month", () => {
    expect(monthsThroughCurrent("2026-01", "2026-03")).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });

  it("does not backfill future months", () => {
    expect(monthsThroughCurrent("2026-05", "2026-03")).toEqual([]);
  });
});
