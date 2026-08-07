"use client";

import { useEffect, useState } from "react";
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
import { useNetWorthCategories } from "@/hooks/use-net-worth-categories";
import { CATEGORY_ICONS, CategoryIcon } from "@/components/categories/category-icons";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";

type NetWorthCategory = Tables<"net_worth_categories">;

interface NetWorthCategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: NetWorthCategory | null;
}

export function NetWorthCategoryForm({
  open,
  onOpenChange,
  category,
}: NetWorthCategoryFormProps) {
  const { createNetWorthCategory, updateNetWorthCategory } = useNetWorthCategories();

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSubmitError(null);

    if (category) {
      setName(category.name);
      setIcon(category.icon);
    } else {
      setName("");
      setIcon("");
    }
  }, [open, category]);

  const validate = (): boolean => {
    const next: { name?: string } = {};
    if (!name.trim()) {
      next.name = "Name is required.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitError(null);

    const payload = { name: name.trim(), icon: icon || "Tag" };

    try {
      if (category) {
        await updateNetWorthCategory.mutateAsync({ id: category.id, ...payload });
      } else {
        await createNetWorthCategory.mutateAsync(payload);
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
            {category ? "Edit Net Worth Category" : "Add Net Worth Category"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="nwc-name">Name</Label>
            <Input
              id="nwc-name"
              type="text"
              placeholder="Real Estate"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>Icon</Label>
            <div className="grid grid-cols-6 gap-1.5">
              {CATEGORY_ICONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-label={option.label}
                  aria-pressed={icon === option.value}
                  onClick={() => setIcon(option.value)}
                  className={cn(
                    "flex h-10 w-full items-center justify-center rounded-lg border text-fog transition-colors hover:bg-muted hover:text-foreground",
                    icon === option.value &&
                      "border-[#18848c] bg-[#18848c]/10 text-[#18848c]"
                  )}
                >
                  <CategoryIcon slug={option.value} className="h-4 w-4" />
                </button>
              ))}
            </div>
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
              {category ? "Save Changes" : "Add Category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
