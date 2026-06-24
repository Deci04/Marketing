"use client";

/**
 * Upload a file to Vercel Blob **through our server route** (server-side `put`).
 *
 * We deliberately don't use `@vercel/blob/client` `upload()`: its client-upload
 * handshake needs a reachable `onUploadCompleted` callback URL, which fails on
 * `localhost` (the PUT to Blob returns 403). Routing the (already compressed)
 * proxy / short voice note through the server is robust in dev and prod alike.
 */
export async function uploadViaServer(
  file: Blob,
  prefix: string,
  filename: string
): Promise<{ url: string }> {
  const form = new FormData();
  form.set("file", file, filename);
  form.set("prefix", prefix);
  const res = await fetch("/api/video-upload", { method: "POST", body: form });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.error ?? `Upload fallito (${res.status})`);
  }
  return res.json();
}
