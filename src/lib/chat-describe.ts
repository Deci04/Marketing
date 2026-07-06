// Helper PURI per descrivere le tool-call nell'UI della chat.
// Estratto da chat-write-tools.ts (che importa content.ts/calendar.ts → google-calendar
// → googleapis, Node-only): tenendo questi helper qui, i client component
// (chat-panel, diary-chat) NON trascinano più la catena server nel bundle browser.

/** Parse a YYYY-MM-DD (or ISO) date string to a Date, or null. */
export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

/** Descrive in italiano una tool-call proposta, per la card di approvazione. */
export function describeAction(
  toolName: string,
  input: Record<string, unknown>
): string {
  const s = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : undefined);
  const n = (k: string) => (typeof input[k] === "number" ? (input[k] as number) : undefined);
  const d = (k: string) => fmtDate(parseDate(s(k)));

  switch (toolName) {
    case "createBlockTool": {
      const parts = [`Creo il blocco "${s("label") ?? ""}"`];
      if (s("lucaDeliveryDate")) parts.push(`consegna Luca ${d("lucaDeliveryDate")}`);
      if (s("matteoDeliveryDate")) parts.push(`revisione Matteo ${d("matteoDeliveryDate")}`);
      return parts.join(" · ");
    }
    case "createContentTool": {
      const parts = [`Creo il contenuto "${s("title") ?? ""}"`, s("channel") ?? ""];
      if (s("format")) parts.push(String(s("format")));
      if (s("publishDate")) parts.push(`pubblicazione ${d("publishDate")}`);
      return parts.filter(Boolean).join(" · ");
    }
    case "updateContentTool": {
      const changed: string[] = [];
      for (const k of [
        "title",
        "hook",
        "publishDate",
        "format",
        "views",
        "reach",
        "nonFollowerPct",
        "likes",
        "commentsCount",
        "saves",
        "shares",
        "followsGenerated",
      ]) {
        if (input[k] !== undefined) changed.push(k);
      }
      return `Aggiorno il contenuto (${changed.join(", ") || "nessun campo"})`;
    }
    case "deleteContentTool":
      return "Elimino definitivamente il contenuto selezionato (e i suoi commenti)";
    case "scheduleEventTool":
      return `Creo l'evento "${s("title") ?? ""}" il ${d("date")}${
        s("responsible") ? ` · ${s("responsible")}` : ""
      }`;
    case "addValueConversationTool":
      return `Registro una conversazione di valore con ${s("who") ?? ""}: "${
        s("what") ?? ""
      }"`;
    case "addCommentTool":
      return `Aggiungo un commento: "${s("body") ?? ""}"`;
    case "createClassTool":
      return `Creo la classe "${s("name") ?? ""}"${s("color") ? ` (${s("color")})` : ""}`;
    case "assignClassesTool": {
      const ids = Array.isArray(input.classIds) ? (input.classIds as string[]) : [];
      return ids.length
        ? `Assegno ${ids.length} class${ids.length === 1 ? "e" : "i"} al contenuto`
        : "Rimuovo tutte le classi dal contenuto";
    }
    default:
      void n; // keep helper referenced for future numeric summaries
      return "Azione proposta";
  }
}
