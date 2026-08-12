import { afterEach, describe, expect, it, vi } from "vitest";

import { demoLocalLogoutFetch } from "@/lib/supabase/demo-local-logout-fetch";

describe("demoLocalLogoutFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("short-circuits only local auth logout requests", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("delegated"));

    const response = await demoLocalLogoutFetch(
      "https://project.supabase.co/auth/v1/logout?scope=local",
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("delegates global logout and unrelated requests unchanged", async () => {
    const delegatedResponse = new Response("delegated");
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(delegatedResponse);
    const requestInit = { method: "POST" };

    await expect(
      demoLocalLogoutFetch(
        "https://project.supabase.co/auth/v1/logout?scope=global",
        requestInit,
      ),
    ).resolves.toBe(delegatedResponse);
    await expect(
      demoLocalLogoutFetch("https://project.supabase.co/rest/v1/accounts", requestInit),
    ).resolves.toBe(delegatedResponse);

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://project.supabase.co/auth/v1/logout?scope=global",
      requestInit,
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://project.supabase.co/rest/v1/accounts",
      requestInit,
    );
  });
});
