# Authenticated Landing Redirect - Design

Date: 2026-08-12

## Overview

The landing page currently renders public Create Account and Sign In actions
even when a regular authenticated user has an active session. This makes the
user appear signed out, despite `/dashboard` being available.

The landing route will become session-aware. Permanent authenticated users will
be redirected server-side to `/dashboard`, anonymous demo users will remain on
the landing page with a `Continue demo` CTA, and signed-out users will see the
normal public CTAs. While the client auth provider is resolving its session,
landing controls will render a neutral state instead of briefly showing
signed-out actions.

## Scope

- Add a server-side `/` redirect for non-anonymous authenticated users.
- Keep anonymous demo sessions on `/`.
- Keep signed-out visitors on `/` with Create Account, Sign In, and Try demo.
- Show Continue demo for anonymous users through the existing shared CTA.
- Render neutral landing header/hero action areas while client auth state loads.
- Preserve existing dashboard, auth, and demo-exit behavior.

## Decisions

1. **Use `proxy.ts` for the regular-user redirect.** It already refreshes the
   Supabase session and owns route-level auth redirects, so `/` can be handled
   before the landing page renders.
2. **Use `user.is_anonymous` as the only demo discriminator.** This matches the
   existing auth provider, demo banner, auth form, and CTA behavior.
3. **Keep CTA branching in client landing components.** `Header` and `Hero`
   already render the shared `TryDemoButton`; a small shared session-aware
   action wrapper or equivalent hook-based conditional rendering will prevent
   duplicated state logic while preserving the existing visual layout.
4. **Use neutral placeholders during auth loading.** The page remains visible,
   but the account-action slots do not show misleading signed-out actions until
   session resolution completes.

## Routing Changes

### `proxy.ts`

After obtaining `user`, add a root-route rule:

```ts
if (pathname === "/" && user && !user.is_anonymous) {
  const url = request.nextUrl.clone();
  url.pathname = "/dashboard";
  return NextResponse.redirect(url);
}
```

The rule must not redirect anonymous users or signed-out visitors. Existing
protected-route and `/auth` redirect behavior remains unchanged.

## Landing UI Changes

### `components/landing/header.tsx` and `components/landing/hero.tsx`

Use the existing auth context to distinguish loading, demo, and signed-out
states. During loading, render neutral non-interactive placeholders in the
action locations. For an anonymous user, retain the Continue demo behavior
provided by `TryDemoButton` and do not show Create Account or Sign In as if the
visitor were signed out. For a signed-out visitor, preserve the current CTA
labels, links, and Try demo setup behavior.

Because regular authenticated users are redirected by the proxy, they should
not normally render the landing UI after session resolution.

## Error Handling

- A regular authenticated request to `/` is redirected before page rendering.
- If client auth state loading fails or remains unresolved, the landing page
  keeps neutral action placeholders rather than claiming the visitor is signed
  out.
- No new auth mutation or data cleanup is introduced.

## Verification

- Run `npm test`.
- Run `npx tsc --noEmit`.
- Run `npm run build` with valid-shaped non-secret Supabase placeholder values
  when local environment variables are unavailable.
- Run `git diff --check`.
- Manual checks:
  1. Signed-out `/` shows the normal CTAs.
  2. Anonymous demo `/` shows Continue demo and remains on the landing page.
  3. Regular authenticated `/` redirects to `/dashboard` without showing the
     public landing CTAs.
  4. Landing auth loading does not flash Create Account or Sign In.

## Out of Scope

- Changes to session persistence or Supabase auth semantics.
- Changes to the dashboard route or navigation.
- Changes to demo data, demo purge, or Exit demo.
- Changes to the public landing copy or visual design beyond neutral action
  placeholders and session-appropriate CTA visibility.
