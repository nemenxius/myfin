"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email) return;
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="mt-8 flex max-w-md items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <span className="text-sm font-medium text-emerald-700">
          You&apos;re on the list! We&apos;ll be in touch soon.
        </span>
      </div>
    );
  }

  return (
    <form
      id="waitlist"
      onSubmit={handleSubmit}
      className="mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
    >
      <Input
        type="email"
        placeholder="Enter your email for early access."
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="h-12 flex-1 rounded-xl border-zinc-200 bg-white shadow-sm focus-visible:ring-blue-700"
      />
      <Button
        type="submit"
        className="h-12 rounded-xl bg-blue-700 px-6 text-white shadow-sm hover:bg-blue-800"
      >
        Join the Waitlist
      </Button>
    </form>
  );
}