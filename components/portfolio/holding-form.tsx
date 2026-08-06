"use client";

import { useEffect, useRef, useState } from "react";
import {
  useHoldings,
  type HoldingWithCalculations,
} from "@/hooks/use-portfolio";
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASSET_TYPES, HOLDING_TRANSACTION_TYPES } from "./portfolio-types";
import { dateInputToISO, isoToDateInput, isoToTimeInput } from "@/lib/date";
import type { Tables } from "@/types/database";
import type { MarketQuote } from "@/lib/market-data/types";

type HoldingTransaction = Tables<"holding_transactions">;

interface HoldingFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holding?: HoldingWithCalculations | null;
  editingTransaction?: HoldingTransaction | null;
  defaultSymbol?: string;
}

interface FormErrors {
  symbol?: string;
  shares?: string;
  price?: string;
  date?: string;
}

const nowParts = () => {
  const iso = new Date().toISOString();
  return { date: isoToDateInput(iso), time: isoToTimeInput(iso) };
};

async function fetchDetectedCurrency(symbol: string): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/market-data?symbol=${encodeURIComponent(symbol)}&action=quote`
    );
    if (!res.ok) return null;
    const quote = (await res.json()) as MarketQuote;
    return quote.currency ?? null;
  } catch {
    return null;
  }
}

export function HoldingForm({
  open,
  onOpenChange,
  holding,
  editingTransaction,
  defaultSymbol,
}: HoldingFormProps) {
  const { createHoldingWithTransaction, addHoldingTransaction, updateHoldingTransaction } =
    useHoldings();
  const { currency: profileCurrency } = usePrimaryCurrency();

  const isCreating = !holding;
  const isEditingTx = Boolean(editingTransaction);

  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState("stock");
  const [type, setType] = useState("buy");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [commission, setCommission] = useState("0");
  const [date, setDate] = useState(nowParts().date);
  const [time, setTime] = useState(nowParts().time);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const priceFetchRef = useRef(0);
  const [detectedCurrency, setDetectedCurrency] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSubmitError(null);
    setDetectedCurrency(null);
    setType("buy");
    setCommission("0");
    const parts = nowParts();
    setDate(parts.date);
    setTime(parts.time);

    if (isEditingTx && editingTransaction) {
      setSymbol(holding?.symbol ?? "");
      setName(holding?.name ?? "");
      setAssetType(holding?.asset_type ?? "stock");
      setType(editingTransaction.type);
      setShares(String(editingTransaction.shares));
      setPrice(String(editingTransaction.price_per_share));
      setCommission(String(editingTransaction.commission));
      setDate(isoToDateInput(editingTransaction.transacted_at));
      setTime(isoToTimeInput(editingTransaction.transacted_at));
    } else if (holding) {
      setSymbol(holding.symbol);
      setName(holding.name ?? "");
      setAssetType(holding.asset_type);
      setShares("");
      setPrice(
        holding.quote?.currentPrice != null
          ? String(holding.quote.currentPrice)
          : ""
      );
    } else {
      setSymbol(defaultSymbol ?? "");
      setName("");
      setAssetType("stock");
      setShares("");
      setPrice("");
    }
  }, [open, holding, editingTransaction, defaultSymbol, isEditingTx]);

  useEffect(() => {
    if (!open || !isCreating) return;
    const trimmed = symbol.trim().toUpperCase();
    if (!trimmed) return;
    const requestId = ++priceFetchRef.current;
    const timer = setTimeout(async () => {
      setPriceLoading(true);
      try {
        const res = await fetch(
          `/api/market-data?symbol=${encodeURIComponent(trimmed)}&action=quote`
        );
        if (res.ok && requestId === priceFetchRef.current) {
          const quote = (await res.json()) as MarketQuote;
          if (quote.currentPrice != null) setPrice(String(quote.currentPrice));
          if (quote.currency) setDetectedCurrency(quote.currency);
        }
      } catch {
        // live price is best-effort; keep the user-entered price
      } finally {
        if (requestId === priceFetchRef.current) setPriceLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [symbol, isCreating, open]);

  const validate = (): boolean => {
    const next: FormErrors = {};
    const numericShares = Number(shares);
    const numericPrice = Number(price);

    if (isCreating && !symbol.trim()) {
      next.symbol = "Please enter a symbol.";
    }
    if (!shares || Number.isNaN(numericShares) || numericShares <= 0) {
      next.shares = "Shares must be greater than 0.";
    }
    if (
      type !== "dividend" &&
      type !== "transfer" &&
      (Number.isNaN(numericPrice) || numericPrice <= 0)
    ) {
      next.price = "Price must be greater than 0.";
    }
    if (!date) {
      next.date = "Please select a date.";
    }
    if (type === "sell" && holding && (numericShares || 0) > holding.totalShares) {
      next.shares = `You only own ${holding.totalShares} shares.`;
    }
    if (type === "sell" && isCreating) {
      next.shares = "You cannot sell a holding you have not bought yet.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitError(null);
    const payload = {
      type,
      shares: Number(shares),
      price_per_share: Number(price) || 0,
      commission: Number(commission) || 0,
      transacted_at: dateInputToISO(date, time),
      notes: null,
    };

    try {
      if (isEditingTx && editingTransaction) {
        await updateHoldingTransaction.mutateAsync({
          id: editingTransaction.id,
          ...payload,
        });
      } else if (holding) {
        await addHoldingTransaction.mutateAsync({
          holdingId: holding.id,
          transaction: payload,
        });
      } else {
        const symbolTrimmed = symbol.trim().toUpperCase();
        await createHoldingWithTransaction.mutateAsync({
          holding: {
            symbol: symbolTrimmed,
            name: name.trim() || null,
            asset_type: assetType,
            currency:
              detectedCurrency ??
              (await fetchDetectedCurrency(symbolTrimmed)) ??
              profileCurrency,
          },
          transaction: payload,
        });
      }
      onOpenChange(false);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditingTx
              ? "Edit Transaction"
              : isCreating
                ? "Add Holding"
                : `Add ${holding.symbol} Transaction`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          {isCreating && (
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="symbol">Symbol</Label>
                <Input
                  id="symbol"
                  type="text"
                  placeholder="AAPL"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  aria-invalid={!!errors.symbol}
                />
                {errors.symbol && (
                  <p className="text-xs text-destructive">{errors.symbol}</p>
                )}
                {!errors.symbol && (
                  <p className="text-xs text-fog">
                    Currency: {detectedCurrency ?? profileCurrency}
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="name">Name (optional)</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Apple Inc."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="type">Transaction type</Label>
              <Select
                value={type}
                onValueChange={(value) => value !== null && setType(value)}
                items={HOLDING_TRANSACTION_TYPES.map((t) => ({
                  value: t.value,
                  label: t.label,
                }))}
              >
                <SelectTrigger id="type" className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {HOLDING_TRANSACTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isCreating && (
              <div className="grid gap-1.5">
                <Label htmlFor="asset-type">Asset type</Label>
                <Select
                  value={assetType}
                  onValueChange={(value) =>
                    value !== null && setAssetType(value)
                  }
                  items={ASSET_TYPES.map((t) => ({
                    value: t.value,
                    label: t.label,
                  }))}
                >
                  <SelectTrigger id="asset-type" className="w-full">
                    <SelectValue placeholder="Select asset type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="shares">Shares</Label>
              <Input
                id="shares"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                placeholder="10.5"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                aria-invalid={!!errors.shares}
              />
              {errors.shares && (
                <p className="text-xs text-destructive">{errors.shares}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="price">Price / share</Label>
              <Input
                id="price"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                placeholder={priceLoading ? "Fetching…" : "0.00"}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                aria-invalid={!!errors.price}
              />
              {errors.price && (
                <p className="text-xs text-destructive">{errors.price}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="commission">Commission</Label>
              <Input
                id="commission"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                placeholder="0.00"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={!!errors.date}
              />
              {errors.date && (
                <p className="text-xs text-destructive">{errors.date}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="time">Time</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {type === "sell" && holding && (
            <p className="text-xs text-fog">
              You currently own {holding.totalShares} shares.
            </p>
          )}

          {submitError && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {submitError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">
              {isEditingTx
                ? "Save Changes"
                : isCreating
                  ? "Add Holding"
                  : "Add Transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
