import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getQuote } from "@/lib/market-data/quote";
import { getHistory } from "@/lib/market-data/history";
import { getSymbolSuggestions } from "@/lib/market-data/search";
import type { HistoryRange } from "@/lib/market-data/types";

const RANGES: HistoryRange[] = ["3m", "6m", "1y", "2y", "5y", "max"];
const QUOTE_MAX_AGE = 60;
const HISTORY_MAX_AGE = 300;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "quote";

  if (action === "search") {
    const query = url.searchParams.get("q")?.trim() ?? "";
    if (query.length < 2) {
      return NextResponse.json(
        { error: "q must be at least 2 characters" },
        { status: 400 }
      );
    }
    try {
      const suggestions = await getSymbolSuggestions(query);
      return NextResponse.json(suggestions, {
        headers: { "Cache-Control": "public, max-age=60" },
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Market data unavailable",
        },
        { status: 502 }
      );
    }
  }

  const symbol = url.searchParams.get("symbol")?.trim().toUpperCase() ?? "";
  const rangeParam = url.searchParams.get("range") ?? "1y";

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }
  if (action !== "quote" && action !== "history") {
    return NextResponse.json(
      { error: "action must be quote or history" },
      { status: 400 }
    );
  }
  if (!RANGES.includes(rangeParam as HistoryRange)) {
    return NextResponse.json(
      { error: `range must be one of ${RANGES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    if (action === "quote") {
      const quote = await getQuote(symbol);
      return NextResponse.json(quote, {
        headers: { "Cache-Control": `public, max-age=${QUOTE_MAX_AGE}` },
      });
    }
    const history = await getHistory(symbol, rangeParam as HistoryRange);
    return NextResponse.json(history, {
      headers: { "Cache-Control": `public, max-age=${HISTORY_MAX_AGE}` },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Market data unavailable",
      },
      { status: 502 }
    );
  }
}
