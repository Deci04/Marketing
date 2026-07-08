"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { List, X, Bell, SignOut, UserCircle, Check } from "@phosphor-icons/react";
import { NAV } from "./sidebar-nav";

/** Barra mobile (top) con menu aree a scomparsa. Nascosta da `md` in su (c'è il rail). */
export function MobileTopBar({
  workspaceInitial,
  userName,
  unread,
  signOutAction,
}: {
  workspaceInitial: string;
  userName: string;
  unread: number;
  signOutAction: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const current = NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));

  return (
    <div className="md:hidden">
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/90 px-3 py-2.5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink font-heading text-paper">
            {workspaceInitial}
          </span>
          <span className="truncate font-heading text-lg text-ink">{current?.label ?? "Home"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href="/notifiche"
            aria-label="Notifiche"
            className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-paper text-ink/70 active:scale-95"
          >
            <Bell size={18} />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral px-1 text-[10px] font-semibold text-coral-ink">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={open}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-paper text-ink active:scale-95"
          >
            {open ? <X size={18} /> : <List size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute inset-x-0 top-0 rounded-b-3xl border-b border-border bg-paper p-3 shadow-[0_24px_60px_rgba(26,24,19,0.22)]">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="font-heading text-xl text-ink">Vai a…</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Chiudi"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-paper text-ink/60"
              >
                <X size={16} />
              </button>
            </div>
            <nav className="space-y-1">
              {NAV.map(({ href, label, Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-base transition-colors ${
                      active ? "bg-ink text-paper" : "text-ink hover:bg-secondary"
                    }`}
                  >
                    <Icon size={20} weight={active ? "fill" : "regular"} className="shrink-0" />
                    {label}
                    {active && <Check size={16} className="ml-auto" />}
                  </Link>
                );
              })}
              <div className="my-1 border-t border-border" />
              <Link
                href="/profilo"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-base text-ink transition-colors hover:bg-secondary"
              >
                <UserCircle size={20} className="shrink-0" />
                <span className="truncate">Profilo · {userName}</span>
              </Link>
              <form action={signOutAction}>
                <button className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-base text-ink/70 transition-colors hover:bg-secondary">
                  <SignOut size={20} className="shrink-0" />
                  Esci
                </button>
              </form>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
