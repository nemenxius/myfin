# Demo-to-Auth Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the Next.js RSC crash when an anonymous demo user opens the auth page, while safely discarding the temporary demo session before real authentication.

**Architecture:** Let anonymous users pass through the auth route while continuing to redirect permanent authenticated users away from it. Before email signup, email sign-in, or Google OAuth, the client auth form will use the shared `useAuth().signOut()` flow to purge demo data and locally terminate the anonymous session; real auth begins only after cleanup succeeds.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase SSR/JS auth, TypeScript, Vitest.

## Global Constraints

- Demo data must be purged and the anonymous session locally signed out before any real-account auth action.
- Use `user.is_anonymous` as the sole demo-session discriminator.
- Preserve the `/auth` redirect for regular authenticated users.
- Preserve existing signed-out and regular-user email/Google auth behavior.
- If demo cleanup/sign-out fails, show an error and do not begin the requested real-auth flow.
- Do not modify database migrations, RPC functions, dependencies, or unrelated navigation.
- Do not reintroduce `router.push()` plus `router.refresh()` pairs.
- Do not run the broken `npm run lint` script.

---

### Task 1: Allow Demo Users to Reach Auth

**Files:**
- Modify: `proxy.ts:44-48`
- Test: no existing proxy-test harness; validate with typecheck, tests, build, and static inspection

**Interfaces:**
- Consumes: Supabase SSR `user` returned by `supabase.auth.getUser()` and `User.is_anonymous`.
- Produces: `/auth` redirects only permanent authenticated users; anonymous demo users can render the auth page.

- [ ] **Step 1: Confirm the current redirect behavior**

Read `proxy.ts` and verify that `/auth` currently redirects whenever `user` is truthy, including anonymous users.

- [ ] **Step 2: Narrow the redirect condition**

Change:

```ts
if (pathname === "/auth" && user) {
```

to:

```ts
if (pathname === "/auth" && user && !user.is_anonymous) {
```

Keep the destination `/dashboard` and all protected-route behavior unchanged.

- [ ] **Step 3: Run static validation**

```bash
npx tsc --noEmit
git diff --check
```

Expected: both commands pass.

- [ ] **Step 4: Commit the proxy change**

```bash
git add proxy.ts
git commit -m "fix: allow demo users to open auth"
```

---

### Task 2: Clean Up Demo Before Real Auth

**Files:**
- Modify: `components/auth/auth-form.tsx:1-98`
- Test: no existing component-test harness; validate with typecheck, tests, build, and static flow inspection

**Interfaces:**
- Consumes: `useAuth()` values `user` and `signOut(): Promise<{ error: AuthError | null }>`.
- Produces: email signup, email sign-in, and Google OAuth handlers that first purge/sign out anonymous demo sessions, aborting with an inline error on cleanup failure.

- [ ] **Step 1: Add auth context access**

Update the existing auth-form import/use setup so `AuthForm` reads the shared auth state:

```tsx
const { user, signOut } = useAuth();
```

Keep the existing Supabase client for the actual email and Google auth calls.

- [ ] **Step 2: Add a reusable demo cleanup helper**

Inside `AuthForm`, add:

```tsx
const leaveDemoIfNeeded = async () => {
  if (!user?.is_anonymous) return true;

  const { error } = await signOut();
  if (error) {
    setError("Couldn't leave the demo right now. Please try again.");
    return false;
  }

  return true;
};
```

The helper must use `signOut()` rather than calling Supabase purge/sign-out directly, preserving the existing best-effort purge and local anonymous sign-out behavior.

- [ ] **Step 3: Gate Google OAuth**

At the start of `handleGoogle`, after clearing the current error, await cleanup and return on failure:

```tsx
setError(null);
if (!(await leaveDemoIfNeeded())) return;
```

Only then call `signInWithOAuth`.

- [ ] **Step 4: Gate email sign-in**

At the start of `handleSignIn`, after `preventDefault()` and clearing the current error, await cleanup and return on failure before setting loading or calling `signInWithPassword`:

```tsx
setError(null);
if (!(await leaveDemoIfNeeded())) return;
setLoading(true);
```

- [ ] **Step 5: Gate email signup**

At the start of `handleSignUp`, after `preventDefault()` and clearing the current error, await cleanup and return on failure before password validation or `signUp`:

```tsx
setError(null);
if (!(await leaveDemoIfNeeded())) return;
```

Preserve existing password validation, pending currency storage, verification state, and error handling.

- [ ] **Step 6: Verify the auth flow statically and with tests**

Run:

```bash
npx tsc --noEmit
npm test -- --run
git diff --check
```

Expected: typecheck passes, all existing tests pass, and no whitespace errors occur.

- [ ] **Step 7: Run production build**

```bash
NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co' NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test_placeholder' npm run build
```

Expected: build completes successfully. Placeholder values are test-only and must not be committed.

- [ ] **Step 8: Perform the regression checklist**

Verify:

1. Anonymous demo user clicks Create Account from the landing page: `/auth?mode=signup` renders without an RSC `enqueueModel` crash.
2. Submitting email signup first purges/signs out the demo, then starts signup.
3. Email sign-in and Google OAuth also clean up the demo first.
4. If cleanup returns an error, the auth action does not start and the inline error is shown.
5. Signed-out visitors and regular authenticated users retain their existing behavior.
6. `/auth` still redirects regular authenticated users to `/dashboard`.

- [ ] **Step 9: Commit the auth-form change**

```bash
git add components/auth/auth-form.tsx
git commit -m "fix: purge demo before real auth"
```

## Plan Self-Review

- Spec coverage: proxy redirect narrowing, demo cleanup before all three auth methods, error abort behavior, preserved normal flows, and full validation are covered.
- Placeholder scan: no unresolved placeholders; build environment values are explicitly test-only.
- Type consistency: `useAuth().signOut()` retains its existing return type and `user.is_anonymous` is used consistently.
