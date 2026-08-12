export async function demoLocalLogoutFetch(
  supabaseUrl: string,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let requestUrl: URL;
  try {
    requestUrl = new URL(input instanceof Request ? input.url : input.toString());
  } catch {
    return globalThis.fetch(input, init);
  }

  const method = init?.method ?? (input instanceof Request ? input.method : undefined);

  if (
    requestUrl.origin === new URL(supabaseUrl).origin &&
    requestUrl.pathname === "/auth/v1/logout" &&
    method === "POST" &&
    requestUrl.searchParams.size === 1 &&
    requestUrl.searchParams.getAll("scope").length === 1 &&
    requestUrl.searchParams.get("scope") === "local"
  ) {
    // Anonymous demo local sign-out only removes the browser session; it does not revoke server tokens.
    return new Response(null, { status: 200 });
  }

  return globalThis.fetch(input, init);
}
