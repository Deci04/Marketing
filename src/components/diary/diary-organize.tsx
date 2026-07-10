"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkle, Spinner, DownloadSimple, Star, FilmSlate } from "@phosphor-icons/react";
import { organizeDiaryAction } from "@/app/(app)/diario/actions";
import type { ConvEntry } from "./diary-conversation";

type Scheda = {
  titolo: string;
  contesto: string;
  intento: string;
  cosaDice: string;
  messaggio: string;
  media: { entryId: string; ruolo: "principale" | "contesto" }[];
};

function Brief({ label, value }: { label: string; value: string }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <p className="text-sm text-ink">{value}</p>
    </div>
  );
}

export function DiaryOrganize({ entries }: { entries: ConvEntry[] }) {
  const [busy, setBusy] = useState(false);
  const [schede, setSchede] = useState<Scheda[] | null>(null);
  const byId = new Map(entries.map((e) => [e.id, e]));

  async function run() {
    setBusy(true);
    try {
      const res = await organizeDiaryAction();
      if (!res.ok || !res.schede) {
        toast.error(res.error ?? "Errore");
        return;
      }
      setSchede(res.schede);
      if (res.schede.length === 0) toast("Nessun contenuto da raggruppare");
      else toast.success(`${res.schede.length} contenuti individuati`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-ink">Riorganizza informazioni</div>
          <div className="text-xs text-muted-foreground">
            Raggruppa il materiale in contenuti (principale + B-roll) con brief e download.
          </div>
        </div>
        <button
          onClick={run}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? <Spinner size={15} className="animate-spin" /> : <Sparkle size={15} weight="fill" />}
          {busy ? "Riorganizzo…" : "Riorganizza"}
        </button>
      </div>

      {schede?.map((s, i) => (
        <div key={i} className="rounded-2xl border border-border bg-paper p-3.5">
          <h3 className="font-heading text-lg text-ink">{s.titolo}</h3>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Brief label="Contesto" value={s.contesto} />
            <Brief label="Intento" value={s.intento} />
            <Brief label="Cosa dice" value={s.cosaDice} />
            <Brief label="Messaggio" value={s.messaggio} />
          </div>
          {s.media.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                Risorse da scaricare
              </div>
              <div className="flex flex-wrap gap-2">
                {s.media.map((m) => {
                  const e = byId.get(m.entryId);
                  if (!e?.mediaUrl) return null;
                  const main = m.ruolo === "principale";
                  return (
                    <a
                      key={m.entryId}
                      href={e.mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                        main
                          ? "border-blush bg-blush/40 text-blush-ink"
                          : "border-border bg-secondary text-muted-foreground hover:text-ink"
                      }`}
                      title={main ? "Principale" : "Contesto / B-roll"}
                    >
                      {main ? <Star size={12} weight="fill" /> : <FilmSlate size={12} />}
                      {e.mediaType ?? "file"}
                      <DownloadSimple size={12} />
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
