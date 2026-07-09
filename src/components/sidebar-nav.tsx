"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  CalendarBlank,
  SquaresFour,
  ChartLineUp,
  NotePencil,
} from "@phosphor-icons/react";

export const NAV = [
  { href: "/home", label: "Home", Icon: House },
  { href: "/calendario", label: "Calendario", Icon: CalendarBlank },
  { href: "/contenuti", label: "Contenuti", Icon: SquaresFour },
  { href: "/kpi", label: "KPI", Icon: ChartLineUp },
  { href: "/diario", label: "Diario", Icon: NotePencil },
];

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-2">
      {NAV.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={`group/item flex h-12 w-12 items-center gap-3 overflow-hidden rounded-2xl px-3.5 transition-all duration-200 hover:w-auto hover:pr-4 ${
              active
                ? "bg-ink text-paper shadow-md"
                : "border border-border bg-paper text-ink/55 hover:bg-secondary hover:text-ink"
            }`}
          >
            <Icon size={20} weight={active ? "fill" : "regular"} className="shrink-0" />
            <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium opacity-0 transition-all duration-200 group-hover/item:max-w-[140px] group-hover/item:opacity-100">
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
