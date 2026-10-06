import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_25%)] text-primary-foreground shadow-sm ring-1 ring-inset ring-white/15",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-[60%]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {/* An open book with a tick: the books are even. */}
        <path d="M12 7v14" opacity={0.55} />
        <path d="M21 13V4a1 1 0 0 0-1-1h-5a3 3 0 0 0-3 3 3 3 0 0 0-3-3H4a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h5a3 3 0 0 1 3 3" opacity={0.55} />
        <path d="m15 17 2 2 4-4" />
      </svg>
    </span>
  );
}
