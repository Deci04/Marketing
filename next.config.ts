import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
