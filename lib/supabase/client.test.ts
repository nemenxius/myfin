import { afterEach, describe, expect, it, vi } from "vitest";

import { demoLocalLogoutFetch } from "@/lib/supabase/demo-local-logout-fetch";

describe("demoLocalLogoutFetch", () => {
  const supabaseUrl = "https://project.supabase.co";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("short-circuits the exact configured Supabase local logout request", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("delegated"));

    const response = await demoLocalLogoutFetch(
      supabaseUrl,
      "https://project.supabase.co/auth/v1/logout?scope=local",
      { method: "POST" },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong origin", "https://other.supabase.co/auth/v1/logout?scope=local", { method: "POST" }],
    ["wrong method", "https://project.supabase.co/auth/v1/logout?scope=local", { method: "GET" }],
    ["extra query params", "https://project.supabase.co/auth/v1/logout?scope=local&extra=true", { method: "POST" }],
  ])("delegates %s unchanged", async (_case, input, init) => {
    const delegatedResponse = new Response("delegated");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(delegatedResponse);

    await expect(demoLocalLogoutFetch(supabaseUrl, input, init)).resolves.toBe(delegatedResponse);

    expect(fetch).toHaveBeenCalledWith(input, init);
  });

  it("delegates global logout and unrelated requests unchanged", async () => {
    const delegatedResponse = new Response("delegated");
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(delegatedResponse);
    const requestInit = { method: "POST" };

    await expect(
      demoLocalLogoutFetch(
        supabaseUrl,
        "https://project.supabase.co/auth/v1/logout?scope=global",
        requestInit,
      ),
    ).resolves.toBe(delegatedResponse);
    await expect(
      demoLocalLogoutFetch(supabaseUrl, "https://project.supabase.co/rest/v1/accounts", requestInit),
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
