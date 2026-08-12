# Returning Demo Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show returning anonymous demo users a clear `Continue demo` CTA on the landing page instead of hiding the demo button.

**Architecture:** Extend the existing shared `TryDemoButton` component using the already available `user.is_anonymous` auth state. Render a link to `/dashboard` for active demo sessions, retain the current anonymous sign-in/seed flow for signed-out visitors, and continue hiding the CTA for regular authenticated users.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase JS auth state, existing Base UI Button and Next.js navigation.

## Global Constraints

- Use `user.is_anonymous` as the demo discriminator.
- Render the alternate CTA in `components/demo/try-demo-button.tsx`; do not duplicate logic in the landing header or hero.
- Use a link to `/dashboard` for `Continue demo`; do not add an auth mutation or new client state.
- Keep the dashboard demo banner and `Exit demo` behavior unchanged.
- Preserve the existing `Try demo` setup, seeding, loading, error, and navigation behavior for signed-out visitors.
- Do not change Supabase session persistence, routing, dependencies, or normal authenticated-user navigation.
- Do not run the broken `npm run lint` script.

---

### Task 1: Make the Landing Demo CTA Session-Aware

**Files:**
- Modify: `components/demo/try-demo-button.tsx:1-84`
- Test: no existing component-test harness; validate with typecheck, test suite, build, and manual state inspection

**Interfaces:**
- Consumes: `useAuth()` values `{ user, isLoading }`, existing `Button` component, and Next.js link rendering conventions.
- Produces: `TryDemoButton` that renders nothing while auth is loading, `Continue demo` linking to `/dashboard` for anonymous users, the existing `Try demo` action for signed-out visitors, and nothing for regular authenticated users.

- [ ] **Step 1: Inspect the current component and confirm the state branches**

Read `components/demo/try-demo-button.tsx`, `components/landing/header.tsx`, and `components/landing/hero.tsx`. Confirm both landing consumers use the shared component and that the current early return `if (user || isLoading) return null` hides anonymous users.

- [ ] **Step 2: Implement the anonymous continuation branch**

Import `Link` from `next/link`. Replace the current combined early return with explicit branches after the hooks/state declarations:

```tsx
if (isLoading) return null;

if (user?.is_anonymous) {
  return (
    <Button
      render={<Link href="/dashboard" />}
      nativeButton={false}
      variant={variant}
      className={className}
    >
      Continue demo
    </Button>
  );
}

if (user) return null;
```

Keep the existing `handleClick`, setup flow, error display, and `Try demo` button markup unchanged for signed-out visitors. The `Continue demo` branch must not call `signInAnonymously`, seed data, or add an exit control.

- [ ] **Step 3: Verify the implementation statically**

Run:

```bash
npx tsc --noEmit
git diff --check
```

Expected: both commands exit successfully; only `components/demo/try-demo-button.tsx` is changed by this task.

- [ ] **Step 4: Run the project validation suite**

Run:

```bash
npm test
NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co' NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test_placeholder' npm run build
```

Expected: all Vitest tests pass and the production build completes. The placeholder values are valid-shaped test values only and must not be committed.

- [ ] **Step 5: Perform the manual state checklist**

Inspect the rendered landing page in these states:

1. No session: both landing consumers show `Try demo`, and clicking it still sets up and navigates to `/dashboard`.
2. Active anonymous session: both landing consumers show `Continue demo`; clicking it navigates to `/dashboard`.
3. Normal authenticated session: neither landing consumer shows a demo CTA.

Confirm the dashboard banner and its `Exit demo` button were not changed.

- [ ] **Step 6: Commit the focused implementation**

```bash
git add components/demo/try-demo-button.tsx
git commit -m "feat: let returning demo users continue"
```

## Plan Self-Review

- Spec coverage: session-aware CTA, `/dashboard` navigation, preserved setup flow, normal-user hiding, unchanged dashboard behavior, and validation are covered by Task 1.
- Placeholder scan: no unresolved implementation placeholders; the only placeholder values are explicitly scoped to the build command as non-secret test environment values.
- Type consistency: the existing `TryDemoButton` props and `useAuth()` values are preserved; the new branch uses the existing Button `render`/`nativeButton={false}` convention used elsewhere in the repository.
