import { createBrowserClient } from "@supabase/ssr";

import { demoLocalLogoutFetch } from "@/lib/supabase/demo-local-logout-fetch";

export const supabaseClient = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    global: {
      fetch: (input, init) =>
        demoLocalLogoutFetch(process.env.NEXT_PUBLIC_SUPABASE_URL!, input, init),
    },
  },
);
