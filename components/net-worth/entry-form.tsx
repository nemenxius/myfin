"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import {
  useNetWorth,
  type EntryType,
  type EntryWithValues,
} from "@/hooks/use-net-worth";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ValueDraft = {
  id?: string;
  as_of: string;
  value: string;
};

interface EntryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryType: EntryType;
  entry?: EntryWithValues | null;
}

interface FormErrors {
  name?: string;
  rows?: string;
}

const LABELS: Record<EntryType, string> = {
  asset: "Asset",
  liability: "Liability",
};

const todayInput = (): string => format(new Date(), "yyyy-MM-dd");

export function EntryForm({
  open,
  onOpenChange,
  entryType,
  entry,
}: EntryFormProps) {
  const { createEntry, updateEntry, addValue, updateValue, deleteValue } =
    useNetWorth();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<ValueDraft[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const label = LABELS[entryType];
  const isEdit = !!entry;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSubmitError(null);

    if (entry) {
      setName(entry.name);
      setDescription(entry.description ?? "");
      setRows(
        entry.values.map((v) => ({
          id: v.id,
          as_of: v.as_of,
          value: String(v.value),
        }))
      );
    } else {
      setName("");
      setDescription("");
      setRows([{ as_of: todayInput(), value: "" }]);
    }
  }, [open, entry]);

  const updateRow = (index: number, patch: Partial<ValueDraft>) => {
    setRows((old) => old.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    setRows((old) => [...old, { as_of: todayInput(), value: "" }]);
  };

  const removeRow = (index: number) => {
    setRows((old) => old.filter((_, i) => i !== index));
  };

  const validate = (): boolean => {
    const next: FormErrors = {};

    const uniqueDates = new Set(rows.map((r) => r.as_of));
    if (uniqueDates.size !== rows.length) {
      next.rows = "Each date can only appear once.";
    }

    if (!name.trim()) {
      next.name = "Please enter a name.";
    }
    if (rows.length === 0) {
      next.rows = "Add at least one value.";
    } else {
      const badRow = rows.some(
        (row) =>
          !row.as_of ||
          row.value === "" ||
          Number.isNaN(Number(row.value)) ||
          Number(row.value) < 0
      );
      if (badRow) {
        next.rows = "Each value needs a date and a number 0 or greater.";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitError(null);

    try {
      if (isEdit && entry) {
        await updateEntry.mutateAsync({
          id: entry.id,
          name: name.trim(),
          description: description.trim() || null,
        });

        const keptIds = new Set(
          rows.filter((r) => r.id).map((r) => r.id as string)
        );

        for (const row of rows) {
          if (row.id) {
            await updateValue.mutateAsync({
              id: row.id,
              as_of: row.as_of,
              value: Number(row.value),
            });
          } else {
            await addValue.mutateAsync({
              entryId: entry.id,
              as_of: row.as_of,
              value: Number(row.value),
            });
          }
        }

        for (const v of entry.values) {
          if (!keptIds.has(v.id)) {
            await deleteValue.mutateAsync(v.id);
          }
        }
      } else {
        const first = rows[0];
        await createEntry.mutateAsync({
          entry_type: entryType,
          name: name.trim(),
          description: description.trim() || null,
          initialValue: Number(first.value),
          initialAsOf: first.as_of,
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${label}` : `Add ${label}`}</DialogTitle>
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
            <div className="flex items-center justify-between">
              <Label>Value history</Label>
              {isEdit && (
                <Button type="button" variant="outline" size="sm" onClick={addRow}>
                  <Plus />
                  Add row
                </Button>
              )}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Date</TableHead>
                  <TableHead>Value</TableHead>
                  {isEdit && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={row.id ?? `new-${index}`}>
                    <TableCell>
                      <Input
                        type="date"
                        value={row.as_of}
                        onChange={(e) =>
                          updateRow(index, { as_of: e.target.value })
                        }
                        aria-label={`Value ${index + 1} date`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={row.value}
                        onChange={(e) =>
                          updateRow(index, { value: e.target.value })
                        }
                        aria-label={`Value ${index + 1}`}
                      />
                    </TableCell>
                    {isEdit && (
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeRow(index)}
                          aria-label={`Remove value ${index + 1}`}
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {errors.rows && (
              <p className="text-xs text-destructive">{errors.rows}</p>
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
              {isEdit ? "Save Changes" : `Add ${label}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
