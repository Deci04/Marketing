"use client";

import Link from "next/link";
import { Bell } from "@phosphor-icons/react";

export function NotificationBell({ count }: { count: number }) {
  return (
    <Link
      href="/notifiche"
      title="Notifiche"
      className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-paper text-ink/55 transition-colors hover:bg-secondary hover:text-ink"
    >
      <Bell size={18} weight={count > 0 ? "fill" : "regular"} />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral px-1 text-[10px] font-medium text-coral-ink">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
