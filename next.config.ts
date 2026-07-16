import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DEV: consenti l'accesso alle risorse dev (HMR, runtime client) dal telefono via
  // IP LAN. Next 16 blocca le richieste cross-origin di default → senza questo, aprendo
  // l'app dal telefono (http://<IP>:3000) l'hydration non parte e i pulsanti sono morti.
  // Solo sviluppo; in prod è ininfluente. Aggiorna l'IP se cambia la rete.
  allowedDevOrigins: ["192.168.168.106"],
  // googleapis / google-auth-library sono pacchetti Node server-only (usano
  // child_process, fs, ecc.): vanno tenuti ESTERNI, non bundlati da Turbopack —
  // altrimenti "Module not found: Can't resolve 'child_process'" (filone G).
  serverExternalPackages: [
    "googleapis",
    "google-auth-library",
    "gaxios",
    "gcp-metadata",
    "gtoken",
    "web-push",
  ],
  // Router Cache lato client: le route dinamiche (Calendario/Contenuti/…) di default
  // hanno TTL 0 → ogni ri-visita rifà il round-trip al server (+ eventuale cold-start
  // Neon). Con `staleTimes.dynamic` la seconda visita entro N secondi è servita dalla
  // cache client → passaggio quasi istantaneo. 25s: abbastanza per il rimbalzo tra
  // sezioni, abbastanza breve da non mostrare dati troppo stantii (le mutazioni sulla
  // route corrente fanno comunque refresh via revalidatePath/router.refresh).
  experimental: {
    staleTimes: {
      dynamic: 25,
    },
  },
};

export default nextConfig;
