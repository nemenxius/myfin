## Task 2 RLS fix

- Static SQL assertions: `npx vitest run supabase/migrations/013_transaction_recurring_rls.test.ts` — passed (4 tests).
- Full test suite: `npm test` — passed (9 files, 80 tests).
- Type check: `npx tsc --noEmit` — passed.

Vitest emitted the repository's known non-failing Vite config warning.
