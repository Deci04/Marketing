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
  ],
};

export default nextConfig;
