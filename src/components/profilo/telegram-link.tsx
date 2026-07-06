"use client";

import { TelegramLogo } from "@phosphor-icons/react";
import { generateTelegramLinkCodeAction } from "@/app/(app)/profilo/actions";

export function TelegramLink({
  linked,
  code,
}: {
  linked: boolean;
  code: string | null;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <TelegramLogo size={20} className="text-lavender-ink" />
        <h3 className="text-lg">Telegram</h3>
        {linked && (
          <span className="rounded-full bg-sage px-2.5 py-1 text-[11px] font-medium text-sage-ink">
            Collegato
          </span>
        )}
      </div>
      {linked ? (
        <p className="text-sm text-muted-foreground">
          Il tuo account è collegato: scrivi al bot note, foto e video per il
          diario.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Collega il bot per inviare al diario da Telegram. Genera un codice e
            invialo al bot con{" "}
            <code className="rounded bg-secondary px-1">/start &lt;codice&gt;</code>
            .
          </p>
          <form action={generateTelegramLinkCodeAction}>
            <button className="rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
              {code ? "Rigenera codice" : "Genera codice"}
            </button>
          </form>
          {code && (
            <p className="text-sm">
              Invia al bot:{" "}
              <code className="rounded bg-secondary px-1.5 py-0.5 font-mono">
                /start {code}
              </code>
            </p>
          )}
        </>
      )}
    </div>
  );
}
