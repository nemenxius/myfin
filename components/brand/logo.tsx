import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-7 w-7", className)}
      aria-hidden
    >
      <path
        d="M5 7.5h18v13.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M5 12h18"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <rect
        x="14.5"
        y="16.5"
        width="7.5"
        height="4.2"
        rx="1.1"
        fill="var(--accent)"
      />
      <circle cx="22.3" cy="9.75" r="1.35" fill="var(--accent)" />
    </svg>
  );
}