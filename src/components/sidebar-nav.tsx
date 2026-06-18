"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarBlank,
  SquaresFour,
  Archive,
  ChartLineUp,
} from "@phosphor-icons/react";

const NAV = [
  { href: "/calendario", label: "Calendario", Icon: CalendarBlank },
  { href: "/contenuti", label: "Contenuti", Icon: SquaresFour },
  { href: "/archivio", label: "Archivio", Icon: Archive },
  { href: "/kpi", label: "KPI", Icon: ChartLineUp },
];

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            }`}
          >
            <Icon size={20} weight={active ? "fill" : "regular"} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
