# DESIGN.md — Lingua di design (content tool per Luca)

> Documento vivo, definito col brainstorming screenshot-driven (giu 2026). Specifica **ogni elemento** dell'interfaccia. Obiettivo: UI **calda, curata, caratteriale e non-generica** — mai "look da AI di default". Tema **solo chiaro**.

## 1. Principio & vibe
- **Airtable (ordine/professionalità) × Canva (calore/semplicità)**, con un livello **stilizzato accentuato** (riferimenti amati: intelly, KNOWLY, VOXIE — quest'ultima come spinta illustrativa, "via di mezzo").
- Caldo, morbido, premium-ma-amichevole. **Ogni superficie ha carattere**; il colore e le forme **codificano significato** e variano per contesto.
- Antidoti al "look da AI": font con carattere, campi che staccano dalle superfici, **icone Phosphor**, **micro-motion**, **illustrazioni/motivi contestuali** sulle card, regole d'uso esplicite (questo doc).

## 2. Token colore
| Token | Hex | Uso |
|---|---|---|
| `cream` (background) | #F4EEE3 | sfondo pagina |
| `paper` (card) | #FFFDF8 | superfici sollevate |
| `ink` (foreground) | #1A1813 | testo, bottoni primari, sidebar |
| `secondary` | #ECE5D8 | fondo campi, chip neutre |
| `muted-foreground` | #8C8578 | testo secondario |
| `border` | #E6DCCB | bordi hairline |
**Pastelli** (sempre col loro `-ink` per il testo): `lavender` #E7E0F7 / #3F3680 · `butter` #F7E4A0 / #6E5410 · `blush` #F6D3E1 / #7A2E4E · `sage` #DCEBD0 / #3E5E2A · `coral` #F7D7CE / #8A3E22.

**Semantica (assegnata, non casuale):** stato contenuto → Da consegnare `secondary`, Consegnato `butter`, Revisionato `lavender`, Pubblicato `sage`. Canale → Instagram `blush`, YouTube `coral`. Calendario per tipo → Consegna Luca `blush`, Consegna Matteo `lavender`, Pubblicazione `sage`. Stat → pipeline `lavender`, pubblicati `butter`, totale `blush`.

## 3. Tipografia
- **Display/headings: Fraunces** (serif morbido) — `h1` pagina (~30px) e `h2` sezione (~18px) e date grandi/hero.
- **Body/UI: Plus Jakarta Sans.**
- **Titoli delle card: sans, BOLD, scuri/quasi-neri ("decisi/netti")** — non serif, non leggeri. Peso 600.
- Pesi: 400 / 500 per UI, **600 per titoli card e numeri-eroe**. **Sentence case** ovunque. Numeri sempre arrotondati.

## 4. Spazi, raggi, ombre, layout
- Raggi: card `rounded-2xl/3xl`, **campi ~12px** (mai pillola), **bottoni = pillola**.
- Elevazione: card = bordo hairline + ombra micro `0 1px 2px rgba(26,24,19,.04)`; hover card = lift + ombra `0 4px 14px rgba(26,24,19,.07)`. Le superfici importanti (dettaglio, modale) stanno **in sovraimpressione** con ombra più marcata.
- **Principio layout (chiave):** blocchi **ben organizzati che riempiono la pagina**, composizione bilanciata — **mai vuoti dispersivi**. Preferire griglie equilibrate a spazi morti.

## 5. Motion
Sobrio e intenzionale (libreria `motion`): **stagger** al caricamento di liste/card, hover-lift sulle card, `active:scale-[0.98]` sui bottoni, transizioni morbide di disclosure/modale (150–200ms). Isolato in client component; wrappare shadcn, non modificarlo.

## 6. Icone
**Phosphor** (`@phosphor-icons/react`; `/dist/ssr` nei server component). `weight="fill"` per attivo/enfasi, `regular` di default, `bold` per `+`/azioni. 15–20px inline.

---

# ELEMENTI

## 7. Sidebar
- Look **scuro arrotondato** (`bg-ink`, `rounded-3xl`), sticky a tutta altezza.
- **Collassabile:** solo-icone di default (rail stretta), **si espande con le etichette al passaggio del mouse**; transizione morbida. Più spazio alla pagina senza perdere chiarezza.
- Voce **attiva** = pill **lavender** (testo `lavender-ink`), icona `fill`; le altre `muted` con hover tenue.
- In cima: logo/workspace. In fondo: avatar + nome (in espanso) + logout.

## 8. Header / top bar
- `h1` Fraunces a sinistra + sottotitolo `muted`; azioni primarie a destra (pill ink "+ Nuovo", filtri/periodo). Nessun muro di controlli.

## 9. Card — sistema a due livelli
**A. Card-contenuto** (item ripetuto):
- Fondo: pastello tinto **per canale** (o `paper` nelle liste molto lunghe), `rounded-2xl`, ombra micro.
- **Immagine distinta = thumbnail** del reel/video; fallback = **motivo geometrico** pastello d'angolo (cerchi/forme soffuse, stile intelly/KNOWLY).
- Riga chip: **canale** (sx) + **stato** (dx). **Titolo bold scuro** (sans 600). Meta: data + hook/`views` in tono coerente. Hover-lift.

**B. Card-sezione / hero** (es. "vai al Calendario", widget dashboard):
- **Illustrazione/grafica contestuale dedicata dietro**, una per card e **variata per significato** (calendario stilizzato dietro la card calendario, grafico per KPI, archivio per l'archivio…). Livello accentuato (vicino a VOXIE, ma coerente).
- Titolo bold scuro, etichetta categoria, eventuale CTA/toggle.
- **Implica una Home/Dashboard** che raccoglie queste card-sezione.

## 10. Stat / metric card
- **Numero grande (600)** + **delta** di confronto (es. "+8% vs settimana scorsa", verde/rosso) + **sparkline/mini-grafico** di trend. Icona d'angolo, label `muted`.
- Il numero è la porta d'ingresso, **non l'unica cosa**: confronto e andamento sempre presenti.

## 11. Dashboard (cruscotto KPI) — board configurabile
- **Box movibili stile Hootsuite: trascina + ridimensiona + mostra/nascondi.** Layout **salvato per utente**.
- **Default = gerarchia del funnel** (Reach → Risonanza → Interesse → **North Star: conversazioni di valore**).
- Ogni box = stat card (§10) o grafico interattivo (§12).
- *Build:* griglia drag/resize (es. `react-grid-layout`) + persistenza layout.

## 12. Grafici (interattivi, a confronto)
- **Selettori** (periodo: settimana/mese/trimestre; serie) → i dati si aggiornano. **Tooltip** al passaggio.
- **Confronto sempre**: Luca **vs benchmark di mercato**, **vs periodo precedente** (delta), per-contenuto **vs la tua media**. Mai numeri statici isolati.
- Stile flat, colori dai pastelli/ink; linea/area/bar a seconda.

## 13. Calendario (mensile)
- Vista **mensile** mantenuta. Griglia in card `paper`, celle hairline, oggi = pill `ink`.
- **Blocco = banda piena** etichettata ("Blocco · Settimana X") che **attraversa i giorni** che copre.
- Eventi = **card stilizzate**, colore per tipo (Luca `blush` / Matteo `lavender` / Pubblicazione `sage`), **icona canale** invece del testo lungo troncato.
- Empty-state mese: caldo, non vuoto-freddo.
- *Build:* layout eventi multi-giorno (banda) — più del grid attuale.

## 14. Scheda / dettaglio contenuto
- **Modale centrale ampia** (stile GenFM): sfondo sfocato dietro, card **in sovraimpressione**, header (titolo + stato + chiudi).
- **Colonna laterale interna** con le **sezioni** (es. Panoramica · Performance · Materiali · Commenti) — selezionabili, **stilizzate e chiare** (non tab standard).
- **Main** = campi/impostazioni con **selettori belli** (data localizzata, select con chevron, avatar nei select tipo GenFM) + tutte le sezioni-dato (canale, formato, hook, note) e **performance** (metriche + confronto vs media).
- **Commenti = sezione separata** dal resto (thread dedicato).

## 15. Form / campi
- **Label bold scura** sopra il campo. Campo: **fondo `secondary/70`** (deve staccare dalla card), bordo `border`, raggio ~12px, altezza ~44px; focus → `paper` + bordo `ink/30`.
- **Select** = `appearance-none` + **chevron Phosphor**; opzionale tag secondario a destra (es. "Default") e avatar a sinistra (stile GenFM).
- **Data** = controllo **localizzato (IT, gg/mm/aaaa)**, non il nativo US.
- Layout: campi correlati **affiancati** (griglia 2 col, es. Host/Guest), singoli a tutta larghezza. Footer form: controllo secondario a sx + **bottone primario** a dx.

## 16. Bottoni
- **Primario** = pillola `ink` / testo `paper`, icona Phosphor a sx; `active:scale-[0.98]`.
- **Secondario** = pillola/contorno `border` su trasparente, hover `secondary`.
- **Ghost** = solo testo/icona, hover tenue. **Solo-icona** = tondo, `aria-label`.
- **Distruttivo** = tono rosso semantico (testo/bordo), conferma per azioni irreversibili.
- Stati: hover, **active scale 0.98**, disabled opacità ridotta + cursore.

## 17. Chip / badge / pill
- Pill pastello + testo `-ink`, 11–12px, peso 500. Tipi: **stato**, **canale** (con icona Phosphor), **tag/tema**. Neutra = `secondary`/`muted`.

## 18. Avatar
- Cerchio con **iniziali** su fondo pastello (`lavender`/`secondary`), 11–13px. Foto se disponibile.

## 19. Commenti / thread
- Sezione **separata** (nel dettaglio è una sezione a sé). Riga = avatar + bolla (`secondary/60`, angolo smussato lato avatar) con autore (muted) + testo. Input in fondo: campo pillola + bottone invio tondo (`ink`, icona paper-plane).

## 20. Toast / feedback
- **Conferma dopo ogni azione** (crea contenuto/blocco/commento, modifica, elimina). Card `paper` + icona semantica + messaggio breve, in basso/alto-destra, auto-dismiss ~3s. Refresh immediato della lista (no latenza percepita).

## 21. Empty state
- Card tratteggiata o `paper`, **icona in tondo pastello** (o piccola illustrazione), copy amichevole + **azione primaria**. Mai una pagina nuda.

## 22. Loading / skeleton
- Skeleton a blocchi che **ricalcano la forma** del componente (card, riga, grafico), tono `secondary` con shimmer tenue. Niente spinner nudo dove c'è struttura nota.

## 23. Tabelle / liste (Archivio)
- Header riga tinta `secondary`, **colonne ordinabili** (freccia sort), righe con separatore hairline e **hover**, **chip stato**, avatar assegnatario, **azioni riga** (kebab), checkbox selezione. Densità media, leggibile. (Rif. Kravio / Spark Pixel.)

---

## 24. Implicazioni di build (per la fase implementativa)
- Libreria **motion** (`motion`) per stagger/micro-interazioni.
- **Griglia drag/resize** (react-grid-layout o dnd-kit) + persistenza layout dashboard.
- **Modale/dialog** per il dettaglio (sovraimpressione + sfondo sfocato + nav interna).
- **Date picker localizzato** (IT).
- **Illustrazioni/motivi SVG contestuali** per card-sezione/hero (set coerente: calendario, grafico, archivio, telegram…).
- Toast provider. Skeleton per ogni vista. Tabella ordinabile per l'Archivio.

## 25. Log brainstorm (decisioni)
Definito via screenshot-driven (giu 2026): Calendario (banda blocco + card evento), Sidebar (collassabile), Card (2 livelli, illustrazioni dove contano + thumbnail), Dashboard (box drag/resize/hide, funnel default), Grafici (interattivi a confronto), Dettaglio (modale GenFM con nav sezioni + commenti separati), titoli card bold scuri, principio layout "riempire bilanciato". Elementi standard derivati dai riferimenti (GenFM per campi/bottoni, Kravio/Spark Pixel per tabelle).
