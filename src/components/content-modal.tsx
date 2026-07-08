"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  X,
  InstagramLogo,
  YoutubeLogo,
  TiktokLogo,
  PaperPlaneTilt,
  PencilSimple,
  Trash,
  LinkSimple,
  RocketLaunch,
  UploadSimple,
  CheckCircle,
} from "@phosphor-icons/react";
import {
  addCommentAction,
  updateContentAction,
  deleteContentAction,
  deleteCommentAction,
  markDeliveredAction,
  confirmContentAction,
  publishContentAction,
} from "@/app/(app)/contenuti/actions";
import { uploadViaServer } from "@/lib/blob-upload";
import { workflowState } from "@/lib/workflow";
import { isDerivedStatus, type DerivedStatus } from "@/lib/status";
import { StatusBadge } from "@/components/status-badge";
import { updatePerformanceAction } from "@/app/(app)/kpi/actions";
import { FORMAT_ORDER, FORMAT_LABELS, FORMAT_CHIP } from "@/lib/format";
import { classChip } from "@/lib/classes";
import { galleryMode, sortByOrder } from "@/lib/materials";
import { ClassSelect, type SelectableClass } from "@/components/class-select";
import { VideoReview, type ReviewComment } from "@/components/video-review";
import { MaterialGallery } from "@/components/material-gallery";
import { AudioRecorder } from "@/components/audio-recorder";
import { AudioComment } from "@/components/audio-comment";
import type { ContentFormat } from "@prisma/client";

export type ModalMaterial = { id: string; kind: "image" | "video"; url: string; order: number };

export type ModalClass = { id: string; name: string; color: string | null };

export type ModalContent = {
  id: string;
  title: string;
  channel: "INSTAGRAM" | "YOUTUBE";
  status: string;
  statusOverride: string | null;
  hook: string | null;
  publishAt: string | null;
  publishAtInput: string | null;
  thumbnailUrl: string | null;
  materialsUrl: string | null;
  videoProxyUrl: string | null;
  masterLink: string | null;
  deliveredAt: string | null;
  confirmedAt: string | null;
  hasMontato: boolean;
  // Filone W — pubblicazione (opzionali: valorizzati dal builder della modale).
  publishState?: string | null;
  externalId?: string | null;
  isAdmin?: boolean;
  format: ContentFormat | null;
  classes: ModalClass[];
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
  videoTimestamp: number | null;
  audioUrl: string | null;
};

const TABS = ["Panoramica", "Materiali", "Performance"] as const;
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

const PLATFORMS = [
  { id: "INSTAGRAM", label: "Instagram", Logo: InstagramLogo },
  { id: "YOUTUBE", label: "YouTube", Logo: YoutubeLogo },
  { id: "TIKTOK", label: "TikTok", Logo: TiktokLogo },
] as const;

/**
 * Filone W — pannello di pubblicazione. Visibile solo per contenuto CONFERMATO.
 * Qualità non negoziabile: si pubblica SEMPRE l'originale a piena qualità, MAI il
 * proxy. L'originale è il masterLink (link esterno) oppure un file caricato su
 * Blob qui al momento del publish; il proxy di review non entra mai nel flusso.
 */
