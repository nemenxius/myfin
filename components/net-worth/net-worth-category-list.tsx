"use client";

import { useMemo, useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNetWorthCategories } from "@/hooks/use-net-worth-categories";
import { CategoryIcon } from "@/components/categories/category-icons";
import { NetWorthCategoryForm } from "./net-worth-category-form";
import type { Tables } from "@/types/database";

type NetWorthCategory = Tables<"net_worth_categories">;

export function NetWorthCategoryList() {
  const { data: categories, isLoading, deleteNetWorthCategory } = useNetWorthCategories();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NetWorthCategory | null>(null);
  const [deleting, setDeleting] = useState<NetWorthCategory | null>(null);

  const { globalCategories, userCategories } = useMemo(() => {
    const all = categories ?? [];
    return {
      globalCategories: all.filter((c) => c.user_id === null),
      userCategories: all.filter((c) => c.user_id !== null),
    };
  }, [categories]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (category: NetWorthCategory) => {
    setEditing(category);
    setFormOpen(true);
  };

  const confirmDelete = () => {
    if (deleting) {
      deleteNetWorthCategory.mutate(deleting.id);
    }
    setDeleting(null);
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-fog">
          {isLoading
            ? "Loading…"
            : `${userCategories.length} custom categor${userCategories.length === 1 ? "y" : "ies"}`}
        </p>
        <Button variant="outline" size="sm" onClick={openCreate}>
          <Plus />
          Add category
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
              Your categories
            </p>
            {userCategories.length === 0 ? (
              <p className="text-sm text-fog">No custom categories yet.</p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                {userCategories.map((category) => (
                  <li
                    key={category.id}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <span className="flex items-center gap-2.5 text-sm text-foreground">
                      <CategoryIcon
                        slug={category.icon}
                        className="h-4 w-4 text-fog"
                      />
                      {category.name}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" />}
                        aria-label={`Actions for ${category.name}`}
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => openEdit(category)}>
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleting(category)}
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-1.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
              Global categories
            </p>
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {globalCategories.map((category) => (
                <li
                  key={category.id}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <span className="flex items-center gap-2.5 text-sm text-foreground">
                    <CategoryIcon
                      slug={category.icon}
                      className="h-4 w-4 text-fog"
                    />
                    {category.name}
                  </span>
                  <Badge
                    variant="outline"
                    className="bg-secondary text-secondary-foreground"
                  >
                    Global
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <NetWorthCategoryForm
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editing}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Assets using this category will become uncategorized. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
