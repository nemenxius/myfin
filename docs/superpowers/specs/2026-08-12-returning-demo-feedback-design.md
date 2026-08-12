# Returning Demo Feedback - Design

Date: 2026-08-12

## Overview

When a visitor starts the anonymous demo, Supabase persists the session in the
browser. On a later visit to the landing page, the existing `TryDemoButton`
currently hides itself for any authenticated session, including an active demo
session. This leaves returning demo users without a clear action even though
they can still enter `/dashboard` directly.

The landing-page demo CTA will become session-aware: anonymous demo users will
see `Continue demo`, while visitors without a session will continue to see
`Try demo`.

## Scope

- Show `Continue demo` on the landing page when `user.is_anonymous` is true.
- Make `Continue demo` navigate to `/dashboard`.
- Preserve the existing `Try demo` setup flow for visitors with no session.
- Preserve the current behavior of hiding demo CTA controls for authenticated
  non-demo users.
- Keep dashboard demo behavior and the `Exit demo` banner unchanged.

## Decisions

1. **Use `user.is_anonymous` as the demo discriminator.** This is already the
   established demo-session signal in `useAuth`, `DemoBanner`, and `UserMenu`.
2. **Render the alternate CTA in `TryDemoButton`.** Both landing-page consumers
   already use this shared component, so no duplicated conditional logic is
   needed in the header or hero.
3. **Use a link to `/dashboard` for Continue demo.** Continuing is a normal
   navigation action and does not need new client state or an auth mutation.
4. **Do not add an Exit demo action to the landing page.** The dashboard banner
   remains the single demo exit control.

## Client Changes

### `components/demo/try-demo-button.tsx`

Use the existing `user` and `isLoading` values from `useAuth` to render:

- nothing while auth state is loading;
- a `Button` rendered as a link to `/dashboard` with the label `Continue demo`
  for anonymous users;
- the current interactive `Try demo` button for visitors without a session.

The existing sign-in-anonymously, seed, error, loading, and dashboard
navigation flow remains unchanged for new demo sessions. Authenticated
non-anonymous users continue to receive no demo CTA.

## Error Handling

`Continue demo` performs no asynchronous operation and therefore introduces no
new error path. Existing setup errors remain displayed by the current `Try
demo` flow.

## Verification

- Add or update focused tests only if the existing test setup can exercise the
  shared client component without introducing a new test abstraction.
- Run `npm test`.
- Run `npm run build`.
- Run `git diff --check`.
- Manually verify the landing page for: signed-out visitor (`Try demo`), active
  anonymous demo (`Continue demo` linking to `/dashboard`), and normal signed-in
  user (no demo CTA).

## Out of Scope

- Changes to Supabase session persistence or anonymous auth.
- Changes to dashboard routing or the demo banner.
- Automatic redirects from the landing page.
- A landing-page `Exit demo` control.
- Changes to normal authenticated-user navigation.
