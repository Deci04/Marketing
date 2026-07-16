import type { MetadataRoute } from "next";

/**
 * Web App Manifest (PWA) — generato da Next alla route `/manifest.webmanifest`.
 * Rende l'app installabile su desktop (finestra dedicata) e mobile (home screen).
 * NB: `/manifest.webmanifest`, `/sw.js` e le icone sono esclusi dal redirect del
 * proxy (vedi `src/proxy.ts`), altrimenti a sessione scaduta tornerebbero HTML di
 * login rompendo l'update del service worker.
 *
 * Le icone referenziate qui vanno aggiunte in `public/` (generate dal logo brand):
 * `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Luca — Gestione contenuti",
    short_name: "Contenuti",
    description: "Pianificazione, pubblicazione e KPI dei contenuti.",
    // `/home` è la vera dashboard; `/` è solo una landing minima.
    start_url: "/home",
    id: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#f4eee3", // --color-cream (sfondo pagina)
    theme_color: "#fffdf8", // --color-paper
    lang: "it",
    dir: "ltr",
    categories: ["productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
