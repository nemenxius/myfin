"use client";

import { useEffect, useState } from "react";
import { useNetWorth, type EntryType, type EntryWithValues } from "@/hooks/use-net-worth";
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

interface EntryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryType: EntryType;
  entry?: EntryWithValues | null;
}

interface FormErrors {
  name?: string;
  value?: string;
}

const LABELS: Record<EntryType, string> = {
  asset: "Asset",
  liability: "Liability",
};

export function EntryForm({
  open,
  onOpenChange,
  entryType,
  entry,
}: EntryFormProps) {
  const { createEntry, updateEntry } = useNetWorth();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const label = LABELS[entryType];

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSubmitError(null);

    if (entry) {
      setName(entry.name);
      setDescription(entry.description ?? "");
      setValue(
        String(entry.values.length > 0 ? entry.values[entry.values.length - 1].value : "")
      );
    } else {
      setName("");
      setDescription("");
      setValue("");
    }
  }, [open, entry]);

  const validate = (): boolean => {
    const next: FormErrors = {};
    const numericValue = Number(value);

    if (!name.trim()) {
      next.name = "Please enter a name.";
    }
    if (value === "" || Number.isNaN(numericValue) || numericValue < 0) {
      next.value = "Value must be 0 or greater.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitError(null);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
    };

    try {
      if (entry) {
        await updateEntry.mutateAsync({ id: entry.id, ...payload });
      } else {
        await createEntry.mutateAsync({
          entry_type: entryType,
          ...payload,
          initialValue: Number(value),
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
          <DialogTitle>{entry ? `Edit ${label}` : `Add ${label}`}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              placeholder={entryType === "asset" ? "Main House" : "Mortgage"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              type="text"
              placeholder="A short note about it"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="value">Value</Label>
            <Input
              id="value"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={!!errors.value}
            />
            {errors.value && (
              <p className="text-xs text-destructive">{errors.value}</p>
            )}
          </div>

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
              {entry ? "Save Changes" : `Add ${label}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
