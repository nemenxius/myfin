# Authenticated Landing Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redirect regular authenticated users from `/` to `/dashboard` while presenting accurate demo, signed-out, and loading states on the public landing page.

**Architecture:** Add the root redirect to the existing Supabase-aware `proxy.ts`. Make the landing header and hero client-aware through `useAuth()`, preserving signed-out CTAs, showing Continue demo for anonymous sessions via `TryDemoButton`, and rendering neutral action placeholders while auth initializes.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase SSR/JS auth, TypeScript, existing Button primitives, Vitest.

## Global Constraints

- Regular authenticated users should always be redirected from `/` to `/dashboard`.
- Anonymous demo users can remain on `/` and see a `Continue demo` CTA.
- Signed-out users see the normal landing CTAs.
- While auth state is loading, render a neutral state so the landing does not briefly show signed-out actions.
- Use `user.is_anonymous` as the only demo discriminator.
- Preserve existing dashboard, auth, demo setup, and demo exit behavior.
- Do not change session persistence, auth semantics, database migrations, dependencies, or unrelated landing copy.
- Do not run the broken `npm run lint` script.

---

### Task 1: Redirect Authenticated Users from the Root Route

**Files:**
- Modify: `proxy.ts:32-50`
- Test: no existing proxy-test harness; validate with typecheck, tests, build, and static inspection

**Interfaces:**
- Consumes: Supabase SSR user from `supabase.auth.getUser()` and `user.is_anonymous`.
- Produces: `/` redirects permanent authenticated users to `/dashboard`, while anonymous and signed-out users continue to `/`.

- [ ] **Step 1: Confirm route and redirect context**

Read `proxy.ts` and confirm it already distinguishes anonymous users for `/auth` and owns route-level redirects.

- [ ] **Step 2: Add the root redirect**

Immediately after the existing `isProtected` declaration, add:

```ts
if (pathname === "/" && user && !user.is_anonymous) {
  const url = request.nextUrl.clone();
  url.pathname = "/dashboard";
  return NextResponse.redirect(url);
}
```

Ensure the proxy matcher includes `/` so this rule executes for root requests. Keep protected-route handling and the existing `/auth` redirect unchanged.

- [ ] **Step 3: Verify proxy behavior statically**

```bash
npx tsc --noEmit
git diff --check
```

Expected: both commands pass.

- [ ] **Step 4: Commit the routing change**

```bash
git add proxy.ts
git commit -m "fix: redirect authenticated landing visits"
```

---

### Task 2: Make Landing Actions Session-Aware

**Files:**
- Modify: `components/landing/header.tsx:1-40`
- Modify: `components/landing/hero.tsx:1-46`
- Create or modify only if needed: a focused shared landing action component under `components/landing/`
- Test: no existing component-test harness; validate with typecheck, tests, build, and manual state inspection

**Interfaces:**
- Consumes: `useAuth()` values `user` and `isLoading`, existing `TryDemoButton`, and current Button/link styling.
- Produces: neutral loading action slots, Continue demo for anonymous users, and unchanged signed-out CTAs.

- [ ] **Step 1: Inspect existing CTA conventions**

Read both landing components, `components/demo/try-demo-button.tsx`, `hooks/use-auth.tsx`, and `components/ui/button.tsx`. Confirm `TryDemoButton` already renders Continue demo for anonymous users and hides itself while loading.

- [ ] **Step 2: Implement the three landing states**

Use `useAuth()` in the landing action areas. Preserve the existing signed-out links/styles. For `isLoading`, render neutral non-interactive placeholders with the same approximate dimensions as the action controls. For `user?.is_anonymous`, hide Create Account and Sign In and keep the existing Continue demo CTA. For no user, render the normal Create Account, Sign In, and Try demo controls.

Prefer a small shared client component if both header and hero would otherwise duplicate the same state logic. Do not change CTA labels or navigation destinations.

- [ ] **Step 3: Run validation**

```bash
npx tsc --noEmit
npm test -- --run
git diff --check
NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co' NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test_placeholder' npm run build
```

Expected: typecheck, all tests, diff check, and production build pass.

- [ ] **Step 4: Perform manual state checks**

1. Signed-out `/`: normal CTAs appear.
2. Anonymous demo `/`: Continue demo appears; Create Account and Sign In do not.
3. Regular authenticated `/`: proxy redirects to `/dashboard`.
4. During auth initialization: landing action areas do not flash signed-out CTAs.

- [ ] **Step 5: Commit the landing change**

```bash
git add components/landing
git commit -m "feat: show session-aware landing actions"
```

## Plan Self-Review

- Spec coverage: root redirect, demo/signed-out/loading states, preserved CTA behavior, and validation are covered by Tasks 1-2.
- Placeholder scan: no unresolved placeholders; neutral UI placeholders and test-only build values are explicitly defined.
- Type consistency: all state branches consume existing `useAuth()` fields and `TryDemoButton` behavior.
