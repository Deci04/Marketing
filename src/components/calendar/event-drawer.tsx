"use client";

import { createContext, useContext, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  InstagramLogo,
  YoutubeLogo,
  ArrowDown,
  ArrowUp,
  ArrowRight,
} from "@phosphor-icons/react";

export type DrawerEvent = {
  date: string;
  kind: "luca_delivery" | "matteo_delivery" | "publication";
  label: string;
  owner: string;
  channel?: "INSTAGRAM" | "YOUTUBE";
  href: string;
};

const KIND_STYLE: Record<DrawerEvent["kind"], string> = {
  luca_delivery: "bg-blush text-blush-ink",
  matteo_delivery: "bg-lavender text-lavender-ink",
  publication: "bg-sage text-sage-ink",
};
const KIND_LABEL: Record<DrawerEvent["kind"], string> = {
  luca_delivery: "Consegna · Luca",
  matteo_delivery: "Consegna · Matteo",
  publication: "Pubblicazione",
};

const Ctx = createContext<{ open: (e: DrawerEvent) => void }>({ open: () => {} });

export function EventDrawerProvider({ children }: { children: React.ReactNode }) {
  const [evt, setEvt] = useState<DrawerEvent | null>(null);

  const title = evt ? evt.label.replace(/^.*? — /, "") : "";
  const dateStr = evt
    ? new Intl.DateTimeFormat("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(evt.date))
    : "";
  const Logo = evt?.channel === "YOUTUBE" ? YoutubeLogo : InstagramLogo;

  return (
    <Ctx.Provider value={{ open: setEvt }}>
      {children}
      <AnimatePresence>
        {evt && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEvt(null)}
              className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[2px]"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
              className="fixed right-3 top-3 z-50 flex h-[calc(100vh-1.5rem)] w-80 flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${KIND_STYLE[evt.kind]}`}
                >
                  {KIND_LABEL[evt.kind]}
                </span>
                <button
                  aria-label="Chiudi"
                  onClick={() => setEvt(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
                >
                  <X size={16} />
                </button>
              </div>

              <div>
                <h2 className="text-xl">{title}</h2>
                <p className="mt-1 text-sm capitalize text-muted-foreground">
                  {dateStr}
                </p>
              </div>

              {evt.channel && (
                <div className="flex items-center gap-2 rounded-2xl bg-secondary/60 px-3.5 py-2.5 text-sm">
                  <Logo size={16} weight="fill" />
                  {evt.channel === "YOUTUBE" ? "YouTube" : "Instagram"}
                </div>
              )}

              <Link
                href={evt.href}
                className="mt-auto inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
              >
                {evt.kind === "publication" ? "Apri contenuto" : "Vai ai contenuti"}
                <ArrowRight size={15} weight="bold" />
              </Link>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

export function EventChip({ e }: { e: DrawerEvent }) {
  const { open } = useContext(Ctx);
  const Logo = e.channel === "YOUTUBE" ? YoutubeLogo : InstagramLogo;
  const short = e.label.replace(/^.*? — /, "");
  return (
    <button
      onClick={() => open(e)}
      title={e.label}
      className={`flex w-full items-center gap-1 truncate rounded-md px-1.5 py-1 text-left text-[11px] font-medium ${KIND_STYLE[e.kind]}`}
    >
      {e.kind === "publication" ? (
        <Logo size={11} weight="fill" className="shrink-0" />
      ) : e.kind === "luca_delivery" ? (
        <ArrowDown size={11} weight="bold" className="shrink-0" />
      ) : (
        <ArrowUp size={11} weight="bold" className="shrink-0" />
      )}
      <span className="truncate">{short}</span>
    </button>
  );
}
