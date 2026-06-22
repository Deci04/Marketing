"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  X,
  InstagramLogo,
  YoutubeLogo,
  PaperPlaneTilt,
  UploadSimple,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import {
  addCommentAction,
  setThumbnailAction,
  updateContentAction,
  deleteContentAction,
  deleteCommentAction,
} from "@/app/(app)/contenuti/actions";
import { updatePerformanceAction } from "@/app/(app)/kpi/actions";

export type ModalContent = {
  id: string;
  title: string;
  channel: "INSTAGRAM" | "YOUTUBE";
  status: string;
  hook: string | null;
  publishAt: string | null;
  publishAtInput: string | null;
  thumbnailUrl: string | null;
  materialsUrl: string | null;
  block: { label: string; lucaDeliveryAt: string | null; matteoDeliveryAt: string | null } | null;
  views: number | null;
  er: number | null;
  reach: number | null;
  nonFollowerPct: number | null;
  likes: number | null;
  commentsCount: number | null;
  saves: number | null;
  shares: number | null;
  followsGenerated: number | null;
};

export type ModalComment = {
  id: string;
  body: string;
  author: string;
  createdAt: string;
};

const STATUS: Record<string, string> = {
  "Da consegnare": "bg-secondary text-muted-foreground",
  Consegnato: "bg-butter text-butter-ink",
  Revisionato: "bg-lavender text-lavender-ink",
  Pubblicato: "bg-sage text-sage-ink",
};

const TABS = ["Panoramica", "Performance", "Materiali", "Commenti"] as const;
type Tab = (typeof TABS)[number];

