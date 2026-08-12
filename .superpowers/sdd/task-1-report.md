# Task 1 Report

## Files

- Modified `proxy.ts` to redirect permanent authenticated users from `/` to `/dashboard`.
- Added `/` to the proxy matcher so the root redirect executes.
- Preserved anonymous demo access, signed-out landing access, `/auth` behavior, and protected-route handling.

## Commands and results

- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.

## Self-review

- The change is limited to the requested proxy routing behavior.
- The root redirect checks `user.is_anonymous`, so anonymous demo users remain on `/`.
- Existing `/auth` and protected-route conditions remain unchanged.
- No test harness exists for `proxy.ts`; validation used the commands specified in the task brief.
