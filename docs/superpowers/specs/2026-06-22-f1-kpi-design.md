# F1 — KPI: dashboard modificabile, KPI derivati, filtri canale+periodo, box movibili

**Data:** 2026-06-22 · **Filone:** F1 (primo della prima ondata) · **Tipo:** meccanico → subagent + audit finale
**Spec madre:** `2026-06-22-orchestrazione-fasi-design.md` · **Spec prodotto:** `2026-06-18-software-gestione-contenuti-design.md`

## Obiettivo
Trasformare `/kpi` da pagina semi-statica (dati da seed) in una **dashboard viva, modificabile e personalizzabile**:
1. **Tutto il dominio KPI è inseribile/modificabile dalla UI** (niente più dati solo-da-seed).
2. **KPI derivati** calcolati con le formule corrette (ricerca 2026 + set deciso nello spec prodotto).
3. **Filtri globali**: periodo **e canale**.
4. **Dashboard a box movibili** (drag/resize/hide/add/reset), con **layout salvato per utente**.
5. **Box strategici** (audience) non direttamente legati alla performance del brand, utili per la strategia cross-piattaforma.

## Principio guida
**"Tutto modificabile e aggiungibile."** Ogni box mostra un dato che deve avere un percorso UI per essere inserito/corretto. Nessun numero esiste solo nel seed.

---

## 1. Schema needs ⚠️ (di proprietà della torre — applicati su `main` PRIMA del dispatch; il subagent NON tocca le migrazioni)

- **Nuovo `DashboardLayout`** — layout per-utente per-workspace:
  ```
  model DashboardLayout {
    id          String   @id @default(cuid())
    userId      String
    workspaceId String
    layout      Json     // array react-grid-layout + elenco box nascosti
    updatedAt   DateTime @updatedAt
    user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
    workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
    @@unique([userId, workspaceId])
  }
  ```
  (+ back-relation `dashboardLayouts` su `User` e `Workspace`.)
- **Campo `channel`** su `Measurement`, `Benchmark`, `ValueConversation` → `channel Channel?` (null = "Tutti / cross-canale"). Permette il filtro per canale a livello account.
- **Enum `Channel`**: aggiungere `TIKTOK` (forward-compat; non usato altrove finché non arriva F5/F6).
- **Nuovo `AudienceSegment`** — per i box strategici (demografica/attività audience), inserimento manuale ora, auto con F5:
  ```
  model AudienceSegment {
    id          String   @id @default(cuid())
    workspaceId String
    channel     Channel?
    date        DateTime
    dimension   String   // "age" | "gender" | "geo" | "followerType" | "activity" | "returning"
    label       String   // es. "25-34", "F", "Italia", "non-follower", "lun 18-21"
    value       Float    // percentuale o valore
    workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
    @@index([workspaceId])
  }
  ```

## 2. Data entry — tutto CRUD (server actions in `src/lib/kpi.ts` o `src/lib/kpi-actions.ts`)
- **Performance per-contenuto** → rendere **editabile** la tab "Performance" del `content-modal` (oggi sola lettura): form con tutti i campi (`views, reach, nonFollowerPct, likes, commentsCount, saves, shares, followsGenerated`), salva via `updateContent`. Toast su salvataggio.
- **Conversazioni di valore (`ValueConversation`)** → UI per **aggiungere/modificare/eliminare** (chi, cosa, canale, link, data) dal box North Star o da una sezione dedicata.
- **Misurazioni settimanali (`Measurement`)** → UI add/edit (data, metrica, valore, serie Luca|Benchmark, **canale**).
- **Benchmark** → UI add/edit (metrica, valore, range, fonte, canale).
- **AudienceSegment** → UI add/edit per i box strategici.
- Tutto **scoped al workspace** via `scopedWhere` (pattern esistente).

## 3. KPI derivati (formule — fonte: ricerca 2026, vedi spec madre §research)
Calcolati **aggregando le performance dei contenuti** sul periodo+canale selezionati, più le serie `Measurement` per i grafici vs benchmark.
- **Engagement rate (by reach)** = `(like+commenti+saves+shares)/reach` — *già in `content.ts:engagementRate`, riusare.*
- **Save rate** = `saves/reach` · **Share rate** = `shares/reach` · **Reach rate** = `reach/follower`
- **Follower growth rate** (mensile) = `(follower_fine − follower_inizio)/follower_inizio` — da serie `Measurement` metric="followers".
- **Conversion-to-conversation** = `conversazioni di valore / reach` (sul periodo+canale).

## 4. Filtri globali (in cima alla dashboard, valgono per tutti i box)
- **Periodo** (es. 7/30/90gg o range).
- **Canale**: Instagram · YouTube · **Tutti** (TikTok comparirà quando esisterà). Filtra performance per `Content.channel` e serie account per il nuovo `Measurement.channel`.
- I filtri sono stato condiviso (URL searchParams o context) letto da tutti i box.

## 5. Catalogo box (default visibili + aggiungibili dal catalogo)
**KPI di brand**
| Box | Formula/Fonte | Stato |
|-----|----------------|-------|
| ⭐ Conversazioni di valore (North Star) + lista, **add/edit** | ValueConversation | estendere |
| Conversion-to-conversation | conv./reach | nuovo |
| Engagement rate (by reach) | esistente | c'è |
| Save rate | saves/reach | nuovo |
| Share rate | shares/reach | nuovo |
| Reach + % non-follower | esistente | c'è |
| Follower growth rate | serie followers | nuovo |
| Contenuti pubblicati (costanza) | conteggio | c'è |
| Andamento vs benchmark (grafico) | Measurement, multi-metrica | estendere |
| Imbuto (Discovery→Conversazione, 6 stadi) | derivato | arricchire |

**Box strategici (audience — non legati direttamente al brand)**
| Box | Cosa mostra | Dati |
|-----|-------------|------|
| Tipologia di utente | demografica (età/genere/geo/follower vs non) | AudienceSegment |
| Utilizzo medio audience | orari/giorni di attività, new vs returning | AudienceSegment |

## 6. Dashboard a box movibili
- **`react-grid-layout` v2.2.3** (compat React 19; fallback `gridstack` se SSR di Next 16 dà problemi).
- Funzioni: **drag** riposiziona, **resize**, **hide**, **add** dal catalogo, **reset-to-default**.
- **Layout salvato per utente** in `DashboardLayout.layout` (debounced save via server action). Default layout se l'utente non ne ha.
- Componente client (`dashboard-grid.tsx`) che ospita i box; ogni box è un componente isolato che riceve i dati già filtrati.

## 7. Fuori scope F1 (→ F5/Fase 2)
- Auto-ingestione da API (IG Graph / YouTube Analytics) — qui i dati si inseriscono a mano.
- Curva di retention per-contenuto.
- TikTok come canale *con dati* (l'opzione enum c'è, i dati arrivano con F6).

## 8. Criteri di accettazione
- [ ] Posso inserire/modificare le performance di un contenuto dalla UI e i KPI si aggiornano.
- [ ] Posso aggiungere/modificare/eliminare conversazioni di valore, misurazioni, benchmark, segmenti audience.
- [ ] Filtro per periodo **e** canale e tutti i box reagiscono.
- [ ] Posso trascinare, ridimensionare, nascondere e ri-aggiungere i box; il layout persiste per il mio utente dopo reload.
- [ ] Tutti i KPI derivati usano le formule sopra; ER riusa la funzione esistente.
- [ ] `npm run build` + `npm test` puliti; nessuna migrazione creata nel branch del filone.