function PerfField({
  name,
  label,
  value,
  step = "1",
}: {
  name: string;
  label: string;
  value: number | null;
  step?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-ink">{label}</label>
      <input
        type="number"
        name={name}
        step={step}
        defaultValue={value ?? ""}
        placeholder="—"
        className="mt-1 w-full rounded-[12px] border border-border bg-secondary/70 px-3.5 py-2.5 text-sm outline-none focus:border-ink/30 focus:bg-paper"
      />
    </div>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function ContentModal({
  content,
  comments,
}: {
  content: ModalContent;
  comments: ModalComment[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Panoramica");
  const [editing, setEditing] = useState(false);
  const close = () => router.back();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isYt = content.channel === "YOUTUBE";
  const Logo = isYt ? YoutubeLogo : InstagramLogo;
  const channelInk = isYt ? "text-coral-ink" : "text-blush-ink";

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div
          className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
          onClick={close}
        />
        <motion.div
          className="relative z-10 flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-border bg-paper shadow-[0_24px_60px_rgba(26,24,19,0.22)]"
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 10 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${channelInk}`}>
                  <Logo size={13} weight="fill" />
                  {isYt ? "YouTube" : "Instagram"}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[content.status] ?? "bg-secondary text-muted-foreground"}`}>
                  {content.status}
                </span>
              </div>
              <h2 className="mt-1.5 truncate font-heading text-2xl text-ink">{content.title}</h2>
            </div>
            <button
              onClick={close}
              aria-label="Chiudi"
              className="shrink-0 rounded-full border border-border bg-paper p-2 text-ink/55 transition-colors hover:bg-secondary hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex min-h-0 flex-1">
            <nav className="hidden w-44 shrink-0 border-r border-border p-3 sm:block">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`mb-1 block w-full rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                    tab === t ? "bg-ink text-paper" : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {t}
                  {t === "Commenti" && comments.length > 0 && (
                    <span className="ml-1 text-xs opacity-70">({comments.length})</span>
                  )}
                </button>
              ))}
            </nav>

            <div className="min-w-0 flex-1 overflow-y-auto p-6">
              {/* mobile tab pills */}
              <div className="mb-4 flex gap-1.5 overflow-x-auto sm:hidden">
                {TABS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${
                      tab === t ? "bg-ink text-paper" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {tab === "Panoramica" && (
                <div className="space-y-5">
                  {!editing ? (
                    <>
                      {content.hook && (
                        <div>
                          <div className="text-xs text-muted-foreground">Hook</div>
                          <p className="mt-1 text-[15px] text-ink">&ldquo;{content.hook}&rdquo;</p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs text-muted-foreground">Pubblicazione</div>
                          <p className="mt-1 text-sm text-ink">{fmtDate(content.publishAt)}</p>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Blocco</div>
                          <p className="mt-1 text-sm text-ink">{content.block?.label ?? "—"}</p>
                        </div>
                        {content.block?.lucaDeliveryAt && (
                          <div>
                            <div className="text-xs text-muted-foreground">Consegna Luca</div>
                            <p className="mt-1 text-sm text-ink">{fmtDate(content.block.lucaDeliveryAt)}</p>
                          </div>
                        )}
                        {content.block?.matteoDeliveryAt && (
                          <div>
                            <div className="text-xs text-muted-foreground">Consegna Matteo</div>
                            <p className="mt-1 text-sm text-ink">{fmtDate(content.block.matteoDeliveryAt)}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => setEditing(true)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-paper px-3.5 py-2 text-sm text-ink transition-colors hover:bg-secondary"
                        >
                          <PencilSimple size={15} /> Modifica
                        </button>
                        <form action={deleteContentAction}>
                          <input type="hidden" name="id" value={content.id} />
                          <button className="inline-flex items-center gap-1.5 rounded-full border border-coral/60 bg-coral/30 px-3.5 py-2 text-sm text-coral-ink transition-colors hover:bg-coral/50">
                            <Trash size={15} /> Elimina
                          </button>
                        </form>
                      </div>
                    </>
                  ) : (
                    <form
                      action={async (fd) => {
                        await updateContentAction(fd);
                        toast.success("Modifiche salvate");
                        setEditing(false);
                      }}
                      className="space-y-3"
                    >
                      <input type="hidden" name="id" value={content.id} />
                      <div>
                        <label className="text-xs text-muted-foreground">Titolo</label>
                        <input
                          name="title"
                          defaultValue={content.title}
                          className="mt-1 w-full rounded-[12px] border border-border bg-secondary/70 px-3.5 py-2.5 text-sm outline-none focus:border-ink/30 focus:bg-paper"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Hook</label>
                        <textarea
                          name="hook"
                          defaultValue={content.hook ?? ""}
                          rows={2}
                          className="mt-1 w-full rounded-[12px] border border-border bg-secondary/70 px-3.5 py-2.5 text-sm outline-none focus:border-ink/30 focus:bg-paper"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Pubblicazione</label>
                        <input
                          type="date"
                          name="publishAt"
                          defaultValue={content.publishAtInput ?? ""}
                          className="mt-1 w-full rounded-[12px] border border-border bg-secondary/70 px-3.5 py-2.5 text-sm outline-none focus:border-ink/30 focus:bg-paper"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button className="rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
                          Salva
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(false)}
                          className="rounded-full border border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-secondary"
                        >
                          Annulla
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {tab === "Performance" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="text-xs text-muted-foreground">Engagement rate (by reach)</div>
                    <div className="mt-1 text-2xl font-semibold text-ink">
                      {content.er != null ? `${content.er}%` : "—"}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      calcolato dai dati sotto
                    </div>
                  </div>

                  <form
                    action={async (fd) => {
                      await updatePerformanceAction(fd);
                      toast.success("Performance salvate");
                      router.refresh();
                    }}
                    className="space-y-3"
                  >
                    <input type="hidden" name="id" value={content.id} />
                    <div className="grid grid-cols-2 gap-3">
                      <PerfField name="views" label="Views" value={content.views} />
                      <PerfField name="reach" label="Reach" value={content.reach} />
                      <PerfField
                        name="nonFollowerPct"
                        label="% non-follower"
                        value={content.nonFollowerPct}
                        step="any"
                      />
                      <PerfField name="likes" label="Like" value={content.likes} />
                      <PerfField name="commentsCount" label="Commenti" value={content.commentsCount} />
                      <PerfField name="saves" label="Salvataggi" value={content.saves} />
                      <PerfField name="shares" label="Condivisioni" value={content.shares} />
                      <PerfField
                        name="followsGenerated"
                        label="Follow generati"
                        value={content.followsGenerated}
                      />
                    </div>
                    <button className="rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground active:scale-[0.98]">
                      Salva performance
                    </button>
                  </form>
                </div>
              )}

              {tab === "Materiali" && (
                <div className="space-y-4">
                  {content.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={content.thumbnailUrl}
                      alt=""
                      className="max-h-56 w-full rounded-2xl border border-border object-cover"
                    />
                  )}
                  <form
                    action={async (fd) => {
                      await setThumbnailAction(fd);
                      toast.success("Anteprima aggiornata");
                    }}
                    className="space-y-3"
                  >
                    <input type="hidden" name="contentId" value={content.id} />
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <UploadSimple size={16} />
                      <input
                        type="file"
                        name="file"
                        accept="image/*"
                        className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-paper"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        name="thumbnailUrl"
                        placeholder="…o incolla un URL immagine"
                        className="flex-1 rounded-[12px] border border-border bg-secondary/70 px-3.5 py-2.5 text-sm outline-none focus:border-ink/30 focus:bg-paper"
                      />
                      <button className="rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
                        Salva
                      </button>
                    </div>
                  </form>
                  {content.materialsUrl && (
                    <a href={content.materialsUrl} className="inline-block text-sm text-blush-ink underline">
                      Apri link materiali ↗
                    </a>
                  )}
                </div>
              )}

              {tab === "Commenti" && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    {comments.length === 0 && (
                      <p className="text-sm text-muted-foreground">Ancora nessun commento.</p>
                    )}
                    {comments.map((c) => (
                      <div key={c.id} className="group/cm rounded-2xl border border-border bg-card p-3.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium text-ink">{c.author}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {new Date(c.createdAt).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                            </span>
                            <button
                              aria-label="Elimina commento"
                              onClick={async () => {
                                await deleteCommentAction(c.id, content.id);
                                toast.success("Commento eliminato");
                                router.refresh();
                              }}
                              className="text-muted-foreground opacity-0 transition-opacity hover:text-coral-ink group-hover/cm:opacity-100"
                            >
                              <Trash size={13} />
                            </button>
                          </div>
                        </div>
                        <p className="mt-1 text-sm text-ink/90">{c.body}</p>
                      </div>
                    ))}
                  </div>
                  <form
                    action={async (fd) => {
                      await addCommentAction(fd);
                      toast.success("Commento aggiunto");
                    }}
                    className="flex gap-2"
                  >
                    <input type="hidden" name="contentId" value={content.id} />
                    <input
                      name="body"
                      placeholder="Scrivi un commento…"
                      className="flex-1 rounded-[12px] border border-border bg-secondary/70 px-3.5 py-2.5 text-sm outline-none focus:border-ink/30 focus:bg-paper"
                    />
                    <button
                      aria-label="Invia"
                      className="flex items-center justify-center rounded-full bg-primary px-4 text-primary-foreground"
                    >
                      <PaperPlaneTilt size={16} weight="fill" />
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