function PublishPanel({
  contentId,
  channel,
  masterLink,
  initialState,
  initialExternalId,
}: {
  contentId: string;
  channel: "INSTAGRAM" | "YOUTUBE";
  masterLink: string | null;
  initialState: string | null;
  initialExternalId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([channel]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<string | null>(initialState);
  const [externalId, setExternalId] = useState<string | null>(initialExternalId);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  if (state === "published") {
    return (
      <div className="rounded-2xl border border-sage bg-sage/30 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-sage-ink">
          <CheckCircle size={18} weight="fill" /> Pubblicato su Zernio
        </div>
        {externalId && (
          <p className="mt-1 text-xs text-muted-foreground">
            ID post: <span className="font-mono">{externalId}</span> — KPI per-post
            agganciati automaticamente.
          </p>
        )}
      </div>
    );
  }

  async function onPublish() {
    if (selected.length === 0) {
      toast.error("Seleziona almeno una piattaforma");
      return;
    }
    // Guardrail lato UI: serve l'originale (masterLink o file caricato ora).
    if (!masterLink && !file) {
      toast.error("Carica l'originale a piena qualità o aggiungi il link al master");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("contentId", contentId);
      for (const p of selected) fd.append("platforms", p);
      // Se è stato scelto un file, caricalo su Blob (client→Blob) come originale.
      if (file) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const { url } = await uploadViaServer(file, `originals/${contentId}`, safe);
        fd.set("originalUrl", url);
      }
      const res = await publishContentAction(fd);
      if (!res.ok) {
        setState("failed");
        toast.error(res.error ?? "Pubblicazione fallita");
        return;
      }
      setState("published");
      setExternalId(res.externalId ?? null);
      setOpen(false);
      toast.success("Pubblicato: originale a piena qualità inviato a Zernio");
      router.refresh();
    } catch (e) {
      setState("failed");
      toast.error(e instanceof Error ? e.message : "Errore in pubblicazione");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-secondary/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Pubblicazione</div>
          <p className="mt-0.5 text-sm text-ink">
            {state === "failed"
              ? "Ultimo tentativo fallito — riprova (l'originale è conservato)."
              : "Contenuto confermato: pronto per la pubblicazione."}
          </p>
        </div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
          >
            <RocketLaunch size={15} weight="fill" /> Pubblica
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              Piattaforme
            </div>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map(({ id, label, Logo }) => {
                const on = selected.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggle(id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                      on
                        ? "border-ink bg-ink text-paper"
                        : "border-border bg-paper text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    <Logo size={14} weight="fill" /> {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              Originale a piena qualità
            </div>
            {masterLink ? (
              <p className="text-sm text-ink">
                Uso il master esterno collegato{" "}
                <a
                  href={masterLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blush-ink underline"
                >
                  (link)
                </a>
                .
              </p>
            ) : (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-paper px-3.5 py-2 text-sm text-ink hover:bg-secondary">
                <UploadSimple size={15} />
                {file ? file.name : "Carica l'originale (video/immagine)"}
                <input
                  type="file"
                  accept="video/*,image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>

          <div className="rounded-xl border border-butter bg-butter/40 px-3.5 py-2.5 text-xs text-butter-ink">
            Pubblico <strong>l&rsquo;originale a piena qualità</strong>, mai il proxy
            compresso di review. Verifica che il file sia quello giusto prima di
            confermare.
          </div>

          <div className="flex gap-2">
            <button
              onClick={onPublish}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              <RocketLaunch size={15} weight="fill" />
              {busy ? "Pubblico…" : "Conferma e pubblica"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="rounded-full border border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-60"
            >
              Annulla
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ContentModal({
  content,
  comments,
  materials,
  allClasses,
}: {
  content: ModalContent;
  comments: ModalComment[];
  materials: ModalMaterial[];
  allClasses: SelectableClass[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Panoramica");
  const [editing, setEditing] = useState(false);
  // Optimistic lifecycle state so the modal updates instantly on action
  // (the intercepting-route slot can be slow to refetch on router.refresh()).
  const [delivered, setDelivered] = useState(content.deliveredAt != null);
  const [confirmed, setConfirmed] = useState(content.confirmedAt != null);
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

  // Materiali unificati: la modalità (galleria foto vs reel) si deduce dai materiali.
  const sortedMaterials = sortByOrder(materials);
  const materialsMode = galleryMode(sortedMaterials);
  const videoMaterial = sortedMaterials.find((m) => m.kind === "video") ?? null;
  const imageMaterials = sortedMaterials
    .filter((m) => m.kind === "image")
    .map((m) => ({ id: m.id, url: m.url }));
  const reviewComments = comments.map(
    (c): ReviewComment => ({
      id: c.id,
      body: c.body,
      author: c.author,
      createdAt: c.createdAt,
      videoTimestamp: c.videoTimestamp,
      audioUrl: c.audioUrl,
    })
  );

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
                <StatusBadge
                  contentId={content.id}
                  status={content.status as DerivedStatus}
                  isOverride={isDerivedStatus(content.statusOverride ?? "")}
                />
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
                  {t === "Materiali" && comments.length > 0 && (
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
                      {(() => {
                        const wf = workflowState({
                          deliveredAt: delivered ? new Date() : null,
                          confirmedAt: confirmed ? new Date() : null,
                          hasMontato: content.hasMontato,
                        });
                        const WF_TONE: Record<string, string> = {
                          "Da consegnare": "bg-secondary text-muted-foreground",
                          "Da revisionare": "bg-butter text-butter-ink",
                          "Da confermare": "bg-lavender text-lavender-ink",
                          Confermato: "bg-sage text-sage-ink",
                        };
                        return (
                          <div className="rounded-2xl border border-border bg-secondary/40 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-xs text-muted-foreground">Stato collaborazione</div>
                                <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${WF_TONE[wf]}`}>
                                  {wf}
                                </span>
                              </div>
                              {confirmed && (
                                <span className="text-sm font-medium text-sage-ink">✓ Confermato</span>
                              )}
                              {content.hasMontato && !confirmed && (
                                <form
                                  action={async (fd) => {
                                    setConfirmed(true);
                                    await confirmContentAction(fd);
                                    toast.success("Contenuto confermato");
                                    router.refresh();
                                  }}
                                >
                                  <input type="hidden" name="contentId" value={content.id} />
                                  <button className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]">
                                    Conferma contenuto
                                  </button>
                                </form>
                              )}
                            </div>
                            {!delivered && (
                              <form
                                action={async (fd) => {
                                  setDelivered(true);
                                  await markDeliveredAction(fd);
                                  toast.success("Segnato come consegnato");
                                  router.refresh();
                                }}
                                className="mt-3 flex flex-wrap items-center gap-2"
                              >
                                <input type="hidden" name="contentId" value={content.id} />
                                <input
                                  name="masterLink"
                                  defaultValue={content.masterLink ?? ""}
                                  placeholder="Link Drive/iCloud (opz.)"
                                  className="min-w-0 flex-1 rounded-full border border-border bg-paper px-3.5 py-2 text-sm outline-none focus:border-ink/30"
                                />
                                <button className="rounded-full border border-ink/20 bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-secondary">
                                  Materiale consegnato
                                </button>
                              </form>
                            )}
                            {delivered && !content.hasMontato && (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Materiale consegnato — in attesa del montato di Matteo.
                              </p>
                            )}
                          </div>
                        );
                      })()}
                      {confirmed && (content.isAdmin ?? false) && (
                        <PublishPanel
                          contentId={content.id}
                          channel={content.channel}
                          masterLink={content.masterLink}
                          initialState={content.publishState ?? null}
                          initialExternalId={content.externalId ?? null}
                        />
                      )}
                      {content.hook && (
                        <div>
                          <div className="text-xs text-muted-foreground">Hook</div>
                          <p className="mt-1 text-[15px] text-ink">&ldquo;{content.hook}&rdquo;</p>
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <div className="text-xs text-muted-foreground">Pubblicazione</div>
                          <p className="mt-1 text-sm text-ink">{fmtDate(content.publishAt)}</p>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Tipologia</div>
                          <p className="mt-1 text-sm text-ink">
                            {content.format ? (
                              <span
                                className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${FORMAT_CHIP[content.format]}`}
                              >
                                {FORMAT_LABELS[content.format]}
                              </span>
                            ) : (
                              "—"
                            )}
                          </p>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Blocco</div>
                          <p className="mt-1 text-sm text-ink">{content.block?.label ?? "—"}</p>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Classi</div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {content.classes.length > 0 ? (
                              content.classes.map((cl) => (
                                <span
                                  key={cl.id}
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${classChip(cl.color)}`}
                                >
                                  {cl.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm text-ink">—</span>
                            )}
                          </div>
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
                      <div>
                        <label className="text-xs text-muted-foreground">Tipologia</label>
                        <select
                          name="format"
                          defaultValue={content.format ?? ""}
                          className="mt-1 w-full rounded-[12px] border border-border bg-secondary/70 px-3.5 py-2.5 text-sm outline-none focus:border-ink/30 focus:bg-paper"
                        >
                          <option value="">Nessuna</option>
                          {FORMAT_ORDER.map((f) => (
                            <option key={f} value={f}>
                              {FORMAT_LABELS[f]}
                            </option>
                          ))}
                        </select>
                      </div>
                      {allClasses.length > 0 && (
                        <ClassSelect
                          classes={allClasses}
                          defaultSelected={content.classes.map((c) => c.id)}
                        />
                      )}
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
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
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

              {tab === "Materiali" && materialsMode === "video" && videoMaterial && (
                <VideoReview
                  contentId={content.id}
                  videoUrl={videoMaterial.url}
                  videoMaterialId={videoMaterial.id}
                  masterLink={content.masterLink}
                  comments={reviewComments}
                />
              )}

              {tab === "Materiali" && materialsMode !== "video" && (
                <div className="space-y-6">
                  <MaterialGallery contentId={content.id} images={imageMaterials} />

                  {content.materialsUrl && (
                    <a
                      href={content.materialsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-blush-ink underline"
                    >
                      <LinkSimple size={13} /> Apri link materiali ↗
                    </a>
                  )}

                  <section className="space-y-4 border-t border-border pt-5">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      Commenti{comments.length > 0 ? ` (${comments.length})` : ""}
                    </h3>
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
                          {c.body && (
                            <p className="mt-1 text-sm text-ink/90">{c.body}</p>
                          )}
                          {c.audioUrl && <AudioComment src={c.audioUrl} />}
                        </div>
                      ))}
                    </div>
                    <form
                      action={async (fd) => {
                        const body = String(fd.get("body") ?? "").trim();
                        if (!body) return;
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
                    <div className="flex items-center gap-2 border-t border-border pt-3">
                      <span className="text-xs text-muted-foreground">
                        …oppure invia un vocale:
                      </span>
                      <AudioRecorder contentId={content.id} />
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
